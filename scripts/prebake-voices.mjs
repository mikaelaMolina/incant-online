#!/usr/bin/env node
// Pre-record the Arbiter's fixed lines with the ElevenLabs voice, so they cost no credits at runtime.
//
//   npm run voices            # record lines that are new or changed; keep the rest
//   npm run voices -- --force # re-record everything (e.g. after changing TTS_VOICE)
//
// Reads ELEVENLABS_API_KEY (and TTS_VOICE / TTS_MODEL) from .env, like /api/tts. Writes MP3s and a manifest to
// public/assets/voice/; the game plays a line from there when its text matches, and only calls
// /api/tts (or the browser voice) for lines with names in them.
//
// The lines come from src/voice/arbiterLines.ts (Arbiter lines + the mock parser's replies).
// Shared modules are loaded through Vite so they resolve exactly as in the game.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, loadEnv } from 'vite';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'public/assets/voice');
const MANIFEST = join(OUT, 'manifest.json');
const force = process.argv.includes('--force');

async function main() {
  const env = { ...loadEnv('development', ROOT, ''), ...process.env };
  const server = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prebakedLines, lineKey } = await server.ssrLoadModule('/src/voice/arbiterLines.ts');
    const { stripForSpeech } = await server.ssrLoadModule('/src/voice/speechText.ts');
    const tts = await server.ssrLoadModule('/api/_lib/tts.ts');
    const cfg = tts.resolveTts(env);
    if (!cfg.enabled) {
      console.error('voices: no ELEVENLABS_API_KEY in .env. Nothing recorded.');
      process.exitCode = 1;
      return;
    }
    mkdirSync(OUT, { recursive: true });
    const old = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { lines: {} };
    const voice = `${cfg.voice}|${cfg.model}`;
    const sameVoice = old.voice === voice;
    const manifest = { voice, generated: new Date().toISOString().slice(0, 10), lines: {} };
    let made = 0;
    let kept = 0;
    let failed = 0;
    let chars = 0;

    for (const line of prebakedLines()) {
      const key = lineKey(line);
      const file = `${createHash('sha1').update(key).digest('hex').slice(0, 12)}.mp3`;
      if (!force && sameVoice && old.lines?.[key] === file && existsSync(join(OUT, file))) {
        manifest.lines[key] = file;
        kept++;
        continue;
      }
      const text = tts.clipForSpeech(stripForSpeech(line));
      const audio = await tts.generateSpeech(text, cfg, { timeoutMs: 30_000, log: (m) => console.warn(`  ${m}`) });
      if (!audio) {
        failed++;
        console.warn(`✗ ${text.slice(0, 70)}`);
        continue;
      }
      writeFileSync(join(OUT, file), audio);
      manifest.lines[key] = file;
      made++;
      chars += text.length;
      console.log(`✓ ${text.slice(0, 70)}`);
    }

    // Drop recordings of lines that no longer exist.
    const used = new Set(Object.values(manifest.lines));
    for (const f of readdirSync(OUT)) if (f.endsWith('.mp3') && !used.has(f)) unlinkSync(join(OUT, f));
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`voices: ${made} recorded (~${chars} characters of credits), ${kept} kept, ${failed} failed → public/assets/voice/`);
    if (failed) process.exitCode = 1;
  } finally {
    await server.close();
  }
}

await main();
