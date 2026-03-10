import { chromium } from '@playwright/test';
import fs from 'fs/promises';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:3000';
const LOGIN_EMAIL = process.env.RUNTIME_AUDIT_EMAIL || 'dev@ship.local';
const LOGIN_PASSWORD = process.env.RUNTIME_AUDIT_PASSWORD || 'admin123';

const output = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  apiUrl: API_URL,
  sessionPolling: {
    frontendOriginPolls: 0,
    apiOriginPolls: 0,
    consoleErrors: [],
  },
  realtimeBanner: {
    visible: false,
    screenshot: 'benchmarks/runtime-fix-realtime-banner.png',
    debugScreenshot: 'benchmarks/runtime-fix-realtime-banner-debug.png',
    bodyText: null,
    console: [],
  },
  collaborationBanner: {
    visible: false,
    screenshot: 'benchmarks/runtime-fix-collaboration-banner.png',
    debugScreenshot: 'benchmarks/runtime-fix-collaboration-banner-debug.png',
    bodyText: null,
  },
  titleSaveRecovery: {
    errorBannerVisible: false,
    retrySucceeded: false,
    screenshot: 'benchmarks/runtime-fix-title-save-banner.png',
    debugScreenshot: 'benchmarks/runtime-fix-title-save-banner-debug.png',
    bodyText: null,
    requestUrls: [],
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    throw new Error(`Failed to login (${loginResponse.status()})`);
  }

  await page.goto('/my-week');
  await page.waitForURL(/\/my-week|\/docs|\/dashboard/, { timeout: 20000 });
  await sleep(1000);
}

async function waitForEditor(page) {
  await page.locator('.ProseMirror').waitFor({ state: 'visible', timeout: 15000 });
}

async function createDocument(page, titlePrefix) {
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
    throw new Error(`Failed to create document (${createResponse.status()})`);
  }

  const created = await createResponse.json();
  const documentId = created.id || created.data?.id;
  if (!documentId) {
    throw new Error('Document creation response did not include an id');
  }

  await page.goto(`/documents/${documentId}`);
  await waitForEditor(page);
  await sleep(1000);
  return { id: documentId, title };
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  try {
    const sessionContext = await browser.newContext({ baseURL: BASE_URL });
    await sessionContext.addInitScript(() => {
      localStorage.setItem('ship:disableActionItemsModal', 'true');
    });
    const sessionPage = await sessionContext.newPage();
    sessionPage.on('response', (response) => {
      const url = response.url();
      if (!url.includes('/api/auth/session')) return;
      if (url.startsWith(`${BASE_URL}/api/auth/session`)) {
        output.sessionPolling.frontendOriginPolls += 1;
      }
      if (url.startsWith(`${API_URL}/api/auth/session`)) {
        output.sessionPolling.apiOriginPolls += 1;
      }
    });
    sessionPage.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && text.includes('/api/auth/session')) {
        output.sessionPolling.consoleErrors.push(text);
      }
    });

    await login(sessionPage);
    await sessionPage.goto('/my-week');
    await sleep(3000);
    await sessionContext.close();

    const realtimeContext = await browser.newContext({ baseURL: BASE_URL });
    await realtimeContext.addInitScript(() => {
      localStorage.setItem('ship:disableActionItemsModal', 'true');
    });
    const realtimePage = await realtimeContext.newPage();
    await login(realtimePage);
    await sleep(2000);
    await realtimePage.context().setOffline(true);
    await realtimePage.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    try {
      await realtimePage.getByText('Realtime degraded.').waitFor({ state: 'visible', timeout: 15000 });
      output.realtimeBanner.visible = true;
      await realtimePage.screenshot({
        path: 'benchmarks/runtime-fix-realtime-banner.png',
        fullPage: true,
      });
    } catch (error) {
      output.realtimeBanner.bodyText = await realtimePage.locator('body').textContent();
      await realtimePage.screenshot({
        path: 'benchmarks/runtime-fix-realtime-banner-debug.png',
        fullPage: true,
      });
      output.realtimeBanner.error = String(error);
    }
    await realtimePage.context().setOffline(false);
    await realtimeContext.close();

    const collabContext = await browser.newContext({ baseURL: BASE_URL });
    await collabContext.addInitScript(() => {
      localStorage.setItem('ship:disableActionItemsModal', 'true');
    });
    const collabPage = await collabContext.newPage();
    await login(collabPage);
    await createDocument(collabPage, 'Collab Banner');
    await sleep(2000);
    await collabPage.context().setOffline(true);
    await collabPage.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    try {
      await collabPage.getByText('Collaboration connection lost.').waitFor({ state: 'visible', timeout: 15000 });
      output.collaborationBanner.visible = true;
      await collabPage.screenshot({
        path: 'benchmarks/runtime-fix-collaboration-banner.png',
        fullPage: true,
      });
    } catch (error) {
      output.collaborationBanner.bodyText = await collabPage.locator('body').textContent();
      await collabPage.screenshot({
        path: 'benchmarks/runtime-fix-collaboration-banner-debug.png',
        fullPage: true,
      });
      output.collaborationBanner.error = String(error);
    }
    await collabPage.context().setOffline(false);
    await collabContext.close();

    const titleContext = await browser.newContext({ baseURL: BASE_URL });
    await titleContext.addInitScript(() => {
      localStorage.setItem('ship:disableActionItemsModal', 'true');
    });
    const titlePage = await titleContext.newPage();
    titlePage.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/documents/')) {
        output.titleSaveRecovery.requestUrls.push(`${request.method()} ${url}`);
      }
    });
    await login(titlePage);
    await createDocument(titlePage, 'Title Save');
    const newTitle = 'FailTitle';
    const abortingTitlePatch = async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SIMULATED_FAILURE', message: 'Simulated title save failure' } }),
        });
        return;
      }
      await route.continue();
    };
    await titlePage.route('**/api/documents/**', abortingTitlePatch);
    const titleInput = titlePage.locator('textarea[placeholder="Untitled"]').first();
    await titleInput.fill(newTitle);
    try {
      await titlePage.getByText('Title save failed.').waitFor({ state: 'visible', timeout: 20000 });
      output.titleSaveRecovery.errorBannerVisible = true;
      await titlePage.screenshot({
        path: 'benchmarks/runtime-fix-title-save-banner.png',
        fullPage: true,
      });
      await titlePage.unroute('**/api/documents/**', abortingTitlePatch);
      await sleep(1000);
      await titlePage.getByRole('button', { name: 'Retry Title Save' }).click();
      await titlePage.getByText('Title save failed.').waitFor({ state: 'hidden', timeout: 12000 });
      await sleep(1500);
      await titlePage.reload();
      await waitForEditor(titlePage);
      const persistedTitle = await titlePage.locator('textarea[placeholder="Untitled"]').first().inputValue();
      output.titleSaveRecovery.retrySucceeded = persistedTitle === newTitle;
    } catch (error) {
      output.titleSaveRecovery.bodyText = await titlePage.locator('body').textContent();
      await titlePage.screenshot({
        path: 'benchmarks/runtime-fix-title-save-banner-debug.png',
        fullPage: true,
      });
      output.titleSaveRecovery.error = String(error);
    }
    await titleContext.close();
  } finally {
    await browser.close();
  }

  await fs.writeFile(
    'benchmarks/runtime-error-remediation.json',
    JSON.stringify(output, null, 2) + '\n'
  );

  console.log(JSON.stringify(output, null, 2));
}

run().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
