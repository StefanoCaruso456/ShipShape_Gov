import { initLogger, type Logger, type Span } from 'braintrust';
import type {
  FleetGraphLogger,
  FleetGraphRunInput,
  FleetGraphState,
  FleetGraphTelemetryService,
  FleetGraphTelemetrySpanHandle,
} from '@ship/fleetgraph';
import type {
  FleetGraphFeedbackEventRequest,
  FleetGraphProactiveAudienceRole,
  FleetGraphProactiveAudienceScope,
  FleetGraphProactiveDeliverySource,
  FleetGraphProactiveFinding,
  FleetGraphProactiveTriggerKind,
} from '@ship/shared';

const DEFAULT_BRAINTRUST_PROJECT = 'Shipshape';

interface FleetGraphTelemetryRun {
  service: FleetGraphTelemetryService | null;
  finish(input: {
    result?: FleetGraphState;
    error?: unknown;
    latencyMs: number;
  }): void;
}

interface BraintrustNodeSpanHandle extends FleetGraphTelemetrySpanHandle {
  id: string | null;
  span: Span | null;
}

type BraintrustSpanHandle = BraintrustNodeSpanHandle;

let fleetGraphLogger: Logger<true> | null | undefined;
let loggedInitFailure = false;

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getBraintrustLogger(): Logger<true> | null {
  const apiKey = getEnv('BRAINTRUST_API_KEY');
  if (!apiKey) {
    return null;
  }

  if (fleetGraphLogger !== undefined) {
    return fleetGraphLogger;
  }

  try {
    fleetGraphLogger = initLogger({
      apiKey,
      projectName: getEnv('BRAINTRUST_PROJECT') ?? DEFAULT_BRAINTRUST_PROJECT,
      orgName: getEnv('BRAINTRUST_ORG_NAME'),
      appUrl: getEnv('BRAINTRUST_APP_URL'),
      asyncFlush: true,
    });
  } catch (error) {
    fleetGraphLogger = null;
    if (!loggedInitFailure) {
      console.error('Failed to initialize FleetGraph Braintrust logger:', error);
      loggedInitFailure = true;
    }
  }

  return fleetGraphLogger;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
}

function extractSpanId(span: Span | null | undefined): string | null {
  if (!span || typeof span !== 'object') {
    return null;
  }

  const maybeId = (span as { id?: unknown }).id;
  return typeof maybeId === 'string' ? maybeId : null;
}

function startChildSpan(parent: Span | null, input: Record<string, unknown>): Span | null {
  if (!parent) {
    return null;
  }

  try {
    const typedParent = parent as unknown as {
      startSpan?: (args: Record<string, unknown>) => Span;
    };

    return typedParent.startSpan ? typedParent.startSpan(input) : null;
  } catch (error) {
    console.error('Failed to start FleetGraph child span:', error);
    return null;
  }
}

class FleetGraphBraintrustTelemetryService implements FleetGraphTelemetryService {
  constructor(
    private readonly rootSpan: Span | null,
    private readonly langsmithRunId: string | null
  ) {}

  getTopLevelSpanId(): string | null {
    return extractSpanId(this.rootSpan);
  }

  getLangSmithRunId(): string | null {
    return this.langsmithRunId;
  }

  startNodeSpan(input: {
    nodeName: string;
    phase: string;
    mode: string | null;
    surface: string | null;
    route: string | null;
    entityType: string | null;
    weekId: string | null;
    projectId: string | null;
    programId: string | null;
    triggerType: string | null;
  }): FleetGraphTelemetrySpanHandle | null {
    const span = startChildSpan(this.rootSpan, {
      name: `fleetgraph.${input.nodeName}`,
      type: 'task',
      spanAttributes: {
        phase: input.phase,
        mode: input.mode ?? 'unknown',
        trigger_type: input.triggerType ?? 'unknown',
      },
      event: {
        metadata: {
          node: input.nodeName,
          phase: input.phase,
          mode: input.mode,
          trigger_type: input.triggerType,
          surface: input.surface,
          route: input.route,
          entity_type: input.entityType,
          week_id: input.weekId,
          project_id: input.projectId,
          program_id: input.programId,
        },
      },
    });

    const handle: BraintrustNodeSpanHandle = {
      id: extractSpanId(span),
      span,
    };

    return handle;
  }

