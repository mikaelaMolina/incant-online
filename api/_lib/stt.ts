import { createRateLimiter } from './rateLimit.js';
import type { Env } from './env.js';

/**
 * Speech to text for browsers without working built-in speech recognition (Firefox, Brave,
 * Opera…): the push-to-talk recording is forwarded to ElevenLabs Speech to Text (Scribe) and the
 * text comes back. The audio is passed straight through and never stored by this server.
 * Raw HTTP, no SDK (same pattern as the other functions).
 */
export const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
export const STT_MODEL = 'scribe_v2';
/** Under the browser's own 8 s wait. */
export const STT_TIMEOUT_MS = 7_000;
/** A 15 s push-to-talk clip of webm/opus is ~60 KB; refuse anything far bigger. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const STT_RATE_LIMIT = { requests: 40, windowMs: 10 * 60 * 1000 } as const;
const AUDIO_TYPES = /^(audio|video)\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|flac|opus|x-m4a)\b/;

const limiter = createRateLimiter(STT_RATE_LIMIT);

export function sttEnabled(env: Env): boolean {
  return !!env.ELEVENLABS_API_KEY?.trim();
}

export interface SttOptions {
  env: Env;
  ip: string;
  fetchImpl?: typeof fetch | undefined;
  log?: ((msg: string) => void) | undefined;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * POST /api/stt (body: the recording, Content-Type: its audio type) → { text }.
 * Errors (the browser answers in character): 400 bad audio, 413 too big, 429 rate limited,
 * 502 ElevenLabs failed or timed out, 503 no key configured.
 */
export async function transcribe(audio: Uint8Array, contentType: string, opts: SttOptions): Promise<Response> {
  const apiKey = opts.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return json({ text: '' }, 503);
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  if (!AUDIO_TYPES.test(type) || audio.length < 200) return json({ text: '' }, 400);
  if (audio.length > MAX_AUDIO_BYTES) return json({ text: '' }, 413);
  if (!limiter.allow(opts.ip)) {
    opts.log?.(`stt rate limit: ${opts.ip}`);
    return json({ text: '' }, 429);
  }
  const ext = type.split('/')[1]!.replace('x-', '');
  const form = new FormData();
  form.append('model_id', STT_MODEL);
  form.append('language_code', 'en'); // the game speaks English; a fixed language is faster and more accurate
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([audio.slice()], { type }), `speech.${ext}`);
  try {
    const res = await (opts.fetchImpl ?? fetch)(ELEVENLABS_STT_URL, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
    if (!res.ok) {
      opts.log?.(`stt upstream ${res.status}`);
      return json({ text: '' }, 502);
    }
    const body = (await res.json()) as { text?: unknown };
    const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 2000) : '';
    return json({ text });
  } catch (err) {
    opts.log?.(`stt failed: ${err instanceof Error ? err.message : String(err)}`);
    return json({ text: '' }, 502);
  }
}

export function resetSttRateLimit(): void {
  limiter.reset();
}
