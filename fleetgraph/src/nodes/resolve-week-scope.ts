import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  beginFleetGraphNode,
  createFleetGraphCommand,
  createFleetGraphFailureCommand,
  type FleetGraphNodeContext,
} from '../node-runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';
import {
  appendFleetGraphToolTraces,
  FleetGraphEvidenceToolError,
  runFleetGraphEvidenceTool,
} from '../tool-runtime.js';

type ResolveWeekScopeTargets =
  | 'fetchSprintContext'
  | 'reasonAboutCurrentView'
  | 'completeRun'
  | 'fallback';

interface FleetGraphWeeksResponse {
  current_sprint_number: number;
}

interface FleetGraphWeekLookupResponse {
  id: string;
}

interface FleetGraphMyWeekScopeResponse {
  week: {
    week_number: number;
  };
  projects: Array<{
    id: string;
  }>;
}

function isShipApiStatusError(error: unknown, status: number): boolean {
  return error instanceof Error && error.message.includes(`status ${status}`);
}

function buildMyWeekScopePath(route: string | null): string {
  if (!route) {
    return '/api/dashboard/my-week';
  }

  const url = new URL(route, 'http://fleetgraph.local');
  const requestedWeekNumber = url.searchParams.get('week_number');
  return requestedWeekNumber
    ? `/api/dashboard/my-week?week_number=${encodeURIComponent(requestedWeekNumber)}`
    : '/api/dashboard/my-week';
}

function failWeekScopeResolution(
  context: FleetGraphNodeContext,
  code: string,
  message: string,
  source: string,
  update = {}
): Command<ResolveWeekScopeTargets> {
  return createFleetGraphFailureCommand(context, {
    goto: 'fallback',
    stage: 'resolve_week_scope',
    error: {
      code,
      message,
      retryable: false,
      source,
    },
    reason: message,
    interventionKind: 'fail_safe_exit',
    update,
  });
}

