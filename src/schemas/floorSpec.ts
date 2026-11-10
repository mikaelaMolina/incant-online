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
export const MAX_SPAWN_GROUPS = 6;
export const MAX_SPAWN_COUNT = 8;

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
    spawns: lenientArray(SpawnGroup, MAX_SPAWN_GROUPS),
  })
  .transform((floor) => {
    // Keep every prop inside the floor (1 m margin).
    const limit = FLOOR_HALF_EXTENT[floor.size] - 1;
    for (const p of floor.props) {
      p.x = clamp(p.x, -limit, limit);
      p.z = clamp(p.z, -limit, limit);
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
