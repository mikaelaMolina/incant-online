import { beforeEach, describe, expect, it } from 'vitest';
import {
  ARBITER_VOICE_SETTINGS,
  DEFAULT_TTS_VOICE,
  ELEVENLABS_TTS_URL,
  MAX_TTS_CHARS,
  TTS_RATE_LIMIT,
  clipForSpeech,
  resetTtsState,
  synthesize,
} from './tts';
import { lineKey, prebakedLines, ARBITER_LINES } from '../../src/voice/arbiterLines';

const env = { ELEVENLABS_API_KEY: 'key-a' };
const mp3 = () => new Response(new Uint8Array([0xff, 0xf3, 0x44]), { status: 200 });
const status = (n: number) => new Response('{"detail":{"status":"quota_exceeded"}}', { status: n });

beforeEach(() => resetTtsState());

describe('/api/tts', () => {
  it('without a key: 204, so the browser keeps its own voice (no call made)', async () => {
    let called = false;
    const res = await synthesize({ text: 'Hello.' }, { env: {}, ip: '1', fetchImpl: async () => ((called = true), mp3()) });
    expect(res.status).toBe(204);
    expect(called).toBe(false);
  });

  it('sends a valid ElevenLabs request and returns MP3', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const res = await synthesize({ text: '  The Spire reshapes.  ' }, {
      env,
      ip: '1',
      fetchImpl: async (u, i) => {
        url = String(u);
        init = i;
        return mp3();
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(url).toBe(`${ELEVENLABS_TTS_URL}/${DEFAULT_TTS_VOICE}/stream?output_format=mp3_44100_64`);
    expect((init?.headers as Record<string, string>)['xi-api-key']).toBe('key-a');
    expect(JSON.parse(String(init?.body))).toEqual({
      text: 'The Spire reshapes.',
      model_id: 'eleven_flash_v2_5',
      voice_settings: ARBITER_VOICE_SETTINGS,
    });
  });

  it('any ElevenLabs failure ends in 502, and the browser voice takes over', async () => {
    for (const fail of [() => status(401), () => status(429), () => status(500)]) {
      resetTtsState();
      expect((await synthesize({ text: 'Hi.' }, { env, ip: '1', fetchImpl: (async () => fail()) as typeof fetch })).status).toBe(502);
    }
    resetTtsState();
    const thrown = (async () => {
      throw new Error('network');
    }) as typeof fetch;
    expect((await synthesize({ text: 'Hi.' }, { env, ip: '1', fetchImpl: thrown })).status).toBe(502);
  });

  it('the same line is generated once, then served from memory (no credits spent)', async () => {
    let calls = 0;
    const fake = (async () => (calls++, mp3())) as typeof fetch;
    for (let i = 0; i < 3; i++) expect((await synthesize({ text: 'The Frostbound Keep awaits.' }, { env, ip: '1', fetchImpl: fake })).status).toBe(200);
    expect(calls).toBe(1);
  });

  it('TTS_MODEL / TTS_VOICE override the defaults', async () => {
    let url = '';
    let sent: { model_id?: string } = {};
    await synthesize({ text: 'Hi.' }, {
      env: { ...env, TTS_MODEL: 'eleven_multilingual_v2', TTS_VOICE: 'myVoice123' },
      ip: '1',
      fetchImpl: async (u, i) => ((url = String(u)), (sent = JSON.parse(String(i?.body))), mp3()),
    });
    expect(url).toContain('/myVoice123/stream');
    expect(sent.model_id).toBe('eleven_multilingual_v2');
  });

  it('empty text is refused without a call', async () => {
    expect((await synthesize({ text: '   ' }, { env, ip: '1', fetchImpl: async () => mp3() })).status).toBe(400);
    expect((await synthesize({}, { env, ip: '1', fetchImpl: async () => mp3() })).status).toBe(400);
  });

  it('rate limits per IP, separately from /api/interpret (cached lines do not count)', async () => {
    for (let i = 0; i < TTS_RATE_LIMIT.requests; i++) {
      expect((await synthesize({ text: `Line ${i}.` }, { env, ip: '9', fetchImpl: async () => mp3() })).status).toBe(200);
    }
    expect((await synthesize({ text: 'One more.' }, { env, ip: '9', fetchImpl: async () => mp3() })).status).toBe(429);
    expect((await synthesize({ text: 'Line 0.' }, { env, ip: '9', fetchImpl: async () => mp3() })).status).toBe(200);
    expect((await synthesize({ text: 'One more.' }, { env, ip: '10', fetchImpl: async () => mp3() })).status).toBe(200);
  });

  it('long lines are cut at a sentence end within the limit', () => {
    const clipped = clipForSpeech('The Spire listens. '.repeat(40));
    expect(clipped.length).toBeLessThanOrEqual(MAX_TTS_CHARS);
    expect(clipped.endsWith('.')).toBe(true);
  });
});

describe('pre-recorded lines', () => {
  it('include the Arbiter lines and the in-character replies, once each', () => {
    const lines = prebakedLines();
    expect(lines).toContain(ARBITER_LINES.welcome);
    expect(lines).toContain(ARBITER_LINES.reshapes);
    expect(lines.length).toBeGreaterThan(15);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('match regardless of case, punctuation and curly quotes', () => {
    expect(lineKey('The Spire reshapes.')).toBe(lineKey('the spire reshapes'));
    expect(lineKey('Try “a misty forest”…')).toBe(lineKey('Try a misty forest.'));
  });
});
