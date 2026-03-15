/**
 * Playwright Global Setup
 *
 * Runs once before all tests start. Builds both API and Web so each
 * worker can spawn fresh, lightweight server instances quickly.
 *
 * CRITICAL: We build web upfront so workers can use `vite preview`
 * instead of `vite dev`. This prevents the 90GB memory explosion that
 * occurred when 8 workers each ran full Vite dev servers with HMR.
 */

import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Get project root (this file is at e2e/global-setup.ts, so go up one level)
const PROJECT_ROOT = path.resolve(__dirname, '..');

function runPnpm(args: string[], extraEnv?: NodeJS.ProcessEnv) {
  const corepackCandidates = [
    process.env.COREPACK_BIN,
    '/opt/homebrew/bin/corepack',
    '/usr/local/bin/corepack',
  ].filter(Boolean) as string[];

  const corepackBin = corepackCandidates.find((candidate) => fs.existsSync(candidate));

  if (corepackBin) {
    execFileSync(corepackBin, ['pnpm', ...args], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        COREPACK_HOME: process.env.COREPACK_HOME || '/tmp/corepack',
        ...extraEnv,
      },
    });
    return;
  }

  execSync(`pnpm ${args.join(' ')}`, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

export default async function globalSetup() {
  // Memory check at startup
  const totalMemGB = os.totalmem() / (1024 * 1024 * 1024);
  const freeMemGB = os.freemem() / (1024 * 1024 * 1024);
  console.log(`\n[Memory] Total: ${totalMemGB.toFixed(1)}GB, Available: ${freeMemGB.toFixed(1)}GB`);

  if (freeMemGB < 4) {
    console.warn(`⚠️  WARNING: Low memory (${freeMemGB.toFixed(1)}GB free)`);
    console.warn(`   Consider closing other apps or reducing workers.`);
    console.warn(`   Each worker needs ~500MB (Postgres + API + Preview)`);
  }

  console.log('\nBuilding API for tests...');
  try {
    runPnpm(['--filter', '@ship/shared', 'build']);
    runPnpm(['--filter', '@ship/api', 'build']);
    console.log('✓ API build complete');
  } catch (error) {
    console.error('Failed to build API:', error);
    throw error;
  }

  console.log('\nBuilding Web for tests (enables lightweight preview servers)...');
  try {
    runPnpm(['--filter', '@ship/shared', 'build']);
    runPnpm(['--filter', '@ship/web', 'build'], { VITE_APP_ENV: 'test_e2e' });
    console.log('✓ Web build complete');
  } catch (error) {
    console.error('Failed to build Web:', error);
    throw error;
  }

  console.log('\n✓ Global setup complete. Starting tests...\n');
}
