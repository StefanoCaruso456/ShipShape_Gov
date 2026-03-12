import fs from 'fs';
import { performance } from 'perf_hooks';

function parseCookies(path) {
  const rawFile = fs.readFileSync(path, 'utf8').trim();
  if (!rawFile) {
    return '';
  }

  if (!rawFile.includes('\t')) {
    return rawFile;
  }

  const lines = rawFile.split('\n');
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

async function singleRequest(url, headers) {
  const start = performance.now();
  const response = await fetch(url, { headers });
  await response.text();

  return {
    status: response.status,
    duration: performance.now() - start,
  };
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil((p / 100) * sortedValues.length) - 1
  );
  return sortedValues[index];
}

async function benchmarkEndpoint(url, concurrency, requests, headers) {
  const durations = [];
  const statusCounts = {};
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex++;
      if (current >= requests) return;

      const { status, duration } = await singleRequest(url, headers);
      durations.push(duration);
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  durations.sort((a, b) => a - b);

  return {
    concurrency,
    requests,
    statusCounts,
    p50_ms: Number(percentile(durations, 50).toFixed(2)),
    p95_ms: Number(percentile(durations, 95).toFixed(2)),
    p99_ms: Number(percentile(durations, 99).toFixed(2)),
  };
}

const cookiePath = process.env.SHIP_COOKIE_PATH || '/tmp/ship.cookies';
const outputPath = process.env.SHIP_OUTPUT_PATH || 'benchmarks/api-performance-baseline.json';
const baseUrl = process.env.SHIP_BASE_URL || 'http://localhost:3000';
const sprintId = process.env.SHIP_SPRINT_ID;
const documentId = process.env.SHIP_DOCUMENT_ID;
const requestCount = Number(process.env.SHIP_REQUEST_COUNT || 60);
const warmupRequests = Number(process.env.SHIP_WARMUP_REQUESTS || 5);

if (!sprintId || !documentId) {
  throw new Error('SHIP_SPRINT_ID and SHIP_DOCUMENT_ID are required');
}

const headers = {
  accept: 'application/json',
  cookie: parseCookies(cookiePath),
};

const endpoints = [
  { name: 'GET /api/auth/me', url: `${baseUrl}/api/auth/me` },
  { name: 'GET /api/dashboard/my-week', url: `${baseUrl}/api/dashboard/my-week` },
  { name: 'GET /api/issues?sprint_id={id}', url: `${baseUrl}/api/issues?sprint_id=${sprintId}` },
  { name: 'GET /api/documents/:id', url: `${baseUrl}/api/documents/${documentId}` },
  { name: 'GET /api/search/mentions?q=dev', url: `${baseUrl}/api/search/mentions?q=dev` },
];

const results = [];

for (const endpoint of endpoints) {
  const runs = [];
  for (const concurrency of [10, 25, 50]) {
    if (warmupRequests > 0) {
      await benchmarkEndpoint(endpoint.url, Math.min(concurrency, 5), warmupRequests, headers);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    runs.push(await benchmarkEndpoint(endpoint.url, concurrency, requestCount, headers));
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  results.push({ endpoint: endpoint.name, runs });
}

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
