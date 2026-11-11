import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interpret } from './interpret';
import { resolveMode } from './env';
import { RATE_LIMIT, resetRateLimit } from './rateLimit';
import { ANTHROPIC_URL, ANTHROPIC_VERSION } from './llm/client';
import { SYSTEM_PROMPT } from './llm/prompt';
import { CACHED_FLOORS, CACHED_INCANTATIONS } from '../../src/fallback/cache';
import { STARTING_ARENA } from '../../src/fallback/floors';

const KEY = { ANTHROPIC_API_KEY: 'test-key' };
const names = CACHED_INCANTATIONS.map((i) => (i as { name: string }).name);

function anthropicReply(json: unknown, stop_reason = 'end_turn'): Response {
  return new Response(JSON.stringify({ stop_reason, content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }] }), { status: 200 });
}

const llmIncantation = {
  intent: 'forge',
  incantation: {
    name: 'Starfall Edge', flavor: 'A slash of falling light.', type: 'melee_combo', shape: 'slash', hits: 2, radius: 2,
    damage_per_hit: 20, element: 'light', status_effect: { kind: 'none', dps: 0, duration: 0 }, chain_targets: 0,
    cooldown: 5, mana_cost: 0, vfx: { color: '#fff3b0', trail: true, particles: 'motes' },
  },
  floor: null,
  reply: null,
};

beforeEach(() => resetRateLimit());

describe('mode resolution', () => {
  it('defaults to mock without a key, llm with one', () => {
    expect(resolveMode({}).mode).toBe('mock');
    expect(resolveMode(KEY).mode).toBe('llm');
  });
  it('LLM_MODE=mock wins even with a key; LLM_MODE=llm without a key stays mock', () => {
    expect(resolveMode({ ...KEY, LLM_MODE: 'mock' }).mode).toBe('mock');
    const r = resolveMode({ LLM_MODE: 'llm' });
    expect(r.mode).toBe('mock');
    expect(r.note).toMatch(/missing/);
  });
  it('defaults to the fast model', () => {
    expect(resolveMode(KEY).model).toBe('claude-haiku-5-5');
    expect(resolveMode({ ...KEY, LLM_MODEL: 'claude-sonnet-5-5' }).model).toBe('claude-sonnet-5-5');
  });
});

