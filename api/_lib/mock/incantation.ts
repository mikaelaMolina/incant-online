import type { Element, IncantationSpec, IncantationType, Particles, Shape, StatusKind } from '../../../src/schemas/incantationSpec.js';
import { countFor, findKeyword, hasAny, titleCase } from './words.js';

/** Raw Incantation fields as the mock "LLM" would emit them (validated + balanced later). */
export type RawIncantation = Omit<IncantationSpec, 'mana_cost'> & { mana_cost: number };

export const ELEMENT_WORDS: ReadonlyArray<readonly [string, Element]> = [
  ['fire', 'fire'], ['flam*', 'fire'], ['blaz*', 'fire'], ['burn*', 'fire'], ['ember*', 'fire'], ['inferno', 'fire'], ['magma', 'fire'], ['lava', 'fire'], ['fiery', 'fire'], ['heat', 'fire'],
  ['ice', 'ice'], ['icy', 'ice'], ['frost*', 'ice'], ['freez*', 'ice'], ['frozen', 'ice'], ['snow*', 'ice'], ['hail*', 'ice'], ['glacial', 'ice'], ['cold', 'ice'],
  ['lightning', 'lightning'], ['thunder*', 'lightning'], ['storm*', 'lightning'], ['shock*', 'lightning'], ['electric*', 'lightning'], ['spark*', 'lightning'], ['volt*', 'lightning'],
  ['wind*', 'wind'], ['gale*', 'wind'], ['gust*', 'wind'], ['tornado', 'wind'], ['air', 'wind'], ['breeze', 'wind'], ['hurricane', 'wind'],
  ['light', 'light'], ['holy', 'light'], ['radian*', 'light'], ['sun*', 'light'], ['divine', 'light'], ['solar', 'light'], ['shining', 'light'],
  ['shadow*', 'shadow'], ['dark*', 'shadow'], ['umbral', 'shadow'], ['night', 'shadow'], ['void', 'shadow'], ['cursed', 'shadow'],
  ['steel', 'physical'], ['iron', 'physical'], ['stone', 'physical'], ['earth', 'physical'], ['rock', 'physical'],
];

export const SHAPE_WORDS: ReadonlyArray<readonly [string, Shape]> = [
  ['slash*', 'slash'], ['cut*', 'slash'], ['blade*', 'slash'], ['sword*', 'slash'], ['cleave*', 'slash'], ['swipe*', 'slash'], ['crescent', 'slash'],
  ['thrust*', 'thrust'], ['stab*', 'thrust'], ['pierc*', 'thrust'], ['spear*', 'thrust'], ['lance*', 'thrust'], ['jab*', 'thrust'],
  ['spin*', 'spin'], ['whirl*', 'spin'], ['cyclone', 'spin'], ['spiral', 'spin'], ['vortex', 'spin'], ['twirl*', 'spin'],
  ['cone', 'cone'], ['breath', 'cone'], ['spray', 'cone'], ['fan', 'cone'], ['wave', 'cone'],
  ['circle', 'circle'], ['ring', 'circle'], ['nova', 'circle'], ['aura', 'circle'], ['around', 'circle'], ['explo*', 'circle'], ['burst', 'circle'], ['meteor', 'circle'], ['rain', 'circle'],
  ['beam*', 'line'], ['ray', 'line'], ['laser', 'line'], ['line', 'line'], ['wall', 'line'],
  ['orb*', 'orb'], ['ball*', 'orb'], ['sphere', 'orb'], ['bolt*', 'orb'], ['bullet*', 'orb'], ['missile*', 'orb'], ['shot', 'orb'], ['arrow*', 'orb'],
];

const TYPE_WORDS: ReadonlyArray<readonly [string, IncantationType]> = [
  ['chain*', 'chain'], ['bounc*', 'chain'], ['jump*', 'chain'], ['arc*', 'chain'], ['leap*', 'chain'],
  ['heal*', 'buff'], ['shield*', 'buff'], ['barrier', 'buff'], ['protect*', 'buff'], ['buff', 'buff'], ['ward', 'buff'], ['bless*', 'buff'], ['mend*', 'buff'],
  ['dash*', 'dash'], ['charg*', 'dash'], ['rush*', 'dash'], ['teleport*', 'dash'], ['blink', 'dash'],
  ['beam*', 'beam'], ['ray', 'beam'], ['laser', 'beam'],
  ['combo', 'melee_combo'],
];

