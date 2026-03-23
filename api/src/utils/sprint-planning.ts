import { pool } from '../db/client.js';

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface SprintPlanningSnapshot {
  issueIds: string[];
  issueCount: number;
  storyPoints: number;
  estimateHours: number;
}

export type SprintPlanningSnapshotSource =
  | 'captured_at_start'
  | 'backfilled_from_current_scope'
  | 'seeded_history';

export interface SprintAnalyticsSnapshotRow {
  snapshot_date: string;
  current_issue_count: number;
  completed_issue_count: number;
  current_story_points: number;
  completed_story_points: number;
  remaining_story_points: number;
  current_estimate_hours: number;
  completed_estimate_hours: number;
  remaining_estimate_hours: number;
}

function parseNumeric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function deriveStoryPointsFromEstimateHours(estimateHours: number | null | undefined): number | null {
  if (estimateHours === null || estimateHours === undefined || estimateHours <= 0) {
    return null;
  }

  if (estimateHours <= 2) return 1;
  if (estimateHours <= 4) return 2;
  if (estimateHours <= 8) return 3;
  if (estimateHours <= 12) return 5;
  if (estimateHours <= 16) return 8;
  if (estimateHours <= 24) return 13;
  return 21;
}

export function getIssuePlanningMetrics(properties: Record<string, unknown> | null | undefined): {
  storyPoints: number;
  estimateHours: number;
} {
  const props = properties ?? {};
  const estimateHours = parseNumeric(props.estimate_hours ?? props.estimate);
  const storyPoints = parseNumeric(
    props.story_points ?? deriveStoryPointsFromEstimateHours(estimateHours)
  );

  return {
    storyPoints,
    estimateHours,
  };
}

export function hasSprintPlanningSnapshot(properties: Record<string, unknown> | null | undefined): boolean {
  const props = properties ?? {};
  return (
    Array.isArray(props.planned_issue_ids) ||
    props.planned_issue_count !== undefined ||
    props.planned_story_points !== undefined ||
    props.planned_estimate_hours !== undefined ||
    props.snapshot_taken_at !== undefined
  );
}

export function buildSprintPlanningSnapshotProperties(
  properties: Record<string, unknown> | null | undefined,
  snapshot: SprintPlanningSnapshot,
  snapshotTakenAt: string,
  source: SprintPlanningSnapshotSource
): Record<string, unknown> {
  return {
    ...(properties ?? {}),
    planned_issue_ids: snapshot.issueIds,
    planned_issue_count: snapshot.issueCount,
    planned_story_points: snapshot.storyPoints,
    planned_estimate_hours: snapshot.estimateHours,
    snapshot_taken_at: snapshotTakenAt,
    planning_snapshot_source: source,
  };
}

