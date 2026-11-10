#!/usr/bin/env node
// Checks that the Vercel functions in api/ run under plain Node ESM, the way Vercel runs them:
// every reachable .ts file is transpiled on its own (no bundling) into a temp dir, then
// api/interpret.js is imported with Node and its GET / POST handlers are called.
// Catches extensionless relative imports and JSON imports without `with { type: 'json' }`.
//
// Run: npm run check:api   (also part of npm run build)

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { transformWithEsbuild } from 'vite';

const ROOT = new URL('..', import.meta.url).pathname;
const ENTRIES = ['api/interpret.ts', 'api/tts.ts', 'api/talk.ts', 'api/stt.ts'];
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/g;

const out = mkdtempSync(join(tmpdir(), 'incant-api-'));
const problems = [];

function resolveTs(fromFile, spec) {
  const base = normalize(join(dirname(fromFile), spec));
  if (spec.endsWith('.json')) return existsSync(join(ROOT, base)) ? base : undefined;
  if (spec.endsWith('.js') && existsSync(join(ROOT, base.slice(0, -3) + '.ts'))) return base.slice(0, -3) + '.ts';
  return undefined; // extensionless or wrong: Node ESM would fail
}

const seen = new Set();
const queue = [...ENTRIES];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const dest = join(out, file.replace(/\.ts$/, '.js'));
  mkdirSync(dirname(dest), { recursive: true });
  if (file.endsWith('.json')) {
    copyFileSync(join(ROOT, file), join(out, file));
    continue;
  }
  const src = readFileSync(join(ROOT, file), 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1];
    const target = resolveTs(file, spec);
    if (!target) {
      problems.push(`${file}: import '${spec}' needs an explicit .js (or .json) extension`);
      continue;
    }
    if (spec.endsWith('.json') && !new RegExp(`['"]${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*with\\s*\\{\\s*type:\\s*['"]json['"]`).test(src)) {
      problems.push(`${file}: JSON import '${spec}' needs \`with { type: 'json' }\``);
    }
    queue.push(target);
  }
  const { code } = await transformWithEsbuild(src, file, { loader: 'ts', format: 'esm', target: 'node22' });
  writeFileSync(dest, code);
}

if (problems.length) {
  console.error(`check:api: ${problems.length} problem(s) would break the function on Vercel:\n  ` + problems.join('\n  '));
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}

// node_modules for bare imports (zod), and ESM package scope.
writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'module' }));
const { symlinkSync } = await import('node:fs');
symlinkSync(join(ROOT, 'node_modules'), join(out, 'node_modules'), 'dir');

try {
  const env = (globalThis.process.env = { ...process.env });
  delete env.ANTHROPIC_API_KEY; // mock mode: never call the real API from a check
  delete env.LLM_MODE;
  delete env.ELEVENLABS_API_KEY; // the voice endpoint must report itself off: never call ElevenLabs from a check
  const mod = await import(pathToFileURL(join(out, 'api/interpret.js')).href);
  const mode = await (await mod.GET()).json();
  const res = await mod.POST(
    new Request('http://localhost/api/interpret', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify({ text: 'a spinning fire attack that hits three times' }),
    }),
  );
  const body = await res.json();
  if (mode.mode !== 'mock' || res.status !== 200 || body.intent !== 'forge' || body.incantation?.name !== 'Blazing Cyclone') {
    throw new Error(`unexpected response: GET ${JSON.stringify(mode)}, POST ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  const tts = await import(pathToFileURL(join(out, 'api/tts.js')).href);
  const ttsInfo = await (await tts.GET()).json();
  const ttsPost = await tts.POST(new Request('http://localhost/api/tts', { method: 'POST', body: JSON.stringify({ text: 'Hello.' }) }));
  if (ttsInfo.enabled !== false || ttsPost.status !== 204) {
    throw new Error(`unexpected /api/tts without a key: GET ${JSON.stringify(ttsInfo)}, POST ${ttsPost.status}`);
  }
  const talkMod = await import(pathToFileURL(join(out, 'api/talk.js')).href);
  const talkRes = await (await talkMod.POST(new Request('http://localhost/api/talk', { method: 'POST', body: JSON.stringify({ text: 'hello', role: 'Elder', floor: 0 }) }))).json();
  if (talkRes.mode !== 'mock' || typeof talkRes.reply !== 'string' || !talkRes.reply) throw new Error(`unexpected /api/talk: ${JSON.stringify(talkRes)}`);
  const sttMod = await import(pathToFileURL(join(out, 'api/stt.js')).href);
  const sttInfo = await (await sttMod.GET()).json();
  if (sttInfo.enabled !== false) throw new Error(`unexpected /api/stt without a key: ${JSON.stringify(sttInfo)}`);
  console.log(`check:api: ok (${seen.size} files run under plain Node ESM; GET → ${mode.mode}, POST → ${body.intent} "${body.incantation.name}"; tts → off without a key; talk → written reply; stt → off without a key)`);
} catch (err) {
  console.error('check:api: the function failed under plain Node ESM:\n ', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
