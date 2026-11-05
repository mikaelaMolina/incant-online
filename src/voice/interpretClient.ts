import { parseInterpretResponse, type InterpretResponse, type LlmMode } from '../schemas/interpret';
import { fallbackResponse, type FallbackReason } from '../fallback/fallback';

const ENDPOINT = '/api/interpret';
/**
 * Per-attempt limit. Below the server's own 8 s budget on purpose: if the backend hangs, the
 * browser falls back itself in time for a floor to be built in under 10 s.
 */
const CLIENT_TIMEOUT_MS = 7_000;
/** Only retry if the first attempt failed fast enough that a second can still fit the budget. */
const RETRY_IF_ELAPSED_UNDER_MS = 4_000;

export type BackendMode = LlmMode | 'offline';

export interface InterpretContext {
  incantation?: unknown;
  floor?: unknown;
}

/** GET /api/interpret → which mode the backend runs in. "offline" if it can't be reached. */
export async function fetchBackendMode(): Promise<BackendMode> {
  try {
    const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return 'offline';
    const body = (await res.json()) as { mode?: unknown };
    return body.mode === 'mock' || body.mode === 'llm' ? body.mode : 'offline';
  } catch {
    return 'offline';
  }
}

export interface InterpretOptions {
  /** The caller needs a floor whatever happens (the gate): the fallback is then always a floor. */
  want?: 'floor' | 'incantation';
  /** Total time budget in ms (default: two attempts). */
  budgetMs?: number;
  /** Fallback must not hand out these (Incantations already in the Grimoire, the current floor). */
  avoidIncantations?: readonly string[];
  avoidFloors?: readonly string[];
}

export type InterpretResult = InterpretResponse & {
  /** The backend couldn't be used; the answer came from src/fallback in the browser. */
  offline?: boolean;
  /** Why, when offline. */
  failure?: FallbackReason;
};

/**
 * POST the player's words. Validates the reply with the shared zod schema and retries once if
 * the first attempt failed fast (bad JSON, a dropped connection). A timeout or HTTP 429 is not
 * retried. Whatever goes wrong ends in src/fallback: a pre-forged Incantation, a pre-built floor,
 * the player's own work refined locally, or an in-character reply. Never throws.
 */
export async function requestInterpretation(text: string, context?: InterpretContext, options: InterpretOptions = {}): Promise<InterpretResult> {
  const started = Date.now();
  const budget = options.budgetMs ?? CLIENT_TIMEOUT_MS * 2;
  let failure: FallbackReason = 'offline';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const elapsed = Date.now() - started;
    if (attempt === 2 && elapsed > RETRY_IF_ELAPSED_UNDER_MS) break;
    const timeout = Math.min(CLIENT_TIMEOUT_MS, budget - elapsed);
    if (timeout < 500) {
      failure = 'timeout';
      break;
    }
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(context ? { text, context } : { text }),
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status === 429) {
        failure = 'rate-limit'; // the host's own limiter: asking again right away won't help
        break;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseInterpretResponse(await res.json());
      if (parsed.ok) return parsed.value;
      failure = 'llm-error';
    } catch (err) {
      failure = isTimeout(err) ? 'timeout' : 'offline';
    }
  }
  return offlineFallback(text, context, { ...options, reason: failure });
}

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException ? err.name === 'TimeoutError' || err.name === 'AbortError' : false;
}

/** The browser-side fallback (src/fallback), validated like any server answer. */
export function offlineFallback(
  text: string,
  context: InterpretContext | undefined,
  o: Omit<InterpretOptions, 'budgetMs'> & { reason: FallbackReason },
): InterpretResult & { offline: true } {
  const raw = fallbackResponse(text, context, {
    reason: o.reason,
    ...(o.want === 'floor' ? { want: 'floor' as const } : {}),
    ...(o.avoidIncantations ? { avoidIncantations: o.avoidIncantations } : {}),
    ...(o.avoidFloors ? { avoidFloors: o.avoidFloors } : {}),
  });
  const local = parseInterpretResponse({ ...raw, source: 'cache' });
  return local.ok
    ? { ...local.value, offline: true, failure: o.reason }
    : { intent: 'reply', reply: 'The Spire is silent. Speak again, Incanter.', offline: true, failure: o.reason };
}
