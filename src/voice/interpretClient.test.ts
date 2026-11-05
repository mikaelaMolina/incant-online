import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestInterpretation } from './interpretClient';
import { CACHED_FLOORS, CACHED_INCANTATIONS } from '../fallback/cache';
import { judge } from '../arbiter/arbiter';

afterEach(() => vi.unstubAllGlobals());

const cachedNames = CACHED_INCANTATIONS.map((c) => (c as { name: string }).name);
const floorNames = CACHED_FLOORS.map((c) => (c as { name: string }).name);

/** fetch that never answers until its timeout aborts it. */
const hanging = (calls: { n: number }) => (_url: string, init: { signal: AbortSignal }) => {
  calls.n++;
  return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
};

describe('backend unreachable (network error)', () => {
  const down = () => vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')));

  it('an ability → a pre-forged Incantation', async () => {
    down();
    const r = await requestInterpretation('a spinning fire slash');
    expect(r).toMatchObject({ intent: 'forge', offline: true, failure: 'offline', source: 'cache' });
    expect(cachedNames).toContain(r.incantation?.name);
    expect(r.reply).toMatch(/far away/);
  });

  it('a place → a pre-built floor; chat → an in-character reply', async () => {
    down();
    const floor = await requestInterpretation('build a misty forest at night');
    expect(floor.intent).toBe('build');
    expect(floorNames).toContain(floor.floor?.name);
    const chat = await requestInterpretation('hello');
    expect(chat.intent).toBe('reply');
  });

  it('a refine keeps the player’s Incantation', async () => {
    down();
    const mine = judge({ name: 'My Bolt', type: 'projectile', shape: 'orb', radius: 2, element: 'fire' }).incantation;
    const r = await requestInterpretation('make it wider', { incantation: mine });
    expect(r.incantation?.name).toBe('My Bolt');
    expect(r.incantation?.radius).toBeGreaterThan(2);
  });

  it('never hands back an Incantation already in the Grimoire, or the current floor', async () => {
    down();
    const r = await requestInterpretation('a spinning fire slash', undefined, { avoidIncantations: cachedNames.slice(0, 9) });
    expect(r.incantation?.name).toBe(cachedNames[9]);
    const f = await requestInterpretation('a forest', undefined, { avoidFloors: floorNames.slice(0, 2) });
    expect(f.floor?.name).toBe(floorNames[2]);
  });
});

describe('timeout', () => {
  it('a hanging backend gives a cached floor within the budget, without a slow retry', async () => {
    const calls = { n: 0 };
    vi.stubGlobal('fetch', hanging(calls));
    const t0 = Date.now();
    const r = await requestInterpretation('a misty forest', undefined, { want: 'floor', budgetMs: 1200 });
    // Far below one full client timeout (9 s); generous so a busy test machine can't flake it.
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(r).toMatchObject({ intent: 'build', offline: true, failure: 'timeout' });
    expect(r.reply).toMatch(/too long/);
    expect(calls.n).toBe(1);
  });
});

describe('rate limited by the host (HTTP 429)', () => {
  it('falls back at once, without asking again', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response('Too Many Requests', { status: 429 });
    });
    const r = await requestInterpretation('an ice lance');
    expect(calls).toBe(1);
    expect(r).toMatchObject({ intent: 'forge', failure: 'rate-limit' });
    expect(r.reply).toMatch(/weary/);
  });
});

describe('server errors and broken answers', () => {
  it('a fast failure (HTTP 500, an HTML error page) is retried once, then falls back', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response('<html>oops</html>', { status: 500 });
    });
    const r = await requestInterpretation('fire spin');
    expect(calls).toBe(2);
    expect(r.intent).toBe('forge');
    expect(r.offline).toBe(true);
  });

  it('a 200 with JSON that is not an object is retried, then falls back', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response('"just a string"', { status: 200 });
    });
    const r = await requestInterpretation('a castle at night');
    expect(calls).toBe(2);
    expect(r.intent).toBe('build');
  });

  it('a second attempt that works is used', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      if (calls === 1) return Promise.reject(new TypeError('connection reset'));
      return new Response(JSON.stringify({ intent: 'reply', reply: 'The Spire hears you.', mode: 'mock', source: 'mock' }));
    });
    const r = await requestInterpretation('hello');
    expect(r.reply).toBe('The Spire hears you.');
    expect(r.offline).toBeUndefined();
  });
});
