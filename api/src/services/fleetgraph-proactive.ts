import { randomUUID } from 'crypto';
import type { FleetGraphRunInput, FleetGraphShipApiClient } from '@ship/fleetgraph';
import type {
  FleetGraphProactiveAudienceRole,
  FleetGraphProactiveAudienceScope,
  FleetGraphProactiveDeliverySource,
  FleetGraphProactiveFinding,
  FleetGraphProactiveStatusResponse,
} from '@ship/shared';
import { pool } from '../db/client.js';
import { broadcastToUser } from '../collaboration/index.js';
import { resolveFleetGraphSweepRecipients } from './fleetgraph-proactive-targeting.js';
import {
  createApiTokenShipApiClient,
  createFleetGraphLogger,
  invokeFleetGraph,
} from './fleetgraph-runner.js';
import { recordFleetGraphLangSmithChildRun } from './fleetgraph-langsmith.js';
import { personalizeFleetGraphProactiveFinding } from './fleetgraph-proactive-personalization.js';
import { recordFleetGraphProactiveDelivery } from './fleetgraph-telemetry.js';

const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;
const PROACTIVE_ROUTE_TAB = 'issues';
const PROACTIVE_ROUTE_SURFACE = 'document';

type FleetGraphFindingSeverity = FleetGraphProactiveFinding['severity'];

interface ActiveSprintTarget {
  workspaceId: string;
  weekId: string;
  weekTitle: string;
  targetUserId: string | null;
}

interface PersistProactiveFindingInput {
  workspaceId: string;
  weekId: string;
  projectId: string | null;
  programId: string | null;
  targetUserId: string;
  audienceRole: FleetGraphProactiveAudienceRole;
  audienceScope: FleetGraphProactiveAudienceScope;
  deliverySource: FleetGraphProactiveDeliverySource;
  deliveryReason: string | null;
  title: string | null;
  summary: string;
  severity: FleetGraphFindingSeverity;
  route: string;
  surface: FleetGraphProactiveFinding['surface'];
  tab: string | null;
  signalKinds: string[];
  signalSignature: string;
  payload: Record<string, unknown>;
  now: Date;
  cooldownMs: number;
}

interface PersistProactiveFindingResult {
  finding: FleetGraphProactiveFinding;
  shouldNotify: boolean;
}

export interface FleetGraphProactiveSweepResult {
  processedWeeks: number;
  processedWorkspaces: number;
  surfacedFindings: number;
  newNotifications: number;
  findings: FleetGraphProactiveFinding[];
}

type FleetGraphProactiveWorkerState = FleetGraphProactiveStatusResponse['workerState'];

const proactiveRuntimeState: {
  workerState: FleetGraphProactiveWorkerState;
  startedAt: string | null;
  running: boolean;
  lastSweepStartedAt: string | null;
  lastSweepFinishedAt: string | null;
  lastSweepError: string | null;
  lastSweepWorkspaceCount: number | null;
  lastSweepProcessedWeeks: number | null;
  lastSweepSurfacedFindings: number | null;
  lastSweepNewNotifications: number | null;
} = {
  workerState: 'disabled',
  startedAt: null,
  running: false,
  lastSweepStartedAt: null,
  lastSweepFinishedAt: null,
  lastSweepError: null,
  lastSweepWorkspaceCount: null,
  lastSweepProcessedWeeks: null,
  lastSweepSurfacedFindings: null,
  lastSweepNewNotifications: null,
};

