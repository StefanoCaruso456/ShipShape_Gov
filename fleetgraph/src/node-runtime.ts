import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { getFleetGraphRuntime, type FleetGraphTelemetrySpanHandle } from './runtime.js';
import type { FleetGraphState, FleetGraphStateUpdate } from './state.js';
import type {
  FleetGraphErrorState,
  FleetGraphGuardState,
  FleetGraphNodeTraceEntry,
  FleetGraphNodeTraceStatus,
  FleetGraphReasoningSource,
  FleetGraphSignalSeverity,
  FleetGraphTerminalOutcome,
  FleetGraphTelemetryState,
  FleetGraphTimingState,
} from './types.js';
import { createIntervention } from './supervision.js';

export interface FleetGraphNodeContext {
  nodeName: string;
  phase: string;
  state: FleetGraphState;
  runtime: ReturnType<typeof getFleetGraphRuntime>;
  startedAt: Date;
  startedAtIso: string;
  effectiveGuard: FleetGraphGuardState;
  effectiveTiming: FleetGraphTimingState;
  transitionCount: number;
  span: FleetGraphTelemetrySpanHandle | null;
}

interface BeginFleetGraphNodeOptions<TGuardTarget extends string> {
  nodeName: string;
  phase: string;
  guardFailureTarget: TGuardTarget;
  startSpan?: boolean;
}

interface FleetGraphNodeResultMeta {
  status?: FleetGraphNodeTraceStatus;
  metadata?: Record<string, unknown>;
}

interface CreateFleetGraphFailureCommandArgs<TTarget extends string> {
  goto: TTarget;
  stage: string;
  error: FleetGraphErrorState;
  reason: string;
  interventionKind?: 'retry' | 'fail_safe_exit';
  atStage?: string | null;
  update?: FleetGraphStateUpdate;
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function resolveGuardState(context: FleetGraphState, runtime: FleetGraphNodeContext['runtime']): FleetGraphGuardState {
  return {
    maxTransitions:
      context.guard.maxTransitions > 0
        ? context.guard.maxTransitions
        : runtime.guardrails.maxTransitions,
    transitionCount: context.guard.transitionCount,
    maxRetries:
      context.guard.maxRetries > 0 ? context.guard.maxRetries : runtime.guardrails.maxRetries,
    maxResumeCount:
      context.guard.maxResumeCount > 0
        ? context.guard.maxResumeCount
        : runtime.guardrails.maxResumeCount,
    maxReasoningAttempts:
      context.guard.maxReasoningAttempts > 0
        ? context.guard.maxReasoningAttempts
        : runtime.guardrails.maxReasoningAttempts,
    circuitBreakerOpen: context.guard.circuitBreakerOpen,
    lastTripReason: context.guard.lastTripReason,
  };
}

function resolveTimingState(
  state: FleetGraphState,
  runtime: FleetGraphNodeContext['runtime'],
  now: Date
): FleetGraphTimingState {
  const startedAt = state.timing.startedAt ?? now.toISOString();
  const deadlineAt =
    state.timing.deadlineAt ??
    new Date(now.getTime() + runtime.guardrails.deadlineMs).toISOString();

  return {
    startedAt,
    lastNodeAt: state.timing.lastNodeAt,
    deadlineAt,
  };
}

function resolveTelemetryState(
  state: FleetGraphState,
  runtime: FleetGraphNodeContext['runtime']
): FleetGraphTelemetryState {
  return {
    langsmithRunId: runtime.telemetry?.getLangSmithRunId() ?? state.telemetry.langsmithRunId,
    langsmithRunUrl: state.telemetry.langsmithRunUrl,
    langsmithShareUrl: state.telemetry.langsmithShareUrl,
    braintrustSpanId: runtime.telemetry?.getTopLevelSpanId() ?? state.telemetry.braintrustSpanId,
  };
}

function buildNodeTraceEntry(
  context: FleetGraphNodeContext,
  finishedAt: Date,
  goto: string | null,
  status: FleetGraphNodeTraceStatus,
  errorCode: string | null
): FleetGraphNodeTraceEntry {
  return {
    node: context.nodeName,
    phase: context.phase,
    startedAt: context.startedAtIso,
    finishedAt: finishedAt.toISOString(),
    latencyMs: Math.max(0, finishedAt.getTime() - context.startedAt.getTime()),
    status,
    goto,
    errorCode,
  };
}

function buildNodeHistory(
  state: FleetGraphState,
  runtime: FleetGraphNodeContext['runtime'],
  entry: FleetGraphNodeTraceEntry
): FleetGraphNodeTraceEntry[] {
  return [...state.nodeHistory, entry].slice(-runtime.guardrails.maxNodeHistoryEntries);
}

function countRetryInterventions(state: FleetGraphState): number {
  return state.interventions.filter((intervention) => intervention.kind === 'retry').length;
}

function readObjectString(
  value: unknown,
  key: string
): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : null;
}

