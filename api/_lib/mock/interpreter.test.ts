import { describe, expect, it } from 'vitest';
import { mockInterpret } from './interpreter';
import { PALETTES, SETTLEMENT_PALETTE } from './floor';
import { parseInterpretResponse, type InterpretResponse } from '../../../src/schemas/interpret';
import { parseFloorSpec } from '../../../src/schemas/floorSpec';
import { IncantationSpec } from '../../../src/schemas/incantationSpec';
import { judge } from '../../../src/arbiter/arbiter';
import { CACHED_FLOORS, CACHED_INCANTATIONS } from '../../../src/fallback/cache';
import { AssetManifest } from '../../../src/schemas/manifest';
import manifestJson from '../../../public/assets/manifest.json';

/** The real path: mock output → zod InterpretResponse → (forge) Arbiter. */
function run(text: string, context?: Parameters<typeof mockInterpret>[1]): InterpretResponse {
  const r = parseInterpretResponse(mockInterpret(text, context));
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('mock interpreter: forge', () => {
  it('fire + spin + three hits', () => {
    const r = run('a spinning fire attack that hits three times');
    expect(r.intent).toBe('forge');
    expect(r.incantation).toMatchObject({ element: 'fire', shape: 'spin', hits: 3, type: 'melee_combo' });
    expect(r.incantation?.status_effect.kind).toBe('burn');
    expect(r.incantation?.name).toBe('Blazing Cyclone');
    expect(r.incantation?.flavor).toBe('Three spinning cuts wreathed in fire.');
  });

  it.each([
    ['ice beam', { element: 'ice', shape: 'line', type: 'beam' }],
    ['lightning slash', { element: 'lightning', shape: 'slash' }],
    ['triple wind slash', { element: 'wind', shape: 'slash', hits: 3 }],
    ['five frost bolts', { element: 'ice', shape: 'orb', hits: 5, type: 'projectile' }],
    ['a chain of thunder that bounces to four enemies', { element: 'lightning', type: 'chain', chain_targets: 4 }],
    ['a holy shield', { element: 'light', type: 'buff' }],
    ['a shadow dash', { element: 'shadow', type: 'dash' }],
    ['huge fire nova', { element: 'fire', shape: 'circle', type: 'area' }],
  ] as const)('%s', (text, expected) => {
    const r = run(text);
    expect(r.intent).toBe('forge');
    expect(r.incantation).toMatchObject(expected);
  });

  it('uses an explicit name', () => {
    expect(run('an ice lance called Pale Fang').incantation?.name).toBe('Pale Fang');
  });

  it('caps hits through validation ("ten hits" → 5)', () => {
    expect(run('a lightning slash that hits ten times').incantation?.hits).toBe(5);
  });

  it('every forged Incantation passes the Arbiter', () => {
    for (const t of ['devastating fire beam that hits five times', 'quick ice orb', 'massive shadow nova', 'a sword', 'storm combo']) {
      const r = run(t);
      expect(r.intent).toBe('forge');
      const j = judge(r.incantation);
      expect(j.accepted).toBe(true);
      expect(j.incantation.cooldown).toBeLessThanOrEqual(60);
      expect(j.sentence).toMatch(/^The Spire/);
    }
  });
});

describe('mock interpreter: build', () => {
  it.each([
    ['build a forest', 'forest'],
    ['take me to a castle', 'castle'],
    ['a desert at sunset', 'desert'],
    ['a dark cave', 'cavern'],
    ['a frozen land', 'ice'],
    ['ancient ruins', 'ruins'],
    ['the abyss', 'void'],
  ] as const)('%s → %s', (text, biome) => {
    const r = run(text);
    expect(r.intent).toBe('build');
    expect(r.floor?.biome).toBe(biome);
    expect(r.floor?.props.length).toBeGreaterThan(10);
  });

  it('reads time, fog, size and enemies', () => {
    const r = run('a huge misty forest at night with five archers');
    expect(r.floor).toMatchObject({ size: 'large', lighting: { time_of_day: 'night' } });
    expect(r.floor?.lighting.fog_density).toBeGreaterThan(0.5);
    expect(r.floor?.spawns.find((s) => s.enemy.archetype === 'ranged')?.count).toBe(5);
  });

  it('peaceful floors have no spawns', () => {
    expect(run('a peaceful forest').floor?.spawns).toEqual([]);
  });

  it('"ice" alone is an element, "ice" + place is a biome', () => {
    expect(run('an ice orb').intent).toBe('forge');
    expect(run('an ice world').floor?.biome).toBe('ice');
  });
});

describe('mock interpreter: refine', () => {
  const base = IncantationSpec.parse(mockInterpret('a spinning fire attack that hits three times').incantation);
  it('make it ice', () => {
    const r = run('make it ice', { incantation: base });
    expect(r.incantation).toMatchObject({ element: 'ice', shape: 'spin', hits: 3 });
    expect(r.incantation?.name).toBe('Frozen Cyclone');
  });
  it('add a stun / remove the burn / more hits', () => {
    expect(run('add a stun', { incantation: base }).incantation?.status_effect.kind).toBe('stun');
    expect(run('remove the burn', { incantation: base }).incantation?.status_effect.kind).toBe('none');
    expect(run('more hits', { incantation: base }).incantation?.hits).toBe(4);
  });
  it('make it night (floor)', () => {
    const floor = mockInterpret('a forest at dawn').floor;
    const r = run('make it night', { floor });
    expect(r.intent).toBe('build');
    expect(r.floor?.lighting.time_of_day).toBe('night');
    expect(r.floor?.biome).toBe('forest');
  });
  it('refine without context falls through to a fresh parse', () => {
    expect(run('make it ice').intent).toBe('forge');
  });
});

describe('mock interpreter: everything else', () => {
  it.each(['hello', 'what is this place?', 'banana pancakes', 'asdf qwerty', '', '🙂'])('"%s" → in-character reply', (t) => {
    const r = run(t);
    expect(r.intent).toBe('reply');
    expect(r.reply).toMatch(/Spire|Incanter/);
  });

  it('a create request with no keywords returns a cached item', () => {
    const r = run('make me something cool');
    expect(r.intent).toBe('forge');
    expect(CACHED_INCANTATIONS.map((i) => (i as { name: string }).name)).toContain(r.incantation?.name);
    expect(run('create a new place').intent).toBe('build');
  });
});

describe('fallback data', () => {
  const manifest = AssetManifest.parse(manifestJson);
  const props = new Set(manifest.models.filter((m) => m.type === 'prop').map((m) => m.id));
  const enemies = new Set(manifest.models.filter((m) => m.type === 'enemy').map((m) => m.id));

  it('every mock palette prop exists in the manifest', () => {
    for (const rules of [...Object.values(PALETTES), SETTLEMENT_PALETTE]) for (const r of rules) expect(props.has(r.model), r.model).toBe(true);
  });

  it('10 cached Incantations, all valid and accepted by the Arbiter', () => {
    expect(CACHED_INCANTATIONS).toHaveLength(10);
    for (const raw of CACHED_INCANTATIONS) {
      const p = IncantationSpec.parse(raw);
      expect(p).toEqual(IncantationSpec.parse(p)); // already normalised
      expect(judge(raw).accepted).toBe(true);
    }
  });

  it('3 cached floors, all valid, using manifest models', () => {
    expect(CACHED_FLOORS).toHaveLength(3);
    for (const raw of CACHED_FLOORS) {
      const r = parseFloorSpec(raw);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      for (const p of r.value.props) expect(props.has(p.model), p.model).toBe(true);
      for (const s of r.value.spawns) expect(enemies.has(s.enemy.model), s.enemy.model).toBe(true);
    }
  });
});

/** The prompts in scripts/judge-test.ts: what a judge might type. Mock mode must handle all of them well. */
describe('mock interpreter: judge prompts', () => {
  it('build a desert temple → a desert floor', () => {
    const r = run('build a desert temple');
    expect(r.intent).toBe('build');
    expect(r.floor?.biome).toBe('desert');
  });

  it('put a dragon on a castle → a castle floor with a dragon boss', () => {
    const r = run('put a dragon on a castle');
    expect(r.floor?.biome).toBe('castle');
    const boss = r.floor?.spawns.find((s) => s.enemy.archetype === 'boss');
    expect(boss?.enemy.id).toMatch(/dragon/);
  });

  it('a cozy village at night → a small, warm, night-time settlement floor', () => {
    const r = run('a cozy village at night');
    expect(r.intent).toBe('build');
    expect(r.floor?.lighting.time_of_day).toBe('night');
    expect(r.floor?.props.some((p) => p.model.includes('tent'))).toBe(true);
  });

  it('make me a sword that freezes time → a freezing blade, with the Spire noting time will not bend', () => {
    const r = run('make me a sword that freezes time');
    expect(r.incantation?.shape).toBe('slash');
    expect(r.incantation?.status_effect.kind).toBe('freeze');
    expect(r.reply).toMatch(/time/i);
  });

  it('heal me → a light healing ward', () => {
    const r = run('heal me');
    expect(r.incantation?.type).toBe('buff');
    expect(r.incantation?.status_effect.kind).toBe('heal');
    expect(r.incantation?.element).toBe('light');
  });

  it('kill everything instantly → the strongest blast the Arbiter allows, never an instant kill', () => {
    const r = run('kill everything instantly');
    expect(r.intent).toBe('forge');
    const j = judge(r.incantation);
    expect(j.incantation.damage_per_hit * j.incantation.hits).toBeLessThanOrEqual(200);
    expect(j.incantation.cooldown).toBeGreaterThanOrEqual(13);
    expect(r.reply).toMatch(/instant/i);
  });

  it('a spell that turns enemies into frogs → the nearest allowed effect (stun), explained', () => {
    const r = run('a spell that turns enemies into frogs');
    expect(r.incantation?.status_effect.kind).toBe('stun');
    expect(r.reply).toMatch(/flesh|stun/i);
  });

  it('hello / what is this game / asdf → in-character replies; the game question is answered', () => {
    expect(run('hello').intent).toBe('reply');
    expect(run('what is this game').reply).toMatch(/Incantation/);
    expect(run('what is this game').reply).toMatch(/floor/);
    expect(run('asdf').intent).toBe('reply');
  });

  it('no false alarms: elements, "godly" and ordinary kills stay ordinary', () => {
    expect(run('a spell that turns enemies into ice').incantation?.name).not.toMatch(/Hex/);
    expect(run('a godly fire slash').incantation?.type).not.toBe('buff');
    expect(run('a fire slash that kills').reply).toBeUndefined();
    expect(run('a stone fist').incantation?.status_effect.kind).not.toBe('freeze');
  });
});
