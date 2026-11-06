# Incant Online

**Say it. Cast it.**

Incant Online is a browser-based, voice-first action RPG. You play an **Incanter** climbing **the Spire**. You don't pick spells from a menu: you *describe* them out loud ("a spinning fire slash that hits three times") and the Spire forges them into working abilities. Then you cast them by saying their names. When a floor is cleared, a gate opens, and you describe the next floor into being.

Plain language becomes both **game logic** (Incantations with real hitboxes, damage, status effects, cooldowns and mana) and **3D places** (floors with lighting, props and enemies), in real time, in the browser, and it never breaks, whatever you say.

> TypeScript, Three.js and Rapier physics. Runs fully in a desktop browser; the only backend is one serverless function. **Best in Chrome or Edge.**

---

## Contents

- [What you can do](#what-you-can-do)
- [The problem we're exploring](#the-problem-were-exploring)
- [How AI is used](#how-ai-is-used)
- [Run it locally](#run-it-locally)
- [How to play](#how-to-play)
- [Browser support](#browser-support)
- [Privacy](#privacy)
- [Under the hood](#under-the-hood): how it works, the Arbiter, combat, LLM modes and fallbacks, project structure, scripts, testing, deploying, performance
- [Roadmap](#roadmap)
- [Credits and licence](#credits-and-licence)

---

## What you can do

- **Forge Incantations by voice or text.** Describe an ability; it becomes a validated `IncantationSpec`, is balanced by the Arbiter, and lands on your Grimoire bar.
- **Recite to cast.** Say an Incantation's name ("Frost Comet") and it fires immediately, matched locally. No network round-trip; it can fire from the live transcript before you finish speaking.
- **Refine what you made.** "make it wider", "add a stun", "remove the burn", "make it ice". The Incantation keeps its slot and is re-balanced.
- **Build floors by description.** "a cozy village at night", "build a frozen castle with archers". A new floor rises behind a "The Spire reshapes…" transition.
- **Climb the Spire.** Defeat every enemy and a gate opens; step in and describe the next floor.
- **Fight with whatever you invent.** 7 delivery types × 7 shapes, multi-hit combos, chain lightning, burn / freeze / stun / slow / knockback / heal, wards and dashes, with glowing shape-and-element effects, sounds, damage numbers and screen shake.
- **Ask for anything.** Off-topic, nonsense or impossible requests always end in a floor, an Incantation or an in-character reply from the Arbiter, never an error. "Kill everything instantly" gets the strongest blast the rules allow, and an explanation.
- **Play without an API key.** Mock mode uses a local keyword parser that produces the same JSON as the LLM.

## The problem we're exploring

Language models are good at understanding what people mean, but letting one *write game code* at runtime is slow, unsafe and fragile: a single bad answer can crash the game or break its balance. We wanted to know: **can plain spoken language drive both a playable 3D world and real game mechanics, in real time, without ever letting the model break the game?**

Our answer is a strict division of labour:

1. **The model only fills in data.** It never writes code. It fills fixed JSON shapes (`IncantationSpec`, `FloorSpec`) using structured output.
2. **Everything is validated and repaired.** Shared zod schemas clamp numbers to range, map unknown values to the nearest valid one ("flames" → fire, "bolt" → orb) and fill defaults, on the server and again in the browser.
3. **A deterministic referee has the last word.** The Arbiter scores the power of every Incantation, sets its cooldown and mana, bans instant kills and long invulnerability, and explains changes in one sentence. Balance doesn't depend on the model behaving.
4. **The engine is generic.** One runner executes *any* valid spec: every type, shape, hit count, radius, chain and status effect. A new idea needs no new code.
5. **There is always a fallback.** Timeouts, bad JSON, rate limits or no key at all end in a mock-parser result, a pre-forged Incantation or pre-built floor, or an in-character reply.
6. **The fast path is local.** Casting by name never touches the network, so combat stays responsive while the model works on something else.

## How AI is used

AI does the *understanding*; deterministic code does the *deciding*.

### 1. Interpret: words → game data (LLM)

Everything you say that isn't a spell name or a fixed command goes to `/api/interpret`. There an LLM (Claude, through the Anthropic Messages API) reads it and answers with JSON in one fixed shape: **forge** an Incantation, **build** a floor, or **reply** in character. The system prompt carries the schema, the allowed values, the prop and enemy models that exist, and six worked examples. The model never writes code, and it can only pick props and enemies the game already has.

- Its answer is validated with zod on the server and again in the browser; out-of-range numbers are clamped and unknown values mapped to the nearest valid one.
- "Make it…" requests are sent with your last Incantation and the current floor, so the model changes only what you asked for.
- Impossible asks are steered, not refused: turning foes into frogs becomes a stun, stopping time becomes a freeze, each with a sentence explaining why.
- **Without a key** (mock mode) a local keyword parser produces the same JSON, so the game is fully playable offline. **If the model fails**, is slow or rate-limited, the game answers from 10 pre-forged Incantations and 3 pre-built floors, choosing the closest match to what you asked.

### 2. The Arbiter: the model proposes, rules decide (not AI)

The Arbiter is plain, deterministic code that runs on **every** Incantation after the model, whoever produced it. It scores its power (`P = d × h × (1 + r/4) × (1 + 0.5c) + E`), sets the cooldown and mana cost from that score, caps or swaps forbidden effects (instant kills, long invulnerability, oversized heals), and explains any change in one sentence: *"The Spire resists such power: cooldown raised to 60 s."* This is what makes it safe to let a language model invent game mechanics: whatever it proposes, the game stays balanced.

### 3. Voice: speaking and being answered

- **Speech in**: the browser's speech recognition (Web Speech API) turns push-to-talk audio into text, live. Spell names are matched locally with fuzzy search (Fuse.js), so a slightly misheard "Blazing Cycle On" still casts *Blazing Cyclone*, within milliseconds.
- **Speech out**: the Arbiter's replies are spoken with the browser's text-to-speech (`speechSynthesis`), and it falls silent the moment you hold the talk key.

### Built with AI, too

This codebase was written with the help of Claude Code, an AI coding assistant by Anthropic. All AI components (Claude Code, the Anthropic Messages API, browser speech services) and every third-party library and asset are listed with provider and licence in [CREDITS.md](CREDITS.md).

## Run it locally

**Requirements:** Node.js 22.18 or newer (24 recommended) and a desktop browser (Chrome or Edge for voice).

```bash
git clone https://github.com/mikaelaMolina/incant-online.git
cd incant-online
npm install
npm run dev            # http://localhost:5173 (also serves /api)
```

That's it: with no API key the game runs in **mock mode** (a "Mock mode" label shows top-right) and is fully playable.

To use Claude for interpretation instead:

```bash
cp .env.example .env   # git-ignored
# then set ANTHROPIC_API_KEY=... in .env and restart npm run dev
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | *(empty)* | Server-side only. Empty → mock mode. |
| `LLM_MODEL` | `claude-haiku-5-5` | Model used in llm mode (a fast model, for latency). |
| `LLM_MODE` | *(unset)* | `mock` forces mock mode even with a key. |

Keys are only read by the serverless function and are never sent to the browser.

Other useful commands: `npm test` (unit and integration tests), `npm run judge-test` (ten judge-style prompts end to end), `npm run build` (type-check, production build, API check). `npm run preview` serves the production build without `/api`, so it plays in its offline fallback mode.

## How to play

1. Open the page and say **"I speak, I enter"** (hold V while speaking), or press Enter to skip voice.
2. Fight with the staff and the three starter Incantations on keys **1–3**.
3. Hold **V** and describe new Incantations; say their names to cast them.
4. Clear the floor, walk into the gate, and describe the next floor.

### Controls

| Input | Action |
| --- | --- |
| W A S D | Move (relative to the camera) |
| Mouse | Aim (the Incanter faces the cursor) |
| Left click | Staff strike (short arc in front of you) |
| Space | Dodge (brief invulnerability: roll through arrows and slams) |
| 1 – 6 (or numpad) | Cast the Incantation in that Grimoire bar slot |
| Hold V (or the mic button) | Push-to-talk: speak, then let go |
| Enter | Type instead of speaking (Enter again sends, Esc cancels) |
| M (or the button top right) | Sound on/off (effects and the Arbiter's voice) |
| F3 | Toggle the performance overlay (on by default in `npm run dev`) |

### The HUD

- **Grimoire bar** (left): six slots with mana cost, cooldown and a cooldown sweep. Slots 1–3 start with *Blazing Cyclone* (fire spin, burn), *Thunder Chain* (lightning that leaps between foes, stun) and *Frost Comet* (ice bolts that burst and freeze).
- **Mana and health** (bottom left). Mana regenerates; every Incantation's cost is set by the Arbiter.
- **Transcript** (bottom): what you said and what the Arbiter answered.
- **Mode label** (top right): "Mock mode" without a key, "Offline: cached Incantations" if the backend can't be reached.
- **Feedback**: damage numbers in the spell's colour, a trailing chunk on the health bar when you're hit, a red edge at low health, a cooldown sweep and a "ready" pop on each slot. Screen shake, camera look-ahead toward your aim and a field-of-view kick on dashes; all motion effects switch off when your system asks for reduced motion.

### Things to say

| You say | What happens |
| --- | --- |
| "a spinning fire attack that hits three times" | Forges *Blazing Cyclone* (melee spin, burn) into the next free slot |
| "Blazing Cyclone" / "cast Frost Comet" | Recites: casts instantly, no network call |
| "make it wider" · "add a stun" · "make it ice" | Refines your last Incantation in place |
| "a chain of lightning that bounces to four enemies" | Forges a chain Incantation |
| "heal me" | Forges a light healing ward |
| "build a misty forest at night with archers" | Builds a new floor |
| "put a dragon on a castle" | A castle floor with a dragon boss |
| "make it night" | Refines the current floor |
| "open Grimoire" · "close Grimoire" · "next floor" | System commands (local) |
| "kill everything instantly" | The Arbiter refuses instant death and grants the strongest blast it allows |
| "a spell that turns enemies into frogs" | The closest allowed effect (a stun), with a line explaining why |
| "what is this game?" | An in-character explanation of how to play |
| "asdf" | An in-character reply, never an error |

## Browser support

| Browser (desktop) | Status |
| --- | --- |
| **Chrome, Edge** | Recommended. Everything works: 3D (WebGL2), voice input (Web Speech API), the spoken Arbiter, sound. |
| Firefox | Plays fully with the **text box** (Enter). Firefox has no built-in speech recognition, so holding V explains that voice is unavailable and asks you to type. |
| Safari | Not tested. It should run with WebGL2; voice input and some sounds (Ogg) may not work. |
| Phones and tablets | Not supported: the game needs a keyboard and mouse. |

Requirements: **WebGL2** (without it the page shows "The Spire could not awaken"), Web Audio for sound, and a microphone for voice (optional; typing always works). Graphics quality adapts automatically: the game starts at full quality and steps down (anti-aliasing, then resolution) if your GPU can't hold about 50 fps.

## Privacy

- The microphone is **push-to-talk only** (hold V or the mic button) and closes as soon as you let go.
- Browser speech recognition **may send your audio to your browser vendor** (e.g. Google or Microsoft) to turn it into text.
- Our backend **never stores audio**. Only the text of what you said is sent to `/api/interpret`, and in llm mode on to the model provider (Anthropic).
- API keys live only in server-side environment variables and are never sent to the browser.
- The game keeps two settings in your browser's local storage (sound and voice on/off) and nothing else.

---

# Under the hood

## How it works

```mermaid
flowchart LR
  V["Voice (Web Speech) or text box"] --> P["Utterance pipeline"]
  P --> R{"Intent router"}
  R -->|"name matches the Grimoire"| C["Recite: cast locally"]
  R -->|"fixed phrase"| S["System command"]
  R -->|"refine / gate / anything else"| API["POST /api/interpret"]
  API --> M{"LLM_MODE"}
  M -->|"mock"| MP["Keyword parser"]
  M -->|"llm"| LLM["Claude, structured JSON"]
  MP --> Z["zod InterpretResponse"]
  LLM --> Z
  Z -->|"forge"| A["Arbiter"] --> G["Grimoire bar"] --> C
  Z -->|"build"| F["Floor loader + enemies"]
  Z -->|"reply"| T["Transcript + spoken line"]
  C --> RUN["Incantation runner + VFX"]
```

**Voice routing** (in this order, `src/voice/intentRouter.ts`):

1. **Recite.** Fuse.js match against Grimoire names (threshold 0.4). Cast instantly, no network.
2. **System command.** "open/close Grimoire", "next floor".
3. **Refine.** Starts with "make it", "add", "remove"…: sent with the last Incantation and the current floor as context.
4. **Gate.** While standing in an open gate, anything else describes the next floor.
5. **Everything else** → `/api/interpret` → forge, build or reply.

### Data shapes

The model (or the mock parser) only ever produces this:

```jsonc
// InterpretResponse
{ "intent": "forge" | "build" | "reply", "incantation"?: IncantationSpec, "floor"?: FloorSpec, "reply"?: string }
```

**IncantationSpec** (example):

```json
{
  "name": "Blazing Cyclone",
  "flavor": "Three spinning cuts wreathed in fire.",
  "type": "melee_combo",
  "shape": "spin",
  "hits": 3,
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

| Field | Allowed |
| --- | --- |
| type | melee_combo, projectile, area, beam, chain, buff, dash |
| shape | slash, thrust, spin, cone, circle, line, orb |
| hits / radius / damage_per_hit | 1–5 / 1–8 m / 5–60 |
| element | physical, fire, ice, lightning, wind, light, shadow |
| status_effect.kind | none, burn, freeze, stun, slow, knockback, heal (duration 0–10 s) |
| chain_targets / cooldown | 0–5 / 1–60 s |

**FloorSpec**: name, biome (forest, ruins, ice, desert, cavern, castle, void), lighting (time of day, fog, ambient colour), size, props (only models from `public/assets/manifest.json`, instanced) and enemy spawns. Each `EnemySpec` has an archetype (melee, ranged, tank, boss) and runs an idle → chase → attack → flee state machine. Meshes are never generated at runtime.

## The Arbiter (balancing)

Deterministic code that runs on every Incantation after the model (`src/arbiter`):

```
P = d × h × (1 + r/4) × (1 + 0.5c) + E
```

`d` damage per hit, `h` hits, `r` radius (area shapes only: spin, cone, circle), `c` chain targets, `E` the effect's worth (burn dps × duration, 15 per second of stun or freeze, 8 per second of slow, 10 for knockback, the amount healed).

1. Clamp every field to its range.
2. Ban instant kills, invulnerability over 3 s and self-buffs over +50%; swap in the closest allowed effect.
3. `cooldown = max(requested, ceil(P / 14))`.
4. If that would exceed 60 s, scale damage down until it fits.
5. `mana_cost = round(P × 0.2)`.
6. Explain any change in one templated sentence, e.g. *"The Spire resists such power: cooldown raised to 60 s, damage reduced by 40%."*

Blazing Cyclone above scores P ≈ 113 → cooldown 9 s, 23 mana, accepted (a required unit test).

## Combat: every type × shape

`type` decides **how** hits are delivered; `shape` decides **what area** each hit covers; `radius` scales it (`src/combat/castPlan.ts`, pure and unit-tested).

| Type | Delivery |
| --- | --- |
| melee_combo | `hits` swings around the Incanter, alternating sides |
| area | pulses on the Incanter, or on the aim point (orb) after a ground telegraph |
| projectile | bolts toward the aim; orbs and circles explode, slashes and lances pierce, cones fire a fan |
| beam | a channelled beam that follows your aim and stops at walls; spin sweeps a full circle, cone breathes |
| chain | strikes the foe nearest your aim, then leaps to `chain_targets` more at half damage |
| buff | an aura that pulses around you; heal restores HP, freeze/stun wards make you untouchable (≤ 3 s) |
| dash | dashes toward the aim with i-frames, hitting everything on the path, then finishers of the shape |

| Shape | Area of one hit |
| --- | --- |
| slash | wide arc in front |
| thrust | narrow strip |
| spin, circle | full circle |
| cone | narrow, long arc |
| line | long strip |
| orb | a ball ahead of you (or an explosion) |

Status effects on enemies: **burn** (damage over time), **freeze / stun** (can't move or attack; interrupts wind-ups), **slow** (half speed), **knockback**. Every type × shape combination is tested against a real physics world (`src/combat/incantationRunner.test.ts`).

VFX (`src/vfx`) are presets by shape (arcs, spikes, rings, shockwaves, beams, orbs, bolts, auras), coloured by element and spec, using emissive (HDR) materials, one pooled particle cloud (max 2,400 particles, one draw call) and a bloom pass tuned so only spell effects glow.

## LLM modes and robustness

| Mode | When | What interprets the words |
| --- | --- | --- |
| **mock** | No `ANTHROPIC_API_KEY`, or `LLM_MODE=mock` | Local keyword parser (`api/_lib/mock/`) |
| **llm** | Key set | Claude via the Messages API (raw HTTP, structured JSON output, low effort for latency) |

Both modes return the same `InterpretResponse` and take the same path: zod validation on the server, again in the browser, then the Arbiter. Switching to the real model only means setting the key. The system prompt includes the schema, allowed values and six example pairs **generated by the mock parser**, so both modes agree.

Safeguards on `/api/interpret`: 300-character input cap, per-IP rate limit (20 requests / 10 min), 8 s timeout, and one retry on bad JSON.

### When something fails

`src/fallback` holds **10 pre-forged Incantations** (already balanced: the Arbiter accepts them unchanged; together they cover every type, shape and element) and **3 pre-built floors** (forest, castle and ice, none of them the starting arena). They are used automatically, on the server and in the browser:

| Failure | Detected by | What the player gets |
| --- | --- | --- |
| The LLM call fails (error, refusal, bad JSON twice) | server | the closest cached item, with an in-character line |
| The LLM is too slow (8 s) | server | the same, "the Spire took too long to listen" |
| Too many requests (20 / 10 min per IP) | server | the same, "the Spire grows weary of your voice" |
| `/api` can't be reached | browser | the same, worked out in the browser; the label shows "Offline: cached Incantations" |
| `/api` hangs | browser (7 s per attempt, 6 s at the gate) | the same, in time for a floor to be built in under 10 s |
| The host answers 429 | browser | the same, at once, without retrying |

The mock parser decides only *what* was asked for: a place gets a cached floor (the closest biome), an ability gets the closest cached Incantation (element, then type and shape), "make it…" refines the player's own Incantation or floor locally instead of replacing it, and chat gets an in-character reply. A fallback never hands out an Incantation already in the Grimoire or the floor the Incanter is standing on. Every fallback still goes through zod and the Arbiter like any other answer.

Impossible or forbidden asks are steered, not refused: *"kill everything instantly"* becomes the strongest blast the Arbiter permits, *"turn enemies into frogs"* becomes a stun, each with one in-character sentence explaining the change.

## Project structure

```text
src/
  game/      scene, Incanter, camera, input, floor loader, gate
  combat/    cast planning, Incantation runner, hit detection, status effects, mana, Grimoire
  enemies/   archetypes, state machine, spawner
  voice/     push-to-talk, speech input, intent router, command router, narrator (TTS)
  arbiter/   power score and balancing rules (pure functions + tests)
  vfx/       palettes, materials, particles, shape presets, bloom
  ui/        HUD, Grimoire bar and panel, transcript, start screen, transition
  schemas/   zod: IncantationSpec, EnemySpec, FloorSpec, InterpretResponse, manifest
  fallback/  cached Incantations and floors
api/
  interpret.ts       Vercel function: GET → { mode }, POST → InterpretResponse
  _lib/              shared backend code: mode, rate limit, LLM client and prompt
  _lib/mock/         the mock-mode keyword parser
public/assets/       CC0 low-poly models (Kenney, Quaternius) + manifest.json
scripts/             manifest builder, API ESM check, judge test
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload; also serves `/api/*` from the same function files |
| `npm run build` | Type-check, production build into `dist/`, and the API ESM check |
| `npm run preview` | Serve the production build |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run judge-test` | Sends ten "judge-style" prompts to `/api/interpret` and checks every one ends in a valid floor, Incantation or reply. `-- --url https://…` tests a deployment; extra arguments are your own prompts |
| `npm run check:api` | Runs `/api` under plain Node ESM the way Vercel does (catches import problems before deploy) |
| `npm run manifest` | Regenerate `public/assets/manifest.json` after changing asset packs |

## Testing

```bash
npm test             # ~230 unit and integration tests
npm run judge-test   # end to end over HTTP against a local dev server
```

Highlights:

- **Arbiter**: the required Blazing Cyclone case, clamps, bans and the cooldown and mana formulas.
- **Combat**: every type × shape lands damage in a real Rapier world; chains split 100% / 50% / 50%; mana, cooldown, heal, ward and dash.
- **Voice routing**: recite threshold and false positives, casting from interim transcripts, refine keeps the bar slot (even when renamed), system commands, the gate.
- **Robustness**: mock-parser answers to judge-style prompts; cached floors and Incantations are valid and use real assets; request time budgets.

## Deploying

The app is a static Vite build plus one Vercel serverless function (`api/interpret.ts`).

1. Import the repo into Vercel (framework preset: Vite; build command `npm run build`; output `dist`).
2. Optionally set `ANTHROPIC_API_KEY` (and `LLM_MODEL`) in Project Settings → Environment Variables to switch on llm mode.
3. Check it: `npm run judge-test -- --url https://your-deployment.vercel.app`.

> Status: the API is verified to run under plain Node ESM (`npm run check:api`), but the first Vercel deployment and the real-LLM path have not been tested end to end yet.

## Performance

Measured on an Intel Iris Xe laptop GPU (Chromium, 1280×720, through WSL's Direct3D 12 layer, which is slower than Chrome on Windows), production build for loading, mock mode:

| Target | Budget | Measured |
| --- | --- | --- |
| Frame rate, exploring | 60 fps (30 minimum) | 55–60 fps |
| Frame rate, heavy combat (a spell every 300 ms) | 60 fps (30 minimum) | 25–105 fps depending on floor and quality level; occasional GPU stalls of 100–500 ms on this driver |
| Draw calls (whole frame, bloom included) | < 150 | 66–141 |
| Particles | < 3,000 | ≤ 380 (hard cap 2,400) |
| First load (to playable) | < 8 s | 3.7–5.6 s typical, one cold outlier at 10 s |
| Total download | < 25 MB | 6.8 MB (JS 1.9, models 1.7, textures 2.6, sounds 0.6) |
| Recite → cast | < 500 ms | under 40 ms (local, no network) |
| Floor build | < 10 s | 3–8 s, including the backend timing out |

How: instanced props; one pooled particle system; shared effect geometries and **pooled effect materials** (disposing them made the GPU recompile shaders mid-fight); shaders compiled in the background before the first frame and when enemies arrive, plus a hidden warm-up draw of every effect shader on the start screen and behind floor changes; fixed-step physics with interpolation; **adaptive quality** that starts at 4× MSAA and steps down (2× MSAA, none, then 85% and 75% resolution) if the median frame stays under ~50 fps, applying changes on the start screen or behind the floor-change curtain rather than mid-fight. Press F3 for the live overlay (fps, draw calls, triangles, particles, quality level).

## Roadmap

- Judgement card: show the Arbiter's verdict when an Incantation is forged.
- More spoken Arbiter lines, a guide NPC and `/api/talk`.
- `/api/stt` for browsers without built-in speech recognition (until then the game asks you to type).
- First Vercel deployment and a real-LLM test pass.
- Performance on more GPUs (measured so far on an Intel Iris Xe), boss phases, demo video.

## Credits and licence

Code: [MIT](LICENSE) © 2026 Mikaela Molina.

3D models: CC0 packs by [Kenney](https://kenney.nl) and [Quaternius](https://quaternius.com). Sound effects: CC0 packs by rubberduck, artisticdude and Kenney (via OpenGameArt). Libraries: Three.js (MIT), Rapier (Apache-2.0), postprocessing (Zlib), Fuse.js (Apache-2.0), zod (MIT) and others. Full list with sources and licences: [CREDITS.md](CREDITS.md).

Incant Online is an original work. All names, characters and places in it are original.
