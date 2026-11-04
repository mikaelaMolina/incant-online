import { levenshtein } from '../schemas/fuzzy';

/** Same cap as the backend: longer input is cut, not rejected. */
export const MAX_UTTERANCE_LENGTH = 300;

export const AWAKENING_PHRASE = 'I speak, I enter';

/** Trim, collapse whitespace and cap length. Returns '' for empty input. */
export function normaliseUtterance(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_UTTERANCE_LENGTH).trim();
}

const words = (s: string): string => s.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Does the utterance contain the awakening phrase? Tolerates punctuation, filler words around it
 * and small recognition slips ("I speak I enter", "i speak and i enter", "I speak, I entered").
 */
export function isAwakeningPhrase(text: string): boolean {
  const said = words(text);
  const target = words(AWAKENING_PHRASE); // "i speak i enter"
  if (!said) return false;
  if (said.includes(target)) return true;
  // Slide a window of similar length over what was said and allow a few edits.
  const tokens = said.split(' ');
  for (let len = 3; len <= 6; len++) {
    for (let i = 0; i + len <= tokens.length; i++) {
      const window = tokens.slice(i, i + len).join(' ');
      if (levenshtein(window, target) <= 4 && window.includes('speak')) return true;
    }
  }
  return false;
}
