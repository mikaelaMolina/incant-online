/**
 * The Incanter's mana and per-Incantation cooldowns.
 * Max mana is above the Arbiter's highest possible cost (P ≤ 60 × 14 = 840 → 168 mana),
 * so every judged Incantation can be cast from a full pool.
 */
export const MAX_MANA = 200;
export const MANA_REGEN = 8; // per second

export type CastBlock = { reason: 'cooldown'; remaining: number } | { reason: 'mana'; missing: number };

export class CastResources {
  mana = MAX_MANA;
  readonly max = MAX_MANA;
  private readonly cooldowns = new Map<string, { remaining: number; total: number }>();

  /** Why an Incantation can't be cast right now, or undefined if it can. */
  check(name: string, manaCost: number): CastBlock | undefined {
    const cd = this.cooldowns.get(key(name));
    if (cd && cd.remaining > 0) return { reason: 'cooldown', remaining: cd.remaining };
    if (manaCost > this.mana) return { reason: 'mana', missing: Math.ceil(manaCost - this.mana) };
    return undefined;
  }

  /** Pay for a cast and start its cooldown. Call only after check() passed. */
  spend(name: string, manaCost: number, cooldown: number): void {
    this.mana = Math.max(0, this.mana - Math.max(0, manaCost));
    if (cooldown > 0) this.cooldowns.set(key(name), { remaining: cooldown, total: cooldown });
  }

  /** Seconds left and total, for the HUD. */
  cooldown(name: string): { remaining: number; total: number } {
    return this.cooldowns.get(key(name)) ?? { remaining: 0, total: 0 };
  }

  update(dt: number): void {
    this.mana = Math.min(this.max, this.mana + MANA_REGEN * dt);
    for (const [k, cd] of this.cooldowns) {
      cd.remaining -= dt;
      if (cd.remaining <= 0) this.cooldowns.delete(k);
    }
  }

  reset(): void {
    this.mana = this.max;
    this.cooldowns.clear();
  }
}

function key(name: string): string {
  return name.trim().toLowerCase();
}
