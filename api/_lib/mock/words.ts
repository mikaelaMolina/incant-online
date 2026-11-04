/** Tokenising and small helpers shared by the mock parser. */

export function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
}

/** Deterministic hash → [0, 1) RNG, so the same words always give the same result. */
export function seededRandom(seedText: string): () => number {
  let s = [...seedText].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length) % list.length] as T;
}

/** First table key (a word or a stem ending in '*') found in the tokens. */
export function findKeyword<T>(words: readonly string[], table: ReadonlyArray<readonly [string, T]>): T | undefined {
  for (const [key, value] of table) {
    const stem = key.endsWith('*') ? key.slice(0, -1) : undefined;
    if (words.some((w) => (stem ? w.startsWith(stem) : w === key))) return value;
  }
  return undefined;
}

export function hasAny(words: readonly string[], list: readonly string[]): boolean {
  return findKeyword(
    words,
    list.map((k) => [k, true] as const),
  ) === true;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, once: 1,
  two: 2, double: 2, twin: 2, twice: 2, pair: 2,
  three: 3, triple: 3, thrice: 3,
  four: 4, quad: 4, quadruple: 4,
  five: 5, quintuple: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

export function numberValue(word: string): number | undefined {
  if (/^\d+$/.test(word)) return Number(word);
  return NUMBER_WORDS[word];
}

/**
 * A count attached to one of `nouns`: "three hits", "3 quick slashes", "triple slash", "hits five times".
 * Looks up to two words before the noun ("five fiery strikes").
 */
export function countFor(words: readonly string[], nouns: readonly string[]): number | undefined {
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? '';
    if (!nouns.some((n) => w === n || w === n + 's' || w === n + 'es')) continue;
    for (let back = 1; back <= 2; back++) {
      const n = numberValue(words[i - back] ?? '');
      if (n !== undefined && (words[i - back] !== 'a' && words[i - back] !== 'an' || back === 1)) return n;
    }
    // "hits five times" / "strikes 3 times"
    const after = numberValue(words[i + 1] ?? '');
    if (after !== undefined && (words[i + 2] === 'times' || words[i + 2] === 'time')) return after;
  }
  // "five times"
  for (let i = 0; i + 1 < words.length; i++) {
    if (words[i + 1] === 'times') {
      const n = numberValue(words[i] ?? '');
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
