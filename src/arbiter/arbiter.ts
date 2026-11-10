import { IncantationSpec, RANGES } from '../schemas/incantationSpec';
import { damageMultiplier, effectPower, powerScore } from './powerScore';

/** Cooldown seconds per point of power (Arbiter rule 3). */
export const POWER_PER_COOLDOWN_SECOND = 14;
export const MAX_COOLDOWN = 60;
export const MANA_PER_POWER = 0.2;

/**
 * Rule 2 ("ban instant kills, invulnerability over 3 s and self-buffs over +50%") mapped onto the
 * fields IncantationSpec actually has. These thresholds are ours, not the design spec's:
 * - instant kill: single-cast burst d × h × (1 + 0.5c) above this is cut back
 * - invulnerability: a self-buff that freezes/stuns (untouchable) lasts at most 3 s
 * - self-buff +50%: a healing buff restores at most half of the Incanter's 100 HP
 */
export const MAX_BURST = 200;
export const MAX_INVULNERABILITY = 3;
export const MAX_SELF_HEAL = 50;

export interface Judgement {
  incantation: IncantationSpec;
  /** Power score after all rules. */
  power: number;
  /** Always true: the Arbiter adjusts rather than rejects. */
  accepted: boolean;
  /** Short phrases, one per change, for logs / UI. */
  changes: string[];
  /** One templated sentence (rule 6). */
  sentence: string;
}

const NUMERIC_FIELDS = ['hits', 'radius', 'damage_per_hit', 'chain_targets', 'cooldown'] as const;

/**
 * The Arbiter: deterministic balancing after the LLM (or the mock parser). Pure function.
 * Takes raw or already-parsed input; returns the balanced Incantation and one sentence.
 */
export function judge(input: unknown): Judgement {
  const parsed = IncantationSpec.safeParse(input);
  // A non-object can't become an Incantation; the caller should not get here, but stay safe.
  const spec: IncantationSpec = parsed.success ? structuredClone(parsed.data) : IncantationSpec.parse({});
  const changes: string[] = [];

  // Rule 1: clamp every field (done by the schema) and report what moved.
  if (input && typeof input === 'object') {
    const raw = input as Record<string, unknown>;
    for (const key of NUMERIC_FIELDS) {
      const v = Number(raw[key]);
      if (Number.isFinite(v) && Math.abs(v - spec[key]) > 1e-9 && key !== 'cooldown') {
        changes.push(`${label(key)} ${v > spec[key] ? 'capped at' : 'raised to'} ${fmt(spec[key])}`);
      }
    }
  }

  // Rule 2: banned effects → closest allowed.
  const burstFactor = spec.hits * (1 + 0.5 * spec.chain_targets);
  if (spec.damage_per_hit * burstFactor > MAX_BURST) {
    const before = spec.damage_per_hit;
    spec.damage_per_hit = Math.max(RANGES.damage_per_hit[0], Math.floor(MAX_BURST / burstFactor));
    changes.push(`no instant kills: damage reduced by ${pct(before, spec.damage_per_hit)}%`);
  }
  const se = spec.status_effect;
  if (spec.type === 'buff' && (se.kind === 'freeze' || se.kind === 'stun') && se.duration > MAX_INVULNERABILITY) {
    se.duration = MAX_INVULNERABILITY;
    changes.push(`invulnerability limited to ${MAX_INVULNERABILITY} s`);
  }
  if (spec.type === 'buff' && se.kind === 'heal' && se.dps * se.duration > MAX_SELF_HEAL) {
    se.dps = Math.round((MAX_SELF_HEAL / Math.max(se.duration, 1)) * 10) / 10;
    if (se.duration < 1) se.duration = 1;
    changes.push(`healing limited to ${MAX_SELF_HEAL} HP`);
  }
  if (se.kind === 'none' || se.kind === 'knockback') {
    se.dps = 0;
    if (se.kind === 'none') se.duration = 0;
  }

  // Rules 3 + 4: cooldown follows power; scale damage if even 60 s is not enough.
  const maxPower = MAX_COOLDOWN * POWER_PER_COOLDOWN_SECOND;
  if (powerScore(spec) > maxPower) {
    const before = spec.damage_per_hit;
    const allowed = Math.floor((maxPower - effectPower(spec)) / damageMultiplier(spec));
    spec.damage_per_hit = Math.max(RANGES.damage_per_hit[0], Math.min(before, allowed));
    if (spec.damage_per_hit < before) changes.push(`damage reduced by ${pct(before, spec.damage_per_hit)}%`);
  }
  const power = powerScore(spec);
  const requested = spec.cooldown;
  const minCooldown = Math.min(MAX_COOLDOWN, Math.ceil(power / POWER_PER_COOLDOWN_SECOND));
  spec.cooldown = Math.min(MAX_COOLDOWN, Math.max(requested, minCooldown));
  if (spec.cooldown > requested) changes.push(`cooldown raised to ${fmt(spec.cooldown)} s`);

  // Rule 5.
  spec.mana_cost = Math.round(power * MANA_PER_POWER);

  // Rule 6: one sentence, no LLM.
  const sentence = changes.length
    ? `The Spire resists such power: ${joinPhrases(changes)}.`
    : `The Spire accepts ${spec.name}.`;

  return { incantation: spec, power, accepted: true, changes, sentence };
}

function label(key: (typeof NUMERIC_FIELDS)[number]): string {
  return { hits: 'hits', radius: 'radius', damage_per_hit: 'damage', chain_targets: 'chain targets', cooldown: 'cooldown' }[key];
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pct(before: number, after: number): number {
  return Math.round((1 - after / before) * 100);
}

function joinPhrases(p: string[]): string {
  return p.length <= 2 ? p.join(' and ') : `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`;
}
