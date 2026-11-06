import type { EnemySpec } from '../schemas/enemySpec';
import type { FloorSpec } from '../schemas/floorSpec';

/**
 * The Incanter's climb: experience, levels and the floor count. Pure (no three.js), so it is
 * unit-tested. Levels raise survivability only (HP, mana, regen), never Incantation damage: the
 * Arbiter's balance of every spoken Incantation stays exactly as judged.
 */

export const XP_FOR: Record<EnemySpec['archetype'], number> = { melee: 10, ranged: 12, tank: 25, boss: 120 };
export const MAX_LEVEL = 30;
/** Every third floor is guarded by a boss. */
export const BOSS_EVERY = 3;

export function xpToNext(level: number): number {
  return 40 + 30 * (level - 1);
}

export interface LevelStats {
  maxHp: number;
  maxMana: number;
  manaRegen: number;
}

export function statsFor(level: number): LevelStats {
  const l = Math.max(1, Math.min(MAX_LEVEL, level)) - 1;
  return { maxHp: 100 + 12 * l, maxMana: 200 + 15 * l, manaRegen: 8 + 0.5 * l };
}

export class Progression {
  level = 1;
  xp = 0;
  floor = 1;

  /** Add experience; returns how many levels were gained. */
  addXp(amount: number): number {
    if (amount <= 0 || this.level >= MAX_LEVEL) return 0;
    this.xp += amount;
    let gained = 0;
    while (this.level < MAX_LEVEL && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      gained++;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    return gained;
  }

  get xpFraction(): number {
    return this.level >= MAX_LEVEL ? 1 : this.xp / xpToNext(this.level);
  }

  get stats(): LevelStats {
    return statsFor(this.level);
  }

  get bossFloor(): boolean {
    return isBossFloor(this.floor);
  }
}

export function isBossFloor(floor: number): boolean {
  return floor > 0 && floor % BOSS_EVERY === 0;
}

/** Enemies get tougher the higher the Incanter climbs. */
export function floorScale(floor: number): { hp: number; damage: number } {
  const f = Math.max(0, floor - 1);
  return { hp: 1 + 0.15 * f, damage: 1 + 0.08 * f };
}

const BOSS_NAMES: Record<FloorSpec['biome'], string> = {
  forest: 'Thornmother',
  ruins: 'The Hollow King',
  ice: 'Rimeheart',
  desert: 'Sandwraith Sovereign',
  cavern: 'The Deep Maw',
  castle: 'Iron Regent',
  void: 'The Unwritten',
};

export function bossNameFor(biome: FloorSpec['biome']): string {
  return BOSS_NAMES[biome];
}

/**
 * The spawns actually used on floor `floor`: scaled by height, and on boss floors guaranteed a
 * boss (the floor's own if it described one, else the biome's guardian).
 */
export function spawnsForFloor(spec: FloorSpec, floor: number, bossModel: string): FloorSpec['spawns'] {
  const s = floorScale(floor);
  const scaled = spec.spawns.map((g) => ({
    ...g,
    enemy: { ...g.enemy, hp: Math.round(g.enemy.hp * s.hp), damage: Math.round(g.enemy.damage * s.damage) },
  }));
  if (!isBossFloor(floor) || scaled.some((g) => g.enemy.archetype === 'boss')) return scaled;
  const boss: EnemySpec = {
    id: bossNameFor(spec.biome),
    archetype: 'boss',
    model: bossModel,
    hp: Math.round(420 * s.hp),
    speed: 2.6,
    damage: Math.round(20 * s.damage),
    aggro_range: 22,
    flee_threshold: 0,
    attack_pattern: 'slam',
    phases: [{ at_hp: 0.5, change: 'enrage' }],
  };
  return [...scaled, { enemy: boss, count: 1 }];
}
