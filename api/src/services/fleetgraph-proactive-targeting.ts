import type {
  FleetGraphProactiveAudienceRole,
  FleetGraphProactiveAudienceScope,
  FleetGraphProactiveFinding,
  FleetGraphProactiveTriggerKind,
} from '@ship/shared';
import { pool } from '../db/client.js';

type QueryRunner = { query: typeof pool.query };

type FleetGraphFindingSeverity = FleetGraphProactiveFinding['severity'];

interface SprintAudienceContextRow {
  weekId: string;
  weekTitle: string;
  projectId: string | null;
  programId: string | null;
  weekOwnerUserId: string | null;
  weekManagerUserId: string | null;
  sprintTeamUserIds: string[];
}

interface ProjectAudienceContextRow {
  projectId: string;
  projectOwnerUserId: string | null;
  projectAccountableUserId: string | null;
}

interface ProgramAudienceContextRow {
  programId: string;
  programOwnerUserId: string | null;
  programAccountableUserId: string | null;
}

export interface FleetGraphAudienceContext {
  workspaceId: string;
  weekId: string;
  weekTitle: string;
  weekOwnerUserId: string | null;
  weekManagerUserId: string | null;
  projectId: string | null;
  projectOwnerUserId: string | null;
  projectAccountableUserId: string | null;
  programId: string | null;
  programOwnerUserId: string | null;
  programAccountableUserId: string | null;
  sprintTeamUserIds: string[];
}

export interface FleetGraphAudienceRecipient {
  userId: string;
  audienceRole: FleetGraphProactiveAudienceRole;
  audienceScope: FleetGraphProactiveAudienceScope;
  deliveryReason: string;
}

interface FleetGraphAudienceCandidate extends FleetGraphAudienceRecipient {
  priority: number;
}

interface ResolveSweepRecipientsInput {
  workspaceId: string;
  weekId: string;
  projectId: string | null;
  programId: string | null;
  severity: FleetGraphFindingSeverity;
  signalKinds: string[];
}

interface ResolveEventRecipientsInput {
  workspaceId: string;
  weekId: string;
  projectId: string | null;
  programId: string | null;
  severity: FleetGraphFindingSeverity;
  triggerKind: FleetGraphProactiveTriggerKind;
  signalKinds: string[];
  primaryUserId: string | null;
  issueAssigneeUserId?: string | null;
}

interface BuildSweepAudienceRecipientsInput {
  context: FleetGraphAudienceContext;
  severity: FleetGraphFindingSeverity;
  signalKinds: string[];
}

interface BuildEventAudienceRecipientsInput {
  context: FleetGraphAudienceContext;
  severity: FleetGraphFindingSeverity;
  triggerKind: FleetGraphProactiveTriggerKind;
  signalKinds: string[];
  primaryUserId: string | null;
  issueAssigneeUserId: string | null;
}

const UUID_LIKE_PATTERN = /^[0-9a-f-]{36}$/i;

const ROLE_PRIORITY: Record<FleetGraphProactiveAudienceRole, number> = {
  issue_assignee: 50,
  responsible_owner: 40,
  accountable: 30,
  manager: 20,
  team_member: 10,
};

const SIGNALS_FOR_ACCOUNTABLE = new Set([
  'changes_requested_plan',
  'changes_requested_review',
  'scope_growth',
  'blocked_work',
  'dependency_risk',
  'throughput_gap',
  'staffing_pressure',
  'workload_concentration',
  'work_not_started',
  'low_recent_activity',
  'missing_review',
]);

const SIGNALS_FOR_MANAGER = new Set([
  'work_not_started',
  'low_recent_activity',
  'blocked_work',
  'dependency_risk',
  'throughput_gap',
  'staffing_pressure',
]);

const SIGNALS_FOR_TEAM = new Set([
  'changes_requested_plan',
  'changes_requested_review',
  'scope_growth',
  'blocked_work',
  'dependency_risk',
  'throughput_gap',
  'staffing_pressure',
  'workload_concentration',
]);

