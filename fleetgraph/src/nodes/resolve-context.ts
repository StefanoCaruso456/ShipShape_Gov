import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { beginFleetGraphNode, createFleetGraphCommand } from '../node-runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type ResolveContextTargets =
  | 'fetchSprintContext'
  | 'resolveWeekScope'
  | 'reasonAboutCurrentView'
  | 'completeRun'
  | 'fallback';

export async function resolveContextNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ResolveContextTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'resolveContext',
    phase: 'context',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }

  runtime.logger.debug('Resolving FleetGraph context scope', {
    mode: state.mode,
    contextEntity: state.contextEntity,
  });

  const expandedScope = { ...state.expandedScope };

  if (state.contextEntity) {
    switch (state.contextEntity.type) {
      case 'issue':
        expandedScope.issueId = state.contextEntity.id;
        break;
      case 'week':
        expandedScope.weekId = state.contextEntity.id;
        break;
      case 'project':
        expandedScope.projectId = state.contextEntity.id;
        break;
      case 'program':
        expandedScope.programId = state.contextEntity.id;
        break;
      case 'person':
        expandedScope.personId = state.contextEntity.id;
        break;
    }
  }

  const nextTarget: ResolveContextTargets = expandedScope.weekId
    ? 'fetchSprintContext'
    : expandedScope.projectId || expandedScope.personId
      ? 'resolveWeekScope'
      : state.prompt?.pageContext
        ? 'reasonAboutCurrentView'
      : 'completeRun';

  return createFleetGraphCommand(
    started.context,
    nextTarget,
    {
      stage: 'context_resolved',
      expandedScope,
      handoff: createHandoff(
        'resolveContext',
        nextTarget,
        nextTarget === 'fetchSprintContext'
          ? 'resolved sprint scope for phase-two fetch'
          : nextTarget === 'resolveWeekScope'
            ? 'resolved non-week scope that needs sprint lookup'
            : nextTarget === 'reasonAboutCurrentView'
              ? 'resolved a current-view snapshot without sprint scope'
            : 'resolved non-sprint scope without additional phase-two fetch'
      ),
    }
  );
}
