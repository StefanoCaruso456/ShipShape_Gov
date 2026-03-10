import { chromium } from '@playwright/test';
import fs from 'fs/promises';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:3000';
const LOGIN_EMAIL = process.env.RUNTIME_AUDIT_EMAIL || 'dev@ship.local';
const LOGIN_PASSWORD = process.env.RUNTIME_AUDIT_PASSWORD || 'admin123';

const output = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  normalUsage: {},
  networkDisconnectRecovery: {},
  malformedInput: {},
  concurrentEdit: {},
  slow3G: {},
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function initBucket(name) {
  return {
    name,
    console: [],
    pageErrors: [],
    requestFailures: [],
    dialogs: [],
  };
}

function attachDiagnostics(page, bucket) {
  page.on('console', (msg) => {
    bucket.console.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      url: page.url(),
      ts: new Date().toISOString(),
    });
  });

  page.on('pageerror', (err) => {
    bucket.pageErrors.push({
      message: err.message,
      stack: err.stack,
      url: page.url(),
      ts: new Date().toISOString(),
    });
  });

  page.on('requestfailed', (request) => {
    bucket.requestFailures.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText || 'unknown',
      ts: new Date().toISOString(),
    });
  });

  page.on('dialog', async (dialog) => {
    bucket.dialogs.push({
      type: dialog.type(),
      message: dialog.message(),
      ts: new Date().toISOString(),
    });
    await dialog.dismiss();
  });
}

async function login(page) {
  const csrfResponse = await page.request.get(`${API_URL}/api/csrf-token`);
  if (!csrfResponse.ok()) {
    throw new Error(`Failed to fetch CSRF token (${csrfResponse.status()})`);
  }

  const csrfJson = await csrfResponse.json();
  const loginResponse = await page.request.post(`${API_URL}/api/auth/login`, {
    headers: {
      'x-csrf-token': csrfJson.token,
      'content-type': 'application/json',
    },
    data: JSON.stringify({
      email: LOGIN_EMAIL,
      password: LOGIN_PASSWORD,
    }),
  });

  if (!loginResponse.ok()) {
    const body = await loginResponse.text();
    throw new Error(`Failed to login (${loginResponse.status()}): ${body}`);
  }

  await page.goto('/my-week');
  await page.waitForURL(/\/my-week|\/docs|\/dashboard/, { timeout: 20000 });
  await sleep(1000);
}

async function waitForEditor(page) {
  await page.locator('.ProseMirror').waitFor({ state: 'visible', timeout: 15000 });
}

async function typeInEditor(page, text) {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type(text);
}

async function createDocument(page, titlePrefix = 'Runtime Audit Doc') {
  const csrfResponse = await page.request.get(`${API_URL}/api/csrf-token`);
  if (!csrfResponse.ok()) {
    throw new Error(`Failed to fetch CSRF token for document creation (${csrfResponse.status()})`);
  }

  const csrfJson = await csrfResponse.json();
  const title = `${titlePrefix} ${Date.now()}`;
  const createResponse = await page.request.post(`${API_URL}/api/documents`, {
    headers: {
      'x-csrf-token': csrfJson.token,
      'content-type': 'application/json',
    },
    data: JSON.stringify({
      title,
      document_type: 'wiki',
    }),
  });

  if (!createResponse.ok()) {
    const body = await createResponse.text();
    throw new Error(`Failed to create document (${createResponse.status()}): ${body}`);
  }

  const created = await createResponse.json();
  const documentId = created.id || created.data?.id;
  if (!documentId) {
    throw new Error('Document creation response did not include an id');
  }

  await page.goto(`/documents/${documentId}`);
  await waitForEditor(page);
  await sleep(1000);
  return { url: page.url(), title, id: documentId };
}

async function getEditorText(page) {
  return page.locator('.ProseMirror').textContent();
}

async function runNormalUsage(browser) {
  const bucket = initBucket('normalUsage');
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addInitScript(() => {
    localStorage.setItem('ship:disableActionItemsModal', 'true');
  });
  const page = await context.newPage();
  attachDiagnostics(page, bucket);

  await login(page);

  await page.goto('/my-week');
  await page.getByText(/Loading week|Week|My Week/i).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await sleep(1000);

  const created = await createDocument(page, 'Normal Usage');
  await typeInEditor(page, 'Normal usage baseline content.');
  await sleep(1500);

  await page.goto('/issues');
  await page.getByText(/New Issue|No issues found|Issues/i).first().waitFor({ state: 'visible', timeout: 15000 });
  await sleep(1000);

  await page.goto('/programs');
  await page.getByText(/Programs|No programs yet/i).first().waitFor({ state: 'visible', timeout: 15000 });
  await sleep(1000);

  bucket.summary = {
    documentUrl: created.url,
    consoleErrors: bucket.console.filter((m) => m.type === 'error').length,
    consoleWarnings: bucket.console.filter((m) => m.type === 'warning').length,
    pageErrors: bucket.pageErrors.length,
    requestFailures: bucket.requestFailures.length,
  };

  await context.close();
  return bucket;
}

