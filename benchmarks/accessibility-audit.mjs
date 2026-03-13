import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROOT = process.cwd();
const BENCH_DIR = path.join(ROOT, 'benchmarks');
const OUTPUT_DIR = process.env.ACCESSIBILITY_OUTPUT_DIR
  ? path.resolve(ROOT, process.env.ACCESSIBILITY_OUTPUT_DIR)
  : BENCH_DIR;
const OUTPUT_PREFIX = process.env.ACCESSIBILITY_OUTPUT_PREFIX ?? '';
const BASE_URL = process.env.ACCESSIBILITY_BASE_URL ?? 'http://localhost:5173';
const LOGIN_EMAIL = process.env.ACCESSIBILITY_EMAIL ?? 'dev@ship.local';
const LOGIN_PASSWORD = process.env.ACCESSIBILITY_PASSWORD ?? 'admin123';
const LOGIN_NAME = process.env.ACCESSIBILITY_NAME ?? 'Dev User';
const LIGHTHOUSE_CHROME_PATH = process.env.ACCESSIBILITY_CHROME_PATH ?? chromium.executablePath();

const PAGES = [
  { name: 'login', path: '/login', authRequired: false },
  { name: 'my-week', path: '/my-week', authRequired: true },
  { name: 'docs', path: '/docs', authRequired: true },
  { name: 'issues', path: '/issues', authRequired: true },
  { name: 'projects', path: '/projects', authRequired: true },
  { name: 'programs', path: '/programs', authRequired: true },
  { name: 'team-allocation', path: '/team/allocation', authRequired: true },
];

function slugify(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function outputPath(fileName) {
  return path.join(OUTPUT_DIR, `${OUTPUT_PREFIX}${fileName}`);
}

function sumViolationsByImpact(results, impact) {
  return results.violations.filter((violation) => violation.impact === impact).length;
}

function collectMissingAriaLocations(results) {
  const ariaIds = new Set([
    'aria-allowed-attr',
    'aria-allowed-role',
    'aria-command-name',
    'aria-dialog-name',
    'aria-hidden-focus',
    'aria-input-field-name',
    'aria-meter-name',
    'aria-progressbar-name',
    'aria-required-attr',
    'aria-required-children',
    'aria-required-name',
    'aria-required-parent',
    'aria-roles',
    'aria-text',
    'aria-toggle-field-name',
    'aria-tooltip-name',
    'button-name',
    'form-field-multiple-labels',
    'label',
    'link-name',
    'select-name',
  ]);

  return results.violations
    .filter((violation) => ariaIds.has(violation.id))
    .flatMap((violation) =>
      violation.nodes.map((node) => ({
        rule: violation.id,
        impact: violation.impact,
        target: node.target.join(' '),
        html: node.html,
      }))
    );
}

function collectColorContrastFailures(results) {
  return results.violations
    .filter((violation) => violation.id === 'color-contrast')
    .flatMap((violation) =>
      violation.nodes.map((node) => ({
        impact: violation.impact,
        target: node.target.join(' '),
        html: node.html,
        summary: node.failureSummary,
      }))
    );
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  if (!page.url().includes('/login')) {
    return;
  }

  const setupButton = page.getByRole('button', { name: /create admin account/i });
  const signInButton = page.getByRole('button', { name: 'Sign in', exact: true });

  await Promise.any([
    setupButton.waitFor({ state: 'visible', timeout: 10_000 }),
    signInButton.waitFor({ state: 'visible', timeout: 10_000 }),
  ]);

  if (await setupButton.isVisible().catch(() => false)) {
    await page.locator('#name').fill(LOGIN_NAME);
    await page.locator('#email').fill(LOGIN_EMAIL);
    await page.locator('#password').fill(LOGIN_PASSWORD);
    await page.locator('#confirmPassword').fill(LOGIN_PASSWORD);
    await setupButton.click();
    await page.waitForURL((url) => !url.toString().includes('/setup') && !url.toString().includes('/login'), { timeout: 10_000 });
    await settle(page);
    return;
  }

  await page.locator('#email').fill(LOGIN_EMAIL);
  await page.locator('#password').fill(LOGIN_PASSWORD);
  await signInButton.click();
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 10_000 });
  await settle(page);
}

