import { createRateLimiter } from './rateLimit.js';
import type { Env } from './env.js';

/**
 * The Arbiter's cloud voice: ElevenLabs text-to-speech over raw HTTP (same pattern as the Claude
 * call: no SDK). Optional by design: without ELEVENLABS_API_KEY the endpoint says so and the browser
 * keeps using its own speechSynthesis voice. Only the Arbiter's line (text) is sent, never player audio.
 */
export const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
/** Real-time model (~100 ms model latency); 0.5–1 credit per character. */
export const DEFAULT_TTS_MODEL = 'eleven_flash_v2_5';
/**
 * "Eldrin – Crisp British Baritone": ElevenLabs' suggested successor to the default "George" voice
 * (the default voices are retired on 2026-12-31). A calm, deep narrator for the Arbiter. Voice
 * Library voices need a paid plan for API use; set TTS_VOICE to any voice_id in the account.
 */
export const DEFAULT_TTS_VOICE = '6WwXjDDEMyNmFG95zycZ';
/** 64 kbps MP3: small and quick to arrive, plenty for one narrator line. */
export const TTS_OUTPUT_FORMAT = 'mp3_44100_64';
/** Steady and unhurried: higher stability, a little slower than normal. */
export const ARBITER_VOICE_SETTINGS = { stability: 0.6, similarity_boost: 0.8, style: 0, speed: 0.95, use_speaker_boost: true } as const;
export const TTS_TIMEOUT_MS = 6_000;
/** Arbiter lines are short; longer text is cut at a sentence end. */
export const MAX_TTS_CHARS = 400;
/** A busy fight has many Arbiter lines: a wider budget than /api/interpret, but still per IP. */
export const TTS_RATE_LIMIT = { requests: 60, windowMs: 10 * 60 * 1000 } as const;

const limiter = createRateLimiter(TTS_RATE_LIMIT);

export interface TtsConfig {
  enabled: boolean;
  apiKey: string | undefined;
  model: string;
  voice: string;
}

export function resolveTts(env: Env): TtsConfig {
  const apiKey = env.ELEVENLABS_API_KEY?.trim() || undefined;
  return {
    enabled: !!apiKey,
    apiKey,
    model: env.TTS_MODEL?.trim() || DEFAULT_TTS_MODEL,
    voice: env.TTS_VOICE?.trim() || DEFAULT_TTS_VOICE,
  };
}

/** Trim to the limit, preferring to cut after a sentence. */
export function clipForSpeech(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= MAX_TTS_CHARS) return t;
  const cut = t.slice(0, MAX_TTS_CHARS);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 80 ? cut.slice(0, end + 1) : cut;
}

export interface SynthesizeOptions {
  env: Env;
  ip: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

/**
 * POST /api/tts { text } → audio/mpeg, or a status the client treats as "use the browser voice":
 * 204 no key configured, 400 empty, 429 rate limited, 502 upstream failure or timeout.
 */
export async function synthesize(body: unknown, opts: SynthesizeOptions): Promise<Response> {
  const cfg = resolveTts(opts.env);
  if (!cfg.enabled || !cfg.apiKey) return new Response(null, { status: 204 });
  const raw = typeof body === 'object' && body !== null && typeof (body as { text?: unknown }).text === 'string' ? (body as { text: string }).text : '';
  const input = clipForSpeech(raw);
  if (!input) return new Response(null, { status: 400 });
  if (!limiter.allow(opts.ip)) {
    opts.log?.(`tts rate limit: ${opts.ip}`);
    return new Response(null, { status: 429 });
  }
  const url = `${ELEVENLABS_TTS_URL}/${encodeURIComponent(cfg.voice)}/stream?output_format=${TTS_OUTPUT_FORMAT}`;
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      method: 'POST',
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      headers: { 'xi-api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: input, model_id: cfg.model, voice_settings: ARBITER_VOICE_SETTINGS }),
    });
    if (!res.ok || !res.body) {
      // 401 bad key, 402/403 plan limits (e.g. a library voice on the free plan), 404 unknown voice.
      opts.log?.(`tts upstream ${res.status}`);
      return new Response(null, { status: 502 });
    }
    // Stream the audio straight through; the browser can start playing before it all arrives.
    return new Response(res.body, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
  } catch (err) {
    opts.log?.(`tts failed: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(null, { status: 502 });
  }
}

export function resetTtsRateLimit(): void {
  limiter.reset();
}
