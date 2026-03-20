import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  beginFleetGraphNode,
  createFleetGraphCommand,
  createFleetGraphFailureCommand,
  startFleetGraphNodeSpan,
} from '../node-runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff, createIntervention, pauseForHumanApproval } from '../supervision.js';
import type { FleetGraphHumanDecision } from '../types.js';
import {
  appendFleetGraphApprovalTrace,
  createFleetGraphApprovalTrace,
} from '../tool-runtime.js';

type HumanApprovalGateTargets = 'executeProposedAction' | 'completeRun' | 'fallback';

function inferApprovalRiskLevel(actionType: string): 'medium' | 'high' | null {
  if (actionType === 'draft_escalation_comment') {
    return 'high';
  }

  if (actionType === 'draft_follow_up_comment') {
    return 'medium';
  }

  return null;
}

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
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'humanApprovalGate',
    phase: 'hitl',
    guardFailureTarget: 'fallback',
    startSpan: false,
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }

  if (!state.proposedAction) {
    const tracedContext = startFleetGraphNodeSpan(started.context);

    return createFleetGraphCommand(
      tracedContext,
      'completeRun',
      {
        stage: 'human_gate_skipped',
        handoff: createHandoff(
          'humanApprovalGate',
          'completeRun',
          'no proposed action requires human approval'
        ),
      }
    );
  }

  const decision = normalizeDecision(
    pauseForHumanApproval(
      state.pendingApproval ?? {
        actionType: state.proposedAction.type,
        reason: state.proposedAction.summary,
        proposal: state.proposedAction,
      }
    )
  );
  const tracedContext = startFleetGraphNodeSpan(started.context);
  const resumeAttempts = state.attempts.resume + 1;

  if (resumeAttempts > tracedContext.effectiveGuard.maxResumeCount) {
    return createFleetGraphFailureCommand(tracedContext, {
      goto: 'fallback',
      stage: 'human_approval_gate',
      error: {
        code: 'MAX_RESUMES_EXCEEDED',
        message: 'FleetGraph exceeded the allowed number of human resume attempts.',
        retryable: false,
        source: 'humanApprovalGate',
      },
      reason: 'FleetGraph exceeded the allowed number of human resume attempts.',
      interventionKind: 'fail_safe_exit',
    });
  }

  if (decision.outcome !== 'approve') {
    const approvalTrace = createFleetGraphApprovalTrace(tracedContext, {
      actionType: state.proposedAction.type,
      riskLevel: inferApprovalRiskLevel(state.proposedAction.type),
      fingerprint: state.proposedAction.fingerprint,
      targetRoute: state.proposedAction.targetRoute,
      decisionOutcome: decision.outcome,
      note: typeof decision.note === 'string' ? decision.note : null,
    });
    runtime.telemetry?.recordApproval({
      actionType: approvalTrace.actionType,
      decisionOutcome: approvalTrace.decisionOutcome,
      riskLevel: approvalTrace.riskLevel,
      targetRoute: approvalTrace.targetRoute,
      latencyMs: approvalTrace.latencyMs,
      metadata: {
        requires_human_approval: approvalTrace.requiresHumanApproval,
      },
    });
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

    return createFleetGraphCommand(
      tracedContext,
      'completeRun',
      {
        status: 'completed',
        stage: decision.outcome === 'snooze' ? 'action_snoozed' : 'action_dismissed',
        ...appendFleetGraphApprovalTrace(tracedContext, approvalTrace),
        pendingApproval: null,
        attempts: {
          ...state.attempts,
          resume: resumeAttempts,
        },
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
      {
        status: 'interrupted',
      }
    );
  }

  const approvalTrace = createFleetGraphApprovalTrace(tracedContext, {
    actionType: state.proposedAction.type,
    riskLevel: inferApprovalRiskLevel(state.proposedAction.type),
    fingerprint: state.proposedAction.fingerprint,
    targetRoute: state.proposedAction.targetRoute,
    decisionOutcome: 'approve',
    note: typeof decision.note === 'string' ? decision.note : null,
  });
  runtime.telemetry?.recordApproval({
    actionType: approvalTrace.actionType,
    decisionOutcome: approvalTrace.decisionOutcome,
    riskLevel: approvalTrace.riskLevel,
    targetRoute: approvalTrace.targetRoute,
    latencyMs: approvalTrace.latencyMs,
    metadata: {
      requires_human_approval: approvalTrace.requiresHumanApproval,
    },
  });

  return createFleetGraphCommand(
    tracedContext,
    'executeProposedAction',
    {
      status: 'running',
      stage: 'human_approved_action',
      ...appendFleetGraphApprovalTrace(tracedContext, approvalTrace),
      pendingApproval: null,
      attempts: {
        ...state.attempts,
        resume: resumeAttempts,
      },
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
    {
      status: 'interrupted',
    }
  );
}
