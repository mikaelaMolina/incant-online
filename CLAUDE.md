# Incant Online — project instructions for Claude Code

Incant Online is a browser-based, voice-first action RPG built for an AI builder hackathon (2026).
Players speak abilities ("Incantations") and places ("floors") into existence, then cast Incantations by saying their names.
Tagline: "Say it. Cast it."

Submission deadline: 11 Nov 2026, 16:30 CEST (UTC+2) = 22:30 Philippine time. The build is frozen on 10 Nov.

## Hard rules (hackathon terms and conditions — never break these)

1. Runs fully in a desktop web browser. The backend may run separately (serverless). (6.1, 6.3)
2. Plain language must become BOTH 3D scenes (floors) AND working logic (Incantations). (6.1)
3. Judges may type their own prompts, including off-topic ones. Every input must end in a floor, an Incantation or an in-character Arbiter reply. Never show a raw error or crash. (9.4)
4. Only use dependencies and assets with MIT, Apache-2.0, BSD, ISC, Zlib or CC0 licences.
   NEVER add anything GPL/LGPL/AGPL, copyleft, share-alike (CC BY-SA), non-commercial (NC) or evaluation-only. (7.2)
   Before adding any npm package or asset, check its licence and add it to CREDITS.md in the same commit.
5. Credit every third-party and AI component in CREDITS.md with source, provider and licence, including AI coding assistants (Claude Code) and the LLM and speech APIs. (7.4)
6. No secrets in the repo: API keys only in `.env` (git-ignored) and the hosting platform's environment variables. Never send keys to the client. (7.2.6)
7. Privacy: push-to-talk only; the start screen and README state that browser speech recognition may send audio to the browser vendor; the backend never stores audio. (7.2.6)
8. No logos, names or branding of the hackathon organiser anywhere in the game, repo or video. (13.4)
9. Original IP only. Inspired by the VRMMO anime genre, but never use names, characters, phrases, art or UI from existing franchises. (12.1.1)
10. Repo licence: MIT.

## Stack

- TypeScript (strict), Vite
- Three.js for rendering; `postprocessing` (bloom) for glow
- `@dimforge/rapier3d-compat` for physics and hitboxes
- `fuse.js` for fuzzy name matching; `zod` for all schemas (shared by client and backend)
- HTML/CSS overlay for the HUD (no 3D UI)
- Backend: Vercel serverless functions (Node) in `/api`
- LLM: Anthropic API via env vars `ANTHROPIC_API_KEY` and `LLM_MODEL` (default to a fast model for low latency). Request JSON only.
- Speech in: Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`); fallback: MediaRecorder audio → `/api/stt`
- Speech out: `window.speechSynthesis`
- Assets: CC0 low-poly packs from Kenney and Quaternius in `public/assets/`, listed in `public/assets/manifest.json`

Do not add other frameworks (no React, no game engines) unless asked.

## Folder layout

```text
src/
  game/      scene, player, camera, input, floor loader
  combat/    incantation runner, hit detection, status effects
  enemies/   state machines, EnemySpec loader
  voice/     speech input, push-to-talk, intent router, fuzzy matcher
  arbiter/   power score and balancing rules (pure functions + tests)
  vfx/       effect presets per shape/element, bloom setup
  ui/        HUD, judgement card, Grimoire bar, transcript, start screen
  schemas/   zod: IncantationSpec, EnemySpec, FloorSpec, InterpretResponse
  fallback/  cached Incantations and floors used when the API fails
