import * as THREE from 'three';
import { RAPIER } from './physics';
import type { Input } from './input';
import type { FollowCamera } from './camera';
import { Health } from '../combat/health';
import { emitCombat } from '../combat/events';
import type { IncanterModel, IncanterPose } from './incanterModel';

const RADIUS = 0.35;
const HALF_HEIGHT = 0.5; // cylindrical half-height; total height = 2 * (HALF_HEIGHT + RADIUS) = 1.7 m
const CENTER_Y = HALF_HEIGHT + RADIUS;

const MOVE_SPEED = 6; // m/s
const ACCEL = 40; // m/s² toward target velocity (snappy but not instant)
const GRAVITY = -25; // stronger than real for a grounded action feel
const TURN_RATE = 18; // rad/s-ish smoothing toward aim

const DODGE_SPEED = 16; // m/s
const DODGE_TIME = 0.22; // s  → ~3.5 m
const DODGE_COOLDOWN = 0.6; // s, counted from dodge start
/** Invulnerable during this part of the dodge (for combat later). */
const DODGE_IFRAMES = 0.18;

const KILL_Y = -20;

export const INCANTER_RADIUS = RADIUS;
/** Capsule centre height above the feet. */
export const INCANTER_CENTER_Y = CENTER_Y;
const MAX_HP = 100;
/** Basic staff strike (left click). */
export const BASIC_ATTACK = {
  damage: 12,
  reach: 2.4,
  halfAngle: (55 * Math.PI) / 180,
  cooldown: 0.4,
  swingTime: 0.18,
  knockback: 3,
  moveSlow: 0.5,
} as const;
const KNOCKBACK_DECAY = 8;
const HIT_FLASH = 0.15;

export interface BasicAttackEvent {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
}

/** The Incanter: kinematic capsule driven by Rapier's character controller. */
export class Incanter {
  readonly object = new THREE.Group();
  /** Interpolated render position (capsule centre). */
  readonly position = new THREE.Vector3();
  readonly aimPoint = new THREE.Vector3();

  readonly health = new Health(MAX_HP);
  /** Called when a basic attack swing starts; the game resolves hits. */
  onBasicAttack: ((e: BasicAttackEvent) => void) | undefined;

  private readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;

  /** Capsule-centre position to respawn at (set by the floor). */
  private readonly spawn = new THREE.Vector3(0, CENTER_Y + 0.5, 0);
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly facing = new THREE.Vector3(0, 0, -1);
  private yaw = Math.PI;
  private grounded = false;

  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private readonly dodgeDir = new THREE.Vector3();
  private dodgeQueued = false;
  private readonly wish = new THREE.Vector3();

  /** Incantation dash (type "dash"): forced movement with i-frames. */
  private castDashTimer = 0;
  private readonly castDashVel = new THREE.Vector3();
  /** Incantation ward (freeze / stun self-buff): can't be hurt. */
  private wardTimer = 0;

  private attackQueued = false;
  private attackCooldown = 0;
  private attackTimer = 0;
  private readonly knock = new THREE.Vector3();
  private hitFlash = 0;
  private readonly staff: THREE.Mesh;
  /** Animated body once loaded; until then (or if it fails) the placeholder capsule shows. */
  private model: IncanterModel | undefined;
  private readonly placeholderParts: THREE.Object3D[] = [];
  /** One-shot animation requested by gameplay since the last frame. */
  private pendingPose: { pose: IncanterPose; duration?: number } | undefined;
  private wasDead = false;
  private wasDodging = false;
  private lastTint = '';

  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly visual = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();

