import { mockInterpret, type MockContext, type RawInterpretResponse } from '../../api/_lib/mock/interpreter.js';
import { cachedFloor, cachedIncantation, type CacheHint } from './cache.js';

/** Why the fallback is answering. Each reason has its own in-character line. */
export type FallbackReason = 'offline' | 'timeout' | 'rate-limit' | 'llm-error';

export interface FallbackOptions {
  reason: FallbackReason;
  /** The caller needs a floor whatever was said (the gate). */
  want?: 'floor';
  /** Names not to hand out: Incantations already in the Grimoire, the current floor. */
  avoidIncantations?: readonly string[];
  avoidFloors?: readonly string[];
}

const LINES: Record<FallbackReason, { forge: string; build: string; refine: string }> = {
  offline: {
    forge: 'The Spire’s voice is far away; it offers you an Incantation it remembers.',
    build: 'The Spire’s voice is far away; it raises a floor it remembers.',
    refine: 'The Spire’s voice is far away; it reshapes your Incantation as best it can.',
  },
  timeout: {
    forge: 'The Spire took too long to listen; it offers you an Incantation it remembers.',
    build: 'The Spire took too long to listen; it raises a floor it remembers.',
    refine: 'The Spire took too long to listen; it reshapes your Incantation as best it can.',
  },
  'rate-limit': {
    forge: 'The Spire grows weary of your voice; it offers what it already knows.',
    build: 'The Spire grows weary of your voice; it raises a floor it already knows.',
    refine: 'The Spire grows weary of your voice; it reshapes your Incantation as best it can.',
  },
  'llm-error': {
    forge: 'The Spire’s thoughts scatter; it offers you an Incantation it remembers.',
    build: 'The Spire’s thoughts scatter; it raises a floor it remembers.',
    refine: 'The Spire’s thoughts scatter; it reshapes your Incantation as best it can.',
  },
};

/**
 * The answer when the real interpreter can't give one. Shared by the backend (LLM error,
 * timeout, rate limit) and the browser (backend unreachable, timed out, 429).
 *
 * The mock keyword parser decides only WHAT was asked for; the content comes from the cache:
 * - a place → one of the pre-built floors;
 * - an ability → one of the pre-forged Incantations;
 * - "make it …" with context → the mock parser's own refinement of the player's Incantation or
 *   floor (handing back an unrelated cached item would throw away what they made);
 * - anything else (greetings, questions, nonsense) → the mock parser's in-character reply.
 * Never throws; the result still goes through zod and the Arbiter like any other.
 */
export function fallbackResponse(text: string, context: MockContext | undefined, o: FallbackOptions): RawInterpretResponse {
  const lines = LINES[o.reason];
  let guess: RawInterpretResponse;
  try {
    guess = mockInterpret(text, context ?? {});
  } catch {
    guess = { intent: 'reply', reply: 'The Spire is silent. Speak again, Incanter.' };
  }
  const refining = !!(context?.incantation || context?.floor) && /^(?:now |and |then )?(make it|make that|now make it|add|remove|more|less|give it|change it|turn it)\b/i.test(text.trim());

  if (o.want === 'floor' || guess.intent === 'build') {
    if (refining && guess.intent === 'build' && guess.floor && o.want !== 'floor') return { ...guess, reply: lines.refine };
    return { intent: 'build', floor: cachedFloor(text, o.avoidFloors ?? [], hintOf(guess.floor)), reply: lines.build };
  }
  if (guess.intent === 'forge') {
    if (refining && guess.incantation) return { intent: 'forge', incantation: guess.incantation, reply: lines.refine };
    return { intent: 'forge', incantation: cachedIncantation(text, o.avoidIncantations ?? [], hintOf(guess.incantation)), reply: lines.forge };
  }
  return guess;
}

/** Element / type / shape / biome the mock parser read from the words (only when it read them). */
function hintOf(item: unknown): CacheHint {
  if (!item || typeof item !== 'object') return {};
  const r = item as Record<string, unknown>;
  const hint: CacheHint = {};
  for (const k of ['element', 'type', 'shape', 'biome'] as const) if (typeof r[k] === 'string') hint[k] = r[k];
  // The mock parser defaults to "physical" when no element was named: that is not a request.
  if (hint.element === 'physical') delete hint.element;
  return hint;
}
