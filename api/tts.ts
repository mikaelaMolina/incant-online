import { resolveTts, synthesize } from './_lib/tts.js';
import { serverEnv } from './_lib/env.js';

/**
 * Vercel serverless function: the Arbiter's cloud voice.
 * GET  /api/tts → { enabled }           (the client uses its browser voice when false)
 * POST /api/tts { text } → audio/mpeg   (any other status: the client falls back to its browser voice)
 */
export function GET(): Response {
  return new Response(JSON.stringify({ enabled: resolveTts(serverEnv()).enabled }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown = undefined;
  try {
    const raw = await request.text();
    body = raw.length > 5_000 ? undefined : JSON.parse(raw);
  } catch {
    body = undefined;
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return synthesize(body, { env: serverEnv(), ip, log: (m) => console.warn(`[tts] ${m}`) });
}
