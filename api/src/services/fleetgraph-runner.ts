import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { Command } from '@langchain/langgraph';
import {
  createFleetGraph,
  createFleetGraphRunnableConfig,
  createFleetGraphRuntime,
  type FleetGraphLogger,
  type FleetGraphRunInput,
  type FleetGraphShipApiClient,
  type FleetGraphState,
} from '@ship/fleetgraph';
import { createFleetGraphActionMemoryStore } from './fleetgraph-action-memory.js';
import {
  createFleetGraphLangSmithSession,
  resolveFleetGraphLangSmithTrace,
} from './fleetgraph-langsmith.js';
import { createFleetGraphReasoner } from './fleetgraph-reasoner.js';
import { createFleetGraphTelemetryRun } from './fleetgraph-telemetry.js';

const graph = createFleetGraph();

export type FleetGraphInvokeResult = FleetGraphState & {
  __interrupt__?: Array<{
    value?: unknown;
  }>;
};

async function enrichFleetGraphResultWithLangSmithTrace(
  result: FleetGraphInvokeResult,
  session: ReturnType<typeof createFleetGraphLangSmithSession>
): Promise<FleetGraphInvokeResult> {
  const trace = await resolveFleetGraphLangSmithTrace(session);

  return {
    ...result,
    telemetry: {
      ...result.telemetry,
      langsmithRunId: trace.runId ?? result.telemetry.langsmithRunId,
      langsmithRunUrl: trace.runUrl ?? result.telemetry.langsmithRunUrl,
      langsmithShareUrl: trace.shareUrl ?? result.telemetry.langsmithShareUrl,
    },
  };
}

function inferLoopDetected(result: FleetGraphInvokeResult): boolean {
  return (
    result.telemetry.loopDetected ||
    result.guard.lastTripReason === 'MAX_TRANSITIONS_EXCEEDED' ||
    result.guard.lastTripReason === 'MAX_RESUMES_EXCEEDED'
  );
}

function enrichFleetGraphResultTelemetry(
  result: FleetGraphInvokeResult,
  latencyMs: number
): FleetGraphInvokeResult {
  return {
    ...result,
    telemetry: {
      ...result.telemetry,
      totalLatencyMs: latencyMs,
      loopDetected: inferLoopDetected(result),
    },
  };
}

function buildInternalApiUrl(path: string): string {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
  return new URL(path, baseUrl).toString();
}

