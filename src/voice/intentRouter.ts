import Fuse from 'fuse.js';
import { levenshtein } from '../schemas/fuzzy';

/**
 * Voice routing (CLAUDE.md), as a pure classifier. Order of checks:
 * 1. Recite: Fuse.js match against Grimoire names (threshold 0.4) → cast locally.
 * 2. System command: fixed phrases → local.
 * 3. Refine: starts with "make it", "add", "remove", … → /api/interpret with context.
 * 4. Talk: near the guide NPC → /api/talk.
 * 5. Everything else → /api/interpret (forge / build / reply).
 */

export const RECITE_THRESHOLD = 0.4;
/** Stricter score for casting from an interim (still-being-spoken) transcript. */
export const INTERIM_RECITE_THRESHOLD = 0.15;

export type SystemCommand = 'open-grimoire' | 'close-grimoire' | 'next-floor';

export type Route =
  | { kind: 'recite'; name: string; score: number }
  | { kind: 'command'; command: SystemCommand }
  | { kind: 'refine' }
  | { kind: 'talk' }
  | { kind: 'interpret' };

/** Starts of a refinement. */
export const REFINE_START = /^(?:now |and |then |ok(?:ay)? |please )?(make it|make that|make them|add|remove|more|less|give it|change it|turn it|without)\b/i;

/** Words that mean "create something", never "cast": these never recite. */
const CREATE_START = /^(?:i want |let me |please )?(make|create|forge|build|craft|give me|summon a|summon an|raise|i want|teach me|design|invent|conjure a|conjure an)\b/i;

/** Filler a player may say around a name when reciting: "cast Blazing Cyclone!", "I invoke Frost Comet". */
const RECITE_PREFIX = /^(?:i |now |and )?(?:cast|recite|use|invoke|unleash|call|go|fire|activate)\b[\s,:]*/i;

const COMMANDS: { command: SystemCommand; phrases: string[] }[] = [
  { command: 'open-grimoire', phrases: ['open grimoire', 'open the grimoire', 'show grimoire', 'show the grimoire', 'show my grimoire', 'open my grimoire', 'grimoire'] },
  { command: 'close-grimoire', phrases: ['close grimoire', 'close the grimoire', 'hide grimoire', 'hide the grimoire', 'close my grimoire'] },
  { command: 'next-floor', phrases: ['next floor', 'go to the next floor', 'take me to the next floor', 'climb', 'ascend', 'go up', 'next level'] },
];

/** Lower-case words only: "Open the Grimoire!" → "open the grimoire". */
export function words(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/[-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fixed system phrases, tolerant of small recognition slips. */
export function matchSystemCommand(text: string): SystemCommand | undefined {
  const w = words(text).replace(/^(please |now |ok |okay )/, '').replace(/( please| now)$/, '');
  if (!w) return undefined;
  for (const { command, phrases } of COMMANDS) {
    for (const p of phrases) {
      if (w === p) return command;
      // Allow ~1 slip per 6 letters on longer phrases ("open the grimwire").
      if (p.length >= 8 && levenshtein(w, p) <= Math.floor(p.length / 6)) return command;
    }
  }
  return undefined;
}

/** What to try to match as a name: the utterance minus reciting filler. */
export function reciteCandidate(text: string): string {
  return words(text).replace(RECITE_PREFIX, '').trim();
}

/**
 * Fuse.js index over Grimoire names. Rebuild when the Grimoire changes (cheap: ≤ dozens of names).
 */
export class ReciteIndex {
  private fuse: Fuse<{ name: string; norm: string }>;

  constructor(names: readonly string[] = []) {
    this.fuse = makeFuse(names);
  }

  setNames(names: readonly string[]): void {
    this.fuse = makeFuse(names);
  }

  /** Best Grimoire name for what was said, if close enough (score 0 = exact … 1 = nothing alike). */
  match(text: string, threshold = RECITE_THRESHOLD): { name: string; score: number } | undefined {
    if (CREATE_START.test(text.trim()) || REFINE_START.test(text.trim())) return undefined;
    const said = reciteCandidate(text);
    if (!said || said.length > 48) return undefined;
    const [best] = this.fuse.search(said, { limit: 1 });
    if (!best || best.score === undefined || best.score > threshold) return undefined;
    // Guard against short words hiding inside long names ("ice" vs "Frozen Ice Lance Barrage"):
    // what was said must cover most of the name.
    const nameLen = best.item.norm.length;
    if (said.replace(/\s/g, '').length < nameLen * 0.6) return undefined;
    return { name: best.item.name, score: best.score };
  }
}

function makeFuse(names: readonly string[]): Fuse<{ name: string; norm: string }> {
  return new Fuse(
    names.map((name) => ({ name, norm: words(name).replace(/\s/g, '') })),
    {
      keys: ['name'],
      threshold: RECITE_THRESHOLD,
      includeScore: true,
      ignoreLocation: true,
      isCaseSensitive: false,
      ignoreDiacritics: true,
    },
  );
}

export interface RouteContext {
  recite: ReciteIndex;
  /** Is there something to refine (an Incantation or the current floor)? */
  canRefine: boolean;
  nearGuide: boolean;
}

export function classify(text: string, ctx: RouteContext): Route {
  const recited = ctx.recite.match(text);
  if (recited) return { kind: 'recite', ...recited };
  const command = matchSystemCommand(text);
  if (command) return { kind: 'command', command };
  if (ctx.canRefine && REFINE_START.test(text.trim())) return { kind: 'refine' };
  if (ctx.nearGuide) return { kind: 'talk' };
  return { kind: 'interpret' };
}