  startToolSpan(input: {
    toolName: string;
    toolVersion: string;
    mode: string | null;
    surface: string | null;
    route: string | null;
    questionTheme: string | null;
  }): FleetGraphTelemetrySpanHandle | null {
    const span = startChildSpan(this.rootSpan, {
      name: `fleetgraph.tool.${input.toolName}`,
      type: 'task',
      spanAttributes: {
        mode: input.mode ?? 'unknown',
        tool_name: input.toolName,
        tool_version: input.toolVersion,
      },
      event: {
        metadata: {
          tool_name: input.toolName,
          tool_version: input.toolVersion,
          mode: input.mode,
          surface: input.surface,
          route: input.route,
          question_theme: input.questionTheme,
        },
      },
    });

    const handle: BraintrustSpanHandle = {
      id: extractSpanId(span),
      span,
    };

    return handle;
  }

  finishNodeSpan(
    handle: FleetGraphTelemetrySpanHandle | null,
    input: {
      status: 'ok' | 'interrupted' | 'guardrail_stop' | 'error';
      latencyMs: number;
      signalSeverity: string | null;
      reasoningSource: string | null;
      actionOutcome: string | null;
      errorClass: string | null;
      metadata?: Record<string, unknown>;
    }
  ): void {
    const typedHandle = handle as BraintrustNodeSpanHandle | null;
    if (!typedHandle?.span) {
      return;
    }

    try {
      typedHandle.span.log({
        metadata: {
          status: input.status,
          signal_severity: input.signalSeverity,
          reasoning_source: input.reasoningSource,
          action_outcome: input.actionOutcome,
          error_class: input.errorClass,
          ...(input.metadata ?? {}),
        },
        metrics: {
          latency_ms: input.latencyMs,
        },
      });
    } catch (error) {
      console.error('Failed to record FleetGraph child span data:', error);
    } finally {
      try {
        typedHandle.span.close();
      } catch (error) {
        console.error('Failed to close FleetGraph child span:', error);
      }
    }
  }

  finishToolSpan(
    handle: FleetGraphTelemetrySpanHandle | null,
    input: {
      status: 'ok' | 'error';
      latencyMs: number;
      cacheHit: boolean;
      resultCount: number | null;
      errorCode: string | null;
      metadata?: Record<string, unknown>;
    }
  ): void {
    const typedHandle = handle as BraintrustSpanHandle | null;
    if (!typedHandle?.span) {
      return;
    }

    try {
      typedHandle.span.log({
        metadata: {
          status: input.status,
          cache_hit: input.cacheHit,
          result_count: input.resultCount,
          error_code: input.errorCode,
          ...(input.metadata ?? {}),
        },
        metrics: {
          latency_ms: input.latencyMs,
        },
      });
    } catch (error) {
      console.error('Failed to record FleetGraph tool span data:', error);
    } finally {
      try {
        typedHandle.span.close();
      } catch (error) {
        console.error('Failed to close FleetGraph tool span:', error);
      }
    }
  }

  recordApproval(input: {
    actionType: string;
    decisionOutcome: string;
    riskLevel: string | null;
    targetRoute: string | null;
    latencyMs: number;
    metadata?: Record<string, unknown>;
  }): void {
    const span = startChildSpan(this.rootSpan, {
      name: 'fleetgraph.approval',
      type: 'task',
      spanAttributes: {
        action_type: input.actionType,
        decision_outcome: input.decisionOutcome,
      },
      event: {
        metadata: {
          action_type: input.actionType,
          decision_outcome: input.decisionOutcome,
          risk_level: input.riskLevel,
          target_route: input.targetRoute,
          ...(input.metadata ?? {}),
        },
      },
    });

    if (!span) {
      return;
    }

    try {
      span.log({
        metadata: {
          action_type: input.actionType,
          decision_outcome: input.decisionOutcome,
          risk_level: input.riskLevel,
          target_route: input.targetRoute,
          ...(input.metadata ?? {}),
        },
        metrics: {
          latency_ms: input.latencyMs,
        },
      });
    } catch (error) {
      console.error('Failed to record FleetGraph approval telemetry:', error);
    } finally {
      try {
        span.close();
      } catch (error) {
        console.error('Failed to close FleetGraph approval span:', error);
      }
    }
  }
}