const STATUS_WORDS: ReadonlyArray<readonly [string, StatusKind]> = [
  ['burn*', 'burn'], ['ignit*', 'burn'],
  ['freez*', 'freeze'], ['froze*', 'freeze'],
  ['stun*', 'stun'], ['paraly*', 'stun'], ['daz*', 'stun'],
  ['slow*', 'slow'], ['chill*', 'slow'], ['snare', 'slow'],
  ['knockback', 'knockback'], ['knock', 'knockback'], ['push*', 'knockback'], ['blast', 'knockback'],
  ['heal*', 'heal'], ['mend*', 'heal'], ['regen*', 'heal'],
];

const COLOR_WORDS: ReadonlyArray<readonly [string, string]> = [
  ['red', '#ff4a3a'], ['crimson', '#d81e3c'], ['orange', '#ff8c2a'], ['gold*', '#ffd34a'], ['yellow', '#f4e85a'],
  ['green', '#5ae07a'], ['emerald', '#2ec27e'], ['blue', '#4a9cff'], ['azure', '#5ec8ff'], ['cyan', '#4ff0ff'],
  ['purple', '#a66bff'], ['violet', '#8f5aff'], ['pink', '#ff7ac8'], ['white', '#f4f8ff'], ['black', '#3a3550'], ['silver', '#d0d8e8'],
];

export const ELEMENT_LOOK: Record<Element, { color: string; particles: Particles; adjective: string; phrase: string }> = {
  fire: { color: '#ff6a1a', particles: 'embers', adjective: 'Blazing', phrase: 'wreathed in fire' },
  ice: { color: '#8fdcff', particles: 'frost', adjective: 'Frozen', phrase: 'rimed with frost' },
  lightning: { color: '#f4f06a', particles: 'sparks', adjective: 'Thundering', phrase: 'crackling with lightning' },
  wind: { color: '#bff5d0', particles: 'leaves', adjective: 'Howling', phrase: 'carried on the wind' },
  light: { color: '#fff3b0', particles: 'motes', adjective: 'Radiant', phrase: 'blazing with light' },
  shadow: { color: '#9a6bff', particles: 'smoke', adjective: 'Umbral', phrase: 'woven from shadow' },
  physical: { color: '#d8d8e0', particles: 'sparks', adjective: 'Iron', phrase: 'of tempered steel' },
};

const DEFAULT_STATUS: Record<Element, IncantationSpec['status_effect']> = {
  fire: { kind: 'burn', dps: 4, duration: 3 },
  ice: { kind: 'slow', dps: 0, duration: 2 },
  lightning: { kind: 'stun', dps: 0, duration: 0.5 },
  wind: { kind: 'knockback', dps: 0, duration: 0 },
  light: { kind: 'none', dps: 0, duration: 0 },
  shadow: { kind: 'slow', dps: 0, duration: 2 },
  physical: { kind: 'none', dps: 0, duration: 0 },
};

const SHAPE_TYPE: Record<Shape, IncantationType> = {
  slash: 'melee_combo', thrust: 'melee_combo', spin: 'melee_combo', cone: 'area', circle: 'area', line: 'beam', orb: 'projectile',
};
const TYPE_SHAPE: Record<IncantationType, Shape> = {
  melee_combo: 'slash', projectile: 'orb', area: 'circle', beam: 'line', chain: 'orb', buff: 'circle', dash: 'thrust',
};
const SHAPE_RADIUS: Record<Shape, number> = { slash: 2.5, thrust: 1.5, spin: 3.5, cone: 3, circle: 4, line: 1, orb: 1.5 };
const SHAPE_NOUN: Record<Shape, [string, string]> = {
  slash: ['cut', 'cuts'], thrust: ['thrust', 'thrusts'], spin: ['spinning cut', 'spinning cuts'], cone: ['cone', 'cones'],
  circle: ['ring', 'rings'], line: ['beam', 'beams'], orb: ['orb', 'orbs'],
};
const NAME_NOUN: Record<Shape, string> = { slash: 'Edge', thrust: 'Lance', spin: 'Cyclone', cone: 'Breath', circle: 'Nova', line: 'Beam', orb: 'Orb' };
const TYPE_NAME_NOUN: Partial<Record<IncantationType, string>> = { chain: 'Chain', buff: 'Ward', dash: 'Rush' };
const COUNT_WORDS = ['A', 'Two', 'Three', 'Four', 'Five'];

