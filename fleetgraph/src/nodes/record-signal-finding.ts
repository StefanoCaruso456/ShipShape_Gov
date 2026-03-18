import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type RecordSignalFindingTargets = 'reasonAboutSprint' | 'completeRun';

export async function recordSignalFindingNode(
  state: FleetGraphState,
  _config?: RunnableConfig
): Promise<Command<RecordSignalFindingTargets>> {
  const summary =
    state.derivedSignals.summary ??
    state.derivedSignals.reasons[0] ??
    'FleetGraph detected sprint conditions that need attention.';

  const nextTarget: RecordSignalFindingTargets =
    state.mode === 'on_demand' ? 'reasonAboutSprint' : 'completeRun';

  return new Command({
    goto: nextTarget,
    update: {
      stage: 'signal_finding_recorded',
      finding: {
        summary,
        severity: state.derivedSignals.severity,
      },
      handoff: createHandoff(
        'recordSignalFinding',
        nextTarget,
        state.mode === 'on_demand'
          ? 'recorded deterministic sprint finding before the reasoning layer'
          : 'recorded deterministic sprint finding for downstream proactive output'
      ),
    },
  });
}
