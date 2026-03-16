import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type ProactiveTargets = 'resolveContext';

export async function initializeProactiveContextNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ProactiveTargets>> {
  const runtime = getFleetGraphRuntime(config);

  runtime.logger.debug('Initializing proactive FleetGraph context', {
    workspaceId: state.workspaceId,
    triggerType: state.triggerType,
  });

  return new Command({
    goto: 'resolveContext',
    update: {
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
    },
  });
}