async function waitForText(page, text, timeout = 10000) {
  const locator = page.locator('.ProseMirror');
  await page.waitForFunction(
    ({ selector, expected }) => {
      const node = document.querySelector(selector);
      return !!node && (node.textContent || '').includes(expected);
    },
    { selector: '.ProseMirror', expected: text },
    { timeout }
  );
  return locator.textContent();
}

async function runNetworkDisconnect(browser) {
  const bucket = initBucket('networkDisconnectRecovery');
  const context1 = await browser.newContext({ baseURL: BASE_URL });
  const context2 = await browser.newContext({ baseURL: BASE_URL });
  await context1.addInitScript(() => {
    localStorage.setItem('ship:disableActionItemsModal', 'true');
  });
  await context2.addInitScript(() => {
    localStorage.setItem('ship:disableActionItemsModal', 'true');
  });
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();
  attachDiagnostics(page1, bucket);
  attachDiagnostics(page2, bucket);

  await login(page1);
  await login(page2);

  const created = await createDocument(page1, 'Reconnect Audit');
  await page2.goto(created.url);
  await waitForEditor(page2);

  await typeInEditor(page1, 'Online seed. ');
  await sleep(1500);
  await waitForText(page2, 'Online seed.', 10000);

  await context1.setOffline(true);
  await typeInEditor(page1, 'Offline delta.');
  await sleep(1000);

  const page2WhileOffline = await getEditorText(page2);
  const sawOfflineTextWhileDisconnected = (page2WhileOffline || '').includes('Offline delta.');

  await context1.setOffline(false);
  await sleep(4000);

  let syncedAfterReconnect = false;
  try {
    await waitForText(page2, 'Offline delta.', 10000);
    syncedAfterReconnect = true;
  } catch {
    syncedAfterReconnect = false;
  }

  await page1.reload();
  await page2.reload();
  await waitForEditor(page1);
  await waitForEditor(page2);

  const page1Final = await getEditorText(page1);
  const page2Final = await getEditorText(page2);
  const survivedRefresh = (page1Final || '').includes('Offline delta.') && (page2Final || '').includes('Offline delta.');

  let status = 'Fail';
  if (syncedAfterReconnect && survivedRefresh) {
    status = 'Pass';
  } else if ((page1Final || '').includes('Offline delta.')) {
    status = 'Partial';
  }

  bucket.summary = {
    documentUrl: created.url,
    sawOfflineTextWhileDisconnected,
    syncedAfterReconnect,
    survivedRefresh,
    status,
    consoleErrors: bucket.console.filter((m) => m.type === 'error').length,
    pageErrors: bucket.pageErrors.length,
    requestFailures: bucket.requestFailures.length,
  };

  await context1.close();
  await context2.close();
  return bucket;
}

async function runMalformedInput(browser) {
  const bucket = initBucket('malformedInput');
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addInitScript(() => {
    localStorage.setItem('ship:disableActionItemsModal', 'true');
  });
  const page = await context.newPage();
  attachDiagnostics(page, bucket);

  await login(page);
  const created = await createDocument(page, 'Malformed Audit');

  const titleInput = page.getByPlaceholder('Untitled');
  const xssPayload = '<img src=x onerror=alert("XSS_RUNTIME")>';
  await titleInput.fill(xssPayload);
  await sleep(1000);
  await page.reload();
  await waitForEditor(page);
  const reloadedTitle = await titleInput.inputValue();

  const longLine = 'L'.repeat(12000);
  await typeInEditor(page, longLine);
  await sleep(1500);
  const editorText = await getEditorText(page);

  bucket.summary = {
    documentUrl: created.url,
    xssDialogCount: bucket.dialogs.length,
    titleRoundTrippedAsText: reloadedTitle === xssPayload,
    longTextPresent: (editorText || '').includes('L'.repeat(200)),
    consoleErrors: bucket.console.filter((m) => m.type === 'error').length,
    pageErrors: bucket.pageErrors.length,
    requestFailures: bucket.requestFailures.length,
  };

  await context.close();
  return bucket;
}

