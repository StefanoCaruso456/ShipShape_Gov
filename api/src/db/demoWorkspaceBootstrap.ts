import type pg from 'pg';
import { DEMO_PROGRAM_TEMPLATES, DEMO_PROJECT_TEMPLATES } from './demoWorkspaceTemplates.js';

interface PopulateDemoWorkspaceOptions {
  workspaceId: string;
  ownerUserId: string;
}

interface DemoWorkspaceScanRow {
  workspace_name: string;
  owner_user_id: string | null;
  program_count: string;
  project_count: string;
  welcome_doc_count: string;
}

export const DEMO_WORKSPACE_OWNER_SELECTION_SQL = `
  COALESCE(
    (array_agg(DISTINCT wm.user_id) FILTER (WHERE wm.role = 'admin' AND wm.user_id IS NOT NULL))[1],
    (array_agg(DISTINCT wm.user_id) FILTER (WHERE wm.user_id IS NOT NULL))[1]
  ) AS owner_user_id
`.trim();

export function shouldBackfillDemoWorkspace(row: DemoWorkspaceScanRow): boolean {
  const programCount = Number(row.program_count);
  const projectCount = Number(row.project_count);
  const welcomeDocCount = Number(row.welcome_doc_count);
  const looksLikeSetupWorkspace = row.workspace_name.endsWith("'s Workspace");

  return (
    looksLikeSetupWorkspace &&
    programCount === 0 &&
    projectCount === 0 &&
    welcomeDocCount > 0 &&
    Boolean(row.owner_user_id)
  );
}

async function createAssociation(
  pool: pg.Pool,
  documentId: string,
  relatedId: string
): Promise<void> {
  await pool.query(
    `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
     VALUES ($1, $2, 'program', $3)
     ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
    [documentId, relatedId, JSON.stringify({ created_via: 'demo_bootstrap' })]
  );
}

export async function populateDemoWorkspaceProgramsAndProjects(
  pool: pg.Pool,
  { workspaceId, ownerUserId }: PopulateDemoWorkspaceOptions
): Promise<{ programsCreated: number; projectsCreated: number }> {
  const programs: Array<{ id: string; prefix: string; name: string; color: string }> = [];
  let programsCreated = 0;
  let projectsCreated = 0;

  for (const programTemplate of DEMO_PROGRAM_TEMPLATES) {
    const existingProgram = await pool.query(
      `SELECT id
       FROM documents
       WHERE workspace_id = $1
         AND document_type = 'program'
         AND properties->>'prefix' = $2`,
      [workspaceId, programTemplate.prefix]
    );

    if (existingProgram.rows[0]) {
      programs.push({
        id: existingProgram.rows[0].id,
        ...programTemplate,
      });
      continue;
    }

    const createdProgram = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, visibility, created_by)
       VALUES ($1, 'program', $2, $3, 'workspace', $4)
       RETURNING id`,
      [
        workspaceId,
        programTemplate.name,
        JSON.stringify({
          prefix: programTemplate.prefix,
          color: programTemplate.color,
          owner_id: ownerUserId,
        }),
        ownerUserId,
      ]
    );

    programs.push({
      id: createdProgram.rows[0].id,
      ...programTemplate,
    });
    programsCreated++;
  }

  for (const program of programs) {
    for (const projectTemplate of DEMO_PROJECT_TEMPLATES) {
      const projectTitle = `${program.name} - ${projectTemplate.name}`;

      const existingProject = await pool.query(
        `SELECT d.id
         FROM documents d
         JOIN document_associations da
           ON da.document_id = d.id
          AND da.related_id = $3
          AND da.relationship_type = 'program'
         WHERE d.workspace_id = $1
           AND d.document_type = 'project'
           AND d.title = $2`,
        [workspaceId, projectTitle, program.id]
      );

      if (existingProject.rows[0]) {
        continue;
      }

      const createdProject = await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, properties, visibility, created_by)
         VALUES ($1, 'project', $2, $3, 'workspace', $4)
         RETURNING id`,
        [
          workspaceId,
          projectTitle,
          JSON.stringify({
            color: projectTemplate.color,
            emoji: projectTemplate.emoji,
            impact: projectTemplate.impact,
            confidence: projectTemplate.confidence,
            ease: projectTemplate.ease,
            plan: projectTemplate.plan,
            monetary_impact_expected: projectTemplate.monetaryImpactExpected,
            owner_id: ownerUserId,
            has_design_review: projectTemplate.hasDesignReview,
            design_review_notes: projectTemplate.designReviewNotes,
          }),
          ownerUserId,
        ]
      );

      await createAssociation(pool, createdProject.rows[0].id, program.id);
      projectsCreated++;
    }
  }

  return { programsCreated, projectsCreated };
}

export async function backfillDemoWorkspaceDataForSetupWorkspaces(pool: pg.Pool): Promise<void> {
  const result = await pool.query<DemoWorkspaceScanRow & {
    workspace_id: string;
    member_count: string;
  }>(`
    SELECT
      w.id AS workspace_id,
      w.name AS workspace_name,
      ${DEMO_WORKSPACE_OWNER_SELECTION_SQL},
      COUNT(DISTINCT wm.user_id)::text AS member_count,
      COUNT(DISTINCT CASE WHEN d.document_type = 'program' THEN d.id END)::text AS program_count,
      COUNT(DISTINCT CASE WHEN d.document_type = 'project' THEN d.id END)::text AS project_count,
      COUNT(DISTINCT CASE WHEN d.document_type = 'wiki' AND d.title = 'Welcome to Ship' THEN d.id END)::text AS welcome_doc_count
    FROM workspaces w
    LEFT JOIN workspace_memberships wm ON wm.workspace_id = w.id
    LEFT JOIN documents d ON d.workspace_id = w.id AND d.archived_at IS NULL
    WHERE w.archived_at IS NULL
    GROUP BY w.id, w.name
  `);

  let candidates = 0;
  let workspacesUpdated = 0;

  for (const row of result.rows) {
    if (!shouldBackfillDemoWorkspace(row)) {
      continue;
    }

    const ownerUserId = row.owner_user_id;
    if (!ownerUserId) {
      continue;
    }

    candidates++;

    const populated = await populateDemoWorkspaceProgramsAndProjects(pool, {
      workspaceId: row.workspace_id,
      ownerUserId,
    });

    if (populated.programsCreated > 0 || populated.projectsCreated > 0) {
      workspacesUpdated++;
      console.log(
        `✅ Demo workspace data backfilled for ${row.workspace_id}: ` +
          `${populated.programsCreated} programs, ${populated.projectsCreated} projects`
      );
    }
  }

  console.log(
    `ℹ️ Demo workspace backfill scan complete: ` +
      `${candidates} candidate workspace(s), ${workspacesUpdated} updated`
  );
}
