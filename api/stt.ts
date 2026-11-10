import { sttEnabled, transcribe, MAX_AUDIO_BYTES } from './_lib/stt.js';
import { serverEnv } from './_lib/env.js';

/**
 * Vercel serverless function: speech to text for browsers without built-in recognition.
 * GET  /api/stt → { enabled }
 * POST /api/stt (audio body) → { text }
 */
export function GET(): Response {
  return new Response(JSON.stringify({ enabled: sttEnabled(serverEnv()) }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  const audio = declared > MAX_AUDIO_BYTES * 2 ? new Uint8Array() : new Uint8Array(await request.arrayBuffer());
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return transcribe(audio, request.headers.get('content-type') ?? '', { env: serverEnv(), ip, log: (m) => console.warn(`[stt] ${m}`) });
}
