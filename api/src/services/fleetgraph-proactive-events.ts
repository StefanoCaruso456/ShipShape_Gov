import { randomUUID } from 'crypto';
import type {
  FleetGraphLogger,
} from '@ship/fleetgraph';
import type {
  FleetGraphProactiveEventEntityType,
  FleetGraphProactiveEventKind,
  FleetGraphProactiveEventRecord,
  FleetGraphProactiveIssueEventPayload,
  FleetGraphProactiveIssueIterationEventPayload,
  FleetGraphProactiveIssueSnapshot,
  FleetGraphProactiveSprintApprovalEventPayload,
  FleetGraphProactiveSprintEventPayload,
  FleetGraphProactiveSprintSnapshot,
  FleetGraphProactiveTriggerKind,
  FleetGraphProactiveTriggerMatch,
} from '@ship/shared';
import { pool } from '../db/client.js';
import { broadcastToUser } from '../collaboration/index.js';
import { createFleetGraphLogger } from './fleetgraph-runner.js';
import { persistFleetGraphProactiveFinding } from './fleetgraph-proactive.js';

type QueryRunner = { query: typeof pool.query };

interface IssueProactiveSnapshot {
  issueId: string;
  issueTitle: string;
  ticketNumber: number | null;
  issueState: string;
  assigneeId: string | null;
  issueRoute: string;
  projectId: string | null;
  projectTitle: string | null;
  projectOwnerUserId: string | null;
  sprintId: string | null;
  sprintTitle: string | null;
  sprintNumber: number | null;
  sprintStatus: string | null;
  sprintSnapshotTakenAt: string | null;
  sprintOwnerUserId: string | null;
  sprintEndDate: string | null;
}

interface SprintProactiveSnapshot {
  sprintId: string;
  sprintTitle: string;
  sprintNumber: number | null;
  sprintStatus: string | null;
  sprintOwnerPersonId: string | null;
  sprintOwnerUserId: string | null;
  projectId: string | null;
  programId: string | null;
  programOwnerUserId: string | null;
  route: string;
}

interface EnqueueIssueMutationEventInput {
  workspaceId: string;
  issueId: string;
  actorId: string | null;
  eventKind: Extract<FleetGraphProactiveEventKind, 'issue_created' | 'issue_updated'>;
  previous: {
    state: string | null;
    assigneeId: string | null;
    sprintId: string | null;
  };
}

interface EnqueueIssueIterationEventInput {
  workspaceId: string;
  issueId: string;
  actorId: string | null;
  iteration: {
    id: string | null;
    status: 'pass' | 'fail' | 'in_progress';
    blockersEncountered: string | null;
    authorId: string | null;
    authorName: string | null;
  };
}

interface EnqueueSprintMutationEventInput {
  workspaceId: string;
  sprintId: string;
  actorId: string | null;
  eventKind: Extract<FleetGraphProactiveEventKind, 'sprint_updated' | 'sprint_started'>;
  previous: {
    status: string | null;
    ownerPersonId: string | null;
  };
}

interface EnqueueSprintApprovalEventInput {
  workspaceId: string;
  sprintId: string;
  actorId: string | null;
  eventKind: Extract<
    FleetGraphProactiveEventKind,
    'sprint_plan_changes_requested' | 'sprint_review_changes_requested'
  >;
  approval: {
    previousState: string | null;
    feedback: string | null;
    requestedByUserId: string | null;
  };
}

interface ProactiveEventProcessingResult {
  processedEvents: number;
  matchedTriggers: number;
  findingsCreated: number;
}

let eventDrainScheduled = false;
let eventDrainRunning = false;

function getEventLogger(logger?: FleetGraphLogger): FleetGraphLogger {
  return logger ?? createFleetGraphLogger('FleetGraph proactive events');
}

function calculateSprintEndDateIso(
  workspaceSprintStartDate: Date | string | null,
  sprintNumber: number | null
): string | null {
  if (!workspaceSprintStartDate || !Number.isFinite(sprintNumber ?? Number.NaN) || !sprintNumber) {
    return null;
  }

  const rawDate =
    workspaceSprintStartDate instanceof Date
      ? new Date(
          Date.UTC(
            workspaceSprintStartDate.getUTCFullYear(),
            workspaceSprintStartDate.getUTCMonth(),
            workspaceSprintStartDate.getUTCDate()
          )
        )
      : new Date(`${workspaceSprintStartDate}T00:00:00Z`);

  if (Number.isNaN(rawDate.getTime())) {
    return null;
  }

  const endDate = new Date(rawDate);
  endDate.setUTCDate(endDate.getUTCDate() + sprintNumber * 7 - 1);
  return endDate.toISOString();
}

