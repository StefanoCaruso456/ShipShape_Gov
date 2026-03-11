#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const repoRoot = process.argv[2];

if (!repoRoot) {
  console.error('Usage: node benchmarks/type-safety-audit.mjs <repo-root>');
  process.exit(1);
}

const scopeDirs = [
  path.join(repoRoot, 'api', 'src'),
  path.join(repoRoot, 'web', 'src'),
  path.join(repoRoot, 'shared', 'src'),
];

const trackedExtensions = new Set(['.ts', '.tsx']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'dist' || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (trackedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function countDirectiveMatches(sourceText, directive) {
  const matches = sourceText.match(new RegExp(`//\\s*${directive}\\b`, 'g'));
  return matches ? matches.length : 0;
}

function getPackageName(filePath) {
  const normalized = filePath.replaceAll(path.sep, '/');
  if (normalized.includes('api/src/')) return 'api';
  if (normalized.includes('web/src/')) return 'web';
  if (normalized.includes('shared/src/')) return 'shared';
  return 'other';
}

function createCounter() {
  return {
    any: 0,
    as: 0,
    nonNull: 0,
    tsIgnore: 0,
    tsExpectError: 0,
    total: 0,
  };
}

function addCounts(target, source) {
  target.any += source.any;
  target.as += source.as;
  target.nonNull += source.nonNull;
  target.tsIgnore += source.tsIgnore;
  target.tsExpectError += source.tsExpectError;
  target.total += source.total;
}

function analyzeFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const counts = createCounter();

  counts.tsIgnore = countDirectiveMatches(sourceText, '@ts-ignore');
  counts.tsExpectError = countDirectiveMatches(sourceText, '@ts-expect-error');

  function visit(node) {
    switch (node.kind) {
      case ts.SyntaxKind.AnyKeyword:
        counts.any += 1;
        break;
      case ts.SyntaxKind.AsExpression:
      case ts.SyntaxKind.TypeAssertionExpression:
        counts.as += 1;
        break;
      case ts.SyntaxKind.NonNullExpression:
        counts.nonNull += 1;
        break;
      default:
        break;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  counts.total =
    counts.any +
    counts.as +
    counts.nonNull +
    counts.tsIgnore +
    counts.tsExpectError;

  return counts;
}

const files = scopeDirs.flatMap(walk);
const totals = createCounter();
const byPackage = new Map([
  ['api', createCounter()],
  ['web', createCounter()],
  ['shared', createCounter()],
]);
const byFile = [];

for (const filePath of files) {
  const counts = analyzeFile(filePath);
  const packageName = getPackageName(filePath);
  addCounts(totals, counts);
  const packageCounter = byPackage.get(packageName);
  if (packageCounter) {
    addCounts(packageCounter, counts);
  }

  byFile.push({
    file: path.relative(repoRoot, filePath).replaceAll(path.sep, '/'),
    ...counts,
  });
}

const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
const strictModeEnabled = tsconfig.compilerOptions?.strict === true;

const topFiles = [...byFile]
  .filter((file) => file.total > 0)
  .sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.file.localeCompare(b.file);
  })
  .slice(0, 10);

const result = {
  generatedAt: new Date().toISOString(),
  repoRoot,
  scope: ['api/src', 'web/src', 'shared/src'],
  strictModeEnabled,
  totals,
  byPackage: Object.fromEntries(byPackage),
  topFiles,
};

console.log(JSON.stringify(result, null, 2));
