import { createHash } from 'crypto';
import { initLogger, type Logger, type Span } from 'braintrust';

const DEFAULT_BRAINTRUST_PROJECT = 'Shipshape';
const PROMPT_PREVIEW_MAX_LENGTH = 2_000;

export interface AiUsageMetrics {
  promptTokens?: number;
  promptCachedTokens?: number;
  promptCacheCreationTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  pricingSource?: string;
}

interface StartAiSpanArgs {
  operation: string;
  provider: 'aws-bedrock' | 'openai';
  model: string;
  region: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}

interface FinishAiSpanArgs {
  responseText?: string | null;
  usage?: AiUsageMetrics;
  latencyMs: number;
  metadata?: Record<string, unknown>;
  error?: unknown;
}

let braintrustLogger: Logger<true> | null | undefined;
let loggedInitFailure = false;
let loggedInvalidPricing = false;
const OPENAI_DEFAULT_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function isPromptLoggingEnabled(): boolean {
  const value = getEnv('BRAINTRUST_LOG_PROMPTS');
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function previewText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= PROMPT_PREVIEW_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, PROMPT_PREVIEW_MAX_LENGTH)}...`;
}

function parseUsdPerMillion(name: string): number | undefined {
  const rawValue = getEnv(name);
  if (!rawValue) return undefined;

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) {
    if (!loggedInvalidPricing) {
      console.warn(
        `Ignoring invalid ${name} value "${rawValue}". Expected a non-negative number in USD per 1M tokens.`
      );
      loggedInvalidPricing = true;
    }
    return undefined;
  }

  return value;
}

function getPricingConfig(
  provider: 'aws-bedrock' | 'openai',
  model: string
): { inputCostPerMillion?: number; outputCostPerMillion?: number; pricingSource?: string } {
  if (provider === 'openai') {
    const inputCostPerMillion = parseUsdPerMillion('OPENAI_INPUT_COST_PER_MILLION_USD');
    const outputCostPerMillion = parseUsdPerMillion('OPENAI_OUTPUT_COST_PER_MILLION_USD');
    if (inputCostPerMillion !== undefined && outputCostPerMillion !== undefined) {
      return { inputCostPerMillion, outputCostPerMillion, pricingSource: 'env' };
    }

    const defaultPricing = OPENAI_DEFAULT_MODEL_PRICING[model];
    if (defaultPricing) {
      return {
        inputCostPerMillion: defaultPricing.input,
        outputCostPerMillion: defaultPricing.output,
        pricingSource: 'openai-default',
      };
    }

    return {};
  }

  return {
    inputCostPerMillion: parseUsdPerMillion('BEDROCK_INPUT_COST_PER_MILLION_USD'),
    outputCostPerMillion: parseUsdPerMillion('BEDROCK_OUTPUT_COST_PER_MILLION_USD'),
    pricingSource: 'env',
  };
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: String(error) };
}

function buildInputPayload(systemPrompt: string, userPrompt: string, maxTokens: number): Record<string, unknown> {
  if (isPromptLoggingEnabled()) {
    return {
      system: previewText(systemPrompt),
      messages: [
        {
          role: 'user',
          content: previewText(userPrompt),
        },
      ],
      max_tokens: maxTokens,
    };
  }

  return {
    system_sha256: hashText(systemPrompt),
    user_sha256: hashText(userPrompt),
    system_length: systemPrompt.length,
    user_length: userPrompt.length,
    max_tokens: maxTokens,
    prompt_logging_enabled: false,
  };
}

function buildOutputPayload(responseText: string | null | undefined): unknown {
  if (!responseText) return null;

  if (isPromptLoggingEnabled()) {
    return previewText(responseText);
  }

  return {
    response_sha256: hashText(responseText),
    response_length: responseText.length,
    prompt_logging_enabled: false,
  };
}

function getBraintrustLogger(): Logger<true> | null {
  const apiKey = getEnv('BRAINTRUST_API_KEY');
  if (!apiKey) return null;

  if (braintrustLogger !== undefined) {
    return braintrustLogger;
  }

  try {
    braintrustLogger = initLogger({
      apiKey,
      projectName: getEnv('BRAINTRUST_PROJECT') ?? DEFAULT_BRAINTRUST_PROJECT,
      orgName: getEnv('BRAINTRUST_ORG_NAME'),
      appUrl: getEnv('BRAINTRUST_APP_URL'),
      asyncFlush: true,
    });
  } catch (error) {
    braintrustLogger = null;
    if (!loggedInitFailure) {
      console.error('Failed to initialize Braintrust logger:', error);
      loggedInitFailure = true;
    }
  }

  return braintrustLogger;
}

export function estimateAiCost(
  usage: AiUsageMetrics,
  provider: 'aws-bedrock' | 'openai',
  model: string
): AiUsageMetrics {
  const { inputCostPerMillion, outputCostPerMillion, pricingSource } = getPricingConfig(provider, model);

  const promptTokens =
    (usage.promptTokens ?? 0) +
    (usage.promptCachedTokens ?? 0) +
    (usage.promptCacheCreationTokens ?? 0);
  const completionTokens = usage.completionTokens ?? 0;

  const totalTokens =
    usage.totalTokens ??
    (promptTokens > 0 || completionTokens > 0 ? promptTokens + completionTokens : undefined);

  const result: AiUsageMetrics = {
    ...usage,
    totalTokens,
  };

  if (
    inputCostPerMillion !== undefined &&
    outputCostPerMillion !== undefined &&
    totalTokens !== undefined
  ) {
    result.estimatedCostUsd =
      (promptTokens / 1_000_000) * inputCostPerMillion +
      (completionTokens / 1_000_000) * outputCostPerMillion;
    result.pricingSource = pricingSource;
  }

  return result;
}

export function startAiSpan(args: StartAiSpanArgs): Span | null {
  const logger = getBraintrustLogger();
  if (!logger) return null;

  try {
    return logger.startSpan({
      name: args.operation,
      type: 'llm',
      spanAttributes: {
        provider: args.provider,
        model: args.model,
        region: args.region,
      },
      event: {
        input: buildInputPayload(args.systemPrompt, args.userPrompt, args.maxTokens),
        metadata: {
          provider: args.provider,
          model: args.model,
          region: args.region,
          prompt_logging_enabled: isPromptLoggingEnabled(),
        },
      },
    });
  } catch (error) {
    console.error('Failed to start Braintrust span:', error);
    return null;
  }
}

export function finishAiSpan(span: Span | null, args: FinishAiSpanArgs): void {
  if (!span) return;

  try {
    const metrics: Record<string, number> = {
      latency_ms: args.latencyMs,
    };

    if (args.usage?.promptTokens !== undefined) {
      metrics.prompt_tokens = args.usage.promptTokens;
    }
    if (args.usage?.promptCachedTokens !== undefined) {
      metrics.prompt_cached_tokens = args.usage.promptCachedTokens;
    }
    if (args.usage?.promptCacheCreationTokens !== undefined) {
      metrics.prompt_cache_creation_tokens = args.usage.promptCacheCreationTokens;
    }
    if (args.usage?.completionTokens !== undefined) {
      metrics.completion_tokens = args.usage.completionTokens;
    }
    if (args.usage?.totalTokens !== undefined) {
      metrics.tokens = args.usage.totalTokens;
    }
    if (args.usage?.estimatedCostUsd !== undefined) {
      metrics.estimated_cost = args.usage.estimatedCostUsd;
    }

    span.log({
      output: buildOutputPayload(args.responseText),
      error: args.error ? serializeError(args.error) : undefined,
      metadata: {
        ...args.metadata,
        pricing_source: args.usage?.pricingSource,
      },
      metrics,
    });
  } catch (error) {
    console.error('Failed to record Braintrust span data:', error);
  } finally {
    try {
      span.close();
    } catch (error) {
      console.error('Failed to close Braintrust span:', error);
    }
  }
}