const HIT_NOUNS = ['hit', 'strike', 'slash', 'cut', 'blow', 'shot', 'bolt', 'stab', 'thrust', 'swing', 'combo'];
const TARGET_NOUNS = ['enemy', 'enemie', 'target', 'foe', 'monster'];
const POWER_UP = ['power*', 'mighty', 'devastat*', 'strong*', 'massive', 'heavy', 'brutal', 'deadly', 'ultimate'];
const POWER_DOWN = ['weak*', 'gentle', 'feeble', 'little'];
const FAST = ['quick*', 'fast*', 'rapid*', 'swift*', 'flurry'];
const BIG = ['huge', 'giant', 'massive', 'wide', 'big*', 'enormous', 'vast', 'large'];
const SMALL = ['small*', 'tiny', 'narrow', 'tight'];

/** Words that make an utterance sound like an ability (on top of element/shape/type words). */
export const ABILITY_NOUNS = ['spell', 'attack', 'incantation', 'ability', 'magic', 'skill', 'technique', 'strike', 'hit*', 'cast*', 'blast', 'combo'];

export interface IncantationSignals {
  element?: Element;
  shape?: Shape;
  type?: IncantationType;
  status?: StatusKind;
  hits?: number;
  chain?: number;
}

export function readIncantationSignals(words: readonly string[]): IncantationSignals {
  const s: IncantationSignals = {};
  const element = findKeyword(words, ELEMENT_WORDS);
  const shape = findKeyword(words, SHAPE_WORDS);
  const type = findKeyword(words, TYPE_WORDS);
  const status = findKeyword(words, STATUS_WORDS);
  const hits = countFor(words, HIT_NOUNS);
  const chain = countFor(words, TARGET_NOUNS);
  if (element) s.element = element;
  if (shape) s.shape = shape;
  if (type) s.type = type;
  if (status) s.status = status;
  if (hits !== undefined) s.hits = hits;
  if (chain !== undefined) s.chain = chain;
  return s;
}

export function hasIncantationSignals(s: IncantationSignals): boolean {
  return !!(s.element || s.shape || s.type || s.status || s.hits);
}

