import { describe, expect, it } from 'vitest';
import { splitBlocked } from './player';

describe('splitBlocked', () => {
  it('leaves unblocked movement alone', () => {
    expect(splitBlocked(8, 6, 2)).toEqual([6, 2]);
  });
  it('a wall stops both knockback and velocity', () => {
    expect(splitBlocked(0, 6, 2)).toEqual([0, 0]);
  });
  it('blocked knockback never becomes a pull toward the attacker', () => {
    const [v, k] = splitBlocked(0, 0, 5);
    expect(v).toBe(0);
    expect(k).toBe(0);
  });
  it('partial block keeps knockback first', () => {
    expect(splitBlocked(1, 6, 2)).toEqual([0, 1]);
  });
});
