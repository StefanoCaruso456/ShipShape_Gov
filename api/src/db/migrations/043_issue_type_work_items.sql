UPDATE documents
SET properties = jsonb_set(
  COALESCE(properties, '{}'::jsonb),
  '{issue_type}',
  '"task"'::jsonb,
  true
)
WHERE document_type = 'issue'
  AND deleted_at IS NULL
  AND (
    NOT (COALESCE(properties, '{}'::jsonb) ? 'issue_type')
    OR properties->'issue_type' IS NULL
  );
