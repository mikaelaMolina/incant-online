# Incant Online

**Say it. Cast it.**

Incant Online is a browser-based, voice-first action RPG. As an Incanter you climb the Spire, speaking new abilities (Incantations) and new floors into existence, then casting those Incantations by saying their names.

> Status: early prototype. Start screen, push-to-talk voice input with live transcript, the first floor (built from a FloorSpec) and basic combat against three enemy types work. Forging Incantations and the backend (`/api`) are not built yet.

## Run it locally

Requires Node.js 20.19+ (or 22.12+).

```bash
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
npm run dev            # http://localhost:5173
npm run build          # type-check and production build into dist/
npm test               # unit tests (schemas, manifest)
npm run manifest       # regenerate public/assets/manifest.json after changing asset packs
```

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move (relative to the camera) |
| Mouse | Aim (the Incanter faces the cursor) |
| Left click | Staff strike (short arc in front of you) |
| Space | Dodge (brief invulnerability: roll through arrows and slams) |
| Hold V (or the mic button) | Push-to-talk: speak, then let go |
| Enter | Type instead of speaking (Enter again sends, Esc cancels) |
| F3 | Toggle the performance overlay (shown by default in `npm run dev`) |

**Best in Chrome or Edge** (they have the most complete Web Speech API support).

## The problem we're exploring

_TODO_: turning plain spoken language into both playable 3D spaces and working, balanced game logic, safely and in real time.

## How AI is used

_TODO_. In short: an LLM (Anthropic API) turns what the player says into JSON that matches fixed schemas. It never writes code. Deterministic code (the Arbiter) then validates and balances that JSON before anything runs. See [CREDITS.md](CREDITS.md).

## Voice

Say **"I speak, I enter"** on the start screen to begin (or press Enter to skip voice).
Speech uses the browser's Web Speech API. Browsers without it record a short clip while you hold V and send it to `/api/stt` for transcription. Until the backend exists, `npm run dev` answers that with an in-character "type instead" message. Every input, spoken or typed, goes through the same pipeline (`src/voice/pipeline.ts`).

## Privacy

- The microphone is **push-to-talk only** (hold V or the mic button). It is closed again as soon as you let go.
- Browser speech recognition may send your audio to your browser vendor (e.g. Google or Microsoft) to turn it into text.
- Our backend never stores audio.

## Licence

[MIT](LICENSE). Third-party credits are in [CREDITS.md](CREDITS.md).
