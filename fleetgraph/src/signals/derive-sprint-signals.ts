import type { ApprovalTracking } from '@ship/shared';
import type {
  FleetGraphActivitySnapshot,
  FleetGraphPlanningSnapshot,
  FleetGraphDerivedSignal,
  FleetGraphDerivedSignals,
  FleetGraphSprintEntitySnapshot,
  FleetGraphSprintReviewContextSnapshot,
} from '../types.js';

const RECENT_ACTIVITY_WINDOW_DAYS = 3;
const SCOPE_GROWTH_WARNING_PERCENT = 20;
const SCOPE_GROWTH_ACTION_PERCENT = 40;
const WORKLOAD_CONCENTRATION_WARNING_SHARE = 0.5;
const DEPENDENCY_RISK_ACTION_ISSUES = 2;
const THROUGHPUT_GAP_WARNING_RATIO = 1.25;
const THROUGHPUT_GAP_ACTION_RATIO = 1.75;
const STAFFING_PRESSURE_WARNING_LOAD = 3;
const STAFFING_PRESSURE_ACTION_LOAD = 4;

type ApprovalKey = 'plan_approval' | 'review_approval';

function parseActivityDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function createSignal(
  sprintId: string,
  kind: FleetGraphDerivedSignal['kind'],
  severity: FleetGraphDerivedSignal['severity'],
  summary: string,
  evidence: string[]
): FleetGraphDerivedSignal {
  return {
    kind,
    severity,
    summary,
    evidence,
    dedupeKey: `${sprintId}:${kind}`,
  };
}

function getApprovalTracking(
  entity: FleetGraphSprintEntitySnapshot | null,
  key: ApprovalKey
): ApprovalTracking | null {
  const topLevel = entity?.[key] ?? null;
  if (topLevel) {
    return topLevel;
  }

  const fromProperties = entity?.properties[key];
  if (typeof fromProperties === 'object' && fromProperties !== null) {
    return fromProperties as ApprovalTracking;
  }

  return null;
}

function getRecentActivityMetrics(activity: FleetGraphActivitySnapshot | null, now: Date) {
  const windowStart = new Date(now);
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() - (RECENT_ACTIVITY_WINDOW_DAYS - 1));

  const recentDays =
    activity?.days.filter((day) => parseActivityDate(day.date).getTime() >= windowStart.getTime()) ?? [];

  return {
    recentActivityCount: recentDays.reduce((sum, day) => sum + day.count, 0),
    recentActiveDays: recentDays.filter((day) => day.count > 0).length,
  };
}

function summarizeSignals(signals: FleetGraphDerivedSignal[]): string | null {
  if (signals.length === 0) {
    return null;
  }

  const ordered = [...signals].sort((left, right) => {
    const rank = { action: 3, warning: 2, info: 1 };
    return rank[right.severity] - rank[left.severity];
  });

  const topSignals = ordered.slice(0, 3).map((signal) => signal.summary);
  return topSignals.join(' ');
}

function highestSeverity(
  signals: FleetGraphDerivedSignal[]
): FleetGraphDerivedSignals['severity'] {
  if (signals.some((signal) => signal.severity === 'action')) {
    return 'action';
  }

  if (signals.some((signal) => signal.severity === 'warning')) {
    return 'warning';
  }

  if (signals.some((signal) => signal.severity === 'info')) {
    return 'info';
  }

  return 'none';
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((total, value) => total + value, 0);
  return Number((sum / values.length).toFixed(2));
}

