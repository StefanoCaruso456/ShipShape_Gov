import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createFleetGraph,
  createFleetGraphRunnableConfig,
  createFleetGraphRuntime,
  type FleetGraphRunInput,
  type FleetGraphShipApiClient,
} from '@ship/fleetgraph';
import type { FleetGraphOnDemandRequest } from '@ship/shared';
import { authMiddleware, getAuthContext } from '../middleware/auth.js';

const router = Router();
const graph = createFleetGraph();

const activeViewSchema = z.object({
  entity: z.object({
    id: z.string().uuid(),
    type: z.enum(['issue', 'week', 'project', 'program', 'person']),
    sourceDocumentType: z.enum([
      'wiki',
      'issue',
      'program',
      'project',
      'sprint',
      'person',
      'weekly_plan',
      'weekly_retro',
      'standup',
      'weekly_review',
    ]),
  }),
  surface: z.enum(['document', 'dashboard', 'my_week', 'week', 'project', 'program', 'issue', 'person']),
  route: z.string().min(1),
  tab: z.string().nullable(),
  projectId: z.string().uuid().nullable(),
});

const onDemandRequestSchema = z.object({
  active_view: activeViewSchema,
  question: z.string().trim().min(1).nullable().optional(),
});

function buildInternalApiUrl(path: string): string {
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
  return new URL(path, baseUrl).toString();
}

function createRequestScopedShipApiClient(req: Request): FleetGraphShipApiClient {
  const cookieHeader = req.headers.cookie;
  const authHeader = req.headers.authorization;

  const baseHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  if (cookieHeader) {
    baseHeaders.cookie = cookieHeader;
  }

  if (typeof authHeader === 'string') {
    baseHeaders.authorization = authHeader;
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

router.post('/on-demand', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }

    const parsed = onDemandRequestSchema.safeParse(req.body satisfies FleetGraphOnDemandRequest);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid FleetGraph on-demand request',
        details: parsed.error.flatten(),
      });
      return;
    }

    const runtime = createFleetGraphRuntime({
      shipApi: createRequestScopedShipApiClient(req),
      logger: {
        debug: (message, meta) => console.debug(message, meta),
        info: (message, meta) => console.info(message, meta),
        warn: (message, meta) => console.warn(message, meta),
        error: (message, meta) => console.error(message, meta),
      },
    });

    const input: FleetGraphRunInput = {
      runId: randomUUID(),
      mode: 'on_demand',
      triggerType: 'user_invoke',
      workspaceId: authContext.workspaceId,
      actor: {
        id: authContext.userId,
        kind: 'user',
        role: req.workspaceRole ?? null,
      },
      activeView: parsed.data.active_view,
      contextEntity: {
        id: parsed.data.active_view.entity.id,
        type: parsed.data.active_view.entity.type,
      },
      prompt: {
        question: parsed.data.question ?? null,
      },
      trace: {
        runName: 'fleetgraph-on-demand',
        tags: [
          'fleetgraph',
          'on-demand',
          parsed.data.active_view.entity.type,
          parsed.data.active_view.surface,
        ],
      },
    };

    const result = await graph.invoke(
      input,
      createFleetGraphRunnableConfig(runtime, {
        checkpointNamespace: 'fleetgraph',
        tags: input.trace?.tags,
      })
    );

    res.json({
      status: result.status,
      stage: result.stage,
      mode: result.mode,
      triggerType: result.triggerType,
      activeView: result.activeView,
      expandedScope: result.expandedScope,
      fetched: result.fetched,
      derivedSignals: result.derivedSignals,
      finding: result.finding,
      error: result.error,
      trace: result.trace,
    });
  } catch (error) {
    console.error('FleetGraph on-demand invoke error:', error);
    res.status(500).json({ error: 'Failed to run FleetGraph on-demand analysis' });
  }
});

export default router;
