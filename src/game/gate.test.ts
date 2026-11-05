import { describe, expect, it } from 'vitest';
import { chooseGateSpot } from './gate';

describe('chooseGateSpot', () => {
  it('opens in the most open direction, about 6 m away, facing the Incanter', () => {
    // Walls 3 m away everywhere except straight +X.
    const clearance = (dx: number, _dz: number, max: number) => (dx > 0.99 ? max : 3);
    const spot = chooseGateSpot({ x: 0, z: 0 }, clearance);
    expect(spot.x).toBeCloseTo(6, 1);
    expect(Math.abs(spot.z)).toBeLessThan(0.1);
    // yaw points from the gate back to the origin (-X).
    expect(Math.sin(spot.yaw)).toBeCloseTo(-1, 2);
  });

  it('stays clear of walls in a cramped room but never on top of the Incanter', () => {
    const spot = chooseGateSpot({ x: 2, z: 2 }, () => 3.5);
    const d = Math.hypot(spot.x - 2, spot.z - 2);
    expect(d).toBeGreaterThanOrEqual(2.5);
    expect(d).toBeLessThanOrEqual(3.5);
  });
});
