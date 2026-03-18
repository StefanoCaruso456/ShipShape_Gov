import { randomUUID } from 'crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  FleetGraphActionMemoryRecord,
  FleetGraphHumanDecision,
  FleetGraphProposedAction,
  FleetGraphReasoning,
  FleetGraphReasoningSource,
  FleetGraphSignalSeverity,
} from './types.js';

export interface FleetGraphLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface FleetGraphCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
}

export interface FleetGraphShipApiClient {
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
}

export interface FleetGraphReasoningService {
  reasonAboutSprint(input: {
    activeViewRoute: string | null;
    question: string | null;
    findingSummary: string | null;
    derivedSignals: {
      severity: string;
      summary: string | null;
      reasons: string[];
      metrics: Record<string, unknown>;
      signals: Array<{
        kind: string;
        severity: string;
        summary: string;
        evidence: string[];
      }>;
    };
    fetched: Record<string, unknown>;
  }): Promise<FleetGraphReasoning | null>;
}

export interface FleetGraphActionMemoryStore {
  getLatestDecision(input: {
    workspaceId: string;
    weekId: string;
    actorUserId: string;
    actionFingerprint: string;
    now: Date;
  }): Promise<FleetGraphActionMemoryRecord | null>;
  recordDecision(input: {
    workspaceId: string;
    weekId: string;
    actorUserId: string;
    actionFingerprint: string;
    actionType: FleetGraphProposedAction['type'];
    proposalSummary: string;
    draftComment: string;
    decision: FleetGraphHumanDecision;
    now: Date;
    executedCommentId?: string | null;
  }): Promise<FleetGraphActionMemoryRecord>;
}

export interface FleetGraphGuardrailConfig {
  maxTransitions: number;
  maxRetries: number;
  maxResumeCount: number;
  maxReasoningAttempts: number;
  deadlineMs: number;
  maxNodeHistoryEntries: number;
}

export interface FleetGraphTelemetrySpanHandle {
  id: string | null;
}

export interface FleetGraphTelemetryService {
  getTopLevelSpanId(): string | null;
  getLangSmithRunId(): string | null;
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
  }): FleetGraphTelemetrySpanHandle | null;
  finishNodeSpan(
    span: FleetGraphTelemetrySpanHandle | null,
    input: {
      status: 'ok' | 'interrupted' | 'guardrail_stop' | 'error';
      latencyMs: number;
      signalSeverity: FleetGraphSignalSeverity | 'none' | null;
      reasoningSource: FleetGraphReasoningSource | null;
      actionOutcome: string | null;
      errorClass: string | null;
      metadata?: Record<string, unknown>;
    }
  ): void;
}

export interface FleetGraphRuntimeContext {
  shipApi: FleetGraphShipApiClient;
  claude: Anthropic | null;
  reasoner: FleetGraphReasoningService | null;
  actionMemory: FleetGraphActionMemoryStore | null;
  langSmithEnabled: boolean;
  guardrails: FleetGraphGuardrailConfig;
  telemetry: FleetGraphTelemetryService | null;
  logger: FleetGraphLogger;
  cache: FleetGraphCache | null;
  now(): Date;
}

export interface FleetGraphConfigurable {
  runtime: FleetGraphRuntimeContext;
  thread_id: string;
  checkpoint_ns?: string;
}

const consoleLogger: FleetGraphLogger = {
  debug(message, meta) {
    console.debug(message, meta);
  },
  info(message, meta) {
    console.info(message, meta);
  },
  warn(message, meta) {
    console.warn(message, meta);
  },
  error(message, meta) {
    console.error(message, meta);
  },
};

const noopShipApi: FleetGraphShipApiClient = {
  async get() {
    throw new Error('FleetGraph runtime shipApi.get is not configured');
  },
  async post() {
    throw new Error('FleetGraph runtime shipApi.post is not configured');
  },
};

const DEFAULT_GUARDRAILS: FleetGraphGuardrailConfig = {
  maxTransitions: 24,
  maxRetries: 2,
  maxResumeCount: 2,
  maxReasoningAttempts: 2,
  deadlineMs: 2 * 60 * 1000,
  maxNodeHistoryEntries: 40,
};

export function createFleetGraphRuntime(
  overrides: Partial<FleetGraphRuntimeContext> = {}
): FleetGraphRuntimeContext {
  return {
    shipApi: overrides.shipApi ?? noopShipApi,
    claude: overrides.claude ?? null,
    reasoner: overrides.reasoner ?? null,
    actionMemory: overrides.actionMemory ?? null,
    langSmithEnabled:
      overrides.langSmithEnabled ??
      (process.env.LANGCHAIN_TRACING_V2 === 'true' &&
        Boolean(process.env.LANGCHAIN_API_KEY)),
    guardrails: overrides.guardrails ?? DEFAULT_GUARDRAILS,
    telemetry: overrides.telemetry ?? null,
    logger: overrides.logger ?? consoleLogger,
    cache: overrides.cache ?? null,
    now: overrides.now ?? (() => new Date()),
  };
}

export function getFleetGraphRuntime(config?: RunnableConfig): FleetGraphRuntimeContext {
  const runtime = (config?.configurable as FleetGraphConfigurable | undefined)?.runtime;

  if (!runtime) {
    throw new Error('FleetGraph runtime is missing from RunnableConfig.configurable.runtime');
  }

  return runtime;
}

export function createFleetGraphRunnableConfig(
  runtime: FleetGraphRuntimeContext,
  options: {
    threadId?: string;
    checkpointNamespace?: string;
    tags?: string[];
    callbacks?: RunnableConfig['callbacks'];
  } = {}
): RunnableConfig {
  return {
    tags: options.tags,
    callbacks: options.callbacks,
    configurable: {
      runtime,
      thread_id: options.threadId ?? randomUUID(),
      checkpoint_ns: options.checkpointNamespace,
    } satisfies FleetGraphConfigurable,
  };
}
