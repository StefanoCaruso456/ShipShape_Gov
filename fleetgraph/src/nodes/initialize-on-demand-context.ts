import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  beginFleetGraphNode,
  createFleetGraphCommand,
  createFleetGraphFailureCommand,
} from '../node-runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type OnDemandTargets = 'resolveContext' | 'fallback';

export async function initializeOnDemandContextNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<OnDemandTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'initializeOnDemandContext',
    phase: 'context',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }

  runtime.logger.debug('Initializing on-demand FleetGraph context', {
    contextEntity: state.contextEntity,
    activeView: state.activeView,
    hasPageContext: Boolean(state.prompt?.pageContext),
    actorId: state.actor?.id,
  });

  const contextEntity = state.contextEntity ?? state.activeView?.entity ?? null;

  if (!contextEntity && !state.prompt?.pageContext) {
    return createFleetGraphFailureCommand(started.context, {
      goto: 'fallback',
      stage: 'initialize_on_demand_context',
      error: {
        code: 'MISSING_CONTEXT',
        message: 'On-demand FleetGraph runs require current page context',
        retryable: false,
        source: 'initializeOnDemandContext',
      },
      reason: 'On-demand run missing both context entity and page context',
      interventionKind: 'fail_safe_exit',
    });
  }

  return createFleetGraphCommand(
    started.context,
    'resolveContext',
    {
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
    }
  );
}
