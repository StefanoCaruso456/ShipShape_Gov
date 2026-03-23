import { Router, Request, Response } from 'express';
import { pool } from '../db/client.js';
import { z } from 'zod';
import { getVisibilityContext, VISIBILITY_FILTER_SQL } from '../middleware/visibility.js';
import { authMiddleware, getAuthContext } from '../middleware/auth.js';
import {
  transformIssueLinks,
  extractTicketNumbersFromContents,
  batchLookupIssues,
} from '../utils/transformIssueLinks.js';
import { logDocumentChange, getLatestDocumentFieldHistory } from '../utils/document-crud.js';
import { broadcastToUser } from '../collaboration/index.js';
import { extractText } from '../utils/document-content.js';
import {
  hasSprintPlanningSnapshot,
  persistSprintPlanningSnapshot,
  getIssuePlanningMetrics,
  getSprintAnalyticsSnapshots,
  takeSprintPlanningSnapshot,
  upsertSprintAnalyticsSnapshot,
} from '../utils/sprint-planning.js';
import {
  enqueueFleetGraphSprintApprovalEvent,
  enqueueFleetGraphSprintMutationEvent,
  scheduleFleetGraphProactiveEventProcessing,
} from '../services/fleetgraph-proactive-events.js';

type RouterType = ReturnType<typeof Router>;
const router: RouterType = Router();

/**
 * Look up the reports_to user_id for a sprint's owner.
 * The sprint's owner_id is a person document ID; this resolves their supervisor's user_id.
 */
async function getSprintOwnerReportsTo(sprintId: string, workspaceId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT owner_person.properties->>'reports_to' as reports_to
     FROM documents d
     LEFT JOIN documents owner_person
       ON d.properties->>'owner_id' IS NOT NULL
       AND owner_person.id = (d.properties->>'owner_id')::uuid
       AND owner_person.document_type = 'person'
       AND owner_person.workspace_id = $2
     WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'`,
    [sprintId, workspaceId]
  );
  return result.rows[0]?.reports_to || null;
}

/**
 * Parse optional approval comment from request body.
 * `comment` is considered "provided" only when the key exists in the payload.
 */
function parseApprovalComment(body: unknown): { provided: boolean; value: string | null; error?: string } {
  if (!body || typeof body !== 'object') {
    return { provided: false, value: null };
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'comment')) {
    return { provided: false, value: null };
  }

  const raw = (body as Record<string, unknown>).comment;
  if (raw === null || raw === undefined) {
    return { provided: true, value: null };
  }

  if (typeof raw !== 'string') {
    return { provided: true, value: null, error: 'Comment must be a string' };
  }

  if (raw.length > 2000) {
    return { provided: true, value: null, error: 'Comment must be 2000 characters or less' };
  }

  const trimmed = raw.trim();
  return { provided: true, value: trimmed.length > 0 ? trimmed : null };
}

/**
 * Broadcast accountability refresh to the sprint owner (if they have a user account).
 */
async function broadcastAccountabilityUpdateToSprintOwner(
  sprintOwnerId: string | null | undefined,
  targetId: string,
  type: string
): Promise<void> {
  if (!sprintOwnerId) return;

  const ownerUserResult = await pool.query(
    `SELECT properties->>'user_id' as user_id FROM documents WHERE id = $1`,
    [sprintOwnerId]
  );
  const ownerUserId = ownerUserResult.rows[0]?.user_id;
  if (!ownerUserId) return;

  broadcastToUser(ownerUserId, 'accountability:updated', { type, targetId });
}

