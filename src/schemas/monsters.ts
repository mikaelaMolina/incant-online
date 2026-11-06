import type { Biome } from './floorSpec.js';
import type { EnemySpec } from './enemySpec.js';

/**
 * Which creature models live where. Shared by the mock parser, the LLM prompt and the boss
 * picker, so every floor gets fitting monsters (CC0 Quaternius "Cute Animated Monsters").
 */
type Archetype = EnemySpec['archetype'];

export const MONSTER_ROSTER: Record<Biome, Record<Archetype, string>> = {
  forest: { melee: 'monster.tree', ranged: 'monster.greendemon', tank: 'monster.cyclops', boss: 'monster.yellowdragon' },
  ruins: { melee: 'monster.skull', ranged: 'monster.ghost', tank: 'monster.cyclops', boss: 'monster.demon' },
  ice: { melee: 'monster.yeti', ranged: 'monster.ghost', tank: 'monster.yeti', boss: 'monster.yellowdragon' },
  desert: { melee: 'monster.cactus', ranged: 'monster.alien_tall', tank: 'monster.crab', boss: 'monster.demon' },
  cavern: { melee: 'monster.crab', ranged: 'monster.skull', tank: 'monster.cyclops', boss: 'monster.demon' },
  castle: { melee: 'monster.skull', ranged: 'monster.ghost', tank: 'monster.cyclops', boss: 'monster.demon' },
  void: { melee: 'monster.alien_tall', ranged: 'monster.ghost', tank: 'monster.demon', boss: 'monster.yellowdragon' },
};

/** Humanoid foes, used when the player asks for people (bandits, knights…). */
export const HUMANOID_MODELS: Partial<Record<Archetype, string>> = {
  melee: 'rpg.rogue',
  ranged: 'rpg.ranger',
  tank: 'rpg.warrior',
  boss: 'rpg.warrior',
};

/** Words for creatures we have a model for (word patterns: a trailing * matches any ending). */
export const CREATURE_WORDS: ReadonlyArray<readonly [string, string]> = [
  ['skelet*', 'monster.skull'], ['skull*', 'monster.skull'], ['undead', 'monster.skull'], ['bone*', 'monster.skull'],
  ['ghost*', 'monster.ghost'], ['spirit*', 'monster.ghost'], ['wraith*', 'monster.ghost'], ['phantom*', 'monster.ghost'], ['spectre*', 'monster.ghost'], ['specter*', 'monster.ghost'],
  ['demon*', 'monster.demon'], ['devil*', 'monster.demon'], ['fiend*', 'monster.demon'],
  ['imp', 'monster.greendemon'], ['imps', 'monster.greendemon'], ['goblin*', 'monster.greendemon'],
  ['dragon*', 'monster.yellowdragon'], ['wyrm*', 'monster.yellowdragon'], ['drake*', 'monster.yellowdragon'], ['wyvern*', 'monster.yellowdragon'],
  ['yeti*', 'monster.yeti'], ['snowm*', 'monster.yeti'],
  ['crab*', 'monster.crab'], ['cactus*', 'monster.cactus'], ['cacti', 'monster.cactus'],
  ['treant*', 'monster.tree'], ['ent', 'monster.tree'], ['ents', 'monster.tree'],
  ['cyclop*', 'monster.cyclops'], ['ogre*', 'monster.cyclops'], ['troll*', 'monster.cyclops'], ['giant*', 'monster.cyclops'],
  ['alien*', 'monster.alien_tall'],
  ['bandit*', 'rpg.rogue'], ['thie*', 'rpg.rogue'], ['knight*', 'rpg.warrior'], ['soldier*', 'rpg.warrior'], ['archer*', 'rpg.ranger'], ['ranger*', 'rpg.ranger'],
];

/** Every enemy model id the LLM may use. */
export const ENEMY_MODEL_IDS: readonly string[] = [
  ...new Set([...Object.values(MONSTER_ROSTER).flatMap((r) => Object.values(r)), ...Object.values(HUMANOID_MODELS), 'rpg.monk', 'rpg.cleric']),
];

export function monsterFor(biome: Biome, archetype: Archetype): string {
  return MONSTER_ROSTER[biome][archetype];
}
