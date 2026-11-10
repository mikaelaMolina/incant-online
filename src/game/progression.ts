import type { EnemySpec } from '../schemas/enemySpec';
import type { FloorSpec } from '../schemas/floorSpec';
import { monsterFor } from '../schemas/monsters';

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
  /** Permanent bonuses on top of the level's stats (charms bought in the village). */
  bonus: LevelStats = { maxHp: 0, maxMana: 0, manaRegen: 0 };

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
    const s = statsFor(this.level);
    return { maxHp: s.maxHp + this.bonus.maxHp, maxMana: s.maxMana + this.bonus.maxMana, manaRegen: s.manaRegen + this.bonus.manaRegen };
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
export function spawnsForFloor(spec: FloorSpec, floor: number, bossModel = monsterFor(spec.biome, 'boss')): FloorSpec['spawns'] {
  const s = floorScale(floor);
  // Higher floors are busier too: +20% enemies per floor, and at least 3 melee from floor 2.
  const more = 1 + 0.2 * Math.max(0, floor - 1);
  const scaled = spec.spawns.map((g) => ({
    ...g,
    count:
      g.enemy.archetype === 'boss' || floor === 1
        ? g.count
        : Math.max(g.enemy.archetype === 'melee' ? 3 : 1, Math.ceil(g.count * more)),
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

const BIOME_LINES: Record<FloorSpec['biome'], string> = {
  forest: 'Where the old roots still listen',
  ruins: 'Stones that remember older words',
  ice: 'Every breath here freezes into silence',
  desert: 'The sand swallows all but the loudest voice',
  cavern: 'Deep below, something echoes back',
  castle: 'Walls raised by a forgotten tongue',
  void: 'Nothing here until you name it',
};

/** Title-card subtitle for a floor. */
export function floorSubtitle(biome: FloorSpec['biome'], boss: boolean): string {
  return boss ? `${BIOME_LINES[biome]}. A guardian waits.` : BIOME_LINES[biome];
}

/**
 * Split a floor's spawns into waves. Wave 1 is the floor as described; then reinforcements
 * (fewer, and they hunt the Incanter) so a floor ends in a rush instead of a search. On a floor
 * with a boss, the boss arrives last with a small escort.
 */
export function planWaves(spawns: FloorSpec['spawns'], floor: number): FloorSpec['spawns'][] {
  const bosses = spawns.filter((g) => g.enemy.archetype === 'boss');
  const minions = spawns.filter((g) => g.enemy.archetype !== 'boss');
  if (minions.length === 0) return bosses.length ? [bosses] : [];
  const waves: FloorSpec['spawns'][] = [minions];
  const reinforce = minions
    .filter((g) => floor >= 2 || g.enemy.archetype !== 'tank')
    .map((g) => ({ ...g, count: Math.max(1, Math.round(g.count * (floor >= 2 ? 0.8 : 0.6))) }));
  if (bosses.length) {
    const escort = reinforce.filter((g) => g.enemy.archetype === 'melee').map((g) => ({ ...g, count: Math.min(2, g.count) }));
    waves.push([...escort, ...bosses]);
  } else if (reinforce.length) {
    waves.push(reinforce);
    // From floor 4 a last, smaller rush of the quick ones (no tanks) closes the floor.
    if (floor >= 4) {
      const rush = reinforce.filter((g) => g.enemy.archetype !== 'tank').map((g) => ({ ...g, count: Math.max(1, Math.ceil(g.count * 0.6)) }));
      if (rush.length) waves.push(rush);
    }
  }
  return waves;
}
