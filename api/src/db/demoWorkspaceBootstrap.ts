import type pg from 'pg';
import { DEMO_PROGRAM_TEMPLATES, DEMO_PROJECT_TEMPLATES } from './demoWorkspaceTemplates.js';
import { inferSeedIssueType } from './seedIssueTypes.js';
import { createIssueTemplateContent, shouldPopulateIssueTemplate } from '../utils/issueContentTemplate.js';

interface PopulateDemoWorkspaceOptions {
  workspaceId: string;
  ownerUserId: string;
}

interface DemoWorkspaceScanRow {
  workspace_name: string;
  owner_user_id: string | null;
  program_count: string;
  project_count: string;
  issue_count: string;
  sprint_count: string;
  welcome_doc_count: string;
}

interface DemoProgramRecord {
  id: string;
  prefix: string;
  name: string;
  color: string;
}

interface DemoProjectRecord {
  id: string;
  title: string;
  programId: string;
  programPrefix: string;
  templateName: string;
}

interface DemoWorkspacePopulationResult {
  programsCreated: number;
  projectsCreated: number;
  sprintsCreated: number;
  issuesCreated: number;
  weeklyPlansCreated: number;
  weeklyRetrosCreated: number;
  standupsCreated: number;
}

interface DemoIssueTemplate {
  title: string;
  state: 'done' | 'in_progress' | 'todo' | 'backlog';
  priority: 'high' | 'medium' | 'low';
  estimate: number;
  sprintOffset: -1 | 0 | 1 | null;
}

const EXPECTED_DEMO_PROGRAM_COUNT = DEMO_PROGRAM_TEMPLATES.length;
const EXPECTED_DEMO_PROJECT_COUNT = DEMO_PROGRAM_TEMPLATES.length * DEMO_PROJECT_TEMPLATES.length;

const DEMO_ISSUE_TEMPLATES: DemoIssueTemplate[] = [
  {
    title: 'Define acceptance criteria',
    state: 'done',
    priority: 'high',
    estimate: 3,
    sprintOffset: -1,
  },
  {
    title: 'Implement core workflow',
    state: 'in_progress',
    priority: 'high',
    estimate: 8,
    sprintOffset: 0,
  },
  {
    title: 'Add validation and edge-case handling',
    state: 'todo',
    priority: 'medium',
    estimate: 5,
    sprintOffset: 0,
  },
  {
    title: 'Expand test coverage',
    state: 'todo',
    priority: 'medium',
    estimate: 3,
    sprintOffset: 1,
  },
  {
    title: 'Explore stretch improvements',
    state: 'backlog',
    priority: 'low',
    estimate: 2,
    sprintOffset: null,
  },
];

const DEMO_PLAN_ITEMS = [
  'Ship the highest-priority scoped change for this week.',
  'Close the feedback loop on the riskiest open work.',
  'Leave the project easy to review next week.',
];

const DEMO_RETRO_ITEMS = [
  'Delivered the main planned work for this week.',
  'Captured follow-up cleanup and test work from the changes.',
  'Identified the next concrete improvement for the project.',
];

export const DEMO_WORKSPACE_OWNER_SELECTION_SQL = `
  COALESCE(
    (array_agg(DISTINCT wm.user_id) FILTER (WHERE wm.role = 'admin' AND wm.user_id IS NOT NULL))[1],
    (array_agg(DISTINCT wm.user_id) FILTER (WHERE wm.user_id IS NOT NULL))[1]
  ) AS owner_user_id
`.trim();

