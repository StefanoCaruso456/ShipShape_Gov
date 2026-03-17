import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  type FleetGraphRunInput,
} from '@ship/fleetgraph';
import type { FleetGraphOnDemandRequest } from '@ship/shared';
import { authMiddleware, getAuthContext } from '../middleware/auth.js';
import {
  createFleetGraphLogger,
  createRequestScopedShipApiClient,
  invokeFleetGraph,
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

const onDemandRequestSchema = z.object({
  active_view: activeViewSchema,
  question: z.string().trim().min(1).nullable().optional(),
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

    const result = await invokeFleetGraph(input, {
      shipApi: createRequestScopedShipApiClient(req),
      logger: fleetGraphLogger,
      checkpointNamespace: 'fleetgraph',
    });

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
