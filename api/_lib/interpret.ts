import { InterpretRequest, InterpretResponse, MAX_INPUT_LENGTH, type ResponseSource } from '../../src/schemas/interpret.js';
import { fallbackResponse, type FallbackReason } from '../../src/fallback/fallback.js';
import { mockInterpret } from './mock/interpreter.js';
import { callLlm, LlmError } from './llm/client.js';
import { resolveMode, type Env } from './env.js';
import { allowRequest } from './rateLimit.js';

export const TIMEOUT_MS = 300_000;

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
    return fromCache(text, context, cfg.mode, 'rate-limit');
  }

  if (cfg.mode === 'mock') {
    return finish(mockInterpret(text, context ?? {}), 'mock', 'mock');
  }

  log(`llm mode: calling Claude model=${cfg.model} for: "${text.slice(0, 60)}"`);
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
        log(`attempt ${attempt}: got raw response, validating…`);
        const parsed = InterpretResponse.safeParse(raw);
        if (parsed.success) {
          log(`attempt ${attempt}: validated OK, intent=${parsed.data.intent}`);
          return { ...parsed.data, mode: 'llm', source: 'llm' };
        }
        log(`attempt ${attempt}: response did not validate — ${JSON.stringify(raw).slice(0, 200)}`);
      } catch (err) {
        const retryable = err instanceof LlmError ? err.retryable : !deadline.aborted;
        log(`attempt ${attempt}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
        if (!retryable || deadline.aborted) break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
  log(`falling back to cache (aborted=${deadline.aborted})`);
  return fromCache(text, context, 'llm', deadline.aborted ? 'timeout' : 'llm-error');
}

/**
 * Failure, timeout or rate limit: a pre-forged Incantation or pre-built floor of the kind the
 * words ask for (src/fallback), the player's own work refined locally, or an in-character reply.
 */
function fromCache(text: string, context: InterpretRequest['context'], mode: 'mock' | 'llm', reason: FallbackReason): InterpretResponse {
  return finish(fallbackResponse(text, context, { reason }), mode, 'cache');
}

function finish(raw: unknown, mode: 'mock' | 'llm', source: ResponseSource): InterpretResponse {
  const parsed = InterpretResponse.safeParse(raw);
  const value = parsed.success ? parsed.data : { intent: 'reply' as const, reply: 'The Spire is silent.' };
  return { ...value, mode, source };
}
