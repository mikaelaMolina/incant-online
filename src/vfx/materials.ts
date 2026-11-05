import * as THREE from 'three';

/**
 * Glowing materials and shared unit geometries for the VFX presets.
 * Colours are pushed above 1.0 (HDR) and tone mapping is off, so only these cross the bloom
 * threshold; lit scenery stays below it.
 */

/** Unlit additive glow (shells, arcs, rings). Opacity is animated per effect, so each gets its own. */
export function glowMaterial(color: THREE.Color, intensity: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: color.clone().multiplyScalar(intensity),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
}

/** Solid emissive core (projectiles, orbs): reads as an object, glows through bloom. */
export function emissiveMaterial(color: THREE.Color, intensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#000000',
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 1,
    metalness: 0,
    toneMapped: false,
  });
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
