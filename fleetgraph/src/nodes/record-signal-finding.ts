import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type RecordSignalFindingTargets = 'completeRun';

export async function recordSignalFindingNode(
  state: FleetGraphState,
  _config?: RunnableConfig
): Promise<Command<RecordSignalFindingTargets>> {
  const summary =
    state.derivedSignals.summary ??
    state.derivedSignals.reasons[0] ??
    'FleetGraph detected sprint conditions that need attention.';

  return new Command({
    goto: 'completeRun',
    update: {
      stage: 'signal_finding_recorded',
      finding: {
        summary,
        severity: state.derivedSignals.severity,
      },
      handoff: createHandoff(
        'recordSignalFinding',
        'completeRun',
        'recorded deterministic sprint finding for downstream reasoning/output'
      ),
    },
  });
}