function startOfUtcDay(isoLike: string): number {
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) {
    return Number.NaN;
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isOpenIssue(state: string | null): boolean {
  return state !== 'done' && state !== 'cancelled';
}

function isOnOrAfterSprintLastDay(sprintEndDate: string | null, occurredAt: string): boolean {
  if (!sprintEndDate) {
    return false;
  }

  const endDay = startOfUtcDay(sprintEndDate);
  const eventDay = startOfUtcDay(occurredAt);

  return Number.isFinite(endDay) && Number.isFinite(eventDay) && eventDay >= endDay;
}

function buildIssueLabel(issue: FleetGraphProactiveIssueEventPayload['issue']): string {
  return issue.ticketNumber ? `#${issue.ticketNumber}` : issue.title;
}

function mapEventRow(row: Record<string, unknown>): FleetGraphProactiveEventRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    entityId: String(row.entity_id),
    entityType: row.entity_type as FleetGraphProactiveEventEntityType,
    eventKind: row.event_kind as FleetGraphProactiveEventKind,
    route: String(row.route),
    payload: row.payload as FleetGraphProactiveIssueEventPayload | FleetGraphProactiveSprintEventPayload,
    matchedTriggerKinds: Array.isArray(row.matched_trigger_kinds)
      ? row.matched_trigger_kinds.filter((value): value is FleetGraphProactiveTriggerKind => typeof value === 'string')
      : [],
    findingsCreated: Number(row.findings_created ?? 0),
    processingStatus: row.processing_status as FleetGraphProactiveEventRecord['processingStatus'],
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    processingStartedAt:
      row.processing_started_at instanceof Date || typeof row.processing_started_at === 'string'
        ? new Date(String(row.processing_started_at)).toISOString()
        : null,
    processedAt:
      row.processed_at instanceof Date || typeof row.processed_at === 'string'
        ? new Date(String(row.processed_at)).toISOString()
        : null,
  };
}

