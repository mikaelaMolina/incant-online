import * as THREE from 'three';
import type { Shape } from '../schemas/incantationSpec';
import type { HitArea } from '../combat/castPlan';
import { areaCentre } from '../combat/castPlan';
import { GEO, emissiveMaterial, glowMaterial, releaseMaterial, sectorGeometry } from './materials';
import { ParticleSystem } from './particles';
import type { Palette } from './palette';

/** Height of slashes and beams above the feet (roughly the staff's swing height). */
const CHEST = 0.9;
const GROUND = 0.06;

/** A short-lived effect: `animate(t)` gets 0 → 1 over its life. */
interface Transient {
  object: THREE.Object3D;
  materials: THREE.Material[];
  age: number;
  life: number;
  animate: (t: number, dt: number) => void;
  /** Geometries owned by this effect (not shared). */
  geometries?: THREE.BufferGeometry[] | undefined;
}

/** A long-lived visual the runner drives itself (projectiles, beams, auras). */
export interface Handle {
  readonly object: THREE.Object3D;
  dispose(): void;
}

export interface BeamHandle extends Handle {
  /** origin: capsule centre; yaw: direction; length / halfWidth in metres; time for flicker. */
  set(origin: THREE.Vector3, yaw: number, length: number, halfWidth: number, time: number): void;
}

export interface AuraHandle extends Handle {
  set(feet: THREE.Vector3, time: number, fade: number): void;
}

export interface ProjectileHandle extends Handle {
  set(pos: THREE.Vector3, yaw: number, time: number): void;
}

/**
 * VFX presets driven by shape and element. Every preset takes a Palette (element + spec colour)
 * so the same Incantation always looks the same, and any spec gets a sensible look.
 */
