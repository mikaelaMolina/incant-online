import { stripForSpeech } from './speechText';
import { lineKey } from './arbiterLines';

export { stripForSpeech };

/**
 * The Arbiter's voice (and any NPC's: everything spoken goes through here). Best first:
 * 0. pre-recorded files for fixed lines (public/assets/voice, made by `npm run voices`): no credits;
 * 1. a cloud voice from /api/tts (ElevenLabs text-to-speech, when the server has a key), cached per
 *    line for the session;
 * 2. browser text-to-speech (`window.speechSynthesis`), with the most natural voice available.
 * Any cloud failure (no key, timeout, rate limit, autoplay refused) falls back to the browser voice
 * for that line; repeated failures switch the cloud voice off for the session. Without either, every
 * call is a no-op and the transcript still shows the line. Speech stops the moment the player starts
 * talking, so the microphone never hears the Arbiter.
 */
const TTS_ENDPOINT = '/api/tts';
const VOICE_DIR = `${import.meta.env.BASE_URL}assets/voice/`;
/** Waiting longer than this for the cloud voice makes the line feel late: use the browser voice. */
const CLOUD_TIMEOUT_MS = 3_500;
const CLOUD_FAILURES_BEFORE_OFF = 2;
const CACHE_LINES = 40;

export class Narrator {
  private readonly synth: SpeechSynthesis | undefined =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;
  private voice: SpeechSynthesisVoice | undefined;
  /** Player can silence the Arbiter (persisted per browser). */
  private muted = readMuted();
  private quietUntil = 0;
  private cloud = false;
  private cloudFailures = 0;
  private readonly audio: HTMLAudioElement | undefined = typeof Audio !== 'undefined' ? new Audio() : undefined;
  /** lineKey(text) → URL of a pre-recorded file. */
  private readonly prebaked = new Map<string, string>();
  /** Line text → object URL of its MP3 (lines like "The Spire reshapes." repeat). */
  private readonly cache = new Map<string, string>();
  private pending: AbortController | undefined;
  /** Bumped by every speak / stop: a late cloud answer for an older line is dropped. */
  private generation = 0;

  constructor() {
    if (this.synth) {
      const pick = (): void => {
        this.voice = pickVoice(this.synth?.getVoices() ?? []);
      };
      pick();
      this.synth.addEventListener?.('voiceschanged', pick);
    }
    void this.checkCloud();
    void this.loadPrebaked();
  }