function readReasoningSource(value: unknown): FleetGraphReasoningSource | null {
  return value === 'deterministic' || value === 'model' ? value : null;
}

function readSignalSeverity(value: unknown): FleetGraphSignalSeverity | 'none' | null {
  switch (value) {
    case 'none':
    case 'info':
    case 'warning':
    case 'action':
      return value;
    default:
      return null;
  }
}

function readTerminalOutcome(value: unknown): FleetGraphTerminalOutcome | null {
  switch (value) {
    case 'quiet':
    case 'finding_only':
    case 'waiting_on_human':
    case 'action_executed':
    case 'suppressed':
    case 'failed_retryable':
    case 'failed_terminal':
      return value;
    default:
      return null;
  }
}

function applyNodeRuntimeUpdate(
  context: FleetGraphNodeContext,
  partialUpdate: FleetGraphStateUpdate,
  goto: string | null,
  meta: FleetGraphNodeResultMeta = {}
): FleetGraphStateUpdate {
  const finishedAt = context.runtime.now();
  const status = meta.status ?? 'ok';
  const errorCode = readObjectString(partialUpdate.error, 'code');
  const signalSeverity =
    readSignalSeverity(readObjectString(partialUpdate.derivedSignals, 'severity')) ??
    context.state.derivedSignals.severity;
  const reasoningSource =
    readReasoningSource(partialUpdate.reasoningSource) ?? context.state.reasoningSource;
  const actionOutcome =
    readObjectString(partialUpdate.actionResult, 'outcome') ??
    context.state.actionResult?.outcome ??
    null;
  const terminalOutcome = readTerminalOutcome(partialUpdate.terminalOutcome);
  const entry = buildNodeTraceEntry(
    context,
    finishedAt,
    goto,
    status,
    errorCode
  );
  const guard = partialUpdate.guard ?? {
    ...context.effectiveGuard,
    transitionCount: context.transitionCount,
  };
  const timing = partialUpdate.timing ?? {
    ...context.effectiveTiming,
    lastNodeAt: finishedAt.toISOString(),
  };
  const telemetry = partialUpdate.telemetry ?? resolveTelemetryState(context.state, context.runtime);

  context.runtime.telemetry?.finishNodeSpan(context.span, {
    status,
    latencyMs: entry.latencyMs,
    signalSeverity,
    reasoningSource,
    actionOutcome,
    errorClass: errorCode,
    metadata: meta.metadata,
  });

  return {
    ...partialUpdate,
    guard,
    timing,
    telemetry,
    lastNode: partialUpdate.lastNode ?? context.nodeName,
    nodeHistory: partialUpdate.nodeHistory ?? buildNodeHistory(context.state, context.runtime, entry),
    ...(terminalOutcome ? { terminalOutcome } : {}),
  };
}

function createGuardrailFailureCommand<TTarget extends string>(
  state: FleetGraphState,
  runtime: FleetGraphNodeContext['runtime'],
  options: BeginFleetGraphNodeOptions<TTarget>,
  effectiveGuard: FleetGraphGuardState,
  effectiveTiming: FleetGraphTimingState,
  transitionCount: number,
  now: Date,
  code: string,
  message: string
): Command<TTarget> {
  const context: FleetGraphNodeContext = {
    nodeName: options.nodeName,
    phase: options.phase,
    state,
    runtime,
    startedAt: now,
    startedAtIso: now.toISOString(),
    effectiveGuard,
    effectiveTiming,
    transitionCount,
    span: null,
  };

  return createFleetGraphCommand(
    context,
    options.guardFailureTarget,
    {
      status: 'failed',
      stage: `${toSnakeCase(options.nodeName)}_guardrail_stop`,
      terminalOutcome: 'failed_terminal',
      error: {
        code,
        message,
        retryable: false,
        source: options.nodeName,
      },
      guard: {
        ...effectiveGuard,
        transitionCount,
        circuitBreakerOpen: true,
        lastTripReason: code,
      },
      interventions: [
        createIntervention(
          'fail_safe_exit',
          message,
          `${toSnakeCase(options.nodeName)}_guardrail_stop`
        ),
      ],
    },
    {
      status: 'guardrail_stop',
      metadata: {
        code,
      },
    }
  );
}

