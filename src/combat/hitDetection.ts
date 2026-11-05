/** Pure hit tests on the ground plane (x/z). Heights are ignored: everyone stands on the floor. */

export interface Vec2 {
  x: number;
  z: number;
}

/**
 * Is a circle (target position + radius) inside an arc in front of `origin`?
 * `facing` need not be normalised. `halfAngle` is in radians.
 */
export function inArc(origin: Vec2, facing: Vec2, target: Vec2, targetRadius: number, range: number, halfAngle: number): boolean {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dist = Math.hypot(dx, dz);
  if (dist > range + targetRadius) return false;
  if (dist <= targetRadius) return true; // overlapping the attacker
  if (halfAngle >= Math.PI) return true;
  const fl = Math.hypot(facing.x, facing.z) || 1;
  const cos = (dx * facing.x + dz * facing.z) / (dist * fl);
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  // Widen the arc by the angle the target's radius covers at that distance.
  return angle <= halfAngle + Math.asin(Math.min(1, targetRadius / dist));
}

/** Does a circle overlap another circle? (area attacks, projectile vs body) */
export function inRadius(centre: Vec2, radius: number, target: Vec2, targetRadius: number): boolean {
  return Math.hypot(target.x - centre.x, target.z - centre.z) <= radius + targetRadius;
}

/** Closest distance from point p to segment a→b (swept projectile tests). */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

/**
 * Does a circle overlap a capsule-shaped strip starting at `origin`, `length` long along `facing`
 * and `halfWidth` wide on each side? (thrusts, lines, beams)
 */
export function inStrip(origin: Vec2, facing: Vec2, target: Vec2, targetRadius: number, length: number, halfWidth: number): boolean {
  const fl = Math.hypot(facing.x, facing.z) || 1;
  const end = { x: origin.x + (facing.x / fl) * length, z: origin.z + (facing.z / fl) * length };
  return distanceToSegment(target, origin, end) <= halfWidth + targetRadius;
}