export function createFleetGraphTelemetryRun(
  input: FleetGraphRunInput,
  logger: FleetGraphLogger
): FleetGraphTelemetryRun {
  const telemetryLogger = getBraintrustLogger();
  if (!telemetryLogger) {
    return {
      service: null,
      finish() {},
    };
  }

  let rootSpan: Span | null = null;

  try {
    const traceMetadata = input.trace?.metadata ?? null;
    rootSpan = telemetryLogger.startSpan({
      name: input.triggerType === 'resume' ? 'fleetgraph.resume' : 'fleetgraph.invoke',
      type: 'task',
      spanAttributes: {
        mode: input.mode,
        trigger_type: input.triggerType,
      },
      event: {
        input: {
          run_id: input.runId ?? null,
          thread_id: traceMetadata?.threadId ?? input.runId ?? null,
          mode: input.mode,
          trigger_type: input.triggerType,
          workspace_id: input.workspaceId,
          question: input.prompt?.question ?? null,
          question_source: input.prompt?.questionSource ?? null,
          question_theme: traceMetadata?.questionTheme ?? null,
        },
        metadata: {
          surface: traceMetadata?.activeViewSurface ?? input.activeView?.surface ?? null,
          route: traceMetadata?.activeViewRoute ?? input.activeView?.route ?? null,
          entity_type:
            traceMetadata?.contextEntityType ??
            input.contextEntity?.type ??
            input.activeView?.entity.type ??
            null,
          week_id: traceMetadata?.weekId ?? null,
          project_id: traceMetadata?.projectId ?? input.activeView?.projectId ?? null,
          program_id: traceMetadata?.programId ?? null,
          issue_id: traceMetadata?.issueId ?? null,
          person_id: traceMetadata?.personId ?? null,
          actor_id: traceMetadata?.actorId ?? null,
          actor_kind: traceMetadata?.actorKind ?? null,
          actor_role: traceMetadata?.actorRole ?? null,
          actor_work_persona: traceMetadata?.actorWorkPersona ?? null,
          active_entity_id: traceMetadata?.activeEntityId ?? null,
          active_entity_type: traceMetadata?.activeEntityType ?? null,
          context_entity_id: traceMetadata?.contextEntityId ?? null,
          context_entity_type: traceMetadata?.contextEntityType ?? null,
          trace_schema_version: traceMetadata?.schemaVersion ?? null,
          tags: input.trace?.tags ?? [],
        },
      },
    });
  } catch (error) {
    logger.warn('FleetGraph Braintrust root span failed to start', {
      message: error instanceof Error ? error.message : 'Unknown Braintrust span start failure',
    });
  }

  const service = new FleetGraphBraintrustTelemetryService(rootSpan, null);

  return {
    service,
    finish({ result, error, latencyMs }) {
      if (!rootSpan) {
        return;
      }

      try {
        rootSpan.log({
          output: result
            ? {
                status: result.status,
                stage: result.stage,
                terminal_outcome: result.terminalOutcome,
              }
            : null,
          error: error ? serializeError(error) : undefined,
          metadata: {
            surface: result?.activeView?.surface ?? input.activeView?.surface ?? null,
            route: result?.activeView?.route ?? input.activeView?.route ?? null,
            entity_type:
              result?.contextEntity?.type ??
              input.contextEntity?.type ??
              input.activeView?.entity.type ??
              null,
            week_id: result?.expandedScope.weekId ?? null,
            project_id: result?.expandedScope.projectId ?? input.activeView?.projectId ?? null,
            program_id: result?.expandedScope.programId ?? null,
            signal_severity: result?.derivedSignals.severity ?? null,
            reasoning_source: result?.reasoningSource ?? null,
            action_outcome: result?.actionResult?.outcome ?? null,
            error_class: result?.error?.code ?? (error instanceof Error ? error.name : null),
            terminal_outcome: result?.terminalOutcome ?? null,
            question_source: result?.prompt?.questionSource ?? input.prompt?.questionSource ?? null,
          },
          metrics: {
            latency_ms: latencyMs,
            transition_count: result?.guard.transitionCount ?? 0,
            reasoning_attempts: result?.attempts.reasoning ?? 0,
            resume_attempts: result?.attempts.resume ?? 0,
            action_execution_attempts: result?.attempts.actionExecution ?? 0,
            tool_call_count: result?.telemetry.toolCallCount ?? 0,
            tool_failure_count: result?.telemetry.toolFailureCount ?? 0,
            total_tool_latency_ms: result?.telemetry.totalToolLatencyMs ?? 0,
            approval_count: result?.telemetry.approvalCount ?? 0,
          },
        });
      } catch (spanError) {
        logger.warn('FleetGraph Braintrust root span failed to log', {
          message:
            spanError instanceof Error
              ? spanError.message
              : 'Unknown Braintrust span finish failure',
        });
      } finally {
        try {
          rootSpan.close();
        } catch (closeError) {
          logger.warn('FleetGraph Braintrust root span failed to close', {
            message:
              closeError instanceof Error
                ? closeError.message
                : 'Unknown Braintrust close failure',
          });
        }
      }
    },
  };
}

