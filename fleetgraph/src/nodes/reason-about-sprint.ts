import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { reasonAboutSprint } from '../reasoning/reason-about-sprint.js';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff, createIntervention } from '../supervision.js';

type ReasonAboutSprintTargets = 'proposeSprintAction' | 'completeRun' | 'fallback';

export async function reasonAboutSprintNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ReasonAboutSprintTargets>> {
  const runtime = getFleetGraphRuntime(config);

  if (!state.fetched.entity || !state.fetched.accountability) {
    return new Command({
      goto: 'completeRun',
      update: {
        stage: 'reasoning_skipped',
        handoff: createHandoff(
          'reasonAboutSprint',
          'completeRun',
          'skipped reasoning because sprint context is incomplete'
        ),
      },
    });
  }

  try {
    const reasoning = await reasonAboutSprint(
      {
        activeView: state.activeView,
        question: state.prompt?.question ?? null,
        finding: state.finding,
        fetched: state.fetched,
        derivedSignals: state.derivedSignals,
      },
      runtime
    );

    const nextTarget: ReasonAboutSprintTargets =
      state.mode === 'on_demand' ? 'proposeSprintAction' : 'completeRun';

    return new Command({
      goto: nextTarget,
      update: {
        stage: 'reasoned_about_sprint',
        reasoning,
        handoff: createHandoff(
          'reasonAboutSprint',
          nextTarget,
          'generated a grounded explanation from sprint evidence and signals'
        ),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown FleetGraph reasoning failure';

    runtime.logger.error('FleetGraph reasoning failed', {
      weekId: state.expandedScope.weekId,
      message,
    });

    return new Command({
      goto: 'fallback',
      update: {
        status: 'failed',
        stage: 'reason_about_sprint',
        error: {
          code: 'SPRINT_REASONING_FAILED',
          message,
          retryable: true,
          source: 'reasonAboutSprint',
        },
        interventions: [
          createIntervention(
            'retry',
            'Sprint reasoning failed while building the explanation layer',
            'reason_about_sprint'
          ),
        ],
      },
    });
  }
}
