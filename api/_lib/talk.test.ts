import { beforeEach, describe, expect, it } from 'vitest';
import { TALK_RATE_LIMIT, npcSystemPrompt, resetTalkRateLimit, talk, writtenReply } from './talk';
import { prologueGreeting } from '../../src/game/story';

const llmEnv = { ANTHROPIC_API_KEY: 'test-key' };
const claude = (text: string) =>
  (async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }), { status: 200 })) as typeof fetch;

beforeEach(() => resetTalkRateLimit());

describe('/api/talk', () => {
  it('mock mode: the NPC answers from its written dialogue, no call made', async () => {
    let called = false;
    const r = await talk({ text: 'who are you?', role: 'Elder', floor: 0 }, { env: {}, ip: '1', fetchImpl: (async () => ((called = true), new Response())) as typeof fetch });
    expect(r).toEqual({ reply: writtenReply({ text: 'who are you?', role: 'Elder', floor: 0 }), mode: 'mock', source: 'mock' });
    expect(called).toBe(false);
  });

  it('llm mode: Claude plays the NPC, briefed with its dialogue and the chapter lore', async () => {
    let sent: { system?: string; messages?: { role: string; content: string }[]; max_tokens?: number; output_config?: unknown } = {};
    const fetchImpl = (async (_u: RequestInfo | URL, i?: RequestInit) => {
      sent = JSON.parse(String(i?.body));
      return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I keep the fire, Incanter. The gate waits for you.' }] }));
    }) as typeof fetch;
    const r = await talk(
      {
        text: 'what do you do here?',
        role: 'Elder',
        floor: 0,
        history: [
          { who: 'player', text: 'hello' },
          { who: 'npc', text: 'Greetings.' },
        ],
      },
      { env: llmEnv, ip: '1', fetchImpl },
    );
    expect(r).toEqual({ reply: 'I keep the fire, Incanter. The gate waits for you.', mode: 'llm', source: 'llm' });
    // system is now an array of content blocks for cache_control support.
    const systemText = Array.isArray(sent.system) ? sent.system[0]?.text : sent.system;
    expect(systemText).toContain('You are the Elder');
    expect(systemText).toContain(prologueGreeting('Elder'));
    expect(systemText).toContain('Never mention being an AI');
    expect(sent.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Greetings.' },
      { role: 'user', content: 'what do you do here?' },
    ]);
    expect(sent).not.toHaveProperty('temperature');
    expect(sent).not.toHaveProperty('thinking');
  });

  it('a guide on a combat floor knows where it stands', () => {
    const prompt = npcSystemPrompt({ role: 'Wanderer', floor: 4, floorName: 'The Frostbound Keep', biome: 'castle' });
    expect(prompt).toContain('floor 4 ("The Frostbound Keep", castle)');
  });

  it('history that starts with the NPC is trimmed so the conversation starts with the player', async () => {
    let roles: string[] = [];
    const fetchImpl = (async (_u: RequestInfo | URL, i?: RequestInit) => {
      roles = JSON.parse(String(i?.body)).messages.map((m: { role: string }) => m.role);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Yes.' }] }));
    }) as typeof fetch;
    await talk({ text: 'and you?', role: 'Knight', floor: 0, history: [{ who: 'npc', text: 'Halt.' }] }, { env: llmEnv, ip: '1', fetchImpl });
    expect(roles).toEqual(['user']);
  });

  it('API errors, refusals and timeouts end in the written answer, never an error', async () => {
    const written = writtenReply({ text: 'hi', role: 'Villager', floor: 0 });
    for (const fetchImpl of [
      (async () => new Response('overloaded', { status: 529 })) as typeof fetch,
      (async () => new Response(JSON.stringify({ stop_reason: 'refusal', content: [] }))) as typeof fetch,
      (async () => {
        throw new DOMException('timed out', 'TimeoutError');
      }) as typeof fetch,
    ]) {
      expect(await talk({ text: 'hi', role: 'Villager', floor: 0 }, { env: llmEnv, ip: '1', fetchImpl })).toEqual({ reply: written, mode: 'llm', source: 'cache' });
    }
  });

  it('long replies are cut at a sentence end', async () => {
    const r = await talk({ text: 'tell me everything', role: 'Elder', floor: 0 }, { env: llmEnv, ip: '1', fetchImpl: claude('The Spire is old. '.repeat(40)) });
    expect(r.reply.length).toBeLessThanOrEqual(320);
    expect(r.reply.endsWith('.')).toBe(true);
  });

  it('bad requests get an in-character line; the rate limit falls back to written answers', async () => {
    expect((await talk({ text: '' }, { env: llmEnv, ip: '1' })).reply).toMatch(/Incanter/);
    for (let i = 0; i < TALK_RATE_LIMIT.requests; i++) await talk({ text: 'hi', role: 'Elder', floor: 0 }, { env: llmEnv, ip: '7', fetchImpl: claude('Hello.') });
    expect((await talk({ text: 'hi', role: 'Elder', floor: 0 }, { env: llmEnv, ip: '7', fetchImpl: claude('Hello.') })).source).toBe('cache');
  });
});