export function beginFleetGraphNode<TGuardTarget extends string>(
  state: FleetGraphState,
  config: RunnableConfig | undefined,
  options: BeginFleetGraphNodeOptions<TGuardTarget>
): { runtime: FleetGraphNodeContext['runtime']; context: FleetGraphNodeContext } | { runtime: FleetGraphNodeContext['runtime']; command: Command<TGuardTarget> } {
  const runtime = getFleetGraphRuntime(config);
  const now = runtime.now();
  const effectiveGuard = resolveGuardState(state, runtime);
  const effectiveTiming = resolveTimingState(state, runtime, now);
  const transitionCount = effectiveGuard.transitionCount + 1;

  if (
    effectiveTiming.deadlineAt &&
    now.getTime() > new Date(effectiveTiming.deadlineAt).getTime()
  ) {
    return {
      runtime,
      command: createGuardrailFailureCommand(
        state,
        runtime,
        options,
        effectiveGuard,
        effectiveTiming,
        transitionCount,
        now,
        'DEADLINE_EXCEEDED',
        'FleetGraph exceeded the runtime deadline budget and tripped its circuit breaker.'
      ),
    };
  }

  if (transitionCount > effectiveGuard.maxTransitions) {
    return {
      runtime,
      command: createGuardrailFailureCommand(
        state,
        runtime,
        options,
        effectiveGuard,
        effectiveTiming,
        transitionCount,
        now,
        'MAX_TRANSITIONS_EXCEEDED',
        'FleetGraph exceeded the maximum node-transition budget and stopped the run.'
      ),
    };
  }

  const span =
    options.startSpan === false
      ? null
      : runtime.telemetry?.startNodeSpan({
          nodeName: options.nodeName,
          phase: options.phase,
          mode: state.mode,
          surface: state.activeView?.surface ?? null,
          route: state.activeView?.route ?? null,
          entityType: state.contextEntity?.type ?? state.activeView?.entity.type ?? null,
          weekId: state.expandedScope.weekId,
          projectId: state.expandedScope.projectId ?? state.activeView?.projectId ?? null,
          programId: state.expandedScope.programId,
          triggerType: state.triggerType,
        }) ?? null;

  return {
    runtime,
    context: {
      nodeName: options.nodeName,
      phase: options.phase,
      state,
      runtime,
      startedAt: now,
      startedAtIso: now.toISOString(),
      effectiveGuard,
      effectiveTiming,
      transitionCount,
      span,
    },
  };
}

export function startFleetGraphNodeSpan(
  context: FleetGraphNodeContext
): FleetGraphNodeContext {
  if (context.span || !context.runtime.telemetry) {
    return context;
  }

  return {
    ...context,
    span: context.runtime.telemetry.startNodeSpan({
      nodeName: context.nodeName,
      phase: context.phase,
      mode: context.state.mode,
      surface: context.state.activeView?.surface ?? null,
      route: context.state.activeView?.route ?? null,
      entityType:
        context.state.contextEntity?.type ?? context.state.activeView?.entity.type ?? null,
      weekId: context.state.expandedScope.weekId,
      projectId:
        context.state.expandedScope.projectId ?? context.state.activeView?.projectId ?? null,
      programId: context.state.expandedScope.programId,
      triggerType: context.state.triggerType,
    }),
  };
}

export function createFleetGraphCommand<TTarget extends string>(
  context: FleetGraphNodeContext,
  goto: TTarget,
  update: FleetGraphStateUpdate,
  meta: FleetGraphNodeResultMeta = {}
): Command<TTarget> {
  return new Command({
    goto,
    update: applyNodeRuntimeUpdate(context, update, goto, meta),
  });
}

export function createFleetGraphUpdate(
  context: FleetGraphNodeContext,
  update: FleetGraphStateUpdate,
  meta: FleetGraphNodeResultMeta = {}
): FleetGraphStateUpdate {
  return applyNodeRuntimeUpdate(context, update, null, meta);
}

export function createFleetGraphFailureCommand<TTarget extends string>(
  context: FleetGraphNodeContext,
  args: CreateFleetGraphFailureCommandArgs<TTarget>
): Command<TTarget> {
  const retryBudgetRemaining =
    args.error.retryable &&
    countRetryInterventions(context.state) < context.effectiveGuard.maxRetries;
  const error = {
    ...args.error,
    retryable: retryBudgetRemaining,
  };

  return createFleetGraphCommand(
    context,
    args.goto,
    {
      ...(args.update ?? {}),
      status: 'failed',
      stage: args.stage,
      terminalOutcome: retryBudgetRemaining ? 'failed_retryable' : 'failed_terminal',
      error,
      guard: retryBudgetRemaining
        ? {
            ...context.effectiveGuard,
            transitionCount: context.transitionCount,
          }
        : {
            ...context.effectiveGuard,
            transitionCount: context.transitionCount,
            circuitBreakerOpen: true,
            lastTripReason: error.code,
          },
      interventions: [
        createIntervention(
          args.interventionKind ??
            (retryBudgetRemaining ? 'retry' : 'fail_safe_exit'),
          args.reason,
          args.atStage ?? args.stage
        ),
      ],
    },
    {
      status: 'error',
      metadata: {
        error_code: error.code,
        retryable: error.retryable,
      },
    }
  );
}
