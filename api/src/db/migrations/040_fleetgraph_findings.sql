CREATE TABLE IF NOT EXISTS fleetgraph_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  week_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  project_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  program_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  summary TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'action')),
  route TEXT NOT NULL,
  surface TEXT NOT NULL,
  tab TEXT,
  signal_kinds TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  signal_signature TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cooldown_until TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleetgraph_findings_active_signature_idx
  ON fleetgraph_findings (workspace_id, week_id, target_user_id, signal_signature)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS fleetgraph_findings_target_lookup_idx
  ON fleetgraph_findings (workspace_id, target_user_id, resolved_at, last_notified_at DESC);

CREATE INDEX IF NOT EXISTS fleetgraph_findings_week_lookup_idx
  ON fleetgraph_findings (workspace_id, week_id, resolved_at, updated_at DESC);
