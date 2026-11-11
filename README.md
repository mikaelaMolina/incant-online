<p align="center"><img src="public/brand/logo.svg" alt="Incant Online" width="520"></p>

# Incant Online

**Say it. Cast it. Break the world on your own terms.**

**Incant Online** is a browser-based, voice-first 3D action RPG where your spoken words become real-time worlds and working combat abilities. You play an **Incanter** climbing **the Spire**. There are no spell menus or fixed level lists—you **speak them into existence**. 

Describe a setting and the game builds it in 3D. Describe an ability (*"a spinning fire slash that hits three times"*) and it becomes a working spell with real physics hitboxes, status effects, damage, and cooldowns—cast instantly whenever you say its name aloud. As you climb higher, reality bends further to your voice: each new floor can grow weirder, wilder, and more surreal based on whatever you dream up, yet **the game never breaks, whatever you say**.

> Built with **TypeScript, Three.js, and Rapier physics** in the browser, backed by lightweight serverless AI functions (**Claude + ElevenLabs**). **Best in Chrome or Edge.** 100% playable offline or without API keys via built-in **Mock Mode**.

---

## Contents

- [For judges: a two-minute tour](#for-judges-a-two-minute-tour)
- [What you can do](#what-you-can-do)
- [The problem we're solving](#the-problem-were-solving)
- [How AI is used](#how-ai-is-used)
- [How this meets the hackathon brief](#how-this-meets-the-hackathon-brief)
- [Run it locally](#run-it-locally)
- [How to play & controls](#how-to-play--controls)
- [Browser support & privacy](#browser-support--privacy)
- [Under the hood](#under-the-hood): architecture, the Arbiter, combat matrix, AI fallbacks, project structure, scripts, testing, deployment, performance
- [Roadmap](#roadmap)
- [Credits and licence](#credits-and-licence)

---

## For judges: a two-minute tour

1. **Speak your first world into existence.** On the start screen, hold **V** (or the mic button) and describe any place, type one and press **Build**, or use **Choose it** to mix and match cards.
2. **Explore the prologue village.** You arrive in *The Threshold*—a peaceful camp at the base of the Spire—while your Floor 1 world builds seamlessly in the background. Walk (**WASD**) up to villagers, hold **V** (or press **Enter**) to ask them anything, and take your first quest from the **Knight**.
3. **Enter your world.** Step through the glowing gate into Floor 1. Strike with **Left Click** and cast your starter Incantations with keys **1–3**.
4. **Invent & refine spells on the fly.** Hold **V** and say: *"a chain of lightning that bounces to four enemies"*. Once it lands on your Grimoire bar, **say its name aloud** to cast it. Then tweak it live: *"make it ice"*, *"add a stun"*, or *"make it wider"*.
5. **Break the world on your own terms.** As you climb from floor to floor, push the Spire to its limits. Ask for bizarre biomes, surreal mashups, or impossible god-tier spells: *"kill everything instantly"*, *"turn enemies into frogs"*, *"what's the weather in Paris?"*, *"asdf"*. The higher you climb, the weirder the world can get—and every single prompt resolves into a playable floor, a balanced spell, or an in-character reply. Never an error screen.

### Prompts worth trying

| Where | Say or type | What happens |
| --- | --- | --- |
| **Start screen** | *"a volcano fortress at dusk"* | Generates a 3D cavern fortress at dusk as Floor 1 |
| **Village** | *"who are you?"* / *"what's beyond the gate?"* | The villager answers aloud in character from their lore |
| **Anywhere** | *"a spinning fire attack that hits three times"* | Forges a new 3-hit spin Incantation, balanced by the Arbiter |
| **Anywhere** | *"make it ice"* · *"add a stun"* | Mutates and re-balances your last Incantation in place |
| **At a floor gate** | *"a cursed neon graveyard with ghost archers"* | Warps the next Spire floor into a weirder custom arena |
| **Anywhere** | *"kill everything instantly"* | Steered into the strongest legal blast, with an in-character warning |

---

## What you can do

- **Shape—and warp—the Spire floor by floor.** Describe your starting world in plain language or with visual cards. Each time you clear a floor, step into the gate and speak the next floor into being. As you ascend, reality loosens—let each new floor get stranger and more chaotic on your own terms.
- **Forge & mutate spells by voice.** Describe any combat ability and watch it become a validated `IncantationSpec` on your Grimoire bar. Refine it mid-run (*"remove the burn"*, *"make it wider"*) without losing its slot.
- **Recite to cast in under 40 ms.** Speak a spell's name (*"Frost Comet"*) and it fires immediately via local fuzzy matching (Fuse.js)—even from the live transcript before you finish speaking, with zero network latency.
- **Talk to living NPCs.** Begin in a peaceful village with an Elder, Villager, Knight, and Wanderer, plus guides on every floor. With an API key, Claude roleplays each character in their distinct voice and remembers your conversation.
- **Complete quests & trade in the village.** Earn gold and XP from monsters and NPC quests. Visit the Merchant for potions (**Q** / **E**) and permanent stat charms, or pay the Innkeeper to rest. Every third floor (after a Guardian boss) loops back to the village to regroup.
- **Hear the Spire speak.** The Arbiter and NPCs speak via ElevenLabs AI voices (with pre-recorded fixed lines and browser neural voice fallbacks).

---

## The problem we're solving

LLMs are great at understanding player intent, but letting an AI *write runtime game code* is slow, unsafe, and fragile: one hallucinated response can crash the game or shatter combat balance. 

We asked: **Can spoken language drive both a 3D world and real-time combat mechanics—letting players push the game into weird, uncharted territory—without ever letting the AI break the game?**

Our solution is a strict **division of labour between AI imagination and deterministic code**:

1. **The AI only outputs data, never code.** Claude populates strict JSON schemas (`IncantationSpec`, `FloorSpec`) using existing CC0 3D models and enemy archetypes.
2. **Double Zod validation & auto-repair.** Schemas clamp out-of-range numbers, map unknown terms to valid ones (*"flames"* → `fire`, *"bolt"* → `orb`), and fill safe defaults on both the server and client.
3. **The Arbiter has the final word.** A deterministic math referee scores every spell, calculates cooldowns and mana costs, swaps out game-breaking effects (like instant kills or 60-second invulnerability), and explains its ruling in one lore-friendly sentence.
4. **One generic physics runner.** A single combat engine executes any combination of delivery `type`, hitbox `shape`, radius, hit count, chain, and status effect in Rapier physics.
5. **Fast path local, slow path hidden.** Casting by voice is 100% local. Floor generation happens asynchronously while you explore the prologue village.
6. **Unbreakable fallbacks.** Timeouts, bad JSON, rate limits, or missing API keys seamlessly fall back to a local keyword parser, pre-forged spells/floors, written NPC dialogue, and browser speech.

---

## How AI is used

**AI does the *understanding* and the *talking*; deterministic code does the *deciding*.**

### 1. Interpret: words → game data (`/api/interpret`)
Everything you say that isn't a spell name, system command, or NPC chat goes to `/api/interpret`. Claude (`claude-haiku-5-5` by default for low latency) responds with structured JSON in one of three intents: **forge** an Incantation (~2 s), **build** a floor (~5 s), or **reply** in character.
- *"Make it…"* refinements include your last spell and current floor context so only the requested attributes change.
- Impossible asks are steered, not refused: *"turn enemies into frogs"* becomes a stun; *"stop time"* becomes a freeze—each with an in-character explanation.

### 2. NPC conversation (`/api/talk`)
Talking to villagers or floor guides sends your prompt, the NPC's persona, the current story chapter, and recent dialogue history to Claude. Replies are capped at two short spoken sentences and never break character.

### 3. The Arbiter: deterministic balancing (Not AI)
Pure TypeScript rules (`src/arbiter`) run on **every** Incantation after the LLM:
- Calculates power: `P = d × h × (1 + r/4) × (1 + 0.5c) + E`
- Enforces cooldown (`max(requested, ceil(P / 14))`, capped at 60 s by scaling down damage if needed) and mana (`round(P × 0.2)`).
- Explains adjustments in character: *"The Spire resists such power: cooldown raised to 60 s."*

### 4. Voice Input & Output (`/api/stt` & `/api/tts`)
- **Speech In:** Uses the browser's live Web Speech API (Chrome/Edge) with push-to-talk (**V**). In browsers without Web Speech (Firefox, Brave, Opera), audio clips route through `/api/stt` (ElevenLabs Speech-to-Text). Fuse.js fuzzy matching ensures a misheard *"Blazing Cycle On"* still casts *Blazing Cyclone*.
- **Speech Out:** ElevenLabs TTS (`/api/tts`) voices the Arbiter and NPCs. Fixed story lines are pre-recorded (`npm run voices`) for zero runtime cost; dynamic lines are cached on generation. **All voices are AI-generated, not human.**

### Built with AI
Developed with the assistance of **Claude Code** (Anthropic). Every AI service, library, and CC0 asset is fully documented with its provider and licence in [CREDITS.md](CREDITS.md).

---

## How this meets the hackathon brief

| Requirement | How Incant Online meets it |
| --- | --- |
| **Runs fully in a desktop browser; serverless backend** | WebGL2 client (Three.js + Rapier) with four lightweight Vercel serverless functions: `/api/interpret`, `/api/talk`, `/api/tts`, `/api/stt`. |
| **Plain language drives both 3D scenes & working logic** | Spoken descriptions become 3D floors (`FloorSpec`: biome, lighting, props, enemies) and executable spells (`IncantationSpec`: hitboxes, damage, status effects, cooldowns). |
| **Resilient to any judge prompt (including off-topic/chaos)** | Every input resolves to a floor, a spell, or an in-character reply—never an error page. Verified by ~300 unit tests and `npm run judge-test`. |
| **Permissive dependencies & assets only** | Strictly MIT, Apache-2.0, BSD, ISC, Zlib, and CC0. All 3D models, animations, and audio are CC0. Plain HTTP calls replace non-permissive SDKs. |
| **Full attribution** | [CREDITS.md](CREDITS.md) lists every library, asset pack, AI model/voice service, and AI coding assistant. |
| **No secrets in repo & strict privacy** | Keys live only in server env vars (`.env` is git-ignored). Push-to-talk only; our backend never stores audio. |
| **Original IP & Open Licence** | All world lore, characters, and mechanics are original. Released under the [MIT Licence](LICENSE). |

---

## Run it locally

**Requirements:** Node.js 22.18+ (24 recommended) and a desktop browser (**Chrome** or **Edge** recommended).

```bash
git clone [https://github.com/mikaelaMolina/incant-online.git](https://github.com/mikaelaMolina/incant-online.git)
cd incant-online
npm install
npm run dev            # Opens http://localhost:5173 (serves both client and /api)