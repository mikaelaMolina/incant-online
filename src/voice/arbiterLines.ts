import { REPLIES } from '../../api/_lib/mock/interpreter.js';
import { stripForSpeech } from './speechText.js';

/**
 * Every fixed line the Arbiter speaks. These are pre-recorded once with the cloud voice
 * (`npm run voices` → public/assets/voice/) and played from files, so they cost no credits at
 * runtime. Lines with names in them (a floor, a boss, a forged Incantation) are spoken live.
 */
export const ARBITER_LINES = {
  welcome: 'Welcome, Incanter. Clear each floor, speak new Incantations, and climb. A guardian waits on every third floor.',
  gateOpen: 'This floor falls silent. A gate opens: step into it and speak the next floor into being.',
  gateEnter: 'Describe the floor that lies beyond.',
  bossAwake: 'A guardian wakes on this floor. Unmake it, Incanter.',
  reshapes: 'The Spire reshapes.',
  silent: 'The Spire is silent.',
  silentAgain: 'The Spire is silent. Speak again, Incanter.',
  heardNothing: 'The Spire heard nothing. Speak, Incanter.',
} as const;

/** All lines worth pre-recording: the Arbiter's own lines and the mock parser's in-character replies. */
export function prebakedLines(): string[] {
  const lines = [...Object.values(ARBITER_LINES), ...Object.values(REPLIES).flat()];
  return [...new Set(lines)];
}

/** Lookup key for a spoken line: case, punctuation and spacing don't matter. */
export function lineKey(text: string): string {
  return stripForSpeech(text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
