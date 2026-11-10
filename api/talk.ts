import { talk } from './_lib/talk.js';
import { resolveMode, serverEnv } from './_lib/env.js';

/**
 * Vercel serverless function: talking to NPCs.
 * GET  /api/talk → { mode }
 * POST /api/talk { text, role, floor, floorName?, biome?, history? } → { reply, mode, source }
 * Always answers 200 with JSON: failures become the NPC's written answer.
 */
const json = (data: unknown): Response =>
  new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function GET(): Response {
  return json({ mode: resolveMode(serverEnv()).mode });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown = undefined;
  try {
    const raw = await request.text();
    body = raw.length > 10_000 ? undefined : JSON.parse(raw);
  } catch {
    body = undefined;
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return json(await talk(body, { env: serverEnv(), ip, log: (m) => console.warn(`[talk] ${m}`) }));
}