export class Vfx {
  readonly particles = new ParticleSystem();
  private readonly transients: Transient[] = [];
  private readonly handles = new Set<Handle>();

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.particles.points);
  }

  // --- Per-hit shape bursts -------------------------------------------------------------------

  /**
   * The flash for one hit of `shape` covering `area`. `origin` is the capsule centre of whoever
   * cast it (or the area centre), `yaw` the facing. `mirror` alternates combo swings.
   */
  shapeHit(shape: Shape, area: HitArea, origin: THREE.Vector3, yaw: number, feetY: number, p: Palette, mirror = false): void {
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    switch (shape) {
      case 'slash':
        this.slash(origin, yaw, area.kind === 'arc' ? area.range : 2.5, area.kind === 'arc' ? area.halfAngle : 1, p, mirror, feetY);
        break;
      case 'thrust':
        this.spike(origin, yaw, area.kind === 'strip' ? area.length : 3, area.kind === 'strip' ? area.halfWidth : 0.5, p);
        break;
      case 'spin':
        this.spin(origin, area.kind === 'circle' ? area.radius : 3, p, feetY, mirror);
        break;
      case 'cone':
        this.cone(origin, yaw, area.kind === 'arc' ? area.range : 4, area.kind === 'arc' ? area.halfAngle : 0.5, p, feetY);
        break;
      case 'circle': {
        const c = new THREE.Vector3(origin.x, feetY, origin.z);
        this.shockwave(c, area.kind === 'circle' ? area.radius : 3, p);
        break;
      }
      case 'line':
        this.line(origin, yaw, area.kind === 'strip' ? area.length : 8, area.kind === 'strip' ? area.halfWidth : 0.5, p, feetY);
        break;
      case 'orb': {
        const c2 = areaCentre(area, origin, dir);
        const r = area.kind === 'circle' ? area.radius : 1.5;
        this.orbBurst(new THREE.Vector3(c2.x, feetY + Math.min(1.2, r * 0.6), c2.z), r, p);
        break;
      }
    }
  }

  /** Crescent arc sweeping across the front. */
  slash(origin: THREE.Vector3, yaw: number, range: number, halfAngle: number, p: Palette, mirror: boolean, feetY: number): void {
    const group = new THREE.Group();
    const outer = new THREE.Mesh(sectorGeometry(0.55, halfAngle), glowMaterial(p.primary, p.glow, 0.85));
    const inner = new THREE.Mesh(sectorGeometry(0.88, halfAngle * 0.9), glowMaterial(p.core, p.glow * 1.2, 1));
    group.add(outer, inner);
    group.position.set(origin.x, feetY + CHEST, origin.z);
    group.scale.setScalar(range);
    const tilt = mirror ? -0.35 : 0.35;
    const sweep = mirror ? -0.7 : 0.7;
    this.add(group, [outer.material, inner.material], p.trail ? 0.32 : 0.22, (t) => {
      group.rotation.set(0, yaw + sweep * (t - 0.5), tilt);
      group.scale.setScalar(range * (0.85 + 0.15 * t));
      outer.material.opacity = 0.85 * (1 - t);
      inner.material.opacity = 1 - t * t;
    });
    const tip = new THREE.Vector3(origin.x + Math.sin(yaw) * range * 0.8, feetY + CHEST, origin.z + Math.cos(yaw) * range * 0.8);
    this.particles.emit(p.particles, tip, { count: 14, color: p.primary, spread: range * 0.4 });
  }

  /** Narrow cone stabbing forward. */
  spike(origin: THREE.Vector3, yaw: number, length: number, halfWidth: number, p: Palette): void {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(GEO.spike, glowMaterial(p.primary, p.glow, 0.8));
    const core = new THREE.Mesh(GEO.spike, glowMaterial(p.core, p.glow * 1.3, 1));
    core.scale.set(0.4, 0.4, 1);
    group.add(shell, core);
    group.position.copy(origin);
    group.rotation.y = yaw;
    this.add(group, [shell.material, core.material], 0.22, (t) => {
      const extend = Math.min(1, t * 5);
      group.scale.set(halfWidth, halfWidth, length * extend);
      shell.material.opacity = 0.8 * (1 - t);
      core.material.opacity = 1 - t;
    });
    const tip = origin.clone().add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(length));
    this.particles.emit(p.particles, tip, { count: 10, color: p.primary, spread: 0.3 });
  }

  /** Bladed ring whirling around the caster. */
  spin(origin: THREE.Vector3, radius: number, p: Palette, feetY: number, reverse: boolean): void {
    const group = new THREE.Group();
    const blade = new THREE.Mesh(sectorGeometry(0.7, Math.PI * 0.75), glowMaterial(p.primary, p.glow, 0.9));
    const edge = new THREE.Mesh(sectorGeometry(0.93, Math.PI * 0.6), glowMaterial(p.core, p.glow * 1.2, 1));
    group.add(blade, edge);
    group.position.set(origin.x, feetY + CHEST * 0.7, origin.z);
    group.scale.setScalar(radius);
    const dirSign = reverse ? -1 : 1;
    this.add(group, [blade.material, edge.material], 0.3, (t) => {
      group.rotation.y = dirSign * t * Math.PI * 2.2;
      blade.material.opacity = 0.9 * (1 - t);
      edge.material.opacity = 1 - t * t;
    });
    this.particles.emit(p.particles, new THREE.Vector3(origin.x, feetY + 0.6, origin.z), { count: 26, color: p.primary, ring: radius * 0.9 });
  }

  /** Filled wedge that blooms outward (breath). */
  cone(origin: THREE.Vector3, yaw: number, range: number, halfAngle: number, p: Palette, feetY: number): void {
    const wedge = new THREE.Mesh(sectorGeometry(0, halfAngle), glowMaterial(p.primary, p.glow * 0.8, 0.6));
    wedge.position.set(origin.x, feetY + 0.5, origin.z);
    wedge.rotation.y = yaw;
    this.add(wedge, [wedge.material], 0.35, (t) => {
      wedge.scale.setScalar(range * Math.min(1, 0.25 + t * 2.5));
      wedge.material.opacity = 0.6 * (1 - t);
    });
    const v = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(range * 2.2);
    this.particles.emit(p.particles, new THREE.Vector3(origin.x, feetY + 0.7, origin.z), { count: 30, color: p.primary, spread: 0.4, velocity: v });
  }

  /** Expanding ground ring + flash disc. */
  shockwave(centre: THREE.Vector3, radius: number, p: Palette): void {
    const ring = new THREE.Mesh(GEO.ring, glowMaterial(p.primary, p.glow, 1));
    const disc = new THREE.Mesh(GEO.disc, glowMaterial(p.accent, p.glow * 0.5, 0.35));
    const group = new THREE.Group();
    group.add(ring, disc);
    group.position.set(centre.x, centre.y + GROUND, centre.z);
    this.add(group, [ring.material, disc.material], 0.45, (t) => {
      const s = radius * (0.2 + 0.8 * Math.sqrt(t));
      ring.scale.set(s, 1, s);
      disc.scale.set(radius, 1, radius);
      ring.material.opacity = 1 - t;
      disc.material.opacity = 0.35 * (1 - t) * (1 - t);
    });
    this.particles.emit(p.particles, centre, { count: Math.round(16 + radius * 6), color: p.primary, ring: radius * 0.8 });
  }

  /** Long flat strip that flashes and narrows. */
  line(origin: THREE.Vector3, yaw: number, length: number, halfWidth: number, p: Palette, feetY: number): void {
    const group = new THREE.Group();
    const strip = new THREE.Mesh(GEO.strip, glowMaterial(p.primary, p.glow, 0.85));
    const core = new THREE.Mesh(GEO.strip, glowMaterial(p.core, p.glow * 1.3, 1));
    core.position.y = 0.01;
    group.add(strip, core);
    group.position.set(origin.x, feetY + 0.5, origin.z);
    group.rotation.y = yaw;
    this.add(group, [strip.material, core.material], 0.3, (t) => {
      const extend = Math.min(1, t * 6);
      strip.scale.set(halfWidth * 2 * (1 - t * 0.6), 1, length * extend);
      core.scale.set(halfWidth * 0.6 * (1 - t), 1, length * extend);
      strip.material.opacity = 0.85 * (1 - t);
      core.material.opacity = 1 - t;
    });
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    for (let i = 1; i <= 4; i++) {
      const at = new THREE.Vector3(origin.x, feetY + 0.5, origin.z).addScaledVector(dir, (length * i) / 4);
      this.particles.emit(p.particles, at, { count: 5, color: p.primary, spread: halfWidth });
    }
  }

  /** Glowing sphere that swells and fades (explosions, orb hits). */
  orbBurst(centre: THREE.Vector3, radius: number, p: Palette): void {
    const shell = new THREE.Mesh(GEO.sphere, glowMaterial(p.primary, p.glow, 0.6));
    const core = new THREE.Mesh(GEO.sphere, glowMaterial(p.core, p.glow * 1.4, 1));
    const group = new THREE.Group();
    group.add(shell, core);
    group.position.copy(centre);
    this.add(group, [shell.material, core.material], 0.4, (t) => {
      shell.scale.setScalar(radius * (0.3 + 0.7 * Math.sqrt(t)));
      core.scale.setScalar(radius * 0.35 * (1 - t));
      shell.material.opacity = 0.6 * (1 - t);
      core.material.opacity = 1 - t;
    });
    this.particles.emit(p.particles, centre, { count: Math.round(14 + radius * 8), color: p.primary, spread: radius * 0.5, speedScale: 1.4 });
  }

  /** A defeated enemy: a burst of motes and a soul-wisp column rising out of it. */
  deathBurst(at: THREE.Vector3, color: THREE.ColorRepresentation, big = false): void {
    const c = new THREE.Color(color);
    const ring = new THREE.Mesh(GEO.ring, glowMaterial(c, 2.2, 0.9));
    ring.position.set(at.x, at.y - 1.1, at.z);
    const r = big ? 4 : 2;
    this.add(ring, [ring.material], 0.45, (t) => {
      ring.scale.setScalar(0.3 + r * Math.sqrt(t));
      ring.material.opacity = 0.9 * (1 - t);
    });
    this.particles.emit('motes', at, { count: big ? 70 : 28, color: c, spread: 0.5, speedScale: big ? 2.2 : 1.5 });
    this.particles.emit('motes', at, { count: big ? 30 : 12, color: c, spread: 0.2, speedScale: 0.6, velocity: new THREE.Vector3(0, 4, 0) });
  }

  /** Small flash where a hit lands. */
  impact(at: THREE.Vector3, p: Palette): void {
    const flash = new THREE.Mesh(GEO.sphere, glowMaterial(p.core, p.glow * 1.2, 1));
    flash.position.copy(at);
    this.add(flash, [flash.material], 0.14, (t) => {
      flash.scale.setScalar(0.25 + 0.35 * t);
      flash.material.opacity = 1 - t;
    });
    this.particles.emit(p.particles, at, { count: 8, color: p.primary, spread: 0.25, speedScale: 1.2 });
  }

  /** Jagged lightning-style link between two points (chains). */
  bolt(from: THREE.Vector3, to: THREE.Vector3, p: Palette, thickness = 0.06): void {
    const pts: THREE.Vector3[] = [];
    const segs = Math.max(4, Math.round(from.distanceTo(to) * 1.5));
    const side = new THREE.Vector3().subVectors(to, from).cross(new THREE.Vector3(0, 1, 0)).normalize();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const pt = new THREE.Vector3().lerpVectors(from, to, t);
      if (i > 0 && i < segs) {
        const j = Math.sin(t * Math.PI) * 0.45;
        pt.addScaledVector(side, (Math.random() - 0.5) * 2 * j);
        pt.y += (Math.random() - 0.5) * j;
      }
      pts.push(pt);
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
    const geo = new THREE.TubeGeometry(curve, segs * 2, thickness, 4, false);
    const glowGeo = new THREE.TubeGeometry(curve, segs * 2, thickness * 3, 6, false);
    const core = new THREE.Mesh(geo, glowMaterial(p.core, p.glow * 1.3, 1));
    const glow = new THREE.Mesh(glowGeo, glowMaterial(p.primary, p.glow, 0.5));
    const group = new THREE.Group();
    group.add(glow, core);
    this.add(
      group,
      [core.material, glow.material],
      0.22,
      (t) => {
        const flicker = 0.6 + 0.4 * Math.sin(t * 60);
        core.material.opacity = (1 - t) * flicker;
        glow.material.opacity = 0.5 * (1 - t) * flicker;
      },
      [geo, glowGeo],
    );
    this.particles.emit(p.particles, to, { count: 8, color: p.primary, spread: 0.2 });
  }

  /** Ground warning where a delayed area will land. */
  telegraph(centre: THREE.Vector3, radius: number, delay: number, p: Palette): void {
    const ring = new THREE.Mesh(GEO.ring, glowMaterial(p.primary, p.glow * 0.6, 0.6));
    const fill = new THREE.Mesh(GEO.disc, glowMaterial(p.primary, p.glow * 0.4, 0.25));
    const group = new THREE.Group();
    group.add(ring, fill);
    group.position.set(centre.x, centre.y + GROUND, centre.z);
    ring.scale.set(radius, 1, radius);
    this.add(group, [ring.material, fill.material], Math.max(0.05, delay), (t) => {
      fill.scale.set(radius * t, 1, radius * t);
      ring.material.opacity = 0.3 + 0.4 * t;
    });
  }

  /** Streak left behind a dash. */
  dashTrail(from: THREE.Vector3, to: THREE.Vector3, p: Palette, feetY: number): void {
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    if (len < 0.1) return;
    const strip = new THREE.Mesh(GEO.strip, glowMaterial(p.primary, p.glow, 0.7));
    strip.position.set(from.x, feetY + 0.3, from.z);
    strip.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    this.add(strip, [strip.material], 0.4, (t) => {
      strip.scale.set(1.2 * (1 - t), 1, len);
      strip.material.opacity = 0.7 * (1 - t);
    });
  }

  /** Small rising sparkle around the Incanter while healing. */
  healPulse(at: THREE.Vector3): void {
    this.particles.emit('motes', at, { count: 2, color: HEAL_COLOR, spread: 0.6 });
  }

  // --- Long-lived visuals the runner moves itself ---------------------------------------------

  projectile(shape: Shape, p: Palette, hitRadius: number): ProjectileHandle {
    const group = new THREE.Group();
    const mats: THREE.Material[] = [];
    const parts: THREE.Mesh[] = [];
    const glowMat = glowMaterial(p.primary, p.glow, 0.55);
    mats.push(glowMat);
    switch (shape) {
      case 'slash': {
        // A crescent flying flat, horns forward.
        const m = glowMaterial(p.primary, p.glow, 0.9);
        const c = glowMaterial(p.core, p.glow * 1.3, 1);
        mats.push(m, c);
        const blade = new THREE.Mesh(sectorGeometry(0.6, 1.2), m);
        const edge = new THREE.Mesh(sectorGeometry(0.88, 1.1), c);
        // Sectors bulge toward +Z (forward); shift back so the arc sits on the projectile.
        const s = hitRadius * 1.3;
        blade.scale.setScalar(s);
        edge.scale.setScalar(s);
        blade.position.z = edge.position.z = -s * 0.8;
        parts.push(blade, edge);
        break;
      }
      case 'thrust':
      case 'line': {
        const coreMat = emissiveMaterial(p.core, p.glow);
        mats.push(coreMat);
        const lance = new THREE.Mesh(GEO.spike, coreMat);
        lance.scale.set(0.12, 0.12, 1.4);
        lance.position.z = -0.7;
        const halo = new THREE.Mesh(GEO.spike, glowMat);
        halo.scale.set(0.3, 0.3, 1.8);
        halo.position.z = -1.1;
        parts.push(lance, halo);
        break;
      }
      case 'spin': {
        const m = glowMaterial(p.primary, p.glow, 0.9);
        mats.push(m);
        const disc = new THREE.Mesh(sectorGeometry(0.55, Math.PI * 0.8), m);
        disc.scale.setScalar(hitRadius + 0.2);
        disc.name = 'spinner';
        parts.push(disc);
        break;
      }
      default: {
        // orb, circle, cone: an emissive ball with a halo.
        const coreMat = emissiveMaterial(p.core, p.glow);
        mats.push(coreMat);
        const ball = new THREE.Mesh(GEO.sphere, coreMat);
        ball.scale.setScalar(Math.max(0.12, hitRadius * 0.45));
        const halo = new THREE.Mesh(GEO.sphere, glowMat);
        halo.scale.setScalar(Math.max(0.25, hitRadius));
        halo.name = 'halo';
        parts.push(ball, halo);
      }
    }
    group.add(...parts);
    this.scene.add(group);
    const spinner = group.getObjectByName('spinner');
    const halo = group.getObjectByName('halo');
    const baseHalo = halo?.scale.x ?? 1;
    const handle: ProjectileHandle = {
      object: group,
      set: (pos, yaw, time) => {
        group.position.copy(pos);
        group.rotation.y = yaw;
        if (spinner) spinner.rotation.y = time * 18;
        if (halo) halo.scale.setScalar(baseHalo * (0.9 + 0.15 * Math.sin(time * 25)));
      },
      dispose: () => {
        this.scene.remove(group);
        for (const m of mats) releaseMaterial(m);
        this.handles.delete(handle);
      },
    };
    this.handles.add(handle);
    return handle;
  }

  /** Channelled beam: a bright core tube, a wider glow and a flare at the end. `cone` → flame-thrower wedge. */
  beam(p: Palette, coneHalfAngle: number): BeamHandle {
    const group = new THREE.Group();
    const mats: THREE.Material[] = [];
    const coreMat = glowMaterial(p.core, p.glow * 1.4, 1);
    const glowMat = glowMaterial(p.primary, p.glow, 0.5);
    const endMat = glowMaterial(p.primary, p.glow * 1.2, 0.8);
    mats.push(coreMat, glowMat, endMat);
    const isCone = coneHalfAngle > 0;
    const core = new THREE.Mesh(isCone ? sectorGeometry(0, coneHalfAngle * 0.5) : GEO.tube, coreMat);
    const glow = new THREE.Mesh(isCone ? sectorGeometry(0, coneHalfAngle) : GEO.tube, glowMat);
    const end = new THREE.Mesh(GEO.sphere, endMat);
    group.add(glow, core, end);
    this.scene.add(group);
    const handle: BeamHandle = {
      object: group,
      set: (origin, yaw, length, halfWidth, time) => {
        group.position.copy(origin);
        group.rotation.y = yaw;
        const flicker = 1 + 0.12 * Math.sin(time * 47) + 0.08 * Math.sin(time * 23);
        if (isCone) {
          core.scale.setScalar(length);
          glow.scale.setScalar(length * flicker);
          end.visible = false;
        } else {
          core.scale.set(halfWidth * 0.35, halfWidth * 0.35, length);
          glow.scale.set(halfWidth * flicker, halfWidth * flicker, length);
          end.position.set(0, 0, length);
          end.scale.setScalar(halfWidth * 1.4 * flicker);
        }
      },
      dispose: () => {
        this.scene.remove(group);
        for (const m of mats) releaseMaterial(m);
        this.handles.delete(handle);
      },
    };
    this.handles.add(handle);
    return handle;
  }

  /** Aura around the Incanter: ground ring, faint column and `orbs` orbiting motes (shape-dependent). */
  aura(shape: Shape, radius: number, orbs: number, p: Palette): AuraHandle {
    const group = new THREE.Group();
    const ringMat = glowMaterial(p.primary, p.glow, 0.8);
    const colMat = glowMaterial(p.primary, p.glow * 0.5, 0.18);
    const orbMat = emissiveMaterial(p.core, p.glow);
    const ring = new THREE.Mesh(GEO.ring, ringMat);
    ring.scale.set(radius, 1, radius);
    ring.position.y = GROUND;
    const column = new THREE.Mesh(GEO.column, colMat);
    column.scale.set(Math.min(radius, 1.2), 2.2, Math.min(radius, 1.2));
    group.add(ring, column);
    const satellites: THREE.Mesh[] = [];
    const count = shape === 'orb' || shape === 'spin' ? Math.max(2, orbs) : orbs;
    for (let i = 0; i < count; i++) {
      const s = new THREE.Mesh(GEO.sphere, orbMat);
      s.scale.setScalar(0.12);
      satellites.push(s);
      group.add(s);
    }
    this.scene.add(group);
    const handle: AuraHandle = {
      object: group,
      set: (feet, time, fade) => {
        group.position.copy(feet);
        ring.rotation.y = time * 0.8;
        ringMat.opacity = 0.8 * fade * (0.85 + 0.15 * Math.sin(time * 6));
        colMat.opacity = 0.18 * fade;
        const orbit = Math.min(radius * 0.6, 1.4);
        satellites.forEach((s, i) => {
          const a = time * (shape === 'spin' ? 6 : 2.5) + (i / satellites.length) * Math.PI * 2;
          s.position.set(Math.cos(a) * orbit, 1 + 0.3 * Math.sin(time * 3 + i), Math.sin(a) * orbit);
          s.visible = fade > 0.05;
        });
      },
      dispose: () => {
        this.scene.remove(group);
        releaseMaterial(ringMat);
        releaseMaterial(colMat);
        releaseMaterial(orbMat);
        this.handles.delete(handle);
      },
    };
    this.handles.add(handle);
    return handle;
  }

  // --- Lifecycle ------------------------------------------------------------------------------

  /**
   * Put one hidden mesh of every effect material (glow, emissive, plus `extra`) in the scene so a
   * scene-wide shader compile covers them too; call the returned function to take them out again.
   * Pooled materials keep their programs alive afterwards (see materials.ts), so no cast compiles.
   */
  addPrewarmMeshes(extra: readonly THREE.Material[] = []): () => void {
    const c = new THREE.Color('#ffffff');
    const glow = glowMaterial(c, 1, 0);
    const emissive = emissiveMaterial(c, 1);
    const group = new THREE.Group();
    for (const m of [glow, emissive, ...extra]) {
      const mesh = new THREE.Mesh(GEO.sphere, m);
      mesh.frustumCulled = false;
      mesh.scale.setScalar(0.01);
      group.add(mesh);
    }
    group.position.set(0, -200, 0); // far below the ground, never seen
    this.scene.add(group);
    return () => {
      this.scene.remove(group);
      releaseMaterial(glow);
      releaseMaterial(emissive);
    };
  }

  update(dt: number, camera: THREE.PerspectiveCamera, pixelHeight: number): void {
    let done = 0;
    for (const fx of this.transients) {
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.life);
      fx.animate(t, dt);
      if (t >= 1) {
        this.disposeTransient(fx);
        done++;
      }
    }
    if (done) {
      const live = this.transients.filter((fx) => fx.age < fx.life);
      this.transients.length = 0;
      this.transients.push(...live);
    }
    this.particles.update(dt, camera, pixelHeight);
  }

  /** Remove everything (floor change, revive). */
  clear(): void {
    for (const fx of this.transients) this.disposeTransient(fx);
    this.transients.length = 0;
    for (const h of [...this.handles]) h.dispose();
    this.particles.clear();
  }

  get activeEffects(): number {
    return this.transients.length + this.handles.size;
  }

  private add(object: THREE.Object3D, materials: THREE.Material[], life: number, animate: Transient['animate'], geometries?: THREE.BufferGeometry[]): void {
    const fx: Transient = { object, materials, age: 0, life, animate, geometries };
    animate(0, 0);
    this.scene.add(object);
    this.transients.push(fx);
  }

  private disposeTransient(fx: Transient): void {
    this.scene.remove(fx.object);
    for (const m of fx.materials) releaseMaterial(m);
    for (const g of fx.geometries ?? []) g.dispose();
  }
}

const HEAL_COLOR = new THREE.Color('#7dffa0');
