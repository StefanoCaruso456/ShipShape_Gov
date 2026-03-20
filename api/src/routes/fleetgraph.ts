import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  type FleetGraphRunInput,
} from '@ship/fleetgraph';
import type {
  FleetGraphOnDemandRequest,
  FleetGraphOnDemandResumeRequest,
} from '@ship/shared';
import { authMiddleware, getAuthContext } from '../middleware/auth.js';
import {
  createFleetGraphLogger,
  createRequestScopedShipApiClient,
  invokeFleetGraph,
  resumeFleetGraph,
  type FleetGraphInvokeResult,
} from '../services/fleetgraph-runner.js';
import {
  listFleetGraphFindingsForUser,
  runFleetGraphProactiveSweep,
} from '../services/fleetgraph-proactive.js';

const router = Router();
const fleetGraphLogger = createFleetGraphLogger('FleetGraph route');

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

const pageContextSchema = z.object({
  kind: z.enum([
    'dashboard',
    'my_week',
    'programs',
    'projects',
    'issues',
    'issue_surface',
    'documents',
    'document',
    'team_directory',
    'person',
    'settings',
    'generic',
  ]),
  route: z.string().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  emptyState: z.boolean(),
  metrics: z.array(
    z.object({
      label: z.string().trim().min(1),
      value: z.string().trim().min(1),
    })
  ).max(8),
  items: z.array(
    z.object({
      label: z.string().trim().min(1),
      detail: z.string().trim().max(500).nullable().optional(),
      route: z.string().trim().min(1).nullable().optional(),
    })
  ).max(10),
  actions: z.array(
    z.object({
      label: z.string().trim().min(1),
      route: z.string().trim().min(1),
    })
  ).max(6).optional(),
});

const onDemandRequestSchema = z.object({
  active_view: activeViewSchema.nullable().optional(),
  page_context: pageContextSchema.nullable().optional(),
  question: z.string().trim().min(1).nullable().optional(),
}).refine((value) => Boolean(value.active_view || value.page_context), {
  message: 'FleetGraph on-demand requests require either active_view or page_context',
  path: ['active_view'],
});

const onDemandResumeRequestSchema = z.object({
  thread_id: z.string().min(1),
  decision: z.object({
    outcome: z.enum(['approve', 'dismiss', 'snooze']),
    note: z.string().trim().max(2000).nullable().optional(),
    snooze_minutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  }),
});

const proactiveRunRequestSchema = z.object({
  week_id: z.string().uuid().optional(),
});

const findingsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

function canRunProactiveSweep(req: Request): boolean {
  return req.isApiToken === true || req.isSuperAdmin === true || req.workspaceRole === 'admin';
}

function extractPendingApproval(result: FleetGraphInvokeResult) {
  const interruptValue = result.__interrupt__?.[0]?.value;
  if (!interruptValue || typeof interruptValue !== 'object') {
    return null;
  }

  const maybePendingApproval = (interruptValue as { pendingApproval?: unknown }).pendingApproval;
  return maybePendingApproval && typeof maybePendingApproval === 'object'
    ? maybePendingApproval
    : null;
}

