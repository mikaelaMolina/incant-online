import { describe, expect, it } from 'vitest';
import { areaCentre, inArea, planCast, hitAreaFor, type HitArea } from './castPlan';
import { IncantationSpec, INCANTATION_SHAPES, INCANTATION_TYPES, STATUS_KINDS } from '../schemas/incantationSpec';
import { CACHED_INCANTATIONS } from '../fallback/cache';
import { judge } from '../arbiter/arbiter';
import { TEST_INCANTATIONS } from './testIncantations';

const o = { x: 0, z: 0 };
const fwd = { x: 0, z: -1 };

function finiteDeep(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (v && typeof v === 'object') return Object.values(v).every(finiteDeep);
  return true;
}

describe('planCast', () => {
  it('produces a finite, usable plan for every type × shape × status at both radius extremes', () => {
    for (const type of INCANTATION_TYPES)
      for (const shape of INCANTATION_SHAPES)
        for (const kind of STATUS_KINDS)
          for (const radius of [1, 8])
            for (const hits of [1, 5]) {
              const spec = judge({ name: 'T', type, shape, radius, hits, damage_per_hit: 20, chain_targets: 2, status_effect: { kind, dps: 5, duration: 3 } }).incantation;
              const plan = planCast(spec);
              expect(finiteDeep(plan), `${type}/${shape}/${kind}`).toBe(true);
              expect(plan.hits).toBe(hits);
              expect(plan.interval).toBeGreaterThanOrEqual(0);
              // The area always reaches at least a metre: something can be hit.
              expect(inArea(plan.area, o, fwd, { x: 0, z: -1 }, 0.4)).toBe(true);
              if (type === 'projectile') expect(plan.projectile).toBeDefined();
              if (type === 'beam') expect(plan.beam).toBeDefined();
              if (type === 'dash') expect(plan.dash).toBeDefined();
              if (type === 'buff') expect(plan.buff).toBeDefined();
              if (type === 'chain') expect(plan.chain.reach).toBeGreaterThan(0);
            }
  });

  it('plans every cached and test Incantation', () => {
    for (const raw of CACHED_INCANTATIONS) expect(finiteDeep(planCast(judge(raw).incantation))).toBe(true);
    expect(TEST_INCANTATIONS).toHaveLength(3);
  });

  it('Blazing Cyclone: three spins of radius 3.5 around the caster', () => {
    const plan = planCast(TEST_INCANTATIONS[0]!.incantation);
    expect(plan.hits).toBe(3);
    expect(plan.area).toEqual({ kind: 'circle', radius: 3.5, offset: 0 });
    expect(inArea(plan.area, o, fwd, { x: 3.6, z: 0 }, 0.4)).toBe(true); // behind/side too
  });

  it('heal goes to the Incanter; knockback is stronger than the base push', () => {
    const heal = planCast(IncantationSpec.parse({ type: 'buff', status_effect: { kind: 'heal', dps: 5, duration: 4 } }));
    expect(heal.selfHeal).toEqual({ perSecond: 5, duration: 4 });
    const kb = planCast(IncantationSpec.parse({ status_effect: { kind: 'knockback' } }));
    const plain = planCast(IncantationSpec.parse({}));
    expect(kb.knockback).toBeGreaterThan(plain.knockback);
  });

  it('freeze / stun buffs ward the Incanter for at most 3 s', () => {
    const plan = planCast(judge({ type: 'buff', status_effect: { kind: 'freeze', duration: 10 } }).incantation);
    expect(plan.buff?.ward).toBeLessThanOrEqual(3);
    expect(plan.buff?.ward).toBeGreaterThan(0);
  });

  it('cone projectiles fire as a fan, others one after another', () => {
    const cone = planCast(IncantationSpec.parse({ type: 'projectile', shape: 'cone', hits: 3 }));
    expect(cone.projectile?.volleySpread).toBeGreaterThan(0);
    expect(cone.interval).toBe(0);
    const orb = planCast(IncantationSpec.parse({ type: 'projectile', shape: 'orb', hits: 3 }));
    expect(orb.projectile?.volleySpread).toBe(0);
    expect(orb.projectile?.explodeRadius).toBeGreaterThan(0);
  });
});

describe('hit areas', () => {
  const at = (area: HitArea, x: number, z: number) => inArea(area, o, fwd, { x, z }, 0.3);

  it('slash covers a wide front arc but not behind', () => {
    const a = hitAreaFor('slash', 3);
    expect(at(a, 0, -2.5)).toBe(true);
    expect(at(a, 2, -1)).toBe(true);
    expect(at(a, 0, 2)).toBe(false);
  });
  it('thrust and line are narrow strips', () => {
    const t = hitAreaFor('thrust', 2);
    expect(at(t, 0, -3)).toBe(true);
    expect(at(t, 1.5, -2)).toBe(false);
    const l = hitAreaFor('line', 5);
    expect(at(l, 0, -11)).toBe(true);
    expect(at(l, 0, 1)).toBe(false);
  });
  it('orb is a ball ahead of the caster', () => {
    const a = hitAreaFor('orb', 3);
    const c = areaCentre(a, o, fwd);
    expect(c.z).toBeLessThan(0);
    expect(at(a, 0, c.z)).toBe(true);
    expect(at(a, 0, 3)).toBe(false);
  });
  it('cone is narrower but longer than slash', () => {
    const cone = hitAreaFor('cone', 4);
    const slash = hitAreaFor('slash', 4);
    expect(at(cone, 0, -6.5)).toBe(true);
    expect(at(slash, 0, -6.5)).toBe(false);
    expect(at(cone, 3, -1)).toBe(false);
  });
});
