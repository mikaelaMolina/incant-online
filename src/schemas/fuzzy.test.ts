import { describe, expect, it } from 'vitest';
import { closest, levenshtein } from './fuzzy';

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});

describe('closest', () => {
  const biomes = ['forest', 'ruins', 'ice', 'desert'] as const;
  it('matches exact values ignoring case and punctuation', () => {
    expect(closest('  FOREST! ', biomes)).toBe('forest');
  });
  it('uses aliases', () => {
    expect(closest('snow', biomes, { aliases: { snow: 'ice' } })).toBe('ice');
  });
  it('matches substrings and typos', () => {
    expect(closest('forested', biomes)).toBe('forest');
    expect(closest('dessert', biomes)).toBe('desert');
  });
  it('matches a word inside a phrase', () => {
    expect(closest('a dark, spooky forest', biomes)).toBe('forest');
    expect(closest('Snowy Glacier', biomes, { aliases: { snow: 'ice', glacier: 'ice' } })).toBe('ice');
  });
  it('rejects unrelated words', () => {
    expect(closest('spaceship', biomes)).toBeUndefined();
    expect(closest('', biomes)).toBeUndefined();
  });
});
