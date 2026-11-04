import { IncantationSpec } from '../../../src/schemas/incantationSpec';
import { FloorSpec } from '../../../src/schemas/floorSpec';
import { cachedFloor, cachedIncantation } from '../../../src/fallback/cache';
import { ABILITY_NOUNS, hasIncantationSignals, incantationFromWords, readIncantationSignals, refineIncantation } from './incantation';
import { floorFromWords, readFloorSignals, refineFloor, type RawFloor } from './floor';
import { hasAny, pick, seededRandom, tokens } from './words';

export interface MockContext {
  incantation?: unknown;
  floor?: unknown;
}

/** Same shape the LLM is asked for: { intent, incantation?, floor?, reply? } (unvalidated). */
export interface RawInterpretResponse {
  intent: 'forge' | 'build' | 'reply';
  incantation?: unknown;
  floor?: unknown;
  reply?: string;
}

const CREATE_VERBS = ['make', 'create', 'give', 'forge', 'build', 'summon', 'conjure', 'craft', 'invent', 'design', 'want', 'teach', 'generate', 'bring'];
const REFINE_START = /^(make it|make that|now make it|add|remove|more|less|give it|change it|turn it)\b/i;

const GREETINGS = ['hello', 'hi', 'hey', 'greetings', 'yo', 'hiya'];
const REPLIES = {
  greeting: [
    'Greetings, Incanter. Speak an Incantation into being: name an element, a shape, a number of strikes.',
    'The Spire hears you, Incanter. Tell it what to forge, or what place to raise.',
  ],
  question: [
    'The Spire answers only in deeds. Ask it for a spell of fire or frost, or for a forest, a castle, a desert or a cave.',
    'Questions echo and fade here. Shape them into an Incantation, "a triple lightning slash", or a place, "a misty forest".',
  ],
  unknown: [
    'The Spire does not understand. Speak of fire, ice or lightning, of slashes, beams and orbs, or name a place to build.',
    'Those words find no shape in the Spire. Try "a spinning fire slash that hits three times" or "build a desert at dusk".',
    'The Spire waits for clearer words: an element and a shape for an Incantation, or a place for a new floor.',
  ],
};

/**
 * MOCK mode interpreter: a keyword parser standing in for the LLM. It never calls a model.
 * Order: refine (with context) → build (place words) → forge (ability words) → cached item
 * (asked to create, but nothing recognised) → in-character reply.
 */
export function mockInterpret(text: string, context: MockContext = {}): RawInterpretResponse {
  const words = tokens(text);
  const rand = seededRandom(text.toLowerCase());
  const inc = readIncantationSignals(words);
  const floorSig = readFloorSignals(words);
  const abilityWords = hasIncantationSignals(inc) || hasAny(words, ABILITY_NOUNS);
  const createWords = hasAny(words, CREATE_VERBS);

  // 1. Refine the previous Incantation or floor.
  if (REFINE_START.test(text.trim())) {
    const floorBase = context.floor !== undefined ? FloorSpec.safeParse(context.floor) : undefined;
    const incBase = context.incantation !== undefined ? IncantationSpec.safeParse(context.incantation) : undefined;
    const aboutFloor = !!(floorSig.biome || floorSig.place || floorSig.time) || hasAny(words, ['fog*', 'mist*', 'enem*']);
    if (aboutFloor && floorBase?.success) {
      return { intent: 'build', floor: refineFloor(text, words, floorBase.data as RawFloor) };
    }
    if (incBase?.success) return { intent: 'forge', incantation: refineIncantation(text, words, incBase.data) };
    if (floorBase?.success) return { intent: 'build', floor: refineFloor(text, words, floorBase.data as RawFloor) };
  }

  // 2. A place: an unambiguous biome word, or a soft one ("frozen", "dark") next to a place noun.
  const isPlace =
    (floorSig.biome && (floorSig.place || !inc.shape)) ||
    (floorSig.softBiome && floorSig.place) ||
    (floorSig.place && hasAny(words, ['build', 'raise', 'create', 'take', 'go', 'enter', 'next']));
  if (isPlace) return { intent: 'build', floor: floorFromWords(text, words) };

  // 3. An ability.
  if (abilityWords) return { intent: 'forge', incantation: incantationFromWords(text, words) };

  // 4. Asked to create something, but no keywords: hand back a cached item.
  if (createWords) {
    return floorSig.place
      ? { intent: 'build', floor: cachedFloor(text) }
      : { intent: 'forge', incantation: cachedIncantation(text) };
  }

  // 5. Anything else: an in-character reply.
  const kind = hasAny(words, GREETINGS) ? 'greeting' : /\?\s*$/.test(text) || hasAny(words, ['who', 'what', 'why', 'how', 'where']) ? 'question' : 'unknown';
  return { intent: 'reply', reply: pick(REPLIES[kind], rand) };
}
