import { z } from 'zod';
import { fuzzyEnum, hexColor, int, num, objectOrEmpty, text } from './lenient.js';

export const INCANTATION_TYPES = ['melee_combo', 'projectile', 'area', 'beam', 'chain', 'buff', 'dash'] as const;
export const INCANTATION_SHAPES = ['slash', 'thrust', 'spin', 'cone', 'circle', 'line', 'orb'] as const;
export const ELEMENTS = ['physical', 'fire', 'ice', 'lightning', 'wind', 'light', 'shadow'] as const;
export const STATUS_KINDS = ['none', 'burn', 'freeze', 'stun', 'slow', 'knockback', 'heal'] as const;
export const PARTICLES = ['embers', 'frost', 'sparks', 'leaves', 'motes', 'smoke'] as const;

export type IncantationType = (typeof INCANTATION_TYPES)[number];
export type Shape = (typeof INCANTATION_SHAPES)[number];
export type Element = (typeof ELEMENTS)[number];
export type StatusKind = (typeof STATUS_KINDS)[number];
export type Particles = (typeof PARTICLES)[number];

/** Field ranges from CLAUDE.md. Shared by the schema, the Arbiter and the LLM prompt. */
export const RANGES = {
  hits: [1, 5],
  radius: [1, 8],
  damage_per_hit: [5, 60],
  chain_targets: [0, 5],
  cooldown: [1, 60],
  status_duration: [0, 10],
  /** Not in CLAUDE.md: our cap for burn / heal per second. */
  status_dps: [0, 30],
  mana_cost: [0, 999],
} as const;

const TYPE_ALIASES: Record<string, IncantationType> = {
  melee: 'melee_combo',
  combo: 'melee_combo',
  strike: 'melee_combo',
  slash: 'melee_combo',
  bolt: 'projectile',
  missile: 'projectile',
  shot: 'projectile',
  aoe: 'area',
  nova: 'area',
  explosion: 'area',
  ray: 'beam',
  laser: 'beam',
  bounce: 'chain',
  shield: 'buff',
  heal: 'buff',
  aura: 'buff',
  charge: 'dash',
  teleport: 'dash',
  blink: 'dash',
};

const ELEMENT_ALIASES: Record<string, Element> = {
  flame: 'fire',
  flames: 'fire',
  burning: 'fire',
  inferno: 'fire',
  frost: 'ice',
  frozen: 'ice',
  water: 'ice',
  thunder: 'lightning',
  electric: 'lightning',
  storm: 'lightning',
  air: 'wind',
  holy: 'light',
  radiant: 'light',
  dark: 'shadow',
  darkness: 'shadow',
  void: 'shadow',
  arcane: 'light',
  earth: 'physical',
  stone: 'physical',
  steel: 'physical',
};

export const StatusEffect = z.preprocess(
  objectOrEmpty,
  z.object({
    kind: fuzzyEnum(STATUS_KINDS, 'none', {
      fire: 'burn',
      burning: 'burn',
      ice: 'freeze',
      frozen: 'freeze',
      paralyze: 'stun',
      shock: 'stun',
      daze: 'stun',
      snare: 'slow',
      chill: 'slow',
      push: 'knockback',
      knock: 'knockback',
      regen: 'heal',
      healing: 'heal',
    }),
    /** burn: damage per second; heal: HP per second. Ignored for other kinds. */
    dps: num(RANGES.status_dps[0], RANGES.status_dps[1], 0),
    duration: num(RANGES.status_duration[0], RANGES.status_duration[1], 0),
  }),
);
export type StatusEffect = z.output<typeof StatusEffect>;

export const Vfx = z.preprocess(
  objectOrEmpty,
  z.object({
    color: hexColor('#9fd8ff'),
    trail: z
      .unknown()
      .optional()
      .transform((v) => v === true || v === 'true'),
    particles: fuzzyEnum(PARTICLES, 'sparks', { fire: 'embers', ice: 'frost', snow: 'frost', dust: 'smoke', light: 'motes' }),
  }),
);

/**
 * IncantationSpec (CLAUDE.md). Lenient like FloorSpec: clamped numbers, nearest enums.
 * Fails only for non-objects. mana_cost is overwritten by the Arbiter.
 */
export const IncantationSpec = z.preprocess(
  (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined),
  z.object({
    name: text(32, 'Nameless Incantation'),
    flavor: text(120, ''),
    type: fuzzyEnum(INCANTATION_TYPES, 'projectile', TYPE_ALIASES),
    shape: fuzzyEnum(INCANTATION_SHAPES, 'orb', {
      cut: 'slash',
      stab: 'thrust',
      pierce: 'thrust',
      whirl: 'spin',
      cyclone: 'spin',
      breath: 'cone',
      ring: 'circle',
      nova: 'circle',
      beam: 'line',
      ray: 'line',
      ball: 'orb',
      sphere: 'orb',
      bolt: 'orb',
    }),
    hits: int(RANGES.hits[0], RANGES.hits[1], 1),
    radius: num(RANGES.radius[0], RANGES.radius[1], 2),
    damage_per_hit: int(RANGES.damage_per_hit[0], RANGES.damage_per_hit[1], 15),
    element: fuzzyEnum(ELEMENTS, 'physical', ELEMENT_ALIASES),
    status_effect: StatusEffect,
    chain_targets: int(RANGES.chain_targets[0], RANGES.chain_targets[1], 0),
    cooldown: num(RANGES.cooldown[0], RANGES.cooldown[1], 5),
    mana_cost: int(RANGES.mana_cost[0], RANGES.mana_cost[1], 0),
    vfx: Vfx,
  }),
);
export type IncantationSpec = z.output<typeof IncantationSpec>;