const TRIGGERS_FOR_ACCOUNTABLE = new Set<FleetGraphProactiveTriggerKind>([
  'issue_added_after_sprint_start',
  'issue_open_on_last_sprint_day',
  'issue_reopened_after_done',
  'issue_blocker_logged',
  'sprint_active_without_owner',
  'sprint_plan_changes_requested',
  'sprint_review_changes_requested',
]);

const TRIGGERS_FOR_MANAGER = new Set<FleetGraphProactiveTriggerKind>([
  'issue_open_on_last_sprint_day',
  'issue_reopened_after_done',
  'issue_blocker_logged',
]);

const TRIGGERS_FOR_TEAM = new Set<FleetGraphProactiveTriggerKind>([
  'issue_added_after_sprint_start',
  'issue_open_on_last_sprint_day',
  'issue_reopened_after_done',
  'issue_blocker_logged',
  'sprint_active_without_owner',
  'sprint_plan_changes_requested',
  'sprint_review_changes_requested',
]);

const DIRECT_ASSIGNEE_TRIGGERS = new Set<FleetGraphProactiveTriggerKind>([
  'issue_open_on_last_sprint_day',
  'issue_reopened_after_done',
  'issue_blocker_logged',
]);

const APPROVAL_KINDS = new Set([
  'changes_requested_plan',
  'changes_requested_review',
  'sprint_plan_changes_requested',
  'sprint_review_changes_requested',
]);

const COORDINATION_KINDS = new Set([
  'scope_growth',
  'blocked_work',
  'dependency_risk',
  'throughput_gap',
  'staffing_pressure',
  'workload_concentration',
  'issue_added_after_sprint_start',
  'issue_open_on_last_sprint_day',
  'issue_reopened_after_done',
  'issue_blocker_logged',
]);

const OWNERSHIP_GAP_KINDS = new Set([
  'issue_unassigned_in_active_sprint',
  'issue_missing_project_context_in_active_sprint',
  'sprint_active_without_owner',
]);

const STALLED_KINDS = new Set([
  'work_not_started',
  'low_recent_activity',
  'no_completed_work',
]);

function isUuidLike(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_LIKE_PATTERN.test(value);
}

function includesAny(values: string[], candidates: Set<string>): boolean {
  return values.some((value) => candidates.has(value));
}

function pushCandidate(
  candidates: FleetGraphAudienceCandidate[],
  userId: string | null | undefined,
  audienceRole: FleetGraphProactiveAudienceRole,
  audienceScope: FleetGraphProactiveAudienceScope,
  deliveryReason: string
): void {
  if (!isUuidLike(userId)) {
    return;
  }

  candidates.push({
    userId,
    audienceRole,
    audienceScope,
    deliveryReason,
    priority: ROLE_PRIORITY[audienceRole] ?? 0,
  });
}

function normalizeAudienceRecipients(
  recipients: FleetGraphAudienceCandidate[]
): FleetGraphAudienceRecipient[] {
  const deduped = new Map<string, FleetGraphAudienceCandidate>();

  for (const recipient of recipients) {
    const existing = deduped.get(recipient.userId);
    if (!existing || recipient.priority > existing.priority) {
      deduped.set(recipient.userId, recipient);
    }
  }

  return [...deduped.values()]
    .sort((left, right) => right.priority - left.priority || left.userId.localeCompare(right.userId))
    .map(({ priority: _priority, ...recipient }) => recipient);
}

function describeResponsibleOwnerReason(kinds: string[]): string {
  if (includesAny(kinds, APPROVAL_KINDS)) {
    return 'Sent to you because you own the follow-up that the approval feedback now requires.';
  }

  if (includesAny(kinds, OWNERSHIP_GAP_KINDS)) {
    return 'Sent to you because you own the sprint or workstream that needs a clear coordinator.';
  }

  if (includesAny(kinds, COORDINATION_KINDS)) {
    return 'Sent to you because you own the sprint or workstream that needs coordination next.';
  }

  if (includesAny(kinds, STALLED_KINDS)) {
    return 'Sent to you because you own the sprint or workstream that appears stalled.';
  }

  return 'Sent to you because you own the sprint or workstream that needs follow-up.';
}

