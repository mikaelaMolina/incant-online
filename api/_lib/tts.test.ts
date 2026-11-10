import { beforeEach, describe, expect, it } from 'vitest';
import { ARBITER_VOICE_SETTINGS, DEFAULT_TTS_VOICE, ELEVENLABS_TTS_URL, MAX_TTS_CHARS, TTS_RATE_LIMIT, clipForSpeech, resetTtsRateLimit, synthesize } from './tts';

const env = { ELEVENLABS_API_KEY: 'test-key' };
const mp3 = () => new Response(new Uint8Array([0xff, 0xf3, 0x44]), { status: 200, headers: { 'content-type': 'application/octet-stream' } });

beforeEach(() => resetTtsRateLimit());

describe('/api/tts', () => {
  it('without a key: 204, so the browser keeps its own voice (no call made)', async () => {
    let called = false;
    const res = await synthesize({ text: 'Hello.' }, { env: {}, ip: '1', fetchImpl: async () => ((called = true), mp3()) });
    expect(res.status).toBe(204);
    expect(called).toBe(false);
  });

  it('sends a valid ElevenLabs request and streams MP3 back', async () => {
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
    expect((init?.headers as Record<string, string>)['xi-api-key']).toBe('test-key');
    expect(JSON.parse(String(init?.body))).toEqual({
      text: 'The Spire reshapes.',
      model_id: 'eleven_flash_v2_5',
      voice_settings: ARBITER_VOICE_SETTINGS,
    });
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

  it('empty text, upstream errors and thrown errors never reach the player as errors', async () => {
    expect((await synthesize({ text: '   ' }, { env, ip: '1', fetchImpl: async () => mp3() })).status).toBe(400);
    expect((await synthesize({}, { env, ip: '1', fetchImpl: async () => mp3() })).status).toBe(400);
    expect((await synthesize({ text: 'Hi.' }, { env, ip: '1', fetchImpl: async () => new Response('nope', { status: 500 }) })).status).toBe(502);
    expect(
      (await synthesize({ text: 'Hi.' }, { env, ip: '1', fetchImpl: async () => { throw new Error('network'); } })).status,
    ).toBe(502);
  });

  it('rate limits per IP, separately from /api/interpret', async () => {
    for (let i = 0; i < TTS_RATE_LIMIT.requests; i++) {
      expect((await synthesize({ text: 'Hi.' }, { env, ip: '9', fetchImpl: async () => mp3() })).status).toBe(200);
    }
    expect((await synthesize({ text: 'Hi.' }, { env, ip: '9', fetchImpl: async () => mp3() })).status).toBe(429);
    expect((await synthesize({ text: 'Hi.' }, { env, ip: '10', fetchImpl: async () => mp3() })).status).toBe(200);
  });

  it('long lines are cut at a sentence end within the limit', () => {
    const long = 'The Spire listens. '.repeat(40);
    const clipped = clipForSpeech(long);
    expect(clipped.length).toBeLessThanOrEqual(MAX_TTS_CHARS);
    expect(clipped.endsWith('.')).toBe(true);
  });
});
