EXPLAIN (ANALYZE, BUFFERS)
SELECT d.id, d.title, d.properties, prog_da.related_id AS program_id, d.archived_at, d.created_at, d.updated_at,
       d.converted_from_id,
       (d.properties->>'owner_id')::uuid AS owner_id,
       u.name AS owner_name, u.email AS owner_email,
       (SELECT COUNT(*)
        FROM documents s
        JOIN document_associations da
          ON da.document_id = s.id
         AND da.related_id = d.id
         AND da.relationship_type = 'project'
        WHERE s.document_type = 'sprint') AS sprint_count,
       (SELECT COUNT(*)
        FROM documents i
        JOIN document_associations da
          ON da.document_id = i.id
         AND da.related_id = d.id
         AND da.relationship_type = 'project'
        WHERE i.document_type = 'issue') AS issue_count,
       (
         CASE
           WHEN d.archived_at IS NOT NULL THEN 'archived'
           WHEN d.properties->>'plan_validated' IS NOT NULL THEN 'completed'
           ELSE COALESCE(
             (
               SELECT
                 CASE MAX(
                   CASE
                     WHEN CURRENT_DATE BETWEEN
                       (w.sprint_start_date + ((sprint.properties->>'sprint_number')::int - 1) * 7)
                       AND (w.sprint_start_date + ((sprint.properties->>'sprint_number')::int - 1) * 7 + 6)
                     THEN 3
                     WHEN CURRENT_DATE < (w.sprint_start_date + ((sprint.properties->>'sprint_number')::int - 1) * 7)
                     THEN 2
                     ELSE 1
                   END
                 )
                 WHEN 3 THEN 'active'
                 WHEN 2 THEN 'planned'
                 ELSE NULL
                 END
               FROM documents sprint
               JOIN workspaces w ON w.id = sprint.workspace_id
               WHERE sprint.document_type = 'sprint'
                 AND sprint.workspace_id = d.workspace_id
                 AND (sprint.properties->>'project_id')::uuid = d.id
                 AND jsonb_array_length(COALESCE(sprint.properties->'assignee_ids', '[]'::jsonb)) > 0
             ),
             'backlog'
           )
         END
       ) AS inferred_status
FROM documents d
LEFT JOIN users u ON u.id = (d.properties->>'owner_id')::uuid
LEFT JOIN document_associations prog_da
  ON prog_da.document_id = d.id
 AND prog_da.relationship_type = 'program'
WHERE d.workspace_id = '07497cfa-486e-49f9-ad21-73eb973a541a'
  AND d.document_type = 'project'
  AND d.archived_at IS NULL
ORDER BY (
  COALESCE((d.properties->>'impact')::int, 3)
  * COALESCE((d.properties->>'confidence')::int, 3)
  * COALESCE((d.properties->>'ease')::int, 3)
) DESC;