api/         interpret.ts, talk.ts, stt.ts
public/assets/
README.md  CREDITS.md  LICENSE
```

## Terminology (use these names in code and UI)

Incanter = player. Incantation = spoken ability. Forging = creating one (LLM). Reciting = casting by name (local).
The Arbiter = balance system and narrator voice. The Grimoire = saved Incantations (max 6 on the bar).
The Spire = the tower. Floor = one level. Awakening phrase = "I speak, I enter".

## Data schemas

The LLM never writes code. It only fills these JSON shapes. Validate everything with zod, clamp numbers to range, map unknown enum values to the nearest valid value, retry once on parse failure, then fall back.

### IncantationSpec

| Field | Allowed |
| --- | --- |
| name | string, 1–32 chars |
| flavor | string, max 120 chars |
| type | melee_combo, projectile, area, beam, chain, buff, dash |
| shape | slash, thrust, spin, cone, circle, line, orb |
| hits | 1–5 |
| radius | 1–8 (metres) |
| damage_per_hit | 5–60 |
| element | physical, fire, ice, lightning, wind, light, shadow |
| status_effect | { kind: none, burn, freeze, stun, slow, knockback, heal; dps?; duration? (0–10 s) } |
| chain_targets | 0–5 |
| cooldown | 1–60 s |
| mana_cost | set by the Arbiter |
| vfx | { color: hex, trail: boolean, particles: embers, frost, sparks, leaves, motes, smoke } |

Example:

```json
{
  "name": "Blazing Cyclone",
  "flavor": "Three spinning cuts wreathed in fire.",
  "type": "melee_combo",
  "hits": 3,
  "shape": "spin",
  "radius": 3.5,
  "damage_per_hit": 18,
  "element": "fire",
  "status_effect": { "kind": "burn", "dps": 4, "duration": 3 },
  "chain_targets": 0,
  "cooldown": 8,
  "mana_cost": 20,
  "vfx": { "color": "#ff6a1a", "trail": true, "particles": "embers" }
}
```

### EnemySpec

`{ id, archetype: melee|ranged|tank|boss, model (manifest id), hp, speed, damage, aggro_range, flee_threshold (0–1), attack_pattern, phases?: [{ at_hp (0–1), change }] }`
Every enemy uses a state machine: idle → chase → attack → flee.

### FloorSpec

`{ name, biome: forest|ruins|ice|desert|cavern|castle|void, lighting: { time_of_day, fog_density, ambient_color }, size: small|medium|large, props: [{ model, x, z, rotation, scale, tint? }], spawns: [{ enemy (EnemySpec), count }] }`
The starting arena is itself loaded from a default FloorSpec. Props only come from `public/assets/manifest.json`. Never generate meshes at runtime.

### InterpretResponse (from /api/interpret)

`{ intent: "forge" | "build" | "reply", incantation?: IncantationSpec, floor?: FloorSpec, reply?: string }`

## The Arbiter (deterministic code, runs AFTER the LLM, on the client)

Power score:

P = d × h × (1 + r/4) × (1 + 0.5c) + E

d = damage_per_hit, h = hits, r = radius (area shapes only: spin, cone, circle; otherwise 0), c = chain_targets,
E = burn dps × duration; 15 per second of stun or freeze; 8 per second of slow; 10 for knockback; heal = amount healed.

Rules, in order:
1. Clamp every field to its range.
2. Ban instant kills, invulnerability over 3 s and self-buffs over +50%; swap to the closest allowed effect.
3. cooldown = max(requested, ceil(P / 14)).
4. If P / 14 > 60, scale damage down until cooldown ≤ 60; cooldown cap is 60 s.
5. mana_cost = round(P × 0.2).
6. Explain any change in ONE templated sentence (no LLM), e.g. "The Spire resists such power: cooldown raised to 60 s, damage reduced by 40%."

Required unit test: Blazing Cyclone above → P ≈ 113, cooldown 9, mana 23, accepted.

## Voice routing (src/voice)

Push-to-talk: hold V or the on-screen mic button. Show a live transcript. Text box (Enter) accepts the same input.
Order of checks:
1. Recite — Fuse.js match against Grimoire names (threshold 0.4) → cast instantly, no network.
2. System command — fixed phrases ("open Grimoire", "next floor") → local.
3. Refine — starts with "make it", "add", "remove" → /api/interpret with the last Incantation or floor attached.
4. Talk — player near the guide NPC → /api/talk.
5. Everything else → /api/interpret → forge, build or reply.

## Backend rules (/api)

- Input cap 300 characters; per-IP rate limit (20 requests / 10 min); 8 s timeout.
- On any failure or limit: return a cached item from `src/fallback/` (10 Incantations, 3 floors), never an error page.
- System prompt includes the schema, allowed values and 4–6 example pairs. Temperature 0.3–0.5.

## Performance targets

60 fps on a mid-range laptop (30 fps minimum). Recite → cast < 500 ms. Forge < 6 s (p90). Floor build < 10 s.
First load < 8 s, total download < 25 MB. < 150 draw calls (instance props). < 3,000 particles.

## Controls

WASD move, mouse aim, left click basic attack, Space dodge, V push-to-talk, Enter text input.

## How to work in this repo

- Work in small steps: one feature per task. Before big tasks, propose a short plan and wait for approval.
- After each change: run `npm run build` (and tests if present), fix errors, then summarise what to test in the browser.
- Commit after every working step with a clear message.
- Never commit `.env`. Never weaken the hard rules above to make something work; ask instead.
- Keep the README current: what the project is, how to run it, the problem explored, how AI is used, privacy note, "best in Chrome or Edge".
