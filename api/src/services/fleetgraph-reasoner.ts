import { z } from 'zod';
import type { FleetGraphReasoningService, FleetGraphReasoning, FleetGraphLogger } from '@ship/fleetgraph';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

const reasoningSchema = z.object({
  summary: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1).max(6),
  whyNow: z.string().nullable(),
  recommendedNextStep: z.string().nullable(),
  confidence: z.enum(['low', 'medium', 'high']),
});

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
    'Explain why the sprint is or is not at risk.',
    'Prefer concise, grounded reasoning over generic management advice.',
    'Return JSON only with keys: summary, evidence, whyNow, recommendedNextStep, confidence.',
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

export function createFleetGraphReasoner(
  logger: FleetGraphLogger
): FleetGraphReasoningService | null {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return null;
  }

  return {
    async reasonAboutSprint(input): Promise<FleetGraphReasoning | null> {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: getOpenAiModel(),
          temperature: 0,
          max_tokens: 600,
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(),
            },
            {
              role: 'user',
              content: buildUserPrompt(input),
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
        throw new Error(message);
      }

      const content = extractOpenAiContent(payload);
      if (!content) {
        logger.warn('FleetGraph reasoning response was empty; falling back');
        return null;
      }

      try {
        return reasoningSchema.parse(JSON.parse(stripCodeFences(content)));
      } catch (error) {
        logger.warn('FleetGraph reasoning response could not be parsed; falling back', {
          message: error instanceof Error ? error.message : 'Unknown parse failure',
        });
        return null;
      }
    },
  };
}
