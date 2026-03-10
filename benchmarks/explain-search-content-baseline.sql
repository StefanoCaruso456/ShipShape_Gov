EXPLAIN (ANALYZE, BUFFERS)
SELECT id, workspace_id, document_type, title, parent_id, position, ticket_number,
       properties, created_at, updated_at, created_by, visibility
FROM documents
WHERE workspace_id = '07497cfa-486e-49f9-ad21-73eb973a541a'
  AND archived_at IS NULL
  AND deleted_at IS NULL
ORDER BY position ASC, created_at DESC;
