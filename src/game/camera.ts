import * as THREE from 'three';

/** Max look-ahead toward the aim point (metres). */
const LOOK_AHEAD_MAX = 2.6;
const LOOK_AHEAD_SHARE = 0.28;
const LOOK_AHEAD_STIFFNESS = 3.5;
/** Trauma decays this much per second; shake = trauma². */
const TRAUMA_DECAY = 1.7;
const SHAKE_MAX_OFFSET = 0.32; // metres
const SHAKE_MAX_ROLL = 0.022; // radians (~1.3°)
const BASE_FOV = 55;
const FOV_KICK_DECAY = 6;

/**
 * Fixed-angle third-person camera that smoothly trails the Incanter, with:
 * - look-ahead: drifts a little toward where you aim, so you see what you're casting at;
 * - screen shake (trauma model): hits, explosions and slams add trauma, shake is trauma², decays;
 * - FOV kick: a brief widening on dashes and big casts.
 * Shake and FOV kick are off when the OS asks for reduced motion.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Offset from the target (behind and above). */
  private readonly offset = new THREE.Vector3(0, 9, 9);
  private readonly lookOffset = new THREE.Vector3(0, 1, 0);
  /** Higher = snappier. Frame-rate independent. */
  private readonly stiffness = 8;
  private readonly base = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly aheadWanted = new THREE.Vector3();
  private trauma = 0;
  private fovKick = 0;
  private time = 0;
  readonly reducedMotion: boolean;

  constructor(aspect: number, reducedMotion = prefersReducedMotion()) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 200);
    this.reducedMotion = reducedMotion;
  }

  /** Camera's forward direction flattened onto the ground plane (unit x/z), for camera-relative movement. */
  groundForward(): { x: number; z: number } {
    const len = Math.hypot(this.offset.x, this.offset.z) || 1;
    return { x: -this.offset.x / len, z: -this.offset.z / len };
  }

  /** Add screen shake (0–1; it saturates at 1). */
  shake(amount: number): void {
    if (this.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Brief field-of-view widening, in degrees (dashes, big casts). */
  kick(degrees: number): void {
    if (this.reducedMotion) return;
    this.fovKick = Math.max(this.fovKick, degrees);
  }

  get currentTrauma(): number {
    return this.trauma;
  }

  snapTo(target: THREE.Vector3): void {
    this.ahead.set(0, 0, 0);
    this.trauma = 0;
    this.fovKick = 0;
    this.base.copy(target).add(this.offset);
    this.camera.position.copy(this.base);
    this.camera.lookAt(this.lookAt.copy(target).add(this.lookOffset));
  }

  /** `aim` is the ground point the Incanter aims at (optional: no look-ahead without it). */
  update(target: THREE.Vector3, dt: number, aim?: THREE.Vector3): void {
    this.time += dt;

    // Look-ahead toward the aim, clamped and smoothed more softly than the follow.
    if (aim) {
      this.aheadWanted.set(aim.x - target.x, 0, aim.z - target.z).multiplyScalar(LOOK_AHEAD_SHARE);
      if (this.aheadWanted.length() > LOOK_AHEAD_MAX) this.aheadWanted.setLength(LOOK_AHEAD_MAX);
    } else {
      this.aheadWanted.set(0, 0, 0);
    }
    this.ahead.lerp(this.aheadWanted, 1 - Math.exp(-LOOK_AHEAD_STIFFNESS * dt));

    this.desired.copy(target).add(this.ahead).add(this.offset);
    this.base.lerp(this.desired, 1 - Math.exp(-this.stiffness * dt));
    this.lookAt.copy(this.base).sub(this.offset).add(this.lookOffset);

    // Shake: smooth pseudo-noise (sums of sines), scaled by trauma².
    const s = this.trauma * this.trauma;
    const t = this.time * 32;
    this.camera.position.set(
      this.base.x + SHAKE_MAX_OFFSET * s * (Math.sin(t * 1.1) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4),
      this.base.y + SHAKE_MAX_OFFSET * s * (Math.sin(t * 1.3 + 0.5) * 0.6 + Math.sin(t * 2.9 + 2.1) * 0.4),
      this.base.z + SHAKE_MAX_OFFSET * s * (Math.sin(t * 0.9 + 3.1) * 0.6 + Math.sin(t * 2.1 + 0.3) * 0.4),
    );
    this.camera.lookAt(this.lookAt);
    if (s > 0) this.camera.rotateZ(SHAKE_MAX_ROLL * s * Math.sin(t * 1.7 + 4.2));
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);

    // FOV kick springs back.
    if (this.fovKick > 0.01 || this.camera.fov !== BASE_FOV) {
      this.fovKick *= Math.exp(-FOV_KICK_DECAY * dt);
      if (this.fovKick < 0.01) this.fovKick = 0;
      this.camera.fov = BASE_FOV + this.fovKick;
      this.camera.updateProjectionMatrix();
    }
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