export function recordFleetGraphFeedback(
  input: {
    workspaceId: string | null;
    actorId: string | null;
    actorRole: string | null;
    feedback: FleetGraphFeedbackEventRequest;
  },
  logger: FleetGraphLogger
): void {
  const telemetryLogger = getBraintrustLogger();
  if (!telemetryLogger) {
    return;
  }

  let span: Span | null = null;

  try {
    span = telemetryLogger.startSpan({
      name: `fleetgraph.feedback.${input.feedback.event_name}`,
      type: 'task',
      spanAttributes: {
        event_name: input.feedback.event_name,
      },
      event: {
        input: {
          thread_id: input.feedback.thread_id ?? null,
          turn_id: input.feedback.turn_id ?? null,
          question_source: input.feedback.question_source ?? null,
          question_theme: input.feedback.question_theme ?? null,
          answer_mode: input.feedback.answer_mode ?? null,
          finding_id: input.feedback.finding_context?.finding_id ?? null,
          signal_kinds: input.feedback.finding_context?.signal_kinds ?? [],
        },
        metadata: {
          workspace_id: input.workspaceId,
          actor_id: input.actorId,
          actor_role: input.actorRole,
          route: input.feedback.surface.route,
          active_view_surface: input.feedback.surface.activeViewSurface,
          entity_type: input.feedback.surface.entityType,
          page_context_kind: input.feedback.surface.pageContextKind,
          tab: input.feedback.surface.tab,
          project_id: input.feedback.surface.projectId,
          route_action_label: input.feedback.route_action?.label ?? null,
          route_action_route: input.feedback.route_action?.route ?? null,
          route_action_featured: input.feedback.route_action?.featured ?? null,
          route_action_intent: input.feedback.route_action?.intent ?? null,
          finding_delivery_source: input.feedback.finding_context?.delivery_source ?? null,
          finding_audience_role: input.feedback.finding_context?.audience_role ?? null,
          finding_audience_scope: input.feedback.finding_context?.audience_scope ?? null,
          finding_delivery_reason: input.feedback.finding_context?.delivery_reason ?? null,
          finding_severity: input.feedback.finding_context?.severity ?? null,
        },
      },
    });

    if (!span) {
      return;
    }

    span.log({
      metadata: {
        workspace_id: input.workspaceId,
        actor_id: input.actorId,
        actor_role: input.actorRole,
        route: input.feedback.surface.route,
        active_view_surface: input.feedback.surface.activeViewSurface,
        entity_type: input.feedback.surface.entityType,
        page_context_kind: input.feedback.surface.pageContextKind,
        tab: input.feedback.surface.tab,
        project_id: input.feedback.surface.projectId,
        question_source: input.feedback.question_source ?? null,
        question_theme: input.feedback.question_theme ?? null,
        answer_mode: input.feedback.answer_mode ?? null,
        route_action_label: input.feedback.route_action?.label ?? null,
        route_action_route: input.feedback.route_action?.route ?? null,
        route_action_featured: input.feedback.route_action?.featured ?? null,
        route_action_intent: input.feedback.route_action?.intent ?? null,
        finding_id: input.feedback.finding_context?.finding_id ?? null,
        finding_delivery_source: input.feedback.finding_context?.delivery_source ?? null,
        finding_audience_role: input.feedback.finding_context?.audience_role ?? null,
        finding_audience_scope: input.feedback.finding_context?.audience_scope ?? null,
        finding_delivery_reason: input.feedback.finding_context?.delivery_reason ?? null,
        finding_severity: input.feedback.finding_context?.severity ?? null,
      },
      metrics: {
        latency_ms: input.feedback.latency_ms ?? 0,
      },
    });
  } catch (error) {
    logger.warn('FleetGraph feedback telemetry failed to record', {
      message: error instanceof Error ? error.message : 'Unknown FleetGraph feedback telemetry failure',
      eventName: input.feedback.event_name,
    });
  } finally {
    try {
      span?.close();
    } catch (error) {
      logger.warn('FleetGraph feedback telemetry span failed to close', {
        message: error instanceof Error ? error.message : 'Unknown FleetGraph feedback span close failure',
      });
    }
  }
}

