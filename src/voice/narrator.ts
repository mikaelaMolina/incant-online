/**
 * The Arbiter's voice: browser text-to-speech (`window.speechSynthesis`). Optional by nature:
 * without it (or with no voices) every call is a no-op and the transcript still shows the line.
 * Speech stops the moment the player starts talking, so the microphone never hears the Arbiter.
 */
export class Narrator {
  private readonly synth: SpeechSynthesis | undefined =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;
  private voice: SpeechSynthesisVoice | undefined;
  /** Player can silence the Arbiter (persisted per browser). */
  private muted = readMuted();
  private quietUntil = 0;

  constructor() {
    if (!this.synth) return;
    const pick = (): void => {
      this.voice = pickVoice(this.synth?.getVoices() ?? []);
    };
    pick();
    this.synth.addEventListener?.('voiceschanged', pick);
  }

  get supported(): boolean {
    return !!this.synth;
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
    if (!this.synth || this.muted || !text.trim() || performance.now() < this.quietUntil) return;
    this.synth.cancel();
    const u = new SpeechSynthesisUtterance(stripForSpeech(text));
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? 'en-GB';
    // Natural pitch: lowering it makes every engine sound more mechanical.
    u.rate = 0.97;
    u.pitch = 1;
    u.volume = 0.9;
    this.synth.speak(u);
  }

  /** Stop now (push-to-talk pressed) and stay quiet briefly so a queued line can't start mid-speech. */
  stop(quietMs = 0): void {
    this.synth?.cancel();
    if (quietMs > 0) this.quietUntil = performance.now() + quietMs;
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

/** Drop bits that sound odd read aloud: bar slot tags, symbols. */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\[\d\]/g, '')
    .replace(/×/g, ' times ')
    .replace(/[“”]/g, '')
    .replace(/…/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}
