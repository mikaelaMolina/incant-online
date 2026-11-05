import * as THREE from 'three';
import { RAPIER } from '../game/physics';
import { INCANTER_CENTER_Y, type Incanter } from '../game/player';
import type { Enemy } from '../enemies/enemy';
import type { IncantationSpec } from '../schemas/incantationSpec';
import { STATIC_ONLY } from './projectiles';
import { distanceToSegment } from './hitDetection';
import { inArea, MAX_AIM_DISTANCE, planCast, type CastPlan, type HitArea } from './castPlan';
import { CastResources } from './mana';
import { paletteFor, STATUS_PARTICLES, type Palette } from '../vfx/palette';
import type { AuraHandle, BeamHandle, ProjectileHandle, Vfx } from '../vfx/presets';

export interface RunnerContext {
  world: RAPIER.World;
  incanter: Incanter;
  vfx: Vfx;
}

export type CastOutcome =
  | { ok: true }
  | { ok: false; reason: 'cooldown' | 'mana' | 'dead' | 'no-target'; message: string };

/** One Incantation in flight. step() runs on the fixed physics step; returns true when finished. */
interface ActiveCast {
  step(dt: number): boolean;
  render?(dt: number): void;
  dispose(): void;
}

/** Everything one cast needs to resolve hits. */
interface CastState {
  spec: IncantationSpec;
  plan: CastPlan;
  palette: Palette;
  /** Locked aim direction at cast time (unit, ground plane). */
  dir: THREE.Vector3;
  yaw: number;
}

const STATUS_EMIT_INTERVAL = 0.12;

/**
 * Casts IncantationSpecs: checks cooldown + mana, then runs the delivery for its type with hits
 * shaped by its shape. Works for any parsed spec; expects the Arbiter to have balanced it first.
 */
export class IncantationRunner {
  readonly resources = new CastResources();
  private active: ActiveCast[] = [];
  private enemies: readonly Enemy[] = [];
  private heals: { perSecond: number; remaining: number }[] = [];
  private statusEmit = 0;
  private time = 0;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  constructor(private readonly ctx: RunnerContext) {}

  /** The enemies Incantations can hit (updated whenever the list changes). */
  setTargets(enemies: readonly Enemy[]): void {
    this.enemies = enemies;
  }

  /** Try to cast. Nothing is spent unless the cast actually starts. */
  cast(spec: IncantationSpec): CastOutcome {
    const { incanter } = this.ctx;
    if (!incanter.alive) return { ok: false, reason: 'dead', message: 'The fallen cannot recite.' };

    const block = this.resources.check(spec.name, spec.mana_cost);
    if (block?.reason === 'cooldown') {
      return { ok: false, reason: 'cooldown', message: `${spec.name} is still recharging (${block.remaining.toFixed(1)} s).` };
    }
    if (block?.reason === 'mana') {
      return { ok: false, reason: 'mana', message: `Not enough mana for ${spec.name}: ${block.missing} more needed.` };
    }

    const plan = planCast(spec);
    const dir = incanter.aimDirection();
    const state: CastState = { spec, plan, palette: paletteFor(spec), dir, yaw: Math.atan2(dir.x, dir.z) };

    // A chain needs someone to strike first; refuse before paying.
    if (plan.type === 'chain' && !this.chainPrimary(plan)) {
      return { ok: false, reason: 'no-target', message: `No foe within reach of ${spec.name}.` };
    }

    this.resources.spend(spec.name, spec.mana_cost, spec.cooldown);
    incanter.faceDirection(dir);
    if (plan.selfHeal.perSecond > 0) this.heals.push({ perSecond: plan.selfHeal.perSecond, remaining: plan.selfHeal.duration });
    this.active.push(this.deliver(state));
    return { ok: true };
  }

