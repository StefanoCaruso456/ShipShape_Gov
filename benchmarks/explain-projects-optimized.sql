EXPLAIN (ANALYZE, BUFFERS)
WITH visible_projects AS (
  SELECT d.id, d.title, d.properties, d.archived_at, d.created_at, d.updated_at,
         d.converted_from_id, d.workspace_id
  FROM documents d
  WHERE d.workspace_id = '497ca5be-e21b-46b0-ab49-937dcb6b3e67'
    AND d.document_type = 'project'
    AND d.archived_at IS NULL
),
project_relationship_counts AS (
  SELECT da.related_id AS project_id,
         COUNT(*) FILTER (WHERE linked.document_type = 'sprint')::int AS sprint_count,
         COUNT(*) FILTER (WHERE linked.document_type = 'issue')::int AS issue_count
  FROM visible_projects vp
  JOIN document_associations da
    ON da.related_id = vp.id
   AND da.relationship_type = 'project'
  JOIN documents linked
    ON linked.id = da.document_id
   AND linked.workspace_id = vp.workspace_id
   AND linked.document_type IN ('sprint', 'issue')
  GROUP BY da.related_id
),
project_sprint_status AS (
  SELECT sprint.workspace_id,
         sprint.properties->>'project_id' AS project_id,
         MAX(
           CASE
             WHEN CURRENT_DATE BETWEEN
               (w.sprint_start_date + ((sprint.properties->>'sprint_number')::int - 1) * 7)
               AND (w.sprint_start_date + ((sprint.properties->>'sprint_number')::int - 1) * 7 + 6)
             THEN 3
             WHEN CURRENT_DATE < (w.sprint_start_date + ((sprint.properties->>'sprint_number')::int - 1) * 7)
             THEN 2
             ELSE 1
           END
         ) AS allocation_rank
  FROM documents sprint
  JOIN workspaces w ON w.id = sprint.workspace_id
  WHERE sprint.document_type = 'sprint'
    AND sprint.workspace_id = '497ca5be-e21b-46b0-ab49-937dcb6b3e67'
    AND sprint.properties->>'project_id' IS NOT NULL
    AND jsonb_array_length(COALESCE(sprint.properties->'assignee_ids', '[]'::jsonb)) > 0
  GROUP BY sprint.workspace_id, sprint.properties->>'project_id'
)
SELECT vp.id, vp.title, vp.properties, prog_da.related_id AS program_id, vp.archived_at, vp.created_at, vp.updated_at,
       vp.converted_from_id,
       (vp.properties->>'owner_id')::uuid AS owner_id,
       u.name AS owner_name, u.email AS owner_email,
       COALESCE(prc.sprint_count, 0) AS sprint_count,
       COALESCE(prc.issue_count, 0) AS issue_count,
       CASE
         WHEN vp.archived_at IS NOT NULL THEN 'archived'
         WHEN vp.properties->>'plan_validated' IS NOT NULL THEN 'completed'
         ELSE COALESCE(
           CASE pss.allocation_rank
             WHEN 3 THEN 'active'
             WHEN 2 THEN 'planned'
             ELSE NULL
           END,
           'backlog'
         )
       END AS inferred_status
FROM visible_projects vp
LEFT JOIN users u ON u.id = (vp.properties->>'owner_id')::uuid
LEFT JOIN document_associations prog_da
  ON prog_da.document_id = vp.id
 AND prog_da.relationship_type = 'program'
LEFT JOIN project_relationship_counts prc ON prc.project_id = vp.id
LEFT JOIN project_sprint_status pss
  ON pss.workspace_id = vp.workspace_id
 AND pss.project_id = vp.id::text
ORDER BY (
  COALESCE((vp.properties->>'impact')::int, 3)
  * COALESCE((vp.properties->>'confidence')::int, 3)
  * COALESCE((vp.properties->>'ease')::int, 3)
) DESC;
