import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime } from '../runtime.js';
import type { FleetGraphState } from '../state.js';
import type {
  FleetGraphActivitySnapshot,
  FleetGraphDocumentContextSnapshot,
  FleetGraphPeopleSnapshot,
  FleetGraphSprintEntitySnapshot,
  FleetGraphSprintReviewContextSnapshot,
} from '../types.js';
import { createHandoff, createIntervention } from '../supervision.js';

type FetchSprintContextTargets = 'completeRun' | 'fallback';

export async function fetchSprintContextNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<FetchSprintContextTargets>> {
  const runtime = getFleetGraphRuntime(config);
  const sprintId = state.expandedScope.weekId;

  if (!sprintId) {
    return new Command({
      goto: 'completeRun',
      update: {
        stage: 'fetch_sprint_context_skipped',
        handoff: createHandoff(
          'fetchSprintContext',
          'completeRun',
          'no sprint scope available for phase-two fetch'
        ),
      },
    });
  }

  runtime.logger.info('Fetching FleetGraph sprint context', {
    sprintId,
    mode: state.mode,
    route: state.activeView?.route,
    tab: state.activeView?.tab,
  });

  try {
    const [entity, supporting, activity, accountability] = await Promise.all([
      runtime.shipApi.get<FleetGraphSprintEntitySnapshot>(`/api/documents/${sprintId}`),
      runtime.shipApi.get<FleetGraphDocumentContextSnapshot>(`/api/documents/${sprintId}/context`),
      runtime.shipApi.get<FleetGraphActivitySnapshot>(`/api/activity/sprint/${sprintId}`),
      runtime.shipApi.get<FleetGraphSprintReviewContextSnapshot>(
        `/api/claude/context?context_type=review&sprint_id=${sprintId}`
      ),
    ]);

    const people: FleetGraphPeopleSnapshot = {
      owner: entity.owner ?? null,
      accountableId: entity.accountable_id ?? null,
    };

    return new Command({
      goto: 'completeRun',
      update: {
        stage: 'sprint_context_fetched',
        expandedScope: {
          ...state.expandedScope,
          weekId: sprintId,
          projectId:
            state.expandedScope.projectId ??
            accountability.project?.id ??
            supporting.belongs_to.find((item) => item.type === 'project')?.id ??
            null,
          programId:
            state.expandedScope.programId ??
            accountability.program?.id ??
            supporting.belongs_to.find((item) => item.type === 'program')?.id ??
            null,
        },
        fetched: {
          entity,
          supporting,
          activity,
          accountability,
          people,
        },
        handoff: createHandoff(
          'fetchSprintContext',
          'completeRun',
          'fetched sprint context from Ship REST APIs'
        ),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown FleetGraph sprint fetch failure';

    runtime.logger.error('FleetGraph sprint context fetch failed', {
      sprintId,
      message,
    });

    return new Command({
      goto: 'fallback',
      update: {
        status: 'failed',
        stage: 'fetch_sprint_context',
        error: {
          code: 'SPRINT_CONTEXT_FETCH_FAILED',
          message,
          retryable: true,
          source: 'fetchSprintContext',
        },
        interventions: [
          createIntervention(
            'retry',
            'Sprint context fetch failed while loading Ship REST context',
            'fetch_sprint_context'
          ),
        ],
      },
    });
  }
}
