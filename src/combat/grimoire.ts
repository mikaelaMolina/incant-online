import type { IncantationSpec } from '../schemas/incantationSpec';
import type { Judgement } from '../arbiter/arbiter';

export const GRIMOIRE_BAR_SIZE = 6;

/**
 * The Grimoire: every Incantation the Incanter has forged (after the Arbiter).
 * The bar has 6 stable slots (keys 1–6): a new Incantation takes the first free slot, or the
 * slot used least recently once all are full. Everything stays in the Grimoire and can still be
 * recited by name; only the bar is limited.
 */
export class Grimoire {
  private readonly entries: Judgement[] = [];
  private readonly slots: (Judgement | undefined)[] = Array.from({ length: GRIMOIRE_BAR_SIZE }, () => undefined);
  /** Last forged / refined / cast name: what "make it …" refers to. */
  private lastName: string | undefined;
  /** Bumped on use; the least recent bar slot is replaced when the bar is full. */
  private readonly usedAt = new Map<string, number>();
  private clock = 0;
  /** Called after any change to the entries or the bar. */
  onChange: (() => void) | undefined;

  /** Add a newly forged Incantation (or update one with the same name, in place). */
  add(j: Judgement): Judgement {
    const existing = this.indexOf(j.incantation.name);
    if (existing >= 0) return this.replaceAt(existing, j);
    this.entries.push(j);
    const free = this.slots.findIndex((s) => !s);
    this.slots[free >= 0 ? free : this.leastRecentSlot()] = j;
    this.touch(j.incantation.name);
    this.onChange?.();
    return j;
  }

  /**
   * A refinement of `previousName` (which may come back renamed, e.g. "make it ice"): takes over
   * its entry and its bar slot. Falls back to add() if the original is gone.
   */
  replace(previousName: string, j: Judgement): Judgement {
    const i = this.indexOf(previousName);
    if (i < 0) return this.add(j);
    // A refinement renamed onto another existing name: drop that duplicate first.
    const clash = this.indexOf(j.incantation.name);
    if (clash >= 0 && clash !== i) this.remove(clash);
    return this.replaceAt(this.indexOf(previousName), j);
  }

  /** Mark as most recently used (cast, forged, refined). */
  touch(name: string): void {
    const e = this.find(name);
    if (!e) return;
    this.lastName = e.incantation.name;
    this.usedAt.set(key(e.incantation.name), ++this.clock);
  }

  find(name: string): Judgement | undefined {
    return this.entries[this.indexOf(name)];
  }

  /** The Incantation "make it …" refines. */
  get last(): IncantationSpec | undefined {
    return this.lastName ? this.find(this.lastName)?.incantation : undefined;
  }

  /** The 6 bar slots, in key order (empty slots are undefined). */
  get bar(): readonly (Judgement | undefined)[] {
    return this.slots;
  }

  get all(): readonly Judgement[] {
    return this.entries;
  }

  private replaceAt(i: number, j: Judgement): Judgement {
    const old = this.entries[i];
    this.entries[i] = j;
    const slot = this.slots.findIndex((s) => s === old);
    if (slot >= 0) this.slots[slot] = j;
    else this.slots[this.leastRecentSlot()] = j;
    if (old) this.usedAt.delete(key(old.incantation.name));
    this.touch(j.incantation.name);
    this.onChange?.();
    return j;
  }

  private remove(i: number): void {
    const [old] = this.entries.splice(i, 1);
    const slot = this.slots.findIndex((s) => s === old);
    if (slot >= 0) this.slots[slot] = undefined;
  }

  private leastRecentSlot(): number {
    let best = 0;
    let bestT = Infinity;
    this.slots.forEach((s, i) => {
      const t = s ? (this.usedAt.get(key(s.incantation.name)) ?? 0) : -1;
      if (t < bestT) {
        bestT = t;
        best = i;
      }
    });
    return best;
  }

  private indexOf(name: string): number {
    const k = key(name);
    return this.entries.findIndex((e) => key(e.incantation.name) === k);
  }
}

function key(name: string): string {
  return name.trim().toLowerCase();
}
