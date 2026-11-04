# Incant Online

**Say it. Cast it.**

Incant Online is a browser-based, voice-first action RPG. As an Incanter you climb the Spire, speaking new abilities (Incantations) and new floors into existence, then casting those Incantations by saying their names.

> Status: early scaffold. Gameplay, voice input and the backend are not built yet.

## Run it locally

Requires Node.js 20.19+ (or 22.12+).

```bash
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
npm run dev            # http://localhost:5173
npm run build          # type-check and production build into dist/
```

**Best in Chrome or Edge** (they have the most complete Web Speech API support).

## The problem we're exploring

_TODO_: turning plain spoken language into both playable 3D spaces and working, balanced game logic, safely and in real time.

## How AI is used

_TODO_. In short: an LLM (Anthropic API) turns what the player says into JSON that matches fixed schemas. It never writes code. Deterministic code (the Arbiter) then validates and balances that JSON before anything runs. See [CREDITS.md](CREDITS.md).

## Privacy

- The microphone is **push-to-talk only** (hold V or the mic button).
- Browser speech recognition may send your audio to your browser vendor (e.g. Google or Microsoft) to turn it into text.
- Our backend never stores audio.

## Licence

[MIT](LICENSE). Third-party credits are in [CREDITS.md](CREDITS.md).
