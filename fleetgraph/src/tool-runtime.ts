import { randomUUID } from 'crypto';
import type { FleetGraphNodeContext } from './node-runtime.js';
import type { FleetGraphState, FleetGraphStateUpdate } from './state.js';
import type {
  FleetGraphApprovalTrace,
  FleetGraphEvidenceToolName,
  FleetGraphQuestionTheme,
  FleetGraphScrumSurface,
  FleetGraphScrumToolContext,
  FleetGraphToolCallTrace,
} from './types.js';
import { getFleetGraphEvidenceToolDefinition } from './tools/registry.js';

export class FleetGraphEvidenceToolError extends Error {
  readonly code: string;

  constructor(
    message: string,
    readonly trace: FleetGraphToolCallTrace
  ) {
    super(message);
    this.name = 'FleetGraphEvidenceToolError';
    this.code = trace.errorCode ?? 'FLEETGRAPH_TOOL_FAILED';
  }
}

function inferScrumSurface(state: FleetGraphState): FleetGraphScrumSurface {
  if (state.activeView?.surface === 'my_week' || state.prompt?.pageContext?.kind === 'my_week') {
    return 'my_week';
  }

  if (state.activeView?.entity.type === 'week') {
    return 'sprint';
  }

  if (state.prompt?.pageContext?.kind === 'issue_surface') {
    return state.contextEntity?.type === 'program' ? 'program_issues' : 'project_issues';
  }

  if (state.activeView?.entity.type === 'project') {
    return state.activeView?.tab === 'issues' ? 'project_issues' : 'project';
  }

  if (state.activeView?.entity.type === 'program') {
    return state.activeView?.tab === 'issues' ? 'program_issues' : 'program';
  }

  return 'document';
}

export function inferFleetGraphQuestionTheme(question: string | null | undefined): FleetGraphQuestionTheme {
  const normalized = question?.trim().toLowerCase() ?? '';

  if (
    normalized.includes('impact') ||
    normalized.includes('value') ||
    normalized.includes('roi') ||
    normalized.includes('retention') ||
    normalized.includes('acquisition') ||
    normalized.includes('growth')
  ) {
    return 'impact';
  }

  if (
    normalized.includes('follow-up') ||
    normalized.includes('follow up') ||
    normalized.includes('owner') ||
    normalized.includes('who')
  ) {
    return 'follow_up';
  }

  if (
    normalized.includes('block') ||
    normalized.includes('blocked') ||
    normalized.includes('dependency')
  ) {
    return 'blockers';
  }

  if (
    normalized.includes('scope') ||
    normalized.includes('added') ||
    normalized.includes('change')
  ) {
    return 'scope';
  }

  if (
    normalized.includes('status') ||
    normalized.includes('moving') ||
    normalized.includes('stale') ||
    normalized.includes('stuck')
  ) {
    return 'status';
  }

  if (normalized.includes('risk')) {
    return 'risk';
  }

  return 'generic';
}

export function createFleetGraphScrumToolContext(
  state: FleetGraphState,
  now: Date
): FleetGraphScrumToolContext {
  return {
    schemaVersion: 'v1',
    runId: state.runId ?? 'unknown-run',
    threadId: state.runId ?? 'unknown-thread',
    turnId: state.runId ?? 'unknown-turn',
    workspaceId: state.workspaceId,
    actorId: state.actor?.id ?? null,
    actorRole: state.actor?.role ?? null,
    surface: inferScrumSurface(state),
    route: state.activeView?.route ?? state.prompt?.pageContext?.route ?? 'unknown-route',
    tab: state.activeView?.tab ?? null,
    question: state.prompt?.question ?? null,
    questionTheme: inferFleetGraphQuestionTheme(state.prompt?.question),
    issueId: state.expandedScope.issueId,
    weekId: state.expandedScope.weekId,
    sprintId: state.expandedScope.weekId,
    projectId: state.expandedScope.projectId ?? state.activeView?.projectId ?? null,
    programId: state.expandedScope.programId,
    visibleIssueIds: [],
    nowIso: now.toISOString(),
  };
}

function createToolTraceUpdate(
  context: FleetGraphNodeContext,
  traces: FleetGraphToolCallTrace[]
): Pick<FleetGraphStateUpdate, 'toolCalls' | 'guard' | 'telemetry'> {
  const failedCount = traces.filter((trace) => !trace.success).length;
  const totalToolLatencyMs = traces.reduce((sum, trace) => sum + trace.latencyMs, 0);

  return {
    toolCalls: traces,
    guard: {
      ...context.effectiveGuard,
      transitionCount: context.transitionCount,
      toolCallCount: context.state.guard.toolCallCount + traces.length,
    },
    telemetry: {
      ...context.state.telemetry,
      toolCallCount: context.state.telemetry.toolCallCount + traces.length,
      toolFailureCount: context.state.telemetry.toolFailureCount + failedCount,
      totalToolLatencyMs: context.state.telemetry.totalToolLatencyMs + totalToolLatencyMs,
      lastToolName: traces[traces.length - 1]?.toolName ?? context.state.telemetry.lastToolName,
    },
  };
}

export function appendFleetGraphToolTraces(
  context: FleetGraphNodeContext,
  traces: FleetGraphToolCallTrace[]
): Pick<FleetGraphStateUpdate, 'toolCalls' | 'guard' | 'telemetry'> {
  return createToolTraceUpdate(context, traces);
}

