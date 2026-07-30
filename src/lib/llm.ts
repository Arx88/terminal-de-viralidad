// ─────────────────────────────────────────────────────────────────────────
// LLM integration — NVIDIA NIM API (nemotron-3-ultra-550b-a55b)
//
// This is the real intelligence layer. Every agent calls these functions
// to reason about its task in natural language (Spanish, rioplatense).
//
// The model has reasoning_content (chain-of-thought) that we expose for
// transparency — the user can see WHY each agent decided what it decided.
// ─────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';

const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
// Use llama-3.1-70b-instruct — fast, JSON-reliable, no reasoning mode issues.
// nemotron models spend all tokens in reasoning_content and timeout.
// llama-3.3-70b-instruct is slow and unreliable for JSON.
const NIM_MODEL = process.env.NIM_MODEL || 'meta/llama-3.1-70b-instruct';

let client: OpenAI | null = null;
// Global LLM mutex — serialize all NIM calls to avoid saturation timeouts
let llm_queue: Array<() => void> = [];
let llm_running = false;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY;
    if (!apiKey) {
      throw new Error('NVIDIA_API_KEY not set in environment');
    }
    client = new OpenAI({
      apiKey,
      baseURL: NIM_BASE_URL,
      timeout: 90_000,
      maxRetries: 2,
    });
  }
  return client;
}

async function withLlmLock<T>(fn: () => Promise<T>): Promise<T> {
  // Wait for previous LLM call to finish
  if (llm_running) {
    await new Promise<void>(resolve => llm_queue.push(resolve));
  }
  llm_running = true;
  try {
    return await fn();
  } finally {
    llm_running = false;
    const next = llm_queue.shift();
    if (next) next();
  }
}

export interface LLMResponse {
  content: string;
  reasoning: string;       // chain-of-thought visible
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latency_ms: number;
}

/**
 * Low-level call to Nemotron. Returns content + reasoning.
 * temperature: 0.3 default (deterministic-ish but still creative).
 * max_tokens: 1500 default — enough for structured JSON + reasoning.
 */
export async function llm(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; max_tokens?: number; json_mode?: boolean } = {}
): Promise<LLMResponse> {
  const start = Date.now();

  return withLlmLock(async () => {
    const c = getClient();

    const completion = await c.chat.completions.create({
      model: NIM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.max_tokens ?? 2000,
      // NIM supports response_format for JSON mode
      ...(opts.json_mode ? { response_format: { type: 'json_object' as const } } : {}),
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error('NIM returned no choices');
    }

    const msg: any = choice.message;
    return {
      content: msg.content ?? '',
      reasoning: msg.reasoning_content ?? '',
      usage: completion.usage as any,
      latency_ms: Date.now() - start,
    };
  });
}

/**
 * Same as llm() but parses JSON from the response.
 * Falls back to extracting JSON from code fences if present.
 */
export async function llmJson<T = unknown>(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; max_tokens?: number } = {}
): Promise<{ data: T; raw: LLMResponse }> {
  const raw = await llm(
    systemPrompt + '\n\nRespondé con JSON válido únicamente. Sin markdown, sin explicaciones, sin code fences. Solo el objeto JSON.',
    userMessage,
    { ...opts, json_mode: true }
  );

  let data: T;
  try {
    data = JSON.parse(raw.content) as T;
  } catch {
    // Try to extract JSON from code fences or surrounding text
    const jsonMatch = raw.content.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.content.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        data = JSON.parse(jsonMatch[1]) as T;
      } catch (e: any) {
        throw new Error(`Failed to parse JSON from LLM response: ${e.message}\nContent: ${raw.content.slice(0, 500)}`);
      }
    } else {
      throw new Error(`LLM response was not valid JSON. Content: ${raw.content.slice(0, 500)}`);
    }
  }

  return { data, raw };
}

/**
 * Same as llmJson but returns null on failure instead of throwing.
 * Use this in agents so the loop doesn't break when LLM is saturated.
 */
export async function llmJsonSafe<T = unknown>(
  systemPrompt: string,
  userMessage: string,
  opts: { temperature?: number; max_tokens?: number } = {}
): Promise<{ data: T | null; raw: LLMResponse | null; error?: string }> {
  try {
    const result = await llmJson<T>(systemPrompt, userMessage, opts);
    return { data: result.data, raw: result.raw };
  } catch (err: any) {
    console.error(`[llm] llmJsonSafe failed: ${err.message.slice(0, 100)}`);
    return { data: null, raw: null, error: err.message };
  }
}

/**
 * Quick health check — used at boot to verify the API key.
 */
export async function llmHealthCheck(): Promise<{ ok: boolean; latency_ms: number; model: string; error?: string }> {
  const start = Date.now();
  try {
    const c = getClient();
    const completion = await c.chat.completions.create({
      model: NIM_MODEL,
      messages: [{ role: 'user', content: 'Responde solo: PONG' }],
      max_tokens: 20,
      temperature: 0,
    });
    const content = completion.choices[0]?.message?.content ?? '';
    return {
      ok: content.length > 0,
      latency_ms: Date.now() - start,
      model: NIM_MODEL,
    };
  } catch (err: any) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      model: NIM_MODEL,
      error: err.message,
    };
  }
}

export const NIM_CONFIG = {
  baseUrl: NIM_BASE_URL,
  model: NIM_MODEL,
};
