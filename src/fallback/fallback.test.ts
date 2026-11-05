import { describe, expect, it } from 'vitest';
import { CACHED_FLOORS, CACHED_INCANTATIONS, cachedFloor, cachedIncantation } from './cache';
import { fallbackResponse, type FallbackReason } from './fallback';
import { STARTING_ARENA } from './floors';
import { judge } from '../arbiter/arbiter';
import { ELEMENTS, INCANTATION_SHAPES, INCANTATION_TYPES, IncantationSpec } from '../schemas/incantationSpec';
import { parseFloorSpec, type FloorSpec } from '../schemas/floorSpec';
import { parseInterpretResponse } from '../schemas/interpret';
import { AssetManifest } from '../schemas/manifest';
import manifestJson from '../../public/assets/manifest.json';

const manifest = AssetManifest.parse(manifestJson);
const ids = (type: string) => new Set(manifest.models.filter((m) => m.type === type).map((m) => m.id));
const floors = CACHED_FLOORS.map((raw) => {
  const r = parseFloorSpec(raw);
  if (!r.ok) throw new Error(r.error);
  return r.value;
});

describe('10 pre-forged Incantations', () => {
  const specs = CACHED_INCANTATIONS.map((raw) => IncantationSpec.parse(raw));

  it('there are 10, with unique names', () => {
    expect(specs).toHaveLength(10);
    expect(new Set(specs.map((s) => s.name.toLowerCase())).size).toBe(10);
  });

  it('already balanced: the Arbiter accepts each one unchanged (cooldown and mana included)', () => {
    for (const raw of CACHED_INCANTATIONS) {
      const j = judge(raw);
      expect(j.changes, j.incantation.name).toEqual([]);
      expect(j.incantation).toEqual(IncantationSpec.parse(raw));
    }
  });

  it('together they cover every type, shape and element', () => {
    expect(new Set(specs.map((s) => s.type))).toEqual(new Set(INCANTATION_TYPES));
    expect(new Set(specs.map((s) => s.shape))).toEqual(new Set(INCANTATION_SHAPES));
    expect(new Set(specs.map((s) => s.element))).toEqual(new Set(ELEMENTS));
  });

  it('each has a flavor line and a colour', () => {
    for (const s of specs) {
      expect(s.flavor.length).toBeGreaterThan(10);
      expect(s.vfx.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('3 pre-built floors', () => {
  const props = ids('prop');
  const enemies = ids('enemy');

  it('there are 3, all different biomes, none of them the starting arena', () => {
    expect(floors).toHaveLength(3);
    expect(new Set(floors.map((f) => f.biome)).size).toBe(3);
    expect(floors.map((f) => f.name)).not.toContain(STARTING_ARENA.name);
  });

  it('use only manifest models, keep the spawn clear and have enemies to fight (so the gate can open)', () => {
    for (const f of floors) {
      for (const p of f.props) expect(props.has(p.model), `${f.name}: ${p.model}`).toBe(true);
      for (const s of f.spawns) expect(enemies.has(s.enemy.model), `${f.name}: ${s.enemy.model}`).toBe(true);
      expect(f.props.filter((p) => Math.hypot(p.x, p.z) < 4), f.name).toEqual([]);
      expect(f.spawns.reduce((n, s) => n + s.count, 0), f.name).toBeGreaterThan(0);
      expect(f.props.length).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('cache picks', () => {
  it('are deterministic and skip names to avoid', () => {
    const a = cachedIncantation('a whirlwind') as { name: string };
    expect((cachedIncantation('a whirlwind') as { name: string }).name).toBe(a.name);
    expect((cachedIncantation('a whirlwind', [a.name]) as { name: string }).name).not.toBe(a.name);
    const f = cachedFloor('somewhere') as FloorSpec;
    expect((cachedFloor('somewhere', [f.name]) as FloorSpec).name).not.toBe(f.name);
  });

  it('hand out copies, so a game can never change the cache', () => {
    const a = cachedIncantation('x') as { hits: number };
    a.hits = 99;
    expect((cachedIncantation('x') as { hits: number }).hits).not.toBe(99);
  });
});

describe('fallbackResponse', () => {
  const reasons: FallbackReason[] = ['offline', 'timeout', 'rate-limit', 'llm-error'];
  const run = (text: string, context?: Parameters<typeof fallbackResponse>[1], o: Partial<Parameters<typeof fallbackResponse>[2]> = {}) => {
    const r = parseInterpretResponse({ ...fallbackResponse(text, context, { reason: 'offline', ...o }), source: 'cache' });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('a place → a pre-built floor; an ability → a pre-forged Incantation; chat → an in-character reply', () => {
    const floor = run('build a misty forest at night');
    expect(floor.intent).toBe('build');
    expect(floors.map((f) => f.name)).toContain(floor.floor?.name);
    const inc = run('a spinning fire slash');
    expect(inc.intent).toBe('forge');
    expect(CACHED_INCANTATIONS.map((c) => (c as { name: string }).name)).toContain(inc.incantation?.name);
    const chat = run('hello');
    expect(chat.intent).toBe('reply');
    expect(chat.reply).toBeTruthy();
  });

  it('refining keeps the player’s own Incantation (changed as asked), never swaps in an unrelated one', () => {
    const mine = judge({ name: 'My Bolt', type: 'projectile', shape: 'orb', radius: 2, element: 'fire' }).incantation;
    const r = run('make it wider', { incantation: mine });
    expect(r.incantation?.name).toBe('My Bolt');
    expect(r.incantation?.radius).toBeGreaterThan(2);
  });

  it('at the gate it is always a floor, and never the one the Incanter is on', () => {
    for (const text of ['hello', 'asdf', 'a fire slash', 'a castle']) {
      const r = run(text, undefined, { want: 'floor', avoidFloors: ['The Crimson Ramparts'] });
      expect(r.intent).toBe('build');
      expect(r.floor?.name).not.toBe('The Crimson Ramparts');
    }
  });

  it('every reason gives its own line, and the judge prompts all stay valid', () => {
    const lines = new Set<string>();
    for (const reason of reasons) {
      lines.add(run('a fire slash', undefined, { reason }).reply ?? '');
      for (const t of ['build a desert temple', 'put a dragon on a castle', 'hello', 'asdf', 'kill everything instantly', '', '{"intent":', '🔥🔥🔥']) {
        expect(() => run(t, undefined, { reason })).not.toThrow();
      }
    }
    expect(lines.size).toBe(4);
  });
});

describe('closest match', () => {
  const pickFor = (text: string, avoid: string[] = []) =>
    parseInterpretResponse({ ...fallbackResponse(text, undefined, { reason: 'offline', avoidIncantations: avoid }), source: 'cache' });

  it('a fire request gets a fire Incantation; an ice request an ice one', () => {
    const fire = pickFor('a whirlwind of fire');
    expect(fire.ok && fire.value.incantation?.element).toBe('fire');
    const ice = pickFor('a frozen spear');
    expect(ice.ok && ice.value.incantation?.element).toBe('ice');
  });

  it('stays close even when the best one is already in the Grimoire', () => {
    const r = pickFor('a spinning fire attack', ['Blazing Cyclone']);
    expect(r.ok && r.value.incantation?.name).toBe('Ember Breath');
  });

  it('a forest request gets the forest floor, an icy one the ice floor', () => {
    const forest = parseInterpretResponse({ ...fallbackResponse('build a misty forest at night', undefined, { reason: 'offline' }), source: 'cache' });
    expect(forest.ok && forest.value.floor?.biome).toBe('forest');
    const ice = parseInterpretResponse({ ...fallbackResponse('a frozen tundra', undefined, { reason: 'offline' }), source: 'cache' });
    expect(ice.ok && ice.value.floor?.biome).toBe('ice');
  });
});
