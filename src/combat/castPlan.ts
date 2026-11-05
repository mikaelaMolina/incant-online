import type { IncantationSpec, IncantationType, Shape } from '../schemas/incantationSpec';
import { inArc, inRadius, inStrip, type Vec2 } from './hitDetection';

/**
 * Turns an IncantationSpec into concrete numbers for the runner: what area each hit covers,
 * how hits are spaced, and how the type delivers them. Pure (no Three/Rapier) so every
 * type × shape combination can be unit-tested.
 *
 * `type` decides HOW the hits are delivered (around the caster, by projectile, as a beam, …);
 * `shape` decides WHAT area each hit covers; `radius` scales that area.
 */

/** Area covered by one hit, relative to an origin and a facing direction on the ground. */
export type HitArea =
  | { kind: 'arc'; range: number; halfAngle: number }
  | { kind: 'circle'; radius: number; /** centre is this far ahead of the origin */ offset: number }
  | { kind: 'strip'; length: number; halfWidth: number };

export interface ProjectilePlan {
  speed: number;
  range: number;
  /** Collision radius of the projectile itself. */
  hitRadius: number;
  /** Keeps flying through enemies (each enemy is hit once per projectile). */
  pierce: boolean;
  /** > 0: explodes on contact / at the end of its range, hitting everyone in this radius. */
  explodeRadius: number;
  /** All hits fire at once in a fan of this total angle (radians); 0 = one after another. */
  volleySpread: number;
}

export interface BeamPlan {
  length: number;
  halfWidth: number;
  /** Total channel time; one hit lands every `interval`. */
  duration: number;
  /** spin: the beam sweeps a full turn around the caster. */
  sweep: boolean;
  /** cone: a widening flame-thrower arc instead of a straight strip. */
  coneHalfAngle: number;
}

export interface ChainPlan {
  /** Extra enemies a hit jumps to (chain_targets). */
  targets: number;
  /** Max distance of one jump. */
  jumpRange: number;
  /** Damage multiplier for each jump (matches the Arbiter's 0.5 × c weighting). */
  falloff: number;
  /** chain type only: how far from the caster the first target may be. */
  reach: number;
  /** chain type with an area shape: splash radius around each link (0 = none). */
  splash: number;
}

export interface DashPlan {
  distance: number;
  duration: number;
  /** Width of the path that hits enemies on the way. */
  pathHalfWidth: number;
}

export interface BuffPlan {
  /** How long the aura lasts. */
  duration: number;
  /** freeze / stun self-buff: the Incanter can't be hurt for this long (Arbiter caps it at 3 s). */
  ward: number;
}

export interface CastPlan {
  type: IncantationType;
  shape: Shape;
  hits: number;
  /** Seconds between hits. */
  interval: number;
  /** Seconds before the first hit lands. */
  delay: number;
  /** Area of one hit (melee, area pulses, buff aura, dash finisher, chain splash). */
  area: HitArea;
  /** area type: centred on the aim point (orb) or on the caster. */
  anchor: 'caster' | 'aim';
  knockback: number;
  /** Heal-over-time for the Incanter (status heal on any type): HP per second and seconds. */
  selfHeal: { perSecond: number; duration: number };
  chain: ChainPlan;
  projectile?: ProjectilePlan;
  beam?: BeamPlan;
  dash?: DashPlan;
  buff?: BuffPlan;
}

const DEG = Math.PI / 180;
/** Max distance from the caster to a ground-targeted (area + orb) centre. */
export const MAX_AIM_DISTANCE = 14;
export const BASE_KNOCKBACK = 2;
export const STRONG_KNOCKBACK = 10;

/** One hit's area for a shape at a given radius (1–8 m). */
export function hitAreaFor(shape: Shape, radius: number): HitArea {
  const r = clamp(radius, 1, 8);
  switch (shape) {
    case 'slash':
      return { kind: 'arc', range: Math.max(2, r), halfAngle: 65 * DEG };
    case 'thrust':
      return { kind: 'strip', length: r + 1.5, halfWidth: 0.6 };
    case 'spin':
    case 'circle':
      return { kind: 'circle', radius: r, offset: 0 };
    case 'cone':
      return { kind: 'arc', range: Math.min(10, r * 1.5 + 1), halfAngle: 30 * DEG };
    case 'line':
      return { kind: 'strip', length: Math.min(18, 2 * r + 2), halfWidth: 0.5 };
    case 'orb':
      return { kind: 'circle', radius: Math.max(1, r * 0.6), offset: Math.max(1, r * 0.6) + 0.5 };
  }
}

/** Is a target (ground position + body radius) inside a hit area placed at origin/facing? */
export function inArea(area: HitArea, origin: Vec2, facing: Vec2, target: Vec2, targetRadius: number): boolean {
  switch (area.kind) {
    case 'arc':
      return inArc(origin, facing, target, targetRadius, area.range, area.halfAngle);
    case 'circle': {
      const centre = areaCentre(area, origin, facing);
      return inRadius(centre, area.radius, target, targetRadius);
    }
    case 'strip':
      return inStrip(origin, facing, target, targetRadius, area.length, area.halfWidth);
  }
}

/** Where a circle area is centred (others are anchored at the origin). */
export function areaCentre(area: HitArea, origin: Vec2, facing: Vec2): Vec2 {
  if (area.kind !== 'circle' || area.offset === 0) return { x: origin.x, z: origin.z };
  const fl = Math.hypot(facing.x, facing.z) || 1;
  return { x: origin.x + (facing.x / fl) * area.offset, z: origin.z + (facing.z / fl) * area.offset };
}

