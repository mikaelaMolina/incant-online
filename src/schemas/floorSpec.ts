import { z } from 'zod';
import { EnemySpec } from './enemySpec.js';
import {
  clamp,
  degrees,
  fuzzyEnum,
  hexColor,
  int,
  lenientArray,
  num,
  objectOrEmpty,
  optionalHexColor,
  text,
} from './lenient.js';

export const FLOOR_BIOMES = ['forest', 'ruins', 'ice', 'desert', 'cavern', 'castle', 'void'] as const;
export type Biome = (typeof FLOOR_BIOMES)[number];

export const TIMES_OF_DAY = ['dawn', 'day', 'dusk', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const FLOOR_SIZES = ['small', 'medium', 'large'] as const;
export type FloorSize = (typeof FLOOR_SIZES)[number];

/** Half the side length of the square floor, in metres. */
export const FLOOR_HALF_EXTENT: Record<FloorSize, number> = { small: 15, medium: 22, large: 30 };

export const MAX_PROPS = 200;
export const MAX_GENERATED_PROPS = 80;
export const MAX_SPAWN_GROUPS = 6;
export const MAX_SPAWN_COUNT = 8;

/** Primitive shapes the LLM can generate procedurally (no model file needed). */
export const GENERATED_SHAPES = ['box', 'cylinder', 'plane', 'sphere', 'arch', 'ramp'] as const;
export type GeneratedShape = (typeof GENERATED_SHAPES)[number];

/** Material style for generated props. */
export const GENERATED_MATERIALS = ['solid', 'metal', 'glass', 'emissive', 'rough'] as const;
export type GeneratedMaterial = (typeof GENERATED_MATERIALS)[number];

/**
 * A procedurally-generated prop: a primitive solid the LLM describes and Three.js builds at
 * runtime. Used when the theme needs geometry that no manifest model covers (subway pillars,
 * neon signs, sci-fi panels, train cars, etc.).
 */
export const GeneratedProp = z.preprocess(
  objectOrEmpty,
  z.object({
    shape: fuzzyEnum(GENERATED_SHAPES, 'box', {
      cube: 'box', block: 'box', wall: 'box', pillar: 'cylinder', column: 'cylinder',
      tube: 'cylinder', circle: 'cylinder', flat: 'plane', ground: 'plane', floor: 'plane',
      ball: 'sphere', dome: 'sphere', slope: 'ramp',
    }),
    /** Width (x), Height (y), Depth (z) in metres. For cylinders: width = radius, height = height. */
    width: num(0.05, 40, 1),
    height: num(0.05, 40, 1),
    depth: num(0.05, 40, 1),
    /** Centre position. */
    x: num(-1000, 1000, 0),
    y: num(-2, 40, 0),
    z: num(-1000, 1000, 0),
    rotation_y: degrees(0),
    color: hexColor('#888888'),
    material: fuzzyEnum(GENERATED_MATERIALS, 'solid', {
      metallic: 'metal', shiny: 'metal', reflective: 'metal', glossy: 'metal',
      transparent: 'glass', window: 'glass',
      glow: 'emissive', neon: 'emissive', light: 'emissive', lit: 'emissive',
      concrete: 'rough', stone: 'rough', dirt: 'rough',
    }),
    /** Emissive intensity (only for material "emissive"). 0.5–8. */
    emissive_intensity: num(0.5, 8, 2),
    /** Whether the prop has a solid physics collider. */
    collidable: z.unknown().optional().transform((v) => v !== false && v !== 'false' && v !== 0),
    /** Short label shown in dev overlay. */
    label: text(32, ''),
  }),
);
export type GeneratedProp = z.output<typeof GeneratedProp>;

const BIOME_ALIASES: Record<string, Biome> = {
  woods: 'forest',
  woodland: 'forest',
  jungle: 'forest',
  grove: 'forest',
  meadow: 'forest',
  temple: 'ruins',
  ancient: 'ruins',
  graveyard: 'ruins',
  snow: 'ice',
  frozen: 'ice',
  glacier: 'ice',
  tundra: 'ice',
  sand: 'desert',
  dunes: 'desert',
  oasis: 'desert',
  wasteland: 'desert',
  cave: 'cavern',
  dungeon: 'cavern',
  underground: 'cavern',
  mine: 'cavern',
  lava: 'cavern',
  volcano: 'cavern',
  fortress: 'castle',
  keep: 'castle',
  citadel: 'castle',
  palace: 'castle',
  space: 'void',
  abyss: 'void',
  astral: 'void',
  dream: 'void',
};

const TIME_ALIASES: Record<string, TimeOfDay> = {
  morning: 'dawn',
  sunrise: 'dawn',
  noon: 'day',
  midday: 'day',
  afternoon: 'day',
  daytime: 'day',
  evening: 'dusk',
  sunset: 'dusk',
  twilight: 'dusk',
  midnight: 'night',
  nighttime: 'night',
};

export const FloorLighting = z.preprocess(
  objectOrEmpty,
  z.object({
    time_of_day: fuzzyEnum(TIMES_OF_DAY, 'day', TIME_ALIASES),
    /** 0 = clear, 1 = very thick. Mapped to exponential fog by the loader. */
    fog_density: num(0, 1, 0.3),
    ambient_color: hexColor('#8090b0'),
  }),
);
export type FloorLighting = z.output<typeof FloorLighting>;

/** A prop: manifest `model` id at (x, z) metres, `rotation` in degrees around Y, `scale` × the model's base size. */
export const PropPlacement = z.preprocess(
  objectOrEmpty,
  z
    .object({
      model: text(64, ''),
      x: num(-1000, 1000, 0),
      z: num(-1000, 1000, 0),
      rotation: degrees(0),
      scale: num(0.25, 4, 1),
      tint: optionalHexColor(),
    })
    .refine((p) => p.model !== '', 'prop needs a model id'),
);
export type PropPlacement = z.output<typeof PropPlacement>;

export const SpawnGroup = z.preprocess(
  objectOrEmpty,
  z.object({
    enemy: EnemySpec,
    count: int(1, MAX_SPAWN_COUNT, 1),
  }),
);
export type SpawnGroup = z.output<typeof SpawnGroup>;

const FloorSpecObject = z
  .object({
    name: text(48, 'Unnamed Floor'),
    biome: fuzzyEnum(FLOOR_BIOMES, 'ruins', BIOME_ALIASES),
    lighting: FloorLighting,
    size: fuzzyEnum(FLOOR_SIZES, 'medium', { tiny: 'small', big: 'large', huge: 'large', normal: 'medium' }),
    props: lenientArray(PropPlacement, MAX_PROPS),
    /** Procedurally-generated primitive geometry — used for themes without matching manifest models. */
    generated_props: lenientArray(GeneratedProp, MAX_GENERATED_PROPS),
    spawns: lenientArray(SpawnGroup, MAX_SPAWN_GROUPS),
  })
  .transform((floor) => {
    // Keep every prop inside the floor (1 m margin).
    const limit = FLOOR_HALF_EXTENT[floor.size] - 1;
    for (const p of floor.props) {
      p.x = clamp(p.x, -limit, limit);
      p.z = clamp(p.z, -limit, limit);
    }
    for (const g of floor.generated_props) {
      g.x = clamp(g.x, -limit, limit);
      g.z = clamp(g.z, -limit, limit);
    }
    if (floor.spawns.length === 0 && !/quiet hollow|village|sanctuary/i.test(floor.name)) {
      floor.spawns.push(
        SpawnGroup.parse({
          count: 3,
          enemy: {
            id: "spire_guardian",
            archetype: "melee",
            model: "monster.skeleton",
            hp: 65,
            speed: 3,
            damage: 10,
            aggro_range: 15,
            flee_threshold: 0.15,
            attack_pattern: "swift slash",
            phases: [],
          },
        }),
      );
    }
    return floor;
  });

/**
 * FloorSpec. Fails only if the input is not an object at all;
 * every field inside is clamped / mapped / defaulted.
 */
export const FloorSpec = z.preprocess(
  (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined),
  FloorSpecObject,
);
export type FloorSpec = z.output<typeof FloorSpec>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseFloorSpec(input: unknown): ParseResult<FloorSpec> {
  const r = FloorSpec.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: z.prettifyError(r.error) };
}