export function shouldBackfillDemoWorkspace(row: DemoWorkspaceScanRow): boolean {
  const programCount = Number(row.program_count);
  const projectCount = Number(row.project_count);
  const issueCount = Number(row.issue_count);
  const sprintCount = Number(row.sprint_count);
  const welcomeDocCount = Number(row.welcome_doc_count);
  const looksLikeSetupWorkspace = row.workspace_name.endsWith("'s Workspace");
  const hasNoDemoStructure = programCount === 0 && projectCount === 0;
  const hasOnlyStructureBackfill =
    programCount >= EXPECTED_DEMO_PROGRAM_COUNT &&
    projectCount >= EXPECTED_DEMO_PROJECT_COUNT &&
    issueCount === 0 &&
    sprintCount === 0;

  return (
    looksLikeSetupWorkspace &&
    welcomeDocCount > 0 &&
    (hasNoDemoStructure || hasOnlyStructureBackfill) &&
    Boolean(row.owner_user_id)
  );
}

export function shouldBackfillMissingIssueTypesForWorkspace(row: DemoWorkspaceScanRow): boolean {
  const welcomeDocCount = Number(row.welcome_doc_count);
  const looksLikeSetupWorkspace = row.workspace_name.endsWith("'s Workspace");

  return looksLikeSetupWorkspace && welcomeDocCount > 0;
}

async function createAssociation(
  pool: pg.Pool,
  documentId: string,
  relatedId: string,
  relationshipType: 'program' | 'project' | 'sprint'
): Promise<void> {
  await pool.query(
    `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
    [documentId, relatedId, relationshipType, JSON.stringify({ created_via: 'demo_bootstrap' })]
  );
}

async function ensureIssueType(
  pool: pg.Pool,
  issueId: string,
  properties: Record<string, unknown> | null | undefined,
  issueType: string
): Promise<void> {
  if ((properties?.issue_type as string | undefined) === issueType) {
    return;
  }

  await pool.query(
    `UPDATE documents
     SET properties = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify({ ...(properties ?? {}), issue_type: issueType }), issueId]
  );
}

