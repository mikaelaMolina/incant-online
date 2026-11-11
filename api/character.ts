import { serverEnv, resolveMode } from './_lib/env.js';
import { ANTHROPIC_URL, ANTHROPIC_VERSION } from './_lib/llm/client.js';

const SYSTEM = `You are a 3D character kitbash artist for Three.js. Given a description (e.g. "bunny", "little kid", "crimson knight"), build a 3D character using 10-18 primitive parts.
Coordinates: y=0 is ground, height 0 to 1.8m, center x=0, z=0, front is +z (eyes/nose at +z, tail at -z, left/right -x/+x).
Shapes: "sphere", "box", "cylinder", "cone".
Roles: "body", "head", "legL", "legR", "armL", "armR", "ear", "tail".
Always include 2 eyes at +z and clear silhouette features (e.g. tall ears + cotton tail for bunny).
Reply ONLY with raw JSON:
{"orbColor":"#rrggbb","parts":[{"shape":"sphere","x":0,"y":0.5,"z":0,"w":0.5,"h":0.6,"d":0.4,"rx":0,"ry":0,"rz":0,"color":"#rrggbb","emissive":false,"role":"body"}]}`;

export async function POST(request: Request): Promise<Response> {
  const { description = '' } = (await request.json().catch(() => ({}))) as { description?: string };
  const clean = description.trim().slice(0, 200);
  const cfg = resolveMode(serverEnv());
  if (!clean || !cfg.apiKey) return new Response('{}', { status: 400 });

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Build a 3D character for: "${clean}"` }],
    }),
  });
  if (!res.ok) return new Response(await res.text(), { status: res.status });
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  return new Response(m ? m[0] : '{}', { headers: { 'content-type': 'application/json' } });
}
