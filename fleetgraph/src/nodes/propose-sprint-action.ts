import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { buildSprintActionProposal } from '../actions/propose-sprint-action.js';
import { getFleetGraphActionDefinition } from '../actions/catalog.js';
import { beginFleetGraphNode, createFleetGraphCommand } from '../node-runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type ProposeSprintActionTargets = 'humanApprovalGate' | 'completeRun' | 'fallback';

export async function proposeSprintActionNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ProposeSprintActionTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'proposeSprintAction',
    phase: 'action',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }
  const proposedAction = buildSprintActionProposal({
    activeView: state.activeView,
    weekId: state.expandedScope.weekId,
    fetched: state.fetched,
    derivedSignals: state.derivedSignals,
    reasoning: state.reasoning,
  });

  if (
    !proposedAction ||
    !state.workspaceId ||
    !state.expandedScope.weekId ||
    !state.actor?.id
  ) {
    return createFleetGraphCommand(
      started.context,
      'completeRun',
      {
        stage: 'action_not_proposed',
        proposedAction: null,
        pendingApproval: null,
        handoff: createHandoff(
          'proposeSprintAction',
          'completeRun',
          proposedAction
            ? 'skipped action proposal because required actor or scope data is missing'
            : 'signals and reasoning did not produce a follow-up action'
        ),
      }
    );
  }

  if (runtime.actionMemory) {
    const existingDecision = await runtime.actionMemory.getLatestDecision({
      workspaceId: state.workspaceId,
      weekId: state.expandedScope.weekId,
      actorUserId: state.actor.id,
      actionFingerprint: proposedAction.fingerprint,
      now: runtime.now(),
    });

    if (existingDecision) {
      const isSnoozed =
        existingDecision.status === 'snoozed' &&
        typeof existingDecision.snoozedUntil === 'string' &&
        new Date(existingDecision.snoozedUntil).getTime() > runtime.now().getTime();

      if (existingDecision.status === 'approved' || existingDecision.status === 'dismissed' || isSnoozed) {
        const summary = existingDecision.status === 'approved'
          ? 'FleetGraph already executed this draft action for the current sprint pattern.'
          : existingDecision.status === 'dismissed'
            ? 'FleetGraph is not re-proposing this action because you already dismissed the same draft.'
            : 'FleetGraph is respecting the active snooze window for this draft action.';

        return createFleetGraphCommand(
          started.context,
          'completeRun',
          {
            stage: 'action_suppressed_by_memory',
            proposedAction: null,
            pendingApproval: null,
            suppressionReason:
              existingDecision.status === 'approved'
                ? 'approved_before'
                : existingDecision.status === 'dismissed'
                  ? 'dismissed_before'
                  : 'snoozed',
            actionResult: {
              outcome: 'skipped',
              summary,
              note: null,
              snoozedUntil: existingDecision.snoozedUntil,
              executedCommentId: existingDecision.executedCommentId,
            },
            handoff: createHandoff(
              'proposeSprintAction',
              'completeRun',
              'suppressed action proposal using stored human decisions'
            ),
          }
        );
      }
    }
  }

  const actionDefinition = getFleetGraphActionDefinition(proposedAction.type);

  return createFleetGraphCommand(
    started.context,
    'humanApprovalGate',
    {
      stage: 'action_proposed',
      proposedAction,
      pendingApproval: {
        actionType: actionDefinition.type,
        reason: proposedAction.summary,
        proposal: proposedAction,
      },
      handoff: createHandoff(
        'proposeSprintAction',
        'humanApprovalGate',
        'prepared a draft action that needs human approval before mutation'
      ),
    }
  );
}
