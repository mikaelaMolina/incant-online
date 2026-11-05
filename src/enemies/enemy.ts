import * as THREE from 'three';
import { RAPIER } from '../game/physics';
import { Health } from '../combat/health';
import { inArc, inRadius } from '../combat/hitDetection';
import { STATIC_ONLY, type ProjectileSystem } from '../combat/projectiles';
import { StatusSet, type LastingStatus } from '../combat/statusEffects';
import { STATUS_TINT } from '../vfx/palette';
import type { StatusEffect } from '../schemas/incantationSpec';
import { INCANTER_RADIUS, type Incanter } from '../game/player';
import type { EnemySpec } from '../schemas/enemySpec';
import type { ArchetypeProfile } from './archetypes';
import type { EnemyVisual } from './enemyModel';
import { nextState, onEnter, type BehaviourParams, type EnemyState, type Memory } from './stateMachine';

const GRAVITY = -25;
const TURN_RATE = 10;
const LOS_INTERVAL = 0.2; // seconds between line-of-sight raycasts
const HIT_FLASH = 0.12;
const KNOCK_DECAY = 7;
const CORPSE_SINK_AFTER = 2.5;
const CORPSE_GONE_AFTER = 4;
/** No attacks right after spawning (or a reset), so the Incanter can get their bearings. */
const SPAWN_GRACE = 2;

export interface EnemyContext {
  world: RAPIER.World;
  scene: THREE.Scene;
  player: Incanter;
  projectiles: ProjectileSystem;
}

let nextId = 1;

/** One enemy: kinematic capsule + character controller, driven by the idle/chase/attack/flee state machine. */
export class Enemy {
  readonly uid = nextId++;
  readonly health: Health;
  /** Burn / freeze / stun / slow from Incantations. */
  readonly status = new StatusSet();
  readonly root = new THREE.Group();
  /** Interpolated render position (feet). */
  readonly position = new THREE.Vector3();
  state: EnemyState = 'idle';
  /** True once the corpse has been removed. */
  gone = false;

  private readonly params: BehaviourParams;
  private readonly mem: Memory = { hasFled: false };
  private timeInState = 0;

  private body: RAPIER.RigidBody | undefined;
  private collider: RAPIER.Collider | undefined;
  private controller: RAPIER.KinematicCharacterController | undefined;
  private readonly halfHeight: number;

  private readonly home = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly facing = new THREE.Vector3(0, 0, 1);
  private yaw = 0;
  private vy = 0;
  private grounded = false;
  private readonly knock = new THREE.Vector3();

  private attackCooldown = SPAWN_GRACE + Math.random();
  private attackFired = false;
  private provoked = false;
  private hitFlash = 0;
  private canSee = false;
  private losTimer = Math.random() * LOS_INTERVAL; // stagger raycasts between enemies
  private deadTime = 0;

  private readonly telegraph: THREE.Mesh;
  private readonly telegraphMat: THREE.MeshBasicMaterial;
  private readonly blob: THREE.Mesh;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private readonly tmp = new THREE.Vector3();

  constructor(
    readonly spec: EnemySpec,
    readonly profile: ArchetypeProfile,
    private readonly visual: EnemyVisual,
    private readonly ctx: EnemyContext,
    spawnFeet: THREE.Vector3,
    yaw: number,
  ) {
    this.health = new Health(spec.hp);
    this.params = {
      aggroRange: spec.aggro_range,
      leashRange: Math.max(spec.aggro_range * 1.8, profile.attackRange + 4),
      attackRange: profile.attackRange,
      attackDuration: profile.windup + profile.recovery,
      fleeThreshold: spec.flee_threshold,
      fleeDuration: profile.fleeDuration,
    };

    // Physics capsule, centre at feet + height/2.
    const r = profile.radius;
    this.halfHeight = Math.max(0.05, profile.height / 2 - r);
    const cy = spawnFeet.y + profile.height / 2 + 0.05;
    const { world } = ctx;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawnFeet.x, cy, spawnFeet.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(this.halfHeight, r), this.body);
    this.controller = world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.controller.enableAutostep(0.35, 0.2, false);
    this.controller.enableSnapToGround(0.3);

