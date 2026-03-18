#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_URL = process.env.FLEETGRAPH_EVIDENCE_API_URL ?? 'http://localhost:3000';
const EMAIL = process.env.FLEETGRAPH_EVIDENCE_EMAIL ?? 'dev@ship.local';
const PASSWORD = process.env.FLEETGRAPH_EVIDENCE_PASSWORD ?? 'admin123';
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.FLEETGRAPH_EVIDENCE_OUTPUT_DIR ?? 'audit-results/fleetgraph-evidence'
);
const CAPTURE_RESUME =
  process.env.FLEETGRAPH_EVIDENCE_CAPTURE_RESUME === undefined ||
  process.env.FLEETGRAPH_EVIDENCE_CAPTURE_RESUME === 'true';
const LANGSMITH_TRACE_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000];
const DEFAULT_LANGSMITH_API_URL = 'https://api.smith.langchain.com';
const DEFAULT_LANGSMITH_WEB_URL = 'https://smith.langchain.com';

function getEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isLangSmithSharingEnabled() {
  return getEnv('FLEETGRAPH_LANGSMITH_SHARE_TRACES') === 'true';
}

function getLangSmithApiKey() {
  return getEnv('LANGCHAIN_API_KEY') ?? getEnv('LANGSMITH_API_KEY');
}

function getLangSmithApiUrl() {
  return getEnv('LANGCHAIN_ENDPOINT') ?? getEnv('LANGSMITH_ENDPOINT') ?? DEFAULT_LANGSMITH_API_URL;
}

function getLangSmithWebUrl() {
  return getEnv('LANGSMITH_WEB_URL') ?? DEFAULT_LANGSMITH_WEB_URL;
}

function isLangSmithConfigured() {
  const tracingEnabled =
    getEnv('LANGCHAIN_TRACING_V2') === 'true' || getEnv('LANGSMITH_TRACING') === 'true';
  const apiKey = getLangSmithApiKey();

  return tracingEnabled && Boolean(apiKey);
}

async function fetchLangSmithJson(pathname, options = {}) {
  const apiKey = getLangSmithApiKey();
  if (!apiKey) {
    throw new Error('LangSmith API key is not configured');
  }

  const response = await fetch(new URL(pathname, getLangSmithApiUrl()), {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'x-api-key': apiKey,
      ...(options.json === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });

  if (options.allow404 && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `LangSmith ${options.method ?? 'GET'} ${pathname} failed with status ${response.status}`
    );
  }

  return response.json();
}

async function readLangSmithRun(runId) {
  return fetchLangSmithJson(`/runs/${runId}`);
}

async function readLangSmithShareUrl(runId) {
  const payload = await fetchLangSmithJson(`/runs/${runId}/share`, {
    allow404: true,
  });

  if (!payload?.share_token) {
    return null;
  }

  return new URL(`/public/${payload.share_token}/r`, getLangSmithWebUrl()).toString();
}

