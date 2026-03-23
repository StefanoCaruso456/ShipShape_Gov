CREATE TABLE IF NOT EXISTS fleetgraph_proactive_events (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_type VARCHAR(32) NOT NULL,
  event_kind VARCHAR(64) NOT NULL,
  route TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_trigger_kinds TEXT[] NOT NULL DEFAULT '{}'::text[],
  findings_created INTEGER NOT NULL DEFAULT 0,
  processing_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fleetgraph_proactive_events_pending_idx
  ON fleetgraph_proactive_events (processing_status, created_at ASC)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS fleetgraph_proactive_events_workspace_lookup_idx
  ON fleetgraph_proactive_events (workspace_id, created_at DESC);
