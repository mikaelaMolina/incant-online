import {
  RecorderRecognizer,
  WebSpeechRecognizer,
  recorderSupported,
  webSpeechConstructor,
  type Recognizer,
  type RecognizerEvents,
  type VoiceError,
} from './recognizers';

/** After release, give up if no result arrives in time (covers STT's own 8 s timeout). */
const RESULT_WATCHDOG_MS = 12_000;

export type VoiceMode = 'webspeech' | 'recorder' | 'none';
export type VoiceState = 'idle' | 'starting' | 'listening' | 'processing';

export interface SpeechInputEvents {
  onState(state: VoiceState): void;
  onInterim(text: string): void;
  onFinal(text: string): void;
  onError(error: VoiceError): void;
}

/**
 * Push-to-talk speech input. Uses the Web Speech API when available, otherwise records audio
 * for /api/stt. If the browser's speech service is unreachable it switches to the recorder.
 */
export class SpeechInput {
  private recognizer: Recognizer | undefined;
  private state: VoiceState = 'idle';
  private pressed = false;
  private watchdog = 0;

  constructor(private readonly events: SpeechInputEvents) {
    this.recognizer = this.create(webSpeechConstructor() ? 'webspeech' : recorderSupported() ? 'recorder' : 'none');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancel();
    });
  }

  get mode(): VoiceMode {
    return this.recognizer?.kind ?? 'none';
  }

  get supported(): boolean {
    return this.recognizer !== undefined;
  }

  get isListening(): boolean {
    return this.state === 'listening' || this.state === 'starting';
  }

  press(): void {
    if (this.pressed || !this.recognizer) return;
    this.pressed = true;
    this.setState('starting');
    this.recognizer.start();
  }

  release(): void {
    if (!this.pressed) return;
    this.pressed = false;
    if (this.state === 'starting' || this.state === 'listening') this.setState('processing');
    this.recognizer?.stop();
    window.clearTimeout(this.watchdog);
    this.watchdog = window.setTimeout(() => {
      // The recognizer never reported back (some browsers hang silently): reset and say so.
      if (this.pressed || this.state === 'idle') return;
      this.recognizer?.abort();
      this.setState('idle');
      this.events.onError('unavailable');
    }, RESULT_WATCHDOG_MS);
  }

  cancel(): void {
    this.pressed = false;
    this.recognizer?.abort();
    this.setState('idle');
  }

  private create(mode: VoiceMode): Recognizer | undefined {
    const ev: RecognizerEvents = {
      onListening: () => {
        if (this.pressed) this.setState('listening');
      },
      onInterim: (t) => this.events.onInterim(t),
      onFinal: (t) => this.events.onFinal(t),
      onError: (e) => {
        // A 'network' error from the browser's speech service is usually momentary: keep using it
        // (the player is asked to speak again). Switching to the recorder would need /api/stt,
        // which is not built yet, and would break listening until a reload.
        this.events.onError(e);
      },
      onIdle: () => {
        if (this.pressed) return;
        window.clearTimeout(this.watchdog);
        this.setState('idle');
      },
    };
    if (mode === 'webspeech') {
      const Ctor = webSpeechConstructor();
      return Ctor ? new WebSpeechRecognizer(Ctor, ev) : undefined;
    }
    if (mode === 'recorder') return new RecorderRecognizer(ev);
    return undefined;
  }

  private setState(s: VoiceState): void {
    if (s === this.state) return;
    this.state = s;
    this.events.onState(s);
  }
}