async function runKeyboardChecks(browser) {
  const results = [];

  const loginContext = await browser.newContext({ baseURL: BASE_URL });
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await settle(loginPage);

  const email = loginPage.locator('#email');
  await email.focus();
  results.push({
    check: 'login-email-focusable',
    passed: await email.evaluate((node) => node === document.activeElement),
  });

  await loginPage.keyboard.press('Tab');
  results.push({
    check: 'login-password-tab-order',
    passed: await loginPage.locator('#password').evaluate((node) => node === document.activeElement),
  });

  await loginPage.keyboard.press('Tab');
  results.push({
    check: 'login-submit-tab-order',
    passed: await loginPage.getByRole('button', { name: 'Sign in', exact: true }).evaluate((node) => node === document.activeElement),
  });

  await loginContext.close();

  const appContext = await browser.newContext({ baseURL: BASE_URL });
  await appContext.addInitScript(() => {
    localStorage.setItem('ship:disableActionItemsModal', 'true');
  });
  const appPage = await appContext.newPage();
  await login(appPage);
  await appPage.goto(`${BASE_URL}/docs`, { waitUntil: 'domcontentloaded' });
  await settle(appPage);

  const mainFocused = await appPage.locator('#main-content').evaluate((node) => node === document.activeElement);
  results.push({
    check: 'app-main-focused-on-navigation',
    passed: mainFocused,
  });

  await appPage.keyboard.press('Tab');
  const firstInteractiveReached = await appPage.evaluate(() => {
    const active = document.activeElement;
    return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(active?.tagName ?? '');
  });
  results.push({
    check: 'app-tab-reaches-focusable-control',
    passed: firstInteractiveReached,
  });

  await appPage.keyboard.press('Tab');
  await appPage.keyboard.press('Tab');
  await appPage.keyboard.press('Tab');
  await appPage.keyboard.press('Tab');
  const navReachable = await appPage.evaluate(() => {
    const active = document.activeElement;
    return /new document/i.test(active?.textContent ?? '') || active?.getAttribute?.('aria-label') === 'Tree view';
  });
  results.push({
    check: 'docs-toolbar-reachable-by-keyboard',
    passed: navReachable,
  });

  await appContext.close();

  const failures = results.filter((result) => !result.passed);

  return {
    completeness: failures.length === 0 ? 'Partial' : 'Broken',
    checks: results,
    note: 'Sampled keyboard flows passed, but the audit did not exhaustively verify every interactive control on every page.',
  };
}

async function captureAccessibilityTree(page) {
  const client = await page.context().newCDPSession(page).catch(() => null);
  if (!client) {
    return { status: 'Unavailable', landmarks: [], note: 'Accessibility tree snapshot was unavailable in this run.' };
  }

  const tree = await client.send('Accessibility.getFullAXTree').catch(() => null);
  if (!tree?.nodes) {
    return { status: 'Unavailable', landmarks: [], note: 'Accessibility tree snapshot was unavailable in this run.' };
  }

  const relevantRoles = new Set(['main', 'navigation', 'button', 'textbox', 'link', 'heading', 'dialog']);
  const landmarks = tree.nodes
    .map((node) => ({
      role: node.role?.value ?? '',
      name: node.name?.value ?? '',
    }))
    .filter((node) => relevantRoles.has(node.role));

  return {
    status: landmarks.length > 0 ? 'Partial' : 'Unavailable',
    landmarks,
    note: 'This is an accessibility-tree proxy only. Native VoiceOver/NVDA screen-reader testing was not executed in this environment.',
  };
}