function buildOnDemandResponse(result: FleetGraphInvokeResult, threadId: string | null) {
  const pendingApproval = extractPendingApproval(result);
  const isInterrupted = pendingApproval !== null;

  return {
    threadId,
    status: isInterrupted ? 'waiting_on_human' : result.status,
    stage: isInterrupted ? 'waiting_on_human' : result.stage,
    mode: result.mode,
    triggerType: result.triggerType,
    activeView: result.activeView,
    expandedScope: result.expandedScope,
    fetched: result.fetched,
    derivedSignals: result.derivedSignals,
    finding: result.finding,
    reasoning: result.reasoning,
    proposedAction: result.proposedAction,
    pendingApproval,
    actionResult: result.actionResult,
    attempts: result.attempts,
    guard: result.guard,
    timing: result.timing,
    reasoningSource: result.reasoningSource,
    suppressionReason: result.suppressionReason,
    terminalOutcome: isInterrupted ? 'waiting_on_human' : result.terminalOutcome,
    error: result.error,
    lastNode: result.lastNode,
    nodeHistory: result.nodeHistory,
    telemetry: result.telemetry,
    trace: result.trace,
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
      activeView: parsed.data.active_view ?? null,
      contextEntity: parsed.data.active_view
        ? {
            id: parsed.data.active_view.entity.id,
            type: parsed.data.active_view.entity.type,
          }
        : null,
      prompt: {
        question: parsed.data.question ?? null,
        pageContext: parsed.data.page_context ?? null,
      },
      trace: {
        runName: 'fleetgraph-on-demand',
        tags: [
          'fleetgraph',
          'on-demand',
          parsed.data.active_view?.entity.type ?? parsed.data.page_context?.kind ?? 'current-view',
          parsed.data.active_view?.surface ?? 'current-view',
        ],
      },
    };

    const result = await invokeFleetGraph(input, {
      shipApi: createRequestScopedShipApiClient(req),
      logger: fleetGraphLogger,
      checkpointNamespace: 'fleetgraph',
    });

    res.json(buildOnDemandResponse(result, input.runId ?? null));
  } catch (error) {
    console.error('FleetGraph on-demand invoke error:', error);
    res.status(500).json({ error: 'Failed to run FleetGraph on-demand analysis' });
  }
});

router.post('/on-demand/resume', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }

    const parsed = onDemandResumeRequestSchema.safeParse(
      req.body satisfies FleetGraphOnDemandResumeRequest
    );
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid FleetGraph on-demand resume request',
        details: parsed.error.flatten(),
      });
      return;
    }

    const result = await resumeFleetGraph(
      parsed.data.thread_id,
      {
        outcome: parsed.data.decision.outcome,
        note: parsed.data.decision.note ?? undefined,
        snoozeMinutes: parsed.data.decision.snooze_minutes ?? undefined,
      },
      {
        shipApi: createRequestScopedShipApiClient(req),
        logger: fleetGraphLogger,
        checkpointNamespace: 'fleetgraph',
        tags: ['fleetgraph', 'on-demand', 'resume'],
      }
    );

    res.json(buildOnDemandResponse(result, parsed.data.thread_id));
  } catch (error) {
    console.error('FleetGraph on-demand resume error:', error);
    res.status(500).json({ error: 'Failed to resume FleetGraph on-demand analysis' });
  }
});

router.post('/proactive/run', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }

    if (!canRunProactiveSweep(req)) {
      res.status(403).json({ error: 'Only workspace admins can trigger FleetGraph proactive sweeps' });
      return;
    }

    const parsed = proactiveRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid FleetGraph proactive request',
        details: parsed.error.flatten(),
      });
      return;
    }

    const result = await runFleetGraphProactiveSweep({
      workspaceId: authContext.workspaceId,
      weekId: parsed.data.week_id,
      shipApi: createRequestScopedShipApiClient(req),
      logger: fleetGraphLogger,
    });

    res.json({
      status: 'ok',
      workspaceId: authContext.workspaceId,
      processedWeeks: result.processedWeeks,
      surfacedFindings: result.surfacedFindings,
      newNotifications: result.newNotifications,
      findings: result.findings,
    });
  } catch (error) {
    console.error('FleetGraph proactive sweep error:', error);
    res.status(500).json({ error: 'Failed to run FleetGraph proactive sweep' });
  }
});

router.get('/findings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authContext = getAuthContext(req, res);
    if (!authContext) {
      return;
    }

    const parsed = findingsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid FleetGraph findings query',
        details: parsed.error.flatten(),
      });
      return;
    }

    const findings = await listFleetGraphFindingsForUser({
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      limit: parsed.data.limit,
    });

    res.json({ findings });
  } catch (error) {
    console.error('FleetGraph findings lookup error:', error);
    res.status(500).json({ error: 'Failed to load FleetGraph findings' });
  }
});

export default router;
