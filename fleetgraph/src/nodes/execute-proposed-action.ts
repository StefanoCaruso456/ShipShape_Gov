import { randomUUID } from 'crypto';
import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff, createIntervention } from '../supervision.js';

type ExecuteProposedActionTargets = 'completeRun' | 'fallback';

export async function executeProposedActionNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ExecuteProposedActionTargets>> {
  const runtime = getFleetGraphRuntime(config);

  if (!state.proposedAction?.targetId) {
    return new Command({
      goto: 'completeRun',
      update: {
        stage: 'action_execution_skipped',
        actionResult: {
          outcome: 'skipped',
          summary: 'FleetGraph skipped action execution because no valid target was available.',
          note: null,
          snoozedUntil: null,
          executedCommentId: null,
        },
        handoff: createHandoff(
          'executeProposedAction',
          'completeRun',
          'skipped execution because the action target is missing'
        ),
      },
    });
  }

  try {
    const createdComment = await runtime.shipApi.post<{ id: string }>(
      `/api/documents/${state.proposedAction.targetId}/comments`,
      {
        comment_id: randomUUID(),
        content: state.proposedAction.draftComment,
      }
    );

    if (
      runtime.actionMemory &&
      state.workspaceId &&
      state.expandedScope.weekId &&
      state.actor?.id
    ) {
      await runtime.actionMemory.recordDecision({
        workspaceId: state.workspaceId,
        weekId: state.expandedScope.weekId,
        actorUserId: state.actor.id,
        actionFingerprint: state.proposedAction.fingerprint,
        actionType: state.proposedAction.type,
        proposalSummary: state.proposedAction.summary,
        draftComment: state.proposedAction.draftComment,
        decision: {
          outcome: 'approve',
        },
        now: runtime.now(),
        executedCommentId: createdComment.id,
      });
    }

    return new Command({
      goto: 'completeRun',
      update: {
        status: 'completed',
        stage: 'action_executed',
        actionResult: {
          outcome: 'approved',
          summary: 'FleetGraph posted the approved draft comment to the sprint document.',
          note: null,
          snoozedUntil: null,
          executedCommentId: createdComment.id,
        },
        handoff: createHandoff(
          'executeProposedAction',
          'completeRun',
          'executed the approved draft action against the sprint document'
        ),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown FleetGraph action execution failure';

    runtime.logger.error('FleetGraph action execution failed', {
      targetId: state.proposedAction.targetId,
      message,
    });

    return new Command({
      goto: 'fallback',
      update: {
        status: 'failed',
        stage: 'execute_proposed_action',
        error: {
          code: 'PROPOSED_ACTION_EXECUTION_FAILED',
          message,
          retryable: true,
          source: 'executeProposedAction',
        },
        interventions: [
          createIntervention(
            'retry',
            'FleetGraph failed while executing the approved draft action',
            'execute_proposed_action'
          ),
        ],
      },
    });
  }
}
