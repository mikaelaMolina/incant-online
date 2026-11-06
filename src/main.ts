import './ui/style.css';
import { startGame, type GameController } from './game/game';
import { SpeechInput } from './voice/speechInput';
import { PushToTalk } from './voice/pushToTalk';
import { UtterancePipeline } from './voice/pipeline';
import { isAwakeningPhrase, AWAKENING_PHRASE } from './voice/utterance';
import { StartScreen } from './ui/startScreen';
import { CommandBar } from './ui/commandBar';
import { Transcript } from './ui/transcript';
import { NO_VOICE_MESSAGE, voiceErrorMessage } from './ui/voiceMessages';
import { ModeLabel } from './ui/modeLabel';
import { fetchBackendMode } from './voice/interpretClient';
import { CommandRouter } from './voice/commandRouter';
import { Grimoire } from './combat/grimoire';
import { TEST_INCANTATIONS } from './combat/testIncantations';
import { GrimoirePanel } from './ui/grimoirePanel';
import { ReshapeTransition } from './ui/transition';
import { GatePrompt } from './ui/gatePrompt';
import { Narrator } from './voice/narrator';
import { sfx } from './audio/sfx';
import { SoundToggle } from './ui/soundToggle';

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

  // Start screen: listen for the awakening phrase.
  pipeline.setHandler((u) => {
    if (isAwakeningPhrase(u.text)) {
      startScreen?.showHeard(`“${u.text}”`);
      startScreen?.enter();
    } else {
      startScreen?.showHeard(`“${u.text}”: the Spire waits for the awakening phrase, “${AWAKENING_PHRASE}”.`);
    }
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
  /** Show and speak an Arbiter line. */
  const arbiter = (text: string): void => {
    transcript?.add('spire', text);
    narrator.speak(text);
  };

  startScreen.onEnter = () => {
    commandBar?.show();
    if (!speech.supported) transcript?.add('spire', NO_VOICE_MESSAGE);
    game?.setPaused(false);
    const g = game;
    if (!g) return;
    // In the game: everything said or typed is shown, then routed (forge / build / reply).
    g.hooks.onBarCast = (spec) => grimoire.touch(spec.name);
    g.hooks.onGateOpen = () => arbiter('A gate opens. Step into it and speak the next floor into being.');
    g.hooks.onGateEnter = () => {
      gatePrompt.show(true);
      arbiter('Describe the floor that lies beyond.');
    };
    g.hooks.onGateLeave = () => gatePrompt.show(false);
    router = new CommandRouter({
      grimoire,
      currentFloor: () => g.currentFloor(),
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
      say: (text) => transcript?.add('spire', text),
      speak: (text) => narrator.speak(text),
      reshape: (on, subtitle) => {
        if (on && !reshape.visible) sfx.play('reshape');
        return on ? reshape.show(subtitle) : reshape.hide();
      },
      atGate: () => g.atGate(),
      onFloorBuilt: (name, ms) => {
        if (import.meta.env.DEV) console.debug(`floor ${name}: ${(ms / 1000).toFixed(2)} s from words to playable`);
      },
      thinking: (on) => transcript?.setInterim(on ? 'The Spire weighs your words…' : null),
      onMode: (r) => modeLabel.set(r.offline ? 'offline' : (r.mode ?? 'offline')),
    });
    const r = router;
    pipeline.setHandler((u) => {
      transcript?.add('you', u.text);
      void r.handle(u);
    });
  };

  startGame(canvas, hud)
    .then((g) => {
      game = g;
      g.setBar(grimoire.bar.map((j) => j?.incantation));
      startScreen?.setReady();
    })
    .catch((err: unknown) => {
      console.error(err);
      hud.textContent = 'The Spire could not awaken. Please reload the page.';
    });
}
