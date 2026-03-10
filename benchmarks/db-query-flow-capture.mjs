import fs from 'fs';
import { execFileSync } from 'child_process';

function parseCookies(path) {
  const lines = fs.readFileSync(path, 'utf8').split('\n');
  const cookies = [];

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#HttpOnly_')) line = line.slice('#HttpOnly_'.length);
    if (line.startsWith('#')) continue;

    const parts = line.split(/\t/);
    if (parts.length < 7) continue;
    cookies.push(`${parts[5]}=${parts[6]}`);
  }

  return cookies.join('; ');
}

async function request(url, headers) {
  const response = await fetch(url, { headers });
  await response.text();
  return response.status;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPostgresLogsSince(sinceIso) {
  return execFileSync(
    'docker',
    ['compose', '-f', 'docker-compose.local.yml', 'logs', 'postgres', '--since', sinceIso],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
}

function parseExecuteEntries(logText) {
  const lines = logText.split('\n');
  const entries = [];
  let current = null;

  for (const line of lines) {
    const executeMatch = line.match(/LOG:\s+duration:\s+([\d.]+)\s+ms\s+execute [^:]+:\s(.*)$/);
    if (executeMatch) {
      if (current) entries.push(current);
      current = {
        duration_ms: Number(executeMatch[1]),
        statement: executeMatch[2].trim(),
        parameters: null,
      };
      continue;
    }

    if (current && line.includes('DETAIL:  parameters:')) {
      current.parameters = line.split('DETAIL:  parameters:')[1].trim();
      continue;
    }

    if (current) {
      const trimmed = line.replace(/^postgres-1\s+\|\s*/, '');
      if (trimmed.startsWith('2026-') || trimmed.startsWith('2025-') || trimmed.startsWith('2027-')) {
        entries.push(current);
        current = null;
        continue;
      }

      if (line.includes('LOG:') || line.includes('DETAIL:')) {
        continue;
      }

      if (trimmed.trim()) {
        current.statement += ` ${trimmed.trim()}`;
      }
    }
  }

  if (current) entries.push(current);

  return entries;
}

const cookiePath = process.env.SHIP_COOKIE_PATH || '/tmp/ship.cookies';
const baseUrl = process.env.SHIP_BASE_URL || 'http://localhost:3000';
const documentId = process.env.SHIP_DOCUMENT_ID;
const sprintId = process.env.SHIP_SPRINT_ID;
const programId = process.env.SHIP_PROGRAM_ID;

if (!documentId || !sprintId || !programId) {
  throw new Error('SHIP_DOCUMENT_ID, SHIP_SPRINT_ID, and SHIP_PROGRAM_ID are required');
}

const headers = {
  accept: 'application/json',
  cookie: parseCookies(cookiePath),
};

const flows = [
  {
    name: 'Load main page',
    requests: [
      `${baseUrl}/api/auth/me`,
      `${baseUrl}/api/dashboard/my-week`,
    ],
  },
  {
    name: 'View a document',
    requests: [
      `${baseUrl}/api/documents/${documentId}`,
      `${baseUrl}/api/team/people`,
      `${baseUrl}/api/programs`,
      `${baseUrl}/api/projects`,
    ],
  },
  {
    name: 'List issues',
    requests: [
      `${baseUrl}/api/issues`,
      `${baseUrl}/api/team/people`,
      `${baseUrl}/api/projects`,
    ],
  },
  {
    name: 'Load sprint board',
    requests: [
      `${baseUrl}/api/weeks/${sprintId}`,
      `${baseUrl}/api/weeks/${sprintId}/issues`,
      `${baseUrl}/api/weeks/${sprintId}/standups`,
      `${baseUrl}/api/team/people`,
      `${baseUrl}/api/projects`,
      `${baseUrl}/api/programs/${programId}/sprints`,
      `${baseUrl}/api/issues?sprint_id=${sprintId}`,
    ],
  },
  {
    name: 'Search content',
    requests: [
      `${baseUrl}/api/documents`,
    ],
  },
];

const results = [];

for (const flow of flows) {
  const start = new Date().toISOString();

  for (const url of flow.requests) {
    const status = await request(url, headers);
    if (status >= 400) {
      throw new Error(`${flow.name} failed for ${url} with status ${status}`);
    }
  }

  await sleep(500);

  const logs = getPostgresLogsSince(start);
  const entries = parseExecuteEntries(logs);
  const slowest = entries.reduce((max, entry) => {
    if (!max || entry.duration_ms > max.duration_ms) return entry;
    return max;
  }, null);

  results.push({
    flow: flow.name,
    request_count: flow.requests.length,
    requests: flow.requests,
    total_queries: entries.length,
    slowest_query_ms: slowest?.duration_ms ?? 0,
    slowest_statement: slowest?.statement ?? null,
    slowest_parameters: slowest?.parameters ?? null,
    execute_entries: entries,
  });

  await sleep(750);
}

fs.writeFileSync(
  'benchmarks/db-query-flow-baseline.json',
  JSON.stringify(results, null, 2)
);

console.log(JSON.stringify(results, null, 2));