function getCooldownMs(): number {
  const parsed = Number.parseInt(process.env.FLEETGRAPH_FINDING_COOLDOWN_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COOLDOWN_MS;
}

function getSweepIntervalMs(): number {
  const parsed = Number.parseInt(process.env.FLEETGRAPH_PROACTIVE_SWEEP_INTERVAL_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SWEEP_INTERVAL_MS;
}

export function getFleetGraphProactiveStatus(): FleetGraphProactiveStatusResponse {
  const enabled = process.env.FLEETGRAPH_ENABLE_PROACTIVE_WORKER === 'true';
  const apiTokenConfigured = Boolean(process.env.FLEETGRAPH_INTERNAL_API_TOKEN?.trim());

  return {
    workerState: proactiveRuntimeState.workerState,
    workerEnabled: enabled,
    apiTokenConfigured,
    intervalMs: getSweepIntervalMs(),
    cooldownMs: getCooldownMs(),
    startedAt: proactiveRuntimeState.startedAt,
    running: proactiveRuntimeState.running,
    lastSweepStartedAt: proactiveRuntimeState.lastSweepStartedAt,
    lastSweepFinishedAt: proactiveRuntimeState.lastSweepFinishedAt,
    lastSweepError: proactiveRuntimeState.lastSweepError,
    lastSweepWorkspaceCount: proactiveRuntimeState.lastSweepWorkspaceCount,
    lastSweepProcessedWeeks: proactiveRuntimeState.lastSweepProcessedWeeks,
    lastSweepSurfacedFindings: proactiveRuntimeState.lastSweepSurfacedFindings,
    lastSweepNewNotifications: proactiveRuntimeState.lastSweepNewNotifications,
  };
}

function buildSignalSignature(signalKinds: string[], weekId: string): string {
  if (signalKinds.length === 0) {
    return `${weekId}:no-signals`;
  }

  return `${weekId}:${[...signalKinds].sort().join('|')}`;
}

function buildProactiveRoute(weekId: string): string {
  return `/documents/${weekId}/${PROACTIVE_ROUTE_TAB}`;
}

function mapFindingRow(row: Record<string, unknown>): FleetGraphProactiveFinding {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    weekId: String(row.week_id),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    programId: typeof row.program_id === 'string' ? row.program_id : null,
    title: typeof row.title === 'string' ? row.title : null,
    summary: String(row.summary),
    severity: row.severity as FleetGraphFindingSeverity,
    route: String(row.route),
    surface: row.surface as FleetGraphProactiveFinding['surface'],
    tab: typeof row.tab === 'string' ? row.tab : null,
    audienceRole: row.audience_role as FleetGraphProactiveAudienceRole,
    audienceScope: row.audience_scope as FleetGraphProactiveAudienceScope,
    deliverySource: row.delivery_source as FleetGraphProactiveDeliverySource,
    deliveryReason: typeof row.delivery_reason === 'string' ? row.delivery_reason : null,
    signalKinds: Array.isArray(row.signal_kinds)
      ? row.signal_kinds.filter((kind): kind is string => typeof kind === 'string')
      : [],
    lastDetectedAt: new Date(String(row.last_detected_at)).toISOString(),
    lastNotifiedAt: new Date(String(row.last_notified_at)).toISOString(),
  };
}

async function listActiveSprintTargets(
  workspaceId: string,
  weekId?: string
): Promise<ActiveSprintTarget[]> {
  const params: Array<string> = [workspaceId];
  const filters = [
    `d.workspace_id = $1`,
    `d.document_type = 'sprint'`,
    `d.archived_at IS NULL`,
    `d.deleted_at IS NULL`,
    `COALESCE(d.properties->>'status', 'planning') = 'active'`,
  ];

  if (weekId) {
    params.push(weekId);
    filters.push(`d.id = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT
       d.workspace_id,
       d.id AS week_id,
       d.title AS week_title,
       target_user.id::text AS target_user_id
     FROM documents d
     LEFT JOIN documents owner_person
       ON d.properties->>'owner_id' IS NOT NULL
       AND owner_person.id = (d.properties->>'owner_id')::uuid
       AND owner_person.document_type = 'person'
       AND owner_person.workspace_id = d.workspace_id
     LEFT JOIN users target_user
       ON target_user.id = COALESCE(
         CASE
           WHEN (owner_person.properties->>'user_id') ~* '^[0-9a-f-]{36}$'
             THEN (owner_person.properties->>'user_id')::uuid
           ELSE NULL
         END,
         CASE
           WHEN jsonb_typeof(d.properties->'assignee_ids') = 'array'
             AND (d.properties->'assignee_ids'->>0) ~* '^[0-9a-f-]{36}$'
             THEN (d.properties->'assignee_ids'->>0)::uuid
           ELSE NULL
         END
       )
     WHERE ${filters.join(' AND ')}
     ORDER BY ((d.properties->>'sprint_number')::int) DESC NULLS LAST, d.created_at DESC`,
    params
  );

  return result.rows.map((row) => ({
    workspaceId: row.workspace_id,
    weekId: row.week_id,
    weekTitle: row.week_title,
    targetUserId: typeof row.target_user_id === 'string' ? row.target_user_id : null,
  }));
}

export async function resolveFleetGraphFindingsForWeek(
  workspaceId: string,
  weekId: string,
  now: Date,
  targetUserId?: string
): Promise<number> {
  const params: Array<string> = [workspaceId, weekId, now.toISOString()];
  const userFilter =
    targetUserId !== undefined
      ? (() => {
          params.push(targetUserId);
          return `AND target_user_id = $${params.length}`;
        })()
      : '';

  const result = await pool.query(
    `UPDATE fleetgraph_findings
     SET resolved_at = $3,
         updated_at = $3
     WHERE workspace_id = $1
       AND week_id = $2
       AND resolved_at IS NULL
       ${userFilter}`,
    params
  );

  return result.rowCount ?? 0;
}

export async function persistFleetGraphProactiveFinding(
  input: PersistProactiveFindingInput
): Promise<PersistProactiveFindingResult> {
  const client = await pool.connect();
  const nowIso = input.now.toISOString();
  const cooldownUntilIso = new Date(input.now.getTime() + input.cooldownMs).toISOString();

  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE fleetgraph_findings
       SET resolved_at = $4,
           updated_at = $4
       WHERE workspace_id = $1
         AND week_id = $2
         AND target_user_id = $3
         AND resolved_at IS NULL
         AND signal_signature <> $5`,
      [input.workspaceId, input.weekId, input.targetUserId, nowIso, input.signalSignature]
    );

    const existingResult = await client.query(
      `SELECT id, cooldown_until
       FROM fleetgraph_findings
       WHERE workspace_id = $1
         AND week_id = $2
         AND target_user_id = $3
         AND signal_signature = $4
         AND resolved_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [input.workspaceId, input.weekId, input.targetUserId, input.signalSignature]
    );

    const shouldNotify =
      existingResult.rows.length === 0 ||
      new Date(existingResult.rows[0]!.cooldown_until).getTime() <= input.now.getTime();

    const rowResult =
      existingResult.rows.length === 0
        ? await client.query(
            `INSERT INTO fleetgraph_findings (
               id,
             workspace_id,
             week_id,
             project_id,
             program_id,
             target_user_id,
             audience_role,
             audience_scope,
             delivery_source,
             delivery_reason,
             title,
             summary,
             severity,
             route,
               surface,
               tab,
               signal_kinds,
               signal_signature,
               payload,
               first_detected_at,
               last_detected_at,
               last_notified_at,
               cooldown_until,
               updated_at
             ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
              $15, $16, $17::text[], $18, $19::jsonb, $20, $20, $20, $21, $20
             )
             RETURNING *`,
            [
              randomUUID(),
              input.workspaceId,
              input.weekId,
              input.projectId,
              input.programId,
              input.targetUserId,
              input.audienceRole,
              input.audienceScope,
              input.deliverySource,
              input.deliveryReason,
              input.title,
              input.summary,
              input.severity,
              input.route,
              input.surface,
              input.tab,
              input.signalKinds,
              input.signalSignature,
              JSON.stringify(input.payload),
              nowIso,
              cooldownUntilIso,
            ]
          )
        : await client.query(
            `UPDATE fleetgraph_findings
             SET project_id = $2,
                 program_id = $3,
                 audience_role = $4,
                 audience_scope = $5,
                 delivery_source = $6,
                 delivery_reason = $7,
                 title = $8,
                 summary = $9,
                 severity = $10,
                 route = $11,
                 surface = $12,
                 tab = $13,
                 signal_kinds = $14::text[],
                 payload = $15::jsonb,
                 last_detected_at = $16,
                 last_notified_at = CASE WHEN $17 THEN $16 ELSE last_notified_at END,
                 cooldown_until = CASE WHEN $17 THEN $18 ELSE cooldown_until END,
                 resolved_at = NULL,
                 updated_at = $16
             WHERE id = $1
             RETURNING *`,
            [
              existingResult.rows[0]!.id,
              input.projectId,
              input.programId,
              input.audienceRole,
              input.audienceScope,
              input.deliverySource,
              input.deliveryReason,
              input.title,
              input.summary,
              input.severity,
              input.route,
              input.surface,
              input.tab,
              input.signalKinds,
              JSON.stringify(input.payload),
              nowIso,
              shouldNotify,
              cooldownUntilIso,
            ]
          );

    await client.query('COMMIT');

    return {
      finding: mapFindingRow(rowResult.rows[0]!),
      shouldNotify,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listFleetGraphFindingsForUser(options: {
  workspaceId: string;
  userId: string;
  limit?: number;
}): Promise<FleetGraphProactiveFinding[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 10, 25));
  const result = await pool.query(
    `SELECT *
     FROM fleetgraph_findings
     WHERE workspace_id = $1
       AND target_user_id = $2
       AND resolved_at IS NULL
     ORDER BY last_notified_at DESC, last_detected_at DESC
     LIMIT $3`,
    [options.workspaceId, options.userId, limit]
  );

  return result.rows.map((row) => mapFindingRow(row));
}

export async function runFleetGraphProactiveSweep(options: {
  workspaceId: string;
  shipApi: FleetGraphShipApiClient;
  weekId?: string;
  now?: Date;
  logger?: ReturnType<typeof createFleetGraphLogger>;
}): Promise<FleetGraphProactiveSweepResult> {
  const now = options.now ?? new Date();
  const logger = options.logger ?? createFleetGraphLogger('FleetGraph proactive');
  const cooldownMs = getCooldownMs();
  const targets = await listActiveSprintTargets(options.workspaceId, options.weekId);

  let surfacedFindings = 0;
  let newNotifications = 0;
  const findings: FleetGraphProactiveFinding[] = [];

  for (const target of targets) {
    const input: FleetGraphRunInput = {
      runId: randomUUID(),
      mode: 'proactive',
      triggerType: 'sweep',
      workspaceId: target.workspaceId,
      actor: {
        id: null,
        kind: 'service',
        role: 'fleetgraph',
        workPersona: null,
      },
      contextEntity: {
        id: target.weekId,
        type: 'week',
      },
      trace: {
        runName: 'fleetgraph-proactive',
        tags: ['fleetgraph', 'proactive', 'week', 'mode:proactive'],
      },
    };

    const result = await invokeFleetGraph(input, {
      shipApi: options.shipApi,
      logger,
      checkpointNamespace: 'fleetgraph',
    });

    const resolvedWeekId = result.expandedScope.weekId ?? target.weekId;

    if (!result.finding || !result.derivedSignals.shouldSurface) {
      await resolveFleetGraphFindingsForWeek(target.workspaceId, resolvedWeekId, now);
      continue;
    }

    surfacedFindings += 1;
    const signalKinds = result.derivedSignals.signals.map((signal) => signal.kind);
    const recipients = await resolveFleetGraphSweepRecipients({
      workspaceId: target.workspaceId,
      weekId: resolvedWeekId,
      projectId: result.expandedScope.projectId,
      programId: result.expandedScope.programId,
      severity: result.finding.severity as FleetGraphFindingSeverity,
      signalKinds,
    });

    if (recipients.length === 0) {
      logger.warn('Skipping proactive FleetGraph finding without a resolvable audience', {
        weekId: resolvedWeekId,
        workspaceId: target.workspaceId,
        signalKinds,
      });
      continue;
    }

    for (const recipient of recipients) {
      const personalized = await personalizeFleetGraphProactiveFinding(
        {
          baseSummary: result.finding.summary,
          recommendedNextStep: result.reasoning?.recommendedNextStep ?? null,
          workPersona: recipient.workPersona ?? null,
          audienceRole: recipient.audienceRole,
          deliverySource: 'sweep',
          deliveryReason: recipient.deliveryReason,
          parentLangSmithRunId: result.telemetry.langsmithRunId,
        },
        logger
      );

      const persisted = await persistFleetGraphProactiveFinding({
        workspaceId: target.workspaceId,
        weekId: resolvedWeekId,
        projectId: result.expandedScope.projectId,
        programId: result.expandedScope.programId,
        targetUserId: recipient.userId,
        audienceRole: recipient.audienceRole,
        audienceScope: recipient.audienceScope,
        deliverySource: 'sweep',
        deliveryReason: recipient.deliveryReason,
        title: result.fetched.entity?.title ?? target.weekTitle,
        summary: personalized.summary,
        severity: result.finding.severity as FleetGraphFindingSeverity,
        route: buildProactiveRoute(resolvedWeekId),
        surface: PROACTIVE_ROUTE_SURFACE,
        tab: PROACTIVE_ROUTE_TAB,
        signalKinds,
        signalSignature: buildSignalSignature(signalKinds, resolvedWeekId),
        payload: {
          finding: result.finding,
          reasoning: result.reasoning ?? null,
          reasoningSource: result.reasoningSource ?? null,
          derivedSignals: result.derivedSignals,
          expandedScope: result.expandedScope,
          personalization: {
            workPersona: recipient.workPersona ?? null,
            audienceRole: recipient.audienceRole,
            source: personalized.source,
            applied: personalized.applied,
            baseSummary: result.finding.summary,
            personalizedSummary: personalized.summary,
          },
          trace: {
            langsmithRunId: result.telemetry.langsmithRunId,
            langsmithRunUrl: result.telemetry.langsmithRunUrl,
            langsmithShareUrl: result.telemetry.langsmithShareUrl,
          },
        },
        now,
        cooldownMs,
      });

      try {
        await recordFleetGraphLangSmithChildRun({
          parentRunId: result.telemetry.langsmithRunId,
          name: 'fleetgraph.proactive.delivery',
          runType: 'tool',
          inputs: {
            targetUserId: recipient.userId,
            audienceRole: recipient.audienceRole,
            audienceScope: recipient.audienceScope,
            deliverySource: 'sweep',
            deliveryReason: recipient.deliveryReason,
          },
          outputs: {
            findingId: persisted.finding.id,
            shouldNotify: persisted.shouldNotify,
            route: persisted.finding.route,
          },
          metadata: {
            target_user_id: recipient.userId,
            audience_role: recipient.audienceRole,
            audience_scope: recipient.audienceScope,
            delivery_source: 'sweep',
            work_persona: recipient.workPersona ?? null,
          },
          tags: [
            'fleetgraph',
            'proactive',
            'delivery',
            'source:sweep',
            `audience:${recipient.audienceRole}`,
          ],
        });
      } catch (error) {
        logger.warn('Failed to record FleetGraph proactive delivery trace', {
          weekId: resolvedWeekId,
          findingId: persisted.finding.id,
          message:
            error instanceof Error
              ? error.message
              : 'Unknown proactive delivery trace failure',
        });
      }

      findings.push(persisted.finding);

      if (persisted.shouldNotify) {
        newNotifications += 1;
        broadcastToUser(
          recipient.userId,
          'fleetgraph:finding',
          persisted.finding as unknown as Record<string, unknown>
        );
      }

      recordFleetGraphProactiveDelivery(
        {
          workspaceId: target.workspaceId,
          weekId: resolvedWeekId,
          projectId: result.expandedScope.projectId,
          programId: result.expandedScope.programId,
          findingId: persisted.finding.id,
          targetUserId: recipient.userId,
          audienceRole: recipient.audienceRole,
          audienceScope: recipient.audienceScope,
          deliverySource: 'sweep',
          deliveryReason: recipient.deliveryReason,
          severity: result.finding.severity as FleetGraphFindingSeverity,
          signalKinds,
          route: persisted.finding.route,
          shouldNotify: persisted.shouldNotify,
          langsmithRunId: result.telemetry.langsmithRunId,
          langsmithRunUrl: result.telemetry.langsmithRunUrl,
          langsmithShareUrl: result.telemetry.langsmithShareUrl,
        },
        logger
      );
    }
  }

  logger.info('FleetGraph proactive sweep completed', {
    workspaceId: options.workspaceId,
    processedWeeks: targets.length,
    surfacedFindings,
    newNotifications,
  });

  return {
    processedWeeks: targets.length,
    processedWorkspaces: 1,
    surfacedFindings,
    newNotifications,
    findings,
  };
}

export function startFleetGraphProactiveWorker(): { stop(): void } {
  const logger = createFleetGraphLogger('FleetGraph worker');
  const enabled = process.env.FLEETGRAPH_ENABLE_PROACTIVE_WORKER === 'true';
  const apiToken = process.env.FLEETGRAPH_INTERNAL_API_TOKEN?.trim();
  const intervalMs = getSweepIntervalMs();

  proactiveRuntimeState.startedAt = new Date().toISOString();
  proactiveRuntimeState.running = false;
  proactiveRuntimeState.lastSweepError = null;

  if (!enabled) {
    proactiveRuntimeState.workerState = 'disabled';
    logger.info('FleetGraph proactive worker is disabled', {
      env: 'FLEETGRAPH_ENABLE_PROACTIVE_WORKER',
    });
    return { stop() {} };
  }

  if (!apiToken) {
    proactiveRuntimeState.workerState = 'misconfigured';
    logger.warn('FleetGraph proactive worker is enabled but missing internal API token', {
      env: 'FLEETGRAPH_INTERNAL_API_TOKEN',
    });
    return { stop() {} };
  }

  proactiveRuntimeState.workerState = 'idle';
  let timer: NodeJS.Timeout | null = null;
  let initialTimer: NodeJS.Timeout | null = null;
  let running = false;

  const runSweep = async () => {
    if (running) {
      logger.warn('Skipping overlapping FleetGraph proactive sweep');
      return;
    }

    running = true;
    proactiveRuntimeState.running = true;
    proactiveRuntimeState.workerState = 'sweeping';
    proactiveRuntimeState.lastSweepStartedAt = new Date().toISOString();
    proactiveRuntimeState.lastSweepError = null;

    try {
      const workspaces = await pool.query(
        `SELECT id
         FROM workspaces
         WHERE archived_at IS NULL
         ORDER BY created_at ASC`
      );
      let processedWeeks = 0;
      let surfacedFindings = 0;
      let newNotifications = 0;

      for (const row of workspaces.rows) {
        const result = await runFleetGraphProactiveSweep({
          workspaceId: row.id,
          shipApi: createApiTokenShipApiClient(apiToken, {
            workspaceId: row.id,
          }),
          logger,
        });
        processedWeeks += result.processedWeeks;
        surfacedFindings += result.surfacedFindings;
        newNotifications += result.newNotifications;
      }

      proactiveRuntimeState.lastSweepWorkspaceCount = workspaces.rows.length;
      proactiveRuntimeState.lastSweepProcessedWeeks = processedWeeks;
      proactiveRuntimeState.lastSweepSurfacedFindings = surfacedFindings;
      proactiveRuntimeState.lastSweepNewNotifications = newNotifications;
      proactiveRuntimeState.lastSweepFinishedAt = new Date().toISOString();
      proactiveRuntimeState.workerState = 'idle';
    } catch (error) {
      proactiveRuntimeState.lastSweepFinishedAt = new Date().toISOString();
      proactiveRuntimeState.lastSweepError =
        error instanceof Error ? error.message : 'Unknown proactive sweep failure';
      proactiveRuntimeState.workerState = 'idle';
      logger.error('FleetGraph proactive worker sweep failed', {
        message: error instanceof Error ? error.message : 'Unknown proactive sweep failure',
      });
    } finally {
      running = false;
      proactiveRuntimeState.running = false;
    }
  };

  initialTimer = setTimeout(() => {
    void runSweep();
  }, 15_000);
  initialTimer.unref();

  timer = setInterval(() => {
    void runSweep();
  }, intervalMs);
  timer.unref();

  logger.info('FleetGraph proactive worker started', {
    intervalMs,
  });

  return {
    stop() {
      if (initialTimer) {
        clearTimeout(initialTimer);
      }
      if (timer) {
        clearInterval(timer);
      }
    },
  };
}