async function createLangSmithShareUrl(runId) {
  const payload = await fetchLangSmithJson(`/runs/${runId}/share`, {
    method: 'PUT',
    json: {
      run_id: runId,
      share_token: randomUUID(),
    },
  });

  if (!payload?.share_token) {
    return null;
  }

  return new URL(`/public/${payload.share_token}/r`, getLangSmithWebUrl()).toString();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function backfillLangSmithTraceLinks(item) {
  if (!item?.langsmithRunId || !isLangSmithConfigured()) {
    return item;
  }

  let langsmithRunUrl = item.langsmithRunUrl ?? null;
  let langsmithShareUrl = item.langsmithShareUrl ?? null;

  for (const delayMs of LANGSMITH_TRACE_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    let run = null;

    try {
      run = await readLangSmithRun(item.langsmithRunId);
    } catch {
      run = null;
    }

    if (run) {
      if (!langsmithRunUrl) {
        try {
          langsmithRunUrl = run.app_path
            ? new URL(run.app_path, getLangSmithWebUrl()).toString()
            : null;
        } catch {
          langsmithRunUrl = null;
        }
      }

      if (isLangSmithSharingEnabled() && !langsmithShareUrl) {
        try {
          langsmithShareUrl =
            (await readLangSmithShareUrl(item.langsmithRunId)) ??
            (await createLangSmithShareUrl(item.langsmithRunId));
        } catch {
          langsmithShareUrl = null;
        }
      }
    }

    if (langsmithRunUrl && (!isLangSmithSharingEnabled() || langsmithShareUrl)) {
      break;
    }
  }

  return {
    ...item,
    langsmithRunUrl,
    langsmithShareUrl,
  };
}

class SessionClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.cookies = new Map();
  }

  updateCookies(response) {
    const values =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];
    const fallback = response.headers.get('set-cookie');
    const cookieHeaders = values.length > 0 ? values : fallback ? [fallback] : [];

    for (const header of cookieHeaders) {
      const [pair] = header.split(';', 1);
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      this.cookies.set(name, value);
    }
  }

  getCookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      json = undefined,
      headers = {},
      expectedStatus = 200,
    } = options;

    const requestHeaders = {
      Accept: 'application/json',
      ...headers,
    };

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      requestHeaders.cookie = cookieHeader;
    }

    if (json !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    const response = await fetch(new URL(endpoint, this.baseUrl), {
      method,
      headers: requestHeaders,
      body: json === undefined ? undefined : JSON.stringify(json),
    });

    this.updateCookies(response);

    const text = await response.text();
    let payload;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (response.status !== expectedStatus) {
      throw new Error(
        `${method} ${endpoint} failed with status ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`
      );
    }

    return payload;
  }
}

function readWeekListPayload(payload) {
  const weeks = Array.isArray(payload?.weeks) ? payload.weeks : [];
  const currentSprintNumber =
    typeof payload?.current_sprint_number === 'number' ? payload.current_sprint_number : null;

  return { weeks, currentSprintNumber };
}

function pickWeekSearchOrder(weeks, currentSprintNumber) {
  const currentWeeks = [];
  const otherWeeks = [];

  for (const week of weeks) {
    if (week?.sprint_number === currentSprintNumber) {
      currentWeeks.push(week);
    } else {
      otherWeeks.push(week);
    }
  }

  return [...currentWeeks, ...otherWeeks];
}

function buildOnDemandRequest(weekId) {
  return {
    active_view: {
      entity: {
        id: weekId,
        type: 'week',
        sourceDocumentType: 'sprint',
      },
      surface: 'document',
      route: `/documents/${weekId}/issues`,
      tab: 'issues',
      projectId: null,
    },
    question: 'Why is this sprint at risk?',
  };
}

function buildProjectOnDemandRequest(projectId) {
  return {
    active_view: {
      entity: {
        id: projectId,
        type: 'project',
        sourceDocumentType: 'project',
      },
      surface: 'document',
      route: `/documents/${projectId}/weeks`,
      tab: 'weeks',
      projectId,
    },
    question: 'Why is this sprint at risk?',
  };
}

function summarizeRun(result) {
  return {
    threadId: result.threadId,
    status: result.status,
    stage: result.stage,
    terminalOutcome: result.terminalOutcome,
    weekId: result.expandedScope?.weekId ?? null,
    title: result.fetched?.entity?.title ?? null,
    signalSeverity: result.derivedSignals?.severity ?? 'none',
    shouldSurface: result.derivedSignals?.shouldSurface ?? false,
    pendingApproval: Boolean(result.pendingApproval),
    reasoningSource: result.reasoningSource ?? null,
    langsmithRunId: result.telemetry?.langsmithRunId ?? null,
    langsmithRunUrl: result.telemetry?.langsmithRunUrl ?? null,
    langsmithShareUrl: result.telemetry?.langsmithShareUrl ?? null,
    braintrustSpanId: result.telemetry?.braintrustSpanId ?? null,
  };
}

