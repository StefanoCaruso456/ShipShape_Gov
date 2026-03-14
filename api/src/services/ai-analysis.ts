/**
 * AI-powered plan and retro quality analysis.
 *
 * Provides two analysis functions:
 * - analyzePlan: Evaluates weekly plan items for falsifiability and workload
 * - analyzeRetro: Compares retro against plan for coverage and evidence
 *
 * Provider selection:
 * - OpenAI direct API when OPENAI_API_KEY or OPEN_API_KEY is configured
 * - AWS Bedrock (Claude Opus 4.5) otherwise
 *
 * Gracefully degrades when no configured provider is available.
 */

import { createHash } from 'crypto';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { extractText } from '../utils/document-content.js';
import { estimateAiCost, finishAiSpan, startAiSpan, type AiUsageMetrics } from './ai-telemetry.js';

const BEDROCK_MODEL_ID = 'global.anthropic.claude-opus-4-5-20251101-v1:0';
const BEDROCK_REGION = 'us-east-1';
const OPENAI_MODEL = 'gpt-4.1-mini';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Lazy-initialize client (fails gracefully if AWS credentials unavailable)
let bedrockClient: BedrockRuntimeClient | null = null;
let clientInitFailed = false;

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getOpenAiApiKey(): string | undefined {
  return getEnv('OPENAI_API_KEY') ?? getEnv('OPEN_API_KEY');
}

function getOpenAiModel(): string {
  return getEnv('OPENAI_MODEL') ?? OPENAI_MODEL;
}

function getClient(): BedrockRuntimeClient | null {
  if (clientInitFailed) return null;
  if (bedrockClient) return bedrockClient;

  try {
    bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
    return bedrockClient;
  } catch (err) {
    console.warn('Failed to initialize Bedrock client:', err);
    clientInitFailed = true;
    return null;
  }
}

// Simple in-memory rate limiter with periodic cleanup
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 120; // max requests per hour per user (polling every 5s, but only analyzes on content change)
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms
const MAX_CONTENT_TEXT_LENGTH = 50_000; // 50KB max extracted text sent to the AI provider

// Periodically clean up expired entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now >= entry.resetAt) rateLimits.delete(key);
  }
}, 10 * 60 * 1000); // Clean every 10 minutes

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);

  if (!entry || now >= entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

/** Extract individual plan items from TipTap JSON content */
function extractPlanItems(content: unknown): string[] {
  if (!content || typeof content !== 'object') return [];
  const doc = content as { content?: unknown[] };
  if (!Array.isArray(doc.content)) return [];

  const items: string[] = [];

  function walkNodes(nodes: unknown[]) {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const n = node as { type?: string; content?: unknown[] };

      // Extract text from list items and paragraphs (plan items)
      if (n.type === 'listItem' || n.type === 'taskItem') {
        const text = extractText(n).trim();
        if (text) items.push(text);
      } else if (n.type === 'paragraph' && !isHeading(node)) {
        const text = extractText(n).trim();
        if (text && text.length > 10) items.push(text); // Skip short fragments
      }

      // Recurse into container nodes (but not into already-captured list items)
      if (n.content && n.type !== 'listItem' && n.type !== 'taskItem') {
        walkNodes(n.content);
      }
    }
  }

  function isHeading(node: unknown): boolean {
    if (!node || typeof node !== 'object') return false;
    return (node as { type?: string }).type === 'heading';
  }

  walkNodes(doc.content);
  return items;
}

// Analysis result types
export interface PlanItemAnalysis {
  text: string;
  score: number; // 0-1 falsifiability score
  feedback: string;
  issues: string[];
  conciseness_score?: number; // 0-1, penalizes verbose items
  is_verbose?: boolean;
  conciseness_feedback?: string;
}

export interface PlanAnalysisResult {
  overall_score: number; // 0-1
  items: PlanItemAnalysis[];
  workload_assessment: 'light' | 'moderate' | 'heavy' | 'excessive';
  workload_feedback: string;
  content_hash?: string; // SHA-256 of input content for cache invalidation
}

export interface RetroItemAnalysis {
  plan_item: string;
  addressed: boolean;
  has_evidence: boolean;
  feedback: string;
}

export interface RetroAnalysisResult {
  overall_score: number; // 0-1
  plan_coverage: RetroItemAnalysis[];
  suggestions: string[];
  content_hash?: string; // SHA-256 of input content for cache invalidation
}

export type AnalysisError = { error: string };

/** Compute SHA-256 hash of content for cache invalidation */
function computeContentHash(content: unknown): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

