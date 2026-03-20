import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  beginFleetGraphNode,
  createFleetGraphCommand,
  createFleetGraphFailureCommand,
} from '../node-runtime.js';
import type { FleetGraphState } from '../state.js';
import type {
  FleetGraphActivitySnapshot,
  FleetGraphDocumentContextSnapshot,
  FleetGraphPeopleSnapshot,
  FleetGraphSprintEntitySnapshot,
  FleetGraphSprintReviewContextSnapshot,
} from '../types.js';
import { createHandoff } from '../supervision.js';
import {
  appendFleetGraphToolTraces,
  FleetGraphEvidenceToolError,
  runFleetGraphEvidenceTool,
} from '../tool-runtime.js';

type FetchSprintContextTargets = 'deriveSprintSignals' | 'completeRun' | 'fallback';

export async function fetchSprintContextNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<FetchSprintContextTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'fetchSprintContext',
    phase: 'fetch',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }
  const sprintId = state.expandedScope.weekId;

  if (!sprintId) {
    return createFleetGraphCommand(
      started.context,
      'completeRun',
      {
        stage: 'fetch_sprint_context_skipped',
        handoff: createHandoff(
          'fetchSprintContext',
          'completeRun',
          'no sprint scope available for phase-two fetch'
        ),
      }
    );
  }

  runtime.logger.info('Fetching FleetGraph sprint context', {
    sprintId,
    mode: state.mode,
    route: state.activeView?.route,
    tab: state.activeView?.tab,
  });

  try {
    const { result, trace } = await runFleetGraphEvidenceTool(started.context, {
      toolName: 'get_sprint_snapshot',
      inputSummary: `Fetch sprint execution snapshot for ${sprintId}.`,
      call: async () => {
        const [entity, supporting, activity, accountability] = await Promise.all([
          runtime.shipApi.get<FleetGraphSprintEntitySnapshot>(`/api/documents/${sprintId}`),
          runtime.shipApi.get<FleetGraphDocumentContextSnapshot>(
            `/api/documents/${sprintId}/context`
          ),
          runtime.shipApi.get<FleetGraphActivitySnapshot>(`/api/activity/sprint/${sprintId}`),
          runtime.shipApi.get<FleetGraphSprintReviewContextSnapshot>(
            `/api/claude/context?context_type=review&sprint_id=${sprintId}`
          ),
        ]);

        return {
          entity,
          supporting,
          activity,
          accountability,
        };
      },
      resultSummary: (toolResult) =>
        `Fetched sprint snapshot with ${toolResult.accountability.issues.stats.total} issues and ${toolResult.accountability.standups.length} standups.`,
      resultCount: (toolResult) =>
        toolResult.accountability.issues.stats.total + toolResult.accountability.standups.length,
    });
    const { entity, supporting, activity, accountability } = result;

    const people: FleetGraphPeopleSnapshot = {
      owner: entity.owner ?? null,
      accountableId: entity.accountable_id ?? null,
    };

    return createFleetGraphCommand(
      started.context,
      'deriveSprintSignals',
      {
        ...appendFleetGraphToolTraces(started.context, [trace]),
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
          'deriveSprintSignals',
          'fetched sprint context from Ship REST APIs'
        ),
      }
    );
  } catch (error) {
    const toolFailureUpdate =
      error instanceof FleetGraphEvidenceToolError
        ? appendFleetGraphToolTraces(started.context, [error.trace])
        : {};
    const message = error instanceof Error ? error.message : 'Unknown FleetGraph sprint fetch failure';

    runtime.logger.error('FleetGraph sprint context fetch failed', {
      sprintId,
      message,
    });

    return createFleetGraphFailureCommand(started.context, {
      goto: 'fallback',
      stage: 'fetch_sprint_context',
      update: toolFailureUpdate,
      error: {
        code: 'SPRINT_CONTEXT_FETCH_FAILED',
        message,
        retryable: true,
        source: 'fetchSprintContext',
      },
      reason: 'Sprint context fetch failed while loading Ship REST context',
    });
  }
}
