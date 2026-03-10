EXPLAIN (ANALYZE, BUFFERS)
SELECT d.id, d.title, d.properties, d.ticket_number,
       d.content,
       d.created_at, d.updated_at, d.created_by,
       d.started_at, d.completed_at, d.cancelled_at, d.reopened_at,
       d.converted_from_id,
       u.name AS assignee_name,
       CASE WHEN person_doc.archived_at IS NOT NULL THEN true ELSE false END AS assignee_archived
FROM documents d
LEFT JOIN users u ON (d.properties->>'assignee_id')::uuid = u.id
LEFT JOIN documents person_doc
  ON person_doc.workspace_id = d.workspace_id
 AND person_doc.document_type = 'person'
 AND person_doc.properties->>'user_id' = d.properties->>'assignee_id'
WHERE d.workspace_id = '07497cfa-486e-49f9-ad21-73eb973a541a'
  AND d.document_type = 'issue'
  AND d.archived_at IS NULL
  AND d.deleted_at IS NULL
ORDER BY
  CASE d.properties->>'priority'
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
    ELSE 5
  END,
  d.updated_at DESC;
