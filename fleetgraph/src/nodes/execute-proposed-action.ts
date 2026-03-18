import { randomUUID } from 'crypto';
import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphActionDefinition } from '../actions/catalog.js';
import {
  beginFleetGraphNode,
  createFleetGraphCommand,
  createFleetGraphFailureCommand,
} from '../node-runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type ExecuteProposedActionTargets = 'completeRun' | 'fallback';

export async function executeProposedActionNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ExecuteProposedActionTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'executeProposedAction',
    phase: 'action',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }

  if (!state.proposedAction?.targetId) {
    return createFleetGraphCommand(
      started.context,
      'completeRun',
      {
        stage: 'action_execution_skipped',
        attempts: {
          ...state.attempts,
          actionExecution: state.attempts.actionExecution + 1,
        },
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
      }
    );
  }

  try {
    const actionExecutionAttempts = state.attempts.actionExecution + 1;
    const actionDefinition = getFleetGraphActionDefinition(state.proposedAction.type);

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

    return createFleetGraphCommand(
      started.context,
      'completeRun',
      {
        status: 'completed',
        stage: 'action_executed',
        attempts: {
          ...state.attempts,
          actionExecution: actionExecutionAttempts,
        },
        actionResult: {
          outcome: 'approved',
          summary:
            actionDefinition.executor === 'post_comment'
              ? 'FleetGraph posted the approved draft comment to the sprint document.'
              : 'FleetGraph executed the approved action.',
          note: null,
          snoozedUntil: null,
          executedCommentId: createdComment.id,
        },
        handoff: createHandoff(
          'executeProposedAction',
          'completeRun',
          'executed the approved draft action against the sprint document'
        ),
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown FleetGraph action execution failure';
    const actionExecutionAttempts = state.attempts.actionExecution + 1;

    runtime.logger.error('FleetGraph action execution failed', {
      targetId: state.proposedAction.targetId,
      message,
    });

    return createFleetGraphFailureCommand(started.context, {
      goto: 'fallback',
      stage: 'execute_proposed_action',
      error: {
        code: 'PROPOSED_ACTION_EXECUTION_FAILED',
        message,
        retryable: true,
        source: 'executeProposedAction',
      },
      reason: 'FleetGraph failed while executing the approved draft action',
      update: {
        attempts: {
          ...state.attempts,
          actionExecution: actionExecutionAttempts,
        },
      },
    });
  }
}
