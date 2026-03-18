import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { beginFleetGraphNode, createFleetGraphCommand } from '../node-runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type ProactiveTargets = 'resolveContext' | 'fallback';

export async function initializeProactiveContextNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ProactiveTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'initializeProactiveContext',
    phase: 'context',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }

  runtime.logger.debug('Initializing proactive FleetGraph context', {
    workspaceId: state.workspaceId,
    triggerType: state.triggerType,
  });

  return createFleetGraphCommand(
    started.context,
    'resolveContext',
    {
      stage: 'initialize_proactive_context',
      actor: state.actor ?? {
        id: null,
        kind: 'service',
        role: 'fleetgraph',
      },
      handoff: createHandoff(
        'initializeProactiveContext',
        'resolveContext',
        'initialize proactive runtime context'
      ),
    }
  );
}