  fixedUpdate(dt: number): void {
    this.time += dt;
    this.resources.update(dt);
    const { incanter } = this.ctx;

    for (const h of this.heals) {
      const step = Math.min(dt, h.remaining);
      incanter.health.heal(h.perSecond * step);
      h.remaining -= dt;
    }
    this.heals = this.heals.filter((h) => h.remaining > 0);

    const finished = this.active.filter((c) => c.step(dt));
    if (finished.length) {
      for (const c of finished) c.dispose();
      this.active = this.active.filter((c) => !finished.includes(c));
    }
  }

  /** Per render frame: move long-lived visuals and emit status particles. */
  render(dt: number): void {
    for (const c of this.active) c.render?.(dt);

    const { vfx, incanter } = this.ctx;
    this.statusEmit -= dt;
    if (this.statusEmit <= 0) {
      this.statusEmit = STATUS_EMIT_INTERVAL;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const s = e.status.dominant;
        if (s === 'burn' || s === 'freeze' || s === 'stun' || s === 'slow') {
          const p = STATUS_PARTICLES[s];
          vfx.particles.emit(p.kind, e.physicsPosition, { count: 3, color: p.color, spread: e.radius });
        }
      }
      if (this.heals.length && incanter.alive) vfx.healPulse(incanter.physicsPosition);
    }
  }

  /** Stop everything in flight (floor change, the Incanter falls). */
  clear(): void {
    for (const c of this.active) c.dispose();
    this.active = [];
    this.heals = [];
  }

  /** clear() plus full mana and no cooldowns (revive). */
  reset(): void {
    this.clear();
    this.resources.reset();
  }

  get activeCasts(): number {
    return this.active.length;
  }

  // --- Hit resolution -------------------------------------------------------------------------

  private livingEnemies(): Enemy[] {
    return this.enemies.filter((e) => e.alive);
  }

  /** Deal one hit (scaled) to one enemy, apply the status, show the impact. */
  private strike(s: CastState, target: Enemy, from: THREE.Vector3, scale = 1): void {
    if (!target.alive) return;
    const se = s.spec.status_effect;
    target.takeHit(s.spec.damage_per_hit * scale, from, s.plan.knockback * Math.max(0.5, scale));
    if (se.kind !== 'heal') target.applyStatus(se);
    this.ctx.vfx.impact(chest(target), s.palette);
  }

  /**
   * From an enemy just hit, jump to up to chain.targets more (nearest first, each once),
   * each at chain.falloff damage. `struck` holds everyone already hit by this hit.
   */
  private chainFrom(s: CastState, first: Enemy, struck: Set<Enemy>): void {
    const { targets, jumpRange, falloff } = s.plan.chain;
    let current = first;
    for (let j = 0; j < targets; j++) {
      let best: Enemy | undefined;
      let bestD = jumpRange;
      for (const e of this.livingEnemies()) {
        if (struck.has(e)) continue;
        const d = Math.hypot(e.physicsPosition.x - current.physicsPosition.x, e.physicsPosition.z - current.physicsPosition.z);
        if (d <= bestD) {
          bestD = d;
          best = e;
        }
      }
      if (!best) return;
      struck.add(best);
      this.ctx.vfx.bolt(chest(current), chest(best), s.palette, 0.04);
      this.strike(s, best, current.physicsPosition, falloff);
      current = best;
    }
  }

  /** Hit everyone inside an area once, then chain from the one nearest the origin. Returns hit count. */
  private hitArea(s: CastState, area: HitArea, origin: THREE.Vector3, dir: THREE.Vector3, struck = new Set<Enemy>()): number {
    let nearest: Enemy | undefined;
    let nearestD = Infinity;
    let count = 0;
    for (const e of this.livingEnemies()) {
      if (struck.has(e) || !inArea(area, origin, dir, e.physicsPosition, e.radius)) continue;
      struck.add(e);
      this.strike(s, e, origin);
      count++;
      const d = Math.hypot(e.physicsPosition.x - origin.x, e.physicsPosition.z - origin.z);
      if (d < nearestD) {
        nearestD = d;
        nearest = e;
      }
    }
    if (nearest) this.chainFrom(s, nearest, struck);
    return count;
  }

  /** Static geometry distance along a ground ray at chest height (beams, walls). */
  private clearDistance(origin: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: dir.x, y: 0, z: dir.z };
    const hit = this.ctx.world.castRay(this.ray, max, true, STATIC_ONLY);
    return hit ? hit.timeOfImpact : max;
  }

  /** The enemy a chain strikes first: nearest to the aim point, within reach of the caster. */
  private chainPrimary(plan: CastPlan, exclude?: Set<Enemy>): Enemy | undefined {
    const { incanter } = this.ctx;
    const me = incanter.physicsPosition;
    let best: Enemy | undefined;
    let bestD = Infinity;
    for (const e of this.livingEnemies()) {
      if (exclude?.has(e)) continue;
      const reach = Math.hypot(e.physicsPosition.x - me.x, e.physicsPosition.z - me.z);
      if (reach > plan.chain.reach + e.radius) continue;
      const d = Math.hypot(e.physicsPosition.x - incanter.aimPoint.x, e.physicsPosition.z - incanter.aimPoint.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // --- Deliveries (one per type) --------------------------------------------------------------

  private deliver(s: CastState): ActiveCast {
    switch (s.plan.type) {
      case 'melee_combo':
        return this.melee(s);
      case 'area':
        return this.area(s);
      case 'projectile':
        return this.projectiles(s);
      case 'beam':
        return this.beam(s);
      case 'chain':
        return this.chain(s);
      case 'buff':
        return this.buff(s);
      case 'dash':
        return this.dash(s);
    }
  }

  /** `hits` swings around the Incanter in the locked direction, alternating sides. */
  private melee(s: CastState): ActiveCast {
    const { incanter, vfx } = this.ctx;
    const { plan } = s;
    return this.timedHits(plan, (i) => {
      const origin = incanter.physicsPosition;
      vfx.shapeHit(plan.shape, plan.area, origin, s.yaw, incanter.feetY, s.palette, i % 2 === 1);
      this.hitArea(s, plan.area, origin, s.dir);
    });
  }

  /** Pulses centred on the Incanter (or, for orbs, on the aim point after a telegraph). */
  private area(s: CastState): ActiveCast {
    const { incanter, vfx } = this.ctx;
    const { plan } = s;
    const me = incanter.physicsPosition;
    const origin = me.clone();
    if (plan.anchor === 'aim') {
      const toAim = new THREE.Vector3(incanter.aimPoint.x - me.x, 0, incanter.aimPoint.z - me.z);
      if (toAim.length() > MAX_AIM_DISTANCE) toAim.setLength(MAX_AIM_DISTANCE);
      origin.add(toAim);
      vfx.telegraph(new THREE.Vector3(origin.x, incanter.feetY, origin.z), areaRadius(plan.area), plan.delay, s.palette);
    }
    const feetY = incanter.feetY;
    return this.timedHits(plan, () => {
      // Caster-anchored areas follow the Incanter between pulses.
      const o = plan.anchor === 'caster' ? incanter.physicsPosition : origin;
      vfx.shapeHit(plan.shape, plan.area, o, s.yaw, plan.anchor === 'caster' ? incanter.feetY : feetY, s.palette);
      this.hitArea(s, plan.area, o, s.dir);
    });
  }

  private projectiles(s: CastState): ActiveCast {
    const { incanter, vfx } = this.ctx;
    const pp = s.plan.projectile!;
    interface Shot {
      pos: THREE.Vector3;
      prev: THREE.Vector3;
      dir: THREE.Vector3;
      travelled: number;
      hit: Set<Enemy>;
      visual: ProjectileHandle;
      alive: boolean;
    }
    const shots: Shot[] = [];
    let fired = 0;
    let t = 0;
    let visualTime = 0;

    const fire = (dir: THREE.Vector3): void => {
      const me = incanter.physicsPosition;
      const pos = new THREE.Vector3(me.x, me.y, me.z).addScaledVector(dir, 0.6);
      const visual = vfx.projectile(s.plan.shape, s.palette, pp.hitRadius);
      visual.set(pos, Math.atan2(dir.x, dir.z), 0);
      shots.push({ pos, prev: pos.clone(), dir: dir.clone(), travelled: 0, hit: new Set(), visual, alive: true });
      vfx.impact(pos, s.palette); // muzzle flash
    };

    const explode = (shot: Shot, at: THREE.Vector3): void => {
      const area: HitArea = { kind: 'circle', radius: pp.explodeRadius, offset: 0 };
      vfx.orbBurst(at, Math.max(0.8, pp.explodeRadius * 0.6), s.palette);
      vfx.shockwave(new THREE.Vector3(at.x, incanter.feetY, at.z), pp.explodeRadius, s.palette);
      this.hitArea(s, area, at, shot.dir, shot.hit);
      shot.alive = false;
    };

    return {
      step: (dt) => {
        t += dt;
        // Fire: a fan all at once (cone), or one after another toward the current aim.
        while (fired < s.plan.hits && t >= fired * s.plan.interval) {
          if (pp.volleySpread > 0) {
            for (let i = 0; i < s.plan.hits; i++) {
              const a = s.yaw + (s.plan.hits === 1 ? 0 : (i / (s.plan.hits - 1) - 0.5) * pp.volleySpread);
              fire(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
            }
            fired = s.plan.hits;
          } else {
            const aim = incanter.aimDirection();
            const wobble = fired === 0 ? 0 : (fired % 2 === 1 ? 1 : -1) * 0.05;
            const a = Math.atan2(aim.x, aim.z) + wobble;
            fire(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
            fired++;
          }
        }

        for (const shot of shots) {
          if (!shot.alive) continue;
          shot.prev.copy(shot.pos);
          const stepLen = pp.speed * dt;
          shot.pos.addScaledVector(shot.dir, stepLen);
          shot.travelled += stepLen;

          // Walls and props.
          const free = this.clearDistance(shot.prev, shot.dir, stepLen);
          if (free < stepLen) {
            shot.pos.copy(shot.prev).addScaledVector(shot.dir, free);
            if (pp.explodeRadius > 0) explode(shot, shot.pos);
            else {
              vfx.impact(shot.pos, s.palette);
              shot.alive = false;
            }
            continue;
          }

          // Enemies (swept, so fast shots can't tunnel through).
          for (const e of this.livingEnemies()) {
            if (shot.hit.has(e)) continue;
            if (distanceToSegment(e.physicsPosition, shot.prev, shot.pos) > pp.hitRadius + e.radius) continue;
            if (pp.explodeRadius > 0 && !pp.pierce) {
              explode(shot, e.physicsPosition.clone());
              break;
            }
            shot.hit.add(e);
            this.strike(s, e, shot.prev);
            this.chainFrom(s, e, shot.hit);
            if (!pp.pierce) {
              shot.alive = false;
              break;
            }
          }

          if (shot.alive && shot.travelled >= pp.range) {
            if (pp.explodeRadius > 0) explode(shot, shot.pos);
            else shot.alive = false;
          }
        }
        for (const shot of shots) if (!shot.alive) shot.visual.object.visible = false;
        return fired >= s.plan.hits && shots.every((x) => !x.alive);
      },
      render: (dt) => {
        visualTime += dt;
        for (const shot of shots) {
          if (!shot.alive) continue;
          shot.visual.set(shot.pos, Math.atan2(shot.dir.x, shot.dir.z), visualTime);
          // Trails: dense when the spec asks for one, a light sprinkle otherwise.
          const n = s.palette.trail ? 3 : 1;
          vfx.particles.emit(s.palette.particles, shot.pos, { count: n, color: s.palette.primary, spread: 0.12, speedScale: 0.25 });
        }
      },
      dispose: () => {
        for (const shot of shots) shot.visual.dispose();
      },
    };
  }

  /** Channelled beam from the Incanter toward the (live) aim; spin sweeps one full turn per hit. */
  private beam(s: CastState): ActiveCast {
    const { incanter, vfx } = this.ctx;
    const bp = s.plan.beam!;
    const visual: BeamHandle = vfx.beam(s.palette, bp.coneHalfAngle);
    let t = 0;
    let landed = 0;
    let yaw = s.yaw;
    let length = bp.length;

    // Sweep: one turn per hit; each step damages the sector swept since the last step.
    let prevYaw = s.yaw;
    let turn = -1;
    const sweptThisTurn = new Set<Enemy>();

    const aimYaw = (): number => {
      if (bp.sweep) return s.yaw + (t / s.plan.interval) * Math.PI * 2;
      const d = incanter.aimDirection();
      return Math.atan2(d.x, d.z);
    };

    return {
      step: (dt) => {
        t += dt;
        yaw = aimYaw();
        const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const origin = incanter.physicsPosition;
        if (!bp.sweep) incanter.faceDirection(dir);
        length = bp.coneHalfAngle > 0 ? bp.length * 0.6 : this.clearDistance(origin, dir, bp.length);
        if (bp.sweep) {
          const nowTurn = Math.min(s.plan.hits - 1, Math.floor(t / s.plan.interval));
          if (nowTurn !== turn) {
            turn = nowTurn;
            sweptThisTurn.clear();
          }
          const mid = (prevYaw + yaw) / 2;
          const swept: HitArea = { kind: 'arc', range: bp.length, halfAngle: Math.abs(yaw - prevYaw) / 2 + 0.05 };
          const midDir = new THREE.Vector3(Math.sin(mid), 0, Math.cos(mid));
          this.hitArea(s, swept, origin, midDir, sweptThisTurn);
          prevYaw = yaw;
          return t >= bp.duration;
        }
        while (landed < s.plan.hits && t >= s.plan.delay + landed * s.plan.interval) {
          landed++;
          const area: HitArea =
            bp.coneHalfAngle > 0
              ? { kind: 'arc', range: length, halfAngle: bp.coneHalfAngle }
              : { kind: 'strip', length, halfWidth: bp.halfWidth };
          this.hitArea(s, area, origin, dir);
          const end = origin.clone().addScaledVector(dir, length);
          vfx.particles.emit(s.palette.particles, end, { count: 10, color: s.palette.primary, spread: 0.3 });
        }
        return t >= bp.duration && landed >= s.plan.hits;
      },
      render: () => {
        visual.set(incanter.position, yaw, length, bp.halfWidth, t);
        visual.object.visible = incanter.alive;
      },
      dispose: () => visual.dispose(),
    };
  }

  /** Lightning-style: strike the foe nearest the aim, then leap; `hits` waves. */
  private chain(s: CastState): ActiveCast {
    const { incanter, vfx } = this.ctx;
    const { plan } = s;
    return this.timedHits(plan, () => {
      const primary = this.chainPrimary(plan);
      if (!primary) return; // everyone died or moved away between waves
      const struck = new Set<Enemy>([primary]);
      const hand = incanter.physicsPosition.clone();
      hand.y += 0.3;
      vfx.bolt(hand, chest(primary), s.palette, 0.07);
      this.strike(s, primary, incanter.physicsPosition);
      // Area shapes splash around each link.
      const links: Enemy[] = [primary];
      const before = new Set(struck);
      this.chainFrom(s, primary, struck);
      for (const e of struck) if (!before.has(e)) links.push(e);
      if (plan.chain.splash > 0) {
        const splash: HitArea = { kind: 'circle', radius: plan.chain.splash, offset: 0 };
        for (const link of links) {
          vfx.shockwave(new THREE.Vector3(link.physicsPosition.x, incanter.feetY, link.physicsPosition.z), plan.chain.splash, s.palette);
          for (const e of this.livingEnemies()) {
            if (struck.has(e) || !inArea(splash, link.physicsPosition, s.dir, e.physicsPosition, e.radius)) continue;
            struck.add(e);
            this.strike(s, e, link.physicsPosition, plan.chain.falloff);
          }
        }
      }
    });
  }

  /** Aura around the Incanter: pulses `hits` times over its duration; freeze/stun also ward. */
  private buff(s: CastState): ActiveCast {
    const { incanter, vfx } = this.ctx;
    const { plan } = s;
    const bp = plan.buff!;
    const radius = areaRadius(plan.area);
    const visual: AuraHandle = vfx.aura(plan.shape, radius, plan.hits, s.palette);
    if (bp.ward > 0) incanter.ward(bp.ward);
    let t = 0;
    let landed = 0;
    const feet = new THREE.Vector3();
    return {
      step: (dt) => {
        t += dt;
        while (landed < plan.hits && t >= plan.delay + landed * plan.interval) {
          landed++;
          const me = incanter.physicsPosition;
          vfx.shockwave(new THREE.Vector3(me.x, incanter.feetY, me.z), radius, s.palette);
          this.hitArea(s, plan.area, me, s.dir);
        }
        return t >= bp.duration || !incanter.alive;
      },
      render: () => {
        feet.set(incanter.position.x, incanter.position.y - INCANTER_CENTER_Y, incanter.position.z);
        const fade = Math.min(1, (bp.duration - t) / 0.4, t / 0.15);
        visual.set(feet, t, Math.max(0, fade));
      },
      dispose: () => visual.dispose(),
    };
  }

  /** Dash toward the aim, hitting everything on the path, then (hits − 1) finishers of the shape. */
  private dash(s: CastState): ActiveCast {
    const { incanter, vfx } = this.ctx;
    const { plan } = s;
    const dp = plan.dash!;
    incanter.dash(s.dir, dp.distance, dp.duration);
    const start = incanter.physicsPosition.clone();
    const last = start.clone();
    const pathHit = new Set<Enemy>();
    let t = 0;
    let finishers = 0;
    let trailed = false;
    return {
      step: (dt) => {
        t += dt;
        const now = incanter.physicsPosition;
        // Path: anyone the dash passes through takes one hit.
        for (const e of this.livingEnemies()) {
          if (pathHit.has(e)) continue;
          if (distanceToSegment(e.physicsPosition, last, now) > dp.pathHalfWidth + e.radius) continue;
          pathHit.add(e);
          this.strike(s, e, last);
          this.chainFrom(s, e, pathHit);
        }
        last.copy(now);

        if (t >= dp.duration && !trailed) {
          trailed = true;
          vfx.dashTrail(start, now, s.palette, incanter.feetY);
        }
        while (t >= dp.duration && finishers < plan.hits - 1 && t >= plan.delay + finishers * plan.interval) {
          finishers++;
          vfx.shapeHit(plan.shape, plan.area, now, s.yaw, incanter.feetY, s.palette, finishers % 2 === 0);
          this.hitArea(s, plan.area, now, s.dir);
        }
        return t >= dp.duration && finishers >= plan.hits - 1;
      },
      render: () => {
        if (incanter.isCastDashing) {
          vfx.particles.emit(s.palette.particles, incanter.position, { count: s.palette.trail ? 4 : 2, color: s.palette.primary, spread: 0.3, speedScale: 0.3 });
        }
      },
      dispose: () => {},
    };
  }

  /** Run `onHit(i)` for i = 0 … hits−1 at delay + i × interval. */
  private timedHits(plan: CastPlan, onHit: (i: number) => void): ActiveCast {
    let t = 0;
    let landed = 0;
    return {
      step: (dt) => {
        t += dt;
        while (landed < plan.hits && t >= plan.delay + landed * plan.interval) {
          onHit(landed);
          landed++;
        }
        return landed >= plan.hits;
      },
      dispose: () => {},
    };
  }
}

function chest(e: Enemy): THREE.Vector3 {
  const p = e.physicsPosition;
  return new THREE.Vector3(p.x, p.y + e.height * 0.1, p.z);
}

function areaRadius(area: HitArea): number {
  return area.kind === 'circle' ? area.radius : area.kind === 'arc' ? area.range : area.length;
}