const PLAN_SYSTEM_PROMPT = `You are an AI assistant that evaluates weekly work plans for government employees.

Your job is to assess each plan item on THREE dimensions:
1. **Verifiability (score 0-1)**: Can an independent observer determine whether this item was completed by examining evidence? A score of 1.0 means the item has a clear, measurable deliverable. A score of 0.0 means it's completely vague.
2. **Conciseness (conciseness_score 0-1)**: Is the item stated concisely as a falsifiable deliverable? A score of 1.0 means it's a crisp 1-sentence deliverable. A score of 0.0 means it's a rambling multi-paragraph description.
3. **Workload**: Is the overall plan a reasonable amount of work for a full-time employee's week?

Key criteria for a good plan item:
- It produces a specific, tangible deliverable (document, report, shipped feature, completed calls)
- It has a clear definition of done
- Someone unfamiliar with the work could verify completion
- It is stated in 1-2 SHORT sentences maximum — just the deliverable, not a detailed description of how

Conciseness rules (IMPORTANT):
- A plan item should be a SINGLE falsifiable statement: "Ship the login page with OAuth integration"
- NOT a paragraph: "I plan to work on the login page. This will involve setting up OAuth, configuring the redirect URIs, testing with multiple providers, and deploying to staging."
- If an item is more than ~30 words, it's probably too verbose. Penalize the conciseness_score.
- If an item contains multiple sentences describing process/method rather than outcome, set is_verbose=true
- The overall_score should factor in conciseness: verbose items should drag down the overall score even if they're verifiable

Common problems:
- Activities instead of outcomes: "meet with", "coordinate with", "work on" describe what you'll DO, not what you'll PRODUCE
- Vague scope: "improve X", "investigate Y" have no definition of done
- Too verbose: describing HOW you'll do something instead of WHAT you'll deliver
- Too little work: "take 5 calls" in a week is light for a full-time employee

Workload assessment:
- "light": Fewer than 3 significant items or items that represent less than a full week of work
- "moderate": 3-5 significant items representing a solid week of work
- "heavy": More than 5 significant items or items that are very ambitious
- "excessive": Unrealistically large amount of work

Respond ONLY with valid JSON matching this exact structure:
{
  "overall_score": <0-1 average of item scores, factoring in conciseness>,
  "items": [
    {
      "text": "<the plan item text>",
      "score": <0-1 verifiability>,
      "feedback": "<specific, actionable feedback>",
      "issues": ["<issue tag: not_falsifiable, no_deliverable, too_vague, too_verbose, too_light, etc>"],
      "conciseness_score": <0-1>,
      "is_verbose": <true/false>,
      "conciseness_feedback": "<specific feedback about conciseness, or empty string if concise>"
    }
  ],
  "workload_assessment": "<light|moderate|heavy|excessive>",
  "workload_feedback": "<brief assessment of overall workload>"
}`;

const RETRO_SYSTEM_PROMPT = `You are an AI assistant that evaluates weekly retrospectives for government employees.

If plan items are provided, compare the retro against the plan:
1. **Plan coverage**: Is each plan item addressed in the retro?
2. **Evidence**: For completed items, is there evidence of completion (links, screenshots, specific results, or the deliverable itself)?
3. **Gap explanations**: For incomplete items, is there an explanation of what happened?

If NO plan items are provided, evaluate the retro on its own quality:
1. **Specificity**: Does the retro describe specific deliverables with concrete outcomes, or is it vague ("did some stuff")?
2. **Evidence**: Does the retro include proof of work (links, documents, metrics, screenshots)?
3. **Substance**: Does the retro represent a meaningful week of work?

Key criteria for ALL retros:
- Vague statements like "did some stuff", "worked on things", "made progress" are UNACCEPTABLE and should score very low (0.1-0.2)
- Completed items need evidence (link, screenshot, specific result, or embedded deliverable)
- Each item should be specific enough that a manager can verify it was done
- "Coordinate with team" or "had meetings" are activities, not deliverables — they score low

Respond ONLY with valid JSON matching this exact structure:
{
  "overall_score": <0-1>,
  "plan_coverage": [
    {
      "plan_item": "<text from the plan, or the retro item itself if no plan>",
      "addressed": <true/false>,
      "has_evidence": <true/false>,
      "feedback": "<specific feedback>"
    }
  ],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"]
}`;