async function loadIssueProactiveSnapshot(
  workspaceId: string,
  issueId: string,
  db: QueryRunner
): Promise<IssueProactiveSnapshot | null> {
  const result = await db.query(
    `SELECT
       issue.id AS issue_id,
       issue.title AS issue_title,
       issue.ticket_number,
       issue.properties AS issue_properties,
       project.id AS project_id,
       project.title AS project_title,
       project_owner.id AS project_owner_user_id,
       sprint.id AS sprint_id,
       sprint.title AS sprint_title,
       (sprint.properties->>'sprint_number')::int AS sprint_number,
       sprint.properties->>'status' AS sprint_status,
       sprint.properties->>'snapshot_taken_at' AS sprint_snapshot_taken_at,
       sprint_owner_user.id AS sprint_owner_user_id,
       workspace.sprint_start_date
     FROM documents issue
     JOIN workspaces workspace ON workspace.id = issue.workspace_id
     LEFT JOIN document_associations project_assoc
       ON project_assoc.document_id = issue.id
       AND project_assoc.relationship_type = 'project'
     LEFT JOIN documents project
       ON project.id = project_assoc.related_id
       AND project.document_type = 'project'
     LEFT JOIN users project_owner
       ON project.properties->>'owner_id' IS NOT NULL
       AND project_owner.id = (project.properties->>'owner_id')::uuid
     LEFT JOIN document_associations sprint_assoc
       ON sprint_assoc.document_id = issue.id
       AND sprint_assoc.relationship_type = 'sprint'
     LEFT JOIN documents sprint
       ON sprint.id = sprint_assoc.related_id
       AND sprint.document_type = 'sprint'
     LEFT JOIN documents sprint_owner_person
       ON sprint.properties->>'owner_id' IS NOT NULL
       AND sprint_owner_person.id = (sprint.properties->>'owner_id')::uuid
       AND sprint_owner_person.document_type = 'person'
       AND sprint_owner_person.workspace_id = issue.workspace_id
     LEFT JOIN users sprint_owner_user
       ON sprint_owner_person.properties->>'user_id' IS NOT NULL
       AND sprint_owner_user.id = (sprint_owner_person.properties->>'user_id')::uuid
     WHERE issue.workspace_id = $1
       AND issue.id = $2
       AND issue.document_type = 'issue'
     LIMIT 1`,
    [workspaceId, issueId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const props = row.issue_properties ?? {};

  return {
    issueId: row.issue_id,
    issueTitle: row.issue_title,
    ticketNumber: typeof row.ticket_number === 'number' ? row.ticket_number : null,
    issueState: typeof props.state === 'string' ? props.state : 'backlog',
    assigneeId: typeof props.assignee_id === 'string' ? props.assignee_id : null,
    issueRoute: `/documents/${row.issue_id}`,
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    projectTitle: typeof row.project_title === 'string' ? row.project_title : null,
    projectOwnerUserId:
      typeof row.project_owner_user_id === 'string' ? row.project_owner_user_id : null,
    sprintId: typeof row.sprint_id === 'string' ? row.sprint_id : null,
    sprintTitle: typeof row.sprint_title === 'string' ? row.sprint_title : null,
    sprintNumber: typeof row.sprint_number === 'number' ? row.sprint_number : null,
    sprintStatus: typeof row.sprint_status === 'string' ? row.sprint_status : null,
    sprintSnapshotTakenAt:
      typeof row.sprint_snapshot_taken_at === 'string' ? row.sprint_snapshot_taken_at : null,
    sprintOwnerUserId:
      typeof row.sprint_owner_user_id === 'string' ? row.sprint_owner_user_id : null,
    sprintEndDate: calculateSprintEndDateIso(row.sprint_start_date, row.sprint_number),
  };
}

async function loadSprintProactiveSnapshot(
  workspaceId: string,
  sprintId: string,
  db: QueryRunner
): Promise<SprintProactiveSnapshot | null> {
  const result = await db.query(
    `SELECT
       sprint.id AS sprint_id,
       sprint.title AS sprint_title,
       sprint.properties AS sprint_properties,
       program.id AS program_id,
       program_owner.id AS program_owner_user_id,
       sprint_owner_user.id AS sprint_owner_user_id
     FROM documents sprint
     LEFT JOIN document_associations program_assoc
       ON program_assoc.document_id = sprint.id
       AND program_assoc.relationship_type = 'program'
     LEFT JOIN documents program
       ON program.id = program_assoc.related_id
       AND program.document_type = 'program'
     LEFT JOIN users program_owner
       ON program.properties->>'owner_id' IS NOT NULL
       AND program_owner.id = COALESCE((program.properties->>'owner_id')::uuid, NULL)
     LEFT JOIN documents sprint_owner_person
       ON sprint.properties->>'owner_id' IS NOT NULL
       AND sprint_owner_person.id = (sprint.properties->>'owner_id')::uuid
       AND sprint_owner_person.document_type = 'person'
       AND sprint_owner_person.workspace_id = sprint.workspace_id
     LEFT JOIN users sprint_owner_user
       ON sprint_owner_person.properties->>'user_id' IS NOT NULL
       AND sprint_owner_user.id = (sprint_owner_person.properties->>'user_id')::uuid
     WHERE sprint.workspace_id = $1
       AND sprint.id = $2
       AND sprint.document_type = 'sprint'
     LIMIT 1`,
    [workspaceId, sprintId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const props = row.sprint_properties ?? {};

  return {
    sprintId: row.sprint_id,
    sprintTitle: row.sprint_title,
    sprintNumber: typeof props.sprint_number === 'number' ? props.sprint_number : null,
    sprintStatus: typeof props.status === 'string' ? props.status : null,
    sprintOwnerPersonId: typeof props.owner_id === 'string' ? props.owner_id : null,
    sprintOwnerUserId:
      typeof row.sprint_owner_user_id === 'string' ? row.sprint_owner_user_id : null,
    programId: typeof row.program_id === 'string' ? row.program_id : null,
    programOwnerUserId:
      typeof row.program_owner_user_id === 'string' ? row.program_owner_user_id : null,
    projectId: null,
    route: `/documents/${row.sprint_id}/issues`,
  };
}

function buildIssueEventPayload(
  snapshot: IssueProactiveSnapshot,
  input: EnqueueIssueMutationEventInput
): FleetGraphProactiveIssueEventPayload {
  const issue: FleetGraphProactiveIssueSnapshot = {
    id: snapshot.issueId,
    title: snapshot.issueTitle,
    ticketNumber: snapshot.ticketNumber,
    state: snapshot.issueState,
    assigneeId: snapshot.assigneeId,
    projectId: snapshot.projectId,
    projectTitle: snapshot.projectTitle,
    projectOwnerUserId: snapshot.projectOwnerUserId,
    sprintId: snapshot.sprintId,
    sprintTitle: snapshot.sprintTitle,
    sprintNumber: snapshot.sprintNumber,
    sprintStatus: snapshot.sprintStatus,
    sprintSnapshotTakenAt: snapshot.sprintSnapshotTakenAt,
    sprintOwnerUserId: snapshot.sprintOwnerUserId,
    sprintEndDate: snapshot.sprintEndDate,
    route: snapshot.issueRoute,
  };

  return {
    issue,
    previous: input.previous,
    actorId: input.actorId,
    occurredAt: new Date().toISOString(),
  };
}

function buildIssueIterationEventPayload(
  snapshot: IssueProactiveSnapshot,
  input: EnqueueIssueIterationEventInput
): FleetGraphProactiveIssueIterationEventPayload {
  return {
    issue: {
      id: snapshot.issueId,
      title: snapshot.issueTitle,
      ticketNumber: snapshot.ticketNumber,
      state: snapshot.issueState,
      assigneeId: snapshot.assigneeId,
      projectId: snapshot.projectId,
      projectTitle: snapshot.projectTitle,
      projectOwnerUserId: snapshot.projectOwnerUserId,
      sprintId: snapshot.sprintId,
      sprintTitle: snapshot.sprintTitle,
      sprintNumber: snapshot.sprintNumber,
      sprintStatus: snapshot.sprintStatus,
      sprintSnapshotTakenAt: snapshot.sprintSnapshotTakenAt,
      sprintOwnerUserId: snapshot.sprintOwnerUserId,
      sprintEndDate: snapshot.sprintEndDate,
      route: snapshot.issueRoute,
    },
    iteration: {
      id: input.iteration.id,
      status: input.iteration.status,
      blockersEncountered: input.iteration.blockersEncountered,
      authorId: input.iteration.authorId,
      authorName: input.iteration.authorName,
    },
    actorId: input.actorId,
    occurredAt: new Date().toISOString(),
  };
}

function buildSprintEventPayload(
  snapshot: SprintProactiveSnapshot,
  input: EnqueueSprintMutationEventInput
): FleetGraphProactiveSprintEventPayload {
  const sprint: FleetGraphProactiveSprintSnapshot = {
    id: snapshot.sprintId,
    title: snapshot.sprintTitle,
    sprintNumber: snapshot.sprintNumber,
    status: snapshot.sprintStatus,
    ownerPersonId: snapshot.sprintOwnerPersonId,
    ownerUserId: snapshot.sprintOwnerUserId,
    projectId: snapshot.projectId,
    programId: snapshot.programId,
    programOwnerUserId: snapshot.programOwnerUserId,
    route: snapshot.route,
  };

  return {
    sprint,
    previous: input.previous,
    actorId: input.actorId,
    occurredAt: new Date().toISOString(),
  };
}

function buildSprintApprovalEventPayload(
  snapshot: SprintProactiveSnapshot,
  input: EnqueueSprintApprovalEventInput
): FleetGraphProactiveSprintApprovalEventPayload {
  return {
    sprint: {
      id: snapshot.sprintId,
      title: snapshot.sprintTitle,
      sprintNumber: snapshot.sprintNumber,
      status: snapshot.sprintStatus,
      ownerPersonId: snapshot.sprintOwnerPersonId,
      ownerUserId: snapshot.sprintOwnerUserId,
      projectId: snapshot.projectId,
      programId: snapshot.programId,
      programOwnerUserId: snapshot.programOwnerUserId,
      route: snapshot.route,
    },
    approval: {
      kind: input.eventKind === 'sprint_plan_changes_requested' ? 'plan' : 'review',
      previousState: input.approval.previousState,
      nextState: 'changes_requested',
      feedback: input.approval.feedback,
      requestedByUserId: input.approval.requestedByUserId,
    },
    actorId: input.actorId,
    occurredAt: new Date().toISOString(),
  };
}

function formatBlockerSummary(blockerText: string | null): string | null {
  if (!blockerText) {
    return null;
  }

  const trimmed = blockerText.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= 140) {
    return trimmed;
  }

  return `${trimmed.slice(0, 137).trimEnd()}...`;
}

function evaluateIssueTriggerMatches(
  workspaceId: string,
  event: FleetGraphProactiveEventRecord
): FleetGraphProactiveTriggerMatch[] {
  const payload = event.payload as FleetGraphProactiveIssueEventPayload;
  const issue = payload.issue;
  const matches: FleetGraphProactiveTriggerMatch[] = [];
  const issueLabel = buildIssueLabel(issue);
  const sprintLabel = issue.sprintTitle ?? (issue.sprintNumber ? `Week ${issue.sprintNumber}` : 'the sprint');
  const activeSprint = issue.sprintId && issue.sprintStatus === 'active';

  if (activeSprint && isOpenIssue(issue.state) && !issue.assigneeId) {
    matches.push({
      triggerKind: 'issue_unassigned_in_active_sprint',
      summary: `${issueLabel} is in ${sprintLabel} with no assignee.`,
      severity: isOnOrAfterSprintLastDay(issue.sprintEndDate, payload.occurredAt) ? 'action' : 'warning',
      route: issue.route,
      weekId: issue.sprintId,
      projectId: issue.projectId,
      programId: null,
      targetUserId: issue.sprintOwnerUserId ?? issue.projectOwnerUserId,
      signalKinds: ['issue_unassigned_in_active_sprint'],
      payload: {
        workspaceId,
        issueId: issue.id,
        sprintId: issue.sprintId,
        assigneeId: issue.assigneeId,
        sprintTitle: sprintLabel,
      },
    });
  }

  if (activeSprint && isOpenIssue(issue.state) && !issue.projectId) {
    matches.push({
      triggerKind: 'issue_missing_project_context_in_active_sprint',
      summary: `${issueLabel} is in ${sprintLabel} but is not linked to a project yet.`,
      severity: 'warning',
      route: issue.route,
      weekId: issue.sprintId,
      projectId: issue.projectId,
      programId: null,
      targetUserId: issue.sprintOwnerUserId,
      signalKinds: ['issue_missing_project_context_in_active_sprint'],
      payload: {
        workspaceId,
        issueId: issue.id,
        sprintId: issue.sprintId,
      },
    });
  }

  if (
    activeSprint &&
    issue.sprintSnapshotTakenAt &&
    issue.sprintId !== null &&
    payload.previous.sprintId !== issue.sprintId
  ) {
    matches.push({
      triggerKind: 'issue_added_after_sprint_start',
      summary: `${issueLabel} was added to ${sprintLabel} after the sprint already started.`,
      severity: 'warning',
      route: `/documents/${issue.sprintId}/issues`,
      weekId: issue.sprintId,
      projectId: issue.projectId,
      programId: null,
      targetUserId: issue.sprintOwnerUserId ?? issue.projectOwnerUserId,
      signalKinds: ['issue_added_after_sprint_start'],
      payload: {
        workspaceId,
        issueId: issue.id,
        sprintId: issue.sprintId,
        sprintSnapshotTakenAt: issue.sprintSnapshotTakenAt,
      },
    });
  }

  if (activeSprint && isOpenIssue(issue.state) && isOnOrAfterSprintLastDay(issue.sprintEndDate, payload.occurredAt)) {
    matches.push({
      triggerKind: 'issue_open_on_last_sprint_day',
      summary: `${issueLabel} is still open on the last day of ${sprintLabel}.`,
      severity: 'action',
      route: issue.route,
      weekId: issue.sprintId,
      projectId: issue.projectId,
      programId: null,
      targetUserId: issue.assigneeId ?? issue.sprintOwnerUserId ?? issue.projectOwnerUserId,
      signalKinds: ['issue_open_on_last_sprint_day'],
      payload: {
        workspaceId,
        issueId: issue.id,
        state: issue.state,
        sprintId: issue.sprintId,
        sprintEndDate: issue.sprintEndDate,
      },
    });
  }

  if (payload.previous.state === 'done' && isOpenIssue(issue.state)) {
    matches.push({
      triggerKind: 'issue_reopened_after_done',
      summary: `${issueLabel} was reopened after being marked done.`,
      severity: activeSprint ? 'action' : 'warning',
      route: issue.route,
      weekId: issue.sprintId,
      projectId: issue.projectId,
      programId: null,
      targetUserId: issue.assigneeId ?? issue.sprintOwnerUserId ?? issue.projectOwnerUserId,
      signalKinds: ['issue_reopened_after_done'],
      payload: {
        workspaceId,
        issueId: issue.id,
        previousState: payload.previous.state,
        currentState: issue.state,
      },
    });
  }

  return matches;
}

function evaluateIssueIterationTriggerMatches(
  workspaceId: string,
  event: FleetGraphProactiveEventRecord
): FleetGraphProactiveTriggerMatch[] {
  const payload = event.payload as FleetGraphProactiveIssueIterationEventPayload;
  const issue = payload.issue;
  const blockerSummary = formatBlockerSummary(payload.iteration.blockersEncountered);

  if (!issue.sprintId || issue.sprintStatus !== 'active' || !isOpenIssue(issue.state) || !blockerSummary) {
    return [];
  }

  const issueLabel = buildIssueLabel(issue);
  const sprintLabel = issue.sprintTitle ?? (issue.sprintNumber ? `Week ${issue.sprintNumber}` : 'the sprint');
  const authorLine = payload.iteration.authorName
    ? ` ${payload.iteration.authorName} logged the blocker on the latest issue update.`
    : '';

  return [
    {
      triggerKind: 'issue_blocker_logged',
      summary: `${issueLabel} logged a blocker in ${sprintLabel}: ${blockerSummary}.${authorLine}`,
      severity: isOnOrAfterSprintLastDay(issue.sprintEndDate, payload.occurredAt) ? 'action' : 'warning',
      route: issue.route,
      weekId: issue.sprintId,
      projectId: issue.projectId,
      programId: null,
      targetUserId: issue.sprintOwnerUserId ?? issue.projectOwnerUserId ?? issue.assigneeId,
      signalKinds: ['issue_blocker_logged'],
      payload: {
        workspaceId,
        issueId: issue.id,
        sprintId: issue.sprintId,
        blockerSummary,
        iterationStatus: payload.iteration.status,
        iterationAuthorId: payload.iteration.authorId,
      },
    },
  ];
}

function evaluateSprintTriggerMatches(
  workspaceId: string,
  event: FleetGraphProactiveEventRecord
): FleetGraphProactiveTriggerMatch[] {
  const payload = event.payload as FleetGraphProactiveSprintEventPayload;
  const sprint = payload.sprint;

  if (sprint.status !== 'active' || sprint.ownerUserId) {
    return [];
  }

  return [
    {
      triggerKind: 'sprint_active_without_owner',
      summary: `${sprint.title} is active but has no owner assigned.`,
      severity: 'action',
      route: sprint.route,
      weekId: sprint.id,
      projectId: sprint.projectId,
      programId: sprint.programId,
      targetUserId: sprint.programOwnerUserId ?? payload.actorId,
      signalKinds: ['sprint_active_without_owner'],
      payload: {
        workspaceId,
        sprintId: sprint.id,
        sprintNumber: sprint.sprintNumber,
      },
    },
  ];
}

function evaluateSprintApprovalTriggerMatches(
  workspaceId: string,
  event: FleetGraphProactiveEventRecord
): FleetGraphProactiveTriggerMatch[] {
  const payload = event.payload as FleetGraphProactiveSprintApprovalEventPayload;
  const sprint = payload.sprint;
  const approvalLabel = payload.approval.kind === 'plan' ? 'plan' : 'review';
  const triggerKind =
    payload.approval.kind === 'plan'
      ? 'sprint_plan_changes_requested'
      : 'sprint_review_changes_requested';

  return [
    {
      triggerKind,
      summary: `${sprint.title} ${approvalLabel} now has changes requested and needs an owner follow-up.${payload.approval.feedback ? ` Feedback: ${formatBlockerSummary(payload.approval.feedback)}.` : ''}`,
      severity: 'warning',
      route: sprint.route,
      weekId: sprint.id,
      projectId: sprint.projectId,
      programId: sprint.programId,
      targetUserId: sprint.ownerUserId ?? sprint.programOwnerUserId ?? payload.actorId,
      signalKinds: [triggerKind],
      payload: {
        workspaceId,
        sprintId: sprint.id,
        approvalKind: payload.approval.kind,
        previousState: payload.approval.previousState,
        nextState: payload.approval.nextState,
      },
    },
  ];
}

export function evaluateFleetGraphProactiveEvent(
  event: FleetGraphProactiveEventRecord
): FleetGraphProactiveTriggerMatch[] {
  if (event.entityType === 'issue' && event.eventKind === 'issue_iteration_created') {
    return evaluateIssueIterationTriggerMatches(event.workspaceId, event);
  }

  if (event.entityType === 'issue') {
    return evaluateIssueTriggerMatches(event.workspaceId, event);
  }

  if (
    event.entityType === 'sprint' &&
    (event.eventKind === 'sprint_plan_changes_requested' ||
      event.eventKind === 'sprint_review_changes_requested')
  ) {
    return evaluateSprintApprovalTriggerMatches(event.workspaceId, event);
  }

  if (event.entityType === 'sprint') {
    return evaluateSprintTriggerMatches(event.workspaceId, event);
  }

  return [];
}

async function insertProactiveEvent(
  db: QueryRunner,
  input: {
    workspaceId: string;
    entityId: string;
    entityType: FleetGraphProactiveEventEntityType;
    eventKind: FleetGraphProactiveEventKind;
    route: string;
    payload:
      | FleetGraphProactiveIssueEventPayload
      | FleetGraphProactiveIssueIterationEventPayload
      | FleetGraphProactiveSprintEventPayload
      | FleetGraphProactiveSprintApprovalEventPayload;
  }
): Promise<FleetGraphProactiveEventRecord> {
  const result = await db.query(
    `INSERT INTO fleetgraph_proactive_events (
       id,
       workspace_id,
       entity_id,
       entity_type,
       event_kind,
       route,
       payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [
      randomUUID(),
      input.workspaceId,
      input.entityId,
      input.entityType,
      input.eventKind,
      input.route,
      JSON.stringify(input.payload),
    ]
  );

  return mapEventRow(result.rows[0] as Record<string, unknown>);
}

export async function enqueueFleetGraphIssueMutationEvent(
  input: EnqueueIssueMutationEventInput,
  db: QueryRunner = pool
): Promise<FleetGraphProactiveEventRecord | null> {
  const snapshot = await loadIssueProactiveSnapshot(input.workspaceId, input.issueId, db);
  if (!snapshot) {
    return null;
  }

  return insertProactiveEvent(db, {
    workspaceId: input.workspaceId,
    entityId: input.issueId,
    entityType: 'issue',
    eventKind: input.eventKind,
    route: snapshot.issueRoute,
    payload: buildIssueEventPayload(snapshot, input),
  });
}

export async function enqueueFleetGraphSprintMutationEvent(
  input: EnqueueSprintMutationEventInput,
  db: QueryRunner = pool
): Promise<FleetGraphProactiveEventRecord | null> {
  const snapshot = await loadSprintProactiveSnapshot(input.workspaceId, input.sprintId, db);
  if (!snapshot) {
    return null;
  }

  return insertProactiveEvent(db, {
    workspaceId: input.workspaceId,
    entityId: input.sprintId,
    entityType: 'sprint',
    eventKind: input.eventKind,
    route: snapshot.route,
    payload: buildSprintEventPayload(snapshot, input),
  });
}

export async function enqueueFleetGraphIssueIterationEvent(
  input: EnqueueIssueIterationEventInput,
  db: QueryRunner = pool
): Promise<FleetGraphProactiveEventRecord | null> {
  const snapshot = await loadIssueProactiveSnapshot(input.workspaceId, input.issueId, db);
  if (!snapshot) {
    return null;
  }

  return insertProactiveEvent(db, {
    workspaceId: input.workspaceId,
    entityId: input.issueId,
    entityType: 'issue',
    eventKind: 'issue_iteration_created',
    route: snapshot.issueRoute,
    payload: buildIssueIterationEventPayload(snapshot, input),
  });
}

export async function enqueueFleetGraphSprintApprovalEvent(
  input: EnqueueSprintApprovalEventInput,
  db: QueryRunner = pool
): Promise<FleetGraphProactiveEventRecord | null> {
  const snapshot = await loadSprintProactiveSnapshot(input.workspaceId, input.sprintId, db);
  if (!snapshot) {
    return null;
  }

  return insertProactiveEvent(db, {
    workspaceId: input.workspaceId,
    entityId: input.sprintId,
    entityType: 'sprint',
    eventKind: input.eventKind,
    route: snapshot.route,
    payload: buildSprintApprovalEventPayload(snapshot, input),
  });
}

async function claimPendingEvents(limit: number, db: QueryRunner = pool): Promise<FleetGraphProactiveEventRecord[]> {
  const result = await db.query(
    `WITH next_events AS (
       SELECT id
       FROM fleetgraph_proactive_events
       WHERE processing_status = 'pending'
         AND processed_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE fleetgraph_proactive_events event
     SET processing_status = 'processing',
         processing_started_at = NOW()
     FROM next_events
     WHERE event.id = next_events.id
     RETURNING event.*`,
    [limit]
  );

  return result.rows.map((row) => mapEventRow(row as Record<string, unknown>));
}

async function finalizeEvent(
  eventId: string,
  input: {
    status: FleetGraphProactiveEventRecord['processingStatus'];
    matchedTriggerKinds: FleetGraphProactiveTriggerKind[];
    findingsCreated: number;
    errorMessage?: string | null;
  },
  db: QueryRunner = pool
): Promise<void> {
  await db.query(
    `UPDATE fleetgraph_proactive_events
     SET processing_status = $2,
         matched_trigger_kinds = $3::text[],
         findings_created = $4,
         error_message = $5,
         processed_at = NOW()
     WHERE id = $1`,
    [eventId, input.status, input.matchedTriggerKinds, input.findingsCreated, input.errorMessage ?? null]
  );
}

export async function processPendingFleetGraphProactiveEvents(options?: {
  limit?: number;
  logger?: FleetGraphLogger;
}): Promise<ProactiveEventProcessingResult> {
  const logger = getEventLogger(options?.logger);
  const limit = options?.limit ?? 25;

  if (eventDrainRunning) {
    logger.warn('Skipping overlapping FleetGraph proactive event drain');
    return {
      processedEvents: 0,
      matchedTriggers: 0,
      findingsCreated: 0,
    };
  }

  eventDrainRunning = true;

  try {
    const events = await claimPendingEvents(limit);
    let matchedTriggers = 0;
    let findingsCreated = 0;

    for (const event of events) {
      try {
        const matches = evaluateFleetGraphProactiveEvent(event);
        matchedTriggers += matches.length;

        if (matches.length === 0) {
          await finalizeEvent(event.id, {
            status: 'ignored',
            matchedTriggerKinds: [],
            findingsCreated: 0,
          });
          continue;
        }

        let eventFindingsCreated = 0;

        for (const match of matches) {
          if (!match.targetUserId || !match.weekId) {
            continue;
          }

          const persisted = await persistFleetGraphProactiveFinding({
            workspaceId: event.workspaceId,
            weekId: match.weekId,
            projectId: match.projectId,
            programId: match.programId,
            targetUserId: match.targetUserId,
            title: null,
            summary: match.summary,
            severity: match.severity,
            route: match.route,
            surface: 'document',
            tab: 'issues',
            signalKinds: match.signalKinds,
            signalSignature: `${match.weekId}:${match.triggerKind}:${event.entityId}`,
            payload: match.payload,
            now: new Date(),
            cooldownMs: 30 * 60 * 1000,
          });

          eventFindingsCreated += 1;

          if (persisted.shouldNotify) {
            broadcastToUser(
              match.targetUserId,
              'fleetgraph:finding',
              persisted.finding as unknown as Record<string, unknown>
            );
          }
        }

        findingsCreated += eventFindingsCreated;

        await finalizeEvent(event.id, {
          status: eventFindingsCreated > 0 ? 'processed' : 'ignored',
          matchedTriggerKinds: matches.map((match) => match.triggerKind),
          findingsCreated: eventFindingsCreated,
        });
      } catch (error) {
        logger.error('FleetGraph proactive event processing failed', {
          eventId: event.id,
          message: error instanceof Error ? error.message : 'Unknown proactive event failure',
        });

        await finalizeEvent(event.id, {
          status: 'failed',
          matchedTriggerKinds: [],
          findingsCreated: 0,
          errorMessage: error instanceof Error ? error.message : 'Unknown proactive event failure',
        });
      }
    }

    return {
      processedEvents: events.length,
      matchedTriggers,
      findingsCreated,
    };
  } finally {
    eventDrainRunning = false;
  }
}

export function scheduleFleetGraphProactiveEventProcessing(logger?: FleetGraphLogger): void {
  if (eventDrainScheduled) {
    return;
  }

  eventDrainScheduled = true;
  setTimeout(() => {
    eventDrainScheduled = false;
    void processPendingFleetGraphProactiveEvents({ logger }).catch((error) => {
      getEventLogger(logger).error('FleetGraph proactive event drain crashed', {
        message: error instanceof Error ? error.message : 'Unknown proactive event crash',
      });
    });
  }, 0).unref();
}
