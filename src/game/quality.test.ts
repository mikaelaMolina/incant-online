import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, QUALITY_LEVELS, median } from './quality';

const run = (q: AdaptiveQuality, seconds: number, frameMs: number) => {
  const changes = [];
  for (let t = 0; t < seconds; t += frameMs / 1000) {
    const c = q.sample(frameMs / 1000);
    if (c) changes.push(c.label);
  }
  return changes;
};

describe('AdaptiveQuality', () => {
  it('keeps full quality at 60 fps', () => {
    const q = new AdaptiveQuality();
    expect(run(q, 20, 16.7)).toEqual([]);
    expect(q.level).toBe(0);
  });

  it('steps down one level at a time while slow, and stops at the lowest', () => {
    const q = new AdaptiveQuality();
    const changes = run(q, 60, 30);
    expect(changes).toEqual(QUALITY_LEVELS.slice(1).map((l) => l.label));
    expect(q.current).toBe(QUALITY_LEVELS.at(-1));
  });

  it('ignores short hitches (median, not average)', () => {
    const q = new AdaptiveQuality();
    for (let i = 0; i < 2000; i++) expect(q.sample(i % 10 === 0 ? 0.25 : 0.0167)).toBeUndefined();
  });

  it('stops stepping once fast enough', () => {
    const q = new AdaptiveQuality();
    while (!q.sample(0.03)); // slow until the first step down
    const after = q.level;
    expect(after).toBeGreaterThan(0);
    expect(run(q, 30, 15)).toEqual([]);
    expect(q.level).toBe(after);
  });

  it('can be disabled (fixed quality for testing)', () => {
    const q = new AdaptiveQuality(false);
    expect(run(q, 30, 50)).toEqual([]);
  });

  it('median', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 100])).toBe(2.5);
  });
});
