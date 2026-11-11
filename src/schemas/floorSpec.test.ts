import { describe, expect, it } from 'vitest';
import { FLOOR_HALF_EXTENT, MAX_PROPS, parseFloorSpec } from './floorSpec';
import { AssetManifest } from './manifest';
import startingArena from '../fallback/starting-arena.json';
import manifestJson from '../../public/assets/manifest.json';

function parse(input: unknown) {
  const r = parseFloorSpec(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('FloorSpec', () => {
  it('parses the starting arena unchanged', () => {
    // generated_props is added by the schema (defaults to []); everything else stays the same.
    expect(parse(startingArena)).toEqual({ ...startingArena, generated_props: [] });
  });

  it('fails only for non-objects', () => {
    expect(parseFloorSpec(null).ok).toBe(false);
    expect(parseFloorSpec('a forest').ok).toBe(false);
    expect(parseFloorSpec([1, 2]).ok).toBe(false);
    expect(parseFloorSpec({}).ok).toBe(true);
  });

  it('fills defaults for an empty object', () => {
    const f = parse({});
    expect(f).toMatchObject({
      name: 'Unnamed Floor',
      biome: 'ruins',
      size: 'medium',
      lighting: { time_of_day: 'day', fog_density: 0.3, ambient_color: '#8090b0' },
      props: [],
      spawns: [],
    });
  });

  it('maps unknown enums to the nearest valid value', () => {
    const f = parse({ biome: 'Snowy Glacier', size: 'huge', lighting: { time_of_day: 'sunset' } });
    expect(f.biome).toBe('ice');
    expect(f.size).toBe('large');
    expect(f.lighting.time_of_day).toBe('dusk');
    expect(parse({ biome: 'spaceship interior' }).biome).toBe('void'); // alias prefix: space → void
    expect(parse({ biome: 'banana' }).biome).toBe('ruins'); // no match → default
  });

  it('clamps numbers, normalises colours and angles', () => {
    const f = parse({
      size: 'small',
      lighting: { fog_density: 7, ambient_color: 'F80' },
      props: [{ model: 'nature.tree_oak', x: 500, z: '-3', rotation: -90, scale: 99, tint: 'not a colour' }],
    });
    expect(f.lighting.fog_density).toBe(1);
    expect(f.lighting.ambient_color).toBe('#ff8800');
    const p = f.props[0]!;
    expect(p.x).toBe(FLOOR_HALF_EXTENT.small - 1);
    expect(p.z).toBe(-3);
    expect(p.rotation).toBe(270);
    expect(p.scale).toBe(4);
    expect(p.tint).toBeUndefined();
  });

  it('drops props without a model and caps the list', () => {
    const many = Array.from({ length: MAX_PROPS + 50 }, (_, i) => ({ model: 'nature.rock_smalla', x: i % 10, z: 0 }));
    const f = parse({ props: [{ x: 1 }, 'tree', null, ...many] });
    expect(f.props).toHaveLength(MAX_PROPS);
    expect(f.props.every((p) => p.model === 'nature.rock_smalla')).toBe(true);
  });

  it('clamps spawn counts and enemy stats', () => {
    const f = parse({ spawns: [{ enemy: { archetype: 'archer', hp: -5, flee_threshold: 3 }, count: 50 }] });
    const s = f.spawns[0]!;
    expect(s.count).toBe(8);
    expect(s.enemy.archetype).toBe('ranged');
    expect(s.enemy.hp).toBe(1);
    expect(s.enemy.flee_threshold).toBe(1);
  });
});

describe('asset manifest', () => {
  const manifest = AssetManifest.parse(manifestJson);
  const byId = new Map(manifest.models.map((m) => [m.id, m]));

  it('only lists CC0 or permissive models', () => {
    for (const m of manifest.models) expect(['CC0-1.0', 'MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'Zlib']).toContain(m.licence);
  });

  it('contains every model the starting arena uses, with the right type', () => {
    const floor = parse(startingArena);
    for (const p of floor.props) expect(byId.get(p.model)?.type, p.model).toBe('prop');
    for (const s of floor.spawns) expect(byId.get(s.enemy.model)?.type, s.enemy.model).toBe('enemy');
  });
});