function createHeaderScopedShipApiClient(headers: {
  cookieHeader?: string;
  authHeader?: string;
  csrfHeader?: string;
}): FleetGraphShipApiClient {
  const baseHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  if (headers.cookieHeader) {
    baseHeaders.cookie = headers.cookieHeader;
  }

  if (headers.authHeader) {
    baseHeaders.authorization = headers.authHeader;
  }

  if (headers.csrfHeader) {
    baseHeaders['x-csrf-token'] = headers.csrfHeader;
  }

  return {
    async get<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(buildInternalApiUrl(path), {
        method: 'GET',
        headers: {
          ...baseHeaders,
          ...((init?.headers as Record<string, string> | undefined) ?? {}),
        },
      });

      if (!response.ok) {
        throw new Error(`Ship API GET ${path} failed with status ${response.status}`);
      }

      return response.json() as Promise<T>;
    },
    async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
      const response = await fetch(buildInternalApiUrl(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...baseHeaders,
          ...((init?.headers as Record<string, string> | undefined) ?? {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Ship API POST ${path} failed with status ${response.status}`);
      }

      return response.json() as Promise<T>;
    },
  };
}

export function createRequestScopedShipApiClient(req: Request): FleetGraphShipApiClient {
  return createHeaderScopedShipApiClient({
    cookieHeader: req.headers.cookie,
    authHeader:
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
    csrfHeader:
      typeof req.headers['x-csrf-token'] === 'string' ? req.headers['x-csrf-token'] : undefined,
  });
}

export function createApiTokenShipApiClient(
  apiToken: string,
  options?: {
    workspaceId?: string | null;
  }
): FleetGraphShipApiClient {
  const client = createHeaderScopedShipApiClient({
    authHeader: `Bearer ${apiToken}`,
  });

  const workspaceHeader =
    typeof options?.workspaceId === 'string' && options.workspaceId.length > 0
      ? { 'x-ship-workspace-id': options.workspaceId }
      : null;

  if (!workspaceHeader) {
    return client;
  }

  return {
    async get<T>(path: string, init?: RequestInit): Promise<T> {
      return client.get<T>(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...workspaceHeader,
        },
      });
    },
    async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
      return client.post<T>(path, body, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...workspaceHeader,
        },
      });
    },
  };
}

export function createFleetGraphLogger(scope: string): FleetGraphLogger {
  return {
    debug(message, meta) {
      console.debug(`[${scope}] ${message}`, meta);
    },
    info(message, meta) {
      console.info(`[${scope}] ${message}`, meta);
    },
    warn(message, meta) {
      console.warn(`[${scope}] ${message}`, meta);
    },
    error(message, meta) {
      console.error(`[${scope}] ${message}`, meta);
    },
  };
}

export async function invokeFleetGraph(
  input: FleetGraphRunInput,
  options: {
    shipApi: FleetGraphShipApiClient;
    logger?: FleetGraphLogger;
    checkpointNamespace?: string;
  }
): Promise<FleetGraphInvokeResult> {
  const normalizedInput: FleetGraphRunInput = {
    ...input,
    runId: input.runId ?? randomUUID(),
  };

  const logger = options.logger ?? createFleetGraphLogger('FleetGraph');
  const telemetryRun = createFleetGraphTelemetryRun(normalizedInput, logger);
  const langSmithSession = createFleetGraphLangSmithSession();
  const startedAt = Date.now();

  const runtime = createFleetGraphRuntime({
    shipApi: options.shipApi,
    logger,
    reasoner: createFleetGraphReasoner(logger),
    actionMemory: createFleetGraphActionMemoryStore(),
    telemetry: telemetryRun.service,
  });

  try {
    const result = (await graph.invoke(
      normalizedInput,
      createFleetGraphRunnableConfig(runtime, {
        threadId: normalizedInput.runId,
        checkpointNamespace: options.checkpointNamespace ?? 'fleetgraph',
        tags: normalizedInput.trace?.tags,
        callbacks: langSmithSession?.callbacks,
      })
    )) as FleetGraphInvokeResult;

    const enrichedResult = enrichFleetGraphResultTelemetry(
      await enrichFleetGraphResultWithLangSmithTrace(result, langSmithSession),
      Date.now() - startedAt
    );

    telemetryRun.finish({
      result: enrichedResult,
      latencyMs: enrichedResult.telemetry.totalLatencyMs ?? Date.now() - startedAt,
    });

    return enrichedResult;
  } catch (error) {
    telemetryRun.finish({
      error,
      latencyMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function resumeFleetGraph(
  threadId: string,
  resumeValue: unknown,
  options: {
    shipApi: FleetGraphShipApiClient;
    logger?: FleetGraphLogger;
    checkpointNamespace?: string;
    tags?: string[];
  }
): Promise<FleetGraphInvokeResult> {
  const logger = options.logger ?? createFleetGraphLogger('FleetGraph');
  const telemetryInput: FleetGraphRunInput = {
    runId: threadId,
    mode: 'on_demand',
    triggerType: 'resume',
    workspaceId: null,
    trace: {
      runName: 'fleetgraph-resume',
      tags: options.tags ?? ['fleetgraph', 'resume'],
    },
  };
  const telemetryRun = createFleetGraphTelemetryRun(telemetryInput, logger);
  const langSmithSession = createFleetGraphLangSmithSession();
  const startedAt = Date.now();
  const runtime = createFleetGraphRuntime({
    shipApi: options.shipApi,
    logger,
    reasoner: createFleetGraphReasoner(logger),
    actionMemory: createFleetGraphActionMemoryStore(),
    telemetry: telemetryRun.service,
  });

  try {
    const result = (await graph.invoke(
      new Command({
        resume: resumeValue,
      }),
      createFleetGraphRunnableConfig(runtime, {
        threadId,
        checkpointNamespace: options.checkpointNamespace ?? 'fleetgraph',
        tags: options.tags,
        callbacks: langSmithSession?.callbacks,
      })
    )) as FleetGraphInvokeResult;

    const enrichedResult = enrichFleetGraphResultTelemetry(
      await enrichFleetGraphResultWithLangSmithTrace(result, langSmithSession),
      Date.now() - startedAt
    );

    telemetryRun.finish({
      result: enrichedResult,
      latencyMs: enrichedResult.telemetry.totalLatencyMs ?? Date.now() - startedAt,
    });

    return enrichedResult;
  } catch (error) {
    telemetryRun.finish({
      error,
      latencyMs: Date.now() - startedAt,
    });
    throw error;
  }
}
