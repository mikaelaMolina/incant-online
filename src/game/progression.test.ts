import { describe, expect, it } from 'vitest';
import { Progression, isBossFloor, spawnsForFloor, statsFor, xpToNext, MAX_LEVEL } from './progression';
import { parseFloorSpec, type FloorSpec } from '../schemas/floorSpec';
import forestFloorJson from '../fallback/floor-forest.json';

// A combat floor with described enemies (the starting arena is now the peaceful prologue village).
const parsed = parseFloorSpec(forestFloorJson);
if (!parsed.ok) throw new Error(parsed.error);
const COMBAT_FLOOR: FloorSpec = parsed.value;

describe('Progression', () => {
  it('levels up when XP passes the threshold, carrying the remainder', () => {
    const p = new Progression();
    expect(p.addXp(xpToNext(1) - 1)).toBe(0);
    expect(p.addXp(6)).toBe(1);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(5);
  });

  it('can gain several levels at once and stops at the cap', () => {
    const p = new Progression();
    expect(p.addXp(xpToNext(1) + xpToNext(2))).toBe(2);
    p.addXp(1e9);
    expect(p.level).toBe(MAX_LEVEL);
    expect(p.xpFraction).toBe(1);
  });

  it('levels raise HP, mana and regen', () => {
    expect(statsFor(1)).toEqual({ maxHp: 100, maxMana: 200, manaRegen: 8 });
    expect(statsFor(5).maxHp).toBeGreaterThan(statsFor(4).maxHp);
  });

  it('every third floor is a boss floor', () => {
    expect([1, 2, 3, 4, 5, 6].map(isBossFloor)).toEqual([false, false, true, false, false, true]);
  });
});

describe('spawnsForFloor', () => {
  it('floor 1 is unchanged and has no added boss', () => {
    expect(spawnsForFloor(COMBAT_FLOOR, 1, 'x')).toEqual(COMBAT_FLOOR.spawns);
  });

  it('higher floors are tougher', () => {
    const hp1 = spawnsForFloor(COMBAT_FLOOR, 1, 'x')[0]!.enemy.hp;
    const hp4 = spawnsForFloor(COMBAT_FLOOR, 4, 'x')[0]!.enemy.hp;
    expect(hp4).toBeGreaterThan(hp1);
  });

  it('boss floors gain exactly one named boss', () => {
    const spawns = spawnsForFloor(COMBAT_FLOOR, 3, 'monster.boss');
    const bosses = spawns.filter((g) => g.enemy.archetype === 'boss');
    expect(bosses).toHaveLength(1);
    expect(bosses[0]!.count).toBe(1);
    expect(bosses[0]!.enemy.model).toBe('monster.boss');
    expect(bosses[0]!.enemy.id.length).toBeGreaterThan(3);
  });
});

describe('planWaves', () => {
  it('a normal floor has the described enemies, then fewer reinforcements', async () => {
    const { planWaves } = await import('./progression');
    const waves = planWaves(COMBAT_FLOOR.spawns, 1);
    expect(waves).toHaveLength(2);
    const total = (w: (typeof waves)[number]) => w.reduce((a, g) => a + g.count, 0);
    expect(total(waves[1]!)).toBeLessThan(total(waves[0]!));
    expect(waves[1]!.some((g) => g.enemy.archetype === 'tank')).toBe(false); // no tank reinforcements on floor 1
  });
  it('the boss arrives in the last wave', async () => {
    const { planWaves } = await import('./progression');
    const waves = planWaves(spawnsForFloor(COMBAT_FLOOR, 3), 3);
    expect(waves[0]!.some((g) => g.enemy.archetype === 'boss')).toBe(false);
    expect(waves.at(-1)!.some((g) => g.enemy.archetype === 'boss')).toBe(true);
  });
  it('a peaceful floor has no waves', async () => {
    const { planWaves } = await import('./progression');
    expect(planWaves([], 2)).toEqual([]);
  });
});
