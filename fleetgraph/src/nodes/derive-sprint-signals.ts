import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { deriveSprintSignals } from '../signals/derive-sprint-signals.js';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type DeriveSprintSignalsTargets = 'recordSignalFinding' | 'reasonAboutSprint' | 'completeRun';

export async function deriveSprintSignalsNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<DeriveSprintSignalsTargets>> {
  const runtime = getFleetGraphRuntime(config);

  const derivedSignals = deriveSprintSignals(
    {
      entity: state.fetched.entity,
      activity: state.fetched.activity,
      accountability: state.fetched.accountability,
    },
    runtime.now()
  );

  const nextTarget: DeriveSprintSignalsTargets = derivedSignals.shouldSurface
    ? 'recordSignalFinding'
    : state.mode === 'on_demand'
      ? 'reasonAboutSprint'
      : 'completeRun';

  runtime.logger.info('FleetGraph deterministic signals derived', {
    weekId: state.expandedScope.weekId,
    severity: derivedSignals.severity,
    signalCount: derivedSignals.signals.length,
    nextTarget,
  });

  return new Command({
    goto: nextTarget,
    update: {
      stage: derivedSignals.shouldSurface ? 'signals_detected' : 'signals_quiet_exit',
      derivedSignals,
      handoff: createHandoff(
        'deriveSprintSignals',
        nextTarget,
        derivedSignals.shouldSurface
          ? 'deterministic sprint signals found a condition worth surfacing'
          : state.mode === 'on_demand'
            ? 'deterministic signals are quiet, but on-demand mode still needs an explanation'
            : 'deterministic sprint signals found nothing worth surfacing'
      ),
    },
  });
}
