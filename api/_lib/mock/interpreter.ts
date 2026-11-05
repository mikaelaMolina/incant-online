import { IncantationSpec } from '../../../src/schemas/incantationSpec.js';
import { FloorSpec } from '../../../src/schemas/floorSpec.js';
import { cachedFloor, cachedIncantation } from '../../../src/fallback/cache.js';
import { ABILITY_NOUNS, boundImpossible, hasIncantationSignals, incantationFromWords, isImpossibleAbility, readIncantationSignals, refineIncantation } from './incantation.js';
import { floorFromWords, readFloorSignals, refineFloor, type RawFloor } from './floor.js';
import { hasAny, pick, seededRandom, tokens } from './words.js';

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
/** Questions about the game itself get a real answer (how to play), not a deflection. */
const META = ['game', 'play*', 'control*', 'help', 'tutorial', 'rules', 'goal', 'spire', 'incanter', 'arbiter', 'grimoire'];
const REPLIES = {
  meta: [
    'This is the Spire, Incanter. Describe an Incantation and it is forged; say its name and it is cast. Describe a place and a new floor rises. Clear a floor and a gate opens to the next.',
    'You stand in the Spire, where words become power. Speak an Incantation to forge it, recite its name to cast it, and describe the floors you wish to climb.',
  ],
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
  const abilityWords = hasIncantationSignals(inc) || hasAny(words, ABILITY_NOUNS) || isImpossibleAbility(words);
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
  if (abilityWords) {
    const incantation = incantationFromWords(text, words);
    // Impossible asks become the closest allowed Incantation, with a line saying so.
    const reply = boundImpossible(words, incantation);
    return { intent: 'forge', incantation, ...(reply ? { reply } : {}) };
  }

  // 4. Asked to create something, but no keywords: hand back a cached item.
  if (createWords) {
    return floorSig.place
      ? { intent: 'build', floor: cachedFloor(text) }
      : { intent: 'forge', incantation: cachedIncantation(text) };
  }

  // 5. Anything else: an in-character reply.
  const asking = /\?\s*$/.test(text) || hasAny(words, ['who', 'what', 'why', 'how', 'where']);
  const kind = hasAny(words, GREETINGS) ? 'greeting' : asking && hasAny(words, META) ? 'meta' : asking ? 'question' : 'unknown';
  return { intent: 'reply', reply: pick(REPLIES[kind], rand) };
}