function describeIssueAssigneeReason(triggerKind: FleetGraphProactiveTriggerKind): string {
  if (triggerKind === 'issue_blocker_logged') {
    return 'Sent to you because you are assigned to the blocked issue that needs an unblock.';
  }

  if (triggerKind === 'issue_open_on_last_sprint_day') {
    return 'Sent to you because your assigned issue is still open at sprint closeout time.';
  }

  if (triggerKind === 'issue_reopened_after_done') {
    return 'Sent to you because your assigned issue was reopened and needs renewed follow-up.';
  }

  return 'Sent to you because you are assigned to the issue that triggered this finding.';
}

function describeAccountableReason(kinds: string[]): string {
  if (includesAny(kinds, APPROVAL_KINDS)) {
    return 'Escalated to you as accountable because approval follow-up is needed.';
  }

  if (includesAny(kinds, OWNERSHIP_GAP_KINDS)) {
    return 'Escalated to you as accountable because the sprint is missing clear ownership.';
  }

  if (includesAny(kinds, COORDINATION_KINDS) || includesAny(kinds, STALLED_KINDS)) {
    return 'Escalated to you as accountable because this risk may need a tradeoff or unblock decision.';
  }

  return 'Escalated to you as accountable because this finding may need broader direction.';
}

function describeManagerReason(kinds: string[]): string {
  if (includesAny(kinds, APPROVAL_KINDS)) {
    return 'Escalated to you as the owner manager because follow-up support is needed after approval feedback.';
  }

  return 'Escalated to you as the owner manager because the sprint appears stalled or needs support.';
}

function describeTeamReason(kinds: string[]): string {
  if (includesAny(kinds, APPROVAL_KINDS)) {
    return 'Shared with the sprint team because approval feedback changes what the team needs to align on next.';
  }

  if (includesAny(kinds, OWNERSHIP_GAP_KINDS)) {
    return 'Shared with the sprint team because the sprint needs a clear coordination owner.';
  }

  if (includesAny(kinds, COORDINATION_KINDS)) {
    return 'Shared with the sprint team because this affects shared sprint coordination or commitments.';
  }

  return 'Shared with the sprint team because this affects shared sprint execution.';
}

