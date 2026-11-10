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
- HTML/CSS overlay for the HUD (no 3D UI), styled with shadcn/ui-style components from `basecoat-css` (prebuilt CSS) re-skinned chunky and blocky in `src/ui/style.css` (thick ink outlines, solid drop shadows, sunny yellow, few words), and `lucide` icons. No Tailwind build step: Tailwind v4 depends on `lightningcss` (MPL-2.0). No React. Decided with the owner on 2026-11-10.
- Backend: Vercel serverless functions (Node) in `/api`
- LLM: Anthropic Messages API via env vars `ANTHROPIC_API_KEY`, `LLM_MODEL` (default `claude-haiku-5-5`, a fast model for low latency) and `LLM_MODE` (see "LLM modes"). Request JSON only, via structured outputs (`output_config.format`).
  Call it over raw HTTP (`fetch`), not `@anthropic-ai/sdk`: the SDK's dependency tree includes `fast-sha256` (Unlicense), which is not on the allowed licence list. Decided with the owner on 2026-11-04.
- Speech in: Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`); fallback: MediaRecorder audio → `/api/stt`
- Speech out: ElevenLabs text-to-speech (`eleven_flash_v2_5`, voice "Eldrin - Crisp British Baritone" `6WwXjDDEMyNmFG95zycZ`) via `/api/tts` when `ELEVENLABS_API_KEY` is set (raw HTTP, no SDK; one paid key); if it fails, `window.speechSynthesis` with the most natural browser voice. Fixed lines live in `src/voice/arbiterLines.ts` and are pre-recorded with `npm run voices` into `public/assets/voice/` (no credits at runtime); generated lines are cached in server memory and per session. NPCs use the same narrator and voice. The start screen states the voice is AI-generated. Decided with the owner on 2026-11-10 (ElevenLabs chosen over OpenAI).
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
  game/      scene, player, camera, input, floor loader, gate, story, NPC
api/         interpret.ts, talk.ts, stt.ts (Vercel functions); api/_lib/ holds shared backend code (not deployed as functions)
  _lib/mock/ the MOCK-mode keyword parser
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

## LLM modes (`LLM_MODE`)

There is no Anthropic API key yet, so the game must be fully playable without one.

- `LLM_MODE=mock`, or `ANTHROPIC_API_KEY` missing (the default) → **mock mode**. `/api/interpret` never calls an LLM. A local keyword parser (`api/_lib/mock/`) maps words to fields: fire/ice/lightning/… → element, slash/spin/beam/… → shape, "three hits" → hits, forest/castle/desert/cave/… → floor biome, "make it ice" refines the last Incantation or floor. Anything unrecognised → an in-character Arbiter reply, or a cached item from `src/fallback/` when the player clearly asked for something to be made.
- `ANTHROPIC_API_KEY` set (and `LLM_MODE` not `mock`) → **llm mode**: the Messages API with the same response schema.
- `LLM_MODE=llm` without a key falls back to mock (never an error).
- Both modes return the same `InterpretResponse` and go through the same path: `InterpretResponse` zod validation on the server and again on the client, then the Arbiter on every Incantation. Switching to the real LLM must only mean setting the key.
- The client shows a small "Mock mode" label (top right) whenever the backend is in mock mode, and "Offline: cached Incantations" when `/api` can't be reached.
- `GET /api/interpret` returns `{ mode }`; responses also carry `mode` and `source` (`mock` | `llm` | `cache`).

## Backend rules (/api)

- Input cap 300 characters; per-IP rate limit (20 requests / 10 min); 8 s timeout.
- On any failure or limit: return a cached item from `src/fallback/` (10 Incantations, 3 floors), never an error page.
- System prompt includes the schema, allowed values and 4–6 example pairs (generated from the mock parser so both modes agree).
- Don't send `temperature`/`top_p`/`top_k`: current Claude models reject them (400). Use `output_config.effort: "low"` for latency instead. (Replaces the earlier "temperature 0.3–0.5" rule.)

## Performance targets

60 fps on a mid-range laptop (30 fps minimum). Recite → cast < 500 ms. Forge < 6 s (p90). Floor build < 10 s.
First load < 8 s, total download < 25 MB. < 150 draw calls (instance props). < 3,000 particles.

## Controls

WASD move, mouse aim, left click basic attack, Space dodge, V push-to-talk, Enter text input.

## Plan

Done (see git log):
1. Scaffold: Vite 7 + strict TypeScript + Three.js, folder layout, MIT, CREDITS.
2. Third-person Incanter: WASD, mouse aim, dodge, follow camera, Rapier character controller.
3. Asset manifest (`npm run manifest`), FloorSpec + floor loader with instancing, starting arena.
4. Enemies (melee / ranged / tank) with idle → chase → attack → flee, health bars, basic attack.
5. Assets pruned to what the manifest uses; raw packs in git-ignored `assets-src/`.
6. Voice: push-to-talk (Web Speech + MediaRecorder → `/api/stt`), transcript, text box, start screen.
7. LLM modes: mock keyword parser, raw-HTTP LLM path (untested until a key exists), IncantationSpec / InterpretResponse schemas, the Arbiter (+ required test), 10 cached Incantations + 3 floors, client router (forge → Arbiter → Grimoire, build → load floor, reply → transcript), "Mock mode" label.
8. Incantation runner (`src/combat`): every type × shape (`castPlan.ts`, pure + tested), chain_targets, status effects on enemies, heal/ward/dash on the Incanter, mana + cooldowns; VFX presets per shape/element + bloom (`src/vfx`); test Incantations on keys 1–3; `GameController.castIncantation(spec)` for the Grimoire to call.
9. Voice router (`src/voice/intentRouter.ts` + `commandRouter.ts`): recite with Fuse.js (threshold 0.4, also on interim transcripts, no network), system commands (open/close Grimoire, next floor), refine (keeps the bar slot, even when renamed), forge → Arbiter → Grimoire bar (6 stable slots, keys 1–6, LRU when full) with cooldown sweeps, Grimoire panel. Talk route is wired but closed until the guide NPC exists.

9c. Build intent + gate: "The Spire reshapes…" curtain, request budget with cached-floor fallback (< 10 s), floor build failure → starting arena; gate opens when a floor is cleared, words said inside it build the next floor (re-asked explicitly, then cached); reply lines shown and spoken (`src/voice/narrator.ts`, silent while push-to-talk is held).
9d. Fallbacks: `src/fallback/fallback.ts` shared by server and browser (closest cached item by element/type/shape/biome; refine kept locally; replies for chat; per-reason lines); 3 dedicated pre-built floors (forest, castle, ice; the starting arena is separate); browser handles unreachable / timeout (7 s, 6 s at the gate) / 429 without retry; never repeats a Grimoire Incantation or the current floor.
9e. Profiling + polish: pooled effect materials and shader warm-up (no compiles mid-fight), background shader compile at load and on enemy spawn, adaptive quality (MSAA then resolution, applied off-fight), 5-level bloom; CC0 sounds (`src/audio/sfx.ts`, credited), camera look-ahead / shake / FOV kick (reduced-motion aware), damage numbers, HP lag + low-HP edge, cooldown sweeps, sound toggle (M), narrow-window layout.

9f. RPG overhaul: animated Wizard Incanter (`src/game/incanterModel.ts`), hit-stop / squash / death bursts, progression (`src/game/progression.ts`: XP, levels raise HP/mana only, floor counter, enemy scaling, a guardian boss every third floor), health/mana orb drops, unit frame + XP strip + boss bar + floor title cards, spoken Arbiter intro, CC0 Quaternius monsters per biome (`src/schemas/monsters.ts`, shared by mock, prompt and client).

9g. Storyline + prologue village: narrative engine (`src/game/story.ts`, five chapters, story beats at milestone floors, chapter-aware subtitles, story-aware LLM context). The climb starts in a peaceful prologue (floor 0, "The Threshold": a camp with no enemies) with four villagers (Elder, Villager, Knight, Wanderer; Quaternius CC0 models, `src/game/npc.ts`) who greet you and answer in character (`prologueReply`), and the Arbiter's prologue narration. The world described or chosen on the start screen is built in the background (`CommandRouter.prepareWorld`) and the village gate (open from the start) leads into it as floor 1 (`enterPreparedWorld`). Each combat floor has one guide NPC (`guideReply`). NPC lines are shown under the NPC's name and spoken in the Arbiter's voice.

Next:
9b. Judgement card UI (show the Arbiter's verdict when an Incantation is forged).
10. Speak more Arbiter lines (forge verdicts) + `/api/stt`.
11. `/api/stt` (needs a speech-to-text provider; until then the client answers in character).
12. Deploy to Vercel: verify `/api` runs there (relative ESM imports may need explicit `.js` extensions or a bundling step; JSON imports may need import attributes). Set `ANTHROPIC_API_KEY` there to switch on llm mode, then test the real LLM path end to end.
13. Polish: performance pass (60 fps, < 150 draw calls), README, demo video.

## How to work in this repo

- Work in small steps: one feature per task. Before big tasks, propose a short plan and wait for approval.
- After each change: run `npm run build` (and tests if present), fix errors, then summarise what to test in the browser.
- Commit after every working step with a clear message.
- Never commit `.env`. Never weaken the hard rules above to make something work; ask instead.
- Keep the README current: what the project is, how to run it, the problem explored, how AI is used, privacy note, "best in Chrome or Edge".
