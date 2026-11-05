import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockInterpret } from '../../api/_lib/mock/interpreter';
import { parseInterpretResponse } from '../schemas/interpret';
import { CommandRouter, type RouterDeps } from './commandRouter';
import { Grimoire, GRIMOIRE_BAR_SIZE } from '../combat/grimoire';
import { TEST_INCANTATIONS } from '../combat/testIncantations';
import { STARTING_ARENA } from '../fallback/floors';
import type { IncantationSpec } from '../schemas/incantationSpec';
import type { FloorSpec } from '../schemas/floorSpec';

// The backend, in mock mode, without HTTP: same parser, same validation as /api/interpret.
let pending: Promise<void> | undefined;
let release: (() => void) | undefined;
vi.mock('./interpretClient', () => ({
  requestInterpretation: vi.fn(async (text: string, context?: { incantation?: unknown; floor?: unknown }) => {
    if (pending) await pending;
    const r = parseInterpretResponse({ ...mockInterpret(text, context ?? {}), mode: 'mock', source: 'mock' });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }),
}));

function setup() {
  const grimoire = new Grimoire();
  for (const j of TEST_INCANTATIONS) grimoire.add(j);
  const casts: IncantationSpec[] = [];
  const said: string[] = [];
  let floor: FloorSpec = STARTING_ARENA;
  let grimoireOpen = false;
  const deps: RouterDeps = {
    grimoire,
    currentFloor: () => floor,
    loadFloor: async (f) => {
      floor = f;
    },
    cast: (spec) => {
      casts.push(spec);
      return { ok: true };
    },
    say: (t) => said.push(t),
    thinking: () => {},
    showGrimoire: (open) => {
      grimoireOpen = open;
    },
  };
  const router = new CommandRouter(deps);
  grimoire.onChange = () => router.syncNames();
  return { router, grimoire, casts, said, floor: () => floor, open: () => grimoireOpen };
}
const say = (text: string) => ({ text, source: 'voice' as const });

beforeEach(() => {
  pending = undefined;
  release = undefined;
});

describe('recite', () => {
  it('casts by name synchronously, with no network call, well under 500 ms', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { router, casts } = setup();
    const t0 = performance.now();
    void router.handle(say('Frost Comet'));
    const ms = performance.now() - t0;
    expect(casts.map((c) => c.name)).toEqual(['Frost Comet']); // already cast before any await
    expect(ms).toBeLessThan(500);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('tolerates recognition slips and filler', () => {
    const { router, casts } = setup();
    void router.handle(say('cast blazing cycle on'));
    void router.handle(say('thunder chains'));
    expect(casts.map((c) => c.name)).toEqual(['Blazing Cyclone', 'Thunder Chain']);
  });

  it('an interim transcript casts early and the matching final does not cast twice', () => {
    const { router, casts } = setup();
    router.handleInterim('frost');
    expect(casts).toHaveLength(0); // not enough of the name yet
    router.handleInterim('frost comet');
    router.handleInterim('frost comet');
    void router.handle(say('Frost Comet'));
    expect(casts.map((c) => c.name)).toEqual(['Frost Comet']);
  });

  it('works while a forge is still waiting on the network', async () => {
    const { router, casts } = setup();
    pending = new Promise((r) => (release = r));
    const forging = router.handle(say('a spinning wind slash'));
    void router.handle(say('Thunder Chain'));
    expect(casts.map((c) => c.name)).toEqual(['Thunder Chain']);
    release?.();
    await forging;
  });
});

describe('forge → Arbiter → Grimoire bar', () => {
  it('a new Incantation is judged and takes the next free slot', async () => {
    const { router, grimoire, said } = setup();
    await router.handle(say('a lightning beam that hits four times'));
    const j = grimoire.bar[3];
    expect(j?.incantation.type).toBe('beam');
    expect(j?.incantation.mana_cost).toBeGreaterThan(0); // set by the Arbiter
    expect(said.at(-1)).toMatch(/^Forged .+ \[4\]/);
  });

  it('the bar holds 6; the least recently used slot makes room; all stay recitable', async () => {
    const { router, grimoire, casts } = setup();
    const asks = ['a fire beam', 'an ice nova', 'a shadow dash', 'a wind cone breath'];
    for (const a of asks) await router.handle(say(a));
    expect(grimoire.all).toHaveLength(7);
    expect(grimoire.bar.filter(Boolean)).toHaveLength(GRIMOIRE_BAR_SIZE);
    // Blazing Cyclone was the least recently used, so the 7th took slot 1.
    expect(grimoire.bar.map((j) => j?.incantation.name)).not.toContain('Blazing Cyclone');
    void router.handle(say('Blazing Cyclone'));
    expect(casts.at(-1)?.name).toBe('Blazing Cyclone');
  });
});

describe('refine', () => {
  it('"make it wider" widens the last Incantation in its own slot', async () => {
    const { router, grimoire } = setup();
    void router.handle(say('Blazing Cyclone')); // the one "it" refers to
    const before = grimoire.find('Blazing Cyclone')!.incantation;
    await router.handle(say('make it wider'));
    const after = grimoire.bar[0]!.incantation;
    expect(after.name).toBe('Blazing Cyclone');
    expect(after.radius).toBeGreaterThan(before.radius);
    expect(grimoire.all).toHaveLength(3);
  });

  it('"add a stun" adds the effect and the Arbiter re-prices it', async () => {
    const { router, grimoire } = setup();
    void router.handle(say('Frost Comet'));
    await router.handle(say('add a stun'));
    const j = grimoire.find('Frost Comet')!;
    expect(j.incantation.status_effect.kind).toBe('stun');
    expect(grimoire.bar[2]).toBe(j);
  });

  it('a renaming refine ("make it ice") keeps the slot and the old name is gone', async () => {
    const { router, grimoire, said } = setup();
    void router.handle(say('Blazing Cyclone'));
    await router.handle(say('make it ice'));
    expect(grimoire.bar[0]?.incantation.element).toBe('ice');
    expect(grimoire.find('Blazing Cyclone')).toBeUndefined();
    expect(said.at(-1)).toMatch(/^Reshaped Blazing Cyclone into /);
  });

  it('refines the floor when the words are about the place', async () => {
    const { router, floor } = setup();
    await router.handle(say('make it night'));
    expect(floor().lighting.time_of_day).toBe('night');
  });
});

describe('system commands', () => {
  it('open / close Grimoire', async () => {
    const { router, open } = setup();
    await router.handle(say('open the Grimoire'));
    expect(open()).toBe(true);
    await router.handle(say('close grimoire'));
    expect(open()).toBe(false);
  });

  it('next floor loads a different cached floor', async () => {
    const { router, floor } = setup();
    const first = floor().name;
    await router.handle(say('next floor'));
    expect(floor().name).not.toBe(first);
  });
});

describe('off-topic', () => {
  it('ends in an in-character reply, never an error', async () => {
    const { router, said, grimoire } = setup();
    await router.handle(say('what is the capital of France?'));
    expect(said.at(-1)?.length).toBeGreaterThan(0);
    expect(grimoire.all).toHaveLength(3);
  });
});
