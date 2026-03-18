import type {
  FleetGraphActionMemoryRecord,
  FleetGraphActionMemoryStore,
  FleetGraphHumanDecision,
  FleetGraphProposedAction,
} from '@ship/fleetgraph';
import { pool } from '../db/client.js';

const DEFAULT_SNOOZE_MINUTES = 240;

function mapRow(row: Record<string, unknown>): FleetGraphActionMemoryRecord {
  return {
    status: row.decision_status as FleetGraphActionMemoryRecord['status'],
    snoozedUntil: typeof row.snoozed_until === 'string' ? row.snoozed_until : null,
    executedCommentId: typeof row.executed_comment_id === 'string' ? row.executed_comment_id : null,
  };
}

function resolveSnoozedUntil(now: Date, decision: FleetGraphHumanDecision): string | null {
  if (decision.outcome !== 'snooze') {
    return null;
  }

  const snoozeMinutes =
    typeof decision.snoozeMinutes === 'number' && decision.snoozeMinutes > 0
      ? decision.snoozeMinutes
      : DEFAULT_SNOOZE_MINUTES;

  return new Date(now.getTime() + snoozeMinutes * 60 * 1000).toISOString();
}

function mapDecisionStatus(
  outcome: FleetGraphHumanDecision['outcome']
): FleetGraphActionMemoryRecord['status'] {
  switch (outcome) {
    case 'approve':
      return 'approved';
    case 'snooze':
      return 'snoozed';
    case 'dismiss':
    default:
      return 'dismissed';
  }
}

export function createFleetGraphActionMemoryStore(): FleetGraphActionMemoryStore {
  return {
    async getLatestDecision(input) {
      const result = await pool.query(
        `SELECT decision_status, snoozed_until, executed_comment_id
         FROM fleetgraph_action_memory
         WHERE workspace_id = $1
           AND week_id = $2
           AND actor_user_id = $3
           AND action_fingerprint = $4
         LIMIT 1`,
        [input.workspaceId, input.weekId, input.actorUserId, input.actionFingerprint]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapRow(result.rows[0]);
    },

    async recordDecision(input) {
      const nowIso = input.now.toISOString();
      const snoozedUntil = resolveSnoozedUntil(input.now, input.decision);
      const decisionStatus = mapDecisionStatus(input.decision.outcome);
      const result = await pool.query(
        `INSERT INTO fleetgraph_action_memory (
           workspace_id,
           week_id,
           actor_user_id,
           action_fingerprint,
           action_type,
           proposal_summary,
           draft_comment,
           decision_status,
           decision_note,
           snoozed_until,
           executed_comment_id,
           created_at,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12
         )
         ON CONFLICT (workspace_id, week_id, actor_user_id, action_fingerprint)
         DO UPDATE SET
           action_type = EXCLUDED.action_type,
           proposal_summary = EXCLUDED.proposal_summary,
           draft_comment = EXCLUDED.draft_comment,
           decision_status = EXCLUDED.decision_status,
           decision_note = EXCLUDED.decision_note,
           snoozed_until = EXCLUDED.snoozed_until,
           executed_comment_id = EXCLUDED.executed_comment_id,
           updated_at = EXCLUDED.updated_at
         RETURNING decision_status, snoozed_until, executed_comment_id`,
        [
          input.workspaceId,
          input.weekId,
          input.actorUserId,
          input.actionFingerprint,
          input.actionType,
          input.proposalSummary,
          input.draftComment,
          decisionStatus,
          input.decision.note ?? null,
          snoozedUntil,
          input.executedCommentId ?? null,
          nowIso,
        ]
      );

      return mapRow(result.rows[0]);
    },
  };
}

export type FleetGraphActionMemoryDecisionStatus = FleetGraphActionMemoryRecord['status'];
export type FleetGraphActionMemoryActionType = FleetGraphProposedAction['type'];