export function recordFleetGraphProactiveDelivery(
  input: {
    workspaceId: string;
    weekId: string;
    projectId: string | null;
    programId: string | null;
    findingId: string;
    targetUserId: string;
    audienceRole: FleetGraphProactiveAudienceRole;
    audienceScope: FleetGraphProactiveAudienceScope;
    deliverySource: FleetGraphProactiveDeliverySource;
    deliveryReason: string | null;
    severity: FleetGraphProactiveFinding['severity'];
    signalKinds: string[];
    route: string;
    shouldNotify: boolean;
    triggerKind?: FleetGraphProactiveTriggerKind | null;
    langsmithRunId?: string | null;
    langsmithRunUrl?: string | null;
    langsmithShareUrl?: string | null;
  },
  logger: FleetGraphLogger
): void {
  const telemetryLogger = getBraintrustLogger();
  if (!telemetryLogger) {
    return;
  }

  let span: Span | null = null;

  try {
    span = telemetryLogger.startSpan({
      name: 'fleetgraph.proactive.delivery',
      type: 'task',
      spanAttributes: {
        delivery_source: input.deliverySource,
        audience_role: input.audienceRole,
        audience_scope: input.audienceScope,
        severity: input.severity,
      },
      event: {
        input: {
          finding_id: input.findingId,
          signal_kinds: input.signalKinds,
          trigger_kind: input.triggerKind ?? null,
          delivery_reason: input.deliveryReason ?? null,
        },
        metadata: {
          workspace_id: input.workspaceId,
          week_id: input.weekId,
          project_id: input.projectId,
          program_id: input.programId,
          target_user_id: input.targetUserId,
          audience_role: input.audienceRole,
          audience_scope: input.audienceScope,
          delivery_source: input.deliverySource,
          route: input.route,
          should_notify: input.shouldNotify,
          langsmith_run_id: input.langsmithRunId ?? null,
          langsmith_run_url: input.langsmithRunUrl ?? null,
          langsmith_share_url: input.langsmithShareUrl ?? null,
        },
      },
    });

    if (!span) {
      return;
    }

    span.log({
      metadata: {
        workspace_id: input.workspaceId,
        week_id: input.weekId,
        project_id: input.projectId,
        program_id: input.programId,
        finding_id: input.findingId,
        target_user_id: input.targetUserId,
        audience_role: input.audienceRole,
        audience_scope: input.audienceScope,
        delivery_source: input.deliverySource,
        delivery_reason: input.deliveryReason ?? null,
        route: input.route,
        trigger_kind: input.triggerKind ?? null,
        langsmith_run_id: input.langsmithRunId ?? null,
        langsmith_run_url: input.langsmithRunUrl ?? null,
        langsmith_share_url: input.langsmithShareUrl ?? null,
      },
      metrics: {
        should_notify: input.shouldNotify ? 1 : 0,
      },
    });
  } catch (error) {
    logger.warn('FleetGraph proactive delivery telemetry failed to record', {
      message:
        error instanceof Error
          ? error.message
          : 'Unknown FleetGraph proactive delivery telemetry failure',
      findingId: input.findingId,
      deliverySource: input.deliverySource,
    });
  } finally {
    try {
      span?.close();
    } catch (error) {
      logger.warn('FleetGraph proactive delivery telemetry span failed to close', {
        message:
          error instanceof Error
            ? error.message
            : 'Unknown FleetGraph proactive delivery span close failure',
      });
    }
  }
}
