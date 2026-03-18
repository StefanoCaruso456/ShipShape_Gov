import type { FleetGraphActionType } from '../types.js';

type FleetGraphActionTargetEntityType = 'week';
type FleetGraphActionRiskLevel = 'medium' | 'high';
type FleetGraphActionExecutor = 'post_comment';

interface FleetGraphActionSchemaProperty {
  type: 'string';
  description: string;
}

interface FleetGraphActionInputSchema {
  type: 'object';
  required: string[];
  properties: Record<string, FleetGraphActionSchemaProperty>;
}

export interface FleetGraphActionDefinition {
  type: FleetGraphActionType;
  description: string;
  purpose: string;
  targetEntityTypes: FleetGraphActionTargetEntityType[];
  riskLevel: FleetGraphActionRiskLevel;
  requiresHumanApproval: true;
  executor: FleetGraphActionExecutor;
  inputSchema: FleetGraphActionInputSchema;
}

export const FLEETGRAPH_ACTION_CATALOG: Record<
  FleetGraphActionType,
  FleetGraphActionDefinition
> = {
  draft_follow_up_comment: {
    type: 'draft_follow_up_comment',
    description:
      'Draft a grounded follow-up comment that asks for a same-day status update on the sprint.',
    purpose:
      'Use when FleetGraph sees meaningful sprint risk but the evidence still supports a direct owner follow-up before escalation.',
    targetEntityTypes: ['week'],
    riskLevel: 'medium',
    requiresHumanApproval: true,
    executor: 'post_comment',
    inputSchema: {
      type: 'object',
      required: ['targetId', 'summary', 'rationale', 'draftComment', 'targetRoute', 'fingerprint'],
      properties: {
        targetId: {
          type: 'string',
          description: 'Week document id that will receive the comment if approved.',
        },
        summary: {
          type: 'string',
          description: 'Short human-readable summary of the proposed follow-up action.',
        },
        rationale: {
          type: 'string',
          description: 'Grounded explanation for why the action is appropriate now.',
        },
        draftComment: {
          type: 'string',
          description: 'The draft Ship comment text that will be posted if approved.',
        },
        targetRoute: {
          type: 'string',
          description: 'Ship route where the human can review the proposal in context.',
        },
        fingerprint: {
          type: 'string',
          description: 'Stable dedupe key used for approval memory and suppression.',
        },
      },
    },
  },
  draft_escalation_comment: {
    type: 'draft_escalation_comment',
    description:
      'Draft an escalation comment that pushes for a same-day decision on blockers, ownership, or scope.',
    purpose:
      'Use when FleetGraph sees stronger sprint drift signals and a normal follow-up is unlikely to be enough.',
    targetEntityTypes: ['week'],
    riskLevel: 'high',
    requiresHumanApproval: true,
    executor: 'post_comment',
    inputSchema: {
      type: 'object',
      required: ['targetId', 'summary', 'rationale', 'draftComment', 'targetRoute', 'fingerprint'],
      properties: {
        targetId: {
          type: 'string',
          description: 'Week document id that will receive the escalation comment if approved.',
        },
        summary: {
          type: 'string',
          description: 'Short human-readable summary of the proposed escalation action.',
        },
        rationale: {
          type: 'string',
          description: 'Grounded explanation for why escalation is warranted now.',
        },
        draftComment: {
          type: 'string',
          description: 'The draft Ship comment text that will be posted if approved.',
        },
        targetRoute: {
          type: 'string',
          description: 'Ship route where the human can review the proposal in context.',
        },
        fingerprint: {
          type: 'string',
          description: 'Stable dedupe key used for approval memory and suppression.',
        },
      },
    },
  },
};

export function getFleetGraphActionDefinition(
  actionType: FleetGraphActionType
): FleetGraphActionDefinition {
  return FLEETGRAPH_ACTION_CATALOG[actionType];
}