async function auditPage(page, pageDef) {
  await page.goto(`${BASE_URL}${pageDef.path}`, { waitUntil: 'domcontentloaded' });
  await settle(page);

  const axeResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const pageKey = slugify(pageDef.name);
  const axePath = outputPath(`axe-${pageKey}.json`);
  await fs.writeFile(axePath, JSON.stringify(axeResults, null, 2));

  const screenReaderProxy = await captureAccessibilityTree(page);
  const title = await page.title();

  return {
    name: pageDef.name,
    path: pageDef.path,
    title,
    authRequired: pageDef.authRequired,
    axe: {
      critical: sumViolationsByImpact(axeResults, 'critical'),
      serious: sumViolationsByImpact(axeResults, 'serious'),
      moderate: sumViolationsByImpact(axeResults, 'moderate'),
      minor: sumViolationsByImpact(axeResults, 'minor'),
      violationCount: axeResults.violations.length,
      reportPath: path.relative(ROOT, axePath),
    },
    colorContrastFailures: collectColorContrastFailures(axeResults),
    missingAriaLocations: collectMissingAriaLocations(axeResults),
    screenReaderProxy,
  };
}

function buildCookieHeader(cookies) {
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function runLighthouse(url, cookieHeader, outputPath) {
  const args = [
    'pnpm',
    'dlx',
    'lighthouse',
    url,
    '--only-categories=accessibility',
    '--quiet',
    '--chrome-flags=--headless=new --no-sandbox',
    '--disable-storage-reset',
    '--output=json',
    `--output-path=${outputPath}`,
  ];

  if (cookieHeader) {
    args.push(`--extra-headers=${JSON.stringify({ Cookie: cookieHeader })}`);
  }

  execFileSync('corepack', args, {
    cwd: ROOT,
    env: {
      ...process.env,
      COREPACK_HOME: '/tmp/corepack',
      ...(LIGHTHOUSE_CHROME_PATH ? { CHROME_PATH: LIGHTHOUSE_CHROME_PATH } : {}),
    },
    stdio: 'pipe',
  });

  return fs.readFile(outputPath, 'utf8').then((raw) => JSON.parse(raw));
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addInitScript(() => {
    localStorage.setItem('ship:disableActionItemsModal', 'true');
  });

  const page = await context.newPage();

  const pageResults = [];
  for (const pageDef of PAGES.filter((entry) => !entry.authRequired)) {
    pageResults.push(await auditPage(page, pageDef));
  }

  await login(page);

  for (const pageDef of PAGES.filter((entry) => entry.authRequired)) {
    pageResults.push(await auditPage(page, pageDef));
  }

  const cookies = await context.cookies(BASE_URL);
  const cookieHeader = buildCookieHeader(cookies);

  const keyboard = await runKeyboardChecks(browser);

  const lighthouse = [];
  for (const pageDef of PAGES) {
    const outPath = outputPath(`lighthouse-${slugify(pageDef.name)}.json`);
    const result = await runLighthouse(`${BASE_URL}${pageDef.path}`, pageDef.authRequired ? cookieHeader : '', outPath);
    lighthouse.push({
      name: pageDef.name,
      path: pageDef.path,
      accessibilityScore: result.categories.accessibility.score * 100,
      reportPath: path.relative(ROOT, outPath),
    });
  }

  const totals = {
    criticalSeriousViolations: pageResults.reduce((sum, result) => sum + result.axe.critical + result.axe.serious, 0),
    colorContrastFailures: pageResults.reduce((sum, result) => sum + result.colorContrastFailures.length, 0),
  };

  const missingAriaLocations = pageResults.flatMap((result) =>
    result.missingAriaLocations.map((location) => ({
      page: result.path,
      ...location,
    }))
  );

  const report = {
    auditedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    pages: pageResults,
    lighthouse,
    keyboard,
    totals,
    missingAriaLocations,
    limitations: [
      'VoiceOver/NVDA was not run directly in this environment. Accessibility tree snapshots were used as a proxy for screen-reader structure checks.',
      'Keyboard testing sampled critical flows rather than every single interactive control on every page.',
    ],
  };

  const outPath = outputPath('accessibility-baseline.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
