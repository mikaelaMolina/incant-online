import { createRateLimiter } from './rateLimit.js';
import type { Env } from './env.js';

/**
 * The Arbiter's cloud voice: ElevenLabs text-to-speech over raw HTTP (same pattern as the Claude
 * call: no SDK). Optional by design: without an ElevenLabs key the endpoint says so and the browser
 * keeps using its own speechSynthesis voice. Only the Arbiter's line (text) is sent, never player audio.
 *
 * If the call fails (out of credits, rejected, timeout), the client falls back to the browser
 * voice. Fixed lines are pre-recorded (npm run voices) and never reach this endpoint; generated
 * lines are cached in memory so a repeated line costs credits once.
 */
export const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
/** Real-time model (~100 ms model latency); 0.5–1 credit per character. */
export const DEFAULT_TTS_MODEL = 'eleven_flash_v2_5';
/**
 * "Eldrin – Crisp British Baritone": ElevenLabs' suggested successor to the default "George" voice
 * (the default voices are retired on 2026-12-31). A calm, deep narrator for the Arbiter. Voice
 * Library voices need a paid plan for API use; set TTS_VOICE to any voice_id the account can use.
 */
export const DEFAULT_TTS_VOICE = '6WwXjDDEMyNmFG95zycZ';
/** 64 kbps MP3: small and quick to arrive, plenty for one narrator line. */
export const TTS_OUTPUT_FORMAT = 'mp3_44100_64';
/** Steady and unhurried: higher stability, a little slower than normal. */
export const ARBITER_VOICE_SETTINGS = { stability: 0.6, similarity_boost: 0.8, style: 0, speed: 0.95, use_speaker_boost: true } as const;
/** A line that arrives later than this is no longer worth waiting for. */
export const TTS_TIMEOUT_MS = 6_000;
/** Arbiter lines are short; longer text is cut at a sentence end. */
export const MAX_TTS_CHARS = 400;
/** A busy fight has many Arbiter lines: a wider budget than /api/interpret, but still per IP. */
export const TTS_RATE_LIMIT = { requests: 60, windowMs: 10 * 60 * 1000 } as const;
const CACHE_ENTRIES = 150;

const limiter = createRateLimiter(TTS_RATE_LIMIT);
/** Generated audio by voice + model + text (identical lines from any player cost credits once). */
const audioCache = new Map<string, Uint8Array>();

export interface TtsConfig {
  enabled: boolean;
  apiKey: string | undefined;
  voice: string;
  model: string;
}

export function resolveTts(env: Env): TtsConfig {
  const apiKey = env.ELEVENLABS_API_KEY?.trim() || undefined;
  return {
    enabled: !!apiKey,
    apiKey,
    voice: env.TTS_VOICE?.trim() || DEFAULT_TTS_VOICE,
    model: env.TTS_MODEL?.trim() || DEFAULT_TTS_MODEL,
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

export interface GenerateOptions {
  fetchImpl?: typeof fetch | undefined;
  log?: ((msg: string) => void) | undefined;
  timeoutMs?: number;
}

/** Speak `text` with ElevenLabs → MP3 bytes, or undefined on any failure (the caller then uses the browser voice). */
export async function generateSpeech(text: string, cfg: TtsConfig, opts: GenerateOptions = {}): Promise<Uint8Array | undefined> {
  if (!cfg.apiKey) return undefined;
  const log = opts.log ?? (() => {});
  const url = `${ELEVENLABS_TTS_URL}/${encodeURIComponent(cfg.voice)}/stream?output_format=${TTS_OUTPUT_FORMAT}`;
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      method: 'POST',
      signal: AbortSignal.timeout(opts.timeoutMs ?? TTS_TIMEOUT_MS),
      headers: { 'xi-api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: cfg.model, voice_settings: ARBITER_VOICE_SETTINGS }),
    });
    if (!res.ok) {
      // 401 rejected or out of credits, 402/403 plan limits, 404 unknown voice, 429 rate limited.
      log(`tts: HTTP ${res.status}`);
      return undefined;
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.length === 0) log('tts: empty audio');
    return audio.length ? audio : undefined;
  } catch (err) {
    log(`tts: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

export interface SynthesizeOptions {
  env: Env;
  ip: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

/**
 * POST /api/tts { text } → audio/mpeg, or a status the client treats as "use the browser voice":
 * 204 no key configured, 400 empty, 429 rate limited, 502 ElevenLabs failed or timed out.
 */
export async function synthesize(body: unknown, opts: SynthesizeOptions): Promise<Response> {
  const cfg = resolveTts(opts.env);
  if (!cfg.enabled) return new Response(null, { status: 204 });
  const raw = typeof body === 'object' && body !== null && typeof (body as { text?: unknown }).text === 'string' ? (body as { text: string }).text : '';
  const input = clipForSpeech(raw);
  if (!input) return new Response(null, { status: 400 });

  const cacheKey = `${cfg.voice}|${cfg.model}|${input}`;
  let audio = audioCache.get(cacheKey);
  if (audio) {
    // Most recently used goes last, so the oldest entry is evicted first.
    audioCache.delete(cacheKey);
    audioCache.set(cacheKey, audio);
  } else {
    if (!limiter.allow(opts.ip)) {
      opts.log?.(`tts rate limit: ${opts.ip}`);
      return new Response(null, { status: 429 });
    }
    audio = await generateSpeech(input, cfg, { fetchImpl: opts.fetchImpl, log: opts.log });
    if (!audio) return new Response(null, { status: 502 });
    audioCache.set(cacheKey, audio);
    if (audioCache.size > CACHE_ENTRIES) audioCache.delete(audioCache.keys().next().value as string);
  }
  return new Response(audio.slice(), { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}

/** Tests: forget rate limits and cached audio. */
export function resetTtsState(): void {
  limiter.reset();
  audioCache.clear();
}
