import * as THREE from 'three';
import { RAPIER } from '../game/physics';
import { distanceToSegment } from './hitDetection';
import { INCANTER_RADIUS, type Incanter } from '../game/player';

const MAX_PROJECTILES = 32;
const LIFETIME = 3;
const RADIUS = 0.22;

/** Only static floor geometry blocks projectiles and line of sight. */
export const STATIC_ONLY = RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC;

interface Projectile {
  active: boolean;
  prev: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  knockback: number;
  /** Already dodged through the Incanter: don't hit on the way out either. */
  passed: boolean;
}

/**
 * Enemy projectiles: one InstancedMesh (single draw call), fixed-step movement,
 * swept hit test against the Incanter, blocked by walls and props.
 */
export class ProjectileSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly pool: Projectile[] = [];
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private readonly m = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(
    private readonly world: RAPIER.World,
    private readonly player: Incanter,
    color = '#ffb340',
  ) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(RADIUS, 1),
      new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      MAX_PROJECTILES,
    );
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      this.pool.push({
        active: false,
        prev: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 0,
        knockback: 0,
        passed: false,
      });
      this.mesh.setMatrixAt(i, this.hidden);
    }
  }

  fire(origin: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, knockback: number): void {
    const p = this.pool.find((x) => !x.active);
    if (!p) return; // pool full: drop the shot rather than allocate
    p.active = true;
    p.pos.copy(origin);
    p.prev.copy(origin);
    p.vel.copy(direction).setY(0).normalize().multiplyScalar(speed);
    p.life = LIFETIME;
    p.damage = damage;
    p.knockback = knockback;
    p.passed = false;
  }

  fixedUpdate(dt: number): void {
    const target = this.player.physicsPosition;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.prev.copy(p.pos);
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      // Walls / props.
      const step = this.tmp.subVectors(p.pos, p.prev);
      const len = step.length();
      this.ray.origin = { x: p.prev.x, y: p.prev.y, z: p.prev.z };
      this.ray.dir = { x: step.x / len, y: step.y / len, z: step.z / len };
      if (len > 0 && this.world.castRay(this.ray, len, true, STATIC_ONLY)) {
        p.active = false;
        continue;
      }

      // Incanter (swept so fast shots can't tunnel through).
      if (!p.passed && distanceToSegment(target, p.prev, p.pos) <= RADIUS + INCANTER_RADIUS) {
        if (this.player.takeHit(p.damage, p.prev, p.knockback)) p.active = false;
        else p.passed = true; // dodged through it
      }
    }
  }

  render(alpha: number): void {
    this.pool.forEach((p, i) => {
      if (!p.active) {
        this.mesh.setMatrixAt(i, this.hidden);
        return;
      }
      this.tmp.lerpVectors(p.prev, p.pos, alpha);
      this.mesh.setMatrixAt(i, this.m.makeTranslation(this.tmp.x, this.tmp.y, this.tmp.z));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