    this.home.set(spawnFeet.x, cy, spawnFeet.z);
    this.prevPos.copy(this.home);
    this.currPos.copy(this.home);
    this.yaw = yaw;

    // Visual + blob shadow + attack telegraph.
    this.root.add(visual.object);
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(r * 1.3, 20),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.02;

    this.telegraphMat = new THREE.MeshBasicMaterial({
      color: profile.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.telegraph = new THREE.Mesh(telegraphGeometry(profile), this.telegraphMat);
    this.telegraph.visible = false;
    this.telegraph.position.y = 0.03;

    ctx.scene.add(this.root, this.blob, this.telegraph);
    visual.play('idle');
    this.syncRender(1);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get radius(): number {
    return this.profile.radius;
  }

  get height(): number {
    return this.profile.height;
  }

  /** Latest physics position (capsule centre). */
  get physicsPosition(): THREE.Vector3 {
    return this.currPos;
  }

  /** Called by the Incanter's attacks. */
  takeHit(amount: number, from: THREE.Vector3, knockback: number): void {
    if (!this.alive) return;
    this.health.damage(amount);
    this.provoked = true;
    this.hitFlash = HIT_FLASH;
    const away = this.tmp.set(this.currPos.x - from.x, 0, this.currPos.z - from.z);
    if (away.lengthSq() > 1e-6) this.knock.copy(away.normalize().multiplyScalar(knockback * (1 - this.profile.poise)));
    if (this.state !== 'attack' && !this.health.dead) this.visual.play('hit', { once: true });
  }

  /** Apply an Incantation's status effect. Freeze / stun interrupt an attack wind-up. */
  applyStatus(effect: StatusEffect): LastingStatus | undefined {
    if (!this.alive) return undefined;
    const applied = this.status.apply(effect);
    if (this.status.immobile && this.state === 'attack' && !this.attackFired) this.setState('chase');
    return applied;
  }

  /** Back to the spawn point at full health (used when the Incanter falls). */
  reset(): void {
    if (!this.alive || !this.body) return;
    this.health.reset();
    this.status.clear();
    this.mem.hasFled = false;
    this.knock.set(0, 0, 0);
    this.body.setTranslation({ x: this.home.x, y: this.home.y, z: this.home.z }, true);
    this.body.setNextKinematicTranslation({ x: this.home.x, y: this.home.y, z: this.home.z });
    this.prevPos.copy(this.home);
    this.currPos.copy(this.home);
    this.attackCooldown = SPAWN_GRACE;
    this.setState('idle');
  }

  fixedUpdate(dt: number): void {
    this.timeInState += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    if (this.state === 'dead') {
      this.deadTime += dt;
      if (this.deadTime > CORPSE_GONE_AFTER) this.gone = true;
      return;
    }

    const burn = this.status.tick(dt);
    if (burn > 0) {
      this.health.damage(burn);
      this.provoked = true;
    }

    // Frozen / stunned: no thinking, no attacking; only knockback and gravity move the body.
    if (this.status.immobile) {
      if (this.health.dead) {
        this.setState('dead');
        return;
      }
      this.moveBy(0, 0, 0, dt);
      return;
    }

    const player = this.ctx.player;
    const pp = player.physicsPosition;
    const dist = Math.hypot(pp.x - this.currPos.x, pp.z - this.currPos.z);

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = LOS_INTERVAL;
      this.canSee = dist <= this.params.leashRange && this.lineOfSight(pp, dist);
    }

    const next = nextState(
      this.state,
      {
        distToPlayer: dist,
        playerAlive: player.alive,
        canSeePlayer: this.canSee,
        hpFraction: this.health.fraction,
        attackReady: this.attackCooldown <= 0,
        timeInState: this.timeInState,
        provoked: this.provoked,
      },
      this.params,
      this.mem,
    );
    this.provoked = false;
    if (next !== this.state) this.setState(next);
    if (next === 'dead') return;

    // --- Behaviour: desired horizontal direction and speed for this state ---
    const toPlayer = this.tmp.set(pp.x - this.currPos.x, 0, pp.z - this.currPos.z);
    const toPlayerLen = toPlayer.length();
    if (toPlayerLen > 1e-4) toPlayer.divideScalar(toPlayerLen);
    const move = new THREE.Vector3();
    let speed = 0;
    let face: THREE.Vector3 | undefined;

    switch (this.state) {
      case 'idle': {
        const toHome = new THREE.Vector3(this.home.x - this.currPos.x, 0, this.home.z - this.currPos.z);
        if (toHome.length() > 1) {
          move.copy(toHome.normalize());
          speed = this.spec.speed * 0.6;
          face = move;
        }
        break;
      }
      case 'chase': {
        face = toPlayer;
        const keep = this.profile.keepAway;
        if (keep > 0 && dist < keep) {
          move.copy(toPlayer).negate(); // ranged: back off
          speed = this.spec.speed * 0.8;
        } else if (dist > this.profile.attackRange * 0.85 || !this.canSee) {
          move.copy(toPlayer);
          speed = this.spec.speed;
        }
        break;
      }
      case 'attack': {
        // Track the Incanter during the first part of the wind-up, then commit.
        if (this.timeInState < this.profile.windup * 0.6) face = toPlayer;
        if (!this.attackFired && this.timeInState >= this.profile.windup) {
          this.attackFired = true;
          this.resolveAttack();
        }
        break;
      }
      case 'flee': {
        move.copy(toPlayer).negate();
        speed = this.spec.speed * 1.15;
        face = move;
        break;
      }
    }

    if (face && face.lengthSq() > 1e-6) {
      const target = Math.atan2(face.x, face.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-TURN_RATE * dt));
    }
    this.facing.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    speed *= this.status.speedMultiplier; // slowed
    this.moveBy(move.x, move.z, speed, dt);

    // Looping animation by movement (attack / hit / death are one-shots started elsewhere).
    if (this.state !== 'attack') this.visual.play(speed > 0 ? 'move' : 'idle');
  }

