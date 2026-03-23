import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  beginFleetGraphNode,
  createFleetGraphCommand,
  createFleetGraphFailureCommand,
} from '../node-runtime.js';
import { reasonAboutSprint } from '../reasoning/reason-about-sprint.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type ReasonAboutSprintTargets = 'proposeSprintAction' | 'completeRun' | 'fallback';

export async function reasonAboutSprintNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ReasonAboutSprintTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'reasonAboutSprint',
    phase: 'reasoning',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }

  if (!state.fetched.entity || !state.fetched.accountability) {
    return createFleetGraphCommand(
      started.context,
      'completeRun',
      {
        stage: 'reasoning_skipped',
        handoff: createHandoff(
          'reasonAboutSprint',
          'completeRun',
          'skipped reasoning because sprint context is incomplete'
        ),
      }
    );
  }

  try {
    const reasoningAttempts = state.attempts.reasoning + 1;
    const forceDeterministic =
      reasoningAttempts > started.context.effectiveGuard.maxReasoningAttempts;
    const reasoningResult = await reasonAboutSprint(
      {
        activeView: state.activeView,
        question: state.prompt?.question ?? null,
        finding: state.finding,
        fetched: state.fetched,
        derivedSignals: state.derivedSignals,
        actorWorkPersona: state.mode === 'on_demand' ? state.actor?.workPersona ?? null : null,
        forceDeterministic,
      },
      runtime,
      config
    );

    const nextTarget: ReasonAboutSprintTargets =
      state.mode === 'on_demand' ? 'proposeSprintAction' : 'completeRun';

    return createFleetGraphCommand(
      started.context,
      nextTarget,
      {
        stage: 'reasoned_about_sprint',
        reasoning: reasoningResult.reasoning,
        reasoningSource: reasoningResult.source,
        ...(state.mode === 'proactive' && state.finding
          ? {
              finding: {
                ...state.finding,
                summary: reasoningResult.reasoning.summary,
              },
            }
          : {}),
        attempts: {
          ...state.attempts,
          reasoning: reasoningAttempts,
        },
        handoff: createHandoff(
          'reasonAboutSprint',
          nextTarget,
          'generated a grounded explanation from sprint evidence and signals'
        ),
      },
      {
        metadata: {
          force_deterministic: forceDeterministic,
          work_persona: state.actor?.workPersona ?? null,
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown FleetGraph reasoning failure';
    const reasoningAttempts = state.attempts.reasoning + 1;

    runtime.logger.error('FleetGraph reasoning failed', {
      weekId: state.expandedScope.weekId,
      message,
    });

    return createFleetGraphFailureCommand(started.context, {
      goto: 'fallback',
      stage: 'reason_about_sprint',
      error: {
        code: 'SPRINT_REASONING_FAILED',
        message,
        retryable: true,
        source: 'reasonAboutSprint',
      },
      reason: 'Sprint reasoning failed while building the explanation layer',
      update: {
        attempts: {
          ...state.attempts,
          reasoning: reasoningAttempts,
        },
      },
    });
  }
}
