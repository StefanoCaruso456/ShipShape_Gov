import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import { classifyFleetGraphTerminalOutcome } from '../outcomes.js';
import type { FleetGraphStateUpdate } from '../state.js';

import type { FleetGraphState } from '../state.js';

export async function completeRunNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<FleetGraphStateUpdate> {
  const runtime = getFleetGraphRuntime(config);
  const terminalOutcome = classifyFleetGraphTerminalOutcome(state);

  runtime.logger.info('FleetGraph run completed', {
    mode: state.mode,
    stage: state.stage,
    activeView: state.activeView,
    weekId: state.expandedScope.weekId,
    fetchedEntity: state.fetched.entity?.id ?? null,
    signalSeverity: state.derivedSignals.severity,
    findingSummary: state.finding?.summary ?? null,
    terminalOutcome,
  });

  return {
    status: state.error ? 'failed' : state.pendingApproval ? 'waiting_on_human' : 'completed',
    stage: state.stage ?? 'completed',
    terminalOutcome,
  };
}