export async function resolveWeekScopeNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ResolveWeekScopeTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'resolveWeekScope',
    phase: 'context',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }
  const activeView = state.activeView;
  const pageContext = state.prompt?.pageContext ?? null;
  const projectIdFromScope = state.expandedScope.projectId ?? state.activeView?.projectId ?? null;
  const personId = state.expandedScope.personId;

  runtime.logger.debug('Resolving FleetGraph non-week scope', {
    projectId: projectIdFromScope,
    personId,
    surface: activeView?.surface,
    route: activeView?.route,
  });

  try {
    if (projectIdFromScope) {
      const { result, trace } = await runFleetGraphEvidenceTool(started.context, {
        toolName: 'get_surface_context',
        inputSummary: 'Resolve the current project surface to the active sprint scope.',
        call: async () => {
          const weeks = await runtime.shipApi.get<FleetGraphWeeksResponse>('/api/weeks');
          const lookup = await runtime.shipApi.get<FleetGraphWeekLookupResponse>(
            `/api/weeks/lookup?project_id=${encodeURIComponent(projectIdFromScope)}&sprint_number=${weeks.current_sprint_number}`
          );

          return {
            sprintNumber: weeks.current_sprint_number,
            weekId: lookup.id,
          };
        },
        resultSummary: (toolResult) =>
          `Resolved project scope to sprint ${toolResult.sprintNumber} (${toolResult.weekId}).`,
        resultCount: () => 1,
      });

      return createFleetGraphCommand(
        started.context,
        'fetchSprintContext',
        {
          ...appendFleetGraphToolTraces(started.context, [trace]),
          stage: 'week_scope_resolved',
          expandedScope: {
            ...state.expandedScope,
            projectId: projectIdFromScope,
            weekId: result.weekId,
          },
          handoff: createHandoff(
            'resolveWeekScope',
            'fetchSprintContext',
            'resolved project scope to the current sprint'
          ),
        }
      );
    }

    if (personId && activeView?.surface === 'my_week') {
      const { result, trace } = await runFleetGraphEvidenceTool(started.context, {
        toolName: 'get_surface_context',
        inputSummary: 'Resolve My Week to a single-project sprint scope when possible.',
        call: async () => {
          const myWeek = await runtime.shipApi.get<FleetGraphMyWeekScopeResponse>(
            buildMyWeekScopePath(activeView.route)
          );

          const resolvedProjectId =
            activeView.projectId ??
            (myWeek.projects.length === 1 ? myWeek.projects[0]?.id ?? null : null);

          if (!resolvedProjectId) {
            return {
              myWeek,
              resolvedProjectId: null,
              weekId: null,
            };
          }

          const lookup = await runtime.shipApi.get<FleetGraphWeekLookupResponse>(
            `/api/weeks/lookup?project_id=${encodeURIComponent(resolvedProjectId)}&sprint_number=${myWeek.week.week_number}`
          );

          return {
            myWeek,
            resolvedProjectId,
            weekId: lookup.id,
          };
        },
        resultSummary: (toolResult) =>
          toolResult.resolvedProjectId && toolResult.weekId
            ? `Resolved My Week to project ${toolResult.resolvedProjectId} and sprint ${toolResult.weekId}.`
            : `Fetched My Week scope with ${toolResult.myWeek.projects.length} projects in view.`,
        resultCount: (toolResult) => toolResult.myWeek.projects.length,
      });
      const toolTraceUpdate = appendFleetGraphToolTraces(started.context, [trace]);

      if (!result.resolvedProjectId) {
        if (pageContext) {
          return createFleetGraphCommand(
            started.context,
            'reasonAboutCurrentView',
            {
              ...toolTraceUpdate,
              stage: 'week_scope_resolved_to_page_context',
              handoff: createHandoff(
                'resolveWeekScope',
                'reasonAboutCurrentView',
                result.myWeek.projects.length === 0
                  ? 'My Week had no project scope, so FleetGraph fell back to current-page reasoning'
                  : 'My Week had multiple projects in scope, so FleetGraph fell back to current-page reasoning'
              ),
            }
          );
        }

        const message =
          result.myWeek.projects.length === 0
            ? 'My Week has no project assignments for the selected week.'
            : 'My Week spans multiple projects. Open a specific project or week document for sprint-level analysis.';

        return failWeekScopeResolution(
          started.context,
          result.myWeek.projects.length === 0
            ? 'MY_WEEK_NO_PROJECT_SCOPE'
            : 'MY_WEEK_AMBIGUOUS_SCOPE',
          message,
          'resolveWeekScope',
          toolTraceUpdate
        );
      }

      return createFleetGraphCommand(
        started.context,
        'fetchSprintContext',
        {
          ...toolTraceUpdate,
          stage: 'week_scope_resolved',
          activeView: {
            ...activeView,
            projectId: result.resolvedProjectId,
          },
          expandedScope: {
            ...state.expandedScope,
            projectId: result.resolvedProjectId,
            weekId: result.weekId,
          },
          handoff: createHandoff(
            'resolveWeekScope',
            'fetchSprintContext',
            'resolved my-week scope to a single project sprint'
          ),
        }
      );
    }

    return createFleetGraphCommand(
      started.context,
      pageContext ? 'reasonAboutCurrentView' : 'completeRun',
      {
        stage: 'week_scope_resolution_skipped',
        handoff: createHandoff(
          'resolveWeekScope',
          pageContext ? 'reasonAboutCurrentView' : 'completeRun',
          pageContext
            ? 'no sprint scope was available, so FleetGraph fell back to current-page reasoning'
            : 'no project or my-week scope available for sprint resolution'
        ),
      }
    );
  } catch (error) {
    const toolFailureUpdate =
      error instanceof FleetGraphEvidenceToolError
        ? appendFleetGraphToolTraces(started.context, [error.trace])
        : {};

    if (isShipApiStatusError(error, 404)) {
      if (pageContext) {
        return createFleetGraphCommand(
          started.context,
          'reasonAboutCurrentView',
          {
            ...toolFailureUpdate,
            stage: 'week_scope_not_found_page_context_fallback',
            handoff: createHandoff(
              'resolveWeekScope',
              'reasonAboutCurrentView',
              'no active sprint was available, so FleetGraph answered from the current page snapshot'
            ),
          }
        );
      }

      const message = projectIdFromScope
        ? 'No active sprint was found for this project.'
        : 'No sprint was found for the selected My Week scope.';

      return failWeekScopeResolution(
        started.context,
        'WEEK_SCOPE_NOT_FOUND',
        message,
        'resolveWeekScope',
        toolFailureUpdate
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Unknown FleetGraph week-scope resolution failure';

    runtime.logger.error('FleetGraph week scope resolution failed', {
      projectId: projectIdFromScope,
      personId,
      message,
    });

    return createFleetGraphFailureCommand(started.context, {
      goto: 'fallback',
      stage: 'resolve_week_scope',
      update: toolFailureUpdate,
      error: {
        code: 'WEEK_SCOPE_RESOLUTION_FAILED',
        message,
        retryable: true,
        source: 'resolveWeekScope',
      },
      reason: 'Week scope resolution failed while mapping the current surface to a sprint',
    });
  }
}
