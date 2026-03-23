import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import { classifyFleetGraphTerminalOutcome } from '../outcomes.js';
import type { FleetGraphState, FleetGraphStateUpdate } from '../state.js';
import { buildFleetGraphTraceFromState } from '../trace-metadata.js';

export async function completeRunNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<FleetGraphStateUpdate> {
  const runtime = getFleetGraphRuntime(config);
  const startedAt = runtime.now();
  const finishedAt = runtime.now();
  const terminalOutcome = classifyFleetGraphTerminalOutcome(state);
  const status = state.error ? 'failed' : state.pendingApproval ? 'waiting_on_human' : 'completed';
  const nodeHistoryEntry = {
    node: 'completeRun',
    phase: 'control',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    latencyMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    status: 'ok' as const,
    goto: null,
    errorCode: null,
  };
  const nextState: FleetGraphState = {
    ...state,
    status,
    stage: state.stage ?? 'completed',
    terminalOutcome,
    lastNode: 'completeRun',
    nodeHistory: [...state.nodeHistory, nodeHistoryEntry],
  };
  const trace = buildFleetGraphTraceFromState(nextState);

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
    status,
    stage: nextState.stage,
    terminalOutcome,
    lastNode: nextState.lastNode,
    nodeHistory: nextState.nodeHistory,
    trace,
  };
}
