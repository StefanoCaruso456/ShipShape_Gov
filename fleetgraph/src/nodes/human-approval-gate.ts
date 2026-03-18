import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff, createIntervention, pauseForHumanApproval } from '../supervision.js';
import type { FleetGraphHumanDecision } from '../types.js';

type HumanApprovalGateTargets = 'executeProposedAction' | 'completeRun';

function normalizeDecision(input: unknown): FleetGraphHumanDecision {
  if (!input || typeof input !== 'object') {
    return { outcome: 'dismiss' };
  }

  const maybeDecision = input as Partial<FleetGraphHumanDecision>;
  const outcome = maybeDecision.outcome;

  if (outcome === 'approve' || outcome === 'dismiss' || outcome === 'snooze') {
    return {
      outcome,
      note: typeof maybeDecision.note === 'string' ? maybeDecision.note : undefined,
      snoozeMinutes:
        typeof maybeDecision.snoozeMinutes === 'number'
          ? maybeDecision.snoozeMinutes
          : undefined,
    };
  }

  return { outcome: 'dismiss' };
}

export async function humanApprovalGateNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<HumanApprovalGateTargets>> {
  const runtime = getFleetGraphRuntime(config);

  if (!state.proposedAction) {
    return new Command({
      goto: 'completeRun',
      update: {
        stage: 'human_gate_skipped',
        handoff: createHandoff(
          'humanApprovalGate',
          'completeRun',
          'no proposed action requires human approval'
        ),
      },
    });
  }

  const decision = normalizeDecision(
    pauseForHumanApproval({
      actionType: state.proposedAction.type,
      reason: state.proposedAction.summary,
      proposal: state.proposedAction,
    })
  );

  if (decision.outcome !== 'approve') {
    const record =
      runtime.actionMemory &&
      state.workspaceId &&
      state.expandedScope.weekId &&
      state.actor?.id
        ? await runtime.actionMemory.recordDecision({
            workspaceId: state.workspaceId,
            weekId: state.expandedScope.weekId,
            actorUserId: state.actor.id,
            actionFingerprint: state.proposedAction.fingerprint,
            actionType: state.proposedAction.type,
            proposalSummary: state.proposedAction.summary,
            draftComment: state.proposedAction.draftComment,
            decision,
            now: runtime.now(),
          })
        : {
            status: decision.outcome === 'snooze' ? 'snoozed' : 'dismissed',
            snoozedUntil: null,
            executedCommentId: null,
          };

    return new Command({
      goto: 'completeRun',
      update: {
        status: 'completed',
        stage: decision.outcome === 'snooze' ? 'action_snoozed' : 'action_dismissed',
        pendingApproval: null,
        actionResult: {
          outcome: decision.outcome === 'snooze' ? 'snoozed' : 'dismissed',
          summary:
            decision.outcome === 'snooze'
              ? 'FleetGraph snoozed this draft action and will avoid re-proposing it until the snooze expires.'
              : 'FleetGraph dismissed this draft action for the current sprint pattern.',
          note: typeof decision.note === 'string' ? decision.note : null,
          snoozedUntil: record.snoozedUntil,
          executedCommentId: null,
        },
        interventions: [
          createIntervention(
            decision.outcome === 'snooze' ? 'pause' : 'resume',
            decision.outcome === 'snooze'
              ? 'Human snoozed the proposed FleetGraph action'
              : 'Human dismissed the proposed FleetGraph action',
            'human_approval_gate'
          ),
        ],
        handoff: createHandoff(
          'humanApprovalGate',
          'completeRun',
          decision.outcome === 'snooze'
            ? 'human snoozed the draft action'
            : 'human dismissed the draft action'
        ),
      },
    });
  }

  return new Command({
    goto: 'executeProposedAction',
    update: {
      status: 'running',
      stage: 'human_approved_action',
      pendingApproval: null,
      interventions: [
        createIntervention(
          'resume',
          'Human approved the proposed FleetGraph action',
          'human_approval_gate'
        ),
      ],
      handoff: createHandoff(
        'humanApprovalGate',
        'executeProposedAction',
        'human approved the draft action for execution'
      ),
    },
  });
}
