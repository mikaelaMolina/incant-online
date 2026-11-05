#!/usr/bin/env node
// Judge test: sends prompts a hackathon judge might type to POST /api/interpret and reports, for
// each, the intent and whether the result is a valid floor, Incantation or reply.
//
//   npm run judge-test                     # starts a Vite dev server (with the /api middleware) on a free port
//   npm run judge-test -- --url https://…  # test another server instead (e.g. a deployment)
//   npm run judge-test -- "my prompt" …    # test your own prompts
//
// Valid means more than "parses": the response must pass the shared zod InterpretResponse schema
// and, by intent,
//   forge → a named Incantation the Arbiter accepts;
//   build → a named floor whose props and enemies resolve to models in public/assets/manifest.json;
//   reply → an in-character line (not empty, not the silent default, no error text).
// "expected" is the intent a person would expect; a mismatch is reported but only invalid
// results fail the run (exit code 1).
//
// Runs with plain Node (type stripping, Node ≥ 22.18). Shared modules (schemas, Arbiter, manifest
// index) are loaded through Vite so they resolve exactly as in the game.

import { readFileSync } from 'node:fs';
import { createServer, type ViteDevServer } from 'vite';

type Intent = 'forge' | 'build' | 'reply';

const DEFAULT_PROMPTS: readonly [string, Intent | Intent[]][] = [
  ['build a desert temple', 'build'],
  ['put a dragon on a castle', 'build'],
  ['make me a sword that freezes time', 'forge'],
  ['hello', 'reply'],
  ['what is this game', 'reply'],
  ['a cozy village at night', 'build'],
  ['heal me', 'forge'],
  // The Arbiter forbids instant kills: a capped Incantation or a refusal in character are both fine.
  ['kill everything instantly', ['forge', 'reply']],
  ['asdf', 'reply'],
  ['a spell that turns enemies into frogs', 'forge'],
];

const ERROR_TEXT = /\b(error|exception|undefined|null|nan|stack|traceback|failed to|cannot read|unexpected token)\b|[{}<>]/i;

interface Row {
  prompt: string;
  expected: string;
  intent: string;
  source: string;
  valid: boolean;
  sensible: boolean;
  result: string;
  problems: string[];
  ms: number;
}

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const baseUrl = urlIndex >= 0 ? args[urlIndex + 1] : undefined;
const custom = args.filter((a, i) => !a.startsWith('--') && i !== urlIndex + 1);
const prompts: readonly [string, Intent | Intent[]][] = custom.length ? custom.map((p) => [p, ['forge', 'build', 'reply']]) : DEFAULT_PROMPTS;