function shouldReplaceFlaggedRun(currentSummary, nextSummary) {
  if (!currentSummary) {
    return true;
  }

  if (currentSummary.pendingApproval) {
    return false;
  }

  if (nextSummary.pendingApproval) {
    return true;
  }

  if (
    currentSummary.terminalOutcome === 'suppressed' &&
    nextSummary.terminalOutcome !== 'suppressed'
  ) {
    return true;
  }

  return false;
}

function buildMarkdownReport(report) {
  const lines = [
    '# FleetGraph Evidence Bundle',
    '',
    `Generated: ${report.generatedAt}`,
    `API URL: ${report.apiUrl}`,
    `Actor: ${report.actorEmail}`,
    '',
    '## Captured paths',
    '',
  ];

  for (const section of ['quietRun', 'flaggedRun', 'hitlRun', 'resumeRun', 'proactiveRun']) {
    const item = report[section];
    lines.push(`### ${section}`);
    if (!item) {
      lines.push('', 'Not captured.', '');
      continue;
    }

    if (section === 'proactiveRun') {
      lines.push('');
      lines.push(`- processedWeeks: ${item.processedWeeks}`);
      lines.push(`- surfacedFindings: ${item.surfacedFindings}`);
      lines.push(`- newNotifications: ${item.newNotifications}`);
      lines.push('');
      continue;
    }

    lines.push('');
    lines.push(`- weekId: ${item.weekId ?? 'n/a'}`);
    lines.push(`- title: ${item.title ?? 'n/a'}`);
    lines.push(`- status: ${item.status}`);
    lines.push(`- stage: ${item.stage ?? 'n/a'}`);
    lines.push(`- terminalOutcome: ${item.terminalOutcome ?? 'n/a'}`);
    lines.push(`- signalSeverity: ${item.signalSeverity}`);
    lines.push(`- pendingApproval: ${item.pendingApproval}`);
    lines.push(`- reasoningSource: ${item.reasoningSource ?? 'n/a'}`);
    lines.push(`- LangSmith run id: ${item.langsmithRunId ?? 'not captured'}`);
    lines.push(`- LangSmith run URL: ${item.langsmithRunUrl ?? 'not captured'}`);
    lines.push(`- LangSmith share URL: ${item.langsmithShareUrl ?? 'not captured'}`);
    lines.push(`- Braintrust span id: ${item.braintrustSpanId ?? 'not captured'}`);
    lines.push('');
  }

  lines.push('## Notes', '');
  lines.push(
    report.traceLinksReady
      ? '- LangSmith trace URLs were captured for this evidence bundle.'
      : '- LangSmith trace URLs were not captured. Set `LANGCHAIN_TRACING_V2=true` and the LangSmith API key before rerunning if you want trace evidence here.'
  );
  lines.push(
    !CAPTURE_RESUME
      ? '- Resume evidence capture was disabled for this run.'
      : report.resumeRun
        ? '- Resume evidence was captured with a dismiss decision.'
        : '- Resume evidence was not captured because no pending approval candidate was available.'
  );
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const client = new SessionClient(API_URL);
  const csrf = await client.request('/api/csrf-token');
  const csrfToken = csrf?.token;

  if (typeof csrfToken !== 'string' || csrfToken.length === 0) {
    throw new Error('Failed to fetch CSRF token');
  }

  await client.request('/api/auth/login', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
    json: {
      email: EMAIL,
      password: PASSWORD,
    },
  });

  const weeksPayload = await client.request('/api/weeks');
  const { weeks, currentSprintNumber } = readWeekListPayload(weeksPayload);
  const searchOrder = pickWeekSearchOrder(weeks, currentSprintNumber);

  let quietRun = null;
  let flaggedRun = null;
  let hitlRun = null;

  for (const week of searchOrder) {
    if (!week?.id) {
      continue;
    }

    const nextCsrf = await client.request('/api/csrf-token');
    const result = await client.request('/api/fleetgraph/on-demand', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': nextCsrf.token,
      },
      json: buildOnDemandRequest(week.id),
    });

    const summary = summarizeRun(result);

    if (!quietRun && summary.terminalOutcome === 'quiet') {
      quietRun = summary;
      await writeFile(
        path.join(OUTPUT_DIR, 'quiet-run.json'),
        `${JSON.stringify(result, null, 2)}\n`
      );
    }

    if (summary.shouldSurface && shouldReplaceFlaggedRun(flaggedRun, summary)) {
      flaggedRun = summary;
      await writeFile(
        path.join(OUTPUT_DIR, 'flagged-run.json'),
        `${JSON.stringify(result, null, 2)}\n`
      );
    }

    if (!hitlRun && summary.pendingApproval) {
      hitlRun = {
        ...summary,
        threadId: result.threadId,
      };
      await writeFile(
        path.join(OUTPUT_DIR, 'hitl-run.json'),
        `${JSON.stringify(result, null, 2)}\n`
      );
    }

    if (quietRun && flaggedRun && hitlRun) {
      break;
    }
  }

  if (!quietRun) {
    const projects = await client.request('/api/projects');

    for (const project of Array.isArray(projects) ? projects : []) {
      if (!project?.id) {
        continue;
      }

      const nextCsrf = await client.request('/api/csrf-token');
      const result = await client.request('/api/fleetgraph/on-demand', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': nextCsrf.token,
        },
        json: buildProjectOnDemandRequest(project.id),
      });

      const summary = summarizeRun(result);

      if (summary.terminalOutcome === 'quiet') {
        quietRun = summary;
        await writeFile(
          path.join(OUTPUT_DIR, 'quiet-run.json'),
          `${JSON.stringify(result, null, 2)}\n`
        );
        break;
      }
    }
  }

  let resumeRun = null;
  if (CAPTURE_RESUME && hitlRun?.threadId) {
    const nextCsrf = await client.request('/api/csrf-token');
    const resumed = await client.request('/api/fleetgraph/on-demand/resume', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': nextCsrf.token,
      },
      json: {
        thread_id: hitlRun.threadId,
        decision: {
          outcome: 'dismiss',
          note: 'Phase 9 evidence capture dismiss',
        },
      },
    });

    resumeRun = summarizeRun(resumed);
    await writeFile(
      path.join(OUTPUT_DIR, 'resume-run.json'),
      `${JSON.stringify(resumed, null, 2)}\n`
    );
  }

  let proactiveRun = null;
  if (flaggedRun?.weekId) {
    const nextCsrf = await client.request('/api/csrf-token');
    const proactive = await client.request('/api/fleetgraph/proactive/run', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': nextCsrf.token,
      },
      json: {
        week_id: flaggedRun.weekId,
      },
    });

    proactiveRun = {
      processedWeeks: proactive.processedWeeks ?? 0,
      surfacedFindings: proactive.surfacedFindings ?? 0,
      newNotifications: proactive.newNotifications ?? 0,
    };

    await writeFile(
      path.join(OUTPUT_DIR, 'proactive-run.json'),
      `${JSON.stringify(proactive, null, 2)}\n`
    );
  }

  quietRun = await backfillLangSmithTraceLinks(quietRun);
  flaggedRun = await backfillLangSmithTraceLinks(flaggedRun);
  hitlRun = await backfillLangSmithTraceLinks(hitlRun);
  resumeRun = await backfillLangSmithTraceLinks(resumeRun);

  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl: API_URL,
    actorEmail: EMAIL,
    quietRun,
    flaggedRun,
    hitlRun,
    resumeRun,
    proactiveRun,
    traceLinksReady: [
      quietRun?.langsmithRunUrl,
      flaggedRun?.langsmithRunUrl,
      hitlRun?.langsmithRunUrl,
      resumeRun?.langsmithRunUrl,
    ].some(Boolean),
  };

  await writeFile(path.join(OUTPUT_DIR, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(OUTPUT_DIR, 'summary.md'), buildMarkdownReport(report));

  console.log(`FleetGraph evidence written to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