async function callBedrock(
  operation: 'shipshape.ai.analyze-plan' | 'shipshape.ai.analyze-retro',
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const startedAt = Date.now();
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
  });

  const span = startAiSpan({
    operation,
    provider: 'aws-bedrock',
    model: BEDROCK_MODEL_ID,
    region: BEDROCK_REGION,
    systemPrompt,
    userPrompt,
    maxTokens: 2048,
  });

  const command = new InvokeModelCommand({
    modelId: BEDROCK_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  });

  try {
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as Record<string, unknown>;
    const usage = estimateAiCost(extractBedrockUsage(responseBody), 'aws-bedrock', BEDROCK_MODEL_ID);
    const responseText = extractResponseText(responseBody);

    finishAiSpan(span, {
      responseText,
      usage,
      latencyMs: Date.now() - startedAt,
      metadata: {
        request_id: response.$metadata.requestId,
        stop_reason: getStringProperty(responseBody, 'stop_reason'),
      },
    });

    return responseText;
  } catch (error) {
    finishAiSpan(span, {
      latencyMs: Date.now() - startedAt,
      error,
      metadata: {
        model: BEDROCK_MODEL_ID,
      },
    });
    throw error;
  }
}

async function callOpenAi(
  operation: 'shipshape.ai.analyze-plan' | 'shipshape.ai.analyze-retro',
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;

  const model = getOpenAiModel();
  const startedAt = Date.now();
  const span = startAiSpan({
    operation,
    provider: 'openai',
    model,
    region: 'global',
    systemPrompt,
    userPrompt,
    maxTokens: 2048,
  });

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    const responseBody = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const errorMessage = isRecord(responseBody.error)
        ? getStringProperty(responseBody.error, 'message')
        : undefined;
      throw new Error(errorMessage ?? `OpenAI request failed with status ${response.status}`);
    }

    const responseText = extractOpenAiResponseText(responseBody);
    const usage = estimateAiCost(extractOpenAiUsage(responseBody), 'openai', model);

    finishAiSpan(span, {
      responseText,
      usage,
      latencyMs: Date.now() - startedAt,
      metadata: {
        request_id: response.headers.get('x-request-id') ?? getStringProperty(responseBody, 'id'),
        finish_reason: extractOpenAiFinishReason(responseBody),
      },
    });

    return responseText;
  } catch (error) {
    finishAiSpan(span, {
      latencyMs: Date.now() - startedAt,
      error,
      metadata: {
        model,
      },
    });
    throw error;
  }
}

