import type { FleetGraphState } from './state.js';
import type { FleetGraphTerminalOutcome } from './types.js';

export function classifyFleetGraphTerminalOutcome(
  state: FleetGraphState
): FleetGraphTerminalOutcome {
  if (state.error) {
    return state.error.retryable ? 'failed_retryable' : 'failed_terminal';
  }

  if (state.pendingApproval) {
    return 'waiting_on_human';
  }

  if (state.actionResult?.outcome === 'approved') {
    return 'action_executed';
  }

  if (
    state.suppressionReason ||
    state.actionResult?.outcome === 'dismissed' ||
    state.actionResult?.outcome === 'snoozed' ||
    (state.actionResult?.outcome === 'skipped' && state.stage === 'action_suppressed_by_memory')
  ) {
    return 'suppressed';
  }

  if (state.finding || state.derivedSignals.shouldSurface) {
    return 'finding_only';
  }

  return 'quiet';
}
