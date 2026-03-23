import { z } from 'zod';
import type { RunnableConfig } from '@langchain/core/runnables';
import { RunTree } from 'langsmith';
import type { FleetGraphReasoningService, FleetGraphReasoning, FleetGraphLogger } from '@ship/fleetgraph';
import { estimateAiCost, finishAiSpan, startAiSpan } from './ai-telemetry.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const REASONING_MAX_TOKENS = 600;

const reasoningSchema = z.object({
  answerMode: z.enum(['execution', 'context', 'launcher']),
  summary: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1).max(6),
  whyNow: z.string().nullable(),
  recommendedNextStep: z.string().nullable(),
  confidence: z.enum(['low', 'medium', 'high']),
});

const reasoningJsonSchema = {
  name: 'fleetgraph_reasoning',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answerMode', 'summary', 'evidence', 'whyNow', 'recommendedNextStep', 'confidence'],
    properties: {
      answerMode: {
        type: 'string',
        enum: ['execution', 'context', 'launcher'],
      },
      summary: {
        type: 'string',
      },
      evidence: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'string',
        },
      },
      whyNow: {
        type: ['string', 'null'],
      },
      recommendedNextStep: {
        type: ['string', 'null'],
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
      },
    },
  },
} as const;

interface FleetGraphLangSmithUsageMetadata {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_token_details?: Record<string, number>;
  output_token_details?: Record<string, number>;
  total_cost?: number;
}

function getOpenAiApiKey(): string | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? process.env.OPEN_API_KEY?.trim();
  return apiKey || null;
}

function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function stripCodeFences(text: string): string {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
}

function buildSprintSystemPrompt(): string {
  return [
    'You are FleetGraph, a project execution reasoning agent inside Ship.',
    'Use only the evidence you are given.',
    'Explain why the sprint is or is not at risk and, when relevant, whether the current evidence points more to scope drift, blocked work, dependency risk, workload pressure, staffing pressure, or overcommitment relative to recent delivery history.',
    'Prefer concise, grounded reasoning over generic management advice.',
    'If workPersona is provided, keep the explanation and recommended next step legible for that persona without changing the underlying facts.',
    'For sprint reasoning, answerMode must be "execution".',
    'Return JSON only with keys: answerMode, summary, evidence, whyNow, recommendedNextStep, confidence.',
    'Do not invent facts, names, statuses, or blockers that are not in the evidence.',
  ].join(' ');
}

function buildCurrentViewSystemPrompt(): string {
  return [
    'You are FleetGraph, a context-aware project execution assistant inside Ship.',
    'Use only the current page snapshot, the provided deterministic draft, and the visible routes/actions in the prompt.',
    'Answer the user question directly from the current view instead of falling back to generic navigation advice when the page already contains relevant evidence.',
    'Name the specific visible project, issue, owner, review queue, or route when the evidence supports it.',
    'Preserve the provided answerMode unless the evidence clearly requires a more grounded execution mode.',
    'Keep the answer concise, grounded, and actionable.',
    'Return JSON only with keys: answerMode, summary, evidence, whyNow, recommendedNextStep, confidence.',
    'Do not invent projects, issues, approvals, blockers, or counts that are not in the evidence.',
  ].join(' ');
}

function buildUserPrompt(input: unknown): string {
  return JSON.stringify(input);
}

function extractOpenAiContent(payload: Record<string, unknown>): string | null {
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object') {
    return null;
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== 'object') {
    return null;
  }

  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : null;
}

function extractUsage(payload: Record<string, unknown>) {
  const usage = payload.usage;
  if (!usage || typeof usage !== 'object') {
    return undefined;
  }

  const typedUsage = usage as Record<string, unknown>;
  const promptTokens =
    typeof typedUsage.prompt_tokens === 'number' ? typedUsage.prompt_tokens : undefined;
  const completionTokens =
    typeof typedUsage.completion_tokens === 'number' ? typedUsage.completion_tokens : undefined;
  const totalTokens =
    typeof typedUsage.total_tokens === 'number' ? typedUsage.total_tokens : undefined;

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined
  ) {
    return undefined;
  }

  return estimateAiCost(
    {
      promptTokens,
      completionTokens,
      totalTokens,
    },
    'openai',
    getOpenAiModel()
  );
}

function readUsageRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  const usage = payload.usage;
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  return usage as Record<string, unknown>;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildLangSmithTokenDetails(
  usage: Record<string, unknown>,
  field: 'prompt_tokens_details' | 'completion_tokens_details'
): Record<string, number> | undefined {
  const rawDetails = usage[field];
  if (!rawDetails || typeof rawDetails !== 'object') {
    return undefined;
  }

  const details = rawDetails as Record<string, unknown>;
  const normalized: Record<string, number> = {};

  if (field === 'prompt_tokens_details') {
    const audio = readOptionalNumber(details.audio_tokens);
    const cachedTokens = readOptionalNumber(details.cached_tokens);
    if (audio !== undefined) {
      normalized.audio = audio;
    }
    if (cachedTokens !== undefined) {
      normalized.cache_read = cachedTokens;
    }
  } else {
    const audio = readOptionalNumber(details.audio_tokens);
    const reasoning = readOptionalNumber(details.reasoning_tokens);
    if (audio !== undefined) {
      normalized.audio = audio;
    }
    if (reasoning !== undefined) {
      normalized.reasoning = reasoning;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildLangSmithUsageMetadata(
  payload: Record<string, unknown>
): FleetGraphLangSmithUsageMetadata | undefined {
  const usage = readUsageRecord(payload);
  if (!usage) {
    return undefined;
  }

  const estimatedUsage = extractUsage(payload);
  const inputTokens = readOptionalNumber(usage.prompt_tokens);
  const outputTokens = readOptionalNumber(usage.completion_tokens);
  const inputTokenDetails = buildLangSmithTokenDetails(usage, 'prompt_tokens_details');
  const outputTokenDetails = buildLangSmithTokenDetails(usage, 'completion_tokens_details');
  const totalTokens =
    readOptionalNumber(usage.total_tokens) ??
    (inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined);

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    input_tokens: inputTokens ?? 0,
    output_tokens: outputTokens ?? 0,
    total_tokens: totalTokens ?? 0,
    ...(inputTokenDetails ? { input_token_details: inputTokenDetails } : {}),
    ...(outputTokenDetails ? { output_token_details: outputTokenDetails } : {}),
    ...(estimatedUsage?.estimatedCostUsd !== undefined
      ? {
          total_cost: estimatedUsage.estimatedCostUsd,
        }
      : {}),
  };
}

function withUsageMetadata(
  output: Record<string, unknown>,
  usageMetadata: FleetGraphLangSmithUsageMetadata | undefined
): Record<string, unknown> {
  if (!usageMetadata) {
    return output;
  }

  return {
    ...output,
    usage_metadata: usageMetadata,
  };
}

function buildSprintReasoningTraceInputs(
  input: Parameters<FleetGraphReasoningService['reasonAboutSprint']>[0]
): Record<string, unknown> {
  return {
    activeViewRoute: input.activeViewRoute,
    question: input.question,
    questionTheme: input.questionTheme,
    workPersona: input.workPersona,
    findingSummary: input.findingSummary,
    derivedSignals: {
      severity: input.derivedSignals.severity,
      summary: input.derivedSignals.summary,
      reasons: input.derivedSignals.reasons,
      signalKinds: input.derivedSignals.signals.map((signal) => signal.kind),
      metrics: input.derivedSignals.metrics,
    },
    fetched: {
      entity: input.fetched.entity && typeof input.fetched.entity === 'object'
        ? {
            id:
              'id' in input.fetched.entity && typeof input.fetched.entity.id === 'string'
                ? input.fetched.entity.id
                : null,
            title:
              'title' in input.fetched.entity && typeof input.fetched.entity.title === 'string'
                ? input.fetched.entity.title
                : null,
          }
        : null,
      accountability:
        input.fetched.accountability && typeof input.fetched.accountability === 'object'
          ? {
              project:
                'project' in input.fetched.accountability
                  ? (input.fetched.accountability as { project?: unknown }).project
                  : null,
              issues:
                'issues' in input.fetched.accountability
                  ? (input.fetched.accountability as { issues?: unknown }).issues
                  : null,
            }
          : null,
      planning:
        input.fetched.planning && typeof input.fetched.planning === 'object'
          ? {
              scopeChanges:
                'scopeChanges' in input.fetched.planning
                  ? (input.fetched.planning as { scopeChanges?: unknown }).scopeChanges
                  : null,
              dependencySignals:
                'dependencySignals' in input.fetched.planning
                  ? (input.fetched.planning as { dependencySignals?: unknown }).dependencySignals
                  : null,
              workload:
                'workload' in input.fetched.planning
                  ? (input.fetched.planning as { workload?: unknown }).workload
                  : null,
            }
          : null,
    },
  };
}

function buildCurrentViewReasoningTraceInputs(
  input: Parameters<FleetGraphReasoningService['reasonAboutCurrentView']>[0]
): Record<string, unknown> {
  return {
    activeViewRoute: input.activeViewRoute,
    question: input.question,
    questionTheme: input.questionTheme,
    workPersona: input.workPersona,
    pageContext: {
      kind: input.pageContext.kind,
      route: input.pageContext.route,
      title: input.pageContext.title,
      summary: input.pageContext.summary,
      emptyState: input.pageContext.emptyState,
      metrics: input.pageContext.metrics,
      items: input.pageContext.items.slice(0, 6),
      actions: (input.pageContext.actions ?? []).slice(0, 6),
    },
    deterministicDraft: input.deterministicDraft,
  };
}

function serializeTraceError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function finalizeReasoningTraceRun(
  runTree: RunTree | null,
  input: {
    outputs?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    error?: unknown;
  }
): Promise<void> {
  if (!runTree) {
    return;
  }

  await runTree.end(
    input.outputs,
    input.error ? serializeTraceError(input.error) : undefined,
    undefined,
    input.metadata
  );
  await runTree.patchRun();
}

async function executeReasoningRequest(
  apiKey: string,
  logger: FleetGraphLogger,
  input: {
    feature: 'fleetgraph_reasoning' | 'fleetgraph_current_view_reasoning';
    operation: 'fleetgraph.reasoning' | 'fleetgraph.current_view_reasoning';
    runName: 'fleetgraph.reasoning.model' | 'fleetgraph.current_view.model';
    tags: string[];
    systemPrompt: string;
    userPrompt: string;
    traceInputs: Record<string, unknown>;
    workPersona: string | null;
    options?: {
      runnableConfig?: RunnableConfig;
      traceMetadata?: Record<string, unknown>;
    };
  }
): Promise<FleetGraphReasoning | null> {
  const startedAt = Date.now();
  const reasoningRun = input.options?.runnableConfig
    ? RunTree.fromRunnableConfig(input.options.runnableConfig, {
        name: input.runName,
        run_type: 'llm',
        inputs: input.traceInputs,
        extra: {
          metadata: {
            feature: input.feature,
            ls_provider: 'openai',
            ls_model_name: getOpenAiModel(),
            ls_temperature: 0,
            ls_max_tokens: REASONING_MAX_TOKENS,
            ls_invocation_params: {
              response_format: 'json_schema',
            },
            ...(input.options?.traceMetadata ?? {}),
          },
        },
        tags: [
          'fleetgraph',
          'reasoning',
          'model',
          ...input.tags,
          input.workPersona ? `persona:${input.workPersona}` : 'persona:none',
        ],
      })
    : null;
  const span = startAiSpan({
    operation: input.operation,
    provider: 'openai',
    model: getOpenAiModel(),
    region: 'global',
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    maxTokens: REASONING_MAX_TOKENS,
  });

  await reasoningRun?.postRun();
  let reasoningTraceFinished = false;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        temperature: 0,
        max_tokens: REASONING_MAX_TOKENS,
        response_format: {
          type: 'json_schema',
          json_schema: reasoningJsonSchema,
        },
        messages: [
          {
            role: 'system',
            content: input.systemPrompt,
          },
          {
            role: 'user',
            content: input.userPrompt,
          },
        ],
      }),
    });

    const payload = (await response.json()) as Record<string, unknown>;
    const usage = extractUsage(payload);
    const usageMetadata = buildLangSmithUsageMetadata(payload);
    if (!response.ok) {
      const message =
        typeof payload.error === 'object' &&
        payload.error !== null &&
        typeof (payload.error as { message?: unknown }).message === 'string'
          ? (payload.error as { message: string }).message
          : `FleetGraph reasoning request failed with status ${response.status}`;
      finishAiSpan(span, {
        latencyMs: Date.now() - startedAt,
        usage,
        error: new Error(message),
        metadata: {
          feature: input.feature,
          response_status: response.status,
        },
      });
      await finalizeReasoningTraceRun(reasoningRun, {
        outputs: withUsageMetadata(
          {
            fallback: 'request_failure',
          },
          usageMetadata
        ),
        metadata: {
          response_status: response.status,
          ...(usageMetadata ? { usage_metadata: usageMetadata } : {}),
        },
        error: message,
      });
      reasoningTraceFinished = true;
      const enrichedError = new Error(message) as Error & {
        fleetgraphTelemetryFinished?: boolean;
      };
      enrichedError.fleetgraphTelemetryFinished = true;
      throw enrichedError;
    }

    const content = extractOpenAiContent(payload);
    if (!content) {
      logger.warn('FleetGraph reasoning response was empty; falling back', {
        feature: input.feature,
      });
      finishAiSpan(span, {
        latencyMs: Date.now() - startedAt,
        usage,
        responseText: null,
        metadata: {
          feature: input.feature,
          fallback: 'empty_response',
        },
      });
      await finalizeReasoningTraceRun(reasoningRun, {
        outputs: withUsageMetadata(
          {
            fallback: 'empty_response',
          },
          usageMetadata
        ),
        metadata: {
          response_status: response.status,
          ...(usageMetadata ? { usage_metadata: usageMetadata } : {}),
        },
      });
      reasoningTraceFinished = true;
      return null;
    }

    try {
      const parsed = reasoningSchema.parse(JSON.parse(stripCodeFences(content)));
      finishAiSpan(span, {
        latencyMs: Date.now() - startedAt,
        usage,
        responseText: content,
        metadata: {
          feature: input.feature,
          fallback: false,
        },
      });
      await finalizeReasoningTraceRun(reasoningRun, {
        outputs: withUsageMetadata(
          {
            parsed,
            response_text: content,
          },
          usageMetadata
        ),
        metadata: {
          response_status: response.status,
          fallback: false,
          ...(usageMetadata ? { usage_metadata: usageMetadata } : {}),
        },
      });
      reasoningTraceFinished = true;
      return parsed;
    } catch (error) {
      logger.warn('FleetGraph reasoning response could not be parsed; falling back', {
        feature: input.feature,
        message: error instanceof Error ? error.message : 'Unknown parse failure',
      });
      finishAiSpan(span, {
        latencyMs: Date.now() - startedAt,
        usage,
        responseText: content,
        error,
        metadata: {
          feature: input.feature,
          fallback: 'parse_failure',
        },
      });
      await finalizeReasoningTraceRun(reasoningRun, {
        outputs: withUsageMetadata(
          {
            fallback: 'parse_failure',
          },
          usageMetadata
        ),
        metadata: {
          response_status: response.status,
          ...(usageMetadata ? { usage_metadata: usageMetadata } : {}),
        },
        error,
      });
      reasoningTraceFinished = true;
      return null;
    }
  } catch (error) {
    if (
      !(
        error &&
        typeof error === 'object' &&
        'fleetgraphTelemetryFinished' in error &&
        (error as { fleetgraphTelemetryFinished?: boolean }).fleetgraphTelemetryFinished
      )
    ) {
      finishAiSpan(span, {
        latencyMs: Date.now() - startedAt,
        error,
        metadata: {
          feature: input.feature,
          fallback: 'request_failure',
        },
      });
    }
    if (!reasoningTraceFinished) {
      await finalizeReasoningTraceRun(reasoningRun, {
        outputs: {
          fallback: 'request_failure',
        },
        error,
      });
    }
    throw error;
  }
}

