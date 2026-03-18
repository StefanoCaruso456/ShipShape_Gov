import { createHash } from 'crypto';
import type { FleetGraphActiveViewContext } from '@ship/shared';
import type {
  FleetGraphDerivedSignals,
  FleetGraphFetchedPayloads,
  FleetGraphProposedAction,
  FleetGraphReasoning,
} from '../types.js';

interface BuildSprintActionProposalArgs {
  activeView: FleetGraphActiveViewContext | null;
  weekId: string | null;
  fetched: FleetGraphFetchedPayloads;
  derivedSignals: FleetGraphDerivedSignals;
  reasoning: FleetGraphReasoning | null;
}

function buildTargetRoute(
  activeView: FleetGraphActiveViewContext | null,
  weekId: string
): string {
  if (activeView?.entity.type === 'week' && activeView.route.startsWith(`/documents/${weekId}`)) {
    return activeView.route;
  }

  return `/documents/${weekId}/issues`;
}

function buildFingerprint(weekId: string, type: FleetGraphProposedAction['type'], signalKinds: string[]): string {
  const digest = createHash('sha256')
    .update(`${weekId}:${type}:${[...signalKinds].sort().join('|')}`)
    .digest('hex');

  return `${weekId}:${type}:${digest.slice(0, 16)}`;
}

export function buildSprintActionProposal(
  args: BuildSprintActionProposalArgs
): FleetGraphProposedAction | null {
  const { weekId, fetched, derivedSignals, reasoning, activeView } = args;

  if (!weekId || derivedSignals.severity === 'none') {
    return null;
  }

  const sprintTitle = fetched.entity?.title ?? fetched.supporting?.current?.title ?? 'This sprint';
  const projectName = fetched.accountability?.project?.name ?? null;
  const signalKinds = derivedSignals.signals.map((signal) => signal.kind);
  const shouldEscalate =
    derivedSignals.severity === 'action' &&
    (signalKinds.includes('work_not_started') || signalKinds.includes('no_completed_work')) &&
    derivedSignals.metrics.recentActiveDays <= 1;

  const type: FleetGraphProposedAction['type'] = shouldEscalate
    ? 'draft_escalation_comment'
    : 'draft_follow_up_comment';

  const summary = shouldEscalate
    ? `Draft an escalation comment on ${sprintTitle} to force a same-day decision on scope, blockers, and ownership.`
    : `Draft a follow-up comment on ${sprintTitle} asking for a same-day status update and next checkpoint.`;

  const rationale =
    reasoning?.recommendedNextStep ??
    reasoning?.summary ??
    derivedSignals.summary ??
    'FleetGraph found sprint signals worth following up on.';

  const projectLine = projectName ? `Project: ${projectName}. ` : '';
  const draftComment = shouldEscalate
    ? `${projectLine}${sprintTitle} appears stalled based on the current evidence. Please confirm today whether the team should de-scope work, reassign ownership, or escalate a blocker, and identify the decision owner in this thread.`
    : `${projectLine}${sprintTitle} is showing risk signals from the current sprint evidence. Please post a short update today with blockers, owner status, and the next concrete checkpoint so the team can decide whether to keep or reduce scope.`;

  return {
    type,
    targetId: weekId,
    summary,
    rationale,
    draftComment,
    targetRoute: buildTargetRoute(activeView, weekId),
    fingerprint: buildFingerprint(weekId, type, signalKinds),
  };
}
