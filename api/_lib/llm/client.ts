import { INTERPRET_JSON_SCHEMA } from './wireSchema.js';
import { SYSTEM_PROMPT } from './prompt.js';

/**
 * Raw HTTP call to the Claude Messages API (no SDK: its dependency tree includes a package outside
 * our licence allow-list). Returns the model's JSON object, or throws; the caller falls back.
 */
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2026-10-21';
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
  context?: { incantation?: unknown; floor?: unknown } | undefined;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}

interface MessagesResponse {
  stop_reason?: string;
  content?: { type: string; text?: string }[];
}

export async function callLlm({ apiKey, model, text, context, signal, fetchImpl = fetch }: LlmCall): Promise<unknown> {
  const user = context && (context.incantation !== undefined || context.floor !== undefined)
    ? JSON.stringify({ player: text, context })
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
      // Stable system prompt first so it can be cached across requests.
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
      // Low effort for latency (Forge < 6 s p90). Sampling parameters are not accepted by current models.
      // No `thinking` field: several current models reject `disabled`, and LLM_MODEL can change.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: INTERPRET_JSON_SCHEMA } },
    }),
  });

  if (!res.ok) {
    // 429 / 5xx / overloaded are worth one retry; 400 / 401 / 403 / 404 are not.
    throw new LlmError(`Anthropic API ${res.status}`, res.status === 429 || res.status >= 500);
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