async function runConcurrentTitleEdit(browser) {
  const bucket = initBucket('concurrentEdit');
  const context1 = await browser.newContext({ baseURL: BASE_URL });
  const context2 = await browser.newContext({ baseURL: BASE_URL });
  await context1.addInitScript(() => {
    localStorage.setItem('ship:disableActionItemsModal', 'true');
  });
  await context2.addInitScript(() => {
    localStorage.setItem('ship:disableActionItemsModal', 'true');
  });
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();
  attachDiagnostics(page1, bucket);
  attachDiagnostics(page2, bucket);

  await login(page1);
  await login(page2);
  const created = await createDocument(page1, 'Concurrent Title');
  await page2.goto(created.url);
  await waitForEditor(page2);

  const titleA = `Concurrent Title A ${Date.now()}`;
  const titleB = `Concurrent Title B ${Date.now()}`;
  const titleInput1 = page1.getByPlaceholder('Untitled');
  const titleInput2 = page2.getByPlaceholder('Untitled');

  await Promise.all([
    titleInput1.fill(titleA),
    titleInput2.fill(titleB),
  ]);
  await sleep(2000);

  await page1.reload();
  await page2.reload();
  await waitForEditor(page1);
  await waitForEditor(page2);

  const finalTitle1 = await titleInput1.inputValue();
  const finalTitle2 = await titleInput2.inputValue();
  const bothValuesPreserved = finalTitle1 === titleA && finalTitle2 === titleB;
  const finalConsensus = finalTitle1 === finalTitle2 ? finalTitle1 : 'diverged';

  bucket.summary = {
    documentUrl: created.url,
    titleA,
    titleB,
    finalTitle1,
    finalTitle2,
    bothValuesPreserved,
    finalConsensus,
    conflictUiVisible: false,
    consoleErrors: bucket.console.filter((m) => m.type === 'error').length,
    pageErrors: bucket.pageErrors.length,
  };

  await context1.close();
  await context2.close();
  return bucket;
}

async function runSlow3G(browser) {
  const bucket = initBucket('slow3G');
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addInitScript(() => {
    localStorage.setItem('ship:disableActionItemsModal', 'true');
  });
  const page = await context.newPage();
  attachDiagnostics(page, bucket);

  await login(page);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: 50 * 1024,
    uploadThroughput: 20 * 1024,
    connectionType: 'cellular3g',
  });

  let pendingApi = 0;
  const pendingTimeline = [];
  const watchRequest = (request) => {
    if (request.url().includes('/api/')) {
      pendingApi += 1;
      pendingTimeline.push({ event: 'start', url: request.url(), pendingApi, ts: Date.now() });
    }
  };
  const clearRequest = (request) => {
    if (request.url().includes('/api/')) {
      pendingApi = Math.max(0, pendingApi - 1);
      pendingTimeline.push({ event: 'end', url: request.url(), pendingApi, ts: Date.now() });
    }
  };
  page.on('request', watchRequest);
  page.on('requestfinished', clearRequest);
  page.on('requestfailed', clearRequest);

  await page.goto('/programs');
  await sleep(1500);

  const loadingIndicators = await page.evaluate(() => {
    const loadingRegex = /loading|saving|sync|fetching/i;
    const progress = Array.from(document.querySelectorAll('[role="progressbar"], [aria-busy="true"]'));
    const textHits = Array.from(document.querySelectorAll('body *'))
      .map((el) => el.textContent || '')
      .filter((text) => loadingRegex.test(text))
      .slice(0, 10);
    return {
      progressCount: progress.length,
      textHits,
    };
  });

  const headingVisible = await page.getByRole('heading', { name: 'Programs' }).isVisible().catch(() => false);

  bucket.summary = {
    pendingApiAtSample: pendingApi,
    headingVisible,
    loadingIndicators,
    missingLoadingStateObserved: pendingApi > 0 && loadingIndicators.progressCount === 0 && loadingIndicators.textHits.length === 0,
    consoleErrors: bucket.console.filter((m) => m.type === 'error').length,
    pageErrors: bucket.pageErrors.length,
    requestFailures: bucket.requestFailures.length,
  };
  bucket.pendingTimeline = pendingTimeline;

  await context.close();
  return bucket;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    output.normalUsage = await runNormalUsage(browser);
    output.networkDisconnectRecovery = await runNetworkDisconnect(browser);
    output.malformedInput = await runMalformedInput(browser);
    output.concurrentEdit = await runConcurrentTitleEdit(browser);
    output.slow3G = await runSlow3G(browser);
  } finally {
    await browser.close();
  }

  await fs.writeFile(
    new URL('./runtime-error-probe.json', import.meta.url),
    JSON.stringify(output, null, 2)
  );
}

main().catch(async (error) => {
  const failureOutput = {
    ...output,
    failure: {
      message: error.message,
      stack: error.stack,
    },
  };
  await fs.writeFile(
    new URL('./runtime-error-probe.json', import.meta.url),
    JSON.stringify(failureOutput, null, 2)
  );
  console.error(error);
  process.exit(1);
});
