CREATE TABLE IF NOT EXISTS fleetgraph_action_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  week_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_fingerprint TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('draft_follow_up_comment', 'draft_escalation_comment')),
  proposal_summary TEXT NOT NULL,
  draft_comment TEXT NOT NULL,
  decision_status TEXT NOT NULL CHECK (decision_status IN ('approved', 'dismissed', 'snoozed')),
  decision_note TEXT,
  snoozed_until TIMESTAMPTZ,
  executed_comment_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleetgraph_action_memory_active_idx
  ON fleetgraph_action_memory (workspace_id, week_id, actor_user_id, action_fingerprint);

CREATE INDEX IF NOT EXISTS fleetgraph_action_memory_lookup_idx
  ON fleetgraph_action_memory (workspace_id, actor_user_id, week_id, updated_at DESC);