// GET /api/weeks/lookup-person - Find person document by user_id
router.get('/lookup-person', authMiddleware, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.query.user_id as string;

    if (!userId) {
      res.status(400).json({ error: 'user_id is required' });
      return;
    }

    const result = await pool.query(
      `SELECT id, title FROM documents
       WHERE workspace_id = $1 AND document_type = 'person'
         AND (properties->>'user_id') = $2
       LIMIT 1`,
      [workspaceId, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Person lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/weeks/lookup - Find sprint by project_id + sprint_number
// Returns the sprint document with its approval properties
router.get('/lookup', authMiddleware, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const projectId = req.query.project_id as string;
    const sprintNumber = parseInt(req.query.sprint_number as string, 10);

    if (!projectId || isNaN(sprintNumber)) {
      res.status(400).json({ error: 'project_id and sprint_number are required' });
      return;
    }

    const result = await pool.query(
      `SELECT d.id, d.properties
       FROM documents d
       JOIN document_associations da ON da.document_id = d.id
         AND da.related_id = $2 AND da.relationship_type = 'project'
       WHERE d.workspace_id = $1 AND d.document_type = 'sprint'
         AND (d.properties->>'sprint_number')::int = $3
       LIMIT 1`,
      [workspaceId, projectId, sprintNumber]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Sprint not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Sprint lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validation schemas
// Sprint properties: sprint_number, assignee_ids (array), and plan fields
// API accepts owner_id for backwards compatibility, stored internally as assignee_ids[0]
// Dates and status are computed from sprint_number + workspace.sprint_start_date
// program_id is optional - sprints can be projectless (ad-hoc work)
const createSprintSchema = z.object({
  program_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200).optional().default('Untitled'),
  sprint_number: z.number().int().positive(),
  owner_id: z.string().uuid().optional(),
  // Plan tracking (optional at creation) - what will we learn/validate?
  plan: z.string().max(2000).optional(),
  success_criteria: z.array(z.string().max(500)).max(20).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
});

const updateSprintSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  owner_id: z.string().uuid().optional().nullable(), // Allow clearing owner
  sprint_number: z.number().int().positive().optional(),
  status: z.enum(['planning', 'active', 'completed']).optional(),
});

// Separate schema for plan updates (append mode)
const updatePlanSchema = z.object({
  plan: z.string().max(2000).optional(),
  success_criteria: z.array(z.string().max(500)).max(20).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
});

// Helper to extract sprint from row
// Dates and status are computed on frontend from sprint_number + workspace.sprint_start_date
function extractSprintFromRow(row: any) {
  const props = row.properties || {};
  return {
    id: row.id,
    name: row.title,
    sprint_number: props.sprint_number || 1,
    status: props.status || 'planning',  // Default to 'planning' for sprints without status
    owner: row.owner_id ? {
      id: row.owner_id,
      name: row.owner_name,
      email: row.owner_email,
    } : null,
    program_id: row.program_id,
    program_name: row.program_name,
    program_prefix: row.program_prefix,
    program_accountable_id: row.program_accountable_id || null,
    owner_reports_to: row.owner_reports_to || null,
    workspace_sprint_start_date: row.workspace_sprint_start_date,
    issue_count: parseInt(row.issue_count) || 0,
    completed_count: parseInt(row.completed_count) || 0,
    started_count: parseInt(row.started_count) || 0,
    has_plan: row.has_plan === true || row.has_plan === 't',
    has_retro: row.has_retro === true || row.has_retro === 't',
    // Retro outcome summary (populated if retro exists)
    retro_outcome: row.retro_outcome || null,
    retro_id: row.retro_id || null,
    // Plan tracking fields - what will we learn/validate?
    plan: props.plan || null,
    success_criteria: props.success_criteria || null,
    confidence: typeof props.confidence === 'number' ? props.confidence : null,
    plan_history: props.plan_history || null,
    // Completeness flags
    is_complete: props.is_complete ?? null,
    missing_fields: props.missing_fields ?? [],
    // Plan snapshot (populated when sprint becomes active)
    planned_issue_ids: props.planned_issue_ids || null,
    planned_issue_count: props.planned_issue_count ?? null,
    planned_story_points: props.planned_story_points ?? null,
    planned_estimate_hours: props.planned_estimate_hours ?? null,
    snapshot_taken_at: props.snapshot_taken_at || null,
    // Approval tracking
    plan_approval: props.plan_approval || null,
    review_approval: props.review_approval || null,
    // Performance rating (OPM 5-level scale)
    review_rating: props.review_rating || null,
    // Accountability (sprints inherit from program, but may have direct assignment)
    accountable_id: props.accountable_id || null,
  };
}

// Calculate sprint dates from sprint_number and workspace start date
function calculateSprintDates(sprintNumber: number, workspaceStartDate: Date | string): { startDate: Date; endDate: Date } {
  const sprintDuration = 7; // 7-day sprints

  let baseDate: Date;
  if (workspaceStartDate instanceof Date) {
    baseDate = new Date(Date.UTC(workspaceStartDate.getFullYear(), workspaceStartDate.getMonth(), workspaceStartDate.getDate()));
  } else if (typeof workspaceStartDate === 'string') {
    baseDate = new Date(workspaceStartDate + 'T00:00:00Z');
  } else {
    baseDate = new Date();
  }

  const startDate = new Date(baseDate);
  startDate.setUTCDate(startDate.getUTCDate() + (sprintNumber - 1) * sprintDuration);

  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + sprintDuration - 1);

  return { startDate, endDate };
}

// Check if sprint is active (start_date has passed)
function isSprintActive(sprintNumber: number, workspaceStartDate: Date | string): boolean {
  const { startDate } = calculateSprintDates(sprintNumber, workspaceStartDate);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today >= startDate;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractContentText(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const candidate = node as { type?: string; text?: string; content?: unknown[] };
  if (candidate.type === 'text' && typeof candidate.text === 'string') {
    return candidate.text;
  }

  if (Array.isArray(candidate.content)) {
    return candidate.content.map(extractContentText).join('');
  }

  return '';
}

function hasIssueDescriptionContent(content: unknown): boolean {
  return extractContentText(content).trim().length > 0;
}

function hasIssueAcceptanceCriteriaContent(content: unknown): boolean {
  return extractContentText(content).toLowerCase().includes('acceptance criteria');
}

function enumerateDates(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    dates.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

interface VelocityHistoryPoint {
  sprintNumber: number;
  sprintName: string;
  committedStoryPoints: number;
  completedStoryPoints: number;
  currentStoryPoints: number;
  committedEstimateHours: number;
  completedEstimateHours: number;
  currentEstimateHours: number;
  issueCount: number;
  completedIssueCount: number;
}

type VelocityHistoryScope = 'program' | 'project';

interface VelocityHistoryQueryOptions {
  scope: VelocityHistoryScope;
  startWeek: number | null;
  endWeek: number | null;
  historyWindow?: number;
}

interface VelocityHistoryMetaExcludedWeek {
  sprintNumber: number;
  issueCount: number;
  missingStoryPoints: number;
  missingEstimateHours: number;
  missingIssueType: number;
  missingDescription: number;
  missingAcceptanceCriteria: number;
}

interface VelocityHistoryMeta {
  requestedScope: VelocityHistoryScope;
  scope: VelocityHistoryScope;
  scopeLabel: string | null;
  programLabel: string | null;
  projectLabel: string | null;
  hasProjectScope: boolean;
  isCustomRange: boolean;
  selectedRangeStartWeek: number | null;
  selectedRangeEndWeek: number | null;
  availableWeekNumbers: number[];
  recommendedWindow: number;
  completedWeekCount: number;
  qualifyingWeekCount: number;
  includedWeekCount: number;
  backfilledWeekCount: number;
  excludedWeeks: VelocityHistoryMetaExcludedWeek[];
}

interface VelocityHistoryResult {
  history: VelocityHistoryPoint[];
  meta: VelocityHistoryMeta;
}

async function getVelocityHistory(
  sprintId: string,
  sprintNumber: number,
  workspaceId: string,
  userId: string,
  isAdmin: boolean,
  workspaceSprintStartDate: Date | string,
  options: VelocityHistoryQueryOptions
): Promise<VelocityHistoryResult> {
  const historyWindow = options.historyWindow ?? 6;
  const contextResult = await pool.query<{
    program_id: string | null;
    program_name: string | null;
    project_id: string | null;
    project_name: string | null;
  }>(
    `SELECT
       MAX(CASE WHEN da.relationship_type = 'program' THEN da.related_id::text END)::uuid AS program_id,
       MAX(CASE WHEN da.relationship_type = 'program' THEN related.title END) AS program_name,
       MAX(CASE WHEN da.relationship_type = 'project' THEN da.related_id::text END)::uuid AS project_id,
       MAX(CASE WHEN da.relationship_type = 'project' THEN related.title END) AS project_name
     FROM document_associations da
     JOIN documents related ON related.id = da.related_id
     WHERE da.document_id = $1
       AND da.relationship_type IN ('program', 'project')`,
    [sprintId]
  );

  const context = contextResult.rows[0] ?? {
    program_id: null,
    program_name: null,
    project_id: null,
    project_name: null,
  };
  const hasProjectScope = Boolean(context.project_id);
  const scope: VelocityHistoryScope =
    options.scope === 'project' && context.project_id ? 'project' : 'program';
  const scopeId = scope === 'project' ? context.project_id : context.program_id;
  const maxHistoricalWeek = Math.max(sprintNumber - 1, 0);
  const requestedStart = options.startWeek;
  const requestedEnd = options.endWeek;
  const selectedRangeStartWeek =
    requestedStart !== null && requestedEnd !== null
      ? Math.max(1, Math.min(requestedStart, requestedEnd))
      : null;
  const selectedRangeEndWeek =
    requestedStart !== null && requestedEnd !== null
      ? Math.min(maxHistoricalWeek, Math.max(requestedStart, requestedEnd))
      : null;
  const isCustomRange =
    selectedRangeStartWeek !== null &&
    selectedRangeEndWeek !== null &&
    selectedRangeStartWeek <= selectedRangeEndWeek;

  const emptyMeta: VelocityHistoryMeta = {
    requestedScope: options.scope,
    scope,
    scopeLabel: scope === 'project' ? context.project_name : context.program_name,
    programLabel: context.program_name,
    projectLabel: context.project_name,
    hasProjectScope,
    isCustomRange,
    selectedRangeStartWeek: isCustomRange ? selectedRangeStartWeek : null,
    selectedRangeEndWeek: isCustomRange ? selectedRangeEndWeek : null,
    availableWeekNumbers: [],
    recommendedWindow: historyWindow,
    completedWeekCount: 0,
    qualifyingWeekCount: 0,
    includedWeekCount: 0,
    backfilledWeekCount: 0,
    excludedWeeks: [],
  };

  if (!scopeId) {
    return { history: [], meta: emptyMeta };
  }

  const sprintParams: Array<string | boolean | number> = [scopeId, workspaceId, userId, isAdmin, sprintNumber];
  let rangeSql = '';
  if (isCustomRange) {
    sprintParams.push(selectedRangeStartWeek!, selectedRangeEndWeek!);
    rangeSql = ` AND (d.properties->>'sprint_number')::int BETWEEN $6 AND $7`;
  }

  const sprintResult = await pool.query<{
    id: string;
    title: string;
    sprint_number: number;
    properties: Record<string, unknown> | null;
  }>(
    `SELECT d.id,
            d.title,
            (d.properties->>'sprint_number')::int AS sprint_number,
            d.properties
     FROM documents d
     JOIN document_associations da
       ON da.document_id = d.id
      AND da.related_id = $1
      AND da.relationship_type = '${scope}'
     WHERE d.workspace_id = $2
       AND d.document_type = 'sprint'
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}
       AND COALESCE(d.properties->>'status', 'planning') = 'completed'
       AND (d.properties->>'sprint_number')::int < $5
       ${rangeSql}
     ORDER BY (d.properties->>'sprint_number')::int DESC`,
    sprintParams
  );

  if (sprintResult.rows.length === 0) {
    return { history: [], meta: emptyMeta };
  }

  const backfilledSprintIds = new Set<string>();
  for (const sprintRow of sprintResult.rows) {
    const sprintProperties = (sprintRow.properties ?? {}) as Record<string, unknown>;
    if (hasSprintPlanningSnapshot(sprintProperties)) {
      continue;
    }

    const { startDate } = calculateSprintDates(sprintRow.sprint_number, workspaceSprintStartDate);
    const persisted = await persistSprintPlanningSnapshot(pool, sprintRow.id, sprintProperties, {
      source: 'backfilled_from_current_scope',
      snapshotTakenAt: startDate,
    });
    sprintRow.properties = persisted.properties;
    backfilledSprintIds.add(sprintRow.id);
  }

  const sprintIds = sprintResult.rows.map((row) => row.id);
  const issueResult = await pool.query<{
    sprint_id: string;
    properties: Record<string, unknown> | null;
    content: Record<string, unknown> | null;
  }>(
    `SELECT da.related_id AS sprint_id, d.properties, d.content
     FROM documents d
     JOIN document_associations da
       ON da.document_id = d.id
      AND da.related_id = ANY($1)
      AND da.relationship_type = 'sprint'
     WHERE d.workspace_id = $2
       AND d.document_type = 'issue'
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
    [sprintIds, workspaceId, userId, isAdmin]
  );

  const metricsBySprint = new Map<
    string,
    {
      currentStoryPoints: number;
      completedStoryPoints: number;
      currentEstimateHours: number;
      completedEstimateHours: number;
      issueCount: number;
      completedIssueCount: number;
      missingStoryPoints: number;
      missingEstimateHours: number;
      missingIssueType: number;
      missingDescription: number;
      missingAcceptanceCriteria: number;
    }
  >();

  for (const issueRow of issueResult.rows) {
    const metrics = getIssuePlanningMetrics(issueRow.properties ?? {});
    const state = (issueRow.properties?.state as string | undefined) ?? 'backlog';
    const issueType = issueRow.properties?.issue_type;
    const bucket = metricsBySprint.get(issueRow.sprint_id) ?? {
      currentStoryPoints: 0,
      completedStoryPoints: 0,
      currentEstimateHours: 0,
      completedEstimateHours: 0,
      issueCount: 0,
      completedIssueCount: 0,
      missingStoryPoints: 0,
      missingEstimateHours: 0,
      missingIssueType: 0,
      missingDescription: 0,
      missingAcceptanceCriteria: 0,
    };

    bucket.currentStoryPoints += metrics.storyPoints;
    bucket.currentEstimateHours += metrics.estimateHours;
    bucket.issueCount += 1;

    if (metrics.storyPoints <= 0) {
      bucket.missingStoryPoints += 1;
    }

    if (metrics.estimateHours <= 0) {
      bucket.missingEstimateHours += 1;
    }

    if (typeof issueType !== 'string' || issueType.trim().length === 0) {
      bucket.missingIssueType += 1;
    }

    if (!hasIssueDescriptionContent(issueRow.content)) {
      bucket.missingDescription += 1;
    }

    if (!hasIssueAcceptanceCriteriaContent(issueRow.content)) {
      bucket.missingAcceptanceCriteria += 1;
    }

    if (state === 'done') {
      bucket.completedStoryPoints += metrics.storyPoints;
      bucket.completedEstimateHours += metrics.estimateHours;
      bucket.completedIssueCount += 1;
    }

    metricsBySprint.set(issueRow.sprint_id, bucket);
  }

  const historyBySprintNumber = new Map<
    number,
    VelocityHistoryPoint & {
      missingStoryPoints: number;
      missingEstimateHours: number;
      missingIssueType: number;
      missingDescription: number;
      missingAcceptanceCriteria: number;
      hasBackfilledBaseline: boolean;
    }
  >();

  for (const sprintRow of sprintResult.rows) {
    const props = (sprintRow.properties ?? {}) as Record<string, unknown>;
    const liveMetrics = metricsBySprint.get(sprintRow.id) ?? {
      currentStoryPoints: 0,
      completedStoryPoints: 0,
      currentEstimateHours: 0,
      completedEstimateHours: 0,
      issueCount: 0,
      completedIssueCount: 0,
      missingStoryPoints: 0,
      missingEstimateHours: 0,
      missingIssueType: 0,
      missingDescription: 0,
      missingAcceptanceCriteria: 0,
    };
    const committedStoryPoints = Number(props.planned_story_points ?? liveMetrics.currentStoryPoints);
    const committedEstimateHours = Number(
      props.planned_estimate_hours ?? props.planned_estimate ?? liveMetrics.currentEstimateHours
    );
    const currentEntry = historyBySprintNumber.get(sprintRow.sprint_number) ?? {
      sprintNumber: sprintRow.sprint_number,
      sprintName: `Week ${sprintRow.sprint_number}`,
      committedStoryPoints: 0,
      completedStoryPoints: 0,
      currentStoryPoints: 0,
      committedEstimateHours: 0,
      completedEstimateHours: 0,
      currentEstimateHours: 0,
      issueCount: 0,
      completedIssueCount: 0,
      missingStoryPoints: 0,
      missingEstimateHours: 0,
      missingIssueType: 0,
      missingDescription: 0,
      missingAcceptanceCriteria: 0,
      hasBackfilledBaseline: false,
    };

    currentEntry.committedStoryPoints += committedStoryPoints;
    currentEntry.completedStoryPoints += liveMetrics.completedStoryPoints;
    currentEntry.currentStoryPoints += liveMetrics.currentStoryPoints;
    currentEntry.committedEstimateHours += committedEstimateHours;
    currentEntry.completedEstimateHours += liveMetrics.completedEstimateHours;
    currentEntry.currentEstimateHours += liveMetrics.currentEstimateHours;
    currentEntry.issueCount += liveMetrics.issueCount;
    currentEntry.completedIssueCount += liveMetrics.completedIssueCount;
    currentEntry.missingStoryPoints += liveMetrics.missingStoryPoints;
    currentEntry.missingEstimateHours += liveMetrics.missingEstimateHours;
    currentEntry.missingIssueType += liveMetrics.missingIssueType;
    currentEntry.missingDescription += liveMetrics.missingDescription;
    currentEntry.missingAcceptanceCriteria += liveMetrics.missingAcceptanceCriteria;
    currentEntry.hasBackfilledBaseline ||= backfilledSprintIds.has(sprintRow.id);
    historyBySprintNumber.set(sprintRow.sprint_number, currentEntry);
  }

  const aggregatedWeeks = Array.from(historyBySprintNumber.values()).sort(
    (left, right) => right.sprintNumber - left.sprintNumber
  );
  const qualifyingWeeks = aggregatedWeeks.filter(
    (week) =>
      week.issueCount > 0 &&
      week.missingStoryPoints === 0 &&
      week.missingEstimateHours === 0 &&
      week.missingIssueType === 0 &&
      week.missingDescription === 0 &&
      week.missingAcceptanceCriteria === 0
  );
  const selectedHistory = (
    isCustomRange ? qualifyingWeeks : qualifyingWeeks.slice(0, historyWindow)
  ).reverse();

  return {
    history: selectedHistory.map((week) => ({
      sprintNumber: week.sprintNumber,
      sprintName: week.sprintName,
      committedStoryPoints: week.committedStoryPoints,
      completedStoryPoints: week.completedStoryPoints,
      currentStoryPoints: week.currentStoryPoints,
      committedEstimateHours: week.committedEstimateHours,
      completedEstimateHours: week.completedEstimateHours,
      currentEstimateHours: week.currentEstimateHours,
      issueCount: week.issueCount,
      completedIssueCount: week.completedIssueCount,
    })),
    meta: {
      requestedScope: options.scope,
      scope,
      scopeLabel: scope === 'project' ? context.project_name : context.program_name,
      programLabel: context.program_name,
      projectLabel: context.project_name,
      hasProjectScope,
      isCustomRange,
      selectedRangeStartWeek: isCustomRange ? selectedRangeStartWeek : null,
      selectedRangeEndWeek: isCustomRange ? selectedRangeEndWeek : null,
      availableWeekNumbers: aggregatedWeeks
        .map((week) => week.sprintNumber)
        .sort((left, right) => left - right),
      recommendedWindow: historyWindow,
      completedWeekCount: aggregatedWeeks.length,
      qualifyingWeekCount: qualifyingWeeks.length,
      includedWeekCount: selectedHistory.length,
      backfilledWeekCount: selectedHistory.filter((week) => week.hasBackfilledBaseline).length,
      excludedWeeks: aggregatedWeeks
        .filter((week) => !qualifyingWeeks.includes(week))
        .slice(0, 12)
        .map((week) => ({
          sprintNumber: week.sprintNumber,
          issueCount: week.issueCount,
          missingStoryPoints: week.missingStoryPoints,
          missingEstimateHours: week.missingEstimateHours,
          missingIssueType: week.missingIssueType,
          missingDescription: week.missingDescription,
          missingAcceptanceCriteria: week.missingAcceptanceCriteria,
        })),
    },
  };
}

async function getSprintScopeChangePayload(
  sprintId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
) {
  const sprintResult = await pool.query(
    `SELECT d.id, d.properties,
            d.properties->>'sprint_number' as sprint_number,
            w.sprint_start_date as workspace_sprint_start_date
     FROM documents d
     JOIN workspaces w ON d.workspace_id = w.id
     WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
       AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
    [sprintId, workspaceId, userId, isAdmin]
  );

  if (sprintResult.rows.length === 0) {
    return null;
  }

  const sprintRow = sprintResult.rows[0];
  const sprintProps = (sprintRow.properties ?? {}) as Record<string, unknown>;
  const sprintNumber = parseInt(sprintRow.sprint_number, 10);
  const { startDate } = calculateSprintDates(sprintNumber, sprintRow.workspace_sprint_start_date);
  const baselineTimestamp = sprintProps.snapshot_taken_at
    ? new Date(String(sprintProps.snapshot_taken_at))
    : startDate;

  const issuesResult = await pool.query(
    `SELECT d.id, d.properties
     FROM documents d
     JOIN document_associations da
       ON da.document_id = d.id
      AND da.related_id = $1
      AND da.relationship_type = 'sprint'
     WHERE d.document_type = 'issue'
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL`,
    [sprintId]
  );

  const currentMetricsByIssueId = new Map<string, { storyPoints: number; estimateHours: number }>();
  let currentStoryPoints = 0;
  let currentEstimateHours = 0;

  for (const row of issuesResult.rows) {
    const metrics = getIssuePlanningMetrics(row.properties as Record<string, unknown> | undefined);
    currentMetricsByIssueId.set(row.id as string, metrics);
    currentStoryPoints += metrics.storyPoints;
    currentEstimateHours += metrics.estimateHours;
  }

  const additionHistory = await pool.query(
    `SELECT document_id, created_at
     FROM document_history
     WHERE field = 'sprint_id'
       AND new_value = $1
       AND created_at > $2
     ORDER BY created_at ASC`,
    [sprintId, baselineTimestamp.toISOString()]
  );

  const removalHistory = await pool.query(
    `SELECT document_id, created_at
     FROM document_history
     WHERE field = 'sprint_id'
       AND old_value = $1
       AND created_at > $2
     ORDER BY created_at ASC`,
    [sprintId, baselineTimestamp.toISOString()]
  );

  const removedIssueIds = [...new Set(removalHistory.rows.map((row) => row.document_id as string))];
  const missingRemovedIds = removedIssueIds.filter((issueId) => !currentMetricsByIssueId.has(issueId));
  if (missingRemovedIds.length > 0) {
    const removedIssuesResult = await pool.query(
      `SELECT id, properties
       FROM documents
       WHERE id = ANY($1)`,
      [missingRemovedIds]
    );

    for (const row of removedIssuesResult.rows) {
      currentMetricsByIssueId.set(
        row.id as string,
        getIssuePlanningMetrics(row.properties as Record<string, unknown> | undefined)
      );
    }
  }

  const originalStoryPoints = Number(sprintProps.planned_story_points ?? 0);
  const originalEstimateHours = Number(
    sprintProps.planned_estimate_hours ?? sprintProps.planned_estimate ?? 0
  );

  const scopeChanges: Array<{
    timestamp: string;
    scopeAfter: number;
    scopeAfterStoryPoints: number;
    changeType: 'added' | 'removed';
    estimateChange: number;
    storyPointsChange: number;
  }> = [];

  let runningEstimateHours = originalEstimateHours;
  let runningStoryPoints = originalStoryPoints;

  const additionEntries = additionHistory.rows.map((row) => {
    const metrics = currentMetricsByIssueId.get(row.document_id as string) ?? { storyPoints: 0, estimateHours: 0 };
    return {
      timestamp: new Date(row.created_at).toISOString(),
      changeType: 'added' as const,
      estimateChange: metrics.estimateHours,
      storyPointsChange: metrics.storyPoints,
    };
  });

  const removalEntries = removalHistory.rows.map((row) => {
    const metrics = currentMetricsByIssueId.get(row.document_id as string) ?? { storyPoints: 0, estimateHours: 0 };
    return {
      timestamp: new Date(row.created_at).toISOString(),
      changeType: 'removed' as const,
      estimateChange: -metrics.estimateHours,
      storyPointsChange: -metrics.storyPoints,
    };
  });

  for (const change of [...additionEntries, ...removalEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    runningEstimateHours += change.estimateChange;
    runningStoryPoints += change.storyPointsChange;
    scopeChanges.push({
      timestamp: change.timestamp,
      scopeAfter: runningEstimateHours,
      scopeAfterStoryPoints: runningStoryPoints,
      changeType: change.changeType,
      estimateChange: change.estimateChange,
      storyPointsChange: change.storyPointsChange,
    });
  }

  const scopeChangePercent = originalEstimateHours > 0
    ? Math.round(((currentEstimateHours - originalEstimateHours) / originalEstimateHours) * 100)
    : 0;

  return {
    originalScope: originalEstimateHours,
    currentScope: currentEstimateHours,
    scopeChangePercent,
    sprintStartDate: startDate.toISOString(),
    scopeChanges,
    planning: {
      originalStoryPoints,
      currentStoryPoints,
      storyPointsChangePercent: originalStoryPoints > 0
        ? Math.round(((currentStoryPoints - originalStoryPoints) / originalStoryPoints) * 100)
        : 0,
      originalEstimateHours,
      currentEstimateHours,
    },
  };
}

// Get all active sprints across the workspace
// Active = sprint_number matches the current 7-day window based on workspace.sprint_start_date
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // First, get the workspace sprint_start_date to calculate current sprint number
    const workspaceResult = await pool.query(
      `SELECT sprint_start_date FROM workspaces WHERE id = $1`,
      [workspaceId]
    );

    if (workspaceResult.rows.length === 0) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const rawStartDate = workspaceResult.rows[0].sprint_start_date;
    const sprintDuration = 7; // 7-day sprints

    // Calculate the current sprint number
    let workspaceStartDate: Date;
    if (rawStartDate instanceof Date) {
      workspaceStartDate = new Date(Date.UTC(rawStartDate.getFullYear(), rawStartDate.getMonth(), rawStartDate.getDate()));
    } else if (typeof rawStartDate === 'string') {
      workspaceStartDate = new Date(rawStartDate + 'T00:00:00Z');
    } else {
      workspaceStartDate = new Date();
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const daysSinceStart = Math.floor((today.getTime() - workspaceStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const currentSprintNumber = Math.floor(daysSinceStart / sprintDuration) + 1;

    // Calculate days remaining in current sprint
    const currentSprintStart = new Date(workspaceStartDate);
    currentSprintStart.setUTCDate(currentSprintStart.getUTCDate() + (currentSprintNumber - 1) * sprintDuration);
    const currentSprintEnd = new Date(currentSprintStart);
    currentSprintEnd.setUTCDate(currentSprintEnd.getUTCDate() + sprintDuration - 1);
    const daysRemaining = Math.max(0, Math.ceil((currentSprintEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    // Get all sprints that match the current sprint number - join via document_associations
    const result = await pool.query(
      `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id,
              p.title as program_name, p.properties->>'prefix' as program_prefix,
              p.properties->>'accountable_id' as program_accountable_id,
              (SELECT op.properties->>'reports_to' FROM documents op WHERE d.properties->>'owner_id' IS NOT NULL AND op.id = (d.properties->>'owner_id')::uuid AND op.document_type = 'person' AND op.workspace_id = d.workspace_id) as owner_reports_to,
              $5::timestamp as workspace_sprint_start_date,
              u.id as owner_id, u.name as owner_name, u.email as owner_email,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue') as issue_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' = 'done') as completed_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' IN ('in_progress', 'in_review')) as started_count,
              (SELECT COUNT(*) > 0 FROM documents pl WHERE pl.parent_id = d.id AND pl.document_type = 'weekly_plan') as has_plan,
              (SELECT COUNT(*) > 0 FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL) as has_retro,
              (SELECT rt.properties->>'outcome' FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_outcome,
              (SELECT rt.id FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents p ON prog_da.related_id = p.id
       LEFT JOIN users u ON (d.properties->'assignee_ids'->>0)::uuid = u.id
       WHERE d.workspace_id = $1 AND d.document_type = 'sprint'
         AND (d.properties->>'sprint_number')::int = $2
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}
       ORDER BY (d.properties->>'sprint_number')::int, p.title`,
      [workspaceId, currentSprintNumber, userId, isAdmin, rawStartDate]
    );

    const sprints = result.rows.map(row => ({
      ...extractSprintFromRow(row),
      days_remaining: daysRemaining,
      status: 'active' as const,
    }));

    res.json({
      weeks: sprints,
      current_sprint_number: currentSprintNumber,
      days_remaining: daysRemaining,
      sprint_start_date: currentSprintStart.toISOString().split('T')[0],
      sprint_end_date: currentSprintEnd.toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('Get active sprints error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get action items for current user (sprints needing docs)
// Returns sprints owned by the user that need plan or retro
router.get('/my-action-items', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Get workspace sprint configuration
    const workspaceResult = await pool.query(
      `SELECT sprint_start_date FROM workspaces WHERE id = $1`,
      [workspaceId]
    );

    if (workspaceResult.rows.length === 0) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const rawStartDate = workspaceResult.rows[0].sprint_start_date;
    const sprintDuration = 7; // 7-day sprints

    // Calculate the current sprint number
    let workspaceStartDate: Date;
    if (rawStartDate instanceof Date) {
      workspaceStartDate = new Date(Date.UTC(rawStartDate.getFullYear(), rawStartDate.getMonth(), rawStartDate.getDate()));
    } else if (typeof rawStartDate === 'string') {
      workspaceStartDate = new Date(rawStartDate + 'T00:00:00Z');
    } else {
      workspaceStartDate = new Date();
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const daysSinceStart = Math.floor((today.getTime() - workspaceStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const currentSprintNumber = Math.floor(daysSinceStart / sprintDuration) + 1;

    // Get sprints owned by this user that need either plan or retro - join via document_associations
    // Include current sprint (for plans) and previous sprint (for retros)
    // Plans/retros are matched by week_number property and created_by user
    const result = await pool.query(
      `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id,
              p.title as program_name,
              (d.properties->>'sprint_number')::int as sprint_number,
              (SELECT COUNT(*) > 0 FROM documents pl
               WHERE pl.workspace_id = d.workspace_id
                 AND pl.document_type = 'weekly_plan'
                 AND (pl.properties->>'week_number')::int = (d.properties->>'sprint_number')::int
                 AND pl.created_by = $2) as has_plan,
              (SELECT COUNT(*) > 0 FROM documents rt
               WHERE rt.workspace_id = d.workspace_id
                 AND rt.document_type = 'weekly_retro'
                 AND (rt.properties->>'week_number')::int = (d.properties->>'sprint_number')::int
                 AND rt.created_by = $2) as has_retro
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents p ON prog_da.related_id = p.id
       WHERE d.workspace_id = $1
         AND d.document_type = 'sprint'
         AND (d.properties->>'owner_id')::uuid = $2
         AND (d.properties->>'sprint_number')::int >= $3 - 1
         AND (d.properties->>'sprint_number')::int <= $3
       ORDER BY (d.properties->>'sprint_number')::int DESC`,
      [workspaceId, userId, currentSprintNumber]
    );

    interface ActionItem {
      id: string;
      type: 'plan' | 'retro';
      sprint_id: string;
      sprint_title: string;
      program_id: string;
      program_name: string;
      sprint_number: number;
      urgency: 'overdue' | 'due_today' | 'due_soon' | 'upcoming';
      days_until_due: number;
      message: string;
    }

    const actionItems: ActionItem[] = [];

    for (const row of result.rows) {
      const sprintNumber = parseInt(row.sprint_number, 10);
      const hasPlan = row.has_plan === true || row.has_plan === 't';
      const hasRetro = row.has_retro === true || row.has_retro === 't';

      // Calculate sprint dates
      const sprintStart = new Date(workspaceStartDate);
      sprintStart.setUTCDate(sprintStart.getUTCDate() + (sprintNumber - 1) * sprintDuration);
      const sprintEnd = new Date(sprintStart);
      sprintEnd.setUTCDate(sprintEnd.getUTCDate() + sprintDuration - 1);

      // Days into current sprint (for plan urgency)
      const daysIntoSprint = Math.floor((today.getTime() - sprintStart.getTime()) / (1000 * 60 * 60 * 24));
      // Days since sprint ended (for retro urgency)
      const daysSinceEnd = Math.floor((today.getTime() - sprintEnd.getTime()) / (1000 * 60 * 60 * 24));

      // Check for missing sprint plan (active sprint only)
      if (sprintNumber === currentSprintNumber && !hasPlan) {
        let urgency: ActionItem['urgency'] = 'upcoming';
        let message = 'Write weekly plan';

        if (daysIntoSprint >= 3) {
          urgency = 'overdue';
          message = `Weekly plan is ${daysIntoSprint - 2} days overdue`;
        } else if (daysIntoSprint >= 2) {
          urgency = 'due_today';
          message = 'Weekly plan due today';
        } else if (daysIntoSprint >= 1) {
          urgency = 'due_soon';
          message = 'Weekly plan due tomorrow';
        }

        actionItems.push({
          id: `plan-${row.id}`,
          type: 'plan',
          sprint_id: row.id,
          sprint_title: row.title || `Week ${sprintNumber}`,
          program_id: row.program_id,
          program_name: row.program_name,
          sprint_number: sprintNumber,
          urgency,
          days_until_due: Math.max(0, 2 - daysIntoSprint),
          message,
        });
      }

      // Check for missing retro (past sprints only)
      if (sprintNumber < currentSprintNumber && !hasRetro) {
        let urgency: ActionItem['urgency'] = 'upcoming';
        let message = 'Write sprint retro';

        if (daysSinceEnd > 3) {
          urgency = 'overdue';
          message = `Weekly retro is ${daysSinceEnd - 3} days overdue`;
        } else if (daysSinceEnd === 3) {
          urgency = 'due_today';
          message = 'Weekly retro due today';
        } else if (daysSinceEnd >= 1) {
          urgency = 'due_soon';
          message = `Weekly retro due in ${3 - daysSinceEnd} days`;
        }

        actionItems.push({
          id: `retro-${row.id}`,
          type: 'retro',
          sprint_id: row.id,
          sprint_title: row.title || `Week ${sprintNumber}`,
          program_id: row.program_id,
          program_name: row.program_name,
          sprint_number: sprintNumber,
          urgency,
          days_until_due: Math.max(0, 3 - daysSinceEnd),
          message,
        });
      }
    }

    // Sort by urgency (overdue first, then due_today, due_soon, upcoming)
    const urgencyOrder = { overdue: 0, due_today: 1, due_soon: 2, upcoming: 3 };
    actionItems.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    res.json({ action_items: actionItems });
  } catch (err) {
    console.error('Get my action items error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get "My Week" view - aggregates issues from all active sprints
// Virtual aggregation: no 'week' document created, purely computed
// Supports historical week viewing via sprint_number query param
router.get('/my-week', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;
    const { state, assignee, show_mine, sprint_number: requestedSprintNumber } = req.query;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Get workspace sprint_start_date to calculate current sprint number
    const workspaceResult = await pool.query(
      `SELECT sprint_start_date FROM workspaces WHERE id = $1`,
      [workspaceId]
    );

    if (workspaceResult.rows.length === 0) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const rawStartDate = workspaceResult.rows[0].sprint_start_date;
    const sprintDuration = 7;

    // Calculate current sprint number
    let workspaceStartDate: Date;
    if (rawStartDate instanceof Date) {
      workspaceStartDate = new Date(Date.UTC(rawStartDate.getFullYear(), rawStartDate.getMonth(), rawStartDate.getDate()));
    } else if (typeof rawStartDate === 'string') {
      workspaceStartDate = new Date(rawStartDate + 'T00:00:00Z');
    } else {
      workspaceStartDate = new Date();
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const daysSinceStart = Math.floor((today.getTime() - workspaceStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const currentSprintNumber = Math.floor(daysSinceStart / sprintDuration) + 1;

    // Determine which sprint to show (current or historical)
    let targetSprintNumber = currentSprintNumber;
    let isHistorical = false;

    if (requestedSprintNumber && typeof requestedSprintNumber === 'string') {
      const parsed = parseInt(requestedSprintNumber, 10);
      // Validate: must be positive, not in the future, and within 12 weeks back
      if (!isNaN(parsed) && parsed > 0 && parsed <= currentSprintNumber && parsed >= currentSprintNumber - 12) {
        targetSprintNumber = parsed;
        isHistorical = targetSprintNumber < currentSprintNumber;
      }
    }

    // Calculate sprint dates for the target sprint
    const targetSprintStart = new Date(workspaceStartDate);
    targetSprintStart.setUTCDate(targetSprintStart.getUTCDate() + (targetSprintNumber - 1) * sprintDuration);
    const targetSprintEnd = new Date(targetSprintStart);
    targetSprintEnd.setUTCDate(targetSprintEnd.getUTCDate() + sprintDuration - 1);

    // Days remaining only makes sense for current sprint
    const daysRemaining = isHistorical ? 0 : Math.max(0, Math.ceil((targetSprintEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    // Build dynamic WHERE clause for issue filters
    const params: any[] = [workspaceId, targetSprintNumber, userId, isAdmin];
    let filterConditions = '';

    if (state && typeof state === 'string') {
      params.push(state);
      filterConditions += ` AND i.properties->>'state' = $${params.length}`;
    }

    if (show_mine === 'true') {
      params.push(userId);
      filterConditions += ` AND (i.properties->>'assignee_id')::uuid = $${params.length}`;
    } else if (assignee && typeof assignee === 'string') {
      params.push(assignee);
      filterConditions += ` AND (i.properties->>'assignee_id')::uuid = $${params.length}`;
    }

    // Get all issues from all active sprints, grouped by sprint - join via document_associations
    const result = await pool.query(
      `SELECT
        i.id as issue_id, i.title as issue_title, i.properties as issue_properties,
        i.ticket_number, i.created_at as issue_created_at, i.updated_at as issue_updated_at,
        s.id as sprint_id, s.title as sprint_name, s.properties as sprint_properties,
        p.id as program_id, p.title as program_name, p.properties->>'prefix' as program_prefix,
        u.name as assignee_name,
        CASE WHEN person_doc.archived_at IS NOT NULL THEN true ELSE false END as assignee_archived
       FROM documents i
       JOIN document_associations da ON da.document_id = i.id AND da.relationship_type = 'sprint'
       JOIN documents s ON s.id = da.related_id AND s.document_type = 'sprint'
       LEFT JOIN document_associations prog_da ON prog_da.document_id = s.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents p ON prog_da.related_id = p.id
       LEFT JOIN users u ON (i.properties->>'assignee_id')::uuid = u.id
       LEFT JOIN documents person_doc ON person_doc.workspace_id = i.workspace_id
         AND person_doc.document_type = 'person'
         AND person_doc.properties->>'user_id' = i.properties->>'assignee_id'
       WHERE i.workspace_id = $1
         AND i.document_type = 'issue'
         AND (s.properties->>'sprint_number')::int = $2
         AND ${VISIBILITY_FILTER_SQL('i', '$3', '$4')}
         AND ${VISIBILITY_FILTER_SQL('s', '$3', '$4')}
         ${filterConditions}
       ORDER BY
         p.title,
         s.title,
         CASE i.properties->>'priority'
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END,
         i.updated_at DESC`,
      params
    );

    // Group issues by sprint/program
    const groupedData: Record<string, {
      sprint: { id: string; name: string; sprint_number: number };
      program: { id: string; name: string; prefix: string } | null;
      issues: any[];
    }> = {};

    for (const row of result.rows) {
      const sprintKey = row.sprint_id;
      if (!groupedData[sprintKey]) {
        const sprintProps = row.sprint_properties || {};
        groupedData[sprintKey] = {
          sprint: {
            id: row.sprint_id,
            name: row.sprint_name,
            sprint_number: sprintProps.sprint_number || targetSprintNumber,
          },
          program: row.program_id ? {
            id: row.program_id,
            name: row.program_name,
            prefix: row.program_prefix,
          } : null,
          issues: [],
        };
      }

      const issueProps = row.issue_properties || {};
      groupedData[sprintKey].issues.push({
        id: row.issue_id,
        title: row.issue_title,
        state: issueProps.state || 'backlog',
        priority: issueProps.priority || 'medium',
        assignee_id: issueProps.assignee_id || null,
        assignee_name: row.assignee_name,
        assignee_archived: row.assignee_archived || false,
        estimate: issueProps.estimate ?? null,
        ticket_number: row.ticket_number,
        display_id: `#${row.ticket_number}`,
        created_at: row.issue_created_at,
        updated_at: row.issue_updated_at,
      });
    }

    // Convert to array
    const groups = Object.values(groupedData);

    // Calculate totals
    const totalIssues = groups.reduce((sum, g) => sum + g.issues.length, 0);
    const completedIssues = groups.reduce((sum, g) =>
      sum + g.issues.filter((i: any) => i.state === 'done').length, 0);
    const inProgressIssues = groups.reduce((sum, g) =>
      sum + g.issues.filter((i: any) => i.state === 'in_progress' || i.state === 'in_review').length, 0);

    res.json({
      groups,
      summary: {
        total_issues: totalIssues,
        completed_issues: completedIssues,
        in_progress_issues: inProgressIssues,
        remaining_issues: totalIssues - completedIssues,
      },
      week: {
        sprint_number: targetSprintNumber,
        current_sprint_number: currentSprintNumber,
        start_date: targetSprintStart.toISOString().split('T')[0],
        end_date: targetSprintEnd.toISOString().split('T')[0],
        days_remaining: daysRemaining,
        is_historical: isHistorical,
      },
    });
  } catch (err) {
    console.error('Get my-week error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single sprint
// Automatically takes a plan snapshot when sprint becomes active (start_date reached)
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    const result = await pool.query(
      `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id,
              p.title as program_name, p.properties->>'prefix' as program_prefix,
              p.properties->>'accountable_id' as program_accountable_id,
              (SELECT op.properties->>'reports_to' FROM documents op WHERE d.properties->>'owner_id' IS NOT NULL AND op.id = (d.properties->>'owner_id')::uuid AND op.document_type = 'person' AND op.workspace_id = d.workspace_id) as owner_reports_to,
              w.sprint_start_date as workspace_sprint_start_date,
              u.id as owner_id, u.name as owner_name, u.email as owner_email,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue') as issue_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' = 'done') as completed_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' IN ('in_progress', 'in_review')) as started_count,
              (SELECT COUNT(*) > 0 FROM documents pl WHERE pl.parent_id = d.id AND pl.document_type = 'weekly_plan') as has_plan,
              (SELECT COUNT(*) > 0 FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL) as has_retro,
              (SELECT rt.properties->>'outcome' FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_outcome,
              (SELECT rt.id FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents p ON prog_da.related_id = p.id
       JOIN workspaces w ON d.workspace_id = w.id
       LEFT JOIN users u ON (d.properties->'assignee_ids'->>0)::uuid = u.id
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const row = result.rows[0];
    const props = row.properties || {};
    const sprintNumber = props.sprint_number || 1;
    const workspaceStartDate = row.workspace_sprint_start_date;

    // Check if sprint is active and needs a snapshot
    // Take snapshot when: sprint is active (start_date reached) AND no snapshot exists yet
    if (workspaceStartDate && isSprintActive(sprintNumber, workspaceStartDate) && !props.planned_issue_ids) {
      const sprintId = id as string; // Safe: Express route param is always a string
      const persisted = await persistSprintPlanningSnapshot(pool, sprintId, props, {
        source: 'backfilled_from_current_scope',
      });

      // Update row properties for response
      row.properties = persisted.properties;

      await upsertSprintAnalyticsSnapshot(pool, sprintId, workspaceId);
    }

    res.json(extractSprintFromRow(row));
  } catch (err) {
    console.error('Get sprint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create sprint (creates a document with document_type = 'sprint')
// Only stores sprint_number and owner_id - dates/status computed from sprint_number
// program_id is optional - allows creating projectless sprints for ad-hoc work
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    const parsed = createSprintSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
      return;
    }

    const { program_id, title, sprint_number, owner_id, plan, success_criteria, confidence } = parsed.data;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Get workspace info (always needed for sprint_start_date)
    const workspaceResult = await pool.query(
      `SELECT sprint_start_date FROM workspaces WHERE id = $1`,
      [workspaceId]
    );

    if (workspaceResult.rows.length === 0) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const sprintStartDate = workspaceResult.rows[0].sprint_start_date;

    // If program_id provided, verify it belongs to workspace and user can access it
    if (program_id) {
      const programCheck = await pool.query(
        `SELECT d.id
         FROM documents d
         WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'program'
           AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
        [program_id, workspaceId, userId, isAdmin]
      );

      if (programCheck.rows.length === 0) {
        res.status(404).json({ error: 'Program not found' });
        return;
      }

      // Check if sprint already exists for this program + sprint_number
      const existingCheck = await pool.query(
        `SELECT d.id FROM documents d
         JOIN document_associations da ON da.document_id = d.id
         WHERE da.related_id = $1 AND da.relationship_type = 'program'
           AND d.document_type = 'sprint' AND (d.properties->>'sprint_number')::int = $2`,
        [program_id, sprint_number]
      );

      if (existingCheck.rows.length > 0) {
        res.status(400).json({ error: `Week ${sprint_number} already exists for this program` });
        return;
      }
    } else {
      // For projectless sprints, check workspace-wide uniqueness (sprints without program association)
      const existingCheck = await pool.query(
        `SELECT d.id FROM documents d
         WHERE d.workspace_id = $1
           AND d.document_type = 'sprint'
           AND (d.properties->>'sprint_number')::int = $2
           AND NOT EXISTS (
             SELECT 1 FROM document_associations da
             WHERE da.document_id = d.id AND da.relationship_type = 'program'
           )`,
        [workspaceId, sprint_number]
      );

      if (existingCheck.rows.length > 0) {
        res.status(400).json({ error: `Programless week ${sprint_number} already exists` });
        return;
      }
    }

    // Verify owner exists in workspace (if provided)
    let ownerData = null;
    if (owner_id) {
      const ownerCheck = await pool.query(
        `SELECT u.id, u.name, u.email FROM users u
         JOIN workspace_memberships wm ON wm.user_id = u.id
         WHERE u.id = $1 AND wm.workspace_id = $2`,
        [owner_id, workspaceId]
      );

      if (ownerCheck.rows.length === 0) {
        res.status(400).json({ error: 'Owner not found in workspace' });
        return;
      }
      ownerData = ownerCheck.rows[0];
    }

    // Build properties JSONB - sprint_number, assignee_ids, and plan fields
    const properties: Record<string, unknown> = {
      sprint_number,
      assignee_ids: owner_id ? [owner_id] : [],
    };

    if (owner_id) {
      properties.owner_id = owner_id;
    }

    // Add plan fields if provided
    if (plan !== undefined) {
      properties.plan = plan;
      // Initialize plan_history with the initial plan
      properties.plan_history = [{
        plan,
        timestamp: new Date().toISOString(),
        author_id: userId,
      }];
    }
    if (success_criteria !== undefined) {
      properties.success_criteria = success_criteria;
    }
    if (confidence !== undefined) {
      properties.confidence = confidence;
    }

    // Default TipTap content for new sprints with HypothesisBlock and Success Criteria
    // The hypothesisBlock syncs bidirectionally with sprint.properties.hypothesis
    const defaultContent = {
      type: 'doc',
      content: [
        {
          type: 'hypothesisBlock',
          attrs: { placeholder: 'What will get done this sprint?' },
          content: []
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Success Criteria' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'How will we know if the hypothesis is validated? What metrics or outcomes will we measure?' }]
        }
      ]
    };

    const result = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, content)
       VALUES ($1, 'sprint', $2, $3, $4, $5)
       RETURNING id, title, properties`,
      [workspaceId, title, JSON.stringify(properties), userId, JSON.stringify(defaultContent)]
    );

    const sprintId = result.rows[0].id;

    // Create document_association to link sprint to program (required for queries that join via associations)
    if (program_id) {
      await pool.query(
        `INSERT INTO document_associations (document_id, related_id, relationship_type)
         VALUES ($1, $2, 'program')`,
        [sprintId, program_id]
      );
    }

    res.status(201).json({
      id: result.rows[0].id,
      name: result.rows[0].title,
      sprint_number,
      owner: ownerData ? {
        id: ownerData.id,
        name: ownerData.name,
        email: ownerData.email,
      } : null,
      program_id: program_id || null,
      workspace_sprint_start_date: sprintStartDate,
      issue_count: 0,
      completed_count: 0,
      started_count: 0,
      // Plan tracking fields - what will we learn/validate?
      plan: properties.plan || null,
      success_criteria: properties.success_criteria || null,
      confidence: properties.confidence ?? null,
      plan_history: properties.plan_history || null,
    });
  } catch (err) {
    console.error('Create sprint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update sprint - title, owner_id, and sprint_number can be updated
// When sprint_number changes, the plan snapshot is cleared and will be retaken when the new date arrives
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    const parsed = updateSprintSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
      return;
    }

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and user can access it, also get workspace start date
    const existing = await pool.query(
      `SELECT d.id, d.properties, prog_da.related_id as program_id, w.sprint_start_date
       FROM documents d
       JOIN workspaces w ON d.workspace_id = w.id
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const currentProps = existing.rows[0].properties || {};
    const programId = existing.rows[0].program_id;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const data = parsed.data;

    // Handle title update (regular column)
    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }

    // Handle owner_id and sprint_number updates (in properties)
    const newProps = { ...currentProps };
    let propsChanged = false;

    if (data.owner_id !== undefined) {
      // Only validate if owner_id is not null (i.e., setting a new owner, not clearing)
      if (data.owner_id) {
        // Verify owner exists in workspace
        const ownerCheck = await pool.query(
          `SELECT u.id FROM users u
           JOIN workspace_memberships wm ON wm.user_id = u.id
           WHERE u.id = $1 AND wm.workspace_id = $2`,
          [data.owner_id, req.workspaceId]
        );

        if (ownerCheck.rows.length === 0) {
          res.status(400).json({ error: 'Owner not found in workspace' });
          return;
        }
      }

      // Store as assignee_ids array (migration converted owner_id to assignee_ids)
      // Also store owner_id directly for accountability checks
      newProps.assignee_ids = data.owner_id ? [data.owner_id] : [];
      newProps.owner_id = data.owner_id || null;
      propsChanged = true;
    }

    // Handle sprint_number update - this changes the effective dates
    if (data.sprint_number !== undefined && data.sprint_number !== currentProps.sprint_number) {
      // Check if new sprint_number already exists for this program
      if (programId) {
        const existingCheck = await pool.query(
          `SELECT d.id FROM documents d
           JOIN document_associations da ON da.document_id = d.id AND da.related_id = $1 AND da.relationship_type = 'program'
           WHERE d.document_type = 'sprint' AND d.id != $2 AND (d.properties->>'sprint_number')::int = $3`,
          [programId, id, data.sprint_number]
        );

        if (existingCheck.rows.length > 0) {
          res.status(400).json({ error: `Week ${data.sprint_number} already exists for this program` });
          return;
        }
      } else {
        // For programless sprints, check workspace-wide uniqueness (sprints with no program association)
        const existingCheck = await pool.query(
          `SELECT d.id FROM documents d
           WHERE d.workspace_id = $1 AND d.document_type = 'sprint' AND d.id != $2
             AND (d.properties->>'sprint_number')::int = $3
             AND NOT EXISTS (SELECT 1 FROM document_associations da WHERE da.document_id = d.id AND da.relationship_type = 'program')`,
          [workspaceId, id, data.sprint_number]
        );

        if (existingCheck.rows.length > 0) {
          res.status(400).json({ error: `Programless week ${data.sprint_number} already exists` });
          return;
        }
      }

      newProps.sprint_number = data.sprint_number;

      // Clear the plan snapshot - it will be retaken when the new date arrives
      delete newProps.planned_issue_ids;
      delete newProps.planned_issue_count;
      delete newProps.planned_story_points;
      delete newProps.planned_estimate_hours;
      delete newProps.snapshot_taken_at;

      propsChanged = true;
    }

    // Handle status update
    if (data.status !== undefined) {
      newProps.status = data.status;
      propsChanged = true;
    }

    if (propsChanged) {
      updates.push(`properties = $${paramIndex++}`);
      values.push(JSON.stringify(newProps));
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push(`updated_at = now()`);

    await pool.query(
      `UPDATE documents SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND workspace_id = $${paramIndex + 1} AND document_type = 'sprint'`,
      [...values, id, req.workspaceId]
    );

    await enqueueFleetGraphSprintMutationEvent({
      workspaceId,
      sprintId: id as string,
      actorId: userId,
      actorWorkPersona: req.userWorkPersona ?? null,
      eventKind: 'sprint_updated',
      previous: {
        status: currentProps.status || null,
        ownerPersonId: currentProps.owner_id || null,
      },
    });
    scheduleFleetGraphProactiveEventProcessing();

    // Re-query to get full sprint with owner info
    const result = await pool.query(
      `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id,
              p.title as program_name, p.properties->>'prefix' as program_prefix,
              p.properties->>'accountable_id' as program_accountable_id,
              (SELECT op.properties->>'reports_to' FROM documents op WHERE d.properties->>'owner_id' IS NOT NULL AND op.id = (d.properties->>'owner_id')::uuid AND op.document_type = 'person' AND op.workspace_id = d.workspace_id) as owner_reports_to,
              w.sprint_start_date as workspace_sprint_start_date,
              u.id as owner_id, u.name as owner_name, u.email as owner_email,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue') as issue_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' = 'done') as completed_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' IN ('in_progress', 'in_review')) as started_count,
              (SELECT COUNT(*) > 0 FROM documents pl WHERE pl.parent_id = d.id AND pl.document_type = 'weekly_plan') as has_plan,
              (SELECT COUNT(*) > 0 FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL) as has_retro,
              (SELECT rt.properties->>'outcome' FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_outcome,
              (SELECT rt.id FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents p ON prog_da.related_id = p.id
       JOIN workspaces w ON d.workspace_id = w.id
       LEFT JOIN users u ON (d.properties->'assignee_ids'->>0)::uuid = u.id
       WHERE d.id = $1 AND d.document_type = 'sprint'`,
      [id]
    );

    res.json(extractSprintFromRow(result.rows[0]));
  } catch (err) {
    console.error('Update sprint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start sprint - manually activate a planning sprint with scope snapshot
// POST /api/weeks/:id/start
router.post('/:id/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and user can access it
    const existing = await pool.query(
      `SELECT d.id, d.properties, prog_da.related_id as program_id, w.sprint_start_date
       FROM documents d
       JOIN workspaces w ON d.workspace_id = w.id
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const currentProps = existing.rows[0].properties || {};
    const currentStatus = currentProps.status || 'planning';

    // Only allow starting a sprint that's in planning status
    if (currentStatus !== 'planning') {
      res.status(400).json({
        error: `Cannot start week: week is already ${currentStatus}`,
      });
      return;
    }

    const sprintId = id as string;
    const persisted = await persistSprintPlanningSnapshot(pool, sprintId, currentProps, {
      source: 'captured_at_start',
    });

    const newProps = {
      ...persisted.properties,
      status: 'active',
    };

    await pool.query(
      `UPDATE documents SET properties = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(newProps), id]
    );

    await enqueueFleetGraphSprintMutationEvent({
      workspaceId,
      sprintId: id as string,
      actorId: userId,
      actorWorkPersona: req.userWorkPersona ?? null,
      eventKind: 'sprint_started',
      previous: {
        status: currentStatus,
        ownerPersonId: currentProps.owner_id || null,
      },
    });
    scheduleFleetGraphProactiveEventProcessing();

    // Broadcast celebration when sprint is started
    broadcastToUser(req.userId!, 'accountability:updated', { type: 'week_start', targetId: id as string });

    // Re-query to get full sprint with owner info
    const result = await pool.query(
      `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id,
              p.title as program_name, p.properties->>'prefix' as program_prefix,
              p.properties->>'accountable_id' as program_accountable_id,
              (SELECT op.properties->>'reports_to' FROM documents op WHERE d.properties->>'owner_id' IS NOT NULL AND op.id = (d.properties->>'owner_id')::uuid AND op.document_type = 'person' AND op.workspace_id = d.workspace_id) as owner_reports_to,
              w.sprint_start_date as workspace_sprint_start_date,
              u.id as owner_id, u.name as owner_name, u.email as owner_email,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue') as issue_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' = 'done') as completed_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' IN ('in_progress', 'in_review')) as started_count,
              (SELECT COUNT(*) > 0 FROM documents pl WHERE pl.parent_id = d.id AND pl.document_type = 'weekly_plan') as has_plan,
              (SELECT COUNT(*) > 0 FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL) as has_retro,
              (SELECT rt.properties->>'outcome' FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_outcome,
              (SELECT rt.id FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents p ON prog_da.related_id = p.id
       JOIN workspaces w ON d.workspace_id = w.id
       LEFT JOIN users u ON (d.properties->'assignee_ids'->>0)::uuid = u.id
       WHERE d.id = $1 AND d.document_type = 'sprint'`,
      [id]
    );

    const sprint = extractSprintFromRow(result.rows[0]);

    await upsertSprintAnalyticsSnapshot(pool, sprintId, workspaceId);

    res.json({
      ...sprint,
      snapshot_issue_count: persisted.snapshot.issueCount,
    });
  } catch (err) {
    console.error('Start sprint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete sprint
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and user can access it
    const existing = await pool.query(
      `SELECT id FROM documents
       WHERE id = $1 AND workspace_id = $2 AND document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('documents', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    // Remove sprint associations from issues via document_associations
    await pool.query(
      `DELETE FROM document_associations WHERE related_id = $1 AND relationship_type = 'sprint'`,
      [id]
    );

    await pool.query(
      `DELETE FROM documents WHERE id = $1 AND document_type = 'sprint'`,
      [id]
    );

    res.status(204).send();
  } catch (err) {
    console.error('Delete sprint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update sprint plan (append mode - preserves history)
// PATCH /api/weeks/:id/plan
router.patch('/:id/plan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
      return;
    }

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and user can access it, get current properties
    const existing = await pool.query(
      `SELECT id, properties FROM documents
       WHERE id = $1 AND workspace_id = $2 AND document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('documents', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const currentProps = existing.rows[0].properties || {};
    const newProps = { ...currentProps };
    const data = parsed.data;
    const now = new Date().toISOString();
    let planWasWritten = false;

    // If plan is being updated, append old one to history
    if (data.plan !== undefined && data.plan !== currentProps.plan) {
      // Initialize history if doesn't exist
      const currentHistory = Array.isArray(currentProps.plan_history)
        ? [...currentProps.plan_history]
        : [];

      // If there was a previous plan, add it to history
      if (currentProps.plan) {
        currentHistory.push({
          plan: currentProps.plan,
          timestamp: now,
          author_id: userId,
        });
      }

      // Update to new plan
      newProps.plan = data.plan;
      newProps.plan_history = currentHistory;

      // Track if we're writing a non-empty plan for the first time
      if (data.plan && !currentProps.plan) {
        planWasWritten = true;
      }
    }

    // Update success_criteria and confidence directly
    if (data.success_criteria !== undefined) {
      newProps.success_criteria = data.success_criteria;
    }
    if (data.confidence !== undefined) {
      newProps.confidence = data.confidence;
    }

    // If plan or success_criteria changed and was previously approved, transition to 'changed_since_approved'
    const planChanged = data.plan !== undefined && data.plan !== currentProps.plan;
    const criteriaChanged = data.success_criteria !== undefined &&
      JSON.stringify(data.success_criteria) !== JSON.stringify(currentProps.success_criteria);

    if ((planChanged || criteriaChanged) &&
        currentProps.plan_approval?.state === 'approved') {
      newProps.plan_approval = {
        ...currentProps.plan_approval,
        state: 'changed_since_approved',
      };
    }

    // Save updated properties
    await pool.query(
      `UPDATE documents SET properties = $1, updated_at = now()
       WHERE id = $2 AND workspace_id = $3 AND document_type = 'sprint'`,
      [JSON.stringify(newProps), id, workspaceId]
    );

    // Log changes to document_history for approval workflow tracking
    if (data.plan !== undefined && data.plan !== currentProps.plan) {
      await logDocumentChange(
        id as string,
        'plan',
        currentProps.plan || null,
        data.plan || null,
        userId
      );
    }
    if (data.success_criteria !== undefined) {
      const oldCriteria = currentProps.success_criteria ? JSON.stringify(currentProps.success_criteria) : null;
      const newCriteria = data.success_criteria ? JSON.stringify(data.success_criteria) : null;
      if (oldCriteria !== newCriteria) {
        await logDocumentChange(
          id as string,
          'success_criteria',
          oldCriteria,
          newCriteria,
          userId
        );
      }
    }

    // Broadcast celebration when plan is added
    if (data.plan && data.plan.trim() !== '') {
      broadcastToUser(req.userId!, 'accountability:updated', { type: 'weekly_plan', targetId: id as string });
    }

    // Re-query to get full sprint with owner info
    const result = await pool.query(
      `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id,
              p.title as program_name, p.properties->>'prefix' as program_prefix,
              p.properties->>'accountable_id' as program_accountable_id,
              (SELECT op.properties->>'reports_to' FROM documents op WHERE d.properties->>'owner_id' IS NOT NULL AND op.id = (d.properties->>'owner_id')::uuid AND op.document_type = 'person' AND op.workspace_id = d.workspace_id) as owner_reports_to,
              w.sprint_start_date as workspace_sprint_start_date,
              u.id as owner_id, u.name as owner_name, u.email as owner_email,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue') as issue_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' = 'done') as completed_count,
              (SELECT COUNT(*) FROM documents i
               JOIN document_associations ida ON ida.document_id = i.id AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
               WHERE i.document_type = 'issue' AND i.properties->>'state' IN ('in_progress', 'in_review')) as started_count,
              (SELECT COUNT(*) > 0 FROM documents pl WHERE pl.parent_id = d.id AND pl.document_type = 'weekly_plan') as has_plan,
              (SELECT COUNT(*) > 0 FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL) as has_retro,
              (SELECT rt.properties->>'outcome' FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_outcome,
              (SELECT rt.id FROM documents rt
               JOIN document_associations rda ON rda.document_id = rt.id AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
               WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents p ON prog_da.related_id = p.id
       JOIN workspaces w ON d.workspace_id = w.id
       LEFT JOIN users u ON (d.properties->'assignee_ids'->>0)::uuid = u.id
       WHERE d.id = $1 AND d.document_type = 'sprint'`,
      [id]
    );

    res.json(extractSprintFromRow(result.rows[0]));
  } catch (err) {
    console.error('Update sprint plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sprint issues
router.get('/:id/issues', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists, user can access it, and get program info
    const sprintResult = await pool.query(
      `SELECT d.id, p.properties->>'prefix' as prefix FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents p ON prog_da.related_id = p.id
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const result = await pool.query(
      `SELECT d.id, d.title, d.properties, d.ticket_number,
              d.created_at, d.updated_at, d.created_by,
              u.name as assignee_name,
              CASE WHEN person_doc.archived_at IS NOT NULL THEN true ELSE false END as assignee_archived
       FROM documents d
       JOIN document_associations sprint_da ON sprint_da.document_id = d.id AND sprint_da.related_id = $1 AND sprint_da.relationship_type = 'sprint'
       LEFT JOIN users u ON (d.properties->>'assignee_id')::uuid = u.id
       LEFT JOIN documents person_doc ON person_doc.workspace_id = d.workspace_id
         AND person_doc.document_type = 'person'
         AND person_doc.properties->>'user_id' = d.properties->>'assignee_id'
       WHERE d.document_type = 'issue'
         AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
       ORDER BY
         CASE d.properties->>'priority'
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END,
         d.updated_at DESC`,
      [id, userId, isAdmin]
    );

    // Get carryover sprint names for issues that have carryover_from_sprint_id
    const carryoverSprintIds = result.rows
      .map(row => row.properties?.carryover_from_sprint_id)
      .filter(Boolean);

    let carryoverSprintNames: Record<string, string> = {};
    if (carryoverSprintIds.length > 0) {
      const uniqueIds = [...new Set(carryoverSprintIds)];
      const sprintNamesResult = await pool.query(
        `SELECT id, title FROM documents WHERE id = ANY($1) AND document_type = 'sprint'`,
        [uniqueIds]
      );
      carryoverSprintNames = Object.fromEntries(
        sprintNamesResult.rows.map(r => [r.id, r.title])
      );
    }

    const issues = result.rows.map(row => {
      const props = row.properties || {};
      const carryoverFromSprintId = props.carryover_from_sprint_id || null;
      const planning = getIssuePlanningMetrics(props);
      return {
        id: row.id,
        title: row.title,
        state: props.state || 'backlog',
        priority: props.priority || 'medium',
        assignee_id: props.assignee_id || null,
        story_points: props.story_points ?? planning.storyPoints ?? null,
        estimate_hours: props.estimate_hours ?? props.estimate ?? planning.estimateHours ?? null,
        estimate: props.estimate_hours ?? props.estimate ?? planning.estimateHours ?? null,
        ticket_number: row.ticket_number,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        assignee_name: row.assignee_name,
        assignee_archived: row.assignee_archived || false,
        display_id: `#${row.ticket_number}`,
        carryover_from_sprint_id: carryoverFromSprintId,
        carryover_from_sprint_name: carryoverFromSprintId
          ? carryoverSprintNames[carryoverFromSprintId] || null
          : null,
      };
    });

    res.json(issues);
  } catch (err) {
    console.error('Get sprint issues error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sprint scope changes
// Returns: { originalScope, currentScope, scopeChangePercent, scopeChanges }
router.get('/:id/scope-changes', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      res.status(400).json({ error: 'Week id is required' });
      return;
    }
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);
    const payload = await getSprintScopeChangePayload(id, workspaceId, userId, isAdmin);

    if (!payload) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    res.json(payload);
  } catch (err) {
    console.error('Get sprint scope changes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/analytics', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      res.status(400).json({ error: 'Week id is required' });
      return;
    }
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);
    const historyScope: VelocityHistoryScope = req.query.historyScope === 'project' ? 'project' : 'program';
    const historyStartWeek = parsePositiveInteger(req.query.historyStartWeek);
    const historyEndWeek = parsePositiveInteger(req.query.historyEndWeek);

    const sprintResult = await pool.query(
      `SELECT d.id, d.title, d.properties,
              d.properties->>'sprint_number' as sprint_number,
              w.sprint_start_date as workspace_sprint_start_date
       FROM documents d
       JOIN workspaces w ON d.workspace_id = w.id
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const sprintRow = sprintResult.rows[0];
    const sprintProps = (sprintRow.properties ?? {}) as Record<string, unknown>;
    const sprintNumber = parseInt(sprintRow.sprint_number, 10);
    const { startDate, endDate } = calculateSprintDates(sprintNumber, sprintRow.workspace_sprint_start_date);
    const status = (sprintProps.status as string | undefined) ?? 'planning';

    if (!hasSprintPlanningSnapshot(sprintProps) && status !== 'planning') {
      const persisted = await persistSprintPlanningSnapshot(pool, id, sprintProps, {
        source: 'backfilled_from_current_scope',
      });
      sprintRow.properties = persisted.properties;
    }

    if (status !== 'planning') {
      await upsertSprintAnalyticsSnapshot(pool, id, workspaceId);
    }

    const snapshots = await getSprintAnalyticsSnapshots(pool, id);
    const scopeChanges = await getSprintScopeChangePayload(id, workspaceId, userId, isAdmin);
    const velocityHistory = await getVelocityHistory(
      id,
      sprintNumber,
      workspaceId,
      userId,
      isAdmin,
      sprintRow.workspace_sprint_start_date,
      {
        scope: historyScope,
        startWeek: historyStartWeek,
        endWeek: historyEndWeek,
      }
    );
    const props = (sprintRow.properties ?? {}) as Record<string, unknown>;
    const livePlanningSnapshot = status === 'planning'
      ? await takeSprintPlanningSnapshot(pool, id)
      : null;
    const plannedIssueIds = Array.isArray(props.planned_issue_ids) ? props.planned_issue_ids : [];
    const fallbackIssueCount =
      plannedIssueIds.length > 0
        ? plannedIssueIds.length
        : (livePlanningSnapshot?.issueCount ?? 0);
    const baselineStoryPoints = Number(props.planned_story_points ?? livePlanningSnapshot?.storyPoints ?? 0);
    const baselineEstimateHours = Number(
      props.planned_estimate_hours ?? props.planned_estimate ?? livePlanningSnapshot?.estimateHours ?? 0
    );
    const baselineIssueCount = Number(props.planned_issue_count ?? fallbackIssueCount);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const effectiveEndDate =
      status === 'planning'
        ? endDate
        : status === 'completed'
          ? endDate
          : new Date(Math.min(endDate.getTime(), today.getTime()));
    const dayKeys = enumerateDates(startDate, effectiveEndDate);

    const snapshotByDate = new Map(snapshots.map((snapshot) => [snapshot.snapshot_date, snapshot]));
    let lastSnapshot = snapshots[0] ?? null;
    const days = dayKeys.map((day) => {
      const snapshot = snapshotByDate.get(day) ?? lastSnapshot;
      if (snapshotByDate.has(day)) {
        lastSnapshot = snapshotByDate.get(day) ?? lastSnapshot;
      }

      return {
        date: day,
        committedStoryPoints: baselineStoryPoints,
        currentStoryPoints: snapshot?.current_story_points ?? baselineStoryPoints,
        completedStoryPoints: snapshot?.completed_story_points ?? 0,
        remainingStoryPoints: snapshot?.remaining_story_points ?? baselineStoryPoints,
        committedEstimateHours: baselineEstimateHours,
        currentEstimateHours: snapshot?.current_estimate_hours ?? baselineEstimateHours,
        completedEstimateHours: snapshot?.completed_estimate_hours ?? 0,
        remainingEstimateHours: snapshot?.remaining_estimate_hours ?? baselineEstimateHours,
        committedIssueCount: baselineIssueCount,
        currentIssueCount: snapshot?.current_issue_count ?? baselineIssueCount,
        completedIssueCount: snapshot?.completed_issue_count ?? 0,
      };
    });

    const latestDay = days[days.length - 1] ?? {
      committedStoryPoints: baselineStoryPoints,
      currentStoryPoints: baselineStoryPoints,
      completedStoryPoints: 0,
      remainingStoryPoints: baselineStoryPoints,
      committedEstimateHours: baselineEstimateHours,
      currentEstimateHours: baselineEstimateHours,
      completedEstimateHours: 0,
      remainingEstimateHours: baselineEstimateHours,
      committedIssueCount: baselineIssueCount,
      currentIssueCount: baselineIssueCount,
      completedIssueCount: 0,
    };

    const totalStoryPointsAdded = scopeChanges?.scopeChanges
      .filter((change) => change.storyPointsChange > 0)
      .reduce((sum, change) => sum + change.storyPointsChange, 0) ?? 0;
    const totalStoryPointsRemoved = Math.abs(scopeChanges?.scopeChanges
      .filter((change) => change.storyPointsChange < 0)
      .reduce((sum, change) => sum + change.storyPointsChange, 0) ?? 0);
    const totalEstimateHoursAdded = scopeChanges?.scopeChanges
      .filter((change) => change.estimateChange > 0)
      .reduce((sum, change) => sum + change.estimateChange, 0) ?? 0;
    const totalEstimateHoursRemoved = Math.abs(scopeChanges?.scopeChanges
      .filter((change) => change.estimateChange < 0)
      .reduce((sum, change) => sum + change.estimateChange, 0) ?? 0);

    res.json({
      sprintId: id,
      sprintName: sprintRow.title,
      status,
      startDate: formatIsoDate(startDate),
      endDate: formatIsoDate(endDate),
      snapshotTakenAt: props.snapshot_taken_at ?? null,
      baseline: {
        issueCount: baselineIssueCount,
        storyPoints: baselineStoryPoints,
        estimateHours: baselineEstimateHours,
      },
      current: {
        issueCount: latestDay.currentIssueCount,
        completedIssueCount: latestDay.completedIssueCount,
        storyPoints: latestDay.currentStoryPoints,
        completedStoryPoints: latestDay.completedStoryPoints,
        remainingStoryPoints: latestDay.remainingStoryPoints,
        estimateHours: latestDay.currentEstimateHours,
        completedEstimateHours: latestDay.completedEstimateHours,
        remainingEstimateHours: latestDay.remainingEstimateHours,
      },
      scope: {
        addedStoryPoints: totalStoryPointsAdded,
        removedStoryPoints: totalStoryPointsRemoved,
        addedEstimateHours: totalEstimateHoursAdded,
        removedEstimateHours: totalEstimateHoursRemoved,
      },
      velocityHistory: velocityHistory.history,
      historyMeta: velocityHistory.meta,
      days,
      scopeChanges,
    });
  } catch (err) {
    console.error('Get sprint analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Standup Endpoints - Comment-like entries on sprints
// ============================================

// Schema for creating a standup
// Note: date field is optional but if provided must be today (enforced in handler)
const createStandupSchema = z.object({
  content: z.record(z.unknown()).default({ type: 'doc', content: [{ type: 'paragraph' }] }),
  title: z.string().max(200).optional().default('Standup Update'),
  date: z.string().optional(), // ISO date string - must be today if provided
});

// Helper to format standup response
function formatStandupResponse(row: any) {
  return {
    id: row.id,
    sprint_id: row.parent_id,
    title: row.title,
    content: row.content,
    author_id: row.author_id,
    author_name: row.author_name,
    author_email: row.author_email,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @swagger
 * /sprints/{id}/standups:
 *   get:
 *     summary: List standups for a sprint
 *     tags: [Sprints, Standups]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprint ID
 *     responses:
 *       200:
 *         description: List of standups
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Standup'
 *       404:
 *         description: Sprint not found
 */
router.get('/:id/standups', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and user can access it
    const sprintCheck = await pool.query(
      `SELECT id FROM documents
       WHERE id = $1 AND workspace_id = $2 AND document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('documents', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintCheck.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    // Get all standups for this sprint (parent_id = sprint.id)
    const result = await pool.query(
      `SELECT d.id, d.parent_id, d.title, d.content, d.created_at, d.updated_at,
              d.properties->>'author_id' as author_id,
              u.name as author_name, u.email as author_email
       FROM documents d
       LEFT JOIN users u ON (d.properties->>'author_id')::uuid = u.id
       WHERE d.parent_id = $1 AND d.document_type = 'standup'
         AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
       ORDER BY d.created_at DESC`,
      [id, userId, isAdmin]
    );

    // Transform issue links in standup content (e.g., #123 -> clickable links)
    // Batch pre-load all issue references to avoid N+1 queries
    const allContents = result.rows.map((row) => row.content);
    const allTicketNumbers = extractTicketNumbersFromContents(allContents);
    const issueMap = await batchLookupIssues(workspaceId, allTicketNumbers);

    const standups = await Promise.all(
      result.rows.map(async (row) => {
        const formatted = formatStandupResponse(row);
        formatted.content = await transformIssueLinks(formatted.content, workspaceId, issueMap);
        return formatted;
      })
    );

    res.json(standups);
  } catch (err) {
    console.error('Get sprint standups error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /sprints/{id}/standups:
 *   post:
 *     summary: Create a standup entry
 *     tags: [Sprints, Standups]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sprint ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: object
 *                 description: TipTap editor content
 *               title:
 *                 type: string
 *                 default: Untitled
 *     responses:
 *       201:
 *         description: Standup created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Standup'
 *       404:
 *         description: Sprint not found
 */
router.post('/:id/standups', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    const parsed = createStandupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
      return;
    }

    const { content, title, date } = parsed.data;

    // Enforce current-day-only standup posting
    // Users cannot backdate standups - they can only post for today
    if (date) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      if (date !== todayStr) {
        res.status(400).json({
          error: 'Standups can only be posted for the current day',
          details: `Attempted to post for ${date}, but today is ${todayStr}`,
        });
        return;
      }
    }

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and user can access it
    const sprintCheck = await pool.query(
      `SELECT id FROM documents
       WHERE id = $1 AND workspace_id = $2 AND document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('documents', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintCheck.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    // Create the standup document
    // parent_id = sprint.id, properties.author_id = current user
    const properties = { author_id: userId };

    const result = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, parent_id, properties, created_by, visibility)
       VALUES ($1, 'standup', $2, $3, $4, $5, $6, 'workspace')
       RETURNING id, parent_id, title, content, properties, created_at, updated_at`,
      [workspaceId, title, JSON.stringify(content), id, JSON.stringify(properties), userId]
    );

    // Get author info
    const authorResult = await pool.query(
      `SELECT name, email FROM users WHERE id = $1`,
      [userId]
    );

    const standup = result.rows[0];
    const author = authorResult.rows[0];

    // Broadcast celebration when standup is created
    broadcastToUser(userId, 'accountability:updated', { type: 'standup', targetId: id as string });

    res.status(201).json({
      id: standup.id,
      sprint_id: standup.parent_id,
      title: standup.title,
      content: standup.content,
      author_id: userId,
      author_name: author?.name || null,
      author_email: author?.email || null,
      created_at: standup.created_at,
      updated_at: standup.updated_at,
    });
  } catch (err) {
    console.error('Create standup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Sprint Review Endpoints - One per sprint with plan validation
// ============================================

// Schema for creating/updating a sprint review
const sprintReviewSchema = z.object({
  content: z.record(z.unknown()).optional(),
  title: z.string().max(200).optional(),
  plan_validated: z.boolean().nullable().optional(),
});

// Helper to generate pre-filled sprint review content
async function generatePrefilledReviewContent(sprintData: any, issues: any[]) {
  // Categorize issues
  const issuesPlanned = issues.filter(i => {
    const props = i.properties || {};
    // An issue is "planned" if it was in the sprint from the start (no carryover_from_sprint_id)
    return !props.carryover_from_sprint_id;
  });

  const issuesCompleted = issues.filter(i => {
    const props = i.properties || {};
    return props.state === 'done';
  });

  const issuesIntroduced = issues.filter(i => {
    const props = i.properties || {};
    // Issues introduced mid-sprint would have carryover_from_sprint_id
    return !!props.carryover_from_sprint_id;
  });

  const issuesCancelled = issues.filter(i => {
    const props = i.properties || {};
    return props.state === 'cancelled';
  });

  // Build TipTap content with suggested sections
  const content: any = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Weekly Summary' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Week ${sprintData.sprint_number} review for ${sprintData.program_name || 'Program'}.` }]
      },
    ]
  };

  // Add plan section if sprint has one
  if (sprintData.plan) {
    content.content.push(
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Plan' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: sprintData.plan }]
      }
    );
  }

  // Add issues summary section
  content.content.push(
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Issues Summary' }]
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: `Planned: ${issuesPlanned.length} issues` }]
          }]
        },
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: `Completed: ${issuesCompleted.length} issues` }]
          }]
        },
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: `Introduced mid-sprint: ${issuesIntroduced.length} issues` }]
          }]
        },
        {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: `Cancelled: ${issuesCancelled.length} issues` }]
          }]
        },
      ]
    }
  );

  // Add completed issues list
  if (issuesCompleted.length > 0) {
    content.content.push(
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Deliverables' }]
      },
      {
        type: 'bulletList',
        content: issuesCompleted.map(i => ({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: `#${i.ticket_number}: ${i.title}` }]
          }]
        }))
      }
    );
  }

  // Add next steps placeholder
  content.content.push(
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Next Steps' }]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Add follow-up actions and learnings here.' }]
    }
  );

  return content;
}

