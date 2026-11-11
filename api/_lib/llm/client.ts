import { SYSTEM_PROMPT } from './prompt.js';

/**
 * Raw HTTP call to the Claude Messages API (no SDK: its dependency tree includes a package outside
 * our licence allow-list). Returns the model's JSON object, or throws; the caller falls back.
 */
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 6000; // a 40-prop floor is ~3-4k tokens of JSON

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface LlmCall {
  apiKey: string;
  model: string;
  text: string;
  context?: { incantation?: unknown; floor?: unknown; storyContext?: string | undefined; characterDescription?: string | undefined } | undefined;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}

interface MessagesResponse {
  stop_reason?: string;
  content?: { type: string; text?: string }[];
}

export async function callLlm({ apiKey, model, text, context, signal, fetchImpl = fetch }: LlmCall): Promise<unknown> {
  const hasContext = context && (
    context.incantation !== undefined ||
    context.floor !== undefined ||
    context.storyContext ||
    context.characterDescription
  );
  const user = hasContext
    ? JSON.stringify({
        player: text,
        context: {
          incantation: context.incantation,
          floor: context.floor,
          ...(context.storyContext ? { story: context.storyContext } : {}),
          ...(context.characterDescription ? { characterDescription: context.characterDescription } : {}),
        },
      })
    : JSON.stringify({ player: text });

  const res = await fetchImpl(ANTHROPIC_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      // System prompt as a content block so cache_control attaches correctly to it.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      // NOTE: output_config.format with json_schema is intentionally omitted — the full
      // INTERPRET_JSON_SCHEMA exceeds Anthropic's grammar compilation limit and returns 400.
      // Instead we rely on the system prompt's JSON instruction + lenient Zod validation.
    }),
  });

  if (!res.ok) {
    // Log the response body in dev so API errors are visible.
    let detail = '';
    try { detail = ` — ${await res.text()}`; } catch { /* ignore */ }
    // 429 / 5xx / overloaded are worth one retry; 400 / 401 / 403 / 404 are not.
    throw new LlmError(`Anthropic API ${res.status}${detail}`, res.status === 429 || res.status >= 500);
  }
  const body = (await res.json()) as MessagesResponse;
  if (body.stop_reason === 'refusal') throw new LlmError('refusal', false);
  const textBlock = body.content?.find((b) => b.type === 'text')?.text;
  if (!textBlock) throw new LlmError('no text in response', true);
  try {
    return JSON.parse(textBlock);
  } catch {
    // e.g. stop_reason max_tokens cut the JSON short.
    throw new LlmError(`unparseable JSON (stop_reason ${body.stop_reason ?? 'unknown'})`, true);
  }
}

export interface TextCall {
  apiKey: string;
  model: string;
  system: string;
  /** Earlier turns (oldest first), then the new user message last. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  signal: AbortSignal;
  fetchImpl?: typeof fetch | undefined;
}

/**
 * A short plain-text reply (NPC conversation). Same raw-HTTP call as callLlm, without a JSON
 * schema. Returns the text, or throws; the caller falls back.
 */
export async function callClaudeText({ apiKey, model, system, messages, maxTokens, signal, fetchImpl = fetch }: TextCall): Promise<string> {
  const res = await fetchImpl(ANTHROPIC_URL, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = ` — ${await res.text()}`; } catch { /* ignore */ }
    throw new LlmError(`Anthropic API ${res.status}${detail}`, res.status === 429 || res.status >= 500);
  }
  const body = (await res.json()) as MessagesResponse;
  if (body.stop_reason === 'refusal') throw new LlmError('refusal', false);
  const text = body.content
    ?.filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  if (!text) throw new LlmError('no text in response', true);
  return text;
}
