/** Per-IP sliding-window limiter (CLAUDE.md: 20 requests / 10 min). In-memory: per server instance. */
export const RATE_LIMIT = { requests: 20, windowMs: 10 * 60 * 1000 } as const;

/** A separate limiter per endpoint, so Arbiter voice lines never use up the /api/interpret budget. */
export function createRateLimiter(limit: { requests: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    allow(ip: string, now = Date.now()): boolean {
      const since = now - limit.windowMs;
      const list = (hits.get(ip) ?? []).filter((t) => t > since);
      if (list.length >= limit.requests) {
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
    },
    reset(): void {
      hits.clear();
    },
  };
}

const interpretLimiter = createRateLimiter(RATE_LIMIT);

export function allowRequest(ip: string, now = Date.now()): boolean {
  return interpretLimiter.allow(ip, now);
}

export function resetRateLimit(): void {
  interpretLimiter.reset();
}
