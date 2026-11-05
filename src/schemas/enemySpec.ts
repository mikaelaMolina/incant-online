import { z } from 'zod';
import { fuzzyEnum, int, lenientArray, num, objectOrEmpty, text } from './lenient.js';

export const ENEMY_ARCHETYPES = ['melee', 'ranged', 'tank', 'boss'] as const;

/** A boss phase: when HP falls to `at_hp` (fraction), apply `change` (free text, interpreted by enemy code). */
export const EnemyPhase = z.preprocess(
  objectOrEmpty,
  z.object({
    at_hp: num(0, 1, 0.5),
    change: text(80, 'enrage'),
  }),
);

/**
 * EnemySpec (CLAUDE.md). Ranges below are our own, chosen for a 1.7 m Incanter in 30–60 m floors.
 * `model` is a manifest id; it is resolved against the manifest by the enemy loader.
 */
export const EnemySpec = z.preprocess(
  objectOrEmpty,
  z.object({
    id: text(32, 'enemy'),
    archetype: fuzzyEnum(ENEMY_ARCHETYPES, 'melee', {
      warrior: 'melee',
      brute: 'melee',
      archer: 'ranged',
      caster: 'ranged',
      mage: 'ranged',
      shooter: 'ranged',
      guardian: 'tank',
      golem: 'tank',
      tanky: 'tank',
      miniboss: 'boss',
      champion: 'boss',
    }),
    model: text(64, ''),
    hp: int(1, 5000, 60),
    speed: num(0.5, 10, 3),
    damage: int(1, 200, 8),
    aggro_range: num(2, 40, 12),
    flee_threshold: num(0, 1, 0.15),
    attack_pattern: text(40, 'basic'),
    phases: lenientArray(EnemyPhase, 4),
  }),
);
export type EnemySpec = z.output<typeof EnemySpec>;
