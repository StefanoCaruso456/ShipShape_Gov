EXPLAIN (ANALYZE, BUFFERS)
SELECT d.id, d.title, d.properties, prog_da.related_id AS program_id,
       p.title AS program_name, p.properties->>'prefix' AS program_prefix,
       p.properties->>'accountable_id' AS program_accountable_id,
       (
         SELECT op.properties->>'reports_to'
         FROM documents op
         WHERE d.properties->>'owner_id' IS NOT NULL
           AND op.id = (d.properties->>'owner_id')::uuid
           AND op.document_type = 'person'
           AND op.workspace_id = d.workspace_id
       ) AS owner_reports_to,
       w.sprint_start_date AS workspace_sprint_start_date,
       u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
       (SELECT COUNT(*)
        FROM documents i
        JOIN document_associations ida
          ON ida.document_id = i.id
         AND ida.related_id = d.id
         AND ida.relationship_type = 'sprint'
        WHERE i.document_type = 'issue') AS issue_count,
       (SELECT COUNT(*)
        FROM documents i
        JOIN document_associations ida
          ON ida.document_id = i.id
         AND ida.related_id = d.id
         AND ida.relationship_type = 'sprint'
        WHERE i.document_type = 'issue'
          AND i.properties->>'state' = 'done') AS completed_count,
       (SELECT COUNT(*)
        FROM documents i
        JOIN document_associations ida
          ON ida.document_id = i.id
         AND ida.related_id = d.id
         AND ida.relationship_type = 'sprint'
        WHERE i.document_type = 'issue'
          AND i.properties->>'state' IN ('in_progress', 'in_review')) AS started_count,
       (SELECT COUNT(*) > 0
        FROM documents pl
        WHERE pl.parent_id = d.id
          AND pl.document_type = 'weekly_plan') AS has_plan,
       (SELECT COUNT(*) > 0
        FROM documents rt
        JOIN document_associations rda
          ON rda.document_id = rt.id
         AND rda.related_id = d.id
         AND rda.relationship_type = 'sprint'
        WHERE rt.properties->>'outcome' IS NOT NULL) AS has_retro,
       (SELECT rt.properties->>'outcome'
        FROM documents rt
        JOIN document_associations rda
          ON rda.document_id = rt.id
         AND rda.related_id = d.id
         AND rda.relationship_type = 'sprint'
        WHERE rt.properties->>'outcome' IS NOT NULL
        LIMIT 1) AS retro_outcome,
       (SELECT rt.id
        FROM documents rt
        JOIN document_associations rda
          ON rda.document_id = rt.id
         AND rda.related_id = d.id
         AND rda.relationship_type = 'sprint'
        WHERE rt.properties->>'outcome' IS NOT NULL
        LIMIT 1) AS retro_id
FROM documents d
LEFT JOIN document_associations prog_da
  ON prog_da.document_id = d.id
 AND prog_da.relationship_type = 'program'
LEFT JOIN documents p ON prog_da.related_id = p.id
JOIN workspaces w ON d.workspace_id = w.id
LEFT JOIN users u ON (d.properties->'assignee_ids'->>0)::uuid = u.id
WHERE d.id = '9b2abdb8-4530-49b7-b0d3-b3e485461cc1'
  AND d.workspace_id = '07497cfa-486e-49f9-ad21-73eb973a541a'
  AND d.document_type = 'sprint';