export async function persistSprintPlanningSnapshot(
  queryable: Queryable,
  sprintId: string,
  properties: Record<string, unknown> | null | undefined,
  options: {
    source: SprintPlanningSnapshotSource;
    snapshotTakenAt?: string | Date;
  }
): Promise<{
  snapshot: SprintPlanningSnapshot;
  properties: Record<string, unknown>;
  snapshotTakenAt: string;
}> {
  const snapshot = await takeSprintPlanningSnapshot(queryable, sprintId);
  const snapshotTakenAt =
    options.snapshotTakenAt instanceof Date
      ? options.snapshotTakenAt.toISOString()
      : options.snapshotTakenAt ?? new Date().toISOString();
  const nextProperties = buildSprintPlanningSnapshotProperties(
    properties,
    snapshot,
    snapshotTakenAt,
    options.source
  );

  await queryable.query(
    `UPDATE documents
     SET properties = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(nextProperties), sprintId]
  );

  return {
    snapshot,
    properties: nextProperties,
    snapshotTakenAt,
  };
}

export async function takeSprintPlanningSnapshot(
  queryable: Queryable,
  sprintId: string
): Promise<SprintPlanningSnapshot> {
  const result = await queryable.query(
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

  let storyPoints = 0;
  let estimateHours = 0;

  for (const row of result.rows) {
    const metrics = getIssuePlanningMetrics(row.properties as Record<string, unknown> | undefined);
    storyPoints += metrics.storyPoints;
    estimateHours += metrics.estimateHours;
  }

  return {
    issueIds: result.rows.map((row) => row.id as string),
    issueCount: result.rows.length,
    storyPoints,
    estimateHours,
  };
}

export async function upsertSprintAnalyticsSnapshot(
  queryable: Queryable,
  sprintId: string,
  workspaceId: string,
  snapshotDate: Date = new Date()
): Promise<void> {
  const result = await queryable.query(
    `SELECT d.properties
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

  let currentIssueCount = 0;
  let completedIssueCount = 0;
  let currentStoryPoints = 0;
  let completedStoryPoints = 0;
  let currentEstimateHours = 0;
  let completedEstimateHours = 0;

  for (const row of result.rows) {
    const props = (row.properties ?? {}) as Record<string, unknown>;
    const metrics = getIssuePlanningMetrics(props);
    const isDone = props.state === 'done';

    currentIssueCount += 1;
    currentStoryPoints += metrics.storyPoints;
    currentEstimateHours += metrics.estimateHours;

    if (isDone) {
      completedIssueCount += 1;
      completedStoryPoints += metrics.storyPoints;
      completedEstimateHours += metrics.estimateHours;
    }
  }

  const snapshotDateIso = snapshotDate.toISOString().slice(0, 10);

  await queryable.query(
    `INSERT INTO sprint_analytics_snapshots (
       sprint_id,
       workspace_id,
       snapshot_date,
       current_issue_count,
       completed_issue_count,
       current_story_points,
       completed_story_points,
       remaining_story_points,
       current_estimate_hours,
       completed_estimate_hours,
       remaining_estimate_hours
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
     )
     ON CONFLICT (sprint_id, snapshot_date) DO UPDATE SET
       current_issue_count = EXCLUDED.current_issue_count,
       completed_issue_count = EXCLUDED.completed_issue_count,
       current_story_points = EXCLUDED.current_story_points,
       completed_story_points = EXCLUDED.completed_story_points,
       remaining_story_points = EXCLUDED.remaining_story_points,
       current_estimate_hours = EXCLUDED.current_estimate_hours,
       completed_estimate_hours = EXCLUDED.completed_estimate_hours,
       remaining_estimate_hours = EXCLUDED.remaining_estimate_hours,
       updated_at = NOW()`,
    [
      sprintId,
      workspaceId,
      snapshotDateIso,
      currentIssueCount,
      completedIssueCount,
      currentStoryPoints,
      completedStoryPoints,
      Math.max(currentStoryPoints - completedStoryPoints, 0),
      currentEstimateHours,
      completedEstimateHours,
      Math.max(currentEstimateHours - completedEstimateHours, 0),
    ]
  );
}

export async function getSprintAnalyticsSnapshots(
  queryable: Queryable,
  sprintId: string
): Promise<SprintAnalyticsSnapshotRow[]> {
  const result = await queryable.query(
    `SELECT
       snapshot_date::text,
       current_issue_count,
       completed_issue_count,
       current_story_points::float8 as current_story_points,
       completed_story_points::float8 as completed_story_points,
       remaining_story_points::float8 as remaining_story_points,
       current_estimate_hours::float8 as current_estimate_hours,
       completed_estimate_hours::float8 as completed_estimate_hours,
       remaining_estimate_hours::float8 as remaining_estimate_hours
     FROM sprint_analytics_snapshots
     WHERE sprint_id = $1
     ORDER BY snapshot_date ASC`,
    [sprintId]
  );

  return result.rows.map((row) => ({
    snapshot_date: row.snapshot_date as string,
    current_issue_count: Number(row.current_issue_count) || 0,
    completed_issue_count: Number(row.completed_issue_count) || 0,
    current_story_points: parseNumeric(row.current_story_points),
    completed_story_points: parseNumeric(row.completed_story_points),
    remaining_story_points: parseNumeric(row.remaining_story_points),
    current_estimate_hours: parseNumeric(row.current_estimate_hours),
    completed_estimate_hours: parseNumeric(row.completed_estimate_hours),
    remaining_estimate_hours: parseNumeric(row.remaining_estimate_hours),
  }));
}

export async function ensureSprintAnalyticsSnapshot(
  sprintId: string,
  workspaceId: string
): Promise<void> {
  await upsertSprintAnalyticsSnapshot(pool, sprintId, workspaceId);
}
