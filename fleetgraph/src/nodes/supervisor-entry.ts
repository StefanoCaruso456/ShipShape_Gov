import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff, createIntervention } from '../supervision.js';

type SupervisorTargets =
  | 'initializeProactiveContext'
  | 'initializeOnDemandContext'
  | 'fallback';

export async function supervisorEntryNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<SupervisorTargets>> {
  const runtime = getFleetGraphRuntime(config);

  runtime.logger.info('FleetGraph supervisor entry', {
    mode: state.mode,
    triggerType: state.triggerType,
  });

  if (state.mode === 'proactive') {
    return new Command({
      goto: 'initializeProactiveContext',
      update: {
        status: 'running',
        stage: 'supervisor_entry',
        handoff: createHandoff(
          'supervisorEntry',
          'initializeProactiveContext',
          'mode:proactive'
        ),
        trace: {
          runName: state.trace.runName ?? 'fleetgraph-proactive',
          tags: Array.from(new Set([...state.trace.tags, 'mode:proactive'])),
        },
      },
    });
  }

  if (state.mode === 'on_demand') {
    return new Command({
      goto: 'initializeOnDemandContext',
      update: {
        status: 'running',
        stage: 'supervisor_entry',
        handoff: createHandoff(
          'supervisorEntry',
          'initializeOnDemandContext',
          'mode:on_demand'
        ),
        trace: {
          runName: state.trace.runName ?? 'fleetgraph-on-demand',
          tags: Array.from(new Set([...state.trace.tags, 'mode:on_demand'])),
        },
      },
    });
  }

  return new Command({
    goto: 'fallback',
    update: {
      status: 'failed',
      stage: 'supervisor_entry',
      error: {
        code: 'INVALID_MODE',
        message: 'FleetGraph run mode is missing or invalid',
        retryable: false,
        source: 'supervisorEntry',
      },
      interventions: [
        createIntervention(
          'fail_safe_exit',
          'Invalid or missing run mode',
          'supervisor_entry'
        ),
      ],
    },
  });
}
