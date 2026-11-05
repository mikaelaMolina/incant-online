import { describe, expect, it } from 'vitest';
import { StatusSet, SLOW_FACTOR } from './statusEffects';
import { CastResources, MAX_MANA } from './mana';
import { judge, MAX_COOLDOWN, POWER_PER_COOLDOWN_SECOND, MANA_PER_POWER } from '../arbiter/arbiter';

describe('StatusSet', () => {
  it('burn deals dps × duration in total, then stops', () => {
    const s = new StatusSet();
    s.apply({ kind: 'burn', dps: 4, duration: 3 });
    let total = 0;
    for (let i = 0; i < 300; i++) total += s.tick(1 / 60);
    expect(total).toBeCloseTo(12, 5);
    expect(s.dominant).toBe('none');
  });

  it('freeze and stun stop movement; slow halves it', () => {
    const s = new StatusSet();
    s.apply({ kind: 'slow', dps: 0, duration: 2 });
    expect(s.speedMultiplier).toBe(SLOW_FACTOR);
    s.apply({ kind: 'stun', dps: 0, duration: 0.5 });
    expect(s.immobile).toBe(true);
    expect(s.speedMultiplier).toBe(0);
    s.tick(0.6);
    expect(s.immobile).toBe(false);
    expect(s.speedMultiplier).toBe(SLOW_FACTOR);
  });

  it('re-applying refreshes instead of stacking', () => {
    const s = new StatusSet();
    s.apply({ kind: 'freeze', dps: 0, duration: 2 });
    s.apply({ kind: 'freeze', dps: 0, duration: 1 });
    expect(s.freezeTime).toBe(2);
  });

  it('heal, knockback, none and zero durations leave no lasting status', () => {
    const s = new StatusSet();
    expect(s.apply({ kind: 'heal', dps: 5, duration: 3 })).toBeUndefined();
    expect(s.apply({ kind: 'knockback', dps: 0, duration: 0 })).toBeUndefined();
    expect(s.apply({ kind: 'freeze', dps: 0, duration: 0 })).toBeUndefined();
    expect(s.dominant).toBe('none');
  });
});

describe('CastResources', () => {
  it('every Arbiter-judged Incantation is affordable from full mana', () => {
    const maxCost = Math.round(MAX_COOLDOWN * POWER_PER_COOLDOWN_SECOND * MANA_PER_POWER);
    expect(maxCost).toBeLessThanOrEqual(MAX_MANA);
    const huge = judge({ name: 'Huge', hits: 5, radius: 8, shape: 'circle', damage_per_hit: 60, chain_targets: 5, status_effect: { kind: 'stun', duration: 10 } });
    expect(huge.incantation.mana_cost).toBeLessThanOrEqual(MAX_MANA);
  });

  it('blocks on cooldown, then on mana, and regenerates', () => {
    const r = new CastResources();
    expect(r.check('Bolt', 30)).toBeUndefined();
    r.spend('Bolt', 30, 5);
    expect(r.check('bolt', 30)).toEqual({ reason: 'cooldown', remaining: 5 });
    r.update(5.01);
    expect(r.check('Bolt', 30)).toBeUndefined();
    r.mana = 10;
    expect(r.check('Bolt', 30)).toEqual({ reason: 'mana', missing: 20 });
    r.update(10);
    expect(r.mana).toBeGreaterThanOrEqual(30);
  });
});
