import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphStateUpdate } from '../state.js';

export async function completeRunNode(
  _state: unknown,
  config?: RunnableConfig
): Promise<FleetGraphStateUpdate> {
  const runtime = getFleetGraphRuntime(config);

  runtime.logger.info('FleetGraph phase-one scaffold completed');

  return {
    status: 'completed',
    stage: 'completed',
  };
}
