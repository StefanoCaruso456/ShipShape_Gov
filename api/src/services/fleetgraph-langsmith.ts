import { RunCollectorCallbackHandler } from '@langchain/core/tracers/run_collector';
import { Client } from 'langsmith';
import type { Run } from 'langsmith/schemas';

interface FleetGraphLangSmithTraceMetadata {
  runId: string | null;
  runUrl: string | null;
  shareUrl: string | null;
}

let clientSingleton: Client | null | undefined;

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isLangSmithTracingEnabled(): boolean {
  const tracingEnabled =
    getEnv('LANGCHAIN_TRACING_V2') === 'true' || getEnv('LANGSMITH_TRACING') === 'true';
  const apiKey = getEnv('LANGCHAIN_API_KEY') ?? getEnv('LANGSMITH_API_KEY');

  return tracingEnabled && Boolean(apiKey);
}

function shouldShareLangSmithRuns(): boolean {
  return getEnv('FLEETGRAPH_LANGSMITH_SHARE_TRACES') === 'true';
}

function getLangSmithClient(): Client | null {
  if (!isLangSmithTracingEnabled()) {
    return null;
  }

  if (clientSingleton !== undefined) {
    return clientSingleton;
  }

  clientSingleton = new Client({
    apiKey: getEnv('LANGCHAIN_API_KEY') ?? getEnv('LANGSMITH_API_KEY'),
    apiUrl: getEnv('LANGCHAIN_ENDPOINT') ?? getEnv('LANGSMITH_ENDPOINT'),
    webUrl: getEnv('LANGSMITH_WEB_URL'),
  });

  return clientSingleton;
}

function getRootRun(collector: RunCollectorCallbackHandler | null): Run | null {
  if (!collector) {
    return null;
  }

  const rootRun =
    collector.tracedRuns.find((run) => run.parent_run_id == null) ??
    collector.tracedRuns[collector.tracedRuns.length - 1] ??
    null;

  return rootRun ?? null;
}

export function createFleetGraphLangSmithCollector(): RunCollectorCallbackHandler | null {
  if (!isLangSmithTracingEnabled()) {
    return null;
  }

  return new RunCollectorCallbackHandler();
}

export async function resolveFleetGraphLangSmithTrace(
  collector: RunCollectorCallbackHandler | null
): Promise<FleetGraphLangSmithTraceMetadata> {
  const rootRun = getRootRun(collector);
  if (!rootRun) {
    return {
      runId: null,
      runUrl: null,
      shareUrl: null,
    };
  }

  const client = getLangSmithClient();
  if (!client) {
    return {
      runId: rootRun.id,
      runUrl: null,
      shareUrl: null,
    };
  }

  let runUrl: string | null = null;
  let shareUrl: string | null = null;

  try {
    runUrl = await client.getRunUrl({ run: rootRun });
  } catch {
    runUrl = null;
  }

  if (shouldShareLangSmithRuns()) {
    try {
      shareUrl = (await client.readRunSharedLink(rootRun.id)) ?? (await client.shareRun(rootRun.id));
    } catch {
      shareUrl = null;
    }
  }

  return {
    runId: rootRun.id,
    runUrl,
    shareUrl,
  };
}
