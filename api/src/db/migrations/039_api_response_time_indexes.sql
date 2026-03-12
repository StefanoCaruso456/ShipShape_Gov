-- Improve API latency for mention search and sprint issue list sorting.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_documents_active_title_trgm
  ON documents USING gin (title gin_trgm_ops)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_active_issue_priority_updated
  ON documents (
    workspace_id,
    (
      CASE properties->>'priority'
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END
    ),
    updated_at DESC
  )
  WHERE document_type = 'issue'
    AND archived_at IS NULL
    AND deleted_at IS NULL;
