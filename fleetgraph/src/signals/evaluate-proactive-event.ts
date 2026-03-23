import type {
  FleetGraphProactiveEventRecord,
  FleetGraphProactiveIssueEventPayload,
  FleetGraphProactiveIssueIterationEventPayload,
  FleetGraphProactiveSprintApprovalEventPayload,
  FleetGraphProactiveSprintEventPayload,
  FleetGraphProactiveTriggerMatch,
} from '@ship/shared';
import type { FleetGraphDerivedSignal } from '../types.js';

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

function formatNarrativeSummary(text: string | null): string | null {
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  const trimmed = normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;
  if (trimmed.length <= 140) {
    return trimmed;
  }

  return `${trimmed.slice(0, 137).trimEnd()}...`;
}

function evaluateIssueTriggerMatches(
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
        workspaceId: event.workspaceId,
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
        workspaceId: event.workspaceId,
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
        workspaceId: event.workspaceId,
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
        workspaceId: event.workspaceId,
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
        workspaceId: event.workspaceId,
        issueId: issue.id,
        previousState: payload.previous.state,
        currentState: issue.state,
      },
    });
  }

  return matches;
}

function evaluateIssueIterationTriggerMatches(
  event: FleetGraphProactiveEventRecord
): FleetGraphProactiveTriggerMatch[] {
  const payload = event.payload as FleetGraphProactiveIssueIterationEventPayload;
  const issue = payload.issue;
  const blockerSummary = formatNarrativeSummary(payload.iteration.blockersEncountered);

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
        workspaceId: event.workspaceId,
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
        workspaceId: event.workspaceId,
        sprintId: sprint.id,
        sprintNumber: sprint.sprintNumber,
      },
    },
  ];
}

function evaluateSprintApprovalTriggerMatches(
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
      summary: `${sprint.title} ${approvalLabel} now has changes requested and needs an owner follow-up.${payload.approval.feedback ? ` Feedback: ${formatNarrativeSummary(payload.approval.feedback)}.` : ''}`,
      severity: 'warning',
      route: sprint.route,
      weekId: sprint.id,
      projectId: sprint.projectId,
      programId: sprint.programId,
      targetUserId: sprint.ownerUserId ?? sprint.programOwnerUserId ?? payload.actorId,
      signalKinds: [triggerKind],
      payload: {
        workspaceId: event.workspaceId,
        sprintId: sprint.id,
        approvalKind: payload.approval.kind,
        previousState: payload.approval.previousState,
        nextState: payload.approval.nextState,
      },
    },
  ];
}

function buildSignalEvidence(match: FleetGraphProactiveTriggerMatch): string[] {
  const payload = match.payload;

  switch (match.triggerKind) {
    case 'issue_unassigned_in_active_sprint':
      return [
        match.summary,
        `Sprint id: ${String(payload.sprintId ?? 'unknown')}.`,
        'The issue is still open and no assignee is recorded.',
      ];
    case 'issue_missing_project_context_in_active_sprint':
      return [
        match.summary,
        `Sprint id: ${String(payload.sprintId ?? 'unknown')}.`,
        'The issue is active in sprint scope without project context.',
      ];
    case 'issue_added_after_sprint_start':
      return [
        match.summary,
        `Sprint id: ${String(payload.sprintId ?? 'unknown')}.`,
        `Sprint snapshot taken at: ${String(payload.sprintSnapshotTakenAt ?? 'unknown')}.`,
      ];
    case 'issue_open_on_last_sprint_day':
      return [
        match.summary,
        `Issue state: ${String(payload.state ?? 'unknown')}.`,
        `Sprint end date: ${String(payload.sprintEndDate ?? 'unknown')}.`,
      ];
    case 'issue_reopened_after_done':
      return [
        match.summary,
        `Previous issue state: ${String(payload.previousState ?? 'unknown')}.`,
        `Current issue state: ${String(payload.currentState ?? 'unknown')}.`,
      ];
    case 'issue_blocker_logged':
      return [
        match.summary,
        `Blocker summary: ${String(payload.blockerSummary ?? 'unknown')}.`,
        `Iteration status: ${String(payload.iterationStatus ?? 'unknown')}.`,
      ];
    case 'sprint_active_without_owner':
      return [
        match.summary,
        `Sprint number: ${String(payload.sprintNumber ?? 'unknown')}.`,
        'The sprint is active and no owner user is assigned.',
      ];
    case 'sprint_plan_changes_requested':
    case 'sprint_review_changes_requested':
      return [
        match.summary,
        `Approval kind: ${String(payload.approvalKind ?? 'unknown')}.`,
        `Approval state changed from ${String(payload.previousState ?? 'unknown')} to ${String(payload.nextState ?? 'unknown')}.`,
      ];
  }
}

function resolveMatchSubjectId(match: FleetGraphProactiveTriggerMatch): string {
  if (typeof match.payload.issueId === 'string' && match.payload.issueId.length > 0) {
    return match.payload.issueId;
  }

  if (typeof match.payload.sprintId === 'string' && match.payload.sprintId.length > 0) {
    return match.payload.sprintId;
  }

  return match.route;
}

export function evaluateFleetGraphProactiveEvent(
  event: FleetGraphProactiveEventRecord
): FleetGraphProactiveTriggerMatch[] {
  if (event.entityType === 'issue' && event.eventKind === 'issue_iteration_created') {
    return evaluateIssueIterationTriggerMatches(event);
  }

  if (event.entityType === 'issue') {
    return evaluateIssueTriggerMatches(event);
  }

  if (
    event.entityType === 'sprint' &&
    (event.eventKind === 'sprint_plan_changes_requested' ||
      event.eventKind === 'sprint_review_changes_requested')
  ) {
    return evaluateSprintApprovalTriggerMatches(event);
  }

  if (event.entityType === 'sprint') {
    return evaluateSprintTriggerMatches(event);
  }

  return [];
}

export function createFleetGraphDerivedSignalFromTriggerMatch(
  match: FleetGraphProactiveTriggerMatch
): FleetGraphDerivedSignal {
  const subjectId = resolveMatchSubjectId(match);

  return {
    kind: match.triggerKind as FleetGraphDerivedSignal['kind'],
    severity: match.severity,
    summary: match.summary,
    evidence: buildSignalEvidence(match),
    dedupeKey: `${match.weekId ?? 'event'}:${match.triggerKind}:${subjectId}`,
  };
}
