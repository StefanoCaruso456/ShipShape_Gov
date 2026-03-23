ALTER TABLE fleetgraph_findings
  ADD COLUMN IF NOT EXISTS audience_role TEXT NOT NULL DEFAULT 'responsible_owner',
  ADD COLUMN IF NOT EXISTS audience_scope TEXT NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS delivery_source TEXT NOT NULL DEFAULT 'sweep',
  ADD COLUMN IF NOT EXISTS delivery_reason TEXT;

ALTER TABLE fleetgraph_findings
  DROP CONSTRAINT IF EXISTS fleetgraph_findings_audience_role_check;

ALTER TABLE fleetgraph_findings
  ADD CONSTRAINT fleetgraph_findings_audience_role_check
  CHECK (audience_role IN ('responsible_owner', 'issue_assignee', 'accountable', 'manager', 'team_member'));

ALTER TABLE fleetgraph_findings
  DROP CONSTRAINT IF EXISTS fleetgraph_findings_audience_scope_check;

ALTER TABLE fleetgraph_findings
  ADD CONSTRAINT fleetgraph_findings_audience_scope_check
  CHECK (audience_scope IN ('individual', 'team'));

ALTER TABLE fleetgraph_findings
  DROP CONSTRAINT IF EXISTS fleetgraph_findings_delivery_source_check;

ALTER TABLE fleetgraph_findings
  ADD CONSTRAINT fleetgraph_findings_delivery_source_check
  CHECK (delivery_source IN ('sweep', 'event'));

CREATE INDEX IF NOT EXISTS fleetgraph_findings_delivery_lookup_idx
  ON fleetgraph_findings (workspace_id, delivery_source, resolved_at, last_notified_at DESC);
