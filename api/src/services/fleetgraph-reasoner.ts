import { z } from 'zod';
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

function buildSystemPrompt(): string {
  return [
    'You are FleetGraph, a project execution reasoning agent inside Ship.',
    'Use only the evidence you are given.',
    'Explain why the sprint is or is not at risk and, when relevant, whether the current evidence points more to scope drift, blocked work, dependency risk, workload pressure, staffing pressure, or overcommitment relative to recent delivery history.',
    'Prefer concise, grounded reasoning over generic management advice.',
    'For sprint reasoning, answerMode must be "execution".',
    'Return JSON only with keys: answerMode, summary, evidence, whyNow, recommendedNextStep, confidence.',
    'Do not invent facts, names, statuses, or blockers that are not in the evidence.',
  ].join(' ');
}

function buildUserPrompt(input: Parameters<FleetGraphReasoningService['reasonAboutSprint']>[0]): string {
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

export function createFleetGraphReasoner(
  logger: FleetGraphLogger
): FleetGraphReasoningService | null {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return null;
  }

  return {
    async reasonAboutSprint(input): Promise<FleetGraphReasoning | null> {
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(input);
      const startedAt = Date.now();
      const span = startAiSpan({
        operation: 'fleetgraph.reasoning',
        provider: 'openai',
        model: getOpenAiModel(),
        region: 'global',
        systemPrompt,
        userPrompt,
        maxTokens: REASONING_MAX_TOKENS,
      });

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
                content: systemPrompt,
              },
              {
                role: 'user',
                content: userPrompt,
              },
            ],
          }),
        });

        const payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          const message =
            typeof payload.error === 'object' &&
            payload.error !== null &&
            typeof (payload.error as { message?: unknown }).message === 'string'
              ? (payload.error as { message: string }).message
              : `FleetGraph reasoning request failed with status ${response.status}`;
          finishAiSpan(span, {
            latencyMs: Date.now() - startedAt,
            usage: extractUsage(payload),
            error: new Error(message),
            metadata: {
              feature: 'fleetgraph_reasoning',
              response_status: response.status,
            },
          });
          const enrichedError = new Error(message) as Error & {
            fleetgraphTelemetryFinished?: boolean;
          };
          enrichedError.fleetgraphTelemetryFinished = true;
          throw enrichedError;
        }

        const content = extractOpenAiContent(payload);
        if (!content) {
          logger.warn('FleetGraph reasoning response was empty; falling back');
          finishAiSpan(span, {
            latencyMs: Date.now() - startedAt,
            usage: extractUsage(payload),
            responseText: null,
            metadata: {
              feature: 'fleetgraph_reasoning',
              fallback: 'empty_response',
            },
          });
          return null;
        }

        try {
          const parsed = reasoningSchema.parse(JSON.parse(stripCodeFences(content)));
          finishAiSpan(span, {
            latencyMs: Date.now() - startedAt,
            usage: extractUsage(payload),
            responseText: content,
            metadata: {
              feature: 'fleetgraph_reasoning',
              fallback: false,
            },
          });
          return parsed;
        } catch (error) {
          logger.warn('FleetGraph reasoning response could not be parsed; falling back', {
            message: error instanceof Error ? error.message : 'Unknown parse failure',
          });
          finishAiSpan(span, {
            latencyMs: Date.now() - startedAt,
            usage: extractUsage(payload),
            responseText: content,
            error,
            metadata: {
              feature: 'fleetgraph_reasoning',
              fallback: 'parse_failure',
            },
          });
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
              feature: 'fleetgraph_reasoning',
              fallback: 'request_failure',
            },
          });
        }
        throw error;
      }
    },
  };
}
