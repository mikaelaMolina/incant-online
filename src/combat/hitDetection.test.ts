import { describe, expect, it } from 'vitest';
import { distanceToSegment, inArc, inRadius } from './hitDetection';

const o = { x: 0, z: 0 };
const fwd = { x: 0, z: -1 };
const deg = (d: number) => (d * Math.PI) / 180;

describe('inArc', () => {
  it('hits a target straight ahead within range', () => {
    expect(inArc(o, fwd, { x: 0, z: -2 }, 0.4, 2.5, deg(50))).toBe(true);
  });
  it('misses behind and out of range', () => {
    expect(inArc(o, fwd, { x: 0, z: 2 }, 0.4, 2.5, deg(50))).toBe(false);
    expect(inArc(o, fwd, { x: 0, z: -3.5 }, 0.4, 2.5, deg(50))).toBe(false);
  });
  it('accounts for target radius at the edges', () => {
    // 60° off-axis: outside a 50° half-arc for a point, inside for a fat target.
    const t = { x: Math.sin(deg(60)) * 2, z: -Math.cos(deg(60)) * 2 };
    expect(inArc(o, fwd, t, 0, 2.5, deg(50))).toBe(false);
    expect(inArc(o, fwd, t, 0.5, 2.5, deg(50))).toBe(true);
  });
  it('always hits an overlapping target', () => {
    expect(inArc(o, fwd, { x: 0, z: 0.2 }, 0.4, 2.5, deg(10))).toBe(true);
  });
});

describe('inRadius / distanceToSegment', () => {
  it('circle overlap', () => {
    expect(inRadius(o, 3, { x: 3.2, z: 0 }, 0.4)).toBe(true);
    expect(inRadius(o, 3, { x: 3.5, z: 0 }, 0.4)).toBe(false);
  });
  it('segment distance', () => {
    expect(distanceToSegment({ x: 0, z: 1 }, { x: -1, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(1);
    expect(distanceToSegment({ x: 3, z: 0 }, { x: -1, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(2);
  });
});