async function callAiProvider(
  operation: 'shipshape.ai.analyze-plan' | 'shipshape.ai.analyze-retro',
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  if (getOpenAiApiKey()) {
    return callOpenAi(operation, systemPrompt, userPrompt);
  }

  return callBedrock(operation, systemPrompt, userPrompt);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getNumberProperty(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getStringProperty(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractResponseText(responseBody: Record<string, unknown>): string | null {
  const content = responseBody.content;
  if (!Array.isArray(content)) return null;

  const textParts = content
    .filter(isRecord)
    .map((item) => getStringProperty(item, 'text'))
    .filter((text): text is string => Boolean(text));

  if (textParts.length === 0) return null;

  const responseText = textParts.join('\n').trim();
  return responseText || null;
}

function extractBedrockUsage(responseBody: Record<string, unknown>): AiUsageMetrics {
  if (!isRecord(responseBody.usage)) {
    return {};
  }

  const usage = responseBody.usage;
  const promptTokens = getNumberProperty(usage, 'input_tokens');
  const completionTokens = getNumberProperty(usage, 'output_tokens');
  const promptCachedTokens = getNumberProperty(usage, 'cache_read_input_tokens');
  const promptCacheCreationTokens = getNumberProperty(usage, 'cache_creation_input_tokens');

  const totalPromptTokens =
    (promptTokens ?? 0) + (promptCachedTokens ?? 0) + (promptCacheCreationTokens ?? 0);
  const totalTokens =
    totalPromptTokens > 0 || completionTokens !== undefined
      ? totalPromptTokens + (completionTokens ?? 0)
      : undefined;

  return {
    promptTokens,
    promptCachedTokens,
    promptCacheCreationTokens,
    completionTokens,
    totalTokens,
  };
}

function extractOpenAiResponseText(responseBody: Record<string, unknown>): string | null {
  const choices = responseBody.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const firstChoice = choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return null;

  const content = firstChoice.message.content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed || null;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .filter(isRecord)
      .map(item => getStringProperty(item, 'text'))
      .filter((text): text is string => Boolean(text));
    if (textParts.length > 0) {
      return textParts.join('\n').trim() || null;
    }
  }

  return null;
}

function extractOpenAiFinishReason(responseBody: Record<string, unknown>): string | undefined {
  const choices = responseBody.choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;

  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) return undefined;
  return getStringProperty(firstChoice, 'finish_reason');
}

function extractOpenAiUsage(responseBody: Record<string, unknown>): AiUsageMetrics {
  if (!isRecord(responseBody.usage)) {
    return {};
  }

  const usage = responseBody.usage;
  const promptTokens = getNumberProperty(usage, 'prompt_tokens');
  const completionTokens = getNumberProperty(usage, 'completion_tokens');
  const totalTokens = getNumberProperty(usage, 'total_tokens');

  let promptCachedTokens: number | undefined;
  if (isRecord(usage.prompt_tokens_details)) {
    promptCachedTokens = getNumberProperty(usage.prompt_tokens_details, 'cached_tokens');
  }

  return {
    promptTokens,
    promptCachedTokens,
    completionTokens,
    totalTokens,
  };
}

/**
 * Analyze a weekly plan for quality (falsifiability and workload).
 */
export async function analyzePlan(content: unknown): Promise<PlanAnalysisResult | AnalysisError> {
  const contentHash = computeContentHash(content);
  const planItems = extractPlanItems(content);

  if (planItems.length === 0) {
    return {
      overall_score: 0,
      items: [],
      workload_assessment: 'light',
      workload_feedback: 'No plan items found. Add specific, verifiable deliverables for your week.',
      content_hash: contentHash,
    };
  }

  // Limit content size to prevent cost amplification
  const itemsText = planItems.map((item, i) => `${i + 1}. ${item}`).join('\n');
  if (itemsText.length > MAX_CONTENT_TEXT_LENGTH) {
    return { error: 'content_too_large' };
  }

  const userPrompt = `Analyze this weekly plan. Here are the plan items:\n\n${itemsText}`;

  try {
    const responseText = await callAiProvider('shipshape.ai.analyze-plan', PLAN_SYSTEM_PROMPT, userPrompt);
    if (!responseText) {
      return { error: 'ai_unavailable' };
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/) || responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { error: 'ai_parse_error' };
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const result = JSON.parse(jsonStr) as PlanAnalysisResult;

    // Validate and clamp scores
    result.overall_score = Math.max(0, Math.min(1, result.overall_score || 0));
    for (const item of result.items) {
      item.score = Math.max(0, Math.min(1, item.score || 0));
    }

    result.content_hash = contentHash;
    return result;
  } catch (err) {
    console.error('Plan analysis error:', err);
    return { error: 'ai_unavailable' };
  }
}

/**
 * Analyze a weekly retro against its plan for coverage and evidence.
 */
export async function analyzeRetro(
  retroContent: unknown,
  planContent: unknown
): Promise<RetroAnalysisResult | AnalysisError> {
  const contentHash = computeContentHash({ retro_content: retroContent, plan_content: planContent });
  const planItems = extractPlanItems(planContent);
  const retroText = extractText(retroContent);

  if (!retroText.trim()) {
    return {
      overall_score: 0,
      plan_coverage: planItems.map(item => ({
        plan_item: item,
        addressed: false,
        has_evidence: false,
        feedback: 'This plan item is not addressed in the retro.',
      })),
      suggestions: ['Your retro is empty. Address each item from your plan.'],
      content_hash: contentHash,
    };
  }

  // Limit content size to prevent cost amplification
  const planItemsText = planItems.length > 0
    ? planItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : '';
  const totalLength = planItemsText.length + retroText.length;
  if (totalLength > MAX_CONTENT_TEXT_LENGTH) {
    return { error: 'content_too_large' };
  }

  const userPrompt = planItems.length > 0
    ? `Compare this weekly retro against the plan.\n\nPLAN ITEMS:\n${planItemsText}\n\nRETRO CONTENT:\n${retroText}`
    : `Evaluate this weekly retro for quality. No plan was found for comparison, so evaluate the retro items on their own specificity, evidence, and substance.\n\nRETRO CONTENT:\n${retroText}`;

  try {
    const responseText = await callAiProvider('shipshape.ai.analyze-retro', RETRO_SYSTEM_PROMPT, userPrompt);
    if (!responseText) {
      return { error: 'ai_unavailable' };
    }

    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/) || responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { error: 'ai_parse_error' };
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const result = JSON.parse(jsonStr) as RetroAnalysisResult;
    result.overall_score = Math.max(0, Math.min(1, result.overall_score || 0));
    result.content_hash = contentHash;

    return result;
  } catch (err) {
    console.error('Retro analysis error:', err);
    return { error: 'ai_unavailable' };
  }
}

/** Check if any configured AI provider is available (for UI to decide whether to render quality assistant) */
export function isAiAvailable(): boolean {
  return Boolean(getOpenAiApiKey()) || getClient() !== null;
}

export { checkRateLimit };
