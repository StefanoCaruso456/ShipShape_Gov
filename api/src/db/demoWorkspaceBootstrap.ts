import type pg from 'pg';
import { DEMO_PROGRAM_TEMPLATES, DEMO_PROJECT_TEMPLATES } from './demoWorkspaceTemplates.js';
import {
  buildDemoProjectSprintNumbers,
  DEMO_FOUNDATION_WEEK_2_ISSUES,
  resolveDemoWeekIssueState,
} from './demoWeekCoverage.js';
import { buildIssuePlanningProperties, ensureIssuePlanningProperties } from './seedPlanningUtils.js';
import { inferSeedIssueType } from './seedIssueTypes.js';
import { createIssueTemplateContent, shouldPopulateIssueTemplate } from '../utils/issueContentTemplate.js';
import { hasSprintPlanningSnapshot, persistSprintPlanningSnapshot } from '../utils/sprint-planning.js';

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
  weeklyReviewsCreated: number;
  standupsCreated: number;
}

interface DemoIssueTemplate {
  title: string;
  state: 'done' | 'in_progress' | 'todo' | 'backlog' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  estimate: number;
  sprintOffset: number | null;
}

const PAST_WEEKS_TO_SEED = 6;

const DEMO_ISSUE_TEMPLATES: DemoIssueTemplate[] = [
  {
    title: 'Frame the problem space',
    state: 'done',
    priority: 'high',
    estimate: 3,
    sprintOffset: -6,
  },
  {
    title: 'Capture the baseline workflow',
    state: 'done',
    priority: 'medium',
    estimate: 2,
    sprintOffset: -6,
  },
  {
    title: 'Document delivery milestones',
    state: 'done',
    priority: 'medium',
    estimate: 3,
    sprintOffset: -5,
  },
  {
    title: 'Define implementation outline',
    state: 'done',
    priority: 'high',
    estimate: 5,
    sprintOffset: -5,
  },
  {
    title: 'Prototype the user flow',
    state: 'done',
    priority: 'high',
    estimate: 5,
    sprintOffset: -4,
  },
  {
    title: 'Review dependency handoffs',
    state: 'todo',
    priority: 'medium',
    estimate: 3,
    sprintOffset: -4,
  },
  {
    title: 'Set up project structure',
    state: 'done',
    priority: 'high',
    estimate: 4,
    sprintOffset: -3,
  },
  {
    title: 'Create implementation notes',
    state: 'done',
    priority: 'medium',
    estimate: 3,
    sprintOffset: -3,
  },
  {
    title: 'Define coding standards',
    state: 'done',
    priority: 'low',
    estimate: 2,
    sprintOffset: -2,
  },
  {
    title: 'Configure CI checks',
    state: 'done',
    priority: 'high',
    estimate: 4,
    sprintOffset: -2,
  },
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
  const welcomeDocCount = Number(row.welcome_doc_count);
  const looksLikeSetupWorkspace = row.workspace_name.endsWith("'s Workspace");

  // Keep setup workspaces eligible for idempotent demo backfills so newer
  // baseline weeks and issue context can be added to already-populated demos.
  return looksLikeSetupWorkspace && welcomeDocCount > 0 && Boolean(row.owner_user_id);
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

function hasSeedValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function shouldBackfillSeedProperty(currentValue: unknown, desiredValue: unknown): boolean {
  if (Array.isArray(desiredValue)) {
    return !Array.isArray(currentValue) || currentValue.length === 0;
  }

  if (typeof desiredValue === 'string') {
    return typeof currentValue !== 'string' || currentValue.trim().length === 0;
  }

  return !hasSeedValue(currentValue) && hasSeedValue(desiredValue);
}

async function ensureDocumentProperties(
  pool: pg.Pool,
  documentId: string,
  properties: Record<string, unknown> | null | undefined,
  desiredProperties: Record<string, unknown>
): Promise<void> {
  const currentProperties = properties ?? {};
  let changed = false;
  const nextProperties: Record<string, unknown> = { ...currentProperties };

  for (const [key, value] of Object.entries(desiredProperties)) {
    if (shouldBackfillSeedProperty(currentProperties[key], value) && hasSeedValue(value)) {
      nextProperties[key] = value;
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  await pool.query(
    `UPDATE documents
     SET properties = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(nextProperties), documentId]
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

function buildReviewDocumentContent(projectTitle: string, weekNumber: number): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: `Week ${weekNumber} review` }],
      },
      {
        type: 'bulletList',
        content: [
          `Closed the baseline commitments for ${projectTitle}.`,
          'Kept the sprint focused on the highest-priority scoped work.',
        ].map((item) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: item }],
            },
          ],
        })),
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Follow-up' }],
      },
      {
        type: 'bulletList',
        content: [
          'Carry forward any remaining cleanup explicitly into the next weekly plan.',
          'Keep blocker and scope-change notes visible for the next review pass.',
        ].map((item) => ({
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

function buildSprintSnapshotDate(workspaceSprintStartDate: Date, sprintNumber: number): Date {
  const snapshotDate = new Date(workspaceSprintStartDate);
  snapshotDate.setUTCHours(0, 0, 0, 0);
  snapshotDate.setUTCDate(snapshotDate.getUTCDate() + (sprintNumber - 1) * 7);
  return snapshotDate;
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

async function resolveWorkspaceSprintStartDate(pool: pg.Pool, workspaceId: string): Promise<Date> {
  const result = await pool.query(
    `SELECT sprint_start_date
     FROM workspaces
     WHERE id = $1`,
    [workspaceId]
  );

  const rawStartDate = result.rows[0]?.sprint_start_date;
  if (rawStartDate instanceof Date) {
    return new Date(
      Date.UTC(rawStartDate.getFullYear(), rawStartDate.getMonth(), rawStartDate.getDate())
    );
  }

  if (typeof rawStartDate === 'string') {
    return new Date(`${rawStartDate}T00:00:00Z`);
  }

  return new Date();
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
      `SELECT id, properties
       FROM documents
       WHERE workspace_id = $1
         AND document_type = 'program'
         AND properties->>'prefix' = $2`,
      [workspaceId, programTemplate.prefix]
    );

    if (existingProgram.rows[0]) {
      await ensureDocumentProperties(
        pool,
        existingProgram.rows[0].id as string,
        existingProgram.rows[0].properties as Record<string, unknown> | undefined,
        {
          prefix: programTemplate.prefix,
          color: programTemplate.color,
          owner_id: ownerUserId,
          description: programTemplate.description,
          goals: programTemplate.goals,
        }
      );
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
          description: programTemplate.description,
          goals: programTemplate.goals,
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
        `SELECT d.id, d.properties
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
        await ensureDocumentProperties(
          pool,
          existingProject.rows[0].id as string,
          existingProject.rows[0].properties as Record<string, unknown> | undefined,
          {
            color: projectTemplate.color,
            emoji: projectTemplate.emoji,
            description: projectTemplate.description,
            impact: projectTemplate.impact,
            confidence: projectTemplate.confidence,
            ease: projectTemplate.ease,
            plan: projectTemplate.plan,
            success_criteria: projectTemplate.successCriteria,
            monetary_impact_expected: projectTemplate.monetaryImpactExpected,
            owner_id: ownerUserId,
            has_design_review: projectTemplate.hasDesignReview,
            design_review_notes: projectTemplate.designReviewNotes,
          }
        );
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
            description: projectTemplate.description,
            impact: projectTemplate.impact,
            confidence: projectTemplate.confidence,
            ease: projectTemplate.ease,
            plan: projectTemplate.plan,
            success_criteria: projectTemplate.successCriteria,
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
      weeklyReviewsCreated: 0,
      standupsCreated: 0,
    };
  }

  const currentWeekNumber = await resolveCurrentWeekNumber(pool, workspaceId);
  const workspaceSprintStartDate = await resolveWorkspaceSprintStartDate(pool, workspaceId);
  const primaryProject =
    base.projects.find(
      (project) =>
        project.programPrefix === 'API' && project.templateName === 'Core Features'
    ) ?? base.projects[0] ?? null;

  const sprintMap = new Map<string, Map<number, { id: string; programId: string }>>();
  let sprintsCreated = 0;

  for (const project of base.projects) {
    const sprintNumbers = buildDemoProjectSprintNumbers(
      currentWeekNumber,
      project.templateName,
      PAST_WEEKS_TO_SEED
    );
    const projectSprintMap = new Map<number, { id: string; programId: string }>();

    for (const sprintNumber of sprintNumbers) {
      const existingSprint = await pool.query(
        `SELECT d.id, d.properties
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

      const desiredSprintProperties = {
        sprint_number: sprintNumber,
        owner_id: ownerUserId,
        project_id: project.id,
        assignee_ids: [ownerPersonDocId],
        plan: `${project.title} focus for week ${sprintNumber}.`,
        success_criteria: [
          `Move ${project.templateName.toLowerCase()} work forward with visible weekly progress.`,
          'Keep the sprint scoped enough to review and close cleanly.',
        ],
        confidence:
          sprintNumber < currentWeekNumber ? 92 : sprintNumber === currentWeekNumber ? 78 : 61,
        ...(sprintNumber < currentWeekNumber
          ? { status: 'completed' }
          : sprintNumber === currentWeekNumber
            ? { status: 'active' }
            : {}),
      };

      if (existingSprint.rows[0]) {
        await ensureDocumentProperties(
          pool,
          existingSprint.rows[0].id as string,
          existingSprint.rows[0].properties as Record<string, unknown> | undefined,
          desiredSprintProperties
        );
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
          JSON.stringify(desiredSprintProperties),
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
        await ensureIssuePlanningProperties(
          pool,
          existingIssue.rows[0].id,
          existingIssue.rows[0].properties as Record<string, unknown> | undefined,
          issueTemplate.estimate
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

      if (issueTemplate.sprintOffset !== null && !sprintRecord) {
        continue;
      }

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
            ...buildIssuePlanningProperties(issueTemplate.estimate),
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

    const foundationSprintRecord = projectSprints.get(2) ?? null;
    if (foundationSprintRecord) {
      for (const [issueIndex, issueTemplate] of DEMO_FOUNDATION_WEEK_2_ISSUES.entries()) {
        const issueTitle = `${project.title}: ${issueTemplate.titleSuffix}`;
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

        const issueState = resolveDemoWeekIssueState(currentWeekNumber, 2, issueIndex);

        if (existingIssue.rows[0]) {
          const issueId = existingIssue.rows[0].id as string;
          await ensureIssueType(
            pool,
            issueId,
            existingIssue.rows[0].properties as Record<string, unknown> | undefined,
            issueType
          );
          await ensureIssueContent(
            pool,
            issueId,
            existingIssue.rows[0].content as Record<string, unknown> | undefined,
            issueContent
          );
          await ensureIssuePlanningProperties(
            pool,
            issueId,
            existingIssue.rows[0].properties as Record<string, unknown> | undefined,
            issueTemplate.estimate
          );
          await createAssociation(pool, issueId, project.id, 'project');
          await createAssociation(pool, issueId, project.programId, 'program');
          await createAssociation(pool, issueId, foundationSprintRecord.id, 'sprint');
          continue;
        }

        const nextTicketNumber = (maxTickets.get(project.programId) ?? 0) + 1;
        maxTickets.set(project.programId, nextTicketNumber);

        const createdIssue = await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, content, properties, ticket_number, visibility, created_by)
           VALUES ($1, 'issue', $2, $3, $4, $5, 'workspace', $6)
           RETURNING id`,
          [
            workspaceId,
            issueTitle,
            JSON.stringify(issueContent),
            JSON.stringify({
              state: issueState,
              priority: issueTemplate.priority,
              issue_type: issueType,
              source: 'internal',
              assignee_id: ownerUserId,
              ...buildIssuePlanningProperties(issueTemplate.estimate),
            }),
            nextTicketNumber,
            ownerUserId,
          ]
        );

        await createAssociation(pool, createdIssue.rows[0].id, project.id, 'project');
        await createAssociation(pool, createdIssue.rows[0].id, project.programId, 'program');
        await createAssociation(pool, createdIssue.rows[0].id, foundationSprintRecord.id, 'sprint');
        issuesCreated++;
      }
    }
  }

  for (const projectSprintMap of sprintMap.values()) {
    for (const [weekNumber, sprintRecord] of projectSprintMap.entries()) {
      if (weekNumber > currentWeekNumber) {
        continue;
      }

      const sprintPropertiesResult = await pool.query(
        `SELECT properties
         FROM documents
         WHERE id = $1`,
        [sprintRecord.id]
      );
      const sprintProperties = sprintPropertiesResult.rows[0]?.properties as Record<string, unknown> | undefined;
      if (hasSprintPlanningSnapshot(sprintProperties)) {
        continue;
      }

      await persistSprintPlanningSnapshot(pool, sprintRecord.id, sprintProperties, {
        source: weekNumber < currentWeekNumber ? 'seeded_history' : 'captured_at_start',
        snapshotTakenAt: buildSprintSnapshotDate(workspaceSprintStartDate, weekNumber),
      });
    }
  }

  let weeklyPlansCreated = 0;
  let weeklyRetrosCreated = 0;
  let weeklyReviewsCreated = 0;

  if (ownerPersonDocId) {
    for (const project of base.projects) {
      const foundationSprintRecord = sprintMap.get(project.id)?.get(2) ?? null;
      if (!foundationSprintRecord) {
        continue;
      }

      const foundationWeekDocuments = [
        {
          type: 'weekly_plan' as const,
          weekNumber: 2,
          title: `Week 2 Plan - ${project.title}`,
          content: buildListDocumentContent(
            DEMO_PLAN_ITEMS.map((item) => `${project.templateName}: ${item}`)
          ),
          submittedAt: buildSprintSnapshotDate(workspaceSprintStartDate, 2).toISOString(),
        },
        ...(currentWeekNumber > 2
          ? [
              {
                type: 'weekly_retro' as const,
                weekNumber: 2,
                title: `Week 2 Retro - ${project.title}`,
                content: buildListDocumentContent(
                  DEMO_RETRO_ITEMS.map((item) => `${project.templateName}: ${item}`)
                ),
                submittedAt: buildSprintSnapshotDate(workspaceSprintStartDate, 2).toISOString(),
              },
            ]
          : []),
      ];

      for (const weeklyDocument of foundationWeekDocuments) {
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
            project.id,
            weeklyDocument.weekNumber,
          ]
        );

        if (!existing.rows[0]) {
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
                project_id: project.id,
                week_number: weeklyDocument.weekNumber,
                submitted_at: weeklyDocument.submittedAt,
              }),
              ownerUserId,
            ]
          );

          await createAssociation(pool, created.rows[0].id, project.id, 'project');

          if (weeklyDocument.type === 'weekly_plan') {
            weeklyPlansCreated++;
          } else {
            weeklyRetrosCreated++;
          }
        }
      }

      if (currentWeekNumber > 2) {
        const existingReview = await pool.query(
          `SELECT d.id
           FROM documents d
           JOIN document_associations da
             ON da.document_id = d.id
            AND da.related_id = $2
            AND da.relationship_type = 'sprint'
           WHERE d.workspace_id = $1
             AND d.document_type = 'weekly_review'
           LIMIT 1`,
          [workspaceId, foundationSprintRecord.id]
        );

        if (!existingReview.rows[0]) {
          const reviewResult = await pool.query(
            `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by, visibility)
             VALUES ($1, 'weekly_review', $2, $3, $4, $5, 'workspace')
             RETURNING id`,
            [
              workspaceId,
              `Week 2 Review - ${project.title}`,
              JSON.stringify(buildReviewDocumentContent(project.title, 2)),
              JSON.stringify({
                sprint_id: foundationSprintRecord.id,
                owner_id: ownerUserId,
                plan_validated: true,
              }),
              ownerUserId,
            ]
          );

          await createAssociation(pool, reviewResult.rows[0].id, foundationSprintRecord.id, 'sprint');
          weeklyReviewsCreated++;
        }
      }
    }
  }

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

  if (currentWeekNumber > 2) {
    for (const project of base.projects) {
      const foundationSprintRecord = sprintMap.get(project.id)?.get(2) ?? null;
      if (!foundationSprintRecord) {
        continue;
      }

      for (const dayOffset of [1, 2]) {
        const standupDate = buildSprintSnapshotDate(workspaceSprintStartDate, 2);
        standupDate.setUTCDate(standupDate.getUTCDate() + dayOffset);
        const isoDate = toIsoDate(standupDate);
        const existingStandup = await pool.query(
          `SELECT d.id
           FROM documents d
           JOIN document_associations da
             ON da.document_id = d.id
            AND da.related_id = $4
            AND da.relationship_type = 'sprint'
           WHERE d.workspace_id = $1
             AND d.document_type = 'standup'
             AND (properties->>'author_id') = $2
             AND (properties->>'date') = $3
           LIMIT 1`,
          [workspaceId, ownerUserId, isoDate, foundationSprintRecord.id]
        );

        if (existingStandup.rows[0]) {
          continue;
        }

        const createdStandup = await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, content, properties, visibility, created_by, created_at)
           VALUES ($1, 'standup', $2, $3, $4, 'workspace', $5, $6)
           RETURNING id`,
          [
            workspaceId,
            `Standup ${isoDate} - ${project.title}`,
            JSON.stringify(
              buildListDocumentContent([
                `Yesterday: moved ${project.templateName.toLowerCase()} work forward.`,
                'Today: finishing the next scoped issue in the sprint.',
                'Blockers: no blockers beyond normal review handoff.',
              ])
            ),
            JSON.stringify({
              author_id: ownerUserId,
              date: isoDate,
            }),
            ownerUserId,
            `${isoDate}T14:00:00.000Z`,
          ]
        );

        await createAssociation(pool, createdStandup.rows[0].id, foundationSprintRecord.id, 'sprint');
        standupsCreated++;
      }
    }
  }

  return {
    programsCreated: base.programsCreated,
    projectsCreated: base.projectsCreated,
    sprintsCreated,
    issuesCreated,
    weeklyPlansCreated,
    weeklyRetrosCreated,
    weeklyReviewsCreated,
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
      populated.weeklyReviewsCreated > 0 ||
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
          `${populated.weeklyReviewsCreated} reviews, ` +
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
