import * as THREE from 'three';
import { RAPIER } from './physics';
import type { Input } from './input';
import type { FollowCamera } from './camera';

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

const SPAWN = new THREE.Vector3(0, CENTER_Y + 0.5, 0);
const KILL_Y = -20;

/** The Incanter: kinematic capsule driven by Rapier's character controller. */
export class Incanter {
  readonly object = new THREE.Group();
  /** Interpolated render position (capsule centre). */
  readonly position = new THREE.Vector3();
  readonly aimPoint = new THREE.Vector3();

  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;

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
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SPAWN.x, SPAWN.y, SPAWN.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), this.body);

    this.controller = world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    this.controller.enableAutostep(0.35, 0.2, false);
    this.controller.enableSnapToGround(0.3);

    this.prevPos.copy(SPAWN);
    this.currPos.copy(SPAWN);
    this.position.copy(SPAWN);

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
    this.visual.add(torso, visor, staff);
    this.object.add(this.visual);
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get isDodging(): boolean {
    return this.dodgeTimer > 0;
  }

  /** True during the dodge's invulnerability window. */
  get isInvulnerable(): boolean {
    return this.dodgeTimer > DODGE_TIME - DODGE_IFRAMES;
  }

  get dodgeReady(): boolean {
    return this.dodgeCooldown <= 0;
  }

  /** Per render frame: read edge-triggered input and update aim, before fixed steps run. */
  frameInput(): void {
    if (this.input.wasPressed('Space')) this.dodgeQueued = true;
    this.updateAimPoint();
  }

  fixedUpdate(dt: number): void {
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);

    const wish = this.wishDirection();

    if (this.dodgeQueued) {
      this.dodgeQueued = false;
      if (this.dodgeReady && this.grounded) {
        this.dodgeDir.copy(wish.lengthSq() > 0 ? wish : this.facing);
        this.dodgeTimer = DODGE_TIME;
        this.dodgeCooldown = DODGE_COOLDOWN;
      }
    }

    if (this.isDodging) {
      this.velocity.x = this.dodgeDir.x * DODGE_SPEED;
      this.velocity.z = this.dodgeDir.z * DODGE_SPEED;
    } else {
      const maxDelta = ACCEL * dt;
      this.velocity.x = approach(this.velocity.x, wish.x * MOVE_SPEED, maxDelta);
      this.velocity.z = approach(this.velocity.z, wish.z * MOVE_SPEED, maxDelta);
    }

    this.velocity.y = this.grounded ? -1 : this.velocity.y + GRAVITY * dt;

    this.controller.computeColliderMovement(this.collider, {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    });
    const move = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    // If a wall stopped us, drop the blocked part of the velocity so we don't "stick" at speed.
    if (dt > 0) {
      this.velocity.x = move.x / dt;
      this.velocity.z = move.z / dt;
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

    // Face the aim point.
    const dx = this.aimPoint.x - this.position.x;
    const dz = this.aimPoint.z - this.position.z;
    if (dx * dx + dz * dz > 0.04) {
      const target = Math.atan2(dx, dz);
      this.yaw = dampAngle(this.yaw, target, TURN_RATE, dt);
    }
    this.object.rotation.y = this.yaw;
    this.facing.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    // Dodge feedback: lean into the roll and glow.
    const dodging = this.isDodging;
    this.visual.scale.set(1, dodging ? 0.75 : 1, 1);
    this.visual.position.y = dodging ? -0.2 : 0;
    this.bodyMaterial.emissive.set(this.isInvulnerable ? '#3a4cff' : '#000000');
  }

  private respawn(): void {
    this.body.setTranslation({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, true);
    this.prevPos.copy(SPAWN);
    this.currPos.copy(SPAWN);
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

function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  return Math.abs(d) <= maxDelta ? target : current + Math.sign(d) * maxDelta;
}

function dampAngle(current: number, target: number, rate: number, dt: number): number {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest way round
  return current + d * (1 - Math.exp(-rate * dt));
}
