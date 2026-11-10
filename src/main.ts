// shadcn/ui-style components (Basecoat, MIT) as prebuilt plain CSS: no Tailwind build step. The
// full bundle is not in the package's export map, so it is imported by path. Our styles come
// after it and are unlayered, so they win over its cascade layers.
import '../node_modules/basecoat-css/dist/basecoat.cdn.css';
import './ui/style.css';
import { startGame, type GameController } from './game/game';
import { SpeechInput } from './voice/speechInput';
import { PushToTalk } from './voice/pushToTalk';
import { UtterancePipeline } from './voice/pipeline';
import { isAwakeningPhrase } from './voice/utterance';
import { StartScreen } from './ui/startScreen';
import { CommandBar } from './ui/commandBar';
import { Transcript } from './ui/transcript';
import { NO_VOICE_MESSAGE, voiceErrorMessage } from './ui/voiceMessages';
import { ModeLabel } from './ui/modeLabel';
import { fetchBackendMode } from './voice/interpretClient';
import { CommandRouter, looksLikeQuestion } from './voice/commandRouter';
import { Grimoire } from './combat/grimoire';
import { TEST_INCANTATIONS } from './combat/testIncantations';
import { GrimoirePanel } from './ui/grimoirePanel';
import { ReshapeTransition } from './ui/transition';
import { GatePrompt } from './ui/gatePrompt';
import { Narrator } from './voice/narrator';
import { ARBITER_LINES } from './voice/arbiterLines';
import { sfx } from './audio/sfx';
import { SoundToggle } from './ui/soundToggle';
import { PROLOGUE_NARRATION, guideGreeting, guideReply, prologueGreeting, prologueReply } from './game/story';
import { PROLOGUE_FLOOR } from './game/npc';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hud = document.querySelector<HTMLElement>('#hud');