// Vite gives us the dev /api middleware (vite.config.ts) and a module loader for shared code.
const vite: ViteDevServer = await createServer({
  server: { port: 0, strictPort: false, host: '127.0.0.1' },
  logLevel: 'error',
  clearScreen: false,
});
let exitCode = 0;
try {
  let endpoint: string;
  if (baseUrl) {
    endpoint = new URL('/api/interpret', baseUrl).toString();
  } else {
    await vite.listen();
    const local = vite.resolvedUrls?.local[0];
    if (!local) throw new Error('Vite dev server did not report a URL.');
    endpoint = new URL('/api/interpret', local).toString();
  }

  const { InterpretResponse } = (await vite.ssrLoadModule('/src/schemas/interpret.ts')) as typeof import('../src/schemas/interpret.ts');
  const { judge } = (await vite.ssrLoadModule('/src/arbiter/arbiter.ts')) as typeof import('../src/arbiter/arbiter.ts');
  const { parseFloorSpec } = (await vite.ssrLoadModule('/src/schemas/floorSpec.ts')) as typeof import('../src/schemas/floorSpec.ts');
  const { AssetManifest } = (await vite.ssrLoadModule('/src/schemas/manifest.ts')) as typeof import('../src/schemas/manifest.ts');
  const { ModelIndex } = (await vite.ssrLoadModule('/src/game/assets.ts')) as typeof import('../src/game/assets.ts');
  const models = new ModelIndex(AssetManifest.parse(JSON.parse(readFileSync(new URL('../public/assets/manifest.json', import.meta.url), 'utf8'))));

  const modeRes = await fetch(endpoint).then((r) => r.json() as Promise<{ mode?: string }>).catch(() => ({ mode: 'unreachable' }));
  console.log(`Judge test → ${endpoint} (backend mode: ${modeRes.mode})\n`);

  const rows: Row[] = [];
  for (const [prompt, expectedRaw] of prompts) {
    const expected = Array.isArray(expectedRaw) ? expectedRaw : [expectedRaw];
    const problems: string[] = [];
    const t0 = performance.now();
    let body: unknown;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `judge-test-${rows.length}` },
        body: JSON.stringify({ text: prompt }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status !== 200) problems.push(`HTTP ${res.status}`);
      const raw = await res.text();
      try {
        body = JSON.parse(raw);
      } catch {
        problems.push(`not JSON: ${raw.slice(0, 60)}`);
      }
    } catch (err) {
      problems.push(`request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const ms = Math.round(performance.now() - t0);

    let intent = '—';
    let source = '—';
    let result = '';
    const parsed = body === undefined ? undefined : InterpretResponse.safeParse(body);
    if (parsed && !parsed.success) problems.push('fails InterpretResponse schema');
    if (parsed?.success) {
      const r = parsed.data;
      intent = r.intent;
      source = r.source ?? '?';
      const rawIntent = (body as { intent?: unknown }).intent;
      if (rawIntent !== r.intent) problems.push(`intent "${String(rawIntent)}" did not match its payload (became ${r.intent})`);

      if (r.intent === 'forge' && r.incantation) {
        const j = judge(r.incantation);
        const i = j.incantation;
        if (!i.name.trim() || i.name === 'Nameless Incantation') problems.push('Incantation has no name');
        if (!j.accepted) problems.push('Arbiter rejected it');
        result = `${i.name}: ${i.type}/${i.shape} ${i.element}, ${i.hits}×${i.damage_per_hit}, ${i.status_effect.kind}, cd ${i.cooldown}s, ${i.mana_cost} mana`;
        result += `\n      Arbiter: ${j.sentence}`;
        if (r.reply) result += `\n      Spire: “${r.reply}”`;
      } else if (r.intent === 'build' && r.floor) {
        const f = parseFloorSpec(r.floor);
        if (!f.ok) problems.push(`floor invalid: ${f.error}`);
        const floor = r.floor;
        if (!floor.name.trim()) problems.push('floor has no name');
        const props = floor.props.filter((p) => models.resolve(p.model, 'prop'));
        if (floor.props.length && !props.length) problems.push('no prop resolves to a manifest model');
        const missing = floor.props.length - props.length;
        if (missing > 0) problems.push(`${missing} prop(s) not in the manifest`);
        for (const s of floor.spawns) if (!models.resolve(s.enemy.model, 'enemy')) problems.push(`enemy model "${s.enemy.model}" not in the manifest`);
        const enemies = floor.spawns.reduce((n, s) => n + s.count, 0);
        const foes = floor.spawns.map((s) => `${s.count}× ${s.enemy.id} (${s.enemy.archetype})`).join(', ');
        result = `${floor.name}: ${floor.biome}, ${floor.lighting.time_of_day}, ${floor.size}, ${floor.props.length} props, ${enemies} enemies${foes ? `: ${foes}` : ''}`;
        if (r.reply) result += `\n      Spire: “${r.reply}”`;
      } else {
        const reply = r.reply ?? '';
        if (!reply.trim()) problems.push('empty reply');
        if (reply === 'The Spire is silent.') problems.push('silent default reply');
        if (ERROR_TEXT.test(reply)) problems.push('reply looks like an error, not in character');
        result = `“${reply}”`;
      }
    }

    const valid = problems.length === 0;
    if (!valid) exitCode = 1;
    rows.push({ prompt, expected: expected.join('|'), intent, source, valid, sensible: expected.includes(intent as Intent), result, problems, ms });
  }

  for (const r of rows) {
    const mark = r.valid ? (r.sensible ? 'PASS' : 'PASS*') : 'FAIL';
    console.log(`${mark.padEnd(5)} ${JSON.stringify(r.prompt).padEnd(40)} ${r.intent.padEnd(5)} (expected ${r.expected}, ${r.source}, ${r.ms} ms)`);
    console.log(`      ${r.result}`);
    for (const p of r.problems) console.log(`      ✗ ${p}`);
  }
  const invalid = rows.filter((r) => !r.valid).length;
  const odd = rows.filter((r) => r.valid && !r.sensible).length;
  console.log(`\n${rows.length - invalid}/${rows.length} valid${odd ? `, ${odd} valid but not the expected intent (PASS*)` : ''}.`);
} catch (err) {
  console.error('Judge test could not run:', err);
  exitCode = 2;
} finally {
  await vite.close();
}
process.exit(exitCode);
