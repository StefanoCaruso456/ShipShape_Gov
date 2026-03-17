import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';

type ResolveContextTargets = 'fetchSprintContext' | 'completeRun';

export async function resolveContextNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ResolveContextTargets>> {
  const runtime = getFleetGraphRuntime(config);

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

  const nextTarget: ResolveContextTargets = expandedScope.weekId ? 'fetchSprintContext' : 'completeRun';

  return new Command({
    goto: nextTarget,
    update: {
      stage: 'context_resolved',
      expandedScope,
      handoff: createHandoff(
        'resolveContext',
        nextTarget,
        nextTarget === 'fetchSprintContext'
          ? 'resolved sprint scope for phase-two fetch'
          : 'resolved non-sprint scope without additional phase-two fetch'
      ),
    },
  });
}
