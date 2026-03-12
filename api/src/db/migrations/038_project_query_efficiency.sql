-- Speed up project list status aggregation by indexing sprint->project lookups.
CREATE INDEX IF NOT EXISTS idx_documents_sprint_project_lookup
  ON documents(workspace_id, (properties->>'project_id'))
  WHERE document_type = 'sprint'
    AND (properties->>'project_id') IS NOT NULL
    AND jsonb_array_length(COALESCE(properties->'assignee_ids', '[]'::jsonb)) > 0;
