import * as THREE from 'three';

export type PickupKind = 'health' | 'mana';

const MAX = 24;
const MAGNET_RANGE = 3.5;
const COLLECT_RANGE = 0.7;
const LIFETIME = 25;
const COLORS: Record<PickupKind, THREE.Color> = {
  health: new THREE.Color('#ff4a5a').multiplyScalar(2.2),
  mana: new THREE.Color('#4aa8ff').multiplyScalar(2.2),
};

interface Orb {
  mesh: THREE.Mesh;
  kind: PickupKind;
  vel: THREE.Vector3;
  age: number;
  groundY: number;
  active: boolean;
}

/**
 * Health and mana orbs dropped by defeated enemies. They pop out, settle, bob, then fly to the
 * Incanter when near. One shared geometry and one material per kind (no new shader variants).
 */
export class Pickups {
  private readonly geo = new THREE.IcosahedronGeometry(0.16, 1);
  private readonly materials: Record<PickupKind, THREE.MeshBasicMaterial> = {
    health: new THREE.MeshBasicMaterial({ color: COLORS.health, toneMapped: false }),
    mana: new THREE.MeshBasicMaterial({ color: COLORS.mana, toneMapped: false }),
  };
  private readonly orbs: Orb[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {}

  /** Materials to pre-compile with the rest of the effects. */
  get prewarm(): THREE.Material[] {
    return [this.materials.health, this.materials.mana];
  }

  drop(at: { x: number; y: number; z: number }, groundY: number, kind: PickupKind): void {
    let orb = this.orbs.find((o) => !o.active);
    if (!orb) {
      if (this.orbs.length >= MAX) orb = this.orbs.reduce((a, b) => (a.age > b.age ? a : b));
      else {
        const mesh = new THREE.Mesh(this.geo, this.materials[kind]);
        orb = { mesh, kind, vel: new THREE.Vector3(), age: 0, groundY, active: false };
        this.orbs.push(orb);
      }
    }
    orb.kind = kind;
    orb.mesh.material = this.materials[kind];
    orb.mesh.position.set(at.x, at.y, at.z);
    const a = Math.random() * Math.PI * 2;
    orb.vel.set(Math.cos(a) * 2.5, 5 + Math.random() * 2, Math.sin(a) * 2.5);
    orb.age = 0;
    orb.groundY = groundY;
    if (!orb.active) this.scene.add(orb.mesh);
    orb.active = true;
  }

  /** Move orbs; returns the kinds collected by the Incanter (feet at `player`) this frame. */
  update(dt: number, player: THREE.Vector3, playerFeetY: number): PickupKind[] {
    const got: PickupKind[] = [];
    for (const o of this.orbs) {
      if (!o.active) continue;
      o.age += dt;
      const p = o.mesh.position;
      const dx = player.x - p.x;
      const dz = player.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (o.age > 0.5 && dist < MAGNET_RANGE) {
        // Home in, faster the closer it gets.
        this.tmp.set(dx, playerFeetY + 0.9 - p.y, dz).normalize().multiplyScalar(6 + (MAGNET_RANGE - dist) * 5);
        o.vel.lerp(this.tmp, Math.min(1, dt * 10));
        p.addScaledVector(o.vel, dt);
      } else {
        const rest = o.groundY + 0.45 + Math.sin(o.age * 3) * 0.08;
        o.vel.y -= 18 * dt;
        o.vel.x *= Math.exp(-3 * dt);
        o.vel.z *= Math.exp(-3 * dt);
        p.addScaledVector(o.vel, dt);
        if (p.y < rest) {
          p.y = rest;
          o.vel.y = 0;
        }
      }
      o.mesh.rotation.y += dt * 2;
      const fade = o.age > LIFETIME - 3 ? Math.sin(o.age * 20) > 0 : true; // blink before vanishing
      o.mesh.visible = fade;
      if (o.age > 0.4 && dist < COLLECT_RANGE && Math.abs(p.y - (playerFeetY + 0.9)) < 1.2) {
        got.push(o.kind);
        this.remove(o);
      } else if (o.age > LIFETIME) this.remove(o);
    }
    return got;
  }

  clear(): void {
    for (const o of this.orbs) if (o.active) this.remove(o);
  }

  private remove(o: Orb): void {
    o.active = false;
    this.scene.remove(o.mesh);
  }
}
