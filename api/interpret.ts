import { interpret } from './_lib/interpret';
import { resolveMode, serverEnv } from './_lib/env';

/**
 * Vercel serverless function (Web handler signature).
 * GET  /api/interpret → { mode }            (for the client's "Mock mode" label)
 * POST /api/interpret { text, context? } → InterpretResponse
 * Always answers 200 with JSON: failures become cached items or in-character replies.
 */
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export function GET(): Response {
  return json({ mode: resolveMode(serverEnv()).mode });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown = undefined;
  try {
    // Input cap is applied again after parsing; this just refuses absurd bodies early.
    const raw = await request.text();
    body = raw.length > 50_000 ? undefined : JSON.parse(raw);
  } catch {
    body = undefined;
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const result = await interpret(body, { env: serverEnv(), ip, log: (m) => console.warn(`[interpret] ${m}`) });
  return json(result);
}
