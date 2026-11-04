import * as THREE from 'three';
import { inArc } from './hitDetection';
import { BASIC_ATTACK, type BasicAttackEvent } from '../game/player';
import type { Enemy } from '../enemies/enemy';

const FADE = 0.16;

/** Resolves the Incanter's left-click staff strike and shows a quick slash arc. */
export class BasicAttack {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private timer = 0;

  constructor(scene: THREE.Scene) {
    const half = BASIC_ATTACK.halfAngle;
    const geo = new THREE.RingGeometry(0.5, BASIC_ATTACK.reach, 24, 1, -Math.PI / 2 - half, half * 2).rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: '#bfefff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Returns how many enemies were hit. */
  resolve(e: BasicAttackEvent, enemies: readonly Enemy[]): number {
    let hits = 0;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (inArc(e.origin, e.direction, enemy.physicsPosition, enemy.radius, BASIC_ATTACK.reach, BASIC_ATTACK.halfAngle)) {
        enemy.takeHit(BASIC_ATTACK.damage, e.origin, BASIC_ATTACK.knockback);
        hits++;
      }
    }
    this.mesh.position.set(e.origin.x, e.origin.y - 0.6, e.origin.z);
    this.mesh.rotation.y = Math.atan2(e.direction.x, e.direction.z);
    this.timer = FADE;
    return hits;
  }

  update(dt: number): void {
    this.timer = Math.max(0, this.timer - dt);
    this.mesh.visible = this.timer > 0;
    this.material.opacity = (this.timer / FADE) * 0.55;
  }
}
