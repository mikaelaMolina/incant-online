# Credits

Every third-party component, asset and AI service used in Incant Online. Only MIT, Apache-2.0, BSD, ISC, Zlib and CC0 licences are allowed.

## AI components

| Component | Role | Provider | Licence / terms |
| --- | --- | --- | --- |
| Claude Code | AI coding assistant used to write this codebase | Anthropic | Anthropic Commercial Terms of Service |
| Anthropic API (Claude, model set by `LLM_MODEL`) | Runtime LLM: turns player input into Incantation / floor JSON and Arbiter replies (planned) | Anthropic | Anthropic Commercial Terms of Service |

## Speech and platform services

| Component | Role | Provider | Licence / terms |
| --- | --- | --- | --- |
| Web Speech API (`SpeechRecognition`) | Speech to text in the browser (planned) | Browser vendor (e.g. Google Chrome, Microsoft Edge) | Browser vendor's terms |
| `window.speechSynthesis` | Text to speech for the Arbiter voice (planned) | Browser vendor / OS voices | Browser vendor's terms |
| Vercel | Static hosting and serverless functions (planned) | Vercel Inc. | Vercel Terms of Service |

## npm dependencies

### Direct

| Package | Version | Use | Licence | Source |
| --- | --- | --- | --- | --- |
| three | 0.187.0 | 3D rendering | MIT | https://github.com/mrdoob/three.js |
| vite | 7.3.7 | Dev server and bundler (dev only) | MIT | https://github.com/vitejs/vite |
| typescript | 7.0.2 | Type checking (dev only) | Apache-2.0 | https://github.com/microsoft/typescript-go |
| @types/three | 0.187.0 | Three.js type definitions (dev only) | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

### Transitive (installed by the packages above, dev only unless noted)

| Package | Licence |
| --- | --- |
| @dimforge/rapier3d-compat 0.12.0 (types only, via @types/three) | Apache-2.0 |
| @esbuild/linux-x64, esbuild 0.28.2 | MIT |
| @rollup/rollup-linux-x64-gnu, rollup 4.67.5 | MIT |
| @tweenjs/tween.js 23.1.3 | MIT |
| @types/estree 1.0.10 | MIT |
| @types/stats.js 0.17.4 | MIT |
| @types/webxr 0.5.24 | MIT |
| @typescript/typescript-linux-x64 7.0.2 | Apache-2.0 |
| fdir 6.5.0 | MIT |
| fflate 0.8.3 | MIT |
| meshoptimizer 1.1.1 | MIT |
| nanoid 3.3.20 | MIT |
| picocolors 1.1.1 | ISC |
| picomatch 4.0.7 | MIT |
| postcss 8.5.32 | MIT |
| source-map-js 1.2.2 | BSD-3-Clause |
| tinyglobby 0.2.17 | MIT |

Platform-specific binaries (esbuild, rollup, typescript) share their parent package's licence on every OS.

## 3D assets (`public/assets/`)

| Pack | Author | Licence | Source |
| --- | --- | --- | --- |
| Nature Kit (2.1) | Kenney | CC0 1.0 | https://kenney.nl/assets/nature-kit |
| Castle Kit (2.0) | Kenney | CC0 1.0 | https://kenney.nl/assets/castle-kit |
| Modular Dungeon Kit (2.1) | Kenney | CC0 1.0 | https://kenney.nl |
| RPG Characters (Nov 2020) | Quaternius | CC0 1.0 | https://quaternius.com |

CC0 does not require credit. We give it anyway, with thanks.
