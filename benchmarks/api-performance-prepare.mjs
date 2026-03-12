import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { config } = require('dotenv');
const pg = require('pg');

config({ path: join(__dirname, '../api/.env.local') });
config({ path: join(__dirname, '../api/.env') });

const { Pool } = pg;

const TARGET_USER_COUNT = 21;
const TARGET_DOCUMENT_COUNT = 550;
const BENCHMARK_PASSWORD = 'admin123';
const BENCHMARK_USER_PREFIX = 'benchmark-user-';
const BENCHMARK_DOC_PREFIX = '[Benchmark API]';

async function getCounts(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM documents) AS documents,
      (SELECT COUNT(*) FROM documents WHERE document_type = 'issue') AS issues,
      (SELECT COUNT(*) FROM documents WHERE document_type = 'sprint') AS sprints
  `);

  const row = result.rows[0];
  return {
    users: Number(row.users),
    documents: Number(row.documents),
    issues: Number(row.issues),
    sprints: Number(row.sprints),
  };
}

async function ensureWorkspace(pool) {
  const result = await pool.query(
    `SELECT id, name FROM workspaces
     WHERE archived_at IS NULL
     ORDER BY CASE WHEN name = 'Ship Workspace' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`
  );

  if (!result.rows[0]) {
    throw new Error('No workspace found. Run the normal seed first.');
  }

  return result.rows[0];
}

async function ensureDevUser(pool, workspaceId) {
  const result = await pool.query(
    `SELECT id, password_hash FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    ['dev@ship.local']
  );

  if (!result.rows[0]) {
    throw new Error('dev@ship.local not found. Run the normal seed first.');
  }

  const devUser = result.rows[0];

  await pool.query(
    `UPDATE users SET last_workspace_id = $1 WHERE id = $2`,
    [workspaceId, devUser.id]
  );

  return {
    id: devUser.id,
    passwordHash: devUser.password_hash,
  };
}

async function ensureBenchmarkUsers(pool, workspaceId, passwordHash) {
  for (let index = 1; index <= TARGET_USER_COUNT; index += 1) {
    const email = `${BENCHMARK_USER_PREFIX}${String(index).padStart(2, '0')}@ship.local`;
    const name = `Benchmark User ${String(index).padStart(2, '0')}`;

    let userId = null;
    const existingUser = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (existingUser.rows[0]) {
      userId = existingUser.rows[0].id;
    } else {
      const createdUser = await pool.query(
        `INSERT INTO users (email, password_hash, name, last_workspace_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [email, passwordHash, name, workspaceId]
      );
      userId = createdUser.rows[0].id;
    }

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [workspaceId, userId]
    );

    await pool.query(
      `UPDATE users SET last_workspace_id = $1 WHERE id = $2`,
      [workspaceId, userId]
    );

    const existingPerson = await pool.query(
      `SELECT id
       FROM documents
       WHERE workspace_id = $1
         AND document_type = 'person'
         AND properties->>'user_id' = $2
       LIMIT 1`,
      [workspaceId, userId]
    );

    if (!existingPerson.rows[0]) {
      await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, visibility)
         VALUES ($1, 'person', $2, $3::jsonb, $4, 'workspace')`,
        [workspaceId, name, JSON.stringify({ user_id: userId, email, benchmark: true }), userId]
      );
    }
  }
}

async function ensureBenchmarkDocuments(pool, workspaceId, createdBy) {
  const counts = await getCounts(pool);
  const needed = Math.max(0, TARGET_DOCUMENT_COUNT - counts.documents);

  if (needed === 0) {
    return;
  }

  for (let index = 1; index <= needed; index += 1) {
    const title = `${BENCHMARK_DOC_PREFIX} Reference ${String(index).padStart(3, '0')}`;
    const existing = await pool.query(
      `SELECT id
       FROM documents
       WHERE workspace_id = $1
         AND title = $2
         AND document_type = 'wiki'
       LIMIT 1`,
      [workspaceId, title]
    );

    if (existing.rows[0]) {
      continue;
    }

    await pool.query(
      `INSERT INTO documents (
         workspace_id,
         document_type,
         title,
         content,
         properties,
         created_by,
         visibility
       )
       VALUES ($1, 'wiki', $2, $3::jsonb, $4::jsonb, $5, 'workspace')`,
      [
        workspaceId,
        title,
        JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: `${title} benchmark content.` }],
            },
          ],
        }),
        JSON.stringify({ benchmark: true, benchmark_index: index }),
        createdBy,
      ]
    );
  }
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const workspace = await ensureWorkspace(pool);
    const devUser = await ensureDevUser(pool, workspace.id);

    const before = await getCounts(pool);

    await ensureBenchmarkUsers(pool, workspace.id, devUser.passwordHash);
    await ensureBenchmarkDocuments(pool, workspace.id, devUser.id);

    const after = await getCounts(pool);
    const sprintResult = await pool.query(
      `SELECT id
       FROM documents
       WHERE workspace_id = $1
         AND document_type = 'sprint'
         AND deleted_at IS NULL
       ORDER BY created_at ASC
       LIMIT 1`,
      [workspace.id]
    );
    const documentResult = await pool.query(
      `SELECT id
       FROM documents
       WHERE workspace_id = $1
         AND document_type = 'wiki'
         AND title = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [workspace.id, `${BENCHMARK_DOC_PREFIX} Reference 001`]
    );

    console.log(JSON.stringify({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      before,
      after,
      benchmarkSprintId: sprintResult.rows[0]?.id || null,
      benchmarkDocumentId: documentResult.rows[0]?.id || null,
      benchmarkPassword: BENCHMARK_PASSWORD,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
