import { describe, expect, it } from 'vitest';
import { isAwakeningPhrase, MAX_UTTERANCE_LENGTH, normaliseUtterance } from './utterance';

describe('normaliseUtterance', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseUtterance('  fire\n\n  slash  ')).toBe('fire slash');
  });
  it('caps length', () => {
    expect(normaliseUtterance('a'.repeat(500))).toHaveLength(MAX_UTTERANCE_LENGTH);
  });
  it('returns empty for blank input', () => {
    expect(normaliseUtterance('   ')).toBe('');
  });
});

describe('isAwakeningPhrase', () => {
  it.each([
    'I speak, I enter',
    'i speak i enter',
    'I SPEAK I ENTER!',
    'okay I speak I enter now',
    'I speak and I enter',
    'I speak, I entered',
    'eye speak I enter',
  ])('accepts %s', (s) => expect(isAwakeningPhrase(s)).toBe(true));

  it.each(['', 'hello', 'I enter', 'speak', 'make a fire sword', 'I seek a centre'])('rejects %s', (s) =>
    expect(isAwakeningPhrase(s)).toBe(false),
  );
});
