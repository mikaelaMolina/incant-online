import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestInterpretation } from './interpretClient';

afterEach(() => vi.unstubAllGlobals());

describe('requestInterpretation budget', () => {
  it('a hanging backend gives a cached floor within the budget, without a slow retry', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) => {
      calls++;
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('timeout'))));
    });
    const t0 = Date.now();
    const r = await requestInterpretation('a misty forest', undefined, { want: 'floor', budgetMs: 1200 });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.intent).toBe('build');
    expect(r.offline).toBe(true);
    expect(calls).toBe(1);
  });

  it('a fast failure is retried once, then falls back to an Incantation by default', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response('<html>oops</html>', { status: 500 });
    });
    const r = await requestInterpretation('fire spin');
    expect(calls).toBe(2);
    expect(r.intent).toBe('forge');
  });
});
