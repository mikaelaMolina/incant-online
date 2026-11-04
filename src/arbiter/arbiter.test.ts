import { describe, expect, it } from 'vitest';
import { judge, MAX_BURST } from './arbiter';
import { powerScore } from './powerScore';
import { IncantationSpec } from '../schemas/incantationSpec';

const blazingCyclone = {
  name: 'Blazing Cyclone',
  flavor: 'Three spinning cuts wreathed in fire.',
  type: 'melee_combo',
  hits: 3,
  shape: 'spin',
  radius: 3.5,
  damage_per_hit: 18,
  element: 'fire',
  status_effect: { kind: 'burn', dps: 4, duration: 3 },
  chain_targets: 0,
  cooldown: 8,
  mana_cost: 20,
  vfx: { color: '#ff6a1a', trail: true, particles: 'embers' },
};

describe('Arbiter', () => {
  it('Blazing Cyclone (CLAUDE.md): P ≈ 113, cooldown 9, mana 23, accepted', () => {
    const j = judge(blazingCyclone);
    expect(j.power).toBeCloseTo(113.25, 2);
    expect(Math.round(j.power)).toBe(113);
    expect(j.incantation.cooldown).toBe(9);
    expect(j.incantation.mana_cost).toBe(23);
    expect(j.accepted).toBe(true);
    expect(j.incantation.damage_per_hit).toBe(18);
    expect(j.sentence).toBe('The Spire resists such power: cooldown raised to 9 s.');
  });

  it('accepts a modest Incantation unchanged', () => {
    const j = judge({ ...blazingCyclone, name: 'Ember Flick', hits: 1, damage_per_hit: 10, cooldown: 5 });
    expect(j.changes).toEqual([]);
    expect(j.sentence).toBe('The Spire accepts Ember Flick.');
  });

  it('only counts radius for area shapes', () => {
    const spec = IncantationSpec.parse({ ...blazingCyclone, shape: 'orb', status_effect: { kind: 'none' } });
    expect(powerScore(spec)).toBe(18 * 3);
  });

  it('reports clamped fields', () => {
    const j = judge({ ...blazingCyclone, hits: 12, damage_per_hit: 5 });
    expect(j.incantation.hits).toBe(5);
    expect(j.changes).toContain('hits capped at 5');
  });

  it('bans instant kills by reducing burst damage', () => {
    const j = judge({ ...blazingCyclone, hits: 5, damage_per_hit: 60, chain_targets: 0 });
    expect(j.incantation.damage_per_hit * j.incantation.hits).toBeLessThanOrEqual(MAX_BURST);
    expect(j.changes.some((c) => c.startsWith('no instant kills'))).toBe(true);
  });

  it('never exceeds a 60 s cooldown and scales damage to fit', () => {
    const j = judge({ ...blazingCyclone, hits: 5, damage_per_hit: 40, radius: 8, chain_targets: 5, cooldown: 1 });
    expect(j.incantation.cooldown).toBeLessThanOrEqual(60);
    expect(j.power).toBeLessThanOrEqual(60 * 14);
  });

  it('caps invulnerability and self-healing on buffs', () => {
    const shield = judge({ ...blazingCyclone, type: 'buff', status_effect: { kind: 'stun', duration: 9 } });
    expect(shield.incantation.status_effect.duration).toBe(3);
    const heal = judge({ ...blazingCyclone, type: 'buff', status_effect: { kind: 'heal', dps: 30, duration: 10 } });
    const h = heal.incantation.status_effect;
    expect(h.dps * h.duration).toBeLessThanOrEqual(50);
  });

  it('mana is round(P × 0.2) and the sentence is one line', () => {
    const j = judge({ ...blazingCyclone, hits: 5, damage_per_hit: 60 });
    expect(j.incantation.mana_cost).toBe(Math.round(j.power * 0.2));
    expect(j.sentence.split('.').filter(Boolean)).toHaveLength(1);
  });
});
