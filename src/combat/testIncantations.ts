import { judge, type Judgement } from '../arbiter/arbiter';

/**
 * Three hard-coded Incantations on number keys 1–3, for checking the runner and VFX by hand.
 * Together they cover melee / chain / projectile, burn / stun / freeze, chain_targets and trails.
 * They go through the Arbiter like any forged Incantation, so mana and cooldowns are real.
 */
const RAW = [
  {
    name: 'Blazing Cyclone',
    flavor: 'Three spinning cuts wreathed in fire.',
    type: 'melee_combo',
    shape: 'spin',
    hits: 3,
    radius: 3.5,
    damage_per_hit: 18,
    element: 'fire',
    status_effect: { kind: 'burn', dps: 4, duration: 3 },
    chain_targets: 0,
    cooldown: 8,
    vfx: { color: '#ff6a1a', trail: true, particles: 'embers' },
  },
  {
    name: 'Thunder Chain',
    flavor: 'Lightning that leaps from foe to foe.',
    type: 'chain',
    shape: 'orb',
    hits: 2,
    radius: 1,
    damage_per_hit: 16,
    element: 'lightning',
    status_effect: { kind: 'stun', dps: 0, duration: 0.8 },
    chain_targets: 3,
    cooldown: 7,
    vfx: { color: '#f4f06a', trail: false, particles: 'sparks' },
  },
  {
    name: 'Frost Comet',
    flavor: 'Three shards of winter that burst and lock foes in ice.',
    type: 'projectile',
    shape: 'orb',
    hits: 3,
    radius: 3,
    damage_per_hit: 14,
    element: 'ice',
    status_effect: { kind: 'freeze', dps: 0, duration: 1.5 },
    chain_targets: 0,
    cooldown: 6,
    vfx: { color: '#8fdcff', trail: true, particles: 'frost' },
  },
] as const;

export const TEST_INCANTATIONS: readonly Judgement[] = RAW.map((r) => judge(r));

/** Key codes for the test slots (physical keys, any layout). */
export const TEST_KEYS = ['Digit1', 'Digit2', 'Digit3'] as const;
