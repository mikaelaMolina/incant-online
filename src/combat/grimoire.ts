import type { IncantationSpec } from '../schemas/incantationSpec';
import type { Judgement } from '../arbiter/arbiter';

export const GRIMOIRE_BAR_SIZE = 6;

/**
 * The Grimoire: Incantations the Incanter has forged (after the Arbiter). The bar shows up to 6;
 * casting them by name arrives with the Incantation runner.
 */
export class Grimoire {
  private readonly entries: Judgement[] = [];

  /** Add (or replace by name) and return the stored entry. */
  add(j: Judgement): Judgement {
    const i = this.entries.findIndex((e) => e.incantation.name.toLowerCase() === j.incantation.name.toLowerCase());
    if (i >= 0) this.entries.splice(i, 1);
    this.entries.unshift(j);
    return j;
  }

  get last(): IncantationSpec | undefined {
    return this.entries[0]?.incantation;
  }

  get bar(): readonly Judgement[] {
    return this.entries.slice(0, GRIMOIRE_BAR_SIZE);
  }

  get all(): readonly Judgement[] {
    return this.entries;
  }
}