/** Rough reach of an area from its origin (for VFX sizing and AI hints). */
export function areaReach(area: HitArea): number {
  switch (area.kind) {
    case 'arc':
      return area.range;
    case 'circle':
      return area.offset + area.radius;
    case 'strip':
      return area.length;
  }
}

function projectileFor(shape: Shape, radius: number, hits: number): ProjectilePlan {
  const r = clamp(radius, 1, 8);
  const base: ProjectilePlan = { speed: 22, range: 20, hitRadius: 0.35, pierce: false, explodeRadius: 0, volleySpread: 0 };
  switch (shape) {
    case 'orb':
      return { ...base, hitRadius: 0.45, explodeRadius: Math.max(1, r * 0.6) };
    case 'slash':
      // A crescent wave that cuts through everything in its path.
      return { ...base, speed: 18, range: 14, hitRadius: 0.4 + r * 0.25, pierce: true };
    case 'thrust':
    case 'line':
      // Lances: fast and piercing.
      return { ...base, speed: 32, range: 22, hitRadius: 0.3, pierce: true };
    case 'spin':
      // A spinning disc that bursts at the end.
      return { ...base, speed: 16, range: 16, hitRadius: 0.6, pierce: true, explodeRadius: r };
    case 'circle':
      return { ...base, speed: 20, hitRadius: 0.45, explodeRadius: r };
    case 'cone':
      // Shotgun fan: every hit at once, the fan widening with radius.
      return { ...base, speed: 24, range: Math.min(16, 6 + r * 1.5), volleySpread: hits > 1 ? (20 + r * 5) * DEG : 0 };
  }
}

function beamFor(shape: Shape, radius: number, hits: number): BeamPlan {
  const r = clamp(radius, 1, 8);
  return {
    length: Math.min(16, 8 + r),
    halfWidth: shape === 'thrust' ? 0.35 : shape === 'slash' ? 0.5 + r * 0.15 : 0.3 + r * 0.1,
    duration: Math.max(0.6, hits * 0.3),
    sweep: shape === 'spin',
    coneHalfAngle: shape === 'cone' ? 25 * DEG : 0,
  };
}

const AREA_SPLASH_SHAPES: readonly Shape[] = ['spin', 'circle', 'cone'];

/** Build the plan the runner executes. Expects an Arbiter-judged spec, but tolerates any parsed one. */
export function planCast(spec: IncantationSpec): CastPlan {
  const hits = clamp(Math.round(spec.hits), 1, 5);
  const r = clamp(spec.radius, 1, 8);
  const se = spec.status_effect;

  const plan: CastPlan = {
    type: spec.type,
    shape: spec.shape,
    hits,
    interval: 0.2,
    delay: 0.05,
    area: hitAreaFor(spec.shape, r),
    anchor: 'caster',
    knockback: se.kind === 'knockback' ? STRONG_KNOCKBACK : BASE_KNOCKBACK,
    selfHeal: se.kind === 'heal' ? { perSecond: se.dps, duration: Math.max(1, se.duration) } : { perSecond: 0, duration: 0 },
    chain: {
      targets: clamp(Math.round(spec.chain_targets), 0, 5),
      jumpRange: 5 + r * 0.5,
      falloff: 0.5,
      reach: 0,
      splash: 0,
    },
  };

  switch (spec.type) {
    case 'melee_combo':
      plan.interval = spec.shape === 'spin' ? 0.22 : 0.18;
      break;
    case 'area':
      plan.anchor = spec.shape === 'orb' ? 'aim' : 'caster';
      if (spec.shape === 'orb') plan.area = { kind: 'circle', radius: Math.max(1.5, r), offset: 0 };
      plan.delay = plan.anchor === 'aim' ? 0.35 : 0.1; // a beat to see where it lands
      plan.interval = 0.35;
      break;
    case 'projectile':
      plan.projectile = projectileFor(spec.shape, r, hits);
      plan.interval = plan.projectile.volleySpread > 0 ? 0 : 0.12;
      plan.delay = 0;
      break;
    case 'beam':
      plan.beam = beamFor(spec.shape, r, hits);
      plan.interval = plan.beam.duration / hits;
      plan.delay = Math.min(0.15, plan.interval);
      break;
    case 'chain':
      plan.chain.reach = 14;
      plan.chain.splash = AREA_SPLASH_SHAPES.includes(spec.shape) ? Math.max(1, r * 0.5) : 0;
      plan.interval = 0.28;
      plan.delay = 0;
      break;
    case 'buff': {
      const duration = se.kind === 'none' || se.kind === 'knockback' || se.duration <= 0 ? 4 : clamp(se.duration, 2, 10);
      plan.buff = { duration, ward: se.kind === 'freeze' || se.kind === 'stun' ? Math.min(3, se.duration) : 0 };
      plan.area = { kind: 'circle', radius: r, offset: 0 };
      plan.interval = duration / hits;
      plan.delay = plan.interval / 2;
      break;
    }
    case 'dash': {
      const distance = Math.min(12, 4 + r);
      plan.dash = { distance, duration: 0.18 + distance * 0.015, pathHalfWidth: 0.9 };
      // First hit is the path itself; the rest are a finisher with the shape at the destination.
      plan.delay = plan.dash.duration;
      plan.interval = 0.15;
      break;
    }
  }
  return plan;
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}
