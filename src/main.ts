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

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hud = document.querySelector<HTMLElement>('#hud');

if (canvas && hud) {
  const pipeline = new UtterancePipeline();

  // Created before the speech input so its events can reach them.
  let startScreen: StartScreen | undefined;
  let transcript: Transcript | undefined;
  let commandBar: CommandBar | undefined;
  const inGame = (): boolean => !!startScreen && !startScreen.visible;

  const speech = new SpeechInput({
    onState(state) {
      startScreen?.setVoiceState(state);
      commandBar?.setVoiceState(state);
      if (state === 'idle') transcript?.setInterim(null);
      if (state === 'listening' && inGame()) transcript?.setInterim('Listening…');
    },
    onInterim(text) {
      if (inGame()) transcript?.setInterim(text);
      else startScreen?.showHeard(text);
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
  startScreen.onEnter = () => {
    commandBar?.show();
    if (!speech.supported) transcript?.add('spire', NO_VOICE_MESSAGE);
    game?.setPaused(false);
    const g = game;
    if (!g) return;
    // In the game: everything said or typed is shown, then routed (forge / build / reply).
    const router = new CommandRouter({
      grimoire,
      currentFloor: () => g.currentFloor(),
      loadFloor: (spec) => g.loadFloor(spec),
      say: (text) => transcript?.add('spire', text),
      thinking: (on) => transcript?.setInterim(on ? 'The Spire weighs your words…' : null),
      onMode: (r) => modeLabel.set(r.offline ? 'offline' : (r.mode ?? 'offline')),
    });
    pipeline.setHandler((u) => {
      transcript?.add('you', u.text);
      void router.handle(u);
    });
  };

  startGame(canvas, hud)
    .then((g) => {
      game = g;
      startScreen?.setReady();
    })
    .catch((err: unknown) => {
      console.error(err);
      hud.textContent = 'The Spire could not awaken. Please reload the page.';
    });
}
