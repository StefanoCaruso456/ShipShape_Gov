import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  beginFleetGraphNode,
  createFleetGraphCommand,
  createFleetGraphFailureCommand,
} from '../node-runtime.js';
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
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'supervisorEntry',
    phase: 'control',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }

  runtime.logger.info('FleetGraph supervisor entry', {
    mode: state.mode,
    triggerType: state.triggerType,
  });

  if (state.mode === 'proactive') {
    return createFleetGraphCommand(
      started.context,
      'initializeProactiveContext',
      {
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
          metadata: state.trace.metadata,
        },
      }
    );
  }

  if (state.mode === 'on_demand') {
    return createFleetGraphCommand(
      started.context,
      'initializeOnDemandContext',
      {
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
          metadata: state.trace.metadata,
        },
      }
    );
  }

  return createFleetGraphFailureCommand(started.context, {
    goto: 'fallback',
    stage: 'supervisor_entry',
    error: {
      code: 'INVALID_MODE',
      message: 'FleetGraph run mode is missing or invalid',
      retryable: false,
      source: 'supervisorEntry',
    },
    reason: 'Invalid or missing run mode',
    interventionKind: 'fail_safe_exit',
  });
}
