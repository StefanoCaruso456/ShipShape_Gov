import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import {
  listFleetGraphFindingsForUser,
  persistFleetGraphProactiveFinding,
  resolveFleetGraphFindingsForWeek,
} from './fleetgraph-proactive.js';

describe('FleetGraph proactive finding persistence', () => {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const weekId = randomUUID();

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO workspaces (id, name)
       VALUES ($1, $2)`,
      [workspaceId, `FleetGraph Test ${workspaceId.slice(0, 8)}`]
    );

    await pool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, $3)`,
      [userId, `fleetgraph-${userId.slice(0, 8)}@ship.local`, 'FleetGraph Test User']
    );

    await pool.query(
      `INSERT INTO documents (id, workspace_id, document_type, title, content)
       VALUES ($1, $2, 'sprint', $3, $4::jsonb)`,
      [
        weekId,
        workspaceId,
        'Week Test',
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
      ]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM fleetgraph_findings WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  });

  it('suppresses duplicate notifications during the cooldown window', async () => {
    const firstDetectedAt = new Date('2026-03-17T18:00:00.000Z');
    const first = await persistFleetGraphProactiveFinding({
      workspaceId,
      weekId,
      projectId: null,
      programId: null,
      targetUserId: userId,
      title: 'Week Test',
      summary: 'FleetGraph detected sprint drift.',
      severity: 'action',
      route: `/documents/${weekId}/issues`,
      surface: 'document',
      tab: 'issues',
      signalKinds: ['missing_standup', 'work_not_started'],
      signalSignature: `${weekId}:missing_standup|work_not_started`,
      payload: {
        finding: { summary: 'FleetGraph detected sprint drift.', severity: 'action' },
      },
      now: firstDetectedAt,
      cooldownMs: 30 * 60 * 1000,
    });

    expect(first.shouldNotify).toBe(true);

    const second = await persistFleetGraphProactiveFinding({
      workspaceId,
      weekId,
      projectId: null,
      programId: null,
      targetUserId: userId,
      title: 'Week Test',
      summary: 'FleetGraph detected sprint drift.',
      severity: 'action',
      route: `/documents/${weekId}/issues`,
      surface: 'document',
      tab: 'issues',
      signalKinds: ['missing_standup', 'work_not_started'],
      signalSignature: `${weekId}:missing_standup|work_not_started`,
      payload: {
        finding: { summary: 'FleetGraph detected sprint drift.', severity: 'action' },
      },
      now: new Date('2026-03-17T18:10:00.000Z'),
      cooldownMs: 30 * 60 * 1000,
    });

    expect(second.shouldNotify).toBe(false);

    const findings = await listFleetGraphFindingsForUser({
      workspaceId,
      userId,
      limit: 5,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.weekId).toBe(weekId);
    expect(findings[0]?.signalKinds).toEqual(['missing_standup', 'work_not_started']);
  });

  it('resolves active findings when the sprint goes quiet', async () => {
    const resolvedCount = await resolveFleetGraphFindingsForWeek(
      workspaceId,
      weekId,
      new Date('2026-03-17T19:00:00.000Z'),
      userId
    );

    expect(resolvedCount).toBe(1);

    const findings = await listFleetGraphFindingsForUser({
      workspaceId,
      userId,
      limit: 5,
    });

    expect(findings).toHaveLength(0);
  });
});
