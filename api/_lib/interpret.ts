import { InterpretRequest, InterpretResponse, MAX_INPUT_LENGTH, type ResponseSource } from '../../src/schemas/interpret.js';
import { cachedFloor, cachedIncantation } from '../../src/fallback/cache.js';
import { mockInterpret, type RawInterpretResponse } from './mock/interpreter.js';
import { callLlm, LlmError } from './llm/client.js';
import { resolveMode, type Env } from './env.js';
import { allowRequest } from './rateLimit.js';

export const TIMEOUT_MS = 8_000;

export interface InterpretOptions {
  env: Env;
  ip: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

/**
 * The one path every request takes, in both modes:
 * input cap → rate limit → (mock parser | LLM with one retry) → zod InterpretResponse → response.
 * Any failure ends in a cached item or an in-character reply; this function never throws.
 * The Arbiter then runs on the client on whatever Incantation comes back.
 */
export async function interpret(body: unknown, opts: InterpretOptions): Promise<InterpretResponse> {
  const cfg = resolveMode(opts.env);
  const log = opts.log ?? (() => {});
  if (cfg.note) log(cfg.note);

  const req = InterpretRequest.safeParse(body);
  if (!req.success || !req.data.text) {
    return finish({ intent: 'reply', reply: 'The Spire heard nothing. Speak, Incanter.' }, cfg.mode, 'mock');
  }
  const { text, context } = req.data;

  if (!allowRequest(opts.ip)) {
    log(`rate limit: ${opts.ip}`);
    return fromCache(text, context, cfg.mode, 'The Spire grows weary of your voice; it offers what it already knows.');
  }

  if (cfg.mode === 'mock') {
    return finish(mockInterpret(text, context ?? {}), 'mock', 'mock');
  }

  // LLM mode: one call, one retry on a parse failure or retryable error, then the cache.
  // One 8 s budget covers both attempts.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const deadline = controller.signal;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await callLlm({
          apiKey: cfg.apiKey ?? '',
          model: cfg.model,
          text: text.slice(0, MAX_INPUT_LENGTH),
          context,
          signal: deadline,
          ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        });
        const parsed = InterpretResponse.safeParse(raw);
        if (parsed.success) return { ...parsed.data, mode: 'llm', source: 'llm' };
        log(`attempt ${attempt}: response did not validate`);
      } catch (err) {
        const retryable = err instanceof LlmError ? err.retryable : !deadline.aborted;
        log(`attempt ${attempt}: ${err instanceof Error ? err.message : String(err)}`);
        if (!retryable || deadline.aborted) break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return fromCache(text, context, 'llm');
}

/** Pick a cached item of the kind the words suggest (the mock parser is a free classifier). */
function fromCache(
  text: string,
  context: InterpretRequest['context'],
  mode: 'mock' | 'llm',
  reply?: string,
): InterpretResponse {
  const guess = mockInterpret(text, context ?? {});
  const raw: RawInterpretResponse =
    guess.intent === 'build'
      ? { intent: 'build', floor: cachedFloor(text) }
      : guess.intent === 'forge'
        ? { intent: 'forge', incantation: cachedIncantation(text) }
        : guess;
  if (reply) raw.reply = reply;
  return finish(raw, mode, 'cache');
}

function finish(raw: unknown, mode: 'mock' | 'llm', source: ResponseSource): InterpretResponse {
  const parsed = InterpretResponse.safeParse(raw);
  const value = parsed.success ? parsed.data : { intent: 'reply' as const, reply: 'The Spire is silent.' };
  return { ...value, mode, source };
}
