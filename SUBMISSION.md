# Incant Online: submission

**Focus category:** AI-assisted game mechanics

**One line:** A voice-first browser action RPG where you speak spells and floors into existence, and an AI turns your words into real, balanced game mechanics.

**Repository:** https://github.com/mikaelaMolina/incant-online (MIT licence; setup and details in the [README](README.md))

---

## What I built

Incant Online is a voice-first action RPG that runs fully in a desktop browser. You play an Incanter climbing a tower called the Spire. Instead of choosing spells from a menu, you hold a key and describe one ("a spinning fire slash that hits three times"); seconds later it is on your spell bar as a working ability with its own hitbox, damage, status effects, visual effects, cooldown and mana cost. You cast it by saying its name. You can refine it ("make it wider", "add a stun"), and when a floor is cleared a gate opens where you describe the next floor ("a cozy village at night"), which is built in 3D around you.

The climb is a real RPG loop. You play an animated wizard. Monsters fit each floor: skeletons and ghosts in ruins, yetis on ice, and whatever creature you name ("a cave with a dragon"). They fight in packs and arrive in waves. Kills give experience and drop health and mana orbs, levels make you tougher, and every third floor ends with a named guardian boss. It is built in TypeScript with Three.js and Rapier physics, with one serverless function as its only backend.

## The problem

Language models understand what players mean, but letting one write game code at runtime is slow, unsafe and fragile: one bad answer can crash the game or break its balance. Incant Online explores whether plain spoken language can drive both a playable 3D world and real game mechanics in real time, without ever letting the model break the game. Players, and judges, can type anything, including off-topic or impossible requests, and every input must still end in a floor, a spell or an in-character reply.

## How AI is used

- **Interpretation (LLM):** Claude, through the Anthropic Messages API, turns what the player says into JSON of fixed shapes: forge a spell, build a floor, or reply in character. It never writes code and can only use props and enemies the game already has. Every answer is validated and repaired with shared schemas.
- **Balance (deterministic, not AI):** after the model, a rules engine called the Arbiter scores every spell's power and sets its cooldown and mana, swaps forbidden effects (instant kills, long invulnerability) for the closest allowed ones, and explains each change in one sentence. The model proposes; the rules decide. Levelling up raises health and mana but never spell damage, so the Arbiter's balance holds all the way up the tower.
- **Voice:** browser speech recognition turns push-to-talk audio into text; spell names are matched locally with fuzzy search, so casting never waits for the network (under 40 ms). The Arbiter's replies are spoken with browser text-to-speech.
- **Robustness:** without an API key, a local keyword parser produces the same JSON, so the game is fully playable offline. If the model fails, times out or is rate-limited, the game falls back to 10 pre-forged spells and 3 pre-built floors, picking the closest match.
- **Development:** the codebase was written with the help of Claude Code, Anthropic's AI coding assistant. All AI services, libraries and CC0 assets are credited in [CREDITS.md](CREDITS.md).

## Try it

`npm install && npm run dev`, open http://localhost:5173 in Chrome or Edge, say "I speak, I enter" (hold V) or press Enter, then try "a chain of lightning that bounces to four enemies", "make it ice", "build a frozen castle at night with archers", or "kill everything instantly".

## Status, honestly

Fully playable in mock mode (no key needed), with 240+ automated tests and an end-to-end "judge test" of ten off-script prompts. Pacing was tuned with an automated playtest bot that plays five floors in a real browser: floors take 20 to 50 seconds, and the danger rises with each floor. The live-LLM path is implemented and tested against a mocked API, but has not yet been run end to end with a real key, and the game is not deployed yet. Best in Chrome or Edge; Firefox works with typing; phones are not supported.
