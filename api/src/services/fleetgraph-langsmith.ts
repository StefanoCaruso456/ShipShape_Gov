import type { RunnableConfig } from '@langchain/core/runnables';
import { RunCollectorCallbackHandler } from '@langchain/core/tracers/run_collector';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { Client, RunTree } from 'langsmith';
import type { Run } from 'langsmith/schemas';

interface FleetGraphLangSmithTraceMetadata {
  runId: string | null;
  runUrl: string | null;
  shareUrl: string | null;
}

export interface FleetGraphLangSmithSession {
  collector: RunCollectorCallbackHandler;
  callbacks: NonNullable<RunnableConfig['callbacks']>;
}

export interface FleetGraphLangSmithChildRunInput {
  parentRunId: string | null;
  name: string;
  runType: 'chain' | 'tool' | 'llm';
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
  error?: string | null;
}

let clientSingleton: Client | null | undefined;
const TRACE_RESOLUTION_RETRY_DELAYS_MS = [0, 250, 500, 1000, 2000];
const DEFAULT_LANGSMITH_API_URL = 'https://api.smith.langchain.com';
const DEFAULT_LANGSMITH_WEB_URL = 'https://smith.langchain.com';

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
    apiUrl: getEnv('LANGCHAIN_ENDPOINT') ?? getEnv('LANGSMITH_ENDPOINT') ?? DEFAULT_LANGSMITH_API_URL,
    webUrl: getEnv('LANGSMITH_WEB_URL') ?? DEFAULT_LANGSMITH_WEB_URL,
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

function getLangSmithProjectName(): string | undefined {
  return getEnv('LANGCHAIN_PROJECT') ?? getEnv('LANGSMITH_PROJECT');
}

function createParentRunTree(parentRun: Run, client: Client): RunTree {
  return new RunTree({
    name: parentRun.name,
    id: parentRun.id,
    trace_id: parentRun.trace_id,
    dotted_order: parentRun.dotted_order,
    client,
    tracingEnabled: true,
    project_name: getLangSmithProjectName(),
    tags: parentRun.tags ?? [],
    extra: {
      metadata:
        (parentRun.extra &&
        typeof parentRun.extra === 'object' &&
        'metadata' in parentRun.extra &&
        parentRun.extra.metadata &&
        typeof parentRun.extra.metadata === 'object')
          ? parentRun.extra.metadata as Record<string, unknown>
          : {},
    },
    serialized: {},
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function resolveLangSmithUrls(
  client: Client,
  runId: string
): Promise<Pick<FleetGraphLangSmithTraceMetadata, 'runUrl' | 'shareUrl'>> {
  let runUrl: string | null = null;
  let shareUrl: string | null = null;

  for (const delayMs of TRACE_RESOLUTION_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    let run: Run | null = null;

    try {
      run = await client.readRun(runId);
    } catch {
      run = null;
    }

    if (run) {
      try {
        runUrl = await client.getRunUrl({ run });
      } catch {
        runUrl = null;
      }

      if (shouldShareLangSmithRuns()) {
        try {
          shareUrl = (await client.readRunSharedLink(runId)) ?? (await client.shareRun(runId));
        } catch {
          shareUrl = null;
        }
      }
    }

    if (runUrl && (!shouldShareLangSmithRuns() || shareUrl)) {
      break;
    }
  }

  return {
    runUrl,
    shareUrl,
  };
}

export function createFleetGraphLangSmithSession(): FleetGraphLangSmithSession | null {
  if (!isLangSmithTracingEnabled()) {
    return null;
  }

  const client = getLangSmithClient();
  if (!client) {
    return null;
  }

  const collector = new RunCollectorCallbackHandler();
  const tracer = new LangChainTracer({
    client,
    projectName: getLangSmithProjectName(),
  });

  return {
    collector,
    callbacks: [collector, tracer],
  };
}

export async function resolveFleetGraphLangSmithTrace(
  session: FleetGraphLangSmithSession | null
): Promise<FleetGraphLangSmithTraceMetadata> {
  const collector = session?.collector ?? null;
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

  const { runUrl, shareUrl } = await resolveLangSmithUrls(client, rootRun.id);

  return {
    runId: rootRun.id,
    runUrl,
    shareUrl,
  };
}

export async function recordFleetGraphLangSmithChildRun(
  input: FleetGraphLangSmithChildRunInput
): Promise<void> {
  if (!input.parentRunId) {
    return;
  }

  const client = getLangSmithClient();
  if (!client) {
    return;
  }

  const parentRun = await client.readRun(input.parentRunId).catch(() => null);
  if (!parentRun) {
    return;
  }

  const parentRunTree = createParentRunTree(parentRun, client);
  const childRun = parentRunTree.createChild({
    name: input.name,
    run_type: input.runType,
    inputs: input.inputs,
    extra: {
      metadata: input.metadata ?? {},
    },
    tags: input.tags,
    serialized: {},
  });

  await childRun.postRun();
  await childRun.end(input.outputs, input.error ?? undefined);
  await childRun.patchRun();
}