  get supported(): boolean {
    return !!this.synth || this.cloud;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (m) this.stop();
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      // storage blocked: the setting just won't persist
    }
  }

  /** Speak a line, replacing whatever the Arbiter was saying. */
  speak(text: string): void {
    const line = stripForSpeech(text);
    if (this.muted || !line || performance.now() < this.quietUntil) return;
    this.halt();
    const gen = ++this.generation;
    const file = this.prebaked.get(lineKey(line));
    if (file && this.audio) void this.play(file, line, gen, () => (this.cloud ? this.speakCloud(line, gen) : this.speakBrowser(line)));
    else if (this.cloud && this.audio) void this.speakCloud(line, gen);
    else this.speakBrowser(line);
  }

  /** Stop now (push-to-talk pressed) and stay quiet briefly so a queued line can't start mid-speech. */
  stop(quietMs = 0): void {
    this.generation++;
    this.halt();
    if (quietMs > 0) this.quietUntil = performance.now() + quietMs;
  }

  private halt(): void {
    this.pending?.abort();
    this.pending = undefined;
    this.audio?.pause();
    this.synth?.cancel();
  }

  private speakBrowser(line: string): void {
    if (!this.synth) return;
    const u = new SpeechSynthesisUtterance(line);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? 'en-GB';
    // Natural pitch: lowering it makes every engine sound more mechanical.
    u.rate = 0.97;
    u.pitch = 1;
    u.volume = 0.9;
    this.synth.speak(u);
  }

  private async speakCloud(line: string, gen: number): Promise<void> {
    const audio = this.audio;
    if (!audio) return;
    let url = this.cache.get(line);
    if (!url) {
      const controller = new AbortController();
      this.pending = controller;
      const timer = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);
      try {
        const res = await fetch(TTS_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: line }),
          signal: controller.signal,
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        url = URL.createObjectURL(await res.blob());
        this.remember(line, url);
        this.cloudFailures = 0;
      } catch {
        if (gen !== this.generation) return; // stopped or replaced: not a failure
        if (++this.cloudFailures >= CLOUD_FAILURES_BEFORE_OFF) this.cloud = false;
        this.speakBrowser(line);
        return;
      } finally {
        clearTimeout(timer);
        if (this.pending === controller) this.pending = undefined;
      }
    }
    await this.play(url, line, gen, () => this.speakBrowser(line));
  }

  /** Play an MP3 for this line; on failure (autoplay refused, missing file) run `fallback`. */
  private async play(url: string, line: string, gen: number, fallback: () => unknown): Promise<void> {
    const audio = this.audio;
    if (!audio || gen !== this.generation || this.muted || !line) return;
    audio.src = url;
    audio.volume = 0.95;
    try {
      await audio.play();
    } catch {
      if (gen === this.generation) void fallback();
    }
  }

  private async loadPrebaked(): Promise<void> {
    if (typeof fetch === 'undefined' || !this.audio) return;
    try {
      const res = await fetch(`${VOICE_DIR}manifest.json`);
      if (!res.ok) return;
      const body = (await res.json()) as { lines?: Record<string, string> };
      for (const [key, file] of Object.entries(body.lines ?? {})) this.prebaked.set(key, VOICE_DIR + file);
    } catch {
      // No pre-recorded lines: every line is generated or spoken by the browser.
    }
  }

  private remember(line: string, url: string): void {
    this.cache.set(line, url);
    if (this.cache.size > CACHE_LINES) {
      const [oldest, oldUrl] = this.cache.entries().next().value as [string, string];
      this.cache.delete(oldest);
      URL.revokeObjectURL(oldUrl);
    }
  }

  private async checkCloud(): Promise<void> {
    if (typeof fetch === 'undefined' || !this.audio) return;
    try {
      const res = await fetch(TTS_ENDPOINT, { signal: AbortSignal.timeout(4000) });
      const body = (await res.json()) as { enabled?: unknown };
      this.cloud = res.ok && body.enabled === true;
    } catch {
      this.cloud = false;
    }
  }
}

const MUTE_KEY = 'incant.arbiterMuted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Pick the most natural English voice the browser offers. Quality first, because the default and
 * "local" voices are often decades-old formant synthesis (e.g. Windows' "Microsoft David Desktop"):
 * 1. neural voices: Edge's "… Online (Natural)" voices (free in Edge, streamed by the browser);
 * 2. Apple's downloaded "Premium" / "Enhanced" voices;
 * 3. Chrome's "Google …" voices;
 * and never the old desktop / eSpeak voices unless nothing else exists. Then a British accent and
 * a calm male narrator suit the Arbiter.
 */
export function pickVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const score = (v: SpeechSynthesisVoice): number => {
    const name = v.name.toLowerCase();
    const lang = v.lang.toLowerCase();
    let s = 0;
    if (/natural|neural/.test(name)) s += 50;
    if (/premium|enhanced/.test(name)) s += 40;
    if (/^google\b/.test(name)) s += 25;
    if (/\bonline\b/.test(name)) s += 5;
    if (/desktop|espeak|robot|compact/.test(name)) s -= 30;
    if (lang === 'en-gb') s += 6;
    else if (lang === 'en-us') s += 3;
    if (/\b(male|ryan|thomas|guy|davis|andrew|brian|christopher|eric|daniel|arthur|george|oliver|william)\b/.test(name)) s += 4;
    return s;
  };
  return [...en].sort((a, b) => score(b) - score(a))[0] ?? voices[0];
}
