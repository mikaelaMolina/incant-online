# Credits

Every third-party component, asset and AI service used in Incant Online. Only MIT, Apache-2.0, BSD, ISC, Zlib and CC0 licences are allowed.

## AI components

| Component | Role | Provider | Licence / terms |
| --- | --- | --- | --- |
| Claude Code | AI coding assistant used to write this codebase | Anthropic | Anthropic Commercial Terms of Service |
| Anthropic Messages API (Claude, default `claude-haiku-5-5`, set by `LLM_MODEL`) | Runtime LLM in llm mode: turns player input into Incantation / floor JSON and in-character replies. Called over raw HTTP; not used in mock mode | Anthropic | Anthropic Commercial Terms of Service |

## Speech and platform services

| Component | Role | Provider | Licence / terms |
| --- | --- | --- | --- |
| Web Speech API (`SpeechRecognition`) | Speech to text in the browser | Browser vendor (e.g. Google Chrome, Microsoft Edge) | Browser vendor's terms |
| MediaRecorder + `getUserMedia` | Records push-to-talk audio for `/api/stt` in browsers without speech recognition | Browser vendor | Browser vendor's terms |
| `window.speechSynthesis` | Text to speech for the Arbiter voice (replies, floor and gate lines) when no cloud voice is configured or it fails | Browser vendor / OS voices | Browser vendor's terms |
| ElevenLabs Text to Speech API (`eleven_flash_v2_5`, voice "Eldrin - Crisp British Baritone"; set by `TTS_MODEL` / `TTS_VOICE`) | The Arbiter's (and any NPC's) cloud voice via `/api/tts` when `ELEVENLABS_API_KEY` is set, with the browser voice as fallback. Called over raw HTTP; only the Arbiter's lines (text) are sent. The start screen says the voice is AI-generated | ElevenLabs | ElevenLabs Terms of Service and ElevenAPI Terms |
| ElevenLabs Speech to Text API (`scribe_v2`) | Turns push-to-talk recordings into text via `/api/stt` in browsers whose built-in speech recognition doesn't work (Firefox, Brave, Opera…). Raw HTTP; the audio is forwarded, never stored by us | ElevenLabs | ElevenLabs Terms of Service and ElevenAPI Terms |
| Pre-recorded Arbiter lines (`public/assets/voice/*.mp3`) | Fixed lines spoken from files instead of generated each time (`npm run voices`) | Generated with ElevenLabs (voice above) by the project | Output owned by the account holder per ElevenLabs Terms §4(c)(ii); paid plan (commercial use) |
| Vercel | Static hosting and serverless functions (planned) | Vercel Inc. | Vercel Terms of Service |

## npm dependencies

### Direct

| Package | Version | Use | Licence | Source |
| --- | --- | --- | --- | --- |
| three | 0.187.0 | 3D rendering | MIT | https://github.com/mrdoob/three.js |
| @dimforge/rapier3d-compat | 0.21.0 | Physics, character controller, collisions | Apache-2.0 | https://github.com/dimforge/rapier |
| zod | 4.6.7 | Schemas and validation (FloorSpec, EnemySpec, asset manifest) | MIT | https://github.com/colinhacks/zod |
| fuse.js | 7.5.0 | Fuzzy matching of spoken Incantation names when reciting (no dependencies of its own) | Apache-2.0 | https://github.com/krisk/Fuse |
| postprocessing | 6.39.6 | Bloom pass for glowing Incantation VFX (no dependencies of its own) | Zlib | https://github.com/pmndrs/postprocessing |
| basecoat-css | 1.1.0 | shadcn/ui-style UI components (button, card, badge, item, input, kbd) as prebuilt plain CSS; the bundle carries Tailwind CSS output (MIT). No dependencies of its own | MIT | https://github.com/hunvreus/basecoat |
| lucide | 1.71.0 | UI icons (mic, sound, close, spell steps, loading spinner), tree-shaken. No dependencies of its own | ISC | https://github.com/lucide-icons/lucide |
| vitest | 5.1.0 | Unit tests (dev only) | MIT | https://github.com/vitest-dev/vitest |
| @types/node | 24.19.2 | Node types for the dev API middleware in vite.config.ts (dev only) | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| vite | 7.3.7 | Dev server and bundler (dev only) | MIT | https://github.com/vitejs/vite |
| typescript | 7.0.2 | Type checking (dev only) | Apache-2.0 | https://github.com/microsoft/typescript-go |
| @types/three | 0.187.0 | Three.js type definitions (dev only) | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

### Transitive (installed by the packages above, dev only unless noted)