async function ensureIssueContent(
  pool: pg.Pool,
  issueId: string,
  content: Record<string, unknown> | null | undefined,
  nextContent: Record<string, unknown>
): Promise<void> {
  if (!shouldPopulateIssueTemplate(content)) {
    return;
  }

  await pool.query(
    `UPDATE documents
     SET content = $1,
         yjs_state = NULL,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(nextContent), issueId]
  );
}

function buildListDocumentContent(items: string[]): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: items.map((item) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: item }],
            },
          ],
        })),
      },
    ],
  };
}

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0] as string;
}

async function resolveOwnerPersonDocumentId(
  pool: pg.Pool,
  workspaceId: string,
  ownerUserId: string
): Promise<string | null> {
  const result = await pool.query(
    `SELECT id
     FROM documents
     WHERE workspace_id = $1
       AND document_type = 'person'
       AND properties->>'user_id' = $2
     LIMIT 1`,
    [workspaceId, ownerUserId]
  );

  return result.rows[0]?.id ?? null;
}

async function resolveCurrentWeekNumber(pool: pg.Pool, workspaceId: string): Promise<number> {
  const result = await pool.query(
    `SELECT sprint_start_date
     FROM workspaces
     WHERE id = $1`,
    [workspaceId]
  );

  const rawStartDate = result.rows[0]?.sprint_start_date;
  const sprintStartDate =
    rawStartDate instanceof Date
      ? new Date(Date.UTC(rawStartDate.getFullYear(), rawStartDate.getMonth(), rawStartDate.getDate()))
      : typeof rawStartDate === 'string'
        ? new Date(`${rawStartDate}T00:00:00Z`)
        : new Date();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const daysSinceStart = Math.floor(
    (today.getTime() - sprintStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return Math.max(1, Math.floor(daysSinceStart / 7) + 1);
}

async function ensureDemoWorkspaceProgramsAndProjects(
  pool: pg.Pool,
  { workspaceId, ownerUserId }: PopulateDemoWorkspaceOptions
): Promise<{
  programs: DemoProgramRecord[];
  projects: DemoProjectRecord[];
  programsCreated: number;
  projectsCreated: number;
}> {
  const programs: DemoProgramRecord[] = [];
  const projects: DemoProjectRecord[] = [];
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
        projects.push({
          id: existingProject.rows[0].id,
          title: projectTitle,
          programId: program.id,
          programPrefix: program.prefix,
          templateName: projectTemplate.name,
        });
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

      await createAssociation(pool, createdProject.rows[0].id, program.id, 'program');
      projects.push({
        id: createdProject.rows[0].id,
        title: projectTitle,
        programId: program.id,
        programPrefix: program.prefix,
        templateName: projectTemplate.name,
      });
      projectsCreated++;
    }
  }

  return { programs, projects, programsCreated, projectsCreated };
}

export async function populateDemoWorkspaceProgramsAndProjects(
  pool: pg.Pool,
  options: PopulateDemoWorkspaceOptions
): Promise<{ programsCreated: number; projectsCreated: number }> {
  const result = await ensureDemoWorkspaceProgramsAndProjects(pool, options);
  return {
    programsCreated: result.programsCreated,
    projectsCreated: result.projectsCreated,
  };
}

export async function populateDemoWorkspaceData(
  pool: pg.Pool,
  { workspaceId, ownerUserId }: PopulateDemoWorkspaceOptions
): Promise<DemoWorkspacePopulationResult> {
  const base = await ensureDemoWorkspaceProgramsAndProjects(pool, {
    workspaceId,
    ownerUserId,
  });
  const ownerPersonDocId = await resolveOwnerPersonDocumentId(pool, workspaceId, ownerUserId);

  if (!ownerPersonDocId) {
    return {
      programsCreated: base.programsCreated,
      projectsCreated: base.projectsCreated,
      sprintsCreated: 0,
      issuesCreated: 0,
      weeklyPlansCreated: 0,
      weeklyRetrosCreated: 0,
      standupsCreated: 0,
    };
  }

  const currentWeekNumber = await resolveCurrentWeekNumber(pool, workspaceId);
  const primaryProject =
    base.projects.find(
      (project) =>
        project.programPrefix === 'API' && project.templateName === 'Core Features'
    ) ?? base.projects[0] ?? null;

  const sprintMap = new Map<string, Map<number, { id: string; programId: string }>>();
  let sprintsCreated = 0;

  for (const project of base.projects) {
    const offsets = project.id === primaryProject?.id ? [-1, 0, 1] : [-1, 1];
    const projectSprintMap = new Map<number, { id: string; programId: string }>();

    for (const offset of offsets) {
      const sprintNumber = currentWeekNumber + offset;
      if (sprintNumber <= 0) {
        continue;
      }

      const existingSprint = await pool.query(
        `SELECT d.id
         FROM documents d
         JOIN document_associations da
           ON da.document_id = d.id
          AND da.related_id = $2
          AND da.relationship_type = 'project'
         WHERE d.workspace_id = $1
           AND d.document_type = 'sprint'
           AND (d.properties->>'sprint_number')::int = $3
         LIMIT 1`,
        [workspaceId, project.id, sprintNumber]
      );

      if (existingSprint.rows[0]) {
        projectSprintMap.set(sprintNumber, {
          id: existingSprint.rows[0].id,
          programId: project.programId,
        });
        continue;
      }

      const createdSprint = await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, properties, visibility, created_by)
         VALUES ($1, 'sprint', $2, $3, 'workspace', $4)
         RETURNING id`,
        [
          workspaceId,
          `Week ${sprintNumber}`,
          JSON.stringify({
            sprint_number: sprintNumber,
            owner_id: ownerUserId,
            project_id: project.id,
            assignee_ids: [ownerPersonDocId],
            plan: `${project.title} focus for week ${sprintNumber}.`,
            success_criteria: `Move ${project.templateName.toLowerCase()} work forward with visible weekly progress.`,
            confidence: offset < 0 ? 92 : offset === 0 ? 78 : 61,
            ...(offset < 0 ? { status: 'completed' } : offset === 0 ? { status: 'active' } : {}),
          }),
          ownerUserId,
        ]
      );

      await createAssociation(pool, createdSprint.rows[0].id, project.id, 'project');
      await createAssociation(pool, createdSprint.rows[0].id, project.programId, 'program');
      projectSprintMap.set(sprintNumber, {
        id: createdSprint.rows[0].id,
        programId: project.programId,
      });
      sprintsCreated++;
    }

    sprintMap.set(project.id, projectSprintMap);
  }

  const maxTickets = new Map<string, number>();
  for (const program of base.programs) {
    const result = await pool.query(
      `SELECT COALESCE(MAX(ticket_number), 0) AS max_ticket
       FROM documents d
       JOIN document_associations da
         ON da.document_id = d.id
        AND da.related_id = $2
        AND da.relationship_type = 'program'
       WHERE d.workspace_id = $1
         AND d.document_type = 'issue'`,
      [workspaceId, program.id]
    );
    maxTickets.set(program.id, Number(result.rows[0]?.max_ticket ?? 0));
  }

  let issuesCreated = 0;

  for (const project of base.projects) {
    const projectSprints = sprintMap.get(project.id) ?? new Map<number, { id: string; programId: string }>();

    for (const issueTemplate of DEMO_ISSUE_TEMPLATES) {
      const issueTitle = `${project.templateName}: ${issueTemplate.title}`;
      const issueType = inferSeedIssueType({
        title: issueTitle,
        projectTemplateName: project.templateName,
      });
      const issueContent = createIssueTemplateContent({
        title: issueTitle,
        issueType,
        projectLabel: project.templateName,
        mode: 'filled',
      });
      const existingIssue = await pool.query(
        `SELECT d.id, d.properties, d.content
         FROM documents d
         JOIN document_associations da
           ON da.document_id = d.id
          AND da.related_id = $2
          AND da.relationship_type = 'project'
         WHERE d.workspace_id = $1
           AND d.document_type = 'issue'
           AND d.title = $3
         LIMIT 1`,
        [workspaceId, project.id, issueTitle]
      );

      if (existingIssue.rows[0]) {
        await ensureIssueType(
          pool,
          existingIssue.rows[0].id,
          existingIssue.rows[0].properties as Record<string, unknown> | undefined,
          issueType
        );
        await ensureIssueContent(
          pool,
          existingIssue.rows[0].id,
          existingIssue.rows[0].content as Record<string, unknown> | undefined,
          issueContent
        );
        continue;
      }

      const nextTicketNumber = (maxTickets.get(project.programId) ?? 0) + 1;
      maxTickets.set(project.programId, nextTicketNumber);
      const sprintRecord =
        issueTemplate.sprintOffset === null
          ? null
          : projectSprints.get(currentWeekNumber + issueTemplate.sprintOffset) ??
            (issueTemplate.sprintOffset === 0 ? projectSprints.get(currentWeekNumber + 1) ?? null : null);

      const createdIssue = await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, content, properties, ticket_number, visibility, created_by)
         VALUES ($1, 'issue', $2, $3, $4, $5, 'workspace', $6)
         RETURNING id`,
        [
          workspaceId,
          issueTitle,
          JSON.stringify(issueContent),
          JSON.stringify({
            state: sprintRecord ? issueTemplate.state : 'backlog',
            priority: issueTemplate.priority,
            issue_type: issueType,
            source: 'internal',
            assignee_id: ownerUserId,
            estimate: issueTemplate.estimate,
          }),
          nextTicketNumber,
          ownerUserId,
        ]
      );

      await createAssociation(pool, createdIssue.rows[0].id, project.id, 'project');
      await createAssociation(pool, createdIssue.rows[0].id, project.programId, 'program');
      if (sprintRecord) {
        await createAssociation(pool, createdIssue.rows[0].id, sprintRecord.id, 'sprint');
      }
      issuesCreated++;
    }
  }

  let weeklyPlansCreated = 0;
  let weeklyRetrosCreated = 0;

  if (primaryProject) {
    const weeklyDocuments = [
      {
        type: 'weekly_plan' as const,
        weekNumber: currentWeekNumber,
        title: `Week ${currentWeekNumber} Plan - ${primaryProject.title}`,
        content: buildListDocumentContent(
          DEMO_PLAN_ITEMS.map((item) => `${primaryProject.templateName}: ${item}`)
        ),
        submittedAt: new Date().toISOString(),
      },
      {
        type: 'weekly_plan' as const,
        weekNumber: currentWeekNumber - 1,
        title: `Week ${currentWeekNumber - 1} Plan - ${primaryProject.title}`,
        content: buildListDocumentContent(
          DEMO_PLAN_ITEMS.map((item) => `${primaryProject.templateName}: ${item}`)
        ),
        submittedAt: new Date().toISOString(),
      },
      {
        type: 'weekly_retro' as const,
        weekNumber: currentWeekNumber - 1,
        title: `Week ${currentWeekNumber - 1} Retro - ${primaryProject.title}`,
        content: buildListDocumentContent(
          DEMO_RETRO_ITEMS.map((item) => `${primaryProject.templateName}: ${item}`)
        ),
        submittedAt: new Date().toISOString(),
      },
    ].filter((document) => document.weekNumber > 0);

    for (const weeklyDocument of weeklyDocuments) {
      const existing = await pool.query(
        `SELECT id
         FROM documents
         WHERE workspace_id = $1
           AND document_type = $2
           AND (properties->>'person_id') = $3
           AND (properties->>'project_id') = $4
           AND (properties->>'week_number')::int = $5
         LIMIT 1`,
        [
          workspaceId,
          weeklyDocument.type,
          ownerPersonDocId,
          primaryProject.id,
          weeklyDocument.weekNumber,
        ]
      );

      if (existing.rows[0]) {
        continue;
      }

      const created = await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, content, properties, visibility, created_by)
         VALUES ($1, $2, $3, $4, $5, 'workspace', $6)
         RETURNING id`,
        [
          workspaceId,
          weeklyDocument.type,
          weeklyDocument.title,
          JSON.stringify(weeklyDocument.content),
          JSON.stringify({
            person_id: ownerPersonDocId,
            project_id: primaryProject.id,
            week_number: weeklyDocument.weekNumber,
            submitted_at: weeklyDocument.submittedAt,
          }),
          ownerUserId,
        ]
      );

      await createAssociation(pool, created.rows[0].id, primaryProject.id, 'project');

      if (weeklyDocument.type === 'weekly_plan') {
        weeklyPlansCreated++;
      } else {
        weeklyRetrosCreated++;
      }
    }
  }

  let standupsCreated = 0;
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = weekStart.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysFromMonday);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const standupDaysToCreate = Math.max(
    1,
    Math.min(3, Math.floor((today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  );

  for (let offset = 0; offset < standupDaysToCreate; offset++) {
    const standupDate = new Date(weekStart);
    standupDate.setUTCDate(weekStart.getUTCDate() + offset);
    const isoDate = toIsoDate(standupDate);

    const existingStandup = await pool.query(
      `SELECT id
       FROM documents
       WHERE workspace_id = $1
         AND document_type = 'standup'
         AND (properties->>'author_id') = $2
         AND (properties->>'date') = $3
       LIMIT 1`,
      [workspaceId, ownerUserId, isoDate]
    );

    if (existingStandup.rows[0]) {
      continue;
    }

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, properties, visibility, created_by)
       VALUES ($1, 'standup', $2, $3, $4, 'workspace', $5)`,
      [
        workspaceId,
        `Standup ${isoDate}`,
        JSON.stringify(
          buildListDocumentContent([
            'Yesterday: closed the highest-priority open item.',
            'Today: moving the next scoped task forward.',
            'Blockers: none beyond normal review latency.',
          ])
        ),
        JSON.stringify({
          author_id: ownerUserId,
          date: isoDate,
        }),
        ownerUserId,
      ]
    );
    standupsCreated++;
  }

  return {
    programsCreated: base.programsCreated,
    projectsCreated: base.projectsCreated,
    sprintsCreated,
    issuesCreated,
    weeklyPlansCreated,
    weeklyRetrosCreated,
    standupsCreated,
  };
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
      COUNT(DISTINCT CASE WHEN d.document_type = 'issue' THEN d.id END)::text AS issue_count,
      COUNT(DISTINCT CASE WHEN d.document_type = 'sprint' THEN d.id END)::text AS sprint_count,
      COUNT(DISTINCT CASE WHEN d.document_type = 'wiki' AND d.title = 'Welcome to Ship' THEN d.id END)::text AS welcome_doc_count
    FROM workspaces w
    LEFT JOIN workspace_memberships wm ON wm.workspace_id = w.id
    LEFT JOIN documents d ON d.workspace_id = w.id AND d.archived_at IS NULL
    WHERE w.archived_at IS NULL
    GROUP BY w.id, w.name
  `);

  let candidates = 0;
  let workspacesUpdated = 0;
  let issueTypesUpdated = 0;
  let issueContentsUpdated = 0;

  for (const row of result.rows) {
    if (shouldBackfillMissingIssueTypesForWorkspace(row)) {
      const issueResult = await pool.query<{
        id: string;
        title: string;
        properties: Record<string, unknown> | null;
        content: Record<string, unknown> | null;
      }>(
        `SELECT id, title, properties, content
         FROM documents
         WHERE workspace_id = $1
           AND document_type = 'issue'
           AND archived_at IS NULL`,
        [row.workspace_id]
      );

      for (const issue of issueResult.rows) {
        const issueType = inferSeedIssueType({ title: issue.title });
        if (issue.properties?.issue_type !== issueType) {
          await ensureIssueType(
            pool,
            issue.id,
            issue.properties ?? undefined,
            issueType
          );
          issueTypesUpdated++;
        }

        if (shouldPopulateIssueTemplate(issue.content)) {
          await ensureIssueContent(
            pool,
            issue.id,
            issue.content ?? undefined,
            createIssueTemplateContent({
              title: issue.title,
              issueType,
              mode: 'filled',
            })
          );
          issueContentsUpdated++;
        }
      }
    }

    if (!shouldBackfillDemoWorkspace(row)) {
      continue;
    }

    const ownerUserId = row.owner_user_id;
    if (!ownerUserId) {
      continue;
    }

    candidates++;

    const populated = await populateDemoWorkspaceData(pool, {
      workspaceId: row.workspace_id,
      ownerUserId,
    });

    if (
      populated.programsCreated > 0 ||
      populated.projectsCreated > 0 ||
      populated.sprintsCreated > 0 ||
      populated.issuesCreated > 0 ||
      populated.weeklyPlansCreated > 0 ||
      populated.weeklyRetrosCreated > 0 ||
      populated.standupsCreated > 0
    ) {
      workspacesUpdated++;
      console.log(
        `✅ Demo workspace data backfilled for ${row.workspace_id}: ` +
          `${populated.programsCreated} programs, ` +
          `${populated.projectsCreated} projects, ` +
          `${populated.sprintsCreated} weeks, ` +
          `${populated.issuesCreated} issues, ` +
          `${populated.weeklyPlansCreated} plans, ` +
          `${populated.weeklyRetrosCreated} retros, ` +
          `${populated.standupsCreated} standups`
      );
    }
  }

  console.log(
    `ℹ️ Demo workspace backfill scan complete: ` +
      `${candidates} candidate workspace(s), ${workspacesUpdated} updated, ` +
      `${issueTypesUpdated} issue type(s) backfilled, ` +
      `${issueContentsUpdated} issue content template(s) backfilled`
  );
}
