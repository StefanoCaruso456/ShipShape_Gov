import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState, FleetGraphStateUpdate } from '../state.js';

export async function fallbackNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<FleetGraphStateUpdate> {
  const runtime = getFleetGraphRuntime(config);

  runtime.logger.error('FleetGraph entered fallback path', {
    error: state.error,
    stage: state.stage,
  });

  return {
    status: 'failed',
    stage: 'fallback',
  };
}