/** "called Starfall" / "named the Pale Fang" → explicit name. */
export function explicitName(text: string): string | undefined {
  const m = /\b(?:called|named)\s+["“']?([a-z][a-z' -]{1,40})/i.exec(text);
  if (!m?.[1]) return undefined;
  return titleCase(m[1].trim().replace(/\s+(that|which|with|and)\b.*$/i, '')).slice(0, 32);
}

/** Build an Incantation from keywords. */
export function incantationFromWords(text: string, words: readonly string[]): RawIncantation {
  const s = readIncantationSignals(words);
  // Healing with no element named reads best as light.
  const element: Element = s.element ?? (s.status === 'heal' ? 'light' : 'physical');
  const shape: Shape = s.shape ?? (s.type ? TYPE_SHAPE[s.type] : 'orb');
  const type: IncantationType = s.type && s.type !== 'melee_combo' ? s.type : s.type === 'melee_combo' ? 'melee_combo' : SHAPE_TYPE[shape];
  const hits = s.hits ?? (hasAny(words, ['combo', 'flurry']) ? 3 : 1);

  const perHit = [24, 16, 14, 11, 9][Math.min(Math.max(hits, 1), 5) - 1] ?? 15;
  let damage = perHit;
  if (hasAny(words, POWER_UP)) damage = Math.round(damage * 1.6);
  if (hasAny(words, POWER_DOWN)) damage = Math.round(damage * 0.7);
  if (hasAny(words, FAST)) damage = Math.round(damage * 0.8);

  let radius = SHAPE_RADIUS[shape];
  if (hasAny(words, BIG)) radius += 2.5;
  if (hasAny(words, SMALL)) radius = Math.max(1, radius - 1.5);

  const status = statusFor(element, s.status, type);
  const cooldown = hasAny(words, FAST) ? 3 : hasAny(words, POWER_UP) ? 12 : 6;
  const chain = type === 'chain' ? (s.chain ?? 3) : 0;

  const look = ELEMENT_LOOK[element];
  const color = findKeyword(words, COLOR_WORDS) ?? look.color;
  const name = explicitName(text) ?? generatedName(element, shape, type);

  return {
    name,
    flavor: flavorFor(hits, shape, element),
    type,
    shape,
    hits,
    radius,
    damage_per_hit: damage,
    element,
    status_effect: status,
    chain_targets: chain,
    cooldown,
    mana_cost: 0,
    vfx: { color, trail: type === 'melee_combo' || type === 'dash' || type === 'projectile', particles: look.particles },
  };
}

/**
 * Apply a refinement ("make it ice", "add a burn", "remove the stun", "bigger", "more hits")
 * on top of the previous Incantation. Only what is mentioned changes.
 */
export function refineIncantation(text: string, words: readonly string[], base: IncantationSpec): RawIncantation {
  const s = readIncantationSignals(words);
  const next: RawIncantation = structuredClone(base);
  const removing = words[0] === 'remove' || hasAny(words, ['without', 'no']);

  if (s.element && !removing) {
    next.element = s.element;
    next.vfx.color = ELEMENT_LOOK[s.element].color;
    next.vfx.particles = ELEMENT_LOOK[s.element].particles;
    if (!s.status) next.status_effect = statusFor(s.element, undefined, next.type);
  }
  if (s.shape && !removing) {
    next.shape = s.shape;
    if (!s.type) next.type = SHAPE_TYPE[s.shape];
  }
  if (s.type && !removing) next.type = s.type;
  if (s.status) next.status_effect = removing ? { kind: 'none', dps: 0, duration: 0 } : statusFor(next.element, s.status, next.type);
  else if (removing && hasAny(words, ['effect', 'status'])) next.status_effect = { kind: 'none', dps: 0, duration: 0 };

  if (s.hits !== undefined) next.hits = s.hits;
  else if (hasAny(words, ['more', 'extra']) && hasAny(words, ['hit*', 'strike*'])) next.hits += 1;
  else if (hasAny(words, ['fewer', 'less']) && hasAny(words, ['hit*', 'strike*'])) next.hits -= 1;
  if (s.chain !== undefined && next.type === 'chain') next.chain_targets = s.chain;

  if (hasAny(words, ['bigger', 'wider', 'larger', 'huge*', 'big'])) next.radius += 1.5;
  if (hasAny(words, ['smaller', 'narrower', 'tighter'])) next.radius -= 1.5;
  if (hasAny(words, ['stronger', 'powerful', 'harder', 'deadlier', 'mightier'])) next.damage_per_hit = Math.round(next.damage_per_hit * 1.3);
  if (hasAny(words, ['weaker', 'softer', 'gentler'])) next.damage_per_hit = Math.round(next.damage_per_hit * 0.75);
  if (hasAny(words, ['faster', 'quicker'])) next.cooldown -= 2;
  if (hasAny(words, ['slower'])) next.cooldown += 3;
  const color = findKeyword(words, COLOR_WORDS);
  if (color) next.vfx.color = color;

  const renamed = explicitName(text);
  if (renamed) next.name = renamed;
  else if (s.element || s.shape || s.type) next.name = generatedName(next.element, next.shape, next.type);
  next.flavor = flavorFor(next.hits, next.shape, next.element);
  return next;
}

function statusFor(element: Element, explicit: StatusKind | undefined, type: IncantationType): IncantationSpec['status_effect'] {
  const kind = explicit ?? (type === 'buff' ? 'heal' : DEFAULT_STATUS[element].kind);
  switch (kind) {
    case 'burn':
      return { kind, dps: 4, duration: 3 };
    case 'freeze':
      return { kind, dps: 0, duration: 1.5 };
    case 'stun':
      return { kind, dps: 0, duration: 1 };
    case 'slow':
      return { kind, dps: 0, duration: 2 };
    case 'heal':
      return { kind, dps: 6, duration: 5 };
    case 'knockback':
      return { kind, dps: 0, duration: 0 };
    case 'none':
      return { kind, dps: 0, duration: 0 };
  }
}

function generatedName(element: Element, shape: Shape, type: IncantationType): string {
  return `${ELEMENT_LOOK[element].adjective} ${TYPE_NAME_NOUN[type] ?? NAME_NOUN[shape]}`;
}

function flavorFor(hits: number, shape: Shape, element: Element): string {
  const h = Math.min(Math.max(Math.round(hits), 1), 5);
  const [one, many] = SHAPE_NOUN[shape];
  return `${COUNT_WORDS[h - 1]} ${h === 1 ? one : many} ${ELEMENT_LOOK[element].phrase}.`;
}

/**
 * Requests the Spire cannot grant as said. Each maps to the closest allowed Incantation
 * (CLAUDE.md: map unknown values to the nearest valid one; the Arbiter bans instant kills)
 * plus one in-character sentence explaining the change.
 */
/** Turning foes into creatures (or stone). Elements ("turns enemies into ice") are not transformations. */
const TRANSFORM = ['frog*', 'toad*', 'sheep', 'chicken*', 'pig', 'pigs', 'newt*', 'rabbit*', 'mouse', 'mice', 'polymorph*', 'transmut*', 'petrif*'];
const PETRIFY = ['petrif*', 'statue*', 'stone'];
const KILL = ['kill*', 'slay*', 'destroy*', 'annihilat*', 'obliterat*', 'erase*', 'wipe*', 'death', 'die'];
const INSTANT = ['instant*', 'everything', 'everyone', 'all', 'oneshot', 'immediately'];
const TIME_STOP = ['time'];
const INVULNERABLE = ['invincib*', 'invulnerab*', 'immortal*', 'unkillable', 'godmode'];

/** True for requests like "kill everything instantly" that carry no element/shape words. */
export function isImpossibleAbility(words: readonly string[]): boolean {
  return (hasAny(words, KILL) && hasAny(words, INSTANT)) || hasAny(words, TRANSFORM) || hasAny(words, INVULNERABLE);
}

/** Adjust an Incantation built from impossible words; returns the Arbiter's sentence, if any. */
export function boundImpossible(words: readonly string[], inc: RawIncantation): string | undefined {
  if (hasAny(words, KILL) && hasAny(words, INSTANT)) {
    // The strongest wide blast the Arbiter permits: it will set a long cooldown.
    Object.assign(inc, {
      type: 'area',
      shape: 'circle',
      hits: 1,
      radius: 8,
      damage_per_hit: 60,
      status_effect: { kind: 'none', dps: 0, duration: 0 },
      cooldown: 30,
    });
    if (inc.element === 'physical') {
      inc.element = 'light';
      inc.vfx.color = ELEMENT_LOOK.light.color;
      inc.vfx.particles = ELEMENT_LOOK.light.particles;
    }
    inc.name = `${ELEMENT_LOOK[inc.element].adjective} Judgement`;
    inc.flavor = 'One vast ring of power. Mighty, but nothing in the Spire dies in an instant.';
    return 'No Incantation may end a life in an instant, Incanter. The Arbiter grants you a mighty blast instead.';
  }
  if (hasAny(words, TRANSFORM)) {
    const petrify = hasAny(words, PETRIFY);
    inc.status_effect = petrify ? { kind: 'freeze', dps: 0, duration: 2.5 } : { kind: 'stun', dps: 0, duration: 2 };
    if (inc.element === 'physical') {
      inc.element = 'shadow';
      inc.vfx.color = '#7dd36b';
      inc.vfx.particles = 'smoke';
    }
    inc.name = petrify ? 'Gorgon’s Glance' : 'Hex of the Mire';
    inc.flavor = petrify ? 'A curse that locks foes in stone for a moment.' : 'A croaking curse that leaves foes stunned and witless.';
    return petrify
      ? 'The Spire will not turn flesh to stone for good; your foes are frozen a moment instead.'
      : 'The Spire cannot remake flesh, Incanter; your foes are stunned as if they had forgotten their shape.';
  }
  if (hasAny(words, TIME_STOP) && inc.status_effect.kind === 'freeze') {
    inc.status_effect = { kind: 'freeze', dps: 0, duration: 3 };
    return 'Time itself will not bend, Incanter, but whatever your blade touches will.';
  }
  if (hasAny(words, INVULNERABLE)) {
    Object.assign(inc, { type: 'buff', shape: 'circle', status_effect: { kind: 'stun', dps: 0, duration: 3 }, damage_per_hit: 5, hits: 1 });
    inc.name = 'Fleeting Aegis';
    inc.flavor = 'A ward that holds for three heartbeats, no longer.';
    return 'No one is untouchable in the Spire for long. The Arbiter grants you three seconds.';
  }
  return undefined;
}
