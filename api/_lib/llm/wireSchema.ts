import { ELEMENTS, INCANTATION_SHAPES, INCANTATION_TYPES, PARTICLES, STATUS_KINDS } from '../../../src/schemas/incantationSpec';
import { FLOOR_BIOMES, FLOOR_SIZES, TIMES_OF_DAY } from '../../../src/schemas/floorSpec';
import { ENEMY_ARCHETYPES } from '../../../src/schemas/enemySpec';

/**
 * JSON schema for structured output (output_config.format). Structured outputs do not support
 * numeric ranges or string lengths, so those live in the system prompt and are enforced afterwards
 * by the same lenient zod schemas + Arbiter that mock mode uses.
 */
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: 'null' }] });
const str = { type: 'string' };
const numSchema = { type: 'number' };
const int = { type: 'integer' };
const enumOf = (values: readonly string[]) => ({ type: 'string', enum: [...values] });

const incantation = obj({
  name: str,
  flavor: str,
  type: enumOf(INCANTATION_TYPES),
  shape: enumOf(INCANTATION_SHAPES),
  hits: int,
  radius: numSchema,
  damage_per_hit: int,
  element: enumOf(ELEMENTS),
  status_effect: obj({ kind: enumOf(STATUS_KINDS), dps: numSchema, duration: numSchema }),
  chain_targets: int,
  cooldown: numSchema,
  mana_cost: int,
  vfx: obj({ color: str, trail: { type: 'boolean' }, particles: enumOf(PARTICLES) }),
});

const enemy = obj({
  id: str,
  archetype: enumOf(ENEMY_ARCHETYPES),
  model: str,
  hp: int,
  speed: numSchema,
  damage: int,
  aggro_range: numSchema,
  flee_threshold: numSchema,
  attack_pattern: str,
  phases: { type: 'array', items: obj({ at_hp: numSchema, change: str }) },
});

const floor = obj({
  name: str,
  biome: enumOf(FLOOR_BIOMES),
  lighting: obj({ time_of_day: enumOf(TIMES_OF_DAY), fog_density: numSchema, ambient_color: str }),
  size: enumOf(FLOOR_SIZES),
  props: {
    type: 'array',
    items: obj({ model: str, x: numSchema, z: numSchema, rotation: numSchema, scale: numSchema, tint: nullable(str) }),
  },
  spawns: { type: 'array', items: obj({ enemy, count: int }) },
});

export const INTERPRET_JSON_SCHEMA = obj({
  intent: enumOf(['forge', 'build', 'reply']),
  incantation: nullable(incantation),
  floor: nullable(floor),
  reply: nullable(str),
});
