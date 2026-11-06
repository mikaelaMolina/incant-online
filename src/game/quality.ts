/**
 * Adaptive render quality. Starts at the best level and steps down while the game runs below
 * target, so a strong GPU keeps 4× multisampling at full resolution and an integrated laptop GPU
 * gets its frame rate back. Pure: feed it frame times, apply the level it returns.
 *
 * Decisions use the MEDIAN frame time over a window, so one-off hitches (a floor loading, a model
 * streaming in) don't count. It only steps down (no flicker between levels), and waits between
 * steps so each change can take effect before the next is judged.
 *
 * Applying a level is itself a hitch (render buffers are rebuilt; on some drivers every shader's
 * pipeline too), so the game applies changes where nobody notices: on the start screen, or behind
 * the floor-change curtain. Only below the 30 fps minimum is a change applied mid-fight.
 */

export interface QualityLevel {
  label: string;
  /** MSAA samples for the bloom composer's buffer. */
  samples: number;
  /** Multiplier on min(devicePixelRatio, 2). */
  resolution: number;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { label: 'high (4× MSAA)', samples: 4, resolution: 1 },
  { label: 'medium (2× MSAA)', samples: 2, resolution: 1 },
  { label: 'low (no MSAA)', samples: 0, resolution: 1 },
  { label: 'low, 85% resolution', samples: 0, resolution: 0.85 },
  { label: 'lowest, 75% resolution', samples: 0, resolution: 0.75 },
];

/** Step down while the median frame is slower than this (≈ 50 fps). */
export const SLOW_FRAME_MS = 20;
/** Below the 30 fps minimum: worth a hitch to fix right away. */
export const SEVERE_FRAME_MS = 33.4;
const WINDOW = 120; // frames (~2 s at 60 fps)
const COOLDOWN_S = 2.5;

export class AdaptiveQuality {
  level = 0;
  private readonly frames: number[] = [];
  private cooldown = COOLDOWN_S;
  /** Median frame time (ms) of the window that triggered the last step. */
  lastMedian = 0;

  constructor(private readonly enabled = true) {}

  get current(): QualityLevel {
    return QUALITY_LEVELS[this.level] ?? QUALITY_LEVELS[0]!;
  }

  /** Forget recent frames (floor change, unpause): they say nothing about steady-state speed. */
  reset(): void {
    this.frames.length = 0;
    this.cooldown = COOLDOWN_S;
  }

  /**
   * Record one frame (real seconds, unclamped). Returns the new level when it should change.
   * Call only while the game is actually simulating.
   */
  sample(frameSeconds: number): QualityLevel | undefined {
    if (!this.enabled || this.level >= QUALITY_LEVELS.length - 1) return undefined;
    this.cooldown -= frameSeconds;
    this.frames.push(frameSeconds * 1000);
    if (this.frames.length > WINDOW) this.frames.shift();
    if (this.cooldown > 0 || this.frames.length < WINDOW) return undefined;
    this.lastMedian = median(this.frames);
    if (this.lastMedian <= SLOW_FRAME_MS) return undefined;
    this.level++;
    this.reset();
    return this.current;
  }
}

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
