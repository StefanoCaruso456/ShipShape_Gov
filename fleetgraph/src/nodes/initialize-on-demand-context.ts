import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff, createIntervention } from '../supervision.js';

type OnDemandTargets = 'resolveContext' | 'fallback';

export async function initializeOnDemandContextNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<OnDemandTargets>> {
  const runtime = getFleetGraphRuntime(config);

  runtime.logger.debug('Initializing on-demand FleetGraph context', {
    contextEntity: state.contextEntity,
    activeView: state.activeView,
    actorId: state.actor?.id,
  });

  const contextEntity = state.contextEntity ?? state.activeView?.entity ?? null;

  if (!contextEntity) {
    return new Command({
      goto: 'fallback',
      update: {
        status: 'failed',
        stage: 'initialize_on_demand_context',
        error: {
          code: 'MISSING_CONTEXT_ENTITY',
          message: 'On-demand FleetGraph runs require a current context entity',
          retryable: false,
          source: 'initializeOnDemandContext',
        },
        interventions: [
          createIntervention(
            'fail_safe_exit',
            'On-demand run missing context entity',
            'initialize_on_demand_context'
          ),
        ],
      },
    });
  }

  return new Command({
    goto: 'resolveContext',
    update: {
      stage: 'initialize_on_demand_context',
      contextEntity,
      actor: state.actor ?? {
        id: null,
        kind: 'user',
        role: null,
      },
      handoff: createHandoff(
        'initializeOnDemandContext',
        'resolveContext',
        'initialize on-demand runtime context'
      ),
    },
  });
}
