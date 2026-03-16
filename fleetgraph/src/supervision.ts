import { interrupt } from '@langchain/langgraph';
import type {
  FleetGraphHandoff,
  FleetGraphInterventionEvent,
  FleetGraphPendingApproval,
} from './types.js';

export function createHandoff(fromNode: string, toNode: string, reason: string): FleetGraphHandoff {
  return { fromNode, toNode, reason };
}

export function createIntervention(
  kind: FleetGraphInterventionEvent['kind'],
  reason: string,
  atStage: string | null
): FleetGraphInterventionEvent {
  return { kind, reason, atStage };
}

export function pauseForHumanApproval(
  pendingApproval: FleetGraphPendingApproval
): { approved: boolean; note?: string } {
  return interrupt({
    type: 'fleetgraph-human-gate',
    pendingApproval,
  }) as { approved: boolean; note?: string };
}
