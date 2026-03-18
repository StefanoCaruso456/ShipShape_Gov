import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState, FleetGraphStateUpdate } from '../state.js';
import { classifyFleetGraphTerminalOutcome } from '../outcomes.js';

export async function fallbackNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<FleetGraphStateUpdate> {
  const runtime = getFleetGraphRuntime(config);
  const terminalOutcome = classifyFleetGraphTerminalOutcome(state);

  runtime.logger.error('FleetGraph entered fallback path', {
    error: state.error,
    stage: state.stage,
    terminalOutcome,
  });

  return {
    status: 'failed',
    stage: 'fallback',
    terminalOutcome,
  };
}
