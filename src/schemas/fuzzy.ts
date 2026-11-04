/** Small, dependency-free string matching used to map LLM output onto allowed values. */

export function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/**
 * Closest candidate to `value`, or undefined if nothing is close enough. Order of preference:
 * 1. the whole value, normalised, equals a candidate or alias
 * 2. one of its words equals a candidate or alias ("dark spooky forest" → forest)
 * 3. one of its words starts with a candidate or alias, or vice versa ("snowy" → snow → ice)
 * 4. substring / edit distance on the whole value, within maxRatio × length
 */
export function closest<T extends string>(
  value: string,
  candidates: readonly T[],
  options: { aliases?: Readonly<Record<string, T>>; maxRatio?: number } = {},
): T | undefined {
  const v = normalise(value);
  if (!v) return undefined;

  // Lookup table: normalised candidate or alias → candidate.
  const table = new Map<string, T>();
  for (const [alias, target] of Object.entries(options.aliases ?? {})) table.set(normalise(alias), target);
  for (const c of candidates) table.set(normalise(c), c);

  const whole = table.get(v);
  if (whole) return whole;

  const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length > 1) {
    for (const w of words) {
      const hit = table.get(w);
      if (hit) return hit;
    }
  }
  for (const w of words) {
    if (w.length < 4) continue;
    for (const [key, target] of table) {
      if (key.length >= 3 && (w.startsWith(key) || key.startsWith(w))) return target;
    }
  }

  let best: T | undefined;
  let bestScore = Infinity;
  for (const c of candidates) {
    const norm = normalise(c);
    // Substring matches ("forested" → forest) score by length difference only.
    const score = norm.includes(v) || v.includes(norm) ? Math.abs(norm.length - v.length) * 0.1 : levenshtein(v, norm);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  const limit = Math.max(1, Math.floor(v.length * (options.maxRatio ?? 0.4)));
  return bestScore <= limit ? best : undefined;
}