export function appendFleetGraphApprovalTrace(
  context: FleetGraphNodeContext,
  trace: FleetGraphApprovalTrace
): Pick<FleetGraphStateUpdate, 'approvals' | 'telemetry'> {
  return {
    approvals: [trace],
    telemetry: {
      ...context.state.telemetry,
      approvalCount: context.state.telemetry.approvalCount + 1,
    },
  };
}

export function createFleetGraphApprovalTrace(
  context: FleetGraphNodeContext,
  input: {
    actionType: FleetGraphApprovalTrace['actionType'];
    riskLevel: FleetGraphApprovalTrace['riskLevel'];
    fingerprint: string | null;
    targetRoute: string | null;
    decisionOutcome: FleetGraphApprovalTrace['decisionOutcome'];
    note: string | null;
  }
): FleetGraphApprovalTrace {
  const finishedAt = context.runtime.now();
  const startedAt = context.state.timing.lastNodeAt
    ? new Date(context.state.timing.lastNodeAt)
    : context.startedAt;

  return {
    approvalId: randomUUID(),
    actionType: input.actionType,
    riskLevel: input.riskLevel,
    fingerprint: input.fingerprint,
    targetRoute: input.targetRoute,
    requiresHumanApproval: true,
    decisionOutcome: input.decisionOutcome,
    note: input.note,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    latencyMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
  };
}

export async function runFleetGraphEvidenceTool<T>(
  context: FleetGraphNodeContext,
  input: {
    toolName: FleetGraphEvidenceToolName;
    inputSummary: string | null;
    cacheHit?: boolean;
    call: () => Promise<T>;
    resultSummary?: (result: T) => string | null;
    resultCount?: (result: T) => number | null;
  }
): Promise<{ result: T; trace: FleetGraphToolCallTrace }> {
  const nextToolCallCount = context.state.guard.toolCallCount + 1;
  if (nextToolCallCount > context.effectiveGuard.maxToolCalls) {
    const finishedAt = context.runtime.now();
    const trace: FleetGraphToolCallTrace = {
      callId: randomUUID(),
      toolName: input.toolName,
      toolVersion: 'v1',
      context: createFleetGraphScrumToolContext(context.state, context.startedAt),
      inputSummary: input.inputSummary,
      resultSummary: null,
      success: false,
      cacheHit: Boolean(input.cacheHit),
      resultCount: null,
      errorCode: 'MAX_TOOL_CALLS_EXCEEDED',
      errorMessage: 'FleetGraph exceeded the tool-call budget for this run.',
      startedAt: context.startedAtIso,
      finishedAt: finishedAt.toISOString(),
      latencyMs: Math.max(0, finishedAt.getTime() - context.startedAt.getTime()),
    };

    throw new FleetGraphEvidenceToolError(trace.errorMessage ?? 'FleetGraph tool budget exceeded', trace);
  }

  const definition = getFleetGraphEvidenceToolDefinition(input.toolName);
  const startedAt = context.runtime.now();
  const scrumContext = createFleetGraphScrumToolContext(context.state, startedAt);
  const span = context.runtime.telemetry?.startToolSpan({
    toolName: input.toolName,
    toolVersion: definition.toolVersion,
    mode: context.state.mode,
    surface: scrumContext.surface,
    route: scrumContext.route,
    questionTheme: scrumContext.questionTheme,
  }) ?? null;

  try {
    const result = await input.call();
    const finishedAt = context.runtime.now();
    const trace: FleetGraphToolCallTrace = {
      callId: randomUUID(),
      toolName: input.toolName,
      toolVersion: definition.toolVersion,
      context: scrumContext,
      inputSummary: input.inputSummary,
      resultSummary: input.resultSummary ? input.resultSummary(result) : null,
      success: true,
      cacheHit: Boolean(input.cacheHit),
      resultCount: input.resultCount ? input.resultCount(result) : null,
      errorCode: null,
      errorMessage: null,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      latencyMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    };

    context.runtime.telemetry?.finishToolSpan(span, {
      status: 'ok',
      latencyMs: trace.latencyMs,
      cacheHit: trace.cacheHit,
      resultCount: trace.resultCount,
      errorCode: null,
      metadata: {
        tool_name: trace.toolName,
      },
    });

    return { result, trace };
  } catch (error) {
    const finishedAt = context.runtime.now();
    const errorCode =
      error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
        ? ((error as { code: string }).code)
        : 'FLEETGRAPH_TOOL_FAILED';
    const errorMessage = error instanceof Error ? error.message : 'Unknown FleetGraph tool failure';
    const trace: FleetGraphToolCallTrace = {
      callId: randomUUID(),
      toolName: input.toolName,
      toolVersion: definition.toolVersion,
      context: scrumContext,
      inputSummary: input.inputSummary,
      resultSummary: null,
      success: false,
      cacheHit: Boolean(input.cacheHit),
      resultCount: null,
      errorCode,
      errorMessage,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      latencyMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    };

    context.runtime.telemetry?.finishToolSpan(span, {
      status: 'error',
      latencyMs: trace.latencyMs,
      cacheHit: trace.cacheHit,
      resultCount: null,
      errorCode,
      metadata: {
        tool_name: trace.toolName,
      },
    });

    throw new FleetGraphEvidenceToolError(errorMessage, trace);
  }
}
