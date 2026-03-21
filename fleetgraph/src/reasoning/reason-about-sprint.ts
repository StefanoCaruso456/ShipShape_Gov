import type { FleetGraphRuntimeContext } from '../runtime.js';
import type {
  FleetGraphActiveViewContext,
} from '@ship/shared';
import type {
  FleetGraphDerivedSignals,
  FleetGraphFetchedPayloads,
  FleetGraphFinding,
  FleetGraphReasoning,
  FleetGraphReasoningSource,
} from '../types.js';
import { inferFleetGraphQuestionTheme } from '../tool-runtime.js';

interface ReasonAboutSprintArgs {
  activeView: FleetGraphActiveViewContext | null;
  question: string | null;
  finding: FleetGraphFinding | null;
  fetched: FleetGraphFetchedPayloads;
  derivedSignals: FleetGraphDerivedSignals;
  forceDeterministic?: boolean;
}

export interface FleetGraphReasoningResult {
  reasoning: FleetGraphReasoning;
  source: FleetGraphReasoningSource;
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

function buildPlanningQuestionSummary(
  args: ReasonAboutSprintArgs,
  questionTheme: ReturnType<typeof inferFleetGraphQuestionTheme>
): Pick<FleetGraphReasoning, 'summary' | 'evidence' | 'recommendedNextStep'> | null {
  const { fetched, derivedSignals } = args;
  const planning = fetched.planning;
  const normalizedQuestion = args.question?.trim().toLowerCase() ?? '';
  const asksForPlanningComparison =
    normalizedQuestion.includes('scope') &&
    (
      normalizedQuestion.includes('block') ||
      normalizedQuestion.includes('dependency') ||
      normalizedQuestion.includes('capacity') ||
      normalizedQuestion.includes('overcommit')
    );

  if (asksForPlanningComparison) {
    const scopeChangePercent = derivedSignals.metrics.scopeChangePercent;
    const blockedIssues = derivedSignals.metrics.blockedIssues;
    const loadShare = derivedSignals.metrics.maxAssigneeLoadShare;
    const throughputLoadRatio = derivedSignals.metrics.throughputLoadRatio;
    const recentAverageCompletedIssues = derivedSignals.metrics.recentAverageCompletedIssues;
    const throughputSampleSize = derivedSignals.metrics.throughputSampleSize;
    const allocatedPeopleCount = derivedSignals.metrics.allocatedPeopleCount;
    const incompleteIssuesPerAllocatedPerson =
      derivedSignals.metrics.incompleteIssuesPerAllocatedPerson;
    const leadOwner = planning?.workload?.owners[0] ?? null;
    const drivers: string[] = [];

    if (scopeChangePercent !== null && scopeChangePercent >= 20) {
      drivers.push(`scope growth is up ${scopeChangePercent}% from sprint start`);
    }
    if (blockedIssues > 0) {
      drivers.push(`${blockedIssues} issues are blocked`);
    }
    if (loadShare !== null && loadShare >= 0.5 && leadOwner) {
      drivers.push(`${leadOwner.assigneeName ?? 'one assignee'} owns ${Math.round(loadShare * 100)}% of the incomplete work`);
    }
    if (
      throughputLoadRatio !== null &&
      throughputLoadRatio >= 1.25 &&
      recentAverageCompletedIssues !== null &&
      throughputSampleSize >= 2
    ) {
      drivers.push(
        `${derivedSignals.metrics.incompleteIssues} issues remain, versus a recent average of ${recentAverageCompletedIssues} completed across ${throughputSampleSize} project weeks`
      );
    }
    if (
      allocatedPeopleCount !== null &&
      allocatedPeopleCount > 0 &&
      incompleteIssuesPerAllocatedPerson !== null &&
      incompleteIssuesPerAllocatedPerson >= 3
    ) {
      drivers.push(
        `${allocatedPeopleCount} people are currently allocated, leaving ${incompleteIssuesPerAllocatedPerson} incomplete issues per person`
      );
    }

    if (drivers.length > 0) {
      return {
        summary: (() => {
          if (scopeChangePercent !== null && scopeChangePercent >= 20) {
            return 'The risk is coming primarily from scope growth, with delivery pressure reinforcing it.';
          }

          if (
            throughputLoadRatio !== null &&
            throughputLoadRatio >= 1.25 &&
            recentAverageCompletedIssues !== null &&
            throughputSampleSize >= 2
          ) {
            return 'The current sprint looks overcommitted relative to recent delivery history, with blockers or workload concentration making that harder to recover.';
          }

          if (
            allocatedPeopleCount !== null &&
            allocatedPeopleCount > 0 &&
            incompleteIssuesPerAllocatedPerson !== null &&
            incompleteIssuesPerAllocatedPerson >= 3
          ) {
            return 'The current sprint risk looks driven by staffing pressure on the currently allocated team, with too much unfinished work per person.';
          }

          return 'The current sprint risk is coming from a mix of blockers and workload pressure rather than clean execution alone.';
        })(),
        evidence: drivers.map((driver) => driver.charAt(0).toUpperCase() + driver.slice(1) + '.'),
        recommendedNextStep:
          scopeChangePercent !== null && scopeChangePercent >= 20
            ? 'Reduce late-added scope first, then clear the top blocker and rebalance the remaining incomplete work.'
            : throughputLoadRatio !== null && throughputLoadRatio >= 1.25
              ? 'Cut scope or add capacity before committing to more work, then clear the top blocker and rebalance the remaining load.'
              : 'Clear the top blocker first, then rebalance the remaining incomplete work across owners before adding more scope.',
      };
    }
  }

  if (questionTheme === 'scope') {
    const scopeChangePercent = derivedSignals.metrics.scopeChangePercent;
    if (scopeChangePercent !== null && scopeChangePercent > 0) {
      const originalScope = planning?.scopeChanges?.originalScope ?? fetched.accountability?.issues.stats.planned_at_start ?? 0;
      const currentScope = planning?.scopeChanges?.currentScope ?? derivedSignals.metrics.totalIssues;
      const addedMidSprint = fetched.accountability?.issues.stats.added_mid_sprint ?? 0;

      return {
        summary:
          scopeChangePercent >= 20
            ? `The current sprint risk is coming primarily from scope growth. Scope is up ${scopeChangePercent}% from the start of the week.`
            : `Scope has grown ${scopeChangePercent}% since the sprint started, but the increase is still modest relative to the total work.`,
        evidence: [
          `Original sprint scope: ${originalScope}.`,
          `Current sprint scope: ${currentScope}.`,
          `Issues added after start: ${addedMidSprint}.`,
        ],
        recommendedNextStep:
          scopeChangePercent >= 20
            ? 'Cut or defer late-added work, then confirm the smallest sprint outcome the team still needs to finish this week.'
            : 'Keep new scope tightly controlled and finish the work already in progress before adding more.',
      };
    }
  }

  if (questionTheme === 'blockers') {
    const blockedIssues = derivedSignals.metrics.blockedIssues;
    if (blockedIssues > 0) {
      const blockedTitles = planning?.issues
        .filter((issue) => issue.state === 'blocked')
        .slice(0, 3)
        .map((issue) => `${issue.display_id} ${issue.title}`) ?? [];

      return {
        summary:
          blockedIssues === 1
            ? 'The highest-risk blocker is a blocked issue already sitting in the sprint.'
            : `There are ${blockedIssues} blocked issues in the sprint, so delivery risk is tied to blocker resolution rather than normal execution only.`,
        evidence: [
          `Blocked issues: ${blockedIssues}.`,
          ...blockedTitles,
        ],
        recommendedNextStep:
          'Clear the top blocker first, confirm the owning person, and reset the sprint plan if that blocker will not move today.',
      };
    }
  }

  if (questionTheme === 'capacity') {
    const throughputLoadRatio = derivedSignals.metrics.throughputLoadRatio;
    const recentAverageCompletedIssues = derivedSignals.metrics.recentAverageCompletedIssues;
    const throughputSampleSize = derivedSignals.metrics.throughputSampleSize;
    const allocatedPeopleCount = derivedSignals.metrics.allocatedPeopleCount;
    const incompleteIssuesPerAllocatedPerson =
      derivedSignals.metrics.incompleteIssuesPerAllocatedPerson;
    const loadShare = derivedSignals.metrics.maxAssigneeLoadShare;
    const leadOwner = planning?.workload?.owners[0] ?? null;
    if (
      throughputLoadRatio !== null &&
      recentAverageCompletedIssues !== null &&
      throughputSampleSize >= 2
    ) {
      const ratioPercent = Math.round(throughputLoadRatio * 100);
      return {
        summary:
          throughputLoadRatio >= 1.25
            ? `Yes. The sprint looks overcommitted: ${derivedSignals.metrics.incompleteIssues} issues remain, which is ${ratioPercent}% of the team's recent weekly completion pace.`
            : 'No strong overcommitment signal shows up in recent delivery history, so the current risk looks more execution-specific than capacity-specific.',
        evidence: [
          `Current incomplete issues: ${derivedSignals.metrics.incompleteIssues}.`,
          `Recent average completed issues: ${recentAverageCompletedIssues} across ${throughputSampleSize} project weeks.`,
          `Current total sprint scope: ${derivedSignals.metrics.totalIssues}.`,
        ],
        recommendedNextStep:
          throughputLoadRatio >= 1.25
            ? 'Reduce scope first or add delivery capacity, because the remaining sprint load is above what this project has recently finished in a week.'
            : 'Hold the current scope steady and focus on execution flow before assuming the team needs more capacity.',
      };
    }

    if (
      allocatedPeopleCount !== null &&
      allocatedPeopleCount > 0 &&
      incompleteIssuesPerAllocatedPerson !== null
    ) {
      return {
        summary:
          incompleteIssuesPerAllocatedPerson >= 3
            ? `The current staffing looks thin for this sprint: ${allocatedPeopleCount} allocated people are carrying about ${incompleteIssuesPerAllocatedPerson} incomplete issues each.`
            : 'The current allocated team size does not show strong staffing pressure on its own.',
        evidence: [
          `Allocated people this week: ${allocatedPeopleCount}.`,
          `Incomplete issues: ${derivedSignals.metrics.incompleteIssues}.`,
          `Incomplete issues per allocated person: ${incompleteIssuesPerAllocatedPerson}.`,
        ],
        recommendedNextStep:
          incompleteIssuesPerAllocatedPerson >= 3
            ? 'Either cut scope or add delivery capacity, because the currently allocated team is carrying too much unfinished work per person.'
            : 'Keep the current team shape steady and focus on execution quality before changing staffing.',
      };
    }

    if (loadShare !== null && leadOwner) {
      const sharePercent = Math.round(loadShare * 100);
      return {
        summary:
          sharePercent >= 50
            ? `${leadOwner.assigneeName ?? 'One assignee'} is carrying ${sharePercent}% of the incomplete sprint work, which looks more like workload pressure than clean parallel execution.`
            : 'The visible sprint work is reasonably distributed, so the current risk does not look like a strong workload concentration problem.',
        evidence: [
          `${leadOwner.assigneeName ?? 'Lead owner'} owns ${leadOwner.incompleteIssues} incomplete issues.`,
          `Incomplete sprint issues: ${derivedSignals.metrics.incompleteIssues}.`,
          `Unassigned issues: ${planning?.workload?.unassignedIssues ?? 0}.`,
        ],
        recommendedNextStep:
          sharePercent >= 50
            ? 'Rebalance incomplete work across the team or reduce scope, because the current view suggests delivery load is concentrated on too few people.'
            : 'Keep the current work distribution stable and focus on closing the active work before adding more.',
      };
    }
  }

  return null;
}

function buildReasoningFallback(args: ReasonAboutSprintArgs): FleetGraphReasoning {
  const { activeView, finding, fetched, derivedSignals } = args;
  const projectName = fetched.accountability?.project?.name ?? null;
  const routeLabel = activeView?.tab ? `${activeView.tab} tab` : 'current view';
  const hasSignals = derivedSignals.signals.length > 0;
  const questionTheme = inferFleetGraphQuestionTheme(args.question);
  const planningQuestionSummary = buildPlanningQuestionSummary(args, questionTheme);

  const summary = planningQuestionSummary?.summary ??
    (hasSignals
      ? (finding?.summary ?? derivedSignals.summary ?? 'FleetGraph sees sprint risk signals that need attention.')
      : buildStableSummary(fetched, derivedSignals));

  const evidence = planningQuestionSummary?.evidence ??
    (hasSignals
      ? derivedSignals.signals.flatMap((signal) => signal.evidence).slice(0, 4)
      : [
          `Completed issues: ${derivedSignals.metrics.completedIssues} of ${derivedSignals.metrics.totalIssues}.`,
          `In-progress issues: ${derivedSignals.metrics.inProgressIssues}.`,
          `Standups logged: ${derivedSignals.metrics.standupCount}.`,
          `Recently active days: ${derivedSignals.metrics.recentActiveDays}.`,
        ]);

  const whyNow = hasSignals
    ? `This matters now because you are looking at the ${routeLabel}${projectName ? ` for ${projectName}` : ''}, and the current execution signals point to sprint drift.`
    : `You are looking at the ${routeLabel}${projectName ? ` for ${projectName}` : ''}, and the current sprint evidence does not show a meaningful execution risk.`;

  let recommendedNextStep: string | null = planningQuestionSummary?.recommendedNextStep ?? null;
  if (!recommendedNextStep && hasSignals) {
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
  } else if (!recommendedNextStep) {
    recommendedNextStep =
      'Keep the current execution rhythm and close in-progress work before adding new scope.';
  }

  return {
    answerMode: 'execution',
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
): Promise<FleetGraphReasoningResult> {
  if (!args.forceDeterministic && runtime.reasoner) {
    try {
      const reasoning = await runtime.reasoner.reasonAboutSprint({
        activeViewRoute: args.activeView?.route ?? null,
        question: args.question,
        findingSummary: args.finding?.summary ?? args.derivedSignals.summary,
        questionTheme: inferFleetGraphQuestionTheme(args.question),
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
          planning: args.fetched.planning,
        },
      });

      if (reasoning) {
        return {
          reasoning,
          source: 'model',
        };
      }
    } catch (error) {
      runtime.logger.warn('FleetGraph reasoning service failed; using deterministic fallback', {
        message: error instanceof Error ? error.message : 'Unknown reasoning failure',
      });
    }
  }

  return {
    reasoning: buildReasoningFallback(args),
    source: 'deterministic',
  };
}