describe('interpret: mock mode', () => {
  it('never calls fetch', async () => {
    const fetchImpl = vi.fn();
    const r = await interpret({ text: 'fire slash' }, { env: {}, ip: '1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r).toMatchObject({ intent: 'forge', mode: 'mock', source: 'mock' });
  });
  it('even with a key when LLM_MODE=mock', async () => {
    const fetchImpl = vi.fn();
    await interpret({ text: 'fire slash' }, { env: { ...KEY, LLM_MODE: 'mock' }, ip: '1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('bad bodies become in-character replies', async () => {
    for (const body of [undefined, null, 42, {}, { text: '' }, { text: 7 }]) {
      const r = await interpret(body, { env: {}, ip: '1' });
      expect(r.intent).toBe('reply');
      expect(r.reply).toMatch(/Spire/);
    }
  });
  it('caps input at 300 characters', async () => {
    const r = await interpret({ text: 'fire slash ' + 'x'.repeat(5000) }, { env: {}, ip: '1' });
    expect(r.intent).toBe('forge');
  });
  it(`rate limits after ${RATE_LIMIT.requests} requests with a cached item`, async () => {
    for (let i = 0; i < RATE_LIMIT.requests; i++) await interpret({ text: 'ice orb' }, { env: {}, ip: '9' });
    const r = await interpret({ text: 'ice orb' }, { env: {}, ip: '9' });
    expect(r).toMatchObject({ intent: 'forge', source: 'cache' });
    expect(names).toContain(r.incantation?.name);
    expect((await interpret({ text: 'ice orb' }, { env: {}, ip: 'other' })).source).toBe('mock');
  });
});

describe('interpret: llm mode (mocked HTTP)', () => {
  it('sends a valid Messages API request and validates the reply', async () => {
    const fetchImpl = vi.fn(async () => anthropicReply(llmIncantation));
    const r = await interpret({ text: 'a slash of falling stars' }, { env: KEY, ip: '1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ intent: 'forge', mode: 'llm', source: 'llm' });
    expect(r.incantation?.name).toBe('Starfall Edge');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ model: 'claude-haiku-5-5' });
    // system is now an array of content blocks for cache_control support.
    expect(Array.isArray(sent.system)).toBe(true);
    expect(sent.system[0].text).toBe(SYSTEM_PROMPT);
    expect(sent.system[0].cache_control).toEqual({ type: 'ephemeral' });
    // json_schema is not used (grammar too large for Anthropic's compiler);
    // we rely on the system prompt + lenient Zod validation instead.
    expect(sent.output_config).toEqual({ effort: 'low' });
    expect(sent).not.toHaveProperty('temperature'); // rejected by current models
    expect(sent).not.toHaveProperty('thinking');
  });

  it('retries once on unparseable JSON, then succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(anthropicReply('{"intent": "forge", "incan', 'max_tokens')).mockResolvedValueOnce(anthropicReply(llmIncantation));
    const r = await interpret({ text: 'x' }, { env: KEY, ip: '1', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r.source).toBe('llm');
  });

  it('falls back to the cache after two failures', async () => {
    const fetchImpl = vi.fn(async () => new Response('overloaded', { status: 529 }));
    const r = await interpret({ text: 'a fire slash' }, { env: KEY, ip: '1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ intent: 'forge', mode: 'llm', source: 'cache' });
  });

  it('does not retry auth errors or refusals', async () => {
    for (const res of [new Response('no', { status: 401 }), anthropicReply('', 'refusal')]) {
      const fetchImpl = vi.fn(async () => res);
      const r = await interpret({ text: 'a forest' }, { env: KEY, ip: '1', fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(r).toMatchObject({ intent: 'build', source: 'cache' }); // cache of the guessed kind
    }
  });

  it('clamps out-of-range LLM numbers through the same schema', async () => {
    const wild = structuredClone(llmIncantation);
    Object.assign(wild.incantation, { hits: 40, damage_per_hit: 9999, element: 'plasma', cooldown: -3 });
    const r = await interpret({ text: 'x' }, { env: KEY, ip: '1', fetchImpl: vi.fn(async () => anthropicReply(wild)) });
    expect(r.incantation).toMatchObject({ hits: 5, damage_per_hit: 60, cooldown: 1 });
  });

  it('times out into the cache', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')))),
      );
      const p = interpret({ text: 'ice orb' }, { env: KEY, ip: '1', fetchImpl: fetchImpl as unknown as typeof fetch });
      await vi.advanceTimersByTimeAsync(8_100);
      const r = await p;
      expect(r.source).toBe('cache');
      expect(r.reply).toMatch(/too long/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('failure answers come from src/fallback', () => {
  const failing = () => vi.fn(async () => new Response('overloaded', { status: 529 })) as unknown as typeof fetch;
  const floorNames = CACHED_FLOORS.map((f) => (f as { name: string }).name);

  it('a place during an LLM failure → a pre-built floor, never the starting arena', async () => {
    for (const text of ['build a frozen castle', 'a misty forest', 'take me to the desert', 'a cozy village']) {
      const r = await interpret({ text }, { env: KEY, ip: text, fetchImpl: failing() });
      expect(r).toMatchObject({ intent: 'build', source: 'cache' });
      expect(floorNames).toContain(r.floor?.name);
      expect(r.floor?.name).not.toBe(STARTING_ARENA.name);
      expect(r.reply).toMatch(/scatter/);
    }
  });

  it('a refine during an LLM failure keeps the player’s Incantation, changed as asked', async () => {
    const r = await interpret(
      { text: 'add a stun', context: { incantation: llmIncantation.incantation } },
      { env: KEY, ip: '1', fetchImpl: failing() },
    );
    expect(r.incantation?.name).toBe('Starfall Edge');
    expect(r.incantation?.status_effect.kind).toBe('stun');
  });

  it('chat during an LLM failure → an in-character reply, not an item', async () => {
    const r = await interpret({ text: 'hello' }, { env: KEY, ip: '1', fetchImpl: failing() });
    expect(r.intent).toBe('reply');
    expect(r.reply).toBeTruthy();
  });

  it('rate-limited requests say so in character', async () => {
    for (let i = 0; i < RATE_LIMIT.requests; i++) await interpret({ text: 'a forest' }, { env: {}, ip: 'rl' });
    const r = await interpret({ text: 'a forest' }, { env: {}, ip: 'rl' });
    expect(r).toMatchObject({ intent: 'build', source: 'cache' });
    expect(r.reply).toMatch(/weary/);
  });
});