if (canvas && hud) {
  const pipeline = new UtterancePipeline();

  // Created before the speech input so its events can reach them.
  let startScreen: StartScreen | undefined;
  let transcript: Transcript | undefined;
  let commandBar: CommandBar | undefined;
  let router: CommandRouter | undefined;
  const inGame = (): boolean => !!startScreen && !startScreen.visible;
  const narrator = new Narrator();
  // One switch for all audio: sound effects and the Arbiter's voice.
  narrator.setMuted(sfx.isMuted);
  // Browsers allow audio only after a user gesture: unlock on the first one (start screen).
  const unlockAudio = (): void => sfx.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  const speech = new SpeechInput({
    onState(state) {
      startScreen?.setVoiceState(state);
      commandBar?.setVoiceState(state);
      if (state === 'idle') transcript?.setInterim(null);
      // The Arbiter falls silent while the player speaks, so the microphone only hears them.
      if (state !== 'idle') narrator.stop(600);
      if (state === 'listening' && inGame()) transcript?.setInterim('Listening…');
    },
    onInterim(text) {
      if (inGame()) {
        transcript?.setInterim(text);
        // Recite as soon as a name is clearly heard, without waiting for the final result.
        router?.handleInterim(text);
      } else {
        startScreen?.showHeard(text);
      }
    },
    onFinal(text) {
      transcript?.setInterim(null);
      pipeline.submit(text, 'voice');
    },
    onError(error) {
      const msg = voiceErrorMessage(error, speech.mode);
      if (inGame()) {
        transcript?.add('spire', msg);
        if (error === 'not-allowed' || error === 'unavailable' || error === 'audio-capture') commandBar?.focusInput();
      } else {
        startScreen?.showHeard(msg);
      }
    },
  });

  transcript = new Transcript(hud);
  const modeLabel = new ModeLabel(hud);
  void fetchBackendMode().then((m) => modeLabel.set(m));
  commandBar = new CommandBar(hud, speech.supported);
  startScreen = new StartScreen(hud, speech.mode);
  const ptt = new PushToTalk(speech);
  ptt.bindButton(commandBar.micButton);
  ptt.bindButton(startScreen.micButton);
  commandBar.onSubmit = (text) => pipeline.submit(text, 'text');

  // Start screen: the player's first words describe their world. It is built in the background
  // while they explore the prologue village; the village gate leads into it (floor 1). Typed
  // words, quick picks, chosen settings and speech all arrive through the pipeline.
  let pendingWorld: string | undefined;
  const describeWorld = (text: string): void => {
    startScreen?.showHeard(`“${text}”`);
    if (!router) {
      pendingWorld = text; // handled as soon as the Spire has loaded
      startScreen?.setBusy(true);
      startScreen?.setStatus('Almost ready…');
      return;
    }
    const r = router;
    if (looksLikeQuestion(text)) {
      // A question gets an answer on the start screen; the player then describes a place.
      startScreen?.setBusy(true);
      void r.answer(text).then(() => {
        startScreen?.setBusy(false);
        startScreen?.setStatus('Describe a place to enter.');
      });
      return;
    }
    r.prepareWorld(text);
    startScreen?.setBusy(true);
    startScreen?.enter();
  };
  startScreen.onWorld = (text) => pipeline.submit(text, 'text');
  pipeline.setHandler((u) => {
    if (isAwakeningPhrase(u.text)) {
      startScreen?.showHeard(`“${u.text}”: the Spire hears you. Now describe your world.`);
      return;
    }
    describeWorld(u.text);
  });

  let game: GameController | undefined;
  const grimoire = new Grimoire();
  const grimoirePanel = new GrimoirePanel(hud);
  // Forged Incantations (after the Arbiter) fill the bar; the three test ones start in slots 1–3.
  grimoire.onChange = () => {
    game?.setBar(grimoire.bar.map((j) => j?.incantation));
    grimoirePanel.render(grimoire);
    router?.syncNames();
  };
  for (const j of TEST_INCANTATIONS) grimoire.add(j);
  const reshape = new ReshapeTransition(hud);
  new SoundToggle(hud, sfx.isMuted, () => {
    const muted = sfx.toggleMuted();
    narrator.setMuted(muted);
    return muted;
  });
  const gatePrompt = new GatePrompt(hud, speech.supported);
  /**
   * Show and speak an Arbiter line. `spoken` is a fixed line when the shown one has a name or
   * number in it, so the voice can come from a pre-recorded file instead of costing credits.
   */
  const arbiter = (text: string, spoken = text): void => {
    transcript?.add('spire', text);
    narrator.speak(spoken);
  };

  /** An NPC's line: shown under their name and spoken (same voice as the Arbiter). */
  const npcSay = (name: string, text: string): void => {
    transcript?.add('npc', text, name);
    narrator.speak(text);
  };
  /** Recent exchanges per NPC (by floor and role), so a conversation has memory. */
  const talkHistory = new Map<string, { who: 'player' | 'npc'; text: string }[]>();
  /**
   * What an NPC answers: Claude playing the NPC (/api/talk, llm mode), or their written dialogue
   * (mock mode, offline, slow or failed). Never throws.
   */
  const npcReply = async (text: string, role: string, floorNumber: number): Promise<string> => {
    const written = (): string => (floorNumber === PROLOGUE_FLOOR ? prologueReply(text, role) : guideReply(text, floorNumber));
    const key = `${floorNumber}:${role}`;
    const history = talkHistory.get(key) ?? [];
    let reply: string;
    try {
      const spec = game?.currentFloor();
      const res = await fetch('/api/talk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, role, floor: floorNumber, floorName: spec?.name, biome: spec?.biome, history }),
        signal: AbortSignal.timeout(7000),
      });
      const body = (await res.json()) as { reply?: unknown };
      reply = res.ok && typeof body.reply === 'string' && body.reply.trim() ? body.reply : written();
    } catch {
      reply = written();
    }
    talkHistory.set(key, [...history, { who: 'player' as const, text }, { who: 'npc' as const, text: reply }].slice(-6));
    return reply;
  };

  /** The router needs the game; it exists before entering so the start screen can build floor 1. */
  const makeRouter = (g: GameController): CommandRouter =>
    new CommandRouter({
      grimoire,
      currentFloor: () => g.currentFloor(),
      floorNumber: () => g.floorNumber(),
      loadFloor: (spec) => g.loadFloor(spec),
      cast: (spec) => g.castIncantation(spec),
      showGrimoire: (open) => {
        if (open !== grimoirePanel.visible) sfx.play(open ? 'open' : 'close');
        grimoirePanel.show(open);
      },
      sound: (id) => sfx.play(id),
      onRecite: (name, ms, fromInterim) => {
        if (import.meta.env.DEV) console.debug(`recite ${name}: ${ms.toFixed(1)} ms${fromInterim ? ' (interim)' : ''}`);
      },
      say: (text) => (inGame() ? transcript?.add('spire', text) : startScreen?.showHeard(text)),
      speak: (text) => narrator.speak(text),
      reshape: (on, subtitle) => {
        if (on && !reshape.visible) sfx.play('reshape');
        return on ? reshape.show(subtitle) : reshape.hide();
      },
      atGate: () => g.atGate(),
      onFloorBuilt: (name, ms) => {
        if (import.meta.env.DEV) console.debug(`floor ${name}: ${(ms / 1000).toFixed(2)} s from words to playable`);
      },
      thinking: (on) => {
        if (inGame()) transcript?.setInterim(on ? 'The Spire weighs your words…' : null);
        else if (on) startScreen?.setStatus('The Spire weighs your words…');
      },
      onMode: (r) => modeLabel.set(r.offline ? 'offline' : (r.mode ?? 'offline')),
      nearGuide: () => g.nearGuide(),
      talk: async (text: string) => {
        const role = g.nearestNpcRole() || 'Wanderer';
        npcSay(role, await npcReply(text, role, g.floorNumber()));
      },
    });

  startScreen.onEnter = () => {
    commandBar?.show();
    if (!speech.supported) transcript?.add('spire', NO_VOICE_MESSAGE);
    game?.setPaused(false);
    // The prologue: the Arbiter's welcome, then the story of the village before the first battle.
    arbiter(ARBITER_LINES.welcome);
    window.setTimeout(() => arbiter(PROLOGUE_NARRATION), 7500);
    const g = game;
    const r = router;
    if (!g || !r) return;
    // In the game: everything said or typed is shown, then routed (forge / build / reply).
    g.hooks.onBarCast = (spec) => grimoire.touch(spec.name);
    g.hooks.onGateOpen = () =>
      arbiter(`Floor ${g.floorNumber()} falls silent. A gate opens: step into it and speak the next floor into being.`, ARBITER_LINES.gateOpen);
    g.hooks.onBossAwake = (name) => arbiter(`${name} guards this floor. Unmake it, Incanter.`, ARBITER_LINES.bossAwake);
    g.hooks.onGateEnter = () => {
      // The village gate leads into the world described on the start screen.
      if (g.floorNumber() === PROLOGUE_FLOOR && r.hasPreparedWorld) {
        void r.enterPreparedWorld();
        return;
      }
      gatePrompt.show(true);
      arbiter(ARBITER_LINES.gateEnter);
    };
    g.hooks.onGateLeave = () => gatePrompt.show(false);
    g.hooks.onStoryBeat = (line) => {
      // Story beats are spoken with a delay so they don't overlap the floor title card or gate line.
      window.setTimeout(() => arbiter(line), 2000);
    };
    g.hooks.onGuideEnter = (role) => {
      const prologue = g.floorNumber() === PROLOGUE_FLOOR;
      npcSay(role, prologue ? prologueGreeting(role) : guideGreeting(g.floorNumber()));
    };
    g.hooks.onGuideLeave = () => {};
    pipeline.setHandler((u) => {
      transcript?.add('you', u.text);
      void r.handle(u);
    });
  };

  startGame(canvas, hud)
    .then((g) => {
      game = g;
      g.setBar(grimoire.bar.map((j) => j?.incantation));
      router = makeRouter(g);
      startScreen?.setReady();
      if (pendingWorld !== undefined) {
        const text = pendingWorld;
        pendingWorld = undefined;
        describeWorld(text);
      }
    })
    .catch((err: unknown) => {
      console.error(err);
      hud.textContent = 'The Spire could not awaken. Please reload the page.';
    });
}
