import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { loadProductionSecrets } from '../config/ssm.js';
import { WELCOME_DOCUMENT_TITLE, WELCOME_DOCUMENT_CONTENT } from './welcomeDocument.js';
import { DEMO_PROGRAM_TEMPLATES, DEMO_PROJECT_TEMPLATES } from './demoWorkspaceTemplates.js';
import {
  DEMO_FOUNDATION_WEEK_NUMBERS,
  DEMO_FOUNDATION_WEEK_2_ISSUES,
  resolveDemoWeekIssueState,
} from './demoWeekCoverage.js';
import { buildIssuePlanningProperties, ensureIssuePlanningProperties } from './seedPlanningUtils.js';
import { inferSeedIssueType } from './seedIssueTypes.js';
import { createIssueTemplateContent, shouldPopulateIssueTemplate } from '../utils/issueContentTemplate.js';
import { hasSprintPlanningSnapshot, persistSprintPlanningSnapshot } from '../utils/sprint-planning.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment (local dev only - production uses SSM)
config({ path: join(__dirname, '../../.env.local') });
config({ path: join(__dirname, '../../.env') });

/**
 * Helper to create document associations in the junction table
 * This replaces the legacy program_id, project_id, sprint_id columns
 */
async function createAssociation(
  pool: pg.Pool,
  documentId: string,
  relatedId: string,
  relationshipType: 'program' | 'project' | 'sprint',
  metadata?: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
    [documentId, relatedId, relationshipType, JSON.stringify(metadata || { created_via: 'seed' })]
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

interface SeedIssueTemplate {
  title: string;
  state: 'done' | 'in_progress' | 'todo' | 'backlog' | 'cancelled';
  sprintOffset: number | null;
  priority: 'high' | 'medium' | 'low';
  estimate: number;
}

const PAST_SPRINTS_TO_SEED = 6;
const FUTURE_SPRINTS_TO_SEED = 3;

function buildSprintSnapshotDate(workspaceSprintStartDate: Date, sprintNumber: number): Date {
  const snapshotDate = new Date(workspaceSprintStartDate);
  snapshotDate.setUTCHours(0, 0, 0, 0);
  snapshotDate.setUTCDate(snapshotDate.getUTCDate() + (sprintNumber - 1) * 7);
  return snapshotDate;
}

async function seed() {
  // Load secrets from SSM in production (must happen before Pool creation)
  await loadProductionSecrets();

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  console.log('🌱 Starting database seed...');
  // Only log hostname, never full connection string (contains credentials)
  const dbHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'unknown';
  console.log(`   Database host: ${dbHost}`);

  try {
    // Run schema
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schema);
    console.log('✅ Schema created');

    // Check if workspace exists
    const existingWorkspace = await pool.query(
      'SELECT id FROM workspaces WHERE name = $1',
      ['Ship Workspace']
    );

    let workspaceId: string;

    if (existingWorkspace.rows[0]) {
      workspaceId = existingWorkspace.rows[0].id;
      console.log('ℹ️  Workspace already exists');
    } else {
      // Create workspace with sprint_start_date ~3 months ago, aligned to Monday.
      // Weeks must start on Monday to match production and ensure the heatmap
      // shows correct "due" (yellow) windows for plans (Sat-Mon) and retros (Thu-Fri).
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      // Roll back to the nearest Monday (day 1)
      const dayOfWeek = threeMonthsAgo.getDay(); // 0=Sun, 1=Mon, ...
      const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      threeMonthsAgo.setDate(threeMonthsAgo.getDate() - daysToSubtract);
      const workspaceResult = await pool.query(
        `INSERT INTO workspaces (name, sprint_start_date)
         VALUES ($1, $2)
         RETURNING id`,
        ['Ship Workspace', threeMonthsAgo.toISOString().split('T')[0]]
      );
      workspaceId = workspaceResult.rows[0].id;
      console.log('✅ Workspace created');
    }

    // Team members to seed (dev user + 10 fake users)
    const teamMembers = [
      { email: 'dev@ship.local', name: 'Dev User', workPersona: 'product_manager' },
      { email: 'alice.chen@ship.local', name: 'Alice Chen', workPersona: 'engineering_manager' },
      { email: 'bob.martinez@ship.local', name: 'Bob Martinez', workPersona: 'engineering_manager' },
      { email: 'carol.williams@ship.local', name: 'Carol Williams', workPersona: 'designer' },
      { email: 'david.kim@ship.local', name: 'David Kim', workPersona: 'engineer' },
      { email: 'emma.johnson@ship.local', name: 'Emma Johnson', workPersona: 'engineer' },
      { email: 'frank.garcia@ship.local', name: 'Frank Garcia', workPersona: 'qa' },
      { email: 'grace.lee@ship.local', name: 'Grace Lee', workPersona: 'ops_platform' },
      { email: 'henry.patel@ship.local', name: 'Henry Patel', workPersona: 'engineer' },
      { email: 'iris.nguyen@ship.local', name: 'Iris Nguyen', workPersona: 'stakeholder' },
      { email: 'jack.brown@ship.local', name: 'Jack Brown', workPersona: 'engineer' },
    ];

    const passwordHash = await bcrypt.hash('admin123', 10);
    let usersCreated = 0;

    for (const member of teamMembers) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [member.email]
      );

      if (!existingUser.rows[0]) {
        await pool.query(
          `INSERT INTO users (email, password_hash, name, work_persona, last_workspace_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [member.email, passwordHash, member.name, member.workPersona, workspaceId]
        );
        usersCreated++;
      }
    }

    if (usersCreated > 0) {
      console.log(`✅ Created ${usersCreated} users (all use password: admin123)`);
    } else {
      console.log('ℹ️  All users already exist');
    }

    // Set dev user as super-admin and set their last workspace
    await pool.query(
      `UPDATE users SET is_super_admin = true, last_workspace_id = $1 WHERE email = 'dev@ship.local'`,
      [workspaceId]
    );
    console.log('✅ Set dev@ship.local as super-admin');

    // Create workspace memberships and Person documents for all users
    // Note: These are independent - no coupling via person_document_id
    let membershipsCreated = 0;
    let personDocsCreated = 0;
    const allUsersForMembership = await pool.query(
      'SELECT id, email, name FROM users'
    );

    for (const user of allUsersForMembership.rows) {
      // Check for existing membership
      const existingMembership = await pool.query(
        'SELECT id FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2',
        [workspaceId, user.id]
      );

      if (!existingMembership.rows[0]) {
        // Make dev user an admin, others are members
        const role = user.email === 'dev@ship.local' ? 'admin' : 'member';
        await pool.query(
          `INSERT INTO workspace_memberships (workspace_id, user_id, role)
           VALUES ($1, $2, $3)`,
          [workspaceId, user.id, role]
        );
        membershipsCreated++;
      }

      // Check for existing person document (via properties.user_id)
      const existingPersonDoc = await pool.query(
        `SELECT id FROM documents
         WHERE workspace_id = $1 AND document_type = 'person' AND properties->>'user_id' = $2`,
        [workspaceId, user.id]
      );

      if (!existingPersonDoc.rows[0]) {
        // Create Person document with properties.user_id
        await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
           VALUES ($1, 'person', $2, $3, $4)`,
          [
            workspaceId,
            user.name,
            JSON.stringify({
              user_id: user.id,
              email: user.email,
              work_persona: teamMembers.find((member) => member.email === user.email)?.workPersona ?? null,
            }),
            user.id,
          ]
        );
        personDocsCreated++;
      }
    }

    if (membershipsCreated > 0) {
      console.log(`✅ Created ${membershipsCreated} workspace memberships`);
    } else {
      console.log('ℹ️  All workspace memberships already exist');
    }

    if (personDocsCreated > 0) {
      console.log(`✅ Created ${personDocsCreated} Person documents`);
    }

    // Set up reports_to hierarchy: Dev User → 3 managers → remaining ICs
    const reportingHierarchy: Record<string, string[]> = {
      'dev@ship.local': [], // Root — no manager
      'alice.chen@ship.local': ['dev@ship.local'],
      'bob.martinez@ship.local': ['dev@ship.local'],
      'carol.williams@ship.local': ['dev@ship.local'],
      'david.kim@ship.local': ['alice.chen@ship.local'],
      'emma.johnson@ship.local': ['alice.chen@ship.local'],
      'frank.garcia@ship.local': ['bob.martinez@ship.local'],
      'grace.lee@ship.local': ['bob.martinez@ship.local'],
      'henry.patel@ship.local': ['carol.williams@ship.local'],
      'iris.nguyen@ship.local': ['carol.williams@ship.local'],
      'jack.brown@ship.local': ['carol.williams@ship.local'],
    };

    // Build email → user_id map
    const emailToUserId = new Map<string, string>();
    for (const user of allUsersForMembership.rows) {
      emailToUserId.set(user.email, user.id);
    }

    // Set reports_to on person documents
    let reportsToSet = 0;
    for (const [email, managers] of Object.entries(reportingHierarchy)) {
      if (managers.length === 0) continue; // Root has no manager
      const managerEmail = managers[0]!;
      const managerId = emailToUserId.get(managerEmail);
      const userId = emailToUserId.get(email);
      if (managerId && userId) {
        await pool.query(
          `UPDATE documents SET properties = properties || jsonb_build_object('reports_to', $1::text)
           WHERE workspace_id = $2 AND document_type = 'person' AND properties->>'user_id' = $3`,
          [managerId, workspaceId, userId]
        );
        reportsToSet++;
      }
    }
    if (reportsToSet > 0) {
      console.log(`✅ Set reports_to for ${reportsToSet} people (3-level hierarchy)`);
    }

    // Get all user IDs for assignment (join through workspace_memberships)
    // Also get person document IDs for team allocation
    const allUsersResult = await pool.query(
      `SELECT u.id, u.name, d.id as person_doc_id FROM users u
       JOIN workspace_memberships wm ON wm.user_id = u.id
       LEFT JOIN documents d ON d.workspace_id = wm.workspace_id
         AND d.document_type = 'person' AND d.properties->>'user_id' = u.id::text
       WHERE wm.workspace_id = $1`,
      [workspaceId]
    );
    const allUsers = allUsersResult.rows;

    // Programs to seed
    const programs: Array<{ id: string; prefix: string; name: string; color: string }> = [];
    let programsCreated = 0;

    for (const prog of DEMO_PROGRAM_TEMPLATES) {
      const existingProgram = await pool.query(
        `SELECT id, properties
         FROM documents
         WHERE workspace_id = $1 AND document_type = $2 AND properties->>'prefix' = $3`,
        [workspaceId, 'program', prog.prefix]
      );

      if (existingProgram.rows[0]) {
        await ensureDocumentProperties(
          pool,
          existingProgram.rows[0].id as string,
          existingProgram.rows[0].properties as Record<string, unknown> | undefined,
          {
            prefix: prog.prefix,
            color: prog.color,
            owner_id: allUsers.find((user: { name: string }) => user.name === 'Dev User')?.id,
            description: prog.description,
            goals: prog.goals,
          }
        );
        programs.push({ id: existingProgram.rows[0].id, ...prog });
      } else {
        const properties = {
          prefix: prog.prefix,
          color: prog.color,
          owner_id: allUsers.find((user: { name: string }) => user.name === 'Dev User')?.id ?? null,
          description: prog.description,
          goals: prog.goals,
        };
        const programResult = await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, properties)
           VALUES ($1, 'program', $2, $3)
           RETURNING id`,
          [workspaceId, prog.name, JSON.stringify(properties)]
        );
        programs.push({ id: programResult.rows[0].id, ...prog });
        programsCreated++;
      }
    }

    if (programsCreated > 0) {
      console.log(`✅ Created ${programsCreated} programs`);
    } else {
      console.log('ℹ️  All programs already exist');
    }

    // Define stable teams per program so sprint ownership, issue assignment,
    // and weekly plans/retros all align consistently.
    // Uses names (not indices) because allUsers query order is non-deterministic.
    const programTeamNames: string[][] = [
      ['Dev User', 'Emma Johnson'],      // Ship Core
      ['Alice Chen', 'Frank Garcia'],    // Authentication
      ['Grace Lee', 'Henry Patel'],      // API Platform
      ['Carol Williams', 'David Kim'],   // Design System
      ['Jack Brown', 'Iris Nguyen'],     // Infrastructure
    ];
    const programTeams: Record<string, number[]> = {};
    programs.forEach((prog, idx) => {
      const names = programTeamNames[idx] || ['Dev User'];
      programTeams[prog.id] = names.map(name => {
        const userIdx = allUsers.findIndex((u: { name: string }) => u.name === name);
        return userIdx >= 0 ? userIdx : 0;
      });
    });

    // Create projects for each program
    // Each project has ICE scores (Impact, Confidence, Ease) for prioritization (1-5 scale)
    const projects: Array<{ id: string; programId: string; title: string }> = [];
    let projectsCreated = 0;

    for (const program of programs) {
      for (const template of DEMO_PROJECT_TEMPLATES) {
        const projectTitle = `${program.name} - ${template.name}`;

        // Check if project already exists (via junction table association to program)
        const existingProject = await pool.query(
          `SELECT d.id, d.properties FROM documents d
           JOIN document_associations da ON da.document_id = d.id
             AND da.related_id = $3 AND da.relationship_type = 'program'
           WHERE d.workspace_id = $1 AND d.document_type = 'project' AND d.title = $2`,
          [workspaceId, projectTitle, program.id]
        );

        if (existingProject.rows[0]) {
          const ownerIdx =
            (programs.indexOf(program) * DEMO_PROJECT_TEMPLATES.length + DEMO_PROJECT_TEMPLATES.indexOf(template)) %
            allUsers.length;
          const owner = allUsers[ownerIdx]!;
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + (DEMO_PROJECT_TEMPLATES.indexOf(template) + 2) * 7);
          await ensureDocumentProperties(
            pool,
            existingProject.rows[0].id as string,
            existingProject.rows[0].properties as Record<string, unknown> | undefined,
            {
              color: template.color,
              emoji: template.emoji,
              description: template.description,
              owner_id: owner.id,
              impact: template.impact,
              confidence: template.confidence,
              ease: template.ease,
              plan: template.plan,
              success_criteria: template.successCriteria,
              monetary_impact_expected: template.monetaryImpactExpected,
              target_date: targetDate.toISOString().split('T')[0],
              has_design_review: template.hasDesignReview,
              design_review_notes: template.designReviewNotes,
            }
          );
          projects.push({
            id: existingProject.rows[0].id,
            programId: program.id,
            title: projectTitle,
          });
        } else {
          // Assign owner rotating through team members
          const ownerIdx = (programs.indexOf(program) * DEMO_PROJECT_TEMPLATES.length + DEMO_PROJECT_TEMPLATES.indexOf(template)) % allUsers.length;
          const owner = allUsers[ownerIdx]!;

          // Calculate target date (2-4 weeks from now based on project type)
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + (DEMO_PROJECT_TEMPLATES.indexOf(template) + 2) * 7);

          const projectProperties: Record<string, unknown> = {
            color: template.color,
            emoji: template.emoji,
            description: template.description,
            owner_id: owner.id,
            // ICE scores (1-5 scale)
            impact: template.impact,
            confidence: template.confidence,
            ease: template.ease,
            plan: template.plan,
            success_criteria: template.successCriteria,
            monetary_impact_expected: template.monetaryImpactExpected,
            target_date: targetDate.toISOString().split('T')[0],
          };
          // Add design review fields if present in template
          if (template.hasDesignReview !== undefined) {
            projectProperties.has_design_review = template.hasDesignReview;
          }
          if (template.designReviewNotes !== undefined) {
            projectProperties.design_review_notes = template.designReviewNotes;
          }
          // Create project document without legacy program_id column
          const projectResult = await pool.query(
            `INSERT INTO documents (workspace_id, document_type, title, properties)
             VALUES ($1, 'project', $2, $3)
             RETURNING id`,
            [workspaceId, projectTitle, JSON.stringify(projectProperties)]
          );
          const projectId = projectResult.rows[0].id;

          // Create association to program via junction table
          await createAssociation(pool, projectId, program.id, 'program');

          projects.push({
            id: projectId,
            programId: program.id,
            title: projectTitle,
          });
          projectsCreated++;
        }
      }
    }

    if (projectsCreated > 0) {
      console.log(`✅ Created ${projectsCreated} projects`);
    } else {
      console.log('ℹ️  All projects already exist');
    }

    // Get workspace sprint start date and calculate current sprint (1-week sprints)
    const wsResult = await pool.query(
      'SELECT sprint_start_date FROM workspaces WHERE id = $1',
      [workspaceId]
    );
    const sprintStartDate = new Date(wsResult.rows[0].sprint_start_date);
    const today = new Date();
    const daysSinceStart = Math.floor((today.getTime() - sprintStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const currentSprintNumber = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

    // Create sprints for each program (current-6 to current+3)
    // Sprint owners and assignees come from the program's team (not global rotation)
    // Sprints are distributed among the program's projects
    const sprintsToCreateByKey = new Map<
      string,
      { programId: string; projectId: string; number: number; ownerIdx: number }
    >();
    const queueSprintCreation = (
      programId: string,
      projectId: string,
      number: number,
      ownerIdx: number
    ) => {
      const key = `${programId}:${projectId}:${number}`;
      if (!sprintsToCreateByKey.has(key)) {
        sprintsToCreateByKey.set(key, {
          programId,
          projectId,
          number,
          ownerIdx,
        });
      }
    };

    for (const program of programs) {
      const team = programTeams[program.id]!;
      // Get projects for this program to distribute sprints among them
      const programProjects = projects.filter(p => p.programId === program.id);

      for (const project of programProjects) {
        for (const sprintNum of DEMO_FOUNDATION_WEEK_NUMBERS) {
          queueSprintCreation(
            program.id,
            project.id,
            sprintNum,
            team[(sprintNum - 1) % team.length]!
          );
        }
      }

      let projectIdx = 0;
      for (let sprintNum = currentSprintNumber - PAST_SPRINTS_TO_SEED; sprintNum <= currentSprintNumber + FUTURE_SPRINTS_TO_SEED; sprintNum++) {
        if (sprintNum > 0) {
          // Round-robin assign sprints to projects within the program
          const project = programProjects[projectIdx % programProjects.length]!;
          // Owner rotates within the program's team
          const ownerIdx = team[(sprintNum - 1) % team.length]!;
          queueSprintCreation(program.id, project.id, sprintNum, ownerIdx);
          projectIdx++;
        }
      }
    }

    const sprintsToCreate = [...sprintsToCreateByKey.values()].sort((left, right) => {
      if (left.programId !== right.programId) {
        return left.programId.localeCompare(right.programId);
      }
      if (left.projectId !== right.projectId) {
        return left.projectId.localeCompare(right.projectId);
      }
      return left.number - right.number;
    });

    const sprints: Array<{ id: string; programId: string; projectId: string; number: number }> = [];
    let sprintsCreated = 0;

    for (const sprint of sprintsToCreate) {
      const owner = allUsers[sprint.ownerIdx]!;

      // Check for existing sprint by sprint_number and project (via junction table)
      const existingSprint = await pool.query(
        `SELECT d.id, d.properties FROM documents d
         JOIN document_associations da ON da.document_id = d.id
           AND da.related_id = $2 AND da.relationship_type = 'project'
         WHERE d.workspace_id = $1 AND d.document_type = 'sprint'
           AND (d.properties->>'sprint_number')::int = $3`,
        [workspaceId, sprint.projectId, sprint.number]
      );

      const sprintOffset = sprint.number - currentSprintNumber;
      let baseConfidence = 80;
      if (sprintOffset < 0) baseConfidence = 95;
      else if (sprintOffset === 0) baseConfidence = 75;
      else if (sprintOffset === 1) baseConfidence = 60;
      else baseConfidence = 40;

      const team = programTeams[sprint.programId]!;
      const otherIdx = team.find(idx => idx !== sprint.ownerIdx) ?? team[0]!;
      const otherUser = allUsers[otherIdx]!;
      let sprintStatus: string | undefined;
      if (sprintOffset < 0) sprintStatus = 'completed';
      else if (sprintOffset === 0) sprintStatus = 'active';

      const sprintPlans = [
        'If we complete these features, we will unblock the next milestone.',
        'Fixing these issues will reduce user-reported problems by 50%.',
        'Performance gains will improve user engagement metrics.',
        'New features will increase user activation rate.',
        'These changes will enable the team to move faster.',
        'Better docs will reduce onboarding time for new developers.',
        'Incremental shipping will maintain momentum and user trust.',
      ];
      const sprintSuccessCriteria = [
        ['All planned stories marked done', 'All new tests passing without critical regressions'],
        ['Bug count reduced by at least 10', 'No P0 issues remaining by sprint close'],
        ['Load time under 2 seconds', 'Memory usage remains stable under expected load'],
        ['Feature flags enabled for 100% of users', 'Rollout path is ready for follow-up feedback'],
        ['All integrations passing health checks', 'No unresolved handoff blockers remain'],
        ['README and API docs are up to date', 'The next team can continue without clarification debt'],
        ['User feedback is incorporated into next sprint planning', 'The follow-up scope is explicit and reviewable'],
      ];

      const desiredSprintProperties: Record<string, unknown> = {
        sprint_number: sprint.number,
        owner_id: owner.id,
        project_id: sprint.projectId,
        assignee_ids: [owner.person_doc_id, otherUser.person_doc_id].filter(Boolean),
        plan: sprintPlans[sprint.number % sprintPlans.length],
        success_criteria: sprintSuccessCriteria[sprint.number % sprintSuccessCriteria.length],
        confidence: baseConfidence + (Math.random() * 10 - 5),
        ...(sprintStatus && { status: sprintStatus }),
      };

      if (existingSprint.rows[0]) {
        await ensureDocumentProperties(
          pool,
          existingSprint.rows[0].id as string,
          existingSprint.rows[0].properties as Record<string, unknown> | undefined,
          desiredSprintProperties
        );
        sprints.push({
          id: existingSprint.rows[0].id,
          programId: sprint.programId,
          projectId: sprint.projectId,
          number: sprint.number,
        });
      } else {
        // Create sprint document without legacy project_id and program_id columns
        const sprintResult = await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, properties)
           VALUES ($1, 'sprint', $2, $3)
           RETURNING id`,
          [workspaceId, `Week ${sprint.number}`, JSON.stringify(desiredSprintProperties)]
        );
        const sprintId = sprintResult.rows[0].id;

        // Create associations via junction table (sprint belongs to project AND program)
        await createAssociation(pool, sprintId, sprint.projectId, 'project');
        await createAssociation(pool, sprintId, sprint.programId, 'program');

        sprints.push({
          id: sprintId,
          programId: sprint.programId,
          projectId: sprint.projectId,
          number: sprint.number,
        });
        sprintsCreated++;
      }
    }

    if (sprintsCreated > 0) {
      console.log(`✅ Created ${sprintsCreated} weeks`);
    } else {
      console.log('ℹ️  All weeks already exist');
    }

    // Get Ship Core program for comprehensive sprint testing
    const shipCoreProgram = programs.find(p => p.prefix === 'SHIP')!;

    // Comprehensive issue templates for Ship Core covering at least six past weeks plus current/future planning.
    const shipCoreIssues: SeedIssueTemplate[] = [
      { title: 'Establish product vision baseline', state: 'done', sprintOffset: -6, priority: 'high', estimate: 5 },
      { title: 'Define initial domain boundaries', state: 'done', sprintOffset: -6, priority: 'high', estimate: 8 },
      { title: 'Map delivery milestones', state: 'done', sprintOffset: -6, priority: 'medium', estimate: 4 },
      { title: 'Capture onboarding gaps', state: 'done', sprintOffset: -6, priority: 'medium', estimate: 3 },

      { title: 'Stand up workspace permissions', state: 'done', sprintOffset: -5, priority: 'high', estimate: 6 },
      { title: 'Create document hierarchy rules', state: 'done', sprintOffset: -5, priority: 'high', estimate: 5 },
      { title: 'Define review workflow states', state: 'done', sprintOffset: -5, priority: 'medium', estimate: 4 },
      { title: 'Draft internal usage guide', state: 'done', sprintOffset: -5, priority: 'low', estimate: 3 },

      { title: 'Prototype program overview layout', state: 'done', sprintOffset: -4, priority: 'high', estimate: 8 },
      { title: 'Add project ownership fields', state: 'done', sprintOffset: -4, priority: 'high', estimate: 5 },
      { title: 'Capture roadmap milestone notes', state: 'done', sprintOffset: -4, priority: 'medium', estimate: 4 },
      { title: 'Review dependency tracking gaps', state: 'todo', sprintOffset: -4, priority: 'medium', estimate: 3 },

      { title: 'Initial project setup', state: 'done', sprintOffset: -3, priority: 'high', estimate: 8 },
      { title: 'Database schema design', state: 'done', sprintOffset: -3, priority: 'high', estimate: 6 },
      { title: 'Set up development environment', state: 'done', sprintOffset: -3, priority: 'medium', estimate: 4 },
      { title: 'Create basic API structure', state: 'done', sprintOffset: -3, priority: 'medium', estimate: 4 },

      { title: 'Implement user authentication', state: 'done', sprintOffset: -2, priority: 'high', estimate: 8 },
      { title: 'Add password hashing', state: 'done', sprintOffset: -2, priority: 'high', estimate: 4 },
      { title: 'Create session management', state: 'todo', sprintOffset: -2, priority: 'medium', estimate: 6 },
      { title: 'Build login/logout endpoints', state: 'done', sprintOffset: -2, priority: 'medium', estimate: 4 },
      { title: 'Add CSRF protection', state: 'todo', sprintOffset: -2, priority: 'medium', estimate: 4 },
      { title: 'Write auth unit tests', state: 'todo', sprintOffset: -2, priority: 'low', estimate: 3 },

      { title: 'Create document model', state: 'done', sprintOffset: -1, priority: 'high', estimate: 8 },
      { title: 'Implement CRUD operations', state: 'todo', sprintOffset: -1, priority: 'high', estimate: 6 },
      { title: 'Add real-time collaboration', state: 'todo', sprintOffset: -1, priority: 'high', estimate: 8 },
      { title: 'Build WebSocket server', state: 'done', sprintOffset: -1, priority: 'medium', estimate: 6 },
      { title: 'Integrate Yjs for CRDT', state: 'todo', sprintOffset: -1, priority: 'medium', estimate: 6 },
      { title: 'Add offline support', state: 'cancelled', sprintOffset: -1, priority: 'low', estimate: 4 },

      { title: 'Implement sprint management', state: 'done', sprintOffset: 0, priority: 'high', estimate: 8 },
      { title: 'Create sprint timeline UI', state: 'done', sprintOffset: 0, priority: 'high', estimate: 6 },
      { title: 'Add sprint progress chart', state: 'done', sprintOffset: 0, priority: 'medium', estimate: 4 },
      { title: 'Build issue assignment flow', state: 'in_progress', sprintOffset: 0, priority: 'high', estimate: 6 },
      { title: 'Add bulk issue operations', state: 'in_progress', sprintOffset: 0, priority: 'medium', estimate: 4 },
      { title: 'Create sprint retrospective view', state: 'in_progress', sprintOffset: 0, priority: 'medium', estimate: 4 },
      { title: 'Add sprint velocity metrics', state: 'todo', sprintOffset: 0, priority: 'medium', estimate: 4 },
      { title: 'Implement burndown chart', state: 'todo', sprintOffset: 0, priority: 'medium', estimate: 6 },
      { title: 'Add sprint completion notifications', state: 'todo', sprintOffset: 0, priority: 'low', estimate: 2 },

      { title: 'Add team workload view', state: 'todo', sprintOffset: 1, priority: 'high', estimate: 8 },
      { title: 'Create capacity planning', state: 'todo', sprintOffset: 1, priority: 'high', estimate: 6 },
      { title: 'Build resource allocation UI', state: 'todo', sprintOffset: 1, priority: 'medium', estimate: 4 },
      { title: 'Add team availability calendar', state: 'backlog', sprintOffset: 1, priority: 'low', estimate: 3 },

      { title: 'Implement reporting dashboard', state: 'todo', sprintOffset: 2, priority: 'medium', estimate: 6 },
      { title: 'Add export to PDF', state: 'backlog', sprintOffset: 2, priority: 'low', estimate: 4 },

      { title: 'Add dark mode support', state: 'backlog', sprintOffset: null, priority: 'low', estimate: 4 },
      { title: 'Implement keyboard shortcuts', state: 'backlog', sprintOffset: null, priority: 'low', estimate: 3 },
      { title: 'Create mobile app', state: 'backlog', sprintOffset: null, priority: 'low', estimate: 40 },
      { title: 'Add AI-powered suggestions', state: 'backlog', sprintOffset: null, priority: 'low', estimate: 16 },
      { title: 'Build integration with Slack', state: 'backlog', sprintOffset: null, priority: 'medium', estimate: 8 },
    ];

    // Generic issues for other programs - expanded to six completed weeks of history.
    const genericIssueTemplates: SeedIssueTemplate[] = [
      { title: 'Define initial scope boundary', state: 'done', estimate: 3, sprintOffset: -6, priority: 'high' },
      { title: 'Document success measures', state: 'done', estimate: 2, sprintOffset: -6, priority: 'medium' },
      { title: 'Review current tooling gaps', state: 'done', estimate: 4, sprintOffset: -6, priority: 'medium' },

      { title: 'Create implementation outline', state: 'done', estimate: 5, sprintOffset: -5, priority: 'high' },
      { title: 'Map handoff checkpoints', state: 'done', estimate: 3, sprintOffset: -5, priority: 'medium' },
      { title: 'Set baseline quality checks', state: 'done', estimate: 2, sprintOffset: -5, priority: 'low' },

      { title: 'Prototype user journey', state: 'done', estimate: 5, sprintOffset: -4, priority: 'high' },
      { title: 'Capture integration assumptions', state: 'todo', estimate: 3, sprintOffset: -4, priority: 'medium' },
      { title: 'Add smoke-test checklist', state: 'done', estimate: 2, sprintOffset: -4, priority: 'low' },

      { title: 'Set up project structure', state: 'done', estimate: 4, sprintOffset: -3, priority: 'high' },
      { title: 'Create initial documentation', state: 'done', estimate: 3, sprintOffset: -3, priority: 'medium' },
      { title: 'Define coding standards', state: 'done', estimate: 2, sprintOffset: -3, priority: 'low' },

      { title: 'Configure CI/CD pipeline', state: 'done', estimate: 6, sprintOffset: -2, priority: 'high' },
      { title: 'Set up staging environment', state: 'done', estimate: 4, sprintOffset: -2, priority: 'medium' },
      { title: 'Harden release checklist', state: 'todo', estimate: 3, sprintOffset: -2, priority: 'low' },

      { title: 'Implement auth hardening', state: 'done', estimate: 5, sprintOffset: -1, priority: 'high' },
      { title: 'Tighten telemetry coverage', state: 'todo', estimate: 4, sprintOffset: -1, priority: 'medium' },
      { title: 'Document deployment rollback', state: 'cancelled', estimate: 2, sprintOffset: -1, priority: 'low' },

      { title: 'Implement core features', state: 'done', estimate: 8, sprintOffset: 0, priority: 'high' },
      { title: 'Add input validation', state: 'done', estimate: 4, sprintOffset: 0, priority: 'high' },
      { title: 'Create error handling', state: 'in_progress', estimate: 5, sprintOffset: 0, priority: 'high' },
      { title: 'Build user interface', state: 'in_progress', estimate: 6, sprintOffset: 0, priority: 'medium' },
      { title: 'Add unit tests', state: 'todo', estimate: 4, sprintOffset: 0, priority: 'medium' },
      { title: 'Write integration tests', state: 'todo', estimate: 5, sprintOffset: 0, priority: 'low' },

      { title: 'Performance optimization', state: 'todo', estimate: 6, sprintOffset: 1, priority: 'medium' },
      { title: 'Add caching layer', state: 'todo', estimate: 4, sprintOffset: 1, priority: 'medium' },
      { title: 'Security audit fixes', state: 'todo', estimate: 8, sprintOffset: 1, priority: 'high' },

      { title: 'Implement analytics', state: 'backlog', estimate: 6, sprintOffset: null, priority: 'low' },
      { title: 'Add export functionality', state: 'backlog', estimate: 4, sprintOffset: null, priority: 'low' },
      { title: 'Create admin dashboard', state: 'backlog', estimate: 10, sprintOffset: null, priority: 'medium' },
    ];

    let issuesCreated = 0;

    // Get existing max ticket numbers per program (via junction table)
    const maxTickets: Record<string, number> = {};
    for (const program of programs) {
      const maxResult = await pool.query(
        `SELECT COALESCE(MAX(d.ticket_number), 0) as max_ticket
         FROM documents d
         JOIN document_associations da ON da.document_id = d.id
           AND da.related_id = $2 AND da.relationship_type = 'program'
         WHERE d.workspace_id = $1 AND d.document_type = 'issue'`,
        [workspaceId, program.id]
      );
      maxTickets[program.id] = maxResult.rows[0].max_ticket;
    }

    // Seed Ship Core issues with comprehensive sprint coverage
    const shipCoreTeam = programTeams[shipCoreProgram.id]!;
    for (let i = 0; i < shipCoreIssues.length; i++) {
      const issue = shipCoreIssues[i]!;
      const assignee = allUsers[shipCoreTeam[i % shipCoreTeam.length]!]!;

      // Find the sprint based on offset
      let sprintId: string | null = null;
      if (issue.sprintOffset !== null) {
        const targetSprintNumber = currentSprintNumber + issue.sprintOffset;
        const sprint = sprints.find(
          s => s.programId === shipCoreProgram.id && s.number === targetSprintNumber
        );
        sprintId = sprint?.id || null;
      }

      // Check if issue already exists (via junction table association to program)
      const existingIssue = await pool.query(
        `SELECT d.id, d.properties, d.content FROM documents d
         JOIN document_associations da ON da.document_id = d.id
           AND da.related_id = $2 AND da.relationship_type = 'program'
         WHERE d.workspace_id = $1 AND d.title = $3 AND d.document_type = 'issue'`,
        [workspaceId, shipCoreProgram.id, issue.title]
      );

      const issueType = inferSeedIssueType({
        title: issue.title,
      });
      const issueContent = createIssueTemplateContent({
        title: issue.title,
        issueType,
        mode: 'filled',
      });

      if (!existingIssue.rows[0]) {
        maxTickets[shipCoreProgram.id]!++;
        const planningProperties = buildIssuePlanningProperties(issue.estimate);
        const issueProperties: Record<string, unknown> = {
          state: issue.state,
          priority: issue.priority,
          issue_type: issueType,
          source: 'internal',
          assignee_id: assignee.id,
          feedback_status: null,
          rejection_reason: null,
          ...planningProperties,
        };
        // Create issue document without legacy program_id and sprint_id columns
        const issueResult = await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, content, properties, ticket_number)
           VALUES ($1, 'issue', $2, $3, $4, $5)
           RETURNING id`,
          [
            workspaceId,
            issue.title,
            JSON.stringify(issueContent),
            JSON.stringify(issueProperties),
            maxTickets[shipCoreProgram.id],
          ]
        );
        const issueId = issueResult.rows[0].id;

        // Create associations via junction table
        await createAssociation(pool, issueId, shipCoreProgram.id, 'program');
        if (sprintId) {
          await createAssociation(pool, issueId, sprintId, 'sprint');
          // Also associate with the project that the sprint belongs to
          const sprintData = sprints.find(s => s.id === sprintId);
          if (sprintData?.projectId) {
            await createAssociation(pool, issueId, sprintData.projectId, 'project');
          }
        } else {
          // For backlog issues without sprints, assign to a random project in the program
          const programProjects = projects.filter(p => p.programId === shipCoreProgram.id);
          if (programProjects.length > 0) {
            const randomProject = programProjects[issuesCreated % programProjects.length]!;
            await createAssociation(pool, issueId, randomProject.id, 'project');
          }
        }

        issuesCreated++;
      } else {
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
          issue.estimate
        );
      }
    }

    // Seed generic issues for other programs
    const otherPrograms = programs.filter(p => p.prefix !== 'SHIP');
    for (const program of otherPrograms) {
      const team = programTeams[program.id]!;
      for (let i = 0; i < genericIssueTemplates.length; i++) {
        const template = genericIssueTemplates[i]!;
        const assignee = allUsers[team[i % team.length]!]!;

        // Find the sprint based on offset (same pattern as Ship Core issues)
        let sprintId: string | null = null;
        if (template.sprintOffset !== null) {
          const targetSprintNumber = currentSprintNumber + template.sprintOffset;
          const sprint = sprints.find(
            s => s.programId === program.id && s.number === targetSprintNumber
          );
          sprintId = sprint?.id || null;
        }

        // Check if issue already exists (via junction table association to program)
        const existingIssue = await pool.query(
          `SELECT d.id, d.properties, d.content FROM documents d
           JOIN document_associations da ON da.document_id = d.id
             AND da.related_id = $2 AND da.relationship_type = 'program'
           WHERE d.workspace_id = $1 AND d.title = $3 AND d.document_type = 'issue'`,
          [workspaceId, program.id, template.title]
        );

        const issueType = inferSeedIssueType({
          title: template.title,
        });
        const issueContent = createIssueTemplateContent({
          title: template.title,
          issueType,
          mode: 'filled',
        });

        if (!existingIssue.rows[0]) {
          maxTickets[program.id]!++;
          const planningProperties = buildIssuePlanningProperties(template.estimate);
          const issueProperties = {
            state: template.state,
            priority: template.priority,
            issue_type: issueType,
            source: 'internal',
            assignee_id: assignee.id,
            feedback_status: null,
            rejection_reason: null,
            ...planningProperties,
          };
          // Create issue document without legacy program_id and sprint_id columns
          const issueResult = await pool.query(
            `INSERT INTO documents (workspace_id, document_type, title, content, properties, ticket_number)
             VALUES ($1, 'issue', $2, $3, $4, $5)
             RETURNING id`,
            [
              workspaceId,
              template.title,
              JSON.stringify(issueContent),
              JSON.stringify(issueProperties),
              maxTickets[program.id],
            ]
          );
          const issueId = issueResult.rows[0].id;

          // Create associations via junction table
          await createAssociation(pool, issueId, program.id, 'program');
          if (sprintId) {
            await createAssociation(pool, issueId, sprintId, 'sprint');
            // Also associate with the project that the sprint belongs to
            const sprintData = sprints.find(s => s.id === sprintId);
            if (sprintData?.projectId) {
              await createAssociation(pool, issueId, sprintData.projectId, 'project');
            }
          } else {
            // For backlog issues without sprints, assign to a random project in the program
            const programProjects = projects.filter(p => p.programId === program.id);
            if (programProjects.length > 0) {
              const randomProject = programProjects[issuesCreated % programProjects.length]!;
              await createAssociation(pool, issueId, randomProject.id, 'project');
            }
          }

          issuesCreated++;
        } else {
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
            template.estimate
          );
        }
      }
    }

    for (const project of projects) {
      const foundationSprint = sprints.find(
        (sprint) => sprint.projectId === project.id && sprint.number === 2
      );

      if (!foundationSprint) {
        continue;
      }

      const programTeam = programTeams[project.programId]!;
      const assignee = allUsers[programTeam[0]!]!;

      for (const [issueIndex, issueTemplate] of DEMO_FOUNDATION_WEEK_2_ISSUES.entries()) {
        const issueTitle = `${project.title}: ${issueTemplate.titleSuffix}`;
        const issueType = inferSeedIssueType({
          title: issueTitle,
        });
        const issueContent = createIssueTemplateContent({
          title: issueTitle,
          issueType,
          mode: 'filled',
        });
        const existingIssue = await pool.query(
          `SELECT d.id, d.properties, d.content FROM documents d
           JOIN document_associations da ON da.document_id = d.id
             AND da.related_id = $2 AND da.relationship_type = 'project'
           WHERE d.workspace_id = $1 AND d.title = $3 AND d.document_type = 'issue'`,
          [workspaceId, project.id, issueTitle]
        );

        const issueState = resolveDemoWeekIssueState(currentSprintNumber, 2, issueIndex);

        if (!existingIssue.rows[0]) {
          maxTickets[project.programId]!++;
          const planningProperties = buildIssuePlanningProperties(issueTemplate.estimate);
          const issueProperties = {
            state: issueState,
            priority: issueTemplate.priority,
            issue_type: issueType,
            source: 'internal',
            assignee_id: assignee.id,
            ...planningProperties,
          };
          const issueResult = await pool.query(
            `INSERT INTO documents (workspace_id, document_type, title, content, properties, ticket_number)
             VALUES ($1, 'issue', $2, $3, $4, $5)
             RETURNING id`,
            [
              workspaceId,
              issueTitle,
              JSON.stringify(issueContent),
              JSON.stringify(issueProperties),
              maxTickets[project.programId],
            ]
          );
          const issueId = issueResult.rows[0].id;

          await createAssociation(pool, issueId, project.programId, 'program');
          await createAssociation(pool, issueId, project.id, 'project');
          await createAssociation(pool, issueId, foundationSprint.id, 'sprint');
          issuesCreated++;
        } else {
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
          await createAssociation(pool, issueId, project.programId, 'program');
          await createAssociation(pool, issueId, project.id, 'project');
          await createAssociation(pool, issueId, foundationSprint.id, 'sprint');
        }
      }
    }

    if (issuesCreated > 0) {
      console.log(`✅ Created ${issuesCreated} issues`);
    } else {
      console.log('ℹ️  All issues already exist');
    }

    let sprintBaselinesCreated = 0;
    for (const sprint of sprints) {
      if (sprint.number > currentSprintNumber) {
        continue;
      }

      const sprintPropertiesResult = await pool.query(
        `SELECT properties
         FROM documents
         WHERE id = $1`,
        [sprint.id]
      );
      const sprintProperties = sprintPropertiesResult.rows[0]?.properties as Record<string, unknown> | undefined;
      if (hasSprintPlanningSnapshot(sprintProperties)) {
        continue;
      }

      await persistSprintPlanningSnapshot(pool, sprint.id, sprintProperties, {
        source: sprint.number < currentSprintNumber ? 'seeded_history' : 'captured_at_start',
        snapshotTakenAt: buildSprintSnapshotDate(sprintStartDate, sprint.number),
      });
      sprintBaselinesCreated++;
    }

    if (sprintBaselinesCreated > 0) {
      console.log(`✅ Created ${sprintBaselinesCreated} sprint planning baselines`);
    }

    // Create welcome/tutorial wiki document
    const existingTutorial = await pool.query(
      'SELECT id FROM documents WHERE workspace_id = $1 AND document_type = $2 AND title = $3',
      [workspaceId, 'wiki', WELCOME_DOCUMENT_TITLE]
    );

    let tutorialDocId: string;
    if (!existingTutorial.rows[0]) {
      // Insert the tutorial document with position=0 to ensure it appears first
      const tutorialResult = await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, content, position)
         VALUES ($1, 'wiki', $2, $3, 0)
         RETURNING id`,
        [workspaceId, WELCOME_DOCUMENT_TITLE, JSON.stringify(WELCOME_DOCUMENT_CONTENT)]
      );
      tutorialDocId = tutorialResult.rows[0].id;
      console.log('✅ Created welcome tutorial document');
    } else {
      tutorialDocId = existingTutorial.rows[0].id;
      console.log('ℹ️  Welcome tutorial already exists');
    }

    // Create nested wiki documents for tree navigation testing (Section 508 accessibility)
    const nestedDocs = [
      { title: 'Getting Started', parentId: tutorialDocId },
      { title: 'Advanced Topics', parentId: tutorialDocId },
    ];

    let nestedDocsCreated = 0;
    for (const doc of nestedDocs) {
      const existingDoc = await pool.query(
        'SELECT id FROM documents WHERE workspace_id = $1 AND document_type = $2 AND title = $3 AND parent_id = $4',
        [workspaceId, 'wiki', doc.title, doc.parentId]
      );

      if (!existingDoc.rows[0]) {
        await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, parent_id)
           VALUES ($1, 'wiki', $2, $3)`,
          [workspaceId, doc.title, doc.parentId]
        );
        nestedDocsCreated++;
      }
    }

    if (nestedDocsCreated > 0) {
      console.log(`✅ Created ${nestedDocsCreated} nested wiki documents`);
    }

    // Create additional standalone wiki documents for e2e testing
    // These ensure tests that require multiple documents don't skip
    const standaloneWikiDocs = [
      { title: 'Project Overview', content: 'Overview of the Ship project and its goals.' },
      { title: 'Architecture Guide', content: 'Technical architecture and design decisions.' },
      { title: 'API Reference', content: 'API endpoints and usage documentation.' },
      { title: 'Development Setup', content: 'How to set up your local development environment.' },
    ];

    let standaloneDocsCreated = 0;
    for (let i = 0; i < standaloneWikiDocs.length; i++) {
      const doc = standaloneWikiDocs[i]!;
      const existingDoc = await pool.query(
        'SELECT id FROM documents WHERE workspace_id = $1 AND document_type = $2 AND title = $3 AND parent_id IS NULL',
        [workspaceId, 'wiki', doc.title]
      );

      if (!existingDoc.rows[0]) {
        const contentJson = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: doc.content }] }]
        };
        await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, content, position)
           VALUES ($1, 'wiki', $2, $3, $4)`,
          [workspaceId, doc.title, JSON.stringify(contentJson), i + 1]
        );
        standaloneDocsCreated++;
      }
    }

    if (standaloneDocsCreated > 0) {
      console.log(`✅ Created ${standaloneDocsCreated} standalone wiki documents`);
    }

    // Create sample standups for Ship Core sprints (tests the standup feed feature)
    const shipCoreSprints = sprints.filter(s => s.programId === shipCoreProgram.id);
    let standupsCreated = 0;

    // Add standups to current and recent sprints
    for (const sprint of shipCoreSprints) {
      if (sprint.number >= currentSprintNumber - 1 && sprint.number <= currentSprintNumber) {
        // Check if standups already exist for this sprint (via junction table)
        const existingStandups = await pool.query(
          `SELECT d.id FROM documents d
           JOIN document_associations da ON da.document_id = d.id
             AND da.related_id = $2 AND da.relationship_type = 'sprint'
           WHERE d.workspace_id = $1 AND d.document_type = 'standup'`,
          [workspaceId, sprint.id]
        );

        if (existingStandups.rows.length === 0) {
          // Create 2-3 standups per sprint from different team members
          const standupAuthors = allUsers.slice(0, 3);
          const standupMessages = [
            {
              content: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Yesterday: Finished implementing the sprint timeline UI component.' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Today: Working on the progress chart integration.' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Blockers: None' }] },
                ],
              },
            },
            {
              content: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Yesterday: Code review and bug fixes.' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Today: Starting on issue assignment flow.' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Blockers: Waiting on API spec clarification.' }] },
                ],
              },
            },
            {
              content: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Yesterday: Team sync and planning session.' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Today: Documentation and testing.' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Blockers: None' }] },
                ],
              },
            },
          ];

          for (let i = 0; i < standupAuthors.length; i++) {
            const author = standupAuthors[i]!;
            const message = standupMessages[i]!;
            const daysAgo = i; // Stagger the standups over recent days
            const properties = { author_id: author.id };

            // Create standup document without legacy sprint_id column
            const standupResult = await pool.query(
              `INSERT INTO documents (workspace_id, document_type, title, content, created_by, properties, created_at)
               VALUES ($1, 'standup', $2, $3, $4, $5, NOW() - INTERVAL '${daysAgo} days')
               RETURNING id`,
              [workspaceId, `Standup - ${author.name}`, JSON.stringify(message.content), author.id, JSON.stringify(properties)]
            );
            const standupId = standupResult.rows[0].id;

            // Create association to sprint via junction table
            await createAssociation(pool, standupId, sprint.id, 'sprint');

            standupsCreated++;
          }
        }
      }
    }

    if (standupsCreated > 0) {
      console.log(`✅ Created ${standupsCreated} standups`);
    } else {
      console.log('ℹ️  All standups already exist');
    }

    // Create sprint reviews for ALL completed sprints (not just recent ones)
    // This prevents "Complete review" action items for past sprints
    let sprintReviewsCreated = 0;

    const allPastSprints = sprints.filter(s => s.number < currentSprintNumber);
    for (const sprint of allPastSprints) {
      // Check if review exists (via junction table)
      const existingReview = await pool.query(
        `SELECT d.id, d.properties
         FROM documents d
         JOIN document_associations da ON da.document_id = d.id
           AND da.related_id = $2 AND da.relationship_type = 'sprint'
         WHERE d.workspace_id = $1 AND d.document_type = 'weekly_review'`,
        [workspaceId, sprint.id]
      );

      const reviewContent = {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What went well' }] },
          { type: 'bulletList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Team collaboration was excellent' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Met most of our sprint goals' }] }] },
          ]},
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What could be improved' }] },
          { type: 'bulletList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Better estimation on complex tasks' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'More frequent check-ins' }] }] },
          ]},
        ],
      };

      const owner = allUsers[sprint.number % allUsers.length]!;
      const reviewProperties = {
        sprint_id: sprint.id,
        owner_id: owner.id,
        plan_validated: true,
      };

      if (!existingReview.rows[0]) {
        // Create sprint review document without legacy sprint_id column
        const reviewResult = await pool.query(
          `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by)
           VALUES ($1, 'weekly_review', $2, $3, $4, $5)
           RETURNING id`,
          [
            workspaceId,
            `Week ${sprint.number} Review`,
            JSON.stringify(reviewContent),
            JSON.stringify(reviewProperties),
            owner.id,
          ]
        );
        const reviewId = reviewResult.rows[0].id;

        // Create association to sprint via junction table
        await createAssociation(pool, reviewId, sprint.id, 'sprint');

        sprintReviewsCreated++;
      } else {
        await ensureDocumentProperties(
          pool,
          existingReview.rows[0].id as string,
          existingReview.rows[0].properties as Record<string, unknown> | undefined,
          reviewProperties
        );
      }
    }

    if (sprintReviewsCreated > 0) {
      console.log(`✅ Created ${sprintReviewsCreated} week reviews`);
    } else {
      console.log('ℹ️  All week reviews already exist');
    }

    // Create weekly plans and retros for allocated people
    // This populates the Status Overview heatmap with realistic data
    let weeklyPlansCreated = 0;
    let weeklyRetrosCreated = 0;

    // Content pools for plans (varied, realistic per-person entries)
    const planContentPools = [
      ['Complete API endpoint implementation', 'Write unit tests for new features', 'Review and merge open PRs', 'Update project documentation'],
      ['Implement search functionality', 'Fix pagination across list views', 'Add error handling for edge cases', 'Pair programming session on schema design'],
      ['Set up monitoring and alerting', 'Migrate legacy endpoints to v2', 'Conduct code reviews for the team', 'Document deployment procedures'],
      ['Build notification system', 'Integrate with external APIs', 'Performance testing and optimization', 'Expand integration test coverage'],
      ['Refactor data access layer', 'Implement caching strategy', 'Fix accessibility audit findings', 'Update CI/CD pipeline configuration'],
      ['Design and build UI components', 'Implement responsive layouts', 'Cross-browser compatibility testing', 'Update design system tokens'],
      ['Deploy infrastructure updates', 'Configure staging environment', 'Set up auto-scaling policies', 'Review and update security configs'],
      ['Implement user settings page', 'Add form validation logic', 'Write E2E tests for critical flows', 'Optimize database queries'],
      ['Build data export feature', 'Implement audit logging', 'Fix memory leak in worker process', 'Update dependency versions'],
      ['Create admin dashboard widgets', 'Implement role-based access controls', 'Add rate limiting to API endpoints', 'Write technical design document'],
      ['Implement file upload handling', 'Build progress indicator components', 'Add WebSocket reconnection logic', 'Optimize image loading performance'],
    ];

    // Content pools for retros (corresponding accomplishments)
    const retroContentPools = [
      ['Completed API endpoints with full CRUD operations', 'Unit tests achieving 91% coverage on new code', 'Merged 4 PRs including critical bugfix', 'API docs updated with all new endpoints'],
      ['Search feature live with fuzzy matching support', 'Pagination fixed across all list views', 'Error handling covers 12 new edge cases', 'Database schema review completed with team'],
      ['Grafana dashboards configured for all services', 'Migrated 3 legacy endpoints successfully', 'Reviewed 8 PRs from team members', 'Deployment runbook finalized and shared'],
      ['Notification system handling email and in-app alerts', 'External API integration passing all tests', 'Fixed 2 critical performance bottlenecks', 'Integration test suite grew by 15 tests'],
      ['Data layer refactored to repository pattern', 'Redis caching reducing database load by 35%', 'Fixed 6 accessibility violations (WCAG AA)', 'CI pipeline execution time reduced by 25%'],
      ['Built 10 reusable UI components for design system', 'Responsive layouts working on all breakpoints', 'Tested on Chrome, Firefox, Safari, and Edge', 'Design tokens migrated to CSS custom properties'],
      ['Infrastructure upgraded to latest AMI versions', 'Staging environment fully mirrors production', 'Auto-scaling tested successfully under load', 'Security configs reviewed and hardened'],
      ['Settings page implemented with real-time preview', 'Form validation catching all invalid inputs', 'E2E test suite covers 5 critical user flows', 'Query optimization reduced avg response time 40%'],
      ['Data export supporting CSV and JSON formats', 'Audit logging capturing all write operations', 'Memory leak identified and patched in worker', 'Dependencies updated with zero breaking changes'],
      ['Dashboard widgets showing real-time metrics', 'RBAC implemented for admin and member roles', 'Rate limiting active on all public endpoints', 'Technical design document reviewed and approved'],
      ['File upload working with drag-and-drop support', 'Progress indicators showing accurate ETAs', 'WebSocket auto-reconnect with exponential backoff', 'Image lazy-loading reducing initial bundle by 30%'],
    ];

    function makePlanContent(items: string[]) {
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'What I plan to accomplish this week' }],
          },
          {
            type: 'bulletList',
            content: items.map(item => ({
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
            })),
          },
        ],
      };
    }

    function makeRetroContent(items: string[]) {
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'What I delivered this week' }],
          },
          {
            type: 'bulletList',
            content: items.map(item => ({
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
            })),
          },
        ],
      };
    }

    // Iterate through sprint assignments and create plans/retros
    for (let i = 0; i < sprintsToCreate.length; i++) {
      const sprintDef = sprintsToCreate[i]!;
      const matchingSprint = sprints.find(
        s => s.programId === sprintDef.programId && s.number === sprintDef.number
      );
      if (!matchingSprint) continue;

      const owner = allUsers[sprintDef.ownerIdx]!;
      const team = programTeams[sprintDef.programId]!;
      const otherIdx = team.find(idx => idx !== sprintDef.ownerIdx) ?? team[0]!;
      const otherUser = allUsers[otherIdx]!;
      const assignees = [
        { personDocId: owner.person_doc_id, userId: owner.id },
        { personDocId: otherUser.person_doc_id, userId: otherUser.id },
      ].filter(a => a.personDocId);

      const sprintOffset = sprintDef.number - currentSprintNumber;

      for (let p = 0; p < assignees.length; p++) {
        const assignee = assignees[p]!;
        const contentIdx = (i + p) % planContentPools.length;

        // Deterministic skip patterns for realistic gaps in past data
        // Dev User (the login user) always gets complete data so action items
        // don't conflict with the heatmap. Other users get realistic gaps.
        const isDevUser = assignee.userId === allUsers.find((u: { name: string }) => u.name === 'Dev User')?.id;
        const skipPlanForPast = !isDevUser && (i + p) % 7 === 3;     // ~14% of past plans missing
        const skipRetroForPast = !isDevUser && (i + p) % 6 === 2;    // ~17% of past retros missing
        const skipPlanForCurrent = !isDevUser && (i + p) % 3 === 0;  // ~33% of current plans not yet done

        // Past sprints: create plan + retro with content (some deliberately skipped)
        if (sprintOffset < 0) {
          if (!skipPlanForPast) {
            const existing = await pool.query(
              `SELECT id FROM documents
               WHERE workspace_id = $1 AND document_type = 'weekly_plan'
                 AND (properties->>'person_id') = $2
                 AND (properties->>'project_id') = $3
                 AND (properties->>'week_number')::int = $4`,
              [workspaceId, assignee.personDocId, sprintDef.projectId, sprintDef.number]
            );
            if (!existing.rows[0]) {
              await pool.query(
                `INSERT INTO documents (workspace_id, document_type, title, content, properties, visibility, created_by)
                 VALUES ($1, 'weekly_plan', $2, $3, $4, 'workspace', $5)`,
                [
                  workspaceId,
                  `Week ${sprintDef.number} Plan`,
                  JSON.stringify(makePlanContent(planContentPools[contentIdx]!)),
                  JSON.stringify({
                    person_id: assignee.personDocId,
                    project_id: sprintDef.projectId,
                    week_number: sprintDef.number,
                    submitted_at: new Date().toISOString(),
                  }),
                  assignee.userId,
                ]
              );
              weeklyPlansCreated++;
            }
          }

          if (!skipRetroForPast) {
            const existing = await pool.query(
              `SELECT id FROM documents
               WHERE workspace_id = $1 AND document_type = 'weekly_retro'
                 AND (properties->>'person_id') = $2
                 AND (properties->>'project_id') = $3
                 AND (properties->>'week_number')::int = $4`,
              [workspaceId, assignee.personDocId, sprintDef.projectId, sprintDef.number]
            );
            if (!existing.rows[0]) {
              await pool.query(
                `INSERT INTO documents (workspace_id, document_type, title, content, properties, visibility, created_by)
                 VALUES ($1, 'weekly_retro', $2, $3, $4, 'workspace', $5)`,
                [
                  workspaceId,
                  `Week ${sprintDef.number} Retro`,
                  JSON.stringify(makeRetroContent(retroContentPools[contentIdx]!)),
                  JSON.stringify({
                    person_id: assignee.personDocId,
                    project_id: sprintDef.projectId,
                    week_number: sprintDef.number,
                    submitted_at: new Date().toISOString(),
                  }),
                  assignee.userId,
                ]
              );
              weeklyRetrosCreated++;
            }
          }
        }

        // Current sprint: create plan for most people (no retros yet)
        if (sprintOffset === 0 && !skipPlanForCurrent) {
          const existing = await pool.query(
            `SELECT id FROM documents
             WHERE workspace_id = $1 AND document_type = 'weekly_plan'
               AND (properties->>'person_id') = $2
               AND (properties->>'project_id') = $3
               AND (properties->>'week_number')::int = $4`,
            [workspaceId, assignee.personDocId, sprintDef.projectId, sprintDef.number]
          );
          if (!existing.rows[0]) {
            await pool.query(
              `INSERT INTO documents (workspace_id, document_type, title, content, properties, visibility, created_by)
               VALUES ($1, 'weekly_plan', $2, $3, $4, 'workspace', $5)`,
              [
                workspaceId,
                `Week ${sprintDef.number} Plan`,
                JSON.stringify(makePlanContent(planContentPools[contentIdx]!)),
                JSON.stringify({
                  person_id: assignee.personDocId,
                  project_id: sprintDef.projectId,
                  week_number: sprintDef.number,
                  submitted_at: new Date().toISOString(),
                }),
                assignee.userId,
              ]
            );
            weeklyPlansCreated++;
          }
        }
      }
    }

    for (const project of projects) {
      const foundationSprint = sprints.find(
        (sprint) => sprint.projectId === project.id && sprint.number === 2
      );
      if (!foundationSprint) {
        continue;
      }

      const programTeam = programTeams[project.programId]!;
      const owner = allUsers[programTeam[0]!]!;
      const contentIdx = Math.abs(project.title.length) % planContentPools.length;

      if (owner.person_doc_id) {
        const existingWeekTwoPlan = await pool.query(
          `SELECT id FROM documents
           WHERE workspace_id = $1
             AND document_type = 'weekly_plan'
             AND (properties->>'person_id') = $2
             AND (properties->>'project_id') = $3
             AND (properties->>'week_number')::int = 2`,
          [workspaceId, owner.person_doc_id, project.id]
        );

        if (!existingWeekTwoPlan.rows[0]) {
          const planResult = await pool.query(
            `INSERT INTO documents (workspace_id, document_type, title, content, properties, visibility, created_by)
             VALUES ($1, 'weekly_plan', $2, $3, $4, 'workspace', $5)
             RETURNING id`,
            [
              workspaceId,
              `Week 2 Plan - ${project.title}`,
              JSON.stringify(makePlanContent(planContentPools[contentIdx]!)),
              JSON.stringify({
                person_id: owner.person_doc_id,
                project_id: project.id,
                week_number: 2,
                submitted_at: buildSprintSnapshotDate(sprintStartDate, 2).toISOString(),
              }),
              owner.id,
            ]
          );
          await createAssociation(pool, planResult.rows[0].id, project.id, 'project');
          weeklyPlansCreated++;
        }

        if (currentSprintNumber > 2) {
          const existingWeekTwoRetro = await pool.query(
            `SELECT id FROM documents
             WHERE workspace_id = $1
               AND document_type = 'weekly_retro'
               AND (properties->>'person_id') = $2
               AND (properties->>'project_id') = $3
               AND (properties->>'week_number')::int = 2`,
            [workspaceId, owner.person_doc_id, project.id]
          );

          if (!existingWeekTwoRetro.rows[0]) {
            const retroResult = await pool.query(
              `INSERT INTO documents (workspace_id, document_type, title, content, properties, visibility, created_by)
               VALUES ($1, 'weekly_retro', $2, $3, $4, 'workspace', $5)
               RETURNING id`,
              [
                workspaceId,
                `Week 2 Retro - ${project.title}`,
                JSON.stringify(makeRetroContent(retroContentPools[contentIdx]!)),
                JSON.stringify({
                  person_id: owner.person_doc_id,
                  project_id: project.id,
                  week_number: 2,
                  submitted_at: buildSprintSnapshotDate(sprintStartDate, 2).toISOString(),
                }),
                owner.id,
              ]
            );
            await createAssociation(pool, retroResult.rows[0].id, project.id, 'project');
            weeklyRetrosCreated++;
          }
        }
      }

      if (currentSprintNumber > 2) {
        const standupDate = buildSprintSnapshotDate(sprintStartDate, 2);
        standupDate.setUTCDate(standupDate.getUTCDate() + 1);
        const isoDate = standupDate.toISOString().slice(0, 10);
        const existingWeekTwoStandup = await pool.query(
          `SELECT d.id
           FROM documents d
           JOIN document_associations da
             ON da.document_id = d.id
            AND da.related_id = $4
            AND da.relationship_type = 'sprint'
           WHERE d.workspace_id = $1
             AND d.document_type = 'standup'
             AND (d.properties->>'author_id') = $2
             AND (d.properties->>'date') = $3
           LIMIT 1`,
          [workspaceId, owner.id, isoDate, foundationSprint.id]
        );

        if (!existingWeekTwoStandup.rows[0]) {
          const standupResult = await pool.query(
            `INSERT INTO documents (workspace_id, document_type, title, content, created_by, properties, created_at)
             VALUES ($1, 'standup', $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              workspaceId,
              `Standup - ${project.title} Week 2`,
              JSON.stringify({
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: `Yesterday: moved ${project.title} baseline work forward.` }],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Today: finishing the next scoped issue in Week 2.' }],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Blockers: no blockers beyond normal review handoff.' }],
                  },
                ],
              }),
              owner.id,
              JSON.stringify({
                author_id: owner.id,
                date: isoDate,
              }),
              `${isoDate}T14:00:00.000Z`,
            ]
          );
          await createAssociation(pool, standupResult.rows[0].id, foundationSprint.id, 'sprint');
          standupsCreated++;
        }
      }
    }

    if (weeklyPlansCreated > 0) {
      console.log(`✅ Created ${weeklyPlansCreated} weekly plans`);
    }
    if (weeklyRetrosCreated > 0) {
      console.log(`✅ Created ${weeklyRetrosCreated} weekly retros`);
    }

    console.log('');
    console.log('🎉 Seed complete!');
    console.log('');
    console.log('Login credentials:');
    console.log('  Email: dev@ship.local');
    console.log('  Password: admin123');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