  /** Move through the character controller: own movement + knockback + gravity. */
  private moveBy(dirX: number, dirZ: number, speed: number, dt: number): void {
    this.knock.multiplyScalar(Math.exp(-KNOCK_DECAY * dt));
    this.vy = this.grounded ? -1 : this.vy + GRAVITY * dt;
    if (!this.controller || !this.collider || !this.body) return;
    this.controller.computeColliderMovement(this.collider, {
      x: (dirX * speed + this.knock.x) * dt,
      y: this.vy * dt,
      z: (dirZ * speed + this.knock.z) * dt,
    });
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
  }

  postStep(): void {
    if (!this.body) return;
    this.prevPos.copy(this.currPos);
    const t = this.body.translation();
    this.currPos.set(t.x, t.y, t.z);
  }

  render(alpha: number, dt: number): void {
    this.syncRender(alpha);
    const status = this.alive ? this.status.dominant : 'none';
    this.visual.update(status === 'freeze' ? 0 : dt); // frozen solid: animation stops

    // Hit flash, else a status tint (burn flickers, stun pulses).
    if (this.hitFlash > 0) {
      for (const m of this.visual.materials) m.emissive.setRGB(0.6, 0.6, 0.6);
    } else if (status !== 'none' && status !== 'heal' && status !== 'knockback') {
      const tint = STATUS_TINT[status];
      const now = performance.now() / 1000;
      const k = status === 'burn' ? 0.75 + 0.25 * Math.sin(now * 30) : status === 'stun' ? 0.6 + 0.4 * Math.sin(now * 18) : 1;
      for (const m of this.visual.materials) m.emissive.setRGB(tint.r * k, tint.g * k, tint.b * k);
    } else {
      for (const m of this.visual.materials) m.emissive.setRGB(0, 0, 0);
    }

    // Telegraph fades in over the wind-up.
    if (this.state === 'attack' && !this.attackFired) {
      const k = Math.min(1, this.timeInState / this.profile.windup);
      this.telegraph.visible = true;
      this.telegraphMat.opacity = 0.15 + 0.45 * k;
      this.placeTelegraph();
    } else {
      this.telegraph.visible = false;
    }

    // Corpse sinks, then disappears.
    if (this.state === 'dead') {
      const sink = Math.max(0, this.deadTime - CORPSE_SINK_AFTER);
      this.root.position.y -= sink * 0.8;
      this.blob.visible = false;
    }
  }

