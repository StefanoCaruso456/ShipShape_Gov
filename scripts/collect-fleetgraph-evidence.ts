#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  FleetGraphOnDemandRequest,
  FleetGraphOnDemandResponse,
  FleetGraphOnDemandResumeRequest,
  FleetGraphReasoningSource,
  FleetGraphTerminalOutcome,
} from '../shared/src/types/fleetgraph.js';

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
const LANGSMITH_TRACE_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000] as const;
const DEFAULT_LANGSMITH_API_URL = 'https://api.smith.langchain.com';
const DEFAULT_LANGSMITH_WEB_URL = 'https://smith.langchain.com';

interface LangSmithJsonRequestOptions {
  method?: 'GET' | 'PUT';
  json?: unknown;
  allow404?: boolean;
}

interface LangSmithRunPayload {
  app_path?: string | null;
}

interface LangSmithSharePayload {
  share_token?: string | null;
}

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

interface SessionRequestOptions {
  method?: 'GET' | 'POST';
  json?: unknown;
  headers?: Record<string, string>;
  expectedStatus?: number;
}

interface CsrfTokenResponse {
  token?: string;
}

interface WeekSummary {
  id?: string | null;
  sprint_number?: number | null;
}

interface FleetGraphRunSummary {
  threadId: string | null;
  status: string;
  stage: string | null;
  terminalOutcome: FleetGraphTerminalOutcome | null;
  weekId: string | null;
  title: string | null;
  signalSeverity: FleetGraphOnDemandResponse['derivedSignals']['severity'];
  shouldSurface: boolean;
  pendingApproval: boolean;
  reasoningSource: FleetGraphReasoningSource | null;
  langsmithRunId: string | null;
  langsmithRunUrl: string | null;
  langsmithShareUrl: string | null;
  braintrustSpanId: string | null;
}

interface FleetGraphProactiveRunResponse {
  processedWeeks?: number;
  surfacedFindings?: number;
  newNotifications?: number;
}

interface FleetGraphProactiveRunSummary {
  processedWeeks: number;
  surfacedFindings: number;
  newNotifications: number;
}

