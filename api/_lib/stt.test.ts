import { beforeEach, describe, expect, it } from 'vitest';
import { ELEVENLABS_STT_URL, MAX_AUDIO_BYTES, STT_RATE_LIMIT, resetSttRateLimit, transcribe } from './stt';

const env = { ELEVENLABS_API_KEY: 'test-key' };
const clip = new Uint8Array(4000).fill(7);
const scribe = (text: string) => (async () => new Response(JSON.stringify({ text, language_code: 'en' }))) as typeof fetch;

beforeEach(() => resetSttRateLimit());

describe('/api/stt', () => {
  it('forwards the recording to ElevenLabs Scribe and returns the text', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const res = await transcribe(clip, 'audio/webm;codecs=opus', {
      env,
      ip: '1',
      fetchImpl: (async (u: RequestInfo | URL, i?: RequestInit) => {
        url = String(u);
        init = i;
        return new Response(JSON.stringify({ text: '  a frozen   castle ' }));
      }) as typeof fetch,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'a frozen castle' });
    expect(url).toBe(ELEVENLABS_STT_URL);
    expect((init?.headers as Record<string, string>)['xi-api-key']).toBe('test-key');
    const form = init?.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('language_code')).toBe('en');
    const file = form.get('file') as File;
    expect(file.type).toBe('audio/webm');
    expect(file.name).toBe('speech.webm');
    expect(file.size).toBe(clip.length);
  });

  it('without a key: 503 and no call (the browser answers in character)', async () => {
    let called = false;
    const res = await transcribe(clip, 'audio/webm', { env: {}, ip: '1', fetchImpl: (async () => ((called = true), new Response())) as typeof fetch });
    expect(res.status).toBe(503);
    expect(called).toBe(false);
  });

  it('refuses non-audio, tiny and oversized bodies without a call', async () => {
    const fetchImpl = scribe('x');
    expect((await transcribe(clip, 'text/plain', { env, ip: '1', fetchImpl })).status).toBe(400);
    expect((await transcribe(new Uint8Array(10), 'audio/webm', { env, ip: '1', fetchImpl })).status).toBe(400);
    expect((await transcribe(new Uint8Array(MAX_AUDIO_BYTES + 1), 'audio/webm', { env, ip: '1', fetchImpl })).status).toBe(413);
  });

  it('upstream errors and timeouts end in 502', async () => {
    expect((await transcribe(clip, 'audio/ogg', { env, ip: '1', fetchImpl: (async () => new Response('no', { status: 401 })) as typeof fetch })).status).toBe(502);
    const thrown = (async () => {
      throw new DOMException('timeout', 'TimeoutError');
    }) as typeof fetch;
    expect((await transcribe(clip, 'audio/ogg', { env, ip: '1', fetchImpl: thrown })).status).toBe(502);
  });

  it('rate limits per IP', async () => {
    for (let i = 0; i < STT_RATE_LIMIT.requests; i++) await transcribe(clip, 'audio/webm', { env, ip: '5', fetchImpl: scribe('hi') });
    expect((await transcribe(clip, 'audio/webm', { env, ip: '5', fetchImpl: scribe('hi') })).status).toBe(429);
  });
});
