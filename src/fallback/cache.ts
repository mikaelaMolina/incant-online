import incantations from './incantations.json' with { type: 'json' };
import forestFloor from './floor-forest.json' with { type: 'json' };
import castleFloor from './floor-castle.json' with { type: 'json' };
import iceFloor from './floor-ice.json' with { type: 'json' };

/**
 * Pre-forged Incantations (already balanced: the Arbiter accepts them unchanged) and pre-built
 * floors, used whenever the API fails, times out or is rate-limited. Together the Incantations
 * cover every type, shape and element. The floors are three different biomes, none of them the
 * starting arena, so a fallback floor always takes the Incanter somewhere new.
 */
export const CACHED_INCANTATIONS: readonly unknown[] = incantations;
export const CACHED_FLOORS: readonly unknown[] = [forestFloor, castleFloor, iceFloor];

function hash(text: string): number {
  return [...text.toLowerCase()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
}

const nameOf = (item: unknown): string =>
  item && typeof item === 'object' && 'name' in item && typeof item.name === 'string' ? item.name.toLowerCase() : '';

/** What the player seemed to ask for (from the mock parser), to pick the closest cached item. */
export interface CacheHint {
  element?: string;
  shape?: string;
  type?: string;
  biome?: string;
}

const field = (item: unknown, key: string): unknown => (item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined);

/** Element matters most ("fire"), then type and shape; for floors, the biome. */
function score(item: unknown, hint: CacheHint): number {
  return (
    (hint.element && field(item, 'element') === hint.element ? 4 : 0) +
    (hint.type && field(item, 'type') === hint.type ? 2 : 0) +
    (hint.shape && field(item, 'shape') === hint.shape ? 1 : 0) +
    (hint.biome && field(item, 'biome') === hint.biome ? 4 : 0)
  );
}

/**
 * The closest cached item to what was asked for, skipping names in `avoid` (an Incantation already
 * in the Grimoire, the floor the Incanter is standing on). Ties go to a deterministic pick from the
 * words, so the same words give the same item. If everything is avoided, avoidance is dropped.
 */
function pick(items: readonly unknown[], text: string, avoid: readonly string[], hint: CacheHint): unknown {
  const skip = new Set(avoid.map((n) => n.toLowerCase()));
  const start = hash(text) % items.length;
  let best: unknown;
  let bestScore = -1;
  for (let i = 0; i < items.length; i++) {
    const item = items[(start + i) % items.length];
    if (skip.has(nameOf(item))) continue;
    const sc = score(item, hint);
    if (sc > bestScore) {
      bestScore = sc;
      best = item;
    }
  }
  return structuredClone(best ?? items[start]);
}

export function cachedIncantation(text: string, avoid: readonly string[] = [], hint: CacheHint = {}): unknown {
  return pick(CACHED_INCANTATIONS, text, avoid, hint);
}

export function cachedFloor(text: string, avoid: readonly string[] = [], hint: CacheHint = {}): unknown {
  return pick(CACHED_FLOORS, text, avoid, hint);
}
