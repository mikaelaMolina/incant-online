/**
 * Sound effects: Web Audio playback of the CC0 sounds in public/assets/audio (credited in
 * CREDITS.md). Each sound has variants and a random pitch spread so repeats don't sound
 * mechanical; bursts are throttled so a 5-target chain doesn't stack 5 identical hits.
 *
 * Browsers only allow audio after a user gesture, so nothing loads or plays until unlock() is
 * called from one (the start screen). Without Web Audio (tests, old browsers) every call is a no-op.
 */

/** Same base as models (works under any deploy path). */
const AUDIO = `${import.meta.env.BASE_URL}assets/audio`;
const RPG = `${AUDIO}/artisticdude-rpg-sound-pack`;
const SFX100 = `${AUDIO}/rubberduck-100-cc0-sfx`;
const UI = `${AUDIO}/kenney-interface-sounds`;

interface SoundDef {
  files: string[];
  volume: number;
  /** Random playback-rate range (pitch). */
  pitch: [number, number];
  /** Minimum ms between two plays of this sound. */
  gapMs: number;
}

const def = (files: string[], volume: number, pitch: [number, number] = [0.94, 1.06], gapMs = 30): SoundDef => ({ files, volume, pitch, gapMs });

export const SOUNDS = {
  // Combat
  swing: def([`${RPG}/swing.wav`, `${RPG}/swing2.wav`, `${RPG}/swing3.wav`], 0.55),
  dodge: def([`${RPG}/swing2.wav`, `${RPG}/swing3.wav`], 0.35, [1.2, 1.35]),
  cast: def([`${RPG}/magic1.wav`], 0.45, [0.9, 1.1], 60),
  hit: def([`${SFX100}/hit_01.ogg`, `${SFX100}/hit_02.ogg`, `${SFX100}/hit_03.ogg`, `${SFX100}/hit_04.ogg`], 0.5, [0.9, 1.15], 45),
  explode: def([`${SFX100}/explosion.ogg`], 0.55, [0.85, 1.05], 80),
  slam: def([`${SFX100}/slam_01.ogg`], 0.5, [0.8, 1], 80),
  hurt: def([`${SFX100}/hit_02.ogg`, `${SFX100}/hit_04.ogg`], 0.7, [0.6, 0.72], 120),
  // Element accents, layered on a cast
  ice: def([`${SFX100}/glass_01.ogg`, `${SFX100}/glass_02.ogg`], 0.35, [1.1, 1.3]),
  zap: def([`${UI}/glitch_001.ogg`, `${UI}/glitch_002.ogg`], 0.4, [0.8, 1.1], 50),
  wind: def([`${SFX100}/noise_01.ogg`], 0.35, [1.1, 1.3]),
  light: def([`${SFX100}/bell_02.ogg`], 0.3, [1.2, 1.4]),
  shadow: def([`${RPG}/shade1.wav`], 0.4, [0.9, 1.1]),
  // Enemies
  death: def([`${RPG}/mnstr1.wav`, `${RPG}/mnstr3.wav`], 0.5, [0.9, 1.15], 100),
  bigDeath: def([`${RPG}/giant1.wav`], 0.6, [0.85, 1], 150),
  // Progression
  levelUp: def([`${SFX100}/bell_02.ogg`], 0.55, [0.75, 0.75], 500),
  pickup: def([`${SFX100}/glass_01.ogg`, `${SFX100}/glass_02.ogg`], 0.25, [1.6, 1.9], 40),
  bossRoar: def([`${RPG}/giant1.wav`], 0.75, [0.62, 0.68], 1000),
  // World and UI
  gate: def([`${SFX100}/gong_01.ogg`], 0.5, [0.95, 1.0], 500),
  cleared: def([`${SFX100}/bell_01.ogg`], 0.45, [1, 1], 500),
  reshape: def([`${RPG}/spell.wav`], 0.45, [0.9, 0.95], 800),
  forge: def([`${UI}/confirmation_001.ogg`], 0.5, [1, 1], 200),
  refine: def([`${UI}/confirmation_002.ogg`], 0.5, [1, 1], 200),
  refuse: def([`${UI}/error_004.ogg`], 0.4, [1, 1], 250),
  open: def([`${UI}/maximize_001.ogg`], 0.4, [1, 1], 150),
  close: def([`${UI}/minimize_001.ogg`], 0.4, [1, 1], 150),
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;

export interface PlayOptions {
  /** Extra gain (0–1+), e.g. distance attenuation. */
  volume?: number;
  /** Stereo position, -1 (left) … 1 (right). */
  pan?: number;
}

const MUTE_KEY = 'incant.muted';
const MASTER = 0.8;

export class Sfx {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private loading: Promise<void> | undefined;
  private muted = readMuted();
  /** Called when mute changes (UI button). */
  onMuteChange: ((muted: boolean) => void) | undefined;

  get supported(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Call from a user gesture. Creates/resumes the audio context and loads every sound once. */
  unlock(): void {
    if (!this.supported) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.loading ??= this.loadAll();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      // storage blocked: the setting just won't persist
    }
    this.onMuteChange?.(m);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  play(id: SoundId, o: PlayOptions = {}): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted || ctx.state !== 'running') return;
    const sound: SoundDef = SOUNDS[id];
    const now = performance.now();
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < sound.gapMs) return;
    const file = sound.files[Math.floor(Math.random() * sound.files.length)];
    const buffer = file ? this.buffers.get(file) : undefined;
    if (!buffer) return; // still loading, or failed to load: silence is fine
    this.lastPlayed.set(id, now);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = sound.pitch[0] + Math.random() * (sound.pitch[1] - sound.pitch[0]);
    const gain = ctx.createGain();
    gain.gain.value = sound.volume * Math.max(0, o.volume ?? 1);
    let node: AudioNode = src;
    node.connect(gain);
    node = gain;
    if (o.pan && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, o.pan));
      node.connect(pan);
      node = pan;
    }
    node.connect(master);
    src.start();
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const files = new Set(Object.values(SOUNDS).flatMap((s: SoundDef) => s.files));
    await Promise.all(
      [...files].map(async (file) => {
        try {
          const res = await fetch(file);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.buffers.set(file, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch (err) {
          console.warn(`Sound ${file} could not be loaded; it will be silent.`, err);
        }
      }),
    );
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The game's one sound player. */
export const sfx = new Sfx();
