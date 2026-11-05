import type { StatusEffect, StatusKind } from '../schemas/incantationSpec';

/** Movement speed while slowed. */
export const SLOW_FACTOR = 0.5;

/** Lasting effects that can be on an enemy. Heal goes to the Incanter; knockback is instant. */
export type LastingStatus = 'burn' | 'freeze' | 'stun' | 'slow';

/**
 * Status effects on one target. Pure: the owner calls tick() every fixed step and reads the flags.
 * Re-applying refreshes to the longer duration (and the stronger burn); effects never stack.
 */
export class StatusSet {
  burnDps = 0;
  burnTime = 0;
  freezeTime = 0;
  stunTime = 0;
  slowTime = 0;

  /** Apply an Incantation's status_effect. Returns the lasting status it caused, if any. */
  apply(effect: StatusEffect): LastingStatus | undefined {
    const t = Math.max(0, effect.duration);
    switch (effect.kind) {
      case 'burn':
        if (t <= 0 || effect.dps <= 0) return undefined;
        this.burnDps = Math.max(this.burnTime > 0 ? this.burnDps : 0, effect.dps);
        this.burnTime = Math.max(this.burnTime, t);
        return 'burn';
      case 'freeze':
        if (t <= 0) return undefined;
        this.freezeTime = Math.max(this.freezeTime, t);
        return 'freeze';
      case 'stun':
        if (t <= 0) return undefined;
        this.stunTime = Math.max(this.stunTime, t);
        return 'stun';
      case 'slow':
        if (t <= 0) return undefined;
        this.slowTime = Math.max(this.slowTime, t);
        return 'slow';
      case 'knockback':
      case 'heal':
      case 'none':
        return undefined;
    }
  }

  /** Advance timers. Returns burn damage dealt during this step. */
  tick(dt: number): number {
    let burn = 0;
    if (this.burnTime > 0) {
      burn = this.burnDps * Math.min(dt, this.burnTime);
      this.burnTime = Math.max(0, this.burnTime - dt);
      if (this.burnTime === 0) this.burnDps = 0;
    }
    this.freezeTime = Math.max(0, this.freezeTime - dt);
    this.stunTime = Math.max(0, this.stunTime - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    return burn;
  }

  /** Frozen or stunned: can't move or attack. */
  get immobile(): boolean {
    return this.freezeTime > 0 || this.stunTime > 0;
  }

  get speedMultiplier(): number {
    if (this.immobile) return 0;
    return this.slowTime > 0 ? SLOW_FACTOR : 1;
  }

  /** The most visible active status (for tinting): freeze > stun > burn > slow. */
  get dominant(): StatusKind {
    if (this.freezeTime > 0) return 'freeze';
    if (this.stunTime > 0) return 'stun';
    if (this.burnTime > 0) return 'burn';
    if (this.slowTime > 0) return 'slow';
    return 'none';
  }

  clear(): void {
    this.burnDps = this.burnTime = this.freezeTime = this.stunTime = this.slowTime = 0;
  }
}