| Package | Licence |
| --- | --- |
| @dimforge/rapier3d-compat 0.12.0 (nested copy pulled in by @types/three for its type definitions) | Apache-2.0 |
| @esbuild/linux-x64, esbuild 0.28.2 | MIT |
| @rollup/rollup-linux-x64-gnu, rollup 4.67.5 | MIT |
| @tweenjs/tween.js 23.1.3 | MIT |
| @types/estree 1.0.10 | MIT |
| @types/stats.js 0.17.4 | MIT |
| @types/webxr 0.5.24 | MIT |
| @typescript/typescript-linux-x64 7.0.2 | Apache-2.0 |
| @jridgewell/resolve-uri 3.1.2, @jridgewell/sourcemap-codec 1.6.0, @jridgewell/trace-mapping 0.3.31 | MIT |
| @types/chai 5.2.3, @types/deep-eql 4.0.2 | MIT |
| @vitest/mocker 5.1.0, @vitest/spy 5.1.0 | MIT |
| assertion-error 2.0.1 | MIT |
| chai 6.3.0 | MIT |
| es-module-lexer 2.3.2 | MIT |
| estree-walker 3.0.3 | MIT |
| expect-type 1.4.0 | Apache-2.0 |
| fdir 6.5.0 | MIT |
| fflate 0.8.3 | MIT |
| magic-string 1.4.5 | MIT |
| meshoptimizer 1.1.1 | MIT |
| nanoid 3.3.20 | MIT |
| obug 3.0.0 | MIT |
| picocolors 1.1.1 | ISC |
| picomatch 4.0.7 | MIT |
| postcss 8.5.32 | MIT |
| source-map-js 1.2.2 | BSD-3-Clause |
| std-env 4.3.0 | MIT |
| tinybench 6.2.3 | MIT |
| tinyexec 1.3.1 | MIT |
| tinyglobby 0.2.17 | MIT |
| undici-types 7.24.6 (via @types/node) | MIT |
| why-is-node-running 3.2.1 | MIT |

`GLTFLoader`, `FBXLoader` (with its bundled fflate) and `SkeletonUtils` are part of the three package (`three/addons`, MIT).

The UI follows the look of shadcn/ui (MIT, https://github.com/shadcn-ui/ui) through Basecoat. Not used: Tailwind CSS as a build step, because Tailwind v4 depends on `lightningcss` (MPL-2.0), which is outside the allowed licences; Basecoat's prebuilt CSS needs no build step.

Not used: `@anthropic-ai/sdk` (Apache-2.0) was evaluated and removed because it depends on `fast-sha256` (Unlicense), which is outside the allowed licences; the Messages API is called over plain HTTP instead.

Platform-specific binaries (esbuild, rollup, typescript) share their parent package's licence on every OS.

## 3D assets (`public/assets/`)

Every model the game may load is listed with its licence in `public/assets/manifest.json`, generated by `npm run manifest` (which refuses packs whose `License.txt` is not CC0).

| Pack | Author | Licence | Source |
| --- | --- | --- | --- |
| Nature Kit (2.1) | Kenney | CC0 1.0 | https://kenney.nl/assets/nature-kit |
| Castle Kit (2.0) | Kenney | CC0 1.0 | https://kenney.nl/assets/castle-kit |
| Modular Dungeon Kit (2.1) | Kenney | CC0 1.0 | https://kenney.nl |
| RPG Characters (Nov 2020): the Incanter (Wizard) and humanoid foes | Quaternius | CC0 1.0 | https://quaternius.com |
| Ultimate Animated Character Pack (Nov 2019): 10 of 52 characters as friendly NPCs (Casual Male/Female, Casual2 Female, Chef Male, Old Classy Male/Female, Worker Male, Knight Male, Elf, Witch), converted to GLB with only the Idle, Walk and Victory animations by `scripts/pack-npc-models.mjs` | Quaternius | CC0 1.0 | https://quaternius.com/packs/ultimatedanimatedcharacter.html |
| Cute Animated Monsters (Aug 2020): 11 of 21 models (Skull, Demon, Green Demon, Ghost, Yeti, Cyclops, Tree, Cactus, Crab, Alien Tall, Yellow Dragon) | Quaternius | CC0 1.0 | https://opengameart.org/content/textured-cute-monster-pack |

CC0 does not require credit. We give it anyway, with thanks.

## Sound effects (`public/assets/audio/`)

Only the files the game plays are included; each pack folder carries its licence note.

| Pack | Author | Licence | Source | Used for |
| --- | --- | --- | --- | --- |
| 100 CC0 SFX | rubberduck | CC0 1.0 | https://opengameart.org/content/100-cc0-sfx | hits, explosions, ice, wind, light, gate gong, floor-cleared bell |
| RPG Sound Pack | artisticdude | CC0 1.0 | https://opengameart.org/content/rpg-sound-pack | swings, spell casts, floor reshaping, shadow, creature deaths (converted to 16-bit mono WAV; one file trimmed) |
| Interface Sounds (1.0) | Kenney | CC0 1.0 | https://opengameart.org/content/interface-sounds (also https://kenney.nl) | forge and refine chimes, refused casts, Grimoire open/close, lightning crackle |

CC0 does not require credit. We give it anyway, with thanks.
