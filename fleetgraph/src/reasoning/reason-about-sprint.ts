import type { FleetGraphRuntimeContext } from '../runtime.js';
import type {
  FleetGraphActiveViewContext,
} from '@ship/shared';
import type {
  FleetGraphDerivedSignals,
  FleetGraphFetchedPayloads,
  FleetGraphFinding,
  FleetGraphReasoning,
} from '../types.js';

interface ReasonAboutSprintArgs {
  activeView: FleetGraphActiveViewContext | null;
  question: string | null;
  finding: FleetGraphFinding | null;
  fetched: FleetGraphFetchedPayloads;
  derivedSignals: FleetGraphDerivedSignals;
}

function buildStableSummary(
  fetched: FleetGraphFetchedPayloads,
  derivedSignals: FleetGraphDerivedSignals
): string {
  const sprintTitle = fetched.entity?.title ?? fetched.supporting?.current?.title ?? 'This sprint';
  const completed = derivedSignals.metrics.completedIssues;
  const total = derivedSignals.metrics.totalIssues;
  const inProgress = derivedSignals.metrics.inProgressIssues;

  return `${sprintTitle} looks stable right now. ${completed} of ${total} tracked issues are complete and ${inProgress} are in progress, with recent activity still visible in the sprint.`;
}

function buildReasoningFallback(args: ReasonAboutSprintArgs): FleetGraphReasoning {
  const { activeView, finding, fetched, derivedSignals } = args;
  const projectName = fetched.accountability?.project?.name ?? null;
  const routeLabel = activeView?.tab ? `${activeView.tab} tab` : 'current view';
  const hasSignals = derivedSignals.signals.length > 0;

  const summary = hasSignals
    ? (finding?.summary ?? derivedSignals.summary ?? 'FleetGraph sees sprint risk signals that need attention.')
    : buildStableSummary(fetched, derivedSignals);

  const evidence = hasSignals
    ? derivedSignals.signals.flatMap((signal) => signal.evidence).slice(0, 4)
    : [
        `Completed issues: ${derivedSignals.metrics.completedIssues} of ${derivedSignals.metrics.totalIssues}.`,
        `In-progress issues: ${derivedSignals.metrics.inProgressIssues}.`,
        `Standups logged: ${derivedSignals.metrics.standupCount}.`,
        `Recently active days: ${derivedSignals.metrics.recentActiveDays}.`,
      ];

  const whyNow = hasSignals
    ? `This matters now because you are looking at the ${routeLabel}${projectName ? ` for ${projectName}` : ''}, and the current execution signals point to sprint drift.`
    : `You are looking at the ${routeLabel}${projectName ? ` for ${projectName}` : ''}, and the current sprint evidence does not show a meaningful execution risk.`;

  let recommendedNextStep: string | null = null;
  if (hasSignals) {
    const kinds = new Set(derivedSignals.signals.map((signal) => signal.kind));
    if (kinds.has('missing_standup') || kinds.has('work_not_started')) {
      recommendedNextStep =
        'Get a same-day owner update, post a standup, and either move work into progress or reduce scope.';
    } else if (kinds.has('changes_requested_plan') || kinds.has('changes_requested_review')) {
      recommendedNextStep =
        'Address the requested plan or review changes before treating the sprint as settled.';
    } else if (kinds.has('missing_review')) {
      recommendedNextStep =
        'Capture the sprint review now so the team records what happened before the next week moves on.';
    } else {
      recommendedNextStep =
        'Confirm blockers, owners, and the smallest scope that can still finish cleanly this week.';
    }
  } else {
    recommendedNextStep =
      'Keep the current execution rhythm and close in-progress work before adding new scope.';
  }

  return {
    summary,
    evidence,
    whyNow,
    recommendedNextStep,
    confidence: hasSignals && derivedSignals.signals.length >= 2 ? 'high' : 'medium',
  };
}

export async function reasonAboutSprint(
  args: ReasonAboutSprintArgs,
  runtime: FleetGraphRuntimeContext
): Promise<FleetGraphReasoning> {
  if (runtime.reasoner) {
    try {
      const reasoning = await runtime.reasoner.reasonAboutSprint({
        activeViewRoute: args.activeView?.route ?? null,
        question: args.question,
        findingSummary: args.finding?.summary ?? args.derivedSignals.summary,
        derivedSignals: {
          severity: args.derivedSignals.severity,
          summary: args.derivedSignals.summary,
          reasons: args.derivedSignals.reasons,
          metrics: {
            ...args.derivedSignals.metrics,
          },
          signals: args.derivedSignals.signals.map((signal) => ({
            kind: signal.kind,
            severity: signal.severity,
            summary: signal.summary,
            evidence: signal.evidence,
          })),
        },
        fetched: {
          entity: args.fetched.entity,
          supporting: args.fetched.supporting,
          accountability: args.fetched.accountability,
          people: args.fetched.people,
        },
      });

      if (reasoning) {
        return reasoning;
      }
    } catch (error) {
      runtime.logger.warn('FleetGraph reasoning service failed; using deterministic fallback', {
        message: error instanceof Error ? error.message : 'Unknown reasoning failure',
      });
    }
  }

  return buildReasoningFallback(args);
}
