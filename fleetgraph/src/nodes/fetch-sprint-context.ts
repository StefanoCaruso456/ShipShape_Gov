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
  FleetGraphPlanningSnapshot,
  FleetGraphPeopleSnapshot,
  FleetGraphScopeChangeSnapshot,
  FleetGraphSprintIssueSnapshot,
  FleetGraphSprintEntitySnapshot,
  FleetGraphSprintReviewContextSnapshot,
  FleetGraphToolCallTrace,
} from '../types.js';
import { createHandoff } from '../supervision.js';
import {
  appendFleetGraphToolTraces,
  FleetGraphEvidenceToolError,
  runFleetGraphEvidenceTool,
} from '../tool-runtime.js';

type FetchSprintContextTargets = 'deriveSprintSignals' | 'completeRun' | 'fallback';

function buildWorkloadSnapshot(issues: FleetGraphSprintIssueSnapshot[]): FleetGraphPlanningSnapshot['workload'] {
  if (issues.length === 0) {
    return {
      owners: [],
      unassignedIssues: 0,
      maxIncompleteOwnerShare: null,
    };
  }

  const owners = new Map<
    string,
    {
      assigneeId: string | null;
      assigneeName: string | null;
      totalIssues: number;
      incompleteIssues: number;
      blockedIssues: number;
    }
  >();

  let unassignedIssues = 0;
  let totalIncompleteIssues = 0;

  for (const issue of issues) {
    const isComplete = issue.state === 'done' || issue.state === 'closed';
    const isBlocked = issue.state === 'blocked';
    const ownerKey = issue.assignee_id ?? `unassigned:${issue.id}`;

    if (!issue.assignee_id) {
      unassignedIssues += 1;
    }

    const current =
      owners.get(ownerKey) ??
      {
        assigneeId: issue.assignee_id,
        assigneeName: issue.assignee_name,
        totalIssues: 0,
        incompleteIssues: 0,
        blockedIssues: 0,
      };

    current.totalIssues += 1;
    if (!isComplete) {
      current.incompleteIssues += 1;
      totalIncompleteIssues += 1;
    }
    if (isBlocked) {
      current.blockedIssues += 1;
    }

    owners.set(ownerKey, current);
  }

  const ownerList = [...owners.values()]
    .filter((owner) => owner.assigneeId !== null)
    .sort((left, right) => right.incompleteIssues - left.incompleteIssues || right.totalIssues - left.totalIssues);

  const topOwner = ownerList[0] ?? null;
  const maxIncompleteOwnerShare =
    topOwner && totalIncompleteIssues > 0
      ? Number((topOwner.incompleteIssues / totalIncompleteIssues).toFixed(2))
      : null;

  return {
    owners: ownerList,
    unassignedIssues,
    maxIncompleteOwnerShare,
  };
}

async function fetchOptionalTool<T>(
  context: Parameters<typeof runFleetGraphEvidenceTool<T>>[0],
  input: Parameters<typeof runFleetGraphEvidenceTool<T>>[1]
): Promise<{ result: T | null; trace: FleetGraphToolCallTrace | null }> {
  try {
    const toolResult = await runFleetGraphEvidenceTool<T>(context, input);
    return {
      result: toolResult.result,
      trace: toolResult.trace,
    };
  } catch (error) {
    if (error instanceof FleetGraphEvidenceToolError) {
      return {
        result: null,
        trace: error.trace,
      };
    }

    throw error;
  }
}

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
    const [snapshotResult, issuesResult, scopeChangesResult] = await Promise.all([
      runFleetGraphEvidenceTool(started.context, {
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
      }),
      fetchOptionalTool<FleetGraphSprintIssueSnapshot[]>(started.context, {
        toolName: 'get_visible_issue_worklist',
        inputSummary: `Fetch sprint issue worklist for ${sprintId}.`,
        call: async () =>
          runtime.shipApi.get<FleetGraphSprintIssueSnapshot[]>(`/api/weeks/${sprintId}/issues`),
        resultSummary: (issues) =>
          `Fetched ${issues.length} sprint issues for planning-aware scope and workload analysis.`,
        resultCount: (issues) => issues.length,
      }),
      fetchOptionalTool<FleetGraphScopeChangeSnapshot>(started.context, {
        toolName: 'get_scope_change_signals',
        inputSummary: `Fetch sprint scope-change signals for ${sprintId}.`,
        call: async () =>
          runtime.shipApi.get<FleetGraphScopeChangeSnapshot>(`/api/weeks/${sprintId}/scope-changes`),
        resultSummary: (scopeChanges) =>
          `Fetched sprint scope-change snapshot at ${scopeChanges.scopeChangePercent}% change from start.`,
        resultCount: (scopeChanges) => scopeChanges.scopeChanges.length,
      }),
    ]);

    const {
      result: { entity, supporting, activity, accountability },
      trace,
    } = snapshotResult;

    const people: FleetGraphPeopleSnapshot = {
      owner: entity.owner ?? null,
      accountableId: entity.accountable_id ?? null,
    };

    const planning: FleetGraphPlanningSnapshot = {
      issues: issuesResult.result ?? [],
      scopeChanges: scopeChangesResult.result,
      workload: buildWorkloadSnapshot(issuesResult.result ?? []),
    };

    const toolTraces = [trace, issuesResult.trace, scopeChangesResult.trace].filter(
      (toolTrace): toolTrace is FleetGraphToolCallTrace => toolTrace !== null
    );

    return createFleetGraphCommand(
      started.context,
      'deriveSprintSignals',
      {
        ...appendFleetGraphToolTraces(started.context, toolTraces),
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
          planning,
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
