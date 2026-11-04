import { SttResponse } from '../schemas/stt';

/**
 * Why listening failed, in game terms. The UI turns these into in-character messages;
 * raw browser errors are never shown.
 */
export type VoiceError =
  | 'not-allowed' // microphone permission denied / blocked
  | 'no-speech' // nothing heard
  | 'audio-capture' // no microphone
  | 'network' // browser speech service unreachable (switch to the fallback)
  | 'unavailable'; // /api/stt failed or timed out

export interface RecognizerEvents {
  /** Microphone is open and listening. */
  onListening(): void;
  onInterim(text: string): void;
  onFinal(text: string): void;
  onError(error: VoiceError): void;
  /** Finished (after final or error); ready for the next press. */
  onIdle(): void;
}

export interface Recognizer {
  readonly kind: 'webspeech' | 'recorder';
  /** Push-to-talk pressed. */
  start(): void;
  /** Push-to-talk released: finish and deliver the result. */
  stop(): void;
  /** Drop everything (e.g. tab hidden). */
  abort(): void;
}

// --- Web Speech API ---------------------------------------------------------------------------

/** Minimal shape of SpeechRecognition (not in TypeScript's DOM lib; Chrome/Edge prefix it). */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function webSpeechConstructor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function recognitionLang(): string {
  const l = navigator.language || 'en-US';
  return l.toLowerCase().startsWith('en') ? l : 'en-US'; // the game speaks English
}

export class WebSpeechRecognizer implements Recognizer {
  readonly kind = 'webspeech';
  private rec: SpeechRecognitionLike | undefined;
  private finalText = '';
  private interimText = '';
  private failed = false;

  constructor(
    private readonly Ctor: SpeechRecognitionCtor,
    private readonly ev: RecognizerEvents,
  ) {}

  start(): void {
    this.rec?.abort();
    const rec = new this.Ctor();
    this.rec = rec;
    this.finalText = '';
    this.interimText = '';
    this.failed = false;
    rec.lang = recognitionLang();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => this.ev.onListening();
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r?.[0]?.transcript ?? '';
        if (r?.isFinal) this.finalText += t + ' ';
        else interim += t;
      }
      this.interimText = interim;
      this.ev.onInterim((this.finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      this.failed = true;
      this.ev.onError(mapSpeechError(e.error));
    };
    rec.onend = () => {
      if (rec !== this.rec) return; // a newer press replaced this one
      this.rec = undefined;
      // Chrome sometimes leaves the last words as interim when stopped: keep them.
      const text = (this.finalText + this.interimText).trim();
      if (text) this.ev.onFinal(text);
      else if (!this.failed) this.ev.onError('no-speech');
      this.ev.onIdle();
    };

    try {
      rec.start();
    } catch {
      this.rec = undefined;
      this.ev.onError('unavailable');
      this.ev.onIdle();
    }
  }

  stop(): void {
    this.rec?.stop();
  }

  abort(): void {
    const rec = this.rec;
    this.rec = undefined;
    rec?.abort();
  }
}

function mapSpeechError(error: string): VoiceError {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed';
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
      return 'audio-capture';
    case 'network':
      return 'network';
    default:
      return 'unavailable';
  }
}

// --- MediaRecorder → /api/stt fallback -----------------------------------------------------------

const MAX_RECORDING_MS = 15_000;
const MIN_RECORDING_MS = 300;
const STT_TIMEOUT_MS = 8_000;
const STT_ENDPOINT = '/api/stt';

export function recorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

function pickMimeType(): string | undefined {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

/**
 * Records while push-to-talk is held, then posts the audio to /api/stt.
 * The microphone track is stopped after every recording (push-to-talk only, nothing kept open).
 */
export class RecorderRecognizer implements Recognizer {
  readonly kind = 'recorder';
  private held = false;
  private stream: MediaStream | undefined;
  private recorder: MediaRecorder | undefined;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private maxTimer = 0;
  private request: AbortController | undefined;

  constructor(private readonly ev: RecognizerEvents) {}

  start(): void {
    this.held = true;
    void this.open();
  }

  stop(): void {
    this.held = false;
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  abort(): void {
    this.held = false;
    this.request?.abort();
    this.chunks = [];
    if (this.recorder?.state === 'recording') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.closeStream();
  }

  private async open(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      this.ev.onError(name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : 'audio-capture');
      this.ev.onIdle();
      return;
    }
    if (!this.held) {
      // Released before the microphone opened (e.g. while answering the permission prompt).
      stream.getTracks().forEach((t) => t.stop());
      this.ev.onIdle();
      return;
    }
    this.stream = stream;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.recorder = recorder;
    this.chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    recorder.onstop = () => void this.finish(recorder.mimeType || mimeType || 'audio/webm');
    recorder.start(250);
    this.startedAt = performance.now();
    this.maxTimer = window.setTimeout(() => this.stop(), MAX_RECORDING_MS);
    this.ev.onListening();
    this.ev.onInterim('…');
  }

  private async finish(type: string): Promise<void> {
    window.clearTimeout(this.maxTimer);
    this.closeStream();
    const duration = performance.now() - this.startedAt;
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];
    this.recorder = undefined;
    if (duration < MIN_RECORDING_MS || blob.size === 0) {
      this.ev.onError('no-speech');
      this.ev.onIdle();
      return;
    }

    this.request = new AbortController();
    const timeout = window.setTimeout(() => this.request?.abort(), STT_TIMEOUT_MS);
    try {
      const res = await fetch(STT_ENDPOINT, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': type },
        signal: this.request.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = SttResponse.safeParse(await res.json());
      const text = parsed.success ? parsed.data.text.trim() : '';
      if (text) this.ev.onFinal(text);
      else this.ev.onError(parsed.success ? 'no-speech' : 'unavailable');
    } catch {
      this.ev.onError('unavailable');
    } finally {
      window.clearTimeout(timeout);
      this.request = undefined;
      this.ev.onIdle();
    }
  }

  private closeStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }
}