interface FleetGraphEvidenceReport {
  generatedAt: string;
  apiUrl: string;
  actorEmail: string;
  quietRun: FleetGraphRunSummary | null;
  flaggedRun: FleetGraphRunSummary | null;
  hitlRun: FleetGraphRunSummary | null;
  resumeRun: FleetGraphRunSummary | null;
  proactiveRun: FleetGraphProactiveRunSummary | null;
  traceLinksReady: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isLangSmithSharingEnabled(): boolean {
  return getEnv('FLEETGRAPH_LANGSMITH_SHARE_TRACES') === 'true';
}

function getLangSmithApiKey(): string | undefined {
  return getEnv('LANGCHAIN_API_KEY') ?? getEnv('LANGSMITH_API_KEY');
}

function getLangSmithApiUrl(): string {
  return getEnv('LANGCHAIN_ENDPOINT') ?? getEnv('LANGSMITH_ENDPOINT') ?? DEFAULT_LANGSMITH_API_URL;
}

function getLangSmithWebUrl(): string {
  return getEnv('LANGSMITH_WEB_URL') ?? DEFAULT_LANGSMITH_WEB_URL;
}

function isLangSmithConfigured(): boolean {
  const tracingEnabled =
    getEnv('LANGCHAIN_TRACING_V2') === 'true' || getEnv('LANGSMITH_TRACING') === 'true';
  const apiKey = getLangSmithApiKey();

  return tracingEnabled && Boolean(apiKey);
}

async function fetchLangSmithJson<T>(
  pathname: string,
  options: LangSmithJsonRequestOptions = {}
): Promise<T | null> {
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

  return (await response.json()) as T;
}

async function readLangSmithRun(runId: string): Promise<LangSmithRunPayload | null> {
  return fetchLangSmithJson<LangSmithRunPayload>(`/runs/${runId}`);
}

async function readLangSmithShareUrl(runId: string): Promise<string | null> {
  const payload = await fetchLangSmithJson<LangSmithSharePayload>(`/runs/${runId}/share`, {
    allow404: true,
  });

  if (!payload?.share_token) {
    return null;
  }

  return new URL(`/public/${payload.share_token}/r`, getLangSmithWebUrl()).toString();
}

async function createLangSmithShareUrl(runId: string): Promise<string | null> {
  const payload = await fetchLangSmithJson<LangSmithSharePayload>(`/runs/${runId}/share`, {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function backfillLangSmithTraceLinks<T extends FleetGraphRunSummary>(
  item: T | null
): Promise<T | null> {
  if (!item?.langsmithRunId || !isLangSmithConfigured()) {
    return item;
  }

  let langsmithRunUrl = item.langsmithRunUrl;
  let langsmithShareUrl = item.langsmithShareUrl;

  for (const delayMs of LANGSMITH_TRACE_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    let run: LangSmithRunPayload | null = null;

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
  private readonly baseUrl: string;
  private readonly cookies = new Map<string, string>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  private updateCookies(response: Response): void {
    const values = (response.headers as HeadersWithSetCookie).getSetCookie?.() ?? [];
    const fallback = response.headers.get('set-cookie');
    const cookieHeaders = values.length > 0 ? values : fallback ? [fallback] : [];

    for (const header of cookieHeaders) {
      const [pair = ''] = header.split(';', 1);
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        continue;
      }

      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      this.cookies.set(name, value);
    }
  }

  private getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  async request<T>(endpoint: string, options: SessionRequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      json = undefined,
      headers = {},
      expectedStatus = 200,
    } = options;

    const requestHeaders: Record<string, string> = {
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
    let payload: unknown;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (response.status !== expectedStatus) {
      throw new Error(
        `${method} ${endpoint} failed with status ${response.status}: ${
          typeof payload === 'string' ? payload : JSON.stringify(payload)
        }`
      );
    }

    return payload as T;
  }
}

function readWeekListPayload(payload: unknown): {
  weeks: WeekSummary[];
  currentSprintNumber: number | null;
} {
  if (!isRecord(payload)) {
    return { weeks: [], currentSprintNumber: null };
  }

  const weeks = Array.isArray(payload.weeks) ? (payload.weeks as WeekSummary[]) : [];
  const currentSprintNumber =
    typeof payload.current_sprint_number === 'number' ? payload.current_sprint_number : null;

  return { weeks, currentSprintNumber };
}

function pickWeekSearchOrder(
  weeks: WeekSummary[],
  currentSprintNumber: number | null
): WeekSummary[] {
  const currentWeeks: WeekSummary[] = [];
  const otherWeeks: WeekSummary[] = [];

  for (const week of weeks) {
    if (week?.sprint_number === currentSprintNumber) {
      currentWeeks.push(week);
    } else {
      otherWeeks.push(week);
    }
  }

  return [...currentWeeks, ...otherWeeks];
}

function buildOnDemandRequest(weekId: string): FleetGraphOnDemandRequest {
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

function buildProjectOnDemandRequest(projectId: string): FleetGraphOnDemandRequest {
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

function summarizeRun(result: FleetGraphOnDemandResponse): FleetGraphRunSummary {
  return {
    threadId: result.threadId,
    status: result.status,
    stage: result.stage,
    terminalOutcome: result.terminalOutcome,
    weekId: result.expandedScope.weekId ?? null,
    title: result.fetched.entity?.title ?? null,
    signalSeverity: result.derivedSignals.severity,
    shouldSurface: result.derivedSignals.shouldSurface,
    pendingApproval: Boolean(result.pendingApproval),
    reasoningSource: result.reasoningSource ?? null,
    langsmithRunId: result.telemetry.langsmithRunId ?? null,
    langsmithRunUrl: result.telemetry.langsmithRunUrl ?? null,
    langsmithShareUrl: result.telemetry.langsmithShareUrl ?? null,
    braintrustSpanId: result.telemetry.braintrustSpanId ?? null,
  };
}

function shouldReplaceFlaggedRun(
  currentSummary: FleetGraphRunSummary | null,
  nextSummary: FleetGraphRunSummary
): boolean {
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

function buildMarkdownReport(report: FleetGraphEvidenceReport): string {
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

  const runSections = [
    ['quietRun', report.quietRun],
    ['flaggedRun', report.flaggedRun],
    ['hitlRun', report.hitlRun],
    ['resumeRun', report.resumeRun],
    ['proactiveRun', report.proactiveRun],
  ] as const;

  for (const [section, item] of runSections) {
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

async function writeJsonSnapshot(filename: string, payload: unknown): Promise<void> {
  await writeFile(path.join(OUTPUT_DIR, filename), `${JSON.stringify(payload, null, 2)}\n`);
}

async function fetchCsrfToken(client: SessionClient): Promise<string> {
  const csrf = await client.request<CsrfTokenResponse>('/api/csrf-token');
  if (typeof csrf.token !== 'string' || csrf.token.length === 0) {
    throw new Error('Failed to fetch CSRF token');
  }

  return csrf.token;
}

function readId(value: unknown): string | null {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 ? value.id : null;
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const client = new SessionClient(API_URL);
  const csrfToken = await fetchCsrfToken(client);

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

  const weeksPayload = await client.request<unknown>('/api/weeks');
  const { weeks, currentSprintNumber } = readWeekListPayload(weeksPayload);
  const searchOrder = pickWeekSearchOrder(weeks, currentSprintNumber);

  let quietRun: FleetGraphRunSummary | null = null;
  let flaggedRun: FleetGraphRunSummary | null = null;
  let hitlRun: FleetGraphRunSummary | null = null;

  for (const week of searchOrder) {
    if (typeof week.id !== 'string' || week.id.length === 0) {
      continue;
    }

    const result = await client.request<FleetGraphOnDemandResponse>('/api/fleetgraph/on-demand', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': await fetchCsrfToken(client),
      },
      json: buildOnDemandRequest(week.id),
    });

    const summary = summarizeRun(result);

    if (!quietRun && summary.terminalOutcome === 'quiet') {
      quietRun = summary;
      await writeJsonSnapshot('quiet-run.json', result);
    }

    if (summary.shouldSurface && shouldReplaceFlaggedRun(flaggedRun, summary)) {
      flaggedRun = summary;
      await writeJsonSnapshot('flagged-run.json', result);
    }

    if (!hitlRun && summary.pendingApproval) {
      hitlRun = summary;
      await writeJsonSnapshot('hitl-run.json', result);
    }

    if (quietRun && flaggedRun && hitlRun) {
      break;
    }
  }

  if (!quietRun) {
    const projects = await client.request<unknown>('/api/projects');

    for (const project of Array.isArray(projects) ? projects : []) {
      const projectId = readId(project);
      if (!projectId) {
        continue;
      }

      const result = await client.request<FleetGraphOnDemandResponse>('/api/fleetgraph/on-demand', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': await fetchCsrfToken(client),
        },
        json: buildProjectOnDemandRequest(projectId),
      });

      const summary = summarizeRun(result);

      if (summary.terminalOutcome === 'quiet') {
        quietRun = summary;
        await writeJsonSnapshot('quiet-run.json', result);
        break;
      }
    }
  }

  let resumeRun: FleetGraphRunSummary | null = null;
  if (CAPTURE_RESUME && typeof hitlRun?.threadId === 'string' && hitlRun.threadId.length > 0) {
    const resumeRequest: FleetGraphOnDemandResumeRequest = {
      thread_id: hitlRun.threadId,
      decision: {
        outcome: 'dismiss',
        note: 'Phase 9 evidence capture dismiss',
      },
    };

    const resumed = await client.request<FleetGraphOnDemandResponse>('/api/fleetgraph/on-demand/resume', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': await fetchCsrfToken(client),
      },
      json: resumeRequest,
    });

    resumeRun = summarizeRun(resumed);
    await writeJsonSnapshot('resume-run.json', resumed);
  }

  let proactiveRun: FleetGraphProactiveRunSummary | null = null;
  if (typeof flaggedRun?.weekId === 'string' && flaggedRun.weekId.length > 0) {
    const proactive = await client.request<FleetGraphProactiveRunResponse>(
      '/api/fleetgraph/proactive/run',
      {
        method: 'POST',
        headers: {
          'X-CSRF-Token': await fetchCsrfToken(client),
        },
        json: {
          week_id: flaggedRun.weekId,
        },
      }
    );

    proactiveRun = {
      processedWeeks: proactive.processedWeeks ?? 0,
      surfacedFindings: proactive.surfacedFindings ?? 0,
      newNotifications: proactive.newNotifications ?? 0,
    };

    await writeJsonSnapshot('proactive-run.json', proactive);
  }

  [quietRun, flaggedRun, hitlRun, resumeRun] = await Promise.all([
    backfillLangSmithTraceLinks(quietRun),
    backfillLangSmithTraceLinks(flaggedRun),
    backfillLangSmithTraceLinks(hitlRun),
    backfillLangSmithTraceLinks(resumeRun),
  ]);

  const report: FleetGraphEvidenceReport = {
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
    ].some((value) => typeof value === 'string' && value.length > 0),
  };

  await writeFile(path.join(OUTPUT_DIR, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(OUTPUT_DIR, 'summary.md'), buildMarkdownReport(report));

  console.log(`FleetGraph evidence written to ${OUTPUT_DIR}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
