/** Per-IP sliding-window limiter (CLAUDE.md: 20 requests / 10 min). In-memory: per server instance. */
export const RATE_LIMIT = { requests: 20, windowMs: 10 * 60 * 1000 } as const;

const hits = new Map<string, number[]>();

export function allowRequest(ip: string, now = Date.now()): boolean {
  const since = now - RATE_LIMIT.windowMs;
  const list = (hits.get(ip) ?? []).filter((t) => t > since);
  if (list.length >= RATE_LIMIT.requests) {
    hits.set(ip, list);
    return false;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 10_000) {
    // Keep memory bounded on a long-lived instance.
    for (const [key, times] of hits) if (!times.some((t) => t > since)) hits.delete(key);
  }
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}