export function createFleetGraphReasoner(
  logger: FleetGraphLogger
): FleetGraphReasoningService | null {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return null;
  }

  return {
    async reasonAboutSprint(input, options): Promise<FleetGraphReasoning | null> {
      return executeReasoningRequest(apiKey, logger, {
        feature: 'fleetgraph_reasoning',
        operation: 'fleetgraph.reasoning',
        runName: 'fleetgraph.reasoning.model',
        tags: ['sprint'],
        systemPrompt: buildSprintSystemPrompt(),
        userPrompt: buildUserPrompt(input),
        traceInputs: buildSprintReasoningTraceInputs(input),
        workPersona: input.workPersona,
        options,
      });
    },
    async reasonAboutCurrentView(input, options): Promise<FleetGraphReasoning | null> {
      return executeReasoningRequest(apiKey, logger, {
        feature: 'fleetgraph_current_view_reasoning',
        operation: 'fleetgraph.current_view_reasoning',
        runName: 'fleetgraph.current_view.model',
        tags: ['current_view', `page_kind:${input.pageContext.kind}`],
        systemPrompt: buildCurrentViewSystemPrompt(),
        userPrompt: buildUserPrompt({
          question: input.question,
          questionTheme: input.questionTheme,
          workPersona: input.workPersona,
          pageContext: input.pageContext,
          deterministicDraft: input.deterministicDraft,
        }),
        traceInputs: buildCurrentViewReasoningTraceInputs(input),
        workPersona: input.workPersona,
        options,
      });
    },
  };
}
