import type { FleetGraphLogger } from '@ship/fleetgraph';
import type {
  FleetGraphProactiveAudienceRole,
  FleetGraphProactiveDeliverySource,
  FleetGraphProactiveTriggerKind,
  WorkPersona,
} from '@ship/shared';
import { WORK_PERSONA_LABELS } from '@ship/shared';
import { recordFleetGraphLangSmithChildRun } from './fleetgraph-langsmith.js';

export interface FleetGraphProactivePersonalizationInput {
  baseSummary: string;
  recommendedNextStep: string | null;
  workPersona: WorkPersona | null;
  audienceRole: FleetGraphProactiveAudienceRole;
  deliverySource: FleetGraphProactiveDeliverySource;
  deliveryReason: string | null;
  triggerKind?: FleetGraphProactiveTriggerKind | null;
  parentLangSmithRunId?: string | null;
}

export interface FleetGraphProactivePersonalizationResult {
  summary: string;
  source: 'deterministic';
  applied: boolean;
}

function toSentenceClause(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const withoutPeriod = normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;
  return withoutPeriod.charAt(0).toLowerCase() + withoutPeriod.slice(1);
}

function buildAudienceLeadIn(
  audienceRole: FleetGraphProactiveAudienceRole,
  workPersona: WorkPersona
): string {
  const personaLabel = WORK_PERSONA_LABELS[workPersona].toLowerCase();

  switch (audienceRole) {
    case 'issue_assignee':
      return `As the ${personaLabel} closest to the work`;
    case 'responsible_owner':
      return `As the ${personaLabel} owning this follow-up`;
    case 'accountable':
      return `As the ${personaLabel} accountable for the outcome`;
    case 'manager':
      return `As the ${personaLabel} manager for this sprint`;
    case 'team_member':
      return `As a ${personaLabel} on the sprint team`;
    default:
      return `As the ${personaLabel} on point here`;
  }
}

function buildPersonaActionHint(workPersona: WorkPersona): string {
  switch (workPersona) {
    case 'engineer':
      return 'lock down the unblock owner, update the issue state, and surface anything still blocking delivery today';
    case 'product_manager':
      return 'protect the sprint commitment, trim late scope if needed, and make sure the team knows what outcome still holds today';
    case 'engineering_manager':
      return 'rebalance ownership, clear the riskiest unblock, and reset expectations today if the current plan no longer fits';
    case 'designer':
      return 'confirm the missing design decision or asset and unblock the implementation path today';
    case 'qa':
      return 'identify the blocked verification path and get a concrete unblock owner and date posted today';
    case 'ops_platform':
      return 'confirm the platform dependency or review needed to let execution move today';
    case 'stakeholder':
      return 'confirm whether the commitment still holds and surface any tradeoff or escalation needed today';
    case 'other':
      return 'make the next unblock explicit and confirm who owns it today';
    default:
      return 'make the next unblock explicit and confirm who owns it today';
  }
}

function personalizeSummary(
  input: FleetGraphProactivePersonalizationInput
): FleetGraphProactivePersonalizationResult {
  if (!input.workPersona) {
    return {
      summary: input.baseSummary,
      source: 'deterministic',
      applied: false,
    };
  }

  const recommendedNextStep = toSentenceClause(
    input.recommendedNextStep ?? buildPersonaActionHint(input.workPersona)
  );
  const leadIn = buildAudienceLeadIn(input.audienceRole, input.workPersona);
  const summary = `${input.baseSummary} ${leadIn}, ${recommendedNextStep}.`;

  return {
    summary,
    source: 'deterministic',
    applied: true,
  };
}

export async function personalizeFleetGraphProactiveFinding(
  input: FleetGraphProactivePersonalizationInput,
  logger: FleetGraphLogger
): Promise<FleetGraphProactivePersonalizationResult> {
  const result = personalizeSummary(input);

  try {
    await recordFleetGraphLangSmithChildRun({
      parentRunId: input.parentLangSmithRunId ?? null,
      name: 'fleetgraph.proactive.personalize',
      runType: 'chain',
      inputs: {
        baseSummary: input.baseSummary,
        recommendedNextStep: input.recommendedNextStep,
        workPersona: input.workPersona,
        audienceRole: input.audienceRole,
        deliverySource: input.deliverySource,
        deliveryReason: input.deliveryReason,
        triggerKind: input.triggerKind ?? null,
      },
      outputs: {
        personalizedSummary: result.summary,
        personalizationSource: result.source,
        applied: result.applied,
      },
      metadata: {
        work_persona: input.workPersona,
        audience_role: input.audienceRole,
        delivery_source: input.deliverySource,
        trigger_kind: input.triggerKind ?? null,
      },
      tags: [
        'fleetgraph',
        'proactive',
        'personalization',
        input.workPersona ? `persona:${input.workPersona}` : 'persona:none',
        `audience:${input.audienceRole}`,
      ],
    });
  } catch (error) {
    logger.warn('Failed to record FleetGraph proactive personalization trace', {
      message:
        error instanceof Error
          ? error.message
          : 'Unknown proactive personalization trace failure',
      workPersona: input.workPersona,
      audienceRole: input.audienceRole,
      triggerKind: input.triggerKind ?? null,
    });
  }

  return result;
}
