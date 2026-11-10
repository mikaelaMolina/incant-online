import { createRateLimiter } from './rateLimit.js';
import type { Env } from './env.js';

/**
 * The Arbiter's cloud voice: OpenAI text-to-speech over raw HTTP (same pattern as the Claude call:
 * no SDK). Optional by design: without OPENAI_API_KEY the endpoint says so and the browser keeps
 * using its own speechSynthesis voice. Only the Arbiter's line (text) is sent, never player audio.
 */
export const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
/** gpt-4o-mini-tts takes style instructions. OpenAI has announced its shutdown for 6 Jan 2027: set TTS_MODEL then. */
export const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
/** OpenAI recommends marin or cedar for best quality. */
export const DEFAULT_TTS_VOICE = 'cedar';
export const TTS_TIMEOUT_MS = 6_000;
/** Arbiter lines are short; longer text is cut at a sentence end. */
export const MAX_TTS_CHARS = 400;
/** A busy fight has many Arbiter lines: a wider budget than /api/interpret, but still per IP. */
export const TTS_RATE_LIMIT = { requests: 60, windowMs: 10 * 60 * 1000 } as const;

export const ARBITER_VOICE_INSTRUCTIONS =
  'You are the Arbiter, the ancient spirit of a magical tower in a fantasy game. ' +
  'Speak calm, warm and resonant, unhurried, with quiet gravitas and a hint of wonder, like a wise narrator. ' +
  'Clear diction. Never shout, never sound like an assistant reading a list.';

const limiter = createRateLimiter(TTS_RATE_LIMIT);

export interface TtsConfig {
  enabled: boolean;
  apiKey: string | undefined;
  model: string;
  voice: string;
}

export function resolveTts(env: Env): TtsConfig {
  const apiKey = env.OPENAI_API_KEY?.trim() || undefined;
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
  try {
    const res = await (opts.fetchImpl ?? fetch)(OPENAI_SPEECH_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        voice: cfg.voice,
        input,
        instructions: ARBITER_VOICE_INSTRUCTIONS,
        response_format: 'mp3',
      }),
    });
    if (!res.ok || !res.body) {
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
