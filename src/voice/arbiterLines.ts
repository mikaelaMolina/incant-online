import { REPLIES } from '../../api/_lib/mock/interpreter.js';
import { stripForSpeech } from './speechText.js';
import { STORY_BEATS, STORY_CHAPTERS, GUIDE_LINES, PROLOGUE_NARRATION, PROLOGUE_NPC_DIALOGUE, VILLAGE_RETURN } from '../game/story.js';

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

/** Story beats and chapter intros up to this floor are pre-recorded; later ones are spoken live. */
const PREBAKE_UP_TO_FLOOR = 4;

/** All lines worth pre-recording: the Arbiter's own lines, story beats, and the mock parser's in-character replies. */
export function prebakedLines(): string[] {
  const lines = [
    ...Object.values(ARBITER_LINES),
    ...Object.values(REPLIES).flat(),
    // Only what nearly every player hears: later beats and chapters are generated on demand (cached).
    ...STORY_BEATS.filter((b) => b.floor <= PREBAKE_UP_TO_FLOOR).map((b) => b.line),
    ...STORY_CHAPTERS.filter((c) => c.start <= PREBAKE_UP_TO_FLOOR).map((c) => c.intro),
    ...GUIDE_LINES.map((g) => g.line),
    PROLOGUE_NARRATION,
    VILLAGE_RETURN,
    ...PROLOGUE_NPC_DIALOGUE.flatMap((d) => [d.greeting, ...d.lines.map((l) => l.line)]),
  ];
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
