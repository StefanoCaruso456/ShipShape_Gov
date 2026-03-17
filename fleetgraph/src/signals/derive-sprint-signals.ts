import type { ApprovalTracking } from '@ship/shared';
import type {
  FleetGraphActivitySnapshot,
  FleetGraphDerivedSignal,
  FleetGraphDerivedSignals,
  FleetGraphSprintEntitySnapshot,
  FleetGraphSprintReviewContextSnapshot,
} from '../types.js';

const RECENT_ACTIVITY_WINDOW_DAYS = 3;

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

export function deriveSprintSignals(
  inputs: {
    entity: FleetGraphSprintEntitySnapshot | null;
    activity: FleetGraphActivitySnapshot | null;
    accountability: FleetGraphSprintReviewContextSnapshot | null;
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
  const incompleteIssues =
    issues?.incomplete_items.length ??
    Math.max(totalIssues - completedIssues - cancelledIssues, 0);
  const standupCount = inputs.accountability?.standups.length ?? 0;
  const completionRate = totalIssues > 0 ? completedIssues / totalIssues : null;
  const { recentActivityCount, recentActiveDays } = getRecentActivityMetrics(inputs.activity, now);

  const metrics = {
    totalIssues,
    completedIssues,
    inProgressIssues,
    incompleteIssues,
    cancelledIssues,
    standupCount,
    recentActivityCount,
    recentActiveDays,
    completionRate,
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