async function loadSprintAudienceContext(
  workspaceId: string,
  weekId: string,
  db: QueryRunner
): Promise<SprintAudienceContextRow | null> {
  const result = await db.query(
    `SELECT
       sprint.id::text AS week_id,
       sprint.title AS week_title,
       project_assoc.related_id::text AS project_id,
       program_assoc.related_id::text AS program_id,
       week_owner.user_id AS week_owner_user_id,
       owner_person.properties->>'reports_to' AS week_manager_user_id,
       COALESCE(team_members.team_user_ids, ARRAY[]::text[]) AS sprint_team_user_ids
     FROM documents sprint
     LEFT JOIN document_associations project_assoc
       ON project_assoc.document_id = sprint.id
       AND project_assoc.relationship_type = 'project'
     LEFT JOIN document_associations program_assoc
       ON program_assoc.document_id = sprint.id
       AND program_assoc.relationship_type = 'program'
     LEFT JOIN LATERAL (
       SELECT COALESCE(
         (
           SELECT u.id::text
           FROM users u
           WHERE sprint.properties->>'owner_id' ~* '^[0-9a-f-]{36}$'
             AND u.id = (sprint.properties->>'owner_id')::uuid
           LIMIT 1
         ),
         (
           SELECT person.properties->>'user_id'
           FROM documents person
           WHERE sprint.properties->>'owner_id' ~* '^[0-9a-f-]{36}$'
             AND person.id = (sprint.properties->>'owner_id')::uuid
             AND person.document_type = 'person'
             AND person.workspace_id = sprint.workspace_id
             AND person.properties->>'user_id' ~* '^[0-9a-f-]{36}$'
           LIMIT 1
         ),
         (
           SELECT u.id::text
           FROM jsonb_array_elements_text(COALESCE(sprint.properties->'assignee_ids', '[]'::jsonb)) assignee(value)
           JOIN users u ON u.id::text = assignee.value
           LIMIT 1
         ),
         (
           SELECT person.properties->>'user_id'
           FROM jsonb_array_elements_text(COALESCE(sprint.properties->'assignee_ids', '[]'::jsonb)) assignee(value)
           JOIN documents person
             ON person.id::text = assignee.value
            AND person.document_type = 'person'
            AND person.workspace_id = sprint.workspace_id
           WHERE person.properties->>'user_id' ~* '^[0-9a-f-]{36}$'
           LIMIT 1
         )
       ) AS user_id
     ) week_owner ON TRUE
     LEFT JOIN documents owner_person
       ON owner_person.workspace_id = sprint.workspace_id
      AND owner_person.document_type = 'person'
      AND owner_person.properties->>'user_id' = week_owner.user_id
     LEFT JOIN LATERAL (
       SELECT ARRAY(
         SELECT DISTINCT candidate_user_id
         FROM (
           SELECT u.id::text AS candidate_user_id
           FROM jsonb_array_elements_text(COALESCE(sprint.properties->'assignee_ids', '[]'::jsonb)) assignee(value)
           JOIN users u ON u.id::text = assignee.value
           UNION
           SELECT person.properties->>'user_id' AS candidate_user_id
           FROM jsonb_array_elements_text(COALESCE(sprint.properties->'assignee_ids', '[]'::jsonb)) assignee(value)
           JOIN documents person
             ON person.id::text = assignee.value
            AND person.document_type = 'person'
            AND person.workspace_id = sprint.workspace_id
           WHERE person.properties->>'user_id' ~* '^[0-9a-f-]{36}$'
           UNION
           SELECT issue.properties->>'assignee_id' AS candidate_user_id
           FROM document_associations sprint_assoc
           JOIN documents issue
             ON issue.id = sprint_assoc.document_id
            AND issue.workspace_id = sprint.workspace_id
            AND issue.document_type = 'issue'
            AND issue.archived_at IS NULL
            AND issue.deleted_at IS NULL
           WHERE sprint_assoc.related_id = sprint.id
             AND sprint_assoc.relationship_type = 'sprint'
             AND issue.properties->>'assignee_id' ~* '^[0-9a-f-]{36}$'
         ) team_users
         WHERE candidate_user_id ~* '^[0-9a-f-]{36}$'
       ) AS team_user_ids
     ) team_members ON TRUE
     WHERE sprint.workspace_id = $1
       AND sprint.id = $2
       AND sprint.document_type = 'sprint'
     LIMIT 1`,
    [workspaceId, weekId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    weekId: String(row.week_id),
    weekTitle: String(row.week_title),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    programId: typeof row.program_id === 'string' ? row.program_id : null,
    weekOwnerUserId: typeof row.week_owner_user_id === 'string' ? row.week_owner_user_id : null,
    weekManagerUserId:
      typeof row.week_manager_user_id === 'string' ? row.week_manager_user_id : null,
    sprintTeamUserIds: Array.isArray(row.sprint_team_user_ids)
      ? (row.sprint_team_user_ids as unknown[]).filter(
          (userId): userId is string => typeof userId === 'string'
        )
      : [],
  };
}

async function loadProjectAudienceContext(
  workspaceId: string,
  projectId: string,
  db: QueryRunner
): Promise<ProjectAudienceContextRow | null> {
  const result = await db.query(
    `SELECT
       id::text AS project_id,
       CASE
         WHEN properties->>'owner_id' ~* '^[0-9a-f-]{36}$'
           THEN properties->>'owner_id'
         ELSE NULL
       END AS project_owner_user_id,
       CASE
         WHEN properties->>'accountable_id' ~* '^[0-9a-f-]{36}$'
           THEN properties->>'accountable_id'
         ELSE NULL
       END AS project_accountable_user_id
     FROM documents
     WHERE workspace_id = $1
       AND id = $2
       AND document_type = 'project'
     LIMIT 1`,
    [workspaceId, projectId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    projectId: String(row.project_id),
    projectOwnerUserId:
      typeof row.project_owner_user_id === 'string' ? row.project_owner_user_id : null,
    projectAccountableUserId:
      typeof row.project_accountable_user_id === 'string'
        ? row.project_accountable_user_id
        : null,
  };
}

async function loadProgramAudienceContext(
  workspaceId: string,
  programId: string,
  db: QueryRunner
): Promise<ProgramAudienceContextRow | null> {
  const result = await db.query(
    `SELECT
       id::text AS program_id,
       CASE
         WHEN properties->>'owner_id' ~* '^[0-9a-f-]{36}$'
           THEN properties->>'owner_id'
         ELSE NULL
       END AS program_owner_user_id,
       CASE
         WHEN properties->>'accountable_id' ~* '^[0-9a-f-]{36}$'
           THEN properties->>'accountable_id'
         ELSE NULL
       END AS program_accountable_user_id
     FROM documents
     WHERE workspace_id = $1
       AND id = $2
       AND document_type = 'program'
     LIMIT 1`,
    [workspaceId, programId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    programId: String(row.program_id),
    programOwnerUserId:
      typeof row.program_owner_user_id === 'string' ? row.program_owner_user_id : null,
    programAccountableUserId:
      typeof row.program_accountable_user_id === 'string'
        ? row.program_accountable_user_id
        : null,
  };
}

async function loadFleetGraphAudienceContext(
  workspaceId: string,
  weekId: string,
  projectId: string | null,
  programId: string | null,
  db: QueryRunner = pool
): Promise<FleetGraphAudienceContext | null> {
  const sprintContext = await loadSprintAudienceContext(workspaceId, weekId, db);
  if (!sprintContext) {
    return null;
  }

  const resolvedProjectId = sprintContext.projectId ?? projectId;
  const resolvedProgramId = sprintContext.programId ?? programId;

  const projectContext = resolvedProjectId
    ? await loadProjectAudienceContext(workspaceId, resolvedProjectId, db)
    : null;
  const programContext = resolvedProgramId
    ? await loadProgramAudienceContext(workspaceId, resolvedProgramId, db)
    : null;

  return {
    workspaceId,
    weekId: sprintContext.weekId,
    weekTitle: sprintContext.weekTitle,
    weekOwnerUserId: sprintContext.weekOwnerUserId,
    weekManagerUserId: sprintContext.weekManagerUserId,
    projectId: projectContext?.projectId ?? resolvedProjectId,
    projectOwnerUserId: projectContext?.projectOwnerUserId ?? null,
    projectAccountableUserId: projectContext?.projectAccountableUserId ?? null,
    programId: programContext?.programId ?? resolvedProgramId,
    programOwnerUserId: programContext?.programOwnerUserId ?? null,
    programAccountableUserId: programContext?.programAccountableUserId ?? null,
    sprintTeamUserIds: sprintContext.sprintTeamUserIds,
  };
}

async function filterToValidUserRecipients(
  recipients: FleetGraphAudienceRecipient[],
  db: QueryRunner = pool
): Promise<FleetGraphAudienceRecipient[]> {
  const candidateUserIds = recipients
    .map((recipient) => recipient.userId)
    .filter((userId): userId is string => isUuidLike(userId));

  if (candidateUserIds.length === 0) {
    return [];
  }

  const result = await db.query(
    `SELECT id::text AS id
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [candidateUserIds]
  );

  const validUserIds = new Set(
    result.rows
      .map((row) => (typeof row.id === 'string' ? row.id : null))
      .filter((userId): userId is string => userId !== null)
  );

  return recipients.filter((recipient) => validUserIds.has(recipient.userId));
}

export function buildSweepAudienceRecipients(
  input: BuildSweepAudienceRecipientsInput
): FleetGraphAudienceRecipient[] {
  const { context, severity, signalKinds } = input;
  const recipients: FleetGraphAudienceCandidate[] = [];
  const primaryOwnerUserId =
    context.weekOwnerUserId ?? context.projectOwnerUserId ?? context.programOwnerUserId;
  const accountableUserId =
    context.projectAccountableUserId ?? context.programAccountableUserId ?? null;
  const teamReason = describeTeamReason(signalKinds);

  pushCandidate(
    recipients,
    primaryOwnerUserId,
    'responsible_owner',
    'individual',
    describeResponsibleOwnerReason(signalKinds)
  );

  if (includesAny(signalKinds, SIGNALS_FOR_ACCOUNTABLE)) {
    pushCandidate(
      recipients,
      accountableUserId,
      'accountable',
      'individual',
      describeAccountableReason(signalKinds)
    );
  }

  if (severity === 'action' && includesAny(signalKinds, SIGNALS_FOR_MANAGER)) {
    pushCandidate(
      recipients,
      context.weekManagerUserId,
      'manager',
      'individual',
      describeManagerReason(signalKinds)
    );
  }

  if (includesAny(signalKinds, SIGNALS_FOR_TEAM)) {
    for (const teamUserId of context.sprintTeamUserIds) {
      pushCandidate(recipients, teamUserId, 'team_member', 'team', teamReason);
    }
  }

  return normalizeAudienceRecipients(recipients);
}

export function buildEventAudienceRecipients(
  input: BuildEventAudienceRecipientsInput
): FleetGraphAudienceRecipient[] {
  const { context, severity, triggerKind, signalKinds, primaryUserId, issueAssigneeUserId } = input;
  const recipients: FleetGraphAudienceCandidate[] = [];
  const accountableUserId =
    context.projectAccountableUserId ?? context.programAccountableUserId ?? null;
  const effectivePrimaryUserId =
    primaryUserId ??
    issueAssigneeUserId ??
    context.weekOwnerUserId ??
    context.projectOwnerUserId ??
    context.programOwnerUserId;
  const primaryRole: FleetGraphProactiveAudienceRole =
    issueAssigneeUserId && effectivePrimaryUserId === issueAssigneeUserId && DIRECT_ASSIGNEE_TRIGGERS.has(triggerKind)
      ? 'issue_assignee'
      : 'responsible_owner';

  pushCandidate(
    recipients,
    effectivePrimaryUserId,
    primaryRole,
    'individual',
    primaryRole === 'issue_assignee'
      ? describeIssueAssigneeReason(triggerKind)
      : describeResponsibleOwnerReason(signalKinds)
  );

  if (TRIGGERS_FOR_ACCOUNTABLE.has(triggerKind)) {
    pushCandidate(
      recipients,
      accountableUserId,
      'accountable',
      'individual',
      describeAccountableReason(signalKinds)
    );
  }

  if (severity === 'action' && TRIGGERS_FOR_MANAGER.has(triggerKind)) {
    pushCandidate(
      recipients,
      context.weekManagerUserId,
      'manager',
      'individual',
      describeManagerReason(signalKinds)
    );
  }

  if (TRIGGERS_FOR_TEAM.has(triggerKind)) {
    const teamReason = describeTeamReason(signalKinds);
    for (const teamUserId of context.sprintTeamUserIds) {
      pushCandidate(recipients, teamUserId, 'team_member', 'team', teamReason);
    }
  }

  return normalizeAudienceRecipients(recipients);
}

export async function resolveFleetGraphSweepRecipients(
  input: ResolveSweepRecipientsInput,
  db: QueryRunner = pool
): Promise<FleetGraphAudienceRecipient[]> {
  const context = await loadFleetGraphAudienceContext(
    input.workspaceId,
    input.weekId,
    input.projectId,
    input.programId,
    db
  );

  if (!context) {
    return [];
  }

  return filterToValidUserRecipients(
    buildSweepAudienceRecipients({
      context,
      severity: input.severity,
      signalKinds: input.signalKinds,
    }),
    db
  );
}

export async function resolveFleetGraphEventRecipients(
  input: ResolveEventRecipientsInput,
  db: QueryRunner = pool
): Promise<FleetGraphAudienceRecipient[]> {
  const context = await loadFleetGraphAudienceContext(
    input.workspaceId,
    input.weekId,
    input.projectId,
    input.programId,
    db
  );

  if (!context) {
    return [];
  }

  return filterToValidUserRecipients(
    buildEventAudienceRecipients({
      context,
      severity: input.severity,
      triggerKind: input.triggerKind,
      signalKinds: input.signalKinds,
      primaryUserId: input.primaryUserId,
      issueAssigneeUserId: input.issueAssigneeUserId ?? null,
    }),
    db
  );
}
