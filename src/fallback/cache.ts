import incantations from './incantations.json' with { type: 'json' };
import startingArena from './starting-arena.json' with { type: 'json' };
import forestFloor from './floor-forest.json' with { type: 'json' };
import castleFloor from './floor-castle.json' with { type: 'json' };

/** Cached items used when the API fails, is rate-limited, or the mock parser finds nothing. */
export const CACHED_INCANTATIONS: readonly unknown[] = incantations;
export const CACHED_FLOORS: readonly unknown[] = [startingArena, forestFloor, castleFloor];

function index(text: string, length: number): number {
  const h = [...text.toLowerCase()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return h % length;
}

/** Deterministic pick so the same words give the same cached item. */
export function cachedIncantation(text: string): unknown {
  return structuredClone(CACHED_INCANTATIONS[index(text, CACHED_INCANTATIONS.length)]);
}

export function cachedFloor(text: string): unknown {
  return structuredClone(CACHED_FLOORS[index(text, CACHED_FLOORS.length)]);
}
