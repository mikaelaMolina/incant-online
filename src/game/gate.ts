import * as THREE from 'three';
import { RAPIER } from './physics';
import { STATIC_ONLY } from '../combat/projectiles';
import { GEO, glowMaterial } from '../vfx/materials';
import type { Vfx } from '../vfx/presets';

/** Standing this close to the gate's centre counts as "at the gate". */
export const GATE_RADIUS = 2.4;
const RISE_TIME = 1.2;
const WIDTH = 2.4;
const HEIGHT = 3.2;
const PREFERRED_DISTANCE = 6;
const DIRECTIONS = 16;
const GATE_COLOR = new THREE.Color('#8fd8ff');

/**
 * Where to raise the gate: the direction around the Incanter with the most open space,
 * `PREFERRED_DISTANCE` away (closer if walls or props are in the way). Pure apart from the
 * injected ray cast, so it can be tested without a renderer.
 * `clearance(dirX, dirZ, max)` returns free distance along a ground direction.
 */
export function chooseGateSpot(
  from: { x: number; z: number },
  clearance: (dx: number, dz: number, max: number) => number,
  preferYaw = 0,
): { x: number; z: number; yaw: number } {
  let best = { score: -Infinity, dx: 0, dz: 1, free: 0 };
  for (let i = 0; i < DIRECTIONS; i++) {
    const a = preferYaw + (i / DIRECTIONS) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const free = clearance(dx, dz, PREFERRED_DISTANCE + 3);
    // Prefer roomy directions, then ones close to the preferred facing.
    const score = Math.min(free, PREFERRED_DISTANCE + 2) * 10 - i * 0.01;
    if (score > best.score) best = { score, dx, dz, free };
  }
  const d = Math.max(2.5, Math.min(PREFERRED_DISTANCE, best.free - 2));
  const x = from.x + best.dx * d;
  const z = from.z + best.dz * d;
  // Face back toward the Incanter.
  return { x, z, yaw: Math.atan2(from.x - x, from.z - z) };
}

/** Clearance along a ground direction at chest height, against walls and props. */
export function rayClearance(world: RAPIER.World, origin: THREE.Vector3): (dx: number, dz: number, max: number) => number {
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  return (dx, dz, max) => {
    ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    ray.dir = { x: dx, y: 0, z: dz };
    const hit = world.castRay(ray, max, true, STATIC_ONLY);
    return hit ? hit.timeOfImpact : max;
  };
}

/** The gate that opens when a floor is cleared: two glowing pillars, a lintel and a shimmering portal. */
export class Gate {
  readonly position: THREE.Vector3;
  private readonly group = new THREE.Group();
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly portal: THREE.Mesh;
  private readonly portalMat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private age = 0;
  private emitTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly vfx: Vfx,
    spot: { x: number; z: number; yaw: number },
    groundY: number,
  ) {
    this.position = new THREE.Vector3(spot.x, groundY, spot.z);
    this.group.position.copy(this.position);
    this.group.rotation.y = spot.yaw;

    const stone = new THREE.MeshStandardMaterial({ color: '#3a3f55', emissive: GATE_COLOR, emissiveIntensity: 0.25, roughness: 0.8 });
    const edge = glowMaterial(GATE_COLOR, 3, 0.9);
    this.materials.push(stone, edge);

    const pillarGeo = new THREE.BoxGeometry(0.45, HEIGHT, 0.45).translate(0, HEIGHT / 2, 0);
    const lintelGeo = new THREE.BoxGeometry(WIDTH + 0.9, 0.4, 0.55).translate(0, HEIGHT + 0.2, 0);
    const seamGeo = new THREE.BoxGeometry(0.08, HEIGHT * 0.9, 0.5).translate(0, HEIGHT * 0.45, 0);
    this.geometries.push(pillarGeo, lintelGeo, seamGeo);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, stone);
      pillar.position.x = side * (WIDTH / 2 + 0.2);
      pillar.castShadow = true;
      const seam = new THREE.Mesh(seamGeo, edge);
      seam.position.x = side * (WIDTH / 2 - 0.02);
      this.group.add(pillar, seam);
    }
    const lintel = new THREE.Mesh(lintelGeo, stone);
    lintel.castShadow = true;
    this.group.add(lintel);

    this.portalMat = glowMaterial(GATE_COLOR, 1.8, 0.45);
    const portalGeo = new THREE.PlaneGeometry(WIDTH, HEIGHT).translate(0, HEIGHT / 2, 0);
    this.geometries.push(portalGeo);
    this.portal = new THREE.Mesh(portalGeo, this.portalMat);
    this.group.add(this.portal);

    this.ringMat = glowMaterial(GATE_COLOR, 2.4, 0.7);
    const ring = new THREE.Mesh(GEO.ring, this.ringMat);
    ring.scale.set(GATE_RADIUS, 1, GATE_RADIUS);
    ring.position.y = 0.05;
    this.group.add(ring);
    this.materials.push(this.portalMat, this.ringMat);

    this.group.scale.set(1, 0.001, 1);
    scene.add(this.group);
    vfx.shockwave(this.position, 3.5, {
      primary: GATE_COLOR,
      core: new THREE.Color('#ffffff'),
      accent: GATE_COLOR,
      particles: 'motes',
      trail: false,
      glow: 3,
    });
  }

  /** Has it finished rising out of the ground? */
  get open(): boolean {
    return this.age >= RISE_TIME;
  }

  /** Is a ground position inside the gate's circle? */
  contains(p: { x: number; z: number }): boolean {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z) <= GATE_RADIUS;
  }

  update(dt: number, playerNear: boolean): void {
    this.age += dt;
    const rise = Math.min(1, this.age / RISE_TIME);
    this.group.scale.y = 1 - Math.pow(1 - rise, 3);
    const pulse = 0.5 + 0.5 * Math.sin(this.age * 3);
    this.portalMat.opacity = (playerNear ? 0.65 : 0.4) + 0.15 * pulse;
    this.ringMat.opacity = (playerNear ? 1 : 0.55) * (0.7 + 0.3 * pulse);

    this.emitTimer -= dt;
    if (this.emitTimer <= 0 && rise >= 1) {
      this.emitTimer = playerNear ? 0.05 : 0.12;
      const at = this.portal.getWorldPosition(new THREE.Vector3());
      at.y += (Math.random() - 0.3) * HEIGHT * 0.6;
      this.vfx.particles.emit('motes', at, { count: 2, color: GATE_COLOR, spread: WIDTH * 0.45 });
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
  }
}