  constructor(
    world: RAPIER.World,
    private readonly input: Input,
    private readonly cam: FollowCamera,
  ) {
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.spawn.x, this.spawn.y, this.spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), this.body);

    this.controller = world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    this.controller.enableAutostep(0.35, 0.2, false);
    this.controller.enableSnapToGround(0.3);

    this.prevPos.copy(this.spawn);
    this.currPos.copy(this.spawn);
    this.position.copy(this.spawn);

    // Placeholder model: robed capsule, glowing visor on the front (+Z), staff on the right.
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: '#5a6bd8', roughness: 0.6 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(RADIUS, HALF_HEIGHT * 2, 4, 12), this.bodyMaterial);
    torso.castShadow = true;
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.1, 0.12),
      new THREE.MeshStandardMaterial({ color: '#bfefff', emissive: '#7cd6ff', emissiveIntensity: 1.5 }),
    );
    visor.position.set(0, 0.5, RADIUS - 0.02);
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6),
      new THREE.MeshStandardMaterial({ color: '#8a6a43' }),
    );
    staff.position.set(RADIUS + 0.12, 0, 0.15);
    staff.castShadow = true;
    this.staff = staff;
    this.visual.add(torso, visor, staff);
    this.placeholderParts.push(torso, visor, staff);
    this.object.add(this.visual);
  }

  /** Swap the placeholder capsule for the animated model. */
  attachModel(model: IncanterModel): void {
    for (const p of this.placeholderParts) p.visible = false;
    this.visual.add(model.object);
    model.object.position.y = -CENTER_Y;
    this.model = model;
  }

  /** World position of the staff tip (falls back to chest height in front of the Incanter). */
  staffTip(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.model) return this.model.staffTip(out);
    return out.copy(this.position).addScaledVector(this.facing, 0.5).setY(this.position.y + 0.4);
  }

  /** Play the casting animation (and set the staff glow to the Incantation's colour). */
  castPose(kind: 'cast' | 'channel' | 'strike', color?: string): void {
    this.pendingPose = { pose: kind, duration: kind === 'strike' ? 0.4 : 0.55 };
    if (color) this.model?.glow(color, 1.2);
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get isDodging(): boolean {
    return this.dodgeTimer > 0;
  }

  /** True during the dodge's invulnerability window, an Incantation dash or a ward. */
  get isInvulnerable(): boolean {
    return this.dodgeTimer > DODGE_TIME - DODGE_IFRAMES || this.castDashTimer > 0 || this.wardTimer > 0;
  }

  get isWarded(): boolean {
    return this.wardTimer > 0;
  }

  get isCastDashing(): boolean {
    return this.castDashTimer > 0;
  }

  /** Feet height from the latest physics step. */
  get feetY(): number {
    return this.currPos.y - CENTER_Y;
  }

  /** Unit ground direction from the Incanter to the aim point (facing if the aim is on top of us). */
  aimDirection(out = new THREE.Vector3()): THREE.Vector3 {
    out.set(this.aimPoint.x - this.currPos.x, 0, this.aimPoint.z - this.currPos.z);
    if (out.lengthSq() < 1e-4) out.copy(this.facing);
    return out.normalize();
  }

  /** Snap to face a direction (casting toward the aim). */
  faceDirection(dir: THREE.Vector3): void {
    if (dir.lengthSq() < 1e-6) return;
    this.yaw = Math.atan2(dir.x, dir.z);
    this.facing.set(dir.x, 0, dir.z).normalize();
  }

  /** Incantation dash: move `distance` along `dir` over `duration` seconds, untouchable meanwhile. */
  dash(dir: THREE.Vector3, distance: number, duration: number): void {
    if (!this.alive || duration <= 0) return;
    this.faceDirection(dir);
    this.castDashVel.set(dir.x, 0, dir.z).normalize().multiplyScalar(distance / duration);
    this.castDashTimer = duration;
    this.dodgeTimer = 0;
    this.knock.set(0, 0, 0);
  }

  /** Can't be hurt for `seconds` (longest ward wins). */
  ward(seconds: number): void {
    this.wardTimer = Math.max(this.wardTimer, seconds);
  }

  get dodgeReady(): boolean {
    return this.dodgeCooldown <= 0;
  }

  get alive(): boolean {
    return !this.health.dead;
  }

  /** Ground-plane position (capsule centre x/z) from the latest physics step. */
  get physicsPosition(): THREE.Vector3 {
    return this.currPos;
  }

  /**
   * Apply an enemy hit. Returns false if it was avoided (dodge i-frames, already dead).
   * `from` is the attacker's position, used for knockback direction.
   */
  takeHit(amount: number, from: THREE.Vector3, knockback: number): boolean {
    if (!this.alive || this.isInvulnerable) return false;
    const dealt = this.health.damage(amount);
    if (dealt > 0) emitCombat({ kind: 'damage', target: 'player', amount: dealt, at: { x: this.currPos.x, y: this.currPos.y + 1.1, z: this.currPos.z } });
    const away = new THREE.Vector3(this.currPos.x - from.x, 0, this.currPos.z - from.z);
    if (away.lengthSq() < 1e-6) away.copy(this.facing).negate();
    this.knock.copy(away.normalize().multiplyScalar(knockback));
    this.hitFlash = HIT_FLASH;
    if (!this.pendingPose && this.attackTimer <= 0) this.pendingPose = { pose: 'hit', duration: 0.35 };
    return true;
  }

  /** Per render frame: read edge-triggered input and update aim, before fixed steps run. */
  frameInput(): void {
    if (!this.alive) return;
    if (this.input.wasPressed('Space')) this.dodgeQueued = true;
    if (this.input.wasPressed('Mouse0')) this.attackQueued = true;
    this.updateAimPoint();
  }

  fixedUpdate(dt: number): void {
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.wardTimer = Math.max(0, this.wardTimer - dt);
    const castDashing = this.castDashTimer > 0;
    this.castDashTimer = Math.max(0, this.castDashTimer - dt);
    this.knock.multiplyScalar(Math.exp(-KNOCKBACK_DECAY * dt));

    const wish = this.alive ? this.wishDirection() : this.wish.set(0, 0, 0);

    if (this.attackQueued) {
      this.attackQueued = false;
      if (this.alive && this.attackCooldown <= 0 && !this.isDodging) this.startBasicAttack();
    }

    if (this.dodgeQueued) {
      this.dodgeQueued = false;
      if (this.dodgeReady && this.grounded && !castDashing) {
        this.dodgeDir.copy(wish.lengthSq() > 0 ? wish : this.facing);
        this.dodgeTimer = DODGE_TIME;
        this.dodgeCooldown = DODGE_COOLDOWN;
      }
    }

    if (castDashing) {
      this.velocity.x = this.castDashVel.x;
      this.velocity.z = this.castDashVel.z;
    } else if (this.isDodging) {
      this.velocity.x = this.dodgeDir.x * DODGE_SPEED;
      this.velocity.z = this.dodgeDir.z * DODGE_SPEED;
    } else {
      const maxDelta = ACCEL * dt;
      const speed = MOVE_SPEED * (this.attackTimer > 0 ? BASIC_ATTACK.moveSlow : 1);
      this.velocity.x = approach(this.velocity.x, wish.x * speed, maxDelta);
      this.velocity.z = approach(this.velocity.z, wish.z * speed, maxDelta);
    }

    this.velocity.y = this.grounded ? -1 : this.velocity.y + GRAVITY * dt;

    this.controller.computeColliderMovement(this.collider, {
      x: (this.velocity.x + this.knock.x) * dt,
      y: this.velocity.y * dt,
      z: (this.velocity.z + this.knock.z) * dt,
    });
    const move = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    // If a wall stopped us, drop the blocked part of the velocity so we don't "stick" at speed.
    if (dt > 0) {
      [this.velocity.x, this.knock.x] = splitBlocked(move.x / dt, this.velocity.x, this.knock.x);
      [this.velocity.z, this.knock.z] = splitBlocked(move.z / dt, this.velocity.z, this.knock.z);
    }

    // Don't carry the dash speed out of it.
    if (castDashing && this.castDashTimer === 0) {
      this.velocity.x *= 0.15;
      this.velocity.z *= 0.15;
    }

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + move.x, y: t.y + move.y, z: t.z + move.z });
  }

  /** After world.step(): record the new physics position for interpolation. */
  postStep(): void {
    this.prevPos.copy(this.currPos);
    const t = this.body.translation();
    this.currPos.set(t.x, t.y, t.z);

    if (this.currPos.y < KILL_Y) this.respawn();
  }

  /** Per render frame, alpha = fraction of the way to the next physics step. */
  render(alpha: number, dt: number): void {
    this.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.position.copy(this.position);

    // Face the aim point (not while swinging: the swing locked the direction).
    const dx = this.aimPoint.x - this.position.x;
    const dz = this.aimPoint.z - this.position.z;
    if (this.alive && this.attackTimer <= 0 && dx * dx + dz * dz > 0.04) {
      const target = Math.atan2(dx, dz);
      this.yaw = dampAngle(this.yaw, target, TURN_RATE, dt);
    }
    this.object.rotation.y = this.yaw;
    this.facing.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    const dodging = this.isDodging || this.isCastDashing;
    if (this.model) {
      this.animateModel(dt, dodging);
      return;
    }
    // Placeholder feedback: lean into the roll and glow. Hit: red flash. Dead: fallen over.
    this.visual.scale.set(1, dodging ? 0.75 : 1, 1);
    this.visual.position.y = dodging ? -0.2 : 0;
    this.visual.rotation.x = this.alive ? 0 : -Math.PI / 2.2;
    if (!this.alive) this.visual.position.y = -CENTER_Y + RADIUS;
    this.bodyMaterial.emissive.set(
      this.hitFlash > 0 ? '#ff2a2a' : this.isWarded ? '#a07a10' : this.isInvulnerable ? '#3a4cff' : '#000000',
    );

    // Staff swings forward during the basic attack.
    const swing = this.attackTimer > 0 ? Math.sin((1 - this.attackTimer / BASIC_ATTACK.swingTime) * Math.PI) : 0;
    this.staff.rotation.x = swing * 1.4;
  }

  private animateModel(dt: number, dodging: boolean): void {
    const m = this.model!;
    const dead = !this.alive;
    if (dead && !this.wasDead) m.play('death', 1.1);
    else if (!dead && this.wasDead) m.play('idle');
    this.wasDead = dead;
    if (!dead) {
      if (dodging && !this.wasDodging) m.play('roll', this.isCastDashing ? Math.max(0.3, this.castDashTimer) : 0.42);
      else if (this.pendingPose) m.play(this.pendingPose.pose, this.pendingPose.duration);
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      m.play(speed > 0.6 ? 'run' : 'idle');
    }
    this.pendingPose = undefined;
    this.wasDodging = dodging;
    const tint = this.hitFlash > 0 ? '#ff2a2a' : this.isWarded ? '#ffc23a' : this.isInvulnerable ? '#3a6cff' : '';
    if (tint !== this.lastTint) {
      m.tint(tint || null, this.hitFlash > 0 ? 0.8 : 0.45);
      this.lastTint = tint;
    }
    m.update(dt, Math.hypot(this.velocity.x, this.velocity.z) / MOVE_SPEED);
  }

  /** Bring the Incanter back at the spawn point with full health. */
  revive(): void {
    this.health.reset();
    this.knock.set(0, 0, 0);
    this.attackTimer = 0;
    this.wardTimer = 0;
    this.castDashTimer = 0;
    this.respawn();
  }

  private startBasicAttack(): void {
    const dir = new THREE.Vector3(this.aimPoint.x - this.currPos.x, 0, this.aimPoint.z - this.currPos.z);
    if (dir.lengthSq() < 1e-4) dir.copy(this.facing);
    dir.normalize();
    // Snap to the aim so the swing goes where the player clicked.
    this.yaw = Math.atan2(dir.x, dir.z);
    this.facing.copy(dir);
    this.attackCooldown = BASIC_ATTACK.cooldown;
    this.attackTimer = BASIC_ATTACK.swingTime;
    this.pendingPose = { pose: 'strike', duration: 0.4 };
    this.onBasicAttack?.({ origin: this.currPos.clone(), direction: dir });
  }

  /** Set the spawn point (feet position on the ground) and move there. */
  setSpawn(feet: THREE.Vector3): void {
    this.spawn.set(feet.x, feet.y + CENTER_Y + 0.05, feet.z);
    this.respawn();
  }

  respawn(): void {
    const s = this.spawn;
    this.body.setTranslation({ x: s.x, y: s.y, z: s.z }, true);
    this.body.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
    this.prevPos.copy(s);
    this.currPos.copy(s);
    this.position.copy(s);
    this.velocity.set(0, 0, 0);
    this.dodgeTimer = 0;
  }

  /** WASD relative to the camera, flattened to the ground, unit length or zero. */
  private wishDirection(): THREE.Vector3 {
    const { x, y } = this.input.moveAxes();
    const f = this.cam.groundForward();
    // right = forward rotated -90° around Y
    this.wish.set(f.x * y - f.z * x, 0, f.z * y + f.x * x);
    return this.wish.lengthSq() > 0 ? this.wish.normalize() : this.wish;
  }

  private updateAimPoint(): void {
    if (!this.input.pointer.active) {
      this.aimPoint.copy(this.position).addScaledVector(this.facing, 3);
      return;
    }
    this.ndc.set(this.input.pointer.x, this.input.pointer.y);
    this.raycaster.setFromCamera(this.ndc, this.cam.camera);
    // Aim on a plane at the Incanter's feet.
    this.aimPlane.constant = -(this.position.y - CENTER_Y);
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint)) {
      this.aimPoint.copy(this.position).addScaledVector(this.facing, 3);
    }
  }
}

/**
 * After a blocked move, share the speed actually achieved between knockback and own velocity
 * so neither keeps pushing into a wall (and blocked knockback never turns into a pull).
 */
export function splitBlocked(actual: number, velocity: number, knock: number): [number, number] {
  const k = Math.sign(knock) === Math.sign(actual) ? Math.sign(knock) * Math.min(Math.abs(knock), Math.abs(actual)) : 0;
  const v = actual - k;
  return [Math.sign(v) === -Math.sign(velocity) ? 0 : v, k];
}

function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  return Math.abs(d) <= maxDelta ? target : current + Math.sign(d) * maxDelta;
}

function dampAngle(current: number, target: number, rate: number, dt: number): number {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest way round
  return current + d * (1 - Math.exp(-rate * dt));
}