// GET /api/weeks/:id/review - Get or generate pre-filled sprint review
router.get('/:id/review', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and user can access it
    const sprintResult = await pool.query(
      `SELECT d.id, d.title, d.properties, prog_da.related_id as program_id,
              p.title as program_name
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents p ON prog_da.related_id = p.id
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const sprint = sprintResult.rows[0];
    const sprintProps = sprint.properties || {};

    // Check if a weekly_review already exists for this sprint
    // Note: weekly_review documents use document_associations to link to sprint
    const existingReview = await pool.query(
      `SELECT d.id, d.title, d.content, d.properties, d.created_at, d.updated_at,
              u.name as owner_name, u.email as owner_email
       FROM documents d
       JOIN document_associations da ON da.document_id = d.id AND da.related_id = $1 AND da.relationship_type = 'sprint'
       LEFT JOIN users u ON (d.properties->>'owner_id')::uuid = u.id
       WHERE d.document_type = 'weekly_review'
         AND d.workspace_id = $2
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (existingReview.rows.length > 0) {
      // Return existing review
      const review = existingReview.rows[0];
      const reviewProps = review.properties || {};
      res.json({
        id: review.id,
        sprint_id: id,
        title: review.title,
        content: review.content,
        plan_validated: reviewProps.plan_validated ?? null,
        owner_id: reviewProps.owner_id || null,
        owner_name: review.owner_name || null,
        owner_email: review.owner_email || null,
        created_at: review.created_at,
        updated_at: review.updated_at,
        is_draft: false,
      });
      return;
    }

    // No existing review - generate pre-filled draft
    // Get issues for this sprint
    const issuesResult = await pool.query(
      `SELECT d.id, d.title, d.properties, d.ticket_number
       FROM documents d
       JOIN document_associations da ON da.document_id = d.id AND da.related_id = $1 AND da.relationship_type = 'sprint'
       WHERE d.document_type = 'issue'`,
      [id]
    );

    // Fetch weekly_plan documents for this sprint (plans are now separate documents, not sprint properties)
    const weeklyPlansResult = await pool.query(
      `SELECT content FROM documents
       WHERE document_type = 'weekly_plan'
         AND (properties->>'week_number')::int = $1
         AND workspace_id = $2
         AND deleted_at IS NULL`,
      [sprintProps.sprint_number || 1, workspaceId]
    );
    const planTexts = weeklyPlansResult.rows
      .map((row: { content: unknown }) => extractText(row.content))
      .filter((t: string) => t.trim().length > 0);

    const sprintData = {
      sprint_number: sprintProps.sprint_number || 1,
      program_name: sprint.program_name,
      plan: planTexts.length > 0 ? planTexts.join('\n\n') : null,
    };

    const prefilledContent = await generatePrefilledReviewContent(sprintData, issuesResult.rows);

    res.json({
      id: null, // No ID yet - this is a draft
      sprint_id: id,
      title: `Week ${sprintData.sprint_number} Review`,
      content: prefilledContent,
      plan_validated: null,
      owner_id: null,
      owner_name: null,
      owner_email: null,
      created_at: null,
      updated_at: null,
      is_draft: true,
    });
  } catch (err) {
    console.error('Get sprint review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/weeks/:id/review - Create finalized sprint review
router.post('/:id/review', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    const parsed = sprintReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
      return;
    }

    const { content, title, plan_validated } = parsed.data;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and user can access it
    const sprintCheck = await pool.query(
      `SELECT id, properties FROM documents
       WHERE id = $1 AND workspace_id = $2 AND document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('documents', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintCheck.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    // Check if a weekly_review already exists
    const existingCheck = await pool.query(
      `SELECT d.id FROM documents d
       JOIN document_associations da ON da.document_id = d.id AND da.related_id = $1 AND da.relationship_type = 'sprint'
       WHERE d.document_type = 'weekly_review'
         AND d.workspace_id = $2`,
      [id, workspaceId]
    );

    if (existingCheck.rows.length > 0) {
      res.status(409).json({ error: 'Weekly review already exists. Use PATCH to update.' });
      return;
    }

    const sprintProps = sprintCheck.rows[0].properties || {};

    // Create the weekly_review document
    const properties = {
      sprint_id: id,
      owner_id: userId,
      plan_validated: plan_validated ?? null,
    };

    const reviewTitle = title || `Week ${sprintProps.sprint_number || 'N'} Review`;
    const reviewContent = content || { type: 'doc', content: [{ type: 'paragraph' }] };

    const result = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by, visibility)
       VALUES ($1, 'weekly_review', $2, $3, $4, $5, 'workspace')
       RETURNING id, title, content, properties, created_at, updated_at`,
      [workspaceId, reviewTitle, JSON.stringify(reviewContent), JSON.stringify(properties), userId]
    );

    // Create document_association to link weekly_review to sprint
    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'sprint')`,
      [result.rows[0].id, id]
    );

    // Get owner info
    const ownerResult = await pool.query(
      `SELECT name, email FROM users WHERE id = $1`,
      [userId]
    );

    // Broadcast celebration when sprint review is created
    broadcastToUser(userId, 'accountability:updated', { type: 'weekly_review', targetId: id as string });

    // Log initial review content to document_history for approval workflow tracking
    const review = result.rows[0];
    if (reviewContent) {
      await logDocumentChange(
        review.id,
        'review_content',
        null,
        JSON.stringify(reviewContent),
        userId
      );
    }

    const owner = ownerResult.rows[0];

    res.status(201).json({
      id: review.id,
      sprint_id: id,
      title: review.title,
      content: review.content,
      plan_validated: plan_validated ?? null,
      owner_id: userId,
      owner_name: owner?.name || null,
      owner_email: owner?.email || null,
      created_at: review.created_at,
      updated_at: review.updated_at,
      is_draft: false,
    });
  } catch (err) {
    console.error('Create sprint review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/weeks/:id/review - Update existing sprint review
router.patch('/:id/review', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    const parsed = sprintReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
      return;
    }

    const { content, title, plan_validated } = parsed.data;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Find existing weekly_review for this sprint
    const existing = await pool.query(
      `SELECT d.id, d.properties, d.content FROM documents d
       JOIN document_associations da ON da.document_id = d.id AND da.related_id = $1 AND da.relationship_type = 'sprint'
       WHERE d.document_type = 'weekly_review'
         AND d.workspace_id = $2
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Weekly review not found. Use POST to create.' });
      return;
    }

    const reviewId = existing.rows[0].id;
    const currentProps = existing.rows[0].properties || {};
    const currentContent = existing.rows[0].content;

    // Check if user is owner or admin
    const ownerId = currentProps.owner_id;
    if (ownerId !== userId && !isAdmin) {
      res.status(403).json({ error: 'Only the owner or admin can update this review' });
      return;
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(JSON.stringify(content));
    }

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }

    // Handle properties update
    let propsChanged = false;
    const newProps = { ...currentProps };

    if (plan_validated !== undefined) {
      newProps.plan_validated = plan_validated;
      propsChanged = true;
    }

    if (propsChanged) {
      updates.push(`properties = $${paramIndex++}`);
      values.push(JSON.stringify(newProps));
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push(`updated_at = now()`);

    await pool.query(
      `UPDATE documents SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND document_type = 'weekly_review'`,
      [...values, reviewId]
    );

    // Log review content changes to document_history for approval workflow tracking
    if (content !== undefined) {
      const oldContent = currentContent ? JSON.stringify(currentContent) : null;
      const newContent = JSON.stringify(content);
      if (oldContent !== newContent) {
        await logDocumentChange(
          reviewId,
          'review_content',
          oldContent,
          newContent,
          userId
        );
      }
    }

    // If review content or plan_validated changed, update parent sprint's review_approval
    const reviewFieldsChanged = content !== undefined || plan_validated !== undefined;
    if (reviewFieldsChanged) {
      // Fetch parent sprint to check review_approval state
      const sprintResult = await pool.query(
        `SELECT properties FROM documents WHERE id = $1 AND document_type = 'sprint'`,
        [id]
      );
      if (sprintResult.rows.length > 0) {
        const sprintProps = sprintResult.rows[0].properties || {};
        if (sprintProps.review_approval?.state === 'approved') {
          const newSprintProps = {
            ...sprintProps,
            review_approval: {
              ...sprintProps.review_approval,
              state: 'changed_since_approved',
            },
          };
          await pool.query(
            `UPDATE documents SET properties = $1, updated_at = now()
             WHERE id = $2 AND document_type = 'sprint'`,
            [JSON.stringify(newSprintProps), id]
          );
        }
      }
    }

    // Re-query to get full review with owner info
    // Note: weekly_review documents use owner_id (not assignee_ids like sprint docs)
    const result = await pool.query(
      `SELECT d.id, d.title, d.content, d.properties, d.created_at, d.updated_at,
              u.name as owner_name, u.email as owner_email
       FROM documents d
       LEFT JOIN users u ON (d.properties->>'owner_id')::uuid = u.id
       WHERE d.id = $1 AND d.document_type = 'weekly_review'`,
      [reviewId]
    );

    const review = result.rows[0];
    const reviewProps = review.properties || {};

    res.json({
      id: review.id,
      sprint_id: id,
      title: review.title,
      content: review.content,
      plan_validated: reviewProps.plan_validated ?? null,
      owner_id: reviewProps.owner_id || null,
      owner_name: review.owner_name || null,
      owner_email: review.owner_email || null,
      created_at: review.created_at,
      updated_at: review.updated_at,
      is_draft: false,
    });
  } catch (err) {
    console.error('Update sprint review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Carryover schema
const carryoverSchema = z.object({
  issue_ids: z.array(z.string().uuid()).min(1),
  target_sprint_id: z.string().uuid(),
});

// POST /api/weeks/:id/carryover - Move incomplete issues to another sprint
router.post('/:id/carryover', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: sourceSprintId } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    const parsed = carryoverSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
      return;
    }

    const { issue_ids, target_sprint_id } = parsed.data;

    // Get visibility context for filtering
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // 1. Validate source sprint exists
    const sourceSprintResult = await pool.query(
      `SELECT d.id, d.title, d.properties FROM documents d
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [sourceSprintId, workspaceId, userId, isAdmin]
    );

    if (sourceSprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Source week not found' });
      return;
    }

    const sourceSprint = sourceSprintResult.rows[0];

    // 2. Validate target sprint exists and is planning/active
    const targetSprintResult = await pool.query(
      `SELECT d.id, d.title, d.properties FROM documents d
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [target_sprint_id, workspaceId, userId, isAdmin]
    );

    if (targetSprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Target week not found' });
      return;
    }

    const targetSprint = targetSprintResult.rows[0];
    const targetProps = targetSprint.properties || {};
    const targetStatus = targetProps.status || 'planning';

    if (!['planning', 'active'].includes(targetStatus)) {
      res.status(400).json({ error: `Target week must be planning or active (currently: ${targetStatus})` });
      return;
    }

    // 3. Verify all issue_ids belong to the source sprint and user has access
    const issueCheckResult = await pool.query(
      `SELECT d.id FROM documents d
       JOIN document_associations da ON da.document_id = d.id AND da.related_id = $1 AND da.relationship_type = 'sprint'
       WHERE d.id = ANY($2) AND d.document_type = 'issue' AND d.workspace_id = $3
         AND ${VISIBILITY_FILTER_SQL('d', '$4', '$5')}`,
      [sourceSprintId, issue_ids, workspaceId, userId, isAdmin]
    );

    const foundIssueIds = new Set(issueCheckResult.rows.map(r => r.id));
    const missingIssues = issue_ids.filter(id => !foundIssueIds.has(id));

    if (missingIssues.length > 0) {
      res.status(400).json({
        error: 'Some issues not found in source week',
        missing_issue_ids: missingIssues,
      });
      return;
    }

    // 4. Move each issue: delete old association, create new one, update properties
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const issueId of issue_ids) {
        // Delete the sprint association from source sprint
        await client.query(
          `DELETE FROM document_associations
           WHERE document_id = $1 AND related_id = $2 AND relationship_type = 'sprint'`,
          [issueId, sourceSprintId]
        );

        // Create new sprint association to target sprint
        await client.query(
          `INSERT INTO document_associations (document_id, related_id, relationship_type)
           VALUES ($1, $2, 'sprint')
           ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
          [issueId, target_sprint_id]
        );

        // Set carryover_from_sprint_id in the issue properties
        await client.query(
          `UPDATE documents
           SET properties = properties || $1::jsonb, updated_at = now()
           WHERE id = $2`,
          [JSON.stringify({ carryover_from_sprint_id: sourceSprintId }), issueId]
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // 5. Return result
    res.json({
      moved_count: issue_ids.length,
      source_sprint: {
        id: sourceSprint.id,
        name: sourceSprint.title,
        sprint_number: sourceSprint.properties?.sprint_number || null,
      },
      target_sprint: {
        id: targetSprint.id,
        name: targetSprint.title,
        sprint_number: targetProps.sprint_number || null,
      },
    });
  } catch (err) {
    console.error('Week carryover error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/weeks/:id/approve-plan - Approve sprint plan
router.post('/:id/approve-plan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;
    const parsedComment = parseApprovalComment(req.body);
    if (parsedComment.error) {
      res.status(400).json({ error: parsedComment.error });
      return;
    }

    // Get visibility context for admin check
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists, get properties and program's accountable_id
    const sprintResult = await pool.query(
      `SELECT d.id, d.properties, d.properties->>'owner_id' as sprint_owner_id,
              prog.properties->>'accountable_id' as program_accountable_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents prog ON prog_da.related_id = prog.id
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const sprint = sprintResult.rows[0];
    const programAccountableId = sprint.program_accountable_id;

    // Check authorization: must be program's accountable_id, supervisor (reports_to), OR workspace admin
    const ownerReportsTo = await getSprintOwnerReportsTo(id as string, workspaceId);
    if (programAccountableId !== userId && ownerReportsTo !== userId && !isAdmin) {
      res.status(403).json({ error: 'Only the supervisor, program accountable person, or admin can approve plans' });
      return;
    }

    // Get the latest plan history entry for version tracking
    const historyEntry = await getLatestDocumentFieldHistory(id as string, 'plan');
    const versionId = historyEntry?.id || null;

    // Update sprint properties with approval
    const currentProps = sprint.properties || {};
    const previousApproval = currentProps.plan_approval || null;
    const previousComment = typeof previousApproval?.comment === 'string'
      ? previousApproval.comment
      : null;
    const resolvedComment = parsedComment.provided
      ? parsedComment.value
      : (previousComment ?? null);
    const newApproval = {
      state: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      approved_version_id: versionId,
      comment: resolvedComment,
    };
    const newProps = {
      ...currentProps,
      plan_approval: newApproval,
    };

    await pool.query(
      `UPDATE documents SET properties = $1, updated_at = now()
       WHERE id = $2 AND document_type = 'sprint'`,
      [JSON.stringify(newProps), id]
    );

    // If approval comment changed, log to history for auditability.
    if (previousComment !== resolvedComment) {
      await logDocumentChange(
        id as string,
        'plan_approval',
        previousApproval ? JSON.stringify(previousApproval) : null,
        JSON.stringify(newApproval),
        userId
      );
    }

    await broadcastAccountabilityUpdateToSprintOwner(
      sprint.sprint_owner_id,
      id as string,
      'plan_approved'
    );

    res.json({
      success: true,
      approval: newApproval,
    });
  } catch (err) {
    console.error('Approve sprint plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/weeks/:id/unapprove-plan - Revoke plan approval (logged to history)
router.post('/:id/unapprove-plan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    const sprintResult = await pool.query(
      `SELECT d.id, d.properties, prog.properties->>'accountable_id' as program_accountable_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents prog ON prog_da.related_id = prog.id
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const sprint = sprintResult.rows[0];
    const ownerReportsTo = await getSprintOwnerReportsTo(id as string, workspaceId);
    if (sprint.program_accountable_id !== userId && ownerReportsTo !== userId && !isAdmin) {
      res.status(403).json({ error: 'Only the supervisor, program accountable person, or admin can unapprove plans' });
      return;
    }

    const currentProps = sprint.properties || {};
    const previousApproval = currentProps.plan_approval;

    // Log the unapproval to document_history (preserves audit trail)
    await logDocumentChange(
      id as string,
      'plan_approval',
      previousApproval ? JSON.stringify(previousApproval) : null,
      null,
      userId
    );

    // Remove the approval from properties
    const { plan_approval: _, ...restProps } = currentProps;

    await pool.query(
      `UPDATE documents SET properties = $1, updated_at = now()
       WHERE id = $2 AND document_type = 'sprint'`,
      [JSON.stringify(restProps), id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Unapprove sprint plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/weeks/:id/approve-review - Approve sprint review (rating required)
router.post('/:id/approve-review', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rating } = req.body || {};
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;
    const parsedComment = parseApprovalComment(req.body);
    if (parsedComment.error) {
      res.status(400).json({ error: parsedComment.error });
      return;
    }

    // Rating is required for retro approvals (OPM 5-level scale: 1-5)
    if (rating === undefined || rating === null) {
      res.status(400).json({ error: 'Rating is required when approving retros' });
      return;
    }
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
      return;
    }

    // Get visibility context for admin check
    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists, get properties and program's accountable_id
    const sprintResult = await pool.query(
      `SELECT d.id, d.properties, d.properties->>'owner_id' as sprint_owner_id,
              prog.properties->>'accountable_id' as program_accountable_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents prog ON prog_da.related_id = prog.id
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const sprint = sprintResult.rows[0];
    const programAccountableId = sprint.program_accountable_id;

    // Check authorization: must be program's accountable_id, supervisor (reports_to), OR workspace admin
    const ownerReportsTo = await getSprintOwnerReportsTo(id as string, workspaceId);
    if (programAccountableId !== userId && ownerReportsTo !== userId && !isAdmin) {
      res.status(403).json({ error: 'Only the supervisor, program accountable person, or admin can approve reviews' });
      return;
    }

    // Find the weekly_review document to get its version history
    const reviewResult = await pool.query(
      `SELECT d.id FROM documents d
       JOIN document_associations da ON da.document_id = d.id AND da.related_id = $1 AND da.relationship_type = 'sprint'
       WHERE d.document_type = 'weekly_review' AND d.workspace_id = $2`,
      [id, workspaceId]
    );

    let versionId: number | null = null;
    if (reviewResult.rows.length > 0) {
      const reviewId = reviewResult.rows[0].id;
      const historyEntry = await getLatestDocumentFieldHistory(reviewId, 'review_content');
      versionId = historyEntry?.id || null;
    }

    // Update sprint properties with review approval and rating
    const currentProps = sprint.properties || {};
    const previousApproval = currentProps.review_approval || null;
    const previousComment = typeof previousApproval?.comment === 'string'
      ? previousApproval.comment
      : null;
    const resolvedComment = parsedComment.provided
      ? parsedComment.value
      : (previousComment ?? null);
    const newApproval = {
      state: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      approved_version_id: versionId,
      comment: resolvedComment,
    };
    const newProps: Record<string, unknown> = {
      ...currentProps,
      review_approval: newApproval,
      review_rating: {
        value: ratingNum,
        rated_by: userId,
        rated_at: new Date().toISOString(),
      },
    };

    await pool.query(
      `UPDATE documents SET properties = $1, updated_at = now()
       WHERE id = $2 AND document_type = 'sprint'`,
      [JSON.stringify(newProps), id]
    );

    // If approval comment changed, log to history for auditability.
    if (previousComment !== resolvedComment) {
      await logDocumentChange(
        id as string,
        'review_approval',
        previousApproval ? JSON.stringify(previousApproval) : null,
        JSON.stringify(newApproval),
        userId
      );
    }

    await broadcastAccountabilityUpdateToSprintOwner(
      sprint.sprint_owner_id,
      id as string,
      'review_approved'
    );

    res.json({
      success: true,
      approval: newApproval,
      review_rating: newProps.review_rating,
    });
  } catch (err) {
    console.error('Approve sprint review error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/weeks/:id/request-plan-changes - Request changes on sprint plan
router.post('/:id/request-plan-changes', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body || {};
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Validate feedback is provided and not too long
    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      res.status(400).json({ error: 'Feedback is required when requesting changes' });
      return;
    }
    if (feedback.length > 2000) {
      res.status(400).json({ error: 'Feedback must be 2000 characters or less' });
      return;
    }

    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and get authorization info
    const sprintResult = await pool.query(
      `SELECT d.id, d.properties, d.properties->>'owner_id' as sprint_owner_id,
              prog.properties->>'accountable_id' as program_accountable_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents prog ON prog_da.related_id = prog.id
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const sprint = sprintResult.rows[0];
    const programAccountableId = sprint.program_accountable_id;

    // Check authorization: must be program's accountable_id, supervisor (reports_to), OR workspace admin
    const ownerReportsTo = await getSprintOwnerReportsTo(id as string, workspaceId);
    if (programAccountableId !== userId && ownerReportsTo !== userId && !isAdmin) {
      res.status(403).json({ error: 'Only the supervisor, program accountable person, or admin can request changes' });
      return;
    }

    // Update sprint properties with changes_requested
    const currentProps = sprint.properties || {};
    const newProps = {
      ...currentProps,
      plan_approval: {
        state: 'changes_requested',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        approved_version_id: null,
        feedback: feedback.trim(),
      },
    };

    await pool.query(
      `UPDATE documents SET properties = $1, updated_at = now()
       WHERE id = $2 AND document_type = 'sprint'`,
      [JSON.stringify(newProps), id]
    );

    await enqueueFleetGraphSprintApprovalEvent({
      workspaceId,
      sprintId: id as string,
      actorId: userId,
      actorWorkPersona: req.userWorkPersona ?? null,
      eventKind: 'sprint_plan_changes_requested',
      approval: {
        previousState: currentProps.plan_approval?.state ?? null,
        feedback: feedback.trim(),
        requestedByUserId: userId,
      },
    });
    scheduleFleetGraphProactiveEventProcessing();

    // Notify the sprint owner that changes were requested
    const sprintOwnerId = sprint.sprint_owner_id;
    if (sprintOwnerId) {
      // Find the user_id for this person document
      const ownerUserResult = await pool.query(
        `SELECT properties->>'user_id' as user_id FROM documents WHERE id = $1`,
        [sprintOwnerId]
      );
      const ownerUserId = ownerUserResult.rows[0]?.user_id;
      if (ownerUserId) {
        broadcastToUser(ownerUserId, 'accountability:updated', {
          type: 'changes_requested_plan',
          targetId: id as string,
        });
      }
    }

    res.json({
      success: true,
      approval: newProps.plan_approval,
    });
  } catch (err) {
    console.error('Request plan changes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/weeks/:id/request-retro-changes - Request changes on sprint retro
router.post('/:id/request-retro-changes', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body || {};
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }
    const { userId, workspaceId } = authContext;

    // Validate feedback is provided and not too long
    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      res.status(400).json({ error: 'Feedback is required when requesting changes' });
      return;
    }
    if (feedback.length > 2000) {
      res.status(400).json({ error: 'Feedback must be 2000 characters or less' });
      return;
    }

    const { isAdmin } = await getVisibilityContext(userId, workspaceId);

    // Verify sprint exists and get authorization info
    const sprintResult = await pool.query(
      `SELECT d.id, d.properties, d.properties->>'owner_id' as sprint_owner_id,
              prog.properties->>'accountable_id' as program_accountable_id
       FROM documents d
       LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id AND prog_da.relationship_type = 'program'
       LEFT JOIN documents prog ON prog_da.related_id = prog.id
       WHERE d.id = $1 AND d.workspace_id = $2 AND d.document_type = 'sprint'
         AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}`,
      [id, workspaceId, userId, isAdmin]
    );

    if (sprintResult.rows.length === 0) {
      res.status(404).json({ error: 'Week not found' });
      return;
    }

    const sprint = sprintResult.rows[0];
    const programAccountableId = sprint.program_accountable_id;

    // Check authorization: must be program's accountable_id, supervisor (reports_to), OR workspace admin
    const ownerReportsTo = await getSprintOwnerReportsTo(id as string, workspaceId);
    if (programAccountableId !== userId && ownerReportsTo !== userId && !isAdmin) {
      res.status(403).json({ error: 'Only the supervisor, program accountable person, or admin can request changes' });
      return;
    }

    // Update sprint properties with changes_requested for retro
    const currentProps = sprint.properties || {};
    const newProps = {
      ...currentProps,
      review_approval: {
        state: 'changes_requested',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        approved_version_id: null,
        feedback: feedback.trim(),
      },
    };

    await pool.query(
      `UPDATE documents SET properties = $1, updated_at = now()
       WHERE id = $2 AND document_type = 'sprint'`,
      [JSON.stringify(newProps), id]
    );

    await enqueueFleetGraphSprintApprovalEvent({
      workspaceId,
      sprintId: id as string,
      actorId: userId,
      actorWorkPersona: req.userWorkPersona ?? null,
      eventKind: 'sprint_review_changes_requested',
      approval: {
        previousState: currentProps.review_approval?.state ?? null,
        feedback: feedback.trim(),
        requestedByUserId: userId,
      },
    });
    scheduleFleetGraphProactiveEventProcessing();

    // Notify the sprint owner that changes were requested
    const sprintOwnerId = sprint.sprint_owner_id;
    if (sprintOwnerId) {
      const ownerUserResult = await pool.query(
        `SELECT properties->>'user_id' as user_id FROM documents WHERE id = $1`,
        [sprintOwnerId]
      );
      const ownerUserId = ownerUserResult.rows[0]?.user_id;
      if (ownerUserId) {
        broadcastToUser(ownerUserId, 'accountability:updated', {
          type: 'changes_requested_retro',
          targetId: id as string,
        });
      }
    }

    res.json({
      success: true,
      approval: newProps.review_approval,
    });
  } catch (err) {
    console.error('Request retro changes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