  dispose(): void {
    this.removePhysics();
    this.ctx.scene.remove(this.root, this.blob, this.telegraph);
    this.visual.dispose();
    this.blob.geometry.dispose();
    (this.blob.material as THREE.Material).dispose();
    this.telegraph.geometry.dispose();
    this.telegraphMat.dispose();
  }

  // ---------------------------------------------------------------------------------------------

  private setState(s: EnemyState): void {
    this.state = s;
    this.timeInState = 0;
    onEnter(s, this.mem);
    if (s === 'attack') {
      this.attackFired = false;
      this.attackCooldown = this.profile.cooldown + this.params.attackDuration;
      this.visual.play('attack', { once: true, duration: this.params.attackDuration });
    } else if (s === 'dead') {
      this.deadTime = 0;
      this.telegraph.visible = false;
      this.visual.play('death', { once: true });
      this.removePhysics(); // the corpse doesn't block anyone
    }
  }

  private resolveAttack(): void {
    const player = this.ctx.player;
    const pp = player.physicsPosition;
    const p = this.profile;
    const damage = this.spec.damage;
    switch (p.attack) {
      case 'strike':
        if (inArc(this.currPos, this.facing, pp, INCANTER_RADIUS, p.reach, p.arcHalfAngle)) {
          player.takeHit(damage, this.currPos, p.knockback);
        }
        break;
      case 'slam': {
        const impact = this.tmp.copy(this.currPos).addScaledVector(this.facing, p.reach);
        if (inRadius(impact, p.slamRadius, pp, INCANTER_RADIUS)) player.takeHit(damage, impact, p.knockback);
        break;
      }
      case 'projectile': {
        const origin = this.tmp.set(
          this.currPos.x + this.facing.x * (p.radius + 0.3),
          this.currPos.y + p.height * 0.2,
          this.currPos.z + this.facing.z * (p.radius + 0.3),
        );
        const dir = new THREE.Vector3(pp.x - origin.x, 0, pp.z - origin.z);
        if (dir.lengthSq() < 1e-6) dir.copy(this.facing);
        this.ctx.projectiles.fire(origin, dir, p.projectileSpeed, damage, p.knockback);
        break;
      }
    }
  }

  private lineOfSight(target: THREE.Vector3, dist: number): boolean {
    if (dist < 0.5) return true;
    const y = this.currPos.y + this.profile.height * 0.25; // roughly chest height
    this.ray.origin = { x: this.currPos.x, y, z: this.currPos.z };
    this.ray.dir = { x: (target.x - this.currPos.x) / dist, y: 0, z: (target.z - this.currPos.z) / dist };
    return this.ctx.world.castRay(this.ray, dist, true, STATIC_ONLY) === null;
  }

  private syncRender(alpha: number): void {
    this.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.position.y -= this.profile.height / 2 + 0.05; // centre → feet
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
    this.blob.position.set(this.position.x, this.position.y + 0.02, this.position.z);
  }

  private placeTelegraph(): void {
    const p = this.profile;
    this.telegraph.rotation.set(0, this.yaw, 0);
    if (p.attack === 'slam') {
      this.telegraph.position.set(
        this.position.x + this.facing.x * p.reach,
        this.position.y + 0.03,
        this.position.z + this.facing.z * p.reach,
      );
    } else {
      this.telegraph.position.set(this.position.x, this.position.y + 0.03, this.position.z);
    }
  }

  private removePhysics(): void {
    const w = this.ctx.world;
    if (this.controller) w.removeCharacterController(this.controller);
    if (this.body) w.removeRigidBody(this.body); // also removes its collider
    this.controller = undefined;
    this.body = undefined;
    this.collider = undefined;
  }
}

/** Ground decal showing where an attack will land. Lies in XZ, pointing +Z. */
function telegraphGeometry(p: ArchetypeProfile): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (p.attack === 'strike') {
    g = new THREE.RingGeometry(p.radius, p.reach, 24, 1, -Math.PI / 2 - p.arcHalfAngle, p.arcHalfAngle * 2);
  } else if (p.attack === 'slam') {
    g = new THREE.CircleGeometry(p.slamRadius, 32);
  } else {
    // Aim line for projectiles.
    g = new THREE.PlaneGeometry(0.25, 6).translate(0, -3 - p.radius, 0);
  }
  return g.rotateX(-Math.PI / 2);
}
