ALTER TABLE documents
  ALTER COLUMN properties SET DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS sprint_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  current_issue_count INTEGER NOT NULL DEFAULT 0,
  completed_issue_count INTEGER NOT NULL DEFAULT 0,
  current_story_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  completed_story_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  remaining_story_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  current_estimate_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  completed_estimate_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  remaining_estimate_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sprint_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_sprint_analytics_snapshots_sprint_date
  ON sprint_analytics_snapshots(sprint_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_sprint_analytics_snapshots_workspace_date
  ON sprint_analytics_snapshots(workspace_id, snapshot_date);

UPDATE documents
SET properties =
  jsonb_set(
    jsonb_set(
      COALESCE(properties, '{}'::jsonb),
      '{estimate_hours}',
      COALESCE(properties->'estimate_hours', properties->'estimate', 'null'::jsonb),
      true
    ),
    '{story_points}',
    CASE
      WHEN properties ? 'story_points' THEN properties->'story_points'
      WHEN COALESCE((properties->>'estimate_hours')::numeric, (properties->>'estimate')::numeric, 0) <= 0 THEN 'null'::jsonb
      WHEN COALESCE((properties->>'estimate_hours')::numeric, (properties->>'estimate')::numeric, 0) <= 2 THEN '1'::jsonb
      WHEN COALESCE((properties->>'estimate_hours')::numeric, (properties->>'estimate')::numeric, 0) <= 4 THEN '2'::jsonb
      WHEN COALESCE((properties->>'estimate_hours')::numeric, (properties->>'estimate')::numeric, 0) <= 8 THEN '3'::jsonb
      WHEN COALESCE((properties->>'estimate_hours')::numeric, (properties->>'estimate')::numeric, 0) <= 12 THEN '5'::jsonb
      WHEN COALESCE((properties->>'estimate_hours')::numeric, (properties->>'estimate')::numeric, 0) <= 16 THEN '8'::jsonb
      WHEN COALESCE((properties->>'estimate_hours')::numeric, (properties->>'estimate')::numeric, 0) <= 24 THEN '13'::jsonb
      ELSE '21'::jsonb
    END,
    true
  )
WHERE document_type = 'issue'
  AND deleted_at IS NULL;
