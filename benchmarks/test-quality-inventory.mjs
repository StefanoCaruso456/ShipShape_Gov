import fs from 'fs';
import path from 'path';

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

const SURFACES = {
  api: path.join(root, 'api', 'src'),
  web: path.join(root, 'web', 'src'),
  e2e: path.join(root, 'e2e'),
};

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;
const TEST_DECL_RE = /\b(?:it|test)(?:\.(?:only|skip|todo|fails|concurrent))?\s*\(/g;
const CRITICAL_MARKERS = {
  caia_login_browser: 'critical-path: caia-login-browser',
  document_delete_ui: 'critical-path: document-delete-ui',
  sprint_board_drag_drop: 'critical-path: sprint-board-drag-drop',
};

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
      continue;
    }
    if (entry.isFile() && TEST_FILE_RE.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function countTests(contents) {
  const matches = contents.match(TEST_DECL_RE);
  return matches ? matches.length : 0;
}

function buildSurfaceSummary(dir) {
  const files = fs.existsSync(dir) ? listFiles(dir) : [];
  let tests = 0;
  const fileSummaries = [];

  for (const file of files) {
    const contents = fs.readFileSync(file, 'utf8');
    const testCount = countTests(contents);
    tests += testCount;
    fileSummaries.push({
      file: path.relative(root, file),
      tests: testCount,
    });
  }

  fileSummaries.sort((a, b) => b.tests - a.tests || a.file.localeCompare(b.file));

  return {
    files: files.length,
    tests,
    topFiles: fileSummaries.slice(0, 5),
  };
}

function scanMarkers() {
  const allFiles = Object.values(SURFACES)
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => listFiles(dir));

  const results = {};
  for (const [key, marker] of Object.entries(CRITICAL_MARKERS)) {
    const matchedFiles = [];
    for (const file of allFiles) {
      const contents = fs.readFileSync(file, 'utf8');
      if (contents.includes(marker)) {
        matchedFiles.push(path.relative(root, file));
      }
    }
    results[key] = matchedFiles;
  }
  return results;
}

const api = buildSurfaceSummary(SURFACES.api);
const web = buildSurfaceSummary(SURFACES.web);
const e2e = buildSurfaceSummary(SURFACES.e2e);
const markers = scanMarkers();

const criticalFlowsWithZeroCoverage = Object.entries(markers)
  .filter(([, files]) => files.length === 0)
  .map(([key]) => key);

const output = {
  generatedAt: new Date().toISOString(),
  command: 'node benchmarks/test-quality-inventory.mjs .',
  surfaces: { api, web, e2e },
  totals: {
    files: api.files + web.files + e2e.files,
    tests: api.tests + web.tests + e2e.tests,
  },
  criticalPathMarkers: markers,
  criticalFlowsWithZeroCoverage,
};

console.log(JSON.stringify(output, null, 2));
