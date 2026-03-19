#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PUBLIC_URLS = [
  'https://dev.ship.awsdev.treasury.gov',
  'https://shadow.ship.awsdev.treasury.gov',
];

const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.FLEETGRAPH_REQUIREMENTS_OUTPUT_DIR ?? 'audit-results/fleetgraph-requirements'
);
const EVIDENCE_SUMMARY_PATH = path.resolve(
  process.cwd(),
  process.env.FLEETGRAPH_EVIDENCE_SUMMARY_PATH ?? 'audit-results/fleetgraph-evidence/summary.json'
);

type FleetGraphRouteClassification =
  | 'route_missing'
  | 'spa_fallback'
  | 'route_mounted'
  | 'route_responded'
  | 'unknown';

type LangSmithSharedTraceStatus = 'captured' | 'ready_to_capture' | 'blocked_by_env';
type PublicDeploymentStatus = 'verified' | 'not_verified';

interface TracingReadiness {
  tracingEnabled: boolean;
  apiKeyPresent: boolean;
  projectName: string | null;
  readyForSharedTraces: boolean;
}

interface EvidenceSummaryRun {
  langsmithShareUrl?: string | null;
}

interface EvidenceSummaryFile {
  quietRun?: EvidenceSummaryRun | null;
  flaggedRun?: EvidenceSummaryRun | null;
  hitlRun?: EvidenceSummaryRun | null;
  resumeRun?: EvidenceSummaryRun | null;
}

interface EvidenceSummaryReport {
  path: string;
  capturedShareLinks: string[];
  sharedTraceCount: number;
  hasEnoughSharedTraces: boolean;
}

interface FetchTextResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

interface DeploymentCheck {
  baseUrl: string;
  app: {
    status: number;
    reachable: boolean;
    contentType: string | null;
  };
  health: {
    status: number;
    ok: boolean;
    body: string;
  };
  fleetgraphOnDemand: {
    status: number;
    classification: FleetGraphRouteClassification;
    bodyPreview: string;
  };
  fleetgraphProactive: {
    status: number;
    classification: FleetGraphRouteClassification;
    bodyPreview: string;
  };
}

interface RequirementStatus {
  langsmithSharedTraces: LangSmithSharedTraceStatus;
  publicDeployment: PublicDeploymentStatus;
}

