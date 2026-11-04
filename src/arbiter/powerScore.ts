import type { IncantationSpec, Shape } from '../schemas/incantationSpec';

/** Shapes whose radius counts toward power (CLAUDE.md: spin, cone, circle). */
export const AREA_SHAPES: readonly Shape[] = ['spin', 'cone', 'circle'];

/** Effect term E of the power score (CLAUDE.md). */
export function effectPower(spec: Pick<IncantationSpec, 'status_effect'>): number {
  const { kind, dps, duration } = spec.status_effect;
  switch (kind) {
    case 'burn':
      return dps * duration;
    case 'stun':
    case 'freeze':
      return 15 * duration;
    case 'slow':
      return 8 * duration;
    case 'knockback':
      return 10;
    case 'heal':
      return dps * duration; // amount healed
    case 'none':
      return 0;
  }
}

/** Everything in P except damage_per_hit: P = d × K + E. */
export function damageMultiplier(spec: Pick<IncantationSpec, 'hits' | 'radius' | 'shape' | 'chain_targets'>): number {
  const r = AREA_SHAPES.includes(spec.shape) ? spec.radius : 0;
  return spec.hits * (1 + r / 4) * (1 + 0.5 * spec.chain_targets);
}

/** P = d × h × (1 + r/4) × (1 + 0.5c) + E */
export function powerScore(spec: IncantationSpec): number {
  return spec.damage_per_hit * damageMultiplier(spec) + effectPower(spec);
}
