import * as THREE from 'three';

/**
 * Glowing materials and shared unit geometries for the VFX presets.
 * Colours are pushed above 1.0 (HDR) and tone mapping is off, so only these cross the bloom
 * threshold; lit scenery stays below it.
 */

/*
 * Effect materials are pooled, never disposed. Each effect needs its own instance (it animates
 * opacity), but they all share one shader program per kind. three.js deletes a program when the
 * last material using it is disposed, so disposing faded effects made the next cast of that kind
 * recompile its shaders mid-fight (frames of 100–300 ms). Pooling keeps every program alive, and
 * Vfx.prewarm() compiles them all once at startup.
 */
const glowPool: THREE.MeshBasicMaterial[] = [];
const emissivePool: THREE.MeshStandardMaterial[] = [];
const POOL_KEY = 'vfxPool';

/** Unlit additive glow (shells, arcs, rings). Opacity is animated per effect, so each gets its own. */
export function glowMaterial(color: THREE.Color, intensity: number, opacity = 1): THREE.MeshBasicMaterial {
  const m =
    glowPool.pop() ??
    new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
  m.userData[POOL_KEY] = 'glow';
  m.color.copy(color).multiplyScalar(intensity);
  m.opacity = opacity;
  return m;
}

/** Solid emissive core (projectiles, orbs): reads as an object, glows through bloom. */
export function emissiveMaterial(color: THREE.Color, intensity: number): THREE.MeshStandardMaterial {
  const m = emissivePool.pop() ?? new THREE.MeshStandardMaterial({ color: '#000000', roughness: 1, metalness: 0, toneMapped: false });
  m.userData[POOL_KEY] = 'emissive';
  m.emissive.copy(color);
  m.emissiveIntensity = intensity;
  return m;
}

/** Hand an effect material back for reuse (others are disposed as usual). */
export function releaseMaterial(m: THREE.Material): void {
  const kind = m.userData[POOL_KEY];
  if (kind === 'glow' && m instanceof THREE.MeshBasicMaterial) glowPool.push(m);
  else if (kind === 'emissive' && m instanceof THREE.MeshStandardMaterial) emissivePool.push(m);
  else m.dispose();
}

/** Pool sizes, for the profiler overlay. */
export function materialPoolSize(): number {
  return glowPool.length + emissivePool.length;
}

/** Shared unit geometries. Never disposed: there are few and they are reused by every effect. */
export const GEO = {
  sphere: new THREE.IcosahedronGeometry(1, 2),
  /** Unit ring (inner 0.85) lying flat on the ground. */
  ring: new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2),
  /** Unit disc lying flat. */
  disc: new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
  /** Open cylinder from z = 0 to z = 1, radius 1 (beams). */
  tube: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
  /** Cone from its base at z = 0 to the tip at z = 1 (thrusts, lances). */
  spike: new THREE.ConeGeometry(1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
  /** Flat strip from z = 0 to z = 1, width 1 (lines). */
  strip: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
  /** Vertical open cylinder, unit radius and height, base at y = 0 (auras). */
  column: new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0),
};

const sectorCache = new Map<string, THREE.BufferGeometry>();

/**
 * Flat ring sector of unit outer radius, centred on +Z, lying on the ground.
 * `inner` is the inner radius (0 = filled wedge). Cached: shapes use a handful of fixed angles.
 */
export function sectorGeometry(inner: number, halfAngle: number): THREE.BufferGeometry {
  const key = `${inner.toFixed(2)}:${halfAngle.toFixed(3)}`;
  let g = sectorCache.get(key);
  if (!g) {
    const segs = Math.max(8, Math.round((halfAngle * 2 * 32) / Math.PI));
    // Centred on -Y in the XY plane; rotateX(-π/2) turns -Y into +Z.
    g = new THREE.RingGeometry(inner, 1, segs, 1, -Math.PI / 2 - halfAngle, halfAngle * 2).rotateX(-Math.PI / 2);
    sectorCache.set(key, g);
  }
  return g;
}