interface RequirementVerificationReport {
  generatedAt: string;
  langsmith: TracingReadiness;
  evidence: EvidenceSummaryReport;
  deployments: DeploymentCheck[];
  requirements: RequirementStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePublicUrls(): string[] {
  const raw = process.env.FLEETGRAPH_PUBLIC_URLS;
  if (!raw) {
    const terraformUrl = getTerraformPublicUrl();
    return terraformUrl ? [terraformUrl] : DEFAULT_PUBLIC_URLS;
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is string => value.length > 0);
}

function getTerraformPublicUrl(): string | null {
  try {
    const domain = execFileSync('terraform', ['output', '-raw', 'cloudfront_domain_name'], {
      cwd: path.resolve(process.cwd(), 'terraform'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return domain ? `https://${domain}` : null;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getTracingReadiness(): TracingReadiness {
  const tracingEnabled =
    process.env.LANGCHAIN_TRACING_V2 === 'true' || process.env.LANGSMITH_TRACING === 'true';
  const apiKeyPresent = Boolean(process.env.LANGCHAIN_API_KEY ?? process.env.LANGSMITH_API_KEY);
  const projectName = process.env.LANGCHAIN_PROJECT ?? process.env.LANGSMITH_PROJECT;

  return {
    tracingEnabled,
    apiKeyPresent,
    projectName: projectName ?? null,
    readyForSharedTraces: tracingEnabled && apiKeyPresent,
  };
}

async function readEvidenceSummary(): Promise<EvidenceSummaryReport> {
  try {
    const raw = await readFile(EVIDENCE_SUMMARY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const evidence = isRecord(parsed) ? (parsed as EvidenceSummaryFile) : {};

    const capturedShareLinks = [
      evidence.quietRun?.langsmithShareUrl,
      evidence.flaggedRun?.langsmithShareUrl,
      evidence.hitlRun?.langsmithShareUrl,
      evidence.resumeRun?.langsmithShareUrl,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    return {
      path: EVIDENCE_SUMMARY_PATH,
      capturedShareLinks,
      sharedTraceCount: capturedShareLinks.length,
      hasEnoughSharedTraces: capturedShareLinks.length >= 2,
    };
  } catch {
    return {
      path: EVIDENCE_SUMMARY_PATH,
      capturedShareLinks: [],
      sharedTraceCount: 0,
      hasEnoughSharedTraces: false,
    };
  }
}

async function fetchText(url: string, options: RequestInit = {}): Promise<FetchTextResult> {
  const response = await fetch(url, options);
  const text = await response.text();

  return {
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body: text,
  };
}

function classifyFleetGraphRoute(check: FetchTextResult): FleetGraphRouteClassification {
  const contentType = check.headers['content-type'] ?? '';
  const body = check.body;

  if (
    body.includes('Cannot POST /api/fleetgraph/on-demand') ||
    body.includes('Cannot POST /api/fleetgraph/proactive/run')
  ) {
    return 'route_missing';
  }

  if (contentType.includes('text/html') && check.status === 200) {
    return 'spa_fallback';
  }

  if ([400, 401, 403, 405, 422].includes(check.status)) {
    return 'route_mounted';
  }

  if (check.ok) {
    return 'route_responded';
  }

  return 'unknown';
}

async function verifyPublicUrl(baseUrl: string): Promise<DeploymentCheck> {
  const [appCheck, healthCheck, onDemandCheck, proactiveCheck] = await Promise.all([
    fetchText(baseUrl),
    fetchText(`${baseUrl}/health`),
    fetchText(`${baseUrl}/api/fleetgraph/on-demand`, {
      method: 'POST',
    }),
    fetchText(`${baseUrl}/api/fleetgraph/proactive/run`, {
      method: 'POST',
    }),
  ]);

  return {
    baseUrl,
    app: {
      status: appCheck.status,
      reachable: appCheck.ok,
      contentType: appCheck.headers['content-type'] ?? null,
    },
    health: {
      status: healthCheck.status,
      ok: healthCheck.ok && healthCheck.body.includes('"status":"ok"'),
      body: healthCheck.body,
    },
    fleetgraphOnDemand: {
      status: onDemandCheck.status,
      classification: classifyFleetGraphRoute(onDemandCheck),
      bodyPreview: onDemandCheck.body.slice(0, 160),
    },
    fleetgraphProactive: {
      status: proactiveCheck.status,
      classification: classifyFleetGraphRoute(proactiveCheck),
      bodyPreview: proactiveCheck.body.slice(0, 160),
    },
  };
}

function summarizeRequirementStatus(
  tracing: TracingReadiness,
  evidence: EvidenceSummaryReport,
  deployments: DeploymentCheck[]
): RequirementStatus {
  const deploymentReady = deployments.some(
    (item) =>
      item.app.reachable &&
      item.health.ok &&
      ['route_mounted', 'route_responded'].includes(item.fleetgraphOnDemand.classification) &&
      ['route_mounted', 'route_responded'].includes(item.fleetgraphProactive.classification)
  );

  return {
    langsmithSharedTraces: evidence.hasEnoughSharedTraces
      ? 'captured'
      : tracing.readyForSharedTraces
        ? 'ready_to_capture'
        : 'blocked_by_env',
    publicDeployment: deploymentReady ? 'verified' : 'not_verified',
  };
}

function buildMarkdownReport(report: RequirementVerificationReport): string {
  const lines = [
    '# FleetGraph Requirement Verification',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Remaining requirement status',
    '',
    `- LangSmith shared traces: ${report.requirements.langsmithSharedTraces}`,
    `- Public deployment: ${report.requirements.publicDeployment}`,
    '',
    '## LangSmith readiness',
    '',
    `- Tracing enabled: ${report.langsmith.tracingEnabled}`,
    `- API key present: ${report.langsmith.apiKeyPresent}`,
    `- Project name: ${report.langsmith.projectName ?? 'not set'}`,
    `- Ready for shared traces: ${report.langsmith.readyForSharedTraces}`,
    '',
    '## Local evidence bundle',
    '',
    `- Evidence summary path: ${report.evidence.path}`,
    `- Shared trace count: ${report.evidence.sharedTraceCount}`,
    '',
  ];

  if (report.evidence.capturedShareLinks.length > 0) {
    lines.push(...report.evidence.capturedShareLinks.map((link) => `- Shared trace: ${link}`));
    lines.push('');
  }

  lines.push('## Public deployment verification', '');

  for (const item of report.deployments) {
    lines.push(`### ${item.baseUrl}`);
    lines.push('');
    lines.push(`- App reachable: ${item.app.reachable} (status ${item.app.status})`);
    lines.push(`- Health endpoint: ${item.health.ok} (status ${item.health.status})`);
    lines.push(
      `- FleetGraph on-demand route: ${item.fleetgraphOnDemand.classification} (status ${item.fleetgraphOnDemand.status})`
    );
    lines.push(
      `- FleetGraph proactive route: ${item.fleetgraphProactive.classification} (status ${item.fleetgraphProactive.status})`
    );
    lines.push('');
  }

  lines.push('## Objective next steps', '');

  if (report.requirements.langsmithSharedTraces === 'captured') {
    lines.push('1. LangSmith shared trace requirement is complete.');
  } else if (!report.langsmith.readyForSharedTraces) {
    lines.push('1. Export LangSmith tracing env vars before rerunning the evidence harness.');
  } else {
    lines.push('1. Rerun the FleetGraph evidence harness and save at least two shared LangSmith traces.');
  }

  if (report.requirements.publicDeployment !== 'verified') {
    lines.push('2. Deploy both API and frontend with the FleetGraph branch.');
    lines.push('3. Rerun this verification script against the deployed URL.');
    lines.push('4. Confirm the deployed FleetGraph routes no longer return `Cannot POST` or SPA fallback.');
  } else {
    lines.push('2. Deployment verification is complete.');
  }

  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const publicUrls = parsePublicUrls().map(normalizeBaseUrl);
  const tracing = getTracingReadiness();
  const evidence = await readEvidenceSummary();
  const deployments = await Promise.all(publicUrls.map(verifyPublicUrl));

  const requirements = summarizeRequirementStatus(tracing, evidence, deployments);
  const report: RequirementVerificationReport = {
    generatedAt: new Date().toISOString(),
    langsmith: tracing,
    evidence,
    deployments,
    requirements,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUTPUT_DIR, 'summary.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );
  await writeFile(path.join(OUTPUT_DIR, 'summary.md'), buildMarkdownReport(report), 'utf8');

  console.log(`FleetGraph requirement verification written to ${OUTPUT_DIR}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
