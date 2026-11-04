import { parseInterpretResponse, type InterpretResponse, type LlmMode } from '../schemas/interpret';
import { cachedIncantation } from '../fallback/cache';

const ENDPOINT = '/api/interpret';
const CLIENT_TIMEOUT_MS = 9_000; // server budget is 8 s

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

/**
 * POST the player's words. Validates the reply with the shared zod schema, retries once if it
 * doesn't parse, and falls back to a local cached Incantation if the backend is unreachable.
 * Never throws.
 */
export async function requestInterpretation(text: string, context?: InterpretContext): Promise<InterpretResponse & { offline?: boolean }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(context ? { text, context } : { text }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseInterpretResponse(await res.json());
      if (parsed.ok) return parsed.value;
    } catch {
      // network error, timeout or a non-JSON page: try once more, then fall back
    }
  }
  const local = parseInterpretResponse({
    intent: 'forge',
    incantation: cachedIncantation(text),
    reply: 'The Spire’s voice is far away; it offers you an Incantation it remembers.',
    source: 'cache',
  });
  return local.ok
    ? { ...local.value, offline: true }
    : { intent: 'reply', reply: 'The Spire is silent.', offline: true };
}