export function deriveSprintSignals(
  inputs: {
    entity: FleetGraphSprintEntitySnapshot | null;
    activity: FleetGraphActivitySnapshot | null;
    accountability: FleetGraphSprintReviewContextSnapshot | null;
    planning: FleetGraphPlanningSnapshot | null;
  },
  now: Date
): FleetGraphDerivedSignals {
  const sprintId = inputs.entity?.id ?? inputs.accountability?.sprint.id ?? 'unknown-sprint';
  const sprintStatus = inputs.entity?.status ?? inputs.accountability?.sprint.status ?? null;
  const issues = inputs.accountability?.issues;
  const stats = issues?.stats;

  const totalIssues = stats?.total ?? 0;
  const completedIssues = stats?.completed ?? 0;
  const inProgressIssues = stats?.in_progress ?? 0;
  const cancelledIssues = stats?.cancelled ?? 0;
  const blockedIssues =
    inputs.planning?.issues.filter((issue) => issue.state === 'blocked').length ?? 0;
  const dependencyRiskIssues = inputs.planning?.dependencySignals?.dependencyRiskIssues ?? null;
  const incompleteIssues =
    issues?.incomplete_items.length ??
    Math.max(totalIssues - completedIssues - cancelledIssues, 0);
  const standupCount = inputs.accountability?.standups.length ?? 0;
  const completionRate = totalIssues > 0 ? completedIssues / totalIssues : null;
  const scopeChangePercent =
    inputs.planning?.scopeChanges?.scopeChangePercent ??
    (stats?.planned_at_start && stats.planned_at_start > 0
      ? Math.round(((stats.added_mid_sprint ?? 0) / stats.planned_at_start) * 100)
      : null);
  const maxAssigneeLoadShare = inputs.planning?.workload?.maxIncompleteOwnerShare ?? null;
  const throughputWeeks = inputs.planning?.throughputHistory?.recentWeeks ?? [];
  const recentAverageCompletedIssues = average(
    throughputWeeks.map((week) => week.completed_count)
  );
  const recentAverageStartedIssues = average(
    throughputWeeks.map((week) => week.started_count)
  );
  const recentAverageTotalIssues = average(
    throughputWeeks.map((week) => week.issue_count)
  );
  const throughputSampleSize = throughputWeeks.length;
  const throughputLoadRatio =
    recentAverageCompletedIssues && recentAverageCompletedIssues > 0
      ? Number((incompleteIssues / recentAverageCompletedIssues).toFixed(2))
      : null;
  const allocatedPeopleCount = inputs.planning?.capacity?.allocatedPeopleCount ?? null;
  const incompleteIssuesPerAllocatedPerson =
    allocatedPeopleCount && allocatedPeopleCount > 0
      ? Number((incompleteIssues / allocatedPeopleCount).toFixed(2))
      : null;
  const { recentActivityCount, recentActiveDays } = getRecentActivityMetrics(inputs.activity, now);

  const metrics = {
    totalIssues,
    completedIssues,
    inProgressIssues,
    incompleteIssues,
    cancelledIssues,
    blockedIssues,
    dependencyRiskIssues,
    standupCount,
    recentActivityCount,
    recentActiveDays,
    completionRate,
    scopeChangePercent,
    maxAssigneeLoadShare,
    recentAverageCompletedIssues,
    recentAverageStartedIssues,
    recentAverageTotalIssues,
    throughputSampleSize,
    throughputLoadRatio,
    allocatedPeopleCount,
    incompleteIssuesPerAllocatedPerson,
  };

  const signals: FleetGraphDerivedSignal[] = [];
  const planApproval = getApprovalTracking(inputs.entity, 'plan_approval');
  const reviewApproval = getApprovalTracking(inputs.entity, 'review_approval');

  if (planApproval?.state === 'changes_requested') {
    signals.push(
      createSignal(
        sprintId,
        'changes_requested_plan',
        'action',
        'The sprint plan has changes requested and still needs revisions before it is ready.',
        [
          `Plan approval state is ${planApproval.state}.`,
          planApproval.feedback ? `Reviewer feedback: ${planApproval.feedback}` : 'No reviewer feedback was attached.',
        ]
      )
    );
  }

  if (reviewApproval?.state === 'changes_requested') {
    signals.push(
      createSignal(
        sprintId,
        'changes_requested_review',
        'action',
        'The sprint review has changes requested and still needs follow-up from the team.',
        [
          `Review approval state is ${reviewApproval.state}.`,
          reviewApproval.feedback
            ? `Reviewer feedback: ${reviewApproval.feedback}`
            : 'No reviewer feedback was attached.',
        ]
      )
    );
  }

  if (sprintStatus === 'active' && totalIssues > 0 && standupCount === 0) {
    signals.push(
      createSignal(
        sprintId,
        'missing_standup',
        'warning',
        'No standups have been logged for this active sprint yet.',
        [
          `Standup count is ${standupCount}.`,
          `Sprint has ${totalIssues} tracked issues.`,
        ]
      )
    );
  }

  if (sprintStatus === 'active' && totalIssues > 0 && completedIssues === 0) {
    signals.push(
      createSignal(
        sprintId,
        'no_completed_work',
        'warning',
        'The sprint has tracked work but nothing has been completed yet.',
        [
          `Completed issues: ${completedIssues} of ${totalIssues}.`,
          `In-progress issues: ${inProgressIssues}.`,
        ]
      )
    );
  }

  if (sprintStatus === 'active' && totalIssues > 0 && completedIssues === 0 && inProgressIssues === 0) {
    signals.push(
      createSignal(
        sprintId,
        'work_not_started',
        'action',
        'All sprint issues are still incomplete and none are marked in progress.',
        [
          `Incomplete issues: ${incompleteIssues} of ${totalIssues}.`,
          `Completed issues: ${completedIssues}.`,
        ]
      )
    );
  }

  if (sprintStatus === 'active' && totalIssues > 0 && recentActivityCount === 0) {
    signals.push(
      createSignal(
        sprintId,
        'low_recent_activity',
        'action',
        `No activity has been recorded in the last ${RECENT_ACTIVITY_WINDOW_DAYS} days for this active sprint.`,
        [
          `Recent activity count is ${recentActivityCount}.`,
          `Recent active days is ${recentActiveDays}.`,
        ]
      )
    );
  }

  if (
    sprintStatus === 'active' &&
    totalIssues > 0 &&
    scopeChangePercent !== null &&
    scopeChangePercent >= SCOPE_GROWTH_WARNING_PERCENT
  ) {
    const originalScope = inputs.planning?.scopeChanges?.originalScope ?? stats?.planned_at_start ?? 0;
    const currentScope = inputs.planning?.scopeChanges?.currentScope ?? totalIssues;

    signals.push(
      createSignal(
        sprintId,
        'scope_growth',
        scopeChangePercent >= SCOPE_GROWTH_ACTION_PERCENT ? 'action' : 'warning',
        `Sprint scope has grown ${scopeChangePercent}% since the week started.`,
        [
          `Original sprint scope: ${originalScope}.`,
          `Current sprint scope: ${currentScope}.`,
          stats?.added_mid_sprint
            ? `Issues added after start: ${stats.added_mid_sprint}.`
            : 'Sprint scope-change history shows work was added after start.',
        ]
      )
    );
  }

  if (sprintStatus === 'active' && blockedIssues > 0) {
    const blockedTitles = inputs.planning?.issues
      .filter((issue) => issue.state === 'blocked')
      .slice(0, 2)
      .map((issue) => issue.display_id ? `${issue.display_id} ${issue.title}` : issue.title) ?? [];

    signals.push(
      createSignal(
        sprintId,
        'blocked_work',
        blockedIssues >= 2 ? 'action' : 'warning',
        blockedIssues === 1
          ? 'There is blocked work in the current sprint.'
          : `${blockedIssues} sprint issues are currently blocked.`,
        [
          `Blocked issues: ${blockedIssues}.`,
          ...blockedTitles,
        ]
      )
    );
  }

  if (
    sprintStatus === 'active' &&
    dependencyRiskIssues !== null &&
    dependencyRiskIssues > 0
  ) {
    const dependencyEvidence = inputs.planning?.dependencySignals?.issues
      .slice(0, 2)
      .map((issue) => {
        const cueSummary = issue.dependencyCueReasons.slice(0, 2).join('; ');
        return `${issue.displayId} ${issue.title}: ${cueSummary}.`;
      }) ?? [];

    signals.push(
      createSignal(
        sprintId,
        'dependency_risk',
        dependencyRiskIssues >= DEPENDENCY_RISK_ACTION_ISSUES ? 'action' : 'warning',
        dependencyRiskIssues === 1
          ? 'A blocked sprint issue is waiting on another decision or work item.'
          : `${dependencyRiskIssues} blocked sprint issues show dependency-style blocker evidence.`,
        [
          `Blocked issues analyzed for dependency cues: ${inputs.planning?.dependencySignals?.blockedIssuesAnalyzed ?? 0}.`,
          `Blocked issues with dependency evidence: ${dependencyRiskIssues}.`,
          ...dependencyEvidence,
        ]
      )
    );
  }

  if (
    sprintStatus === 'active' &&
    incompleteIssues >= 4 &&
    maxAssigneeLoadShare !== null &&
    maxAssigneeLoadShare >= WORKLOAD_CONCENTRATION_WARNING_SHARE
  ) {
    const leadOwner = inputs.planning?.workload?.owners[0] ?? null;
    const sharePercent = Math.round(maxAssigneeLoadShare * 100);
    const leadOwnerLabel = leadOwner?.assigneeName ?? 'One assignee';

    signals.push(
      createSignal(
        sprintId,
        'workload_concentration',
        sharePercent >= 70 ? 'action' : 'warning',
        `${leadOwnerLabel} carries ${sharePercent}% of the incomplete sprint work.`,
        [
          `${leadOwnerLabel} owns ${leadOwner?.incompleteIssues ?? 0} incomplete issues.`,
          `Incomplete sprint issues: ${incompleteIssues}.`,
          `Unassigned issues: ${inputs.planning?.workload?.unassignedIssues ?? 0}.`,
        ]
      )
    );
  }

  if (
    sprintStatus === 'active' &&
    throughputSampleSize >= 2 &&
    throughputLoadRatio !== null &&
    throughputLoadRatio >= THROUGHPUT_GAP_WARNING_RATIO
  ) {
    signals.push(
      createSignal(
        sprintId,
        'throughput_gap',
        throughputLoadRatio >= THROUGHPUT_GAP_ACTION_RATIO ? 'action' : 'warning',
        `This sprint is carrying more unfinished work than the project typically finishes in a week.`,
        [
          `Current incomplete issues: ${incompleteIssues}.`,
          `Recent average completed issues: ${recentAverageCompletedIssues}.`,
          `Comparison uses ${throughputSampleSize} recent project weeks.`,
        ]
      )
    );
  }

  if (
    sprintStatus === 'active' &&
    allocatedPeopleCount !== null &&
    allocatedPeopleCount > 0 &&
    incompleteIssuesPerAllocatedPerson !== null &&
    incompleteIssues >= 6 &&
    incompleteIssuesPerAllocatedPerson >= STAFFING_PRESSURE_WARNING_LOAD
  ) {
    const allocatedNames = inputs.planning?.capacity?.allocatedPeople
      .slice(0, 3)
      .map((person) => person.name) ?? [];

    signals.push(
      createSignal(
        sprintId,
        'staffing_pressure',
        incompleteIssuesPerAllocatedPerson >= STAFFING_PRESSURE_ACTION_LOAD ? 'action' : 'warning',
        'The remaining sprint load looks heavy for the currently allocated team.',
        [
          `Allocated people this week: ${allocatedPeopleCount}.`,
          `Incomplete issues per allocated person: ${incompleteIssuesPerAllocatedPerson}.`,
          allocatedNames.length > 0
            ? `Current allocated team: ${allocatedNames.join(', ')}.`
            : 'Allocated team names were not available.',
        ]
      )
    );
  }

  if (sprintStatus === 'completed' && inputs.accountability?.existing_review === null) {
    signals.push(
      createSignal(
        sprintId,
        'missing_review',
        'warning',
        'The sprint is complete but the weekly review has not been submitted yet.',
        [
          'existing_review is null.',
          `Sprint status is ${sprintStatus}.`,
        ]
      )
    );
  }

  const severity = highestSeverity(signals);
  const reasons = signals.map((signal) => signal.summary);

  return {
    severity,
    reasons,
    summary: summarizeSignals(signals),
    shouldSurface: signals.length > 0,
    signals,
    metrics,
  };
}
