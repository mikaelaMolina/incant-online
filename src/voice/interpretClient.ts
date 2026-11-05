import { parseInterpretResponse, type InterpretResponse, type LlmMode } from '../schemas/interpret';
import { cachedFloor, cachedIncantation } from '../fallback/cache';

const ENDPOINT = '/api/interpret';
const CLIENT_TIMEOUT_MS = 9_000; // server budget is 8 s
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
  /** What the offline fallback should be: a cached floor (at the gate / building) or an Incantation. */
  want?: 'floor' | 'incantation';
  /** Total time budget in ms (default: two attempts). */
  budgetMs?: number;
}

/**
 * POST the player's words. Validates the reply with the shared zod schema, retries once if it
 * doesn't parse (when the first attempt failed fast), and falls back to a local cached item if the
 * backend is unreachable. Never throws.
 */
export async function requestInterpretation(
  text: string,
  context?: InterpretContext,
  options: InterpretOptions = {},
): Promise<InterpretResponse & { offline?: boolean }> {
  const started = Date.now();
  const budget = options.budgetMs ?? CLIENT_TIMEOUT_MS * 2;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const elapsed = Date.now() - started;
    if (attempt === 2 && elapsed > RETRY_IF_ELAPSED_UNDER_MS) break;
    const timeout = Math.min(CLIENT_TIMEOUT_MS, budget - elapsed);
    if (timeout < 500) break;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(context ? { text, context } : { text }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseInterpretResponse(await res.json());
      if (parsed.ok) return parsed.value;
    } catch {
      // network error, timeout or a non-JSON page: try once more, then fall back
    }
  }
  return offlineFallback(text, options.want ?? 'incantation');
}

/** A cached floor or Incantation, chosen deterministically from the words. */
export function offlineFallback(text: string, want: 'floor' | 'incantation'): InterpretResponse & { offline: true } {
  const local = parseInterpretResponse(
    want === 'floor'
      ? { intent: 'build', floor: cachedFloor(text), reply: 'The Spire’s voice is far away; it raises a floor it remembers.', source: 'cache' }
      : { intent: 'forge', incantation: cachedIncantation(text), reply: 'The Spire’s voice is far away; it offers you an Incantation it remembers.', source: 'cache' },
  );
  return local.ok ? { ...local.value, offline: true } : { intent: 'reply', reply: 'The Spire is silent.', offline: true };
}
