import { randomUUID } from 'crypto';
import type { Request } from 'express';
import {
  createFleetGraph,
  createFleetGraphRunnableConfig,
  createFleetGraphRuntime,
  type FleetGraphLogger,
  type FleetGraphRunInput,
  type FleetGraphShipApiClient,
  type FleetGraphState,
} from '@ship/fleetgraph';

const graph = createFleetGraph();

function buildInternalApiUrl(path: string): string {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
  return new URL(path, baseUrl).toString();
}

function createHeaderScopedShipApiClient(headers: {
  cookieHeader?: string;
  authHeader?: string;
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
  });
}

export function createApiTokenShipApiClient(apiToken: string): FleetGraphShipApiClient {
  return createHeaderScopedShipApiClient({
    authHeader: `Bearer ${apiToken}`,
  });
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
): Promise<FleetGraphState> {
  const normalizedInput: FleetGraphRunInput = {
    ...input,
    runId: input.runId ?? randomUUID(),
  };

  const runtime = createFleetGraphRuntime({
    shipApi: options.shipApi,
    logger: options.logger ?? createFleetGraphLogger('FleetGraph'),
  });

  return graph.invoke(
    normalizedInput,
    createFleetGraphRunnableConfig(runtime, {
      threadId: normalizedInput.runId,
      checkpointNamespace: options.checkpointNamespace ?? 'fleetgraph',
      tags: normalizedInput.trace?.tags,
    })
  );
}
