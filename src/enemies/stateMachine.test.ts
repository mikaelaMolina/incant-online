import { describe, expect, it } from 'vitest';
import { nextState, onEnter, type BehaviourParams, type Memory, type Perception } from './stateMachine';

const params: BehaviourParams = {
  aggroRange: 10,
  leashRange: 18,
  attackRange: 2,
  attackDuration: 1,
  fleeThreshold: 0.25,
  fleeDuration: 3,
};

const see = (over: Partial<Perception> = {}): Perception => ({
  distToPlayer: 5,
  playerAlive: true,
  canSeePlayer: true,
  hpFraction: 1,
  attackReady: true,
  timeInState: 0,
  provoked: false,
  ...over,
});

const fresh = (): Memory => ({ hasFled: false });

describe('enemy state machine', () => {
  it('idle → chase when the player is visible within aggro range', () => {
    expect(nextState('idle', see({ distToPlayer: 12 }), params, fresh())).toBe('idle');
    expect(nextState('idle', see({ distToPlayer: 9 }), params, fresh())).toBe('chase');
    expect(nextState('idle', see({ distToPlayer: 9, canSeePlayer: false }), params, fresh())).toBe('idle');
    expect(nextState('idle', see({ distToPlayer: 3, canSeePlayer: false }), params, fresh())).toBe('chase');
  });

  it('idle → chase when hit from any distance', () => {
    expect(nextState('idle', see({ distToPlayer: 30, provoked: true }), params, fresh())).toBe('chase');
  });

  it('chase → attack only when in range, visible and off cooldown', () => {
    expect(nextState('chase', see({ distToPlayer: 1.5 }), params, fresh())).toBe('attack');
    expect(nextState('chase', see({ distToPlayer: 1.5, attackReady: false }), params, fresh())).toBe('chase');
    expect(nextState('chase', see({ distToPlayer: 1.5, canSeePlayer: false }), params, fresh())).toBe('chase');
    expect(nextState('chase', see({ distToPlayer: 3 }), params, fresh())).toBe('chase');
  });

  it('chase → idle when the player escapes the leash or dies', () => {
    expect(nextState('chase', see({ distToPlayer: 20 }), params, fresh())).toBe('idle');
    expect(nextState('chase', see({ playerAlive: false }), params, fresh())).toBe('idle');
  });

  it('attacks are committed until they finish', () => {
    expect(nextState('attack', see({ distToPlayer: 30, timeInState: 0.5 }), params, fresh())).toBe('attack');
    expect(nextState('attack', see({ timeInState: 1 }), params, fresh())).toBe('chase');
    expect(nextState('attack', see({ timeInState: 1, distToPlayer: 30 }), params, fresh())).toBe('idle');
  });

  it('flees once at low HP, then returns to the fight', () => {
    const mem = fresh();
    const low = see({ hpFraction: 0.2 });
    const s = nextState('chase', low, params, mem);
    expect(s).toBe('flee');
    onEnter(s, mem);
    expect(nextState('flee', { ...low, timeInState: 1 }, params, mem)).toBe('flee');
    expect(nextState('flee', { ...low, timeInState: 3 }, params, mem)).toBe('chase');
    // Already fled: keeps fighting.
    expect(nextState('chase', { ...low, distToPlayer: 1 }, params, mem)).toBe('attack');
  });

  it('never flees with a zero threshold (tanks)', () => {
    expect(nextState('chase', see({ hpFraction: 0.01 }), { ...params, fleeThreshold: 0 }, fresh())).toBe('chase');
  });

  it('dies from any state and stays dead', () => {
    for (const s of ['idle', 'chase', 'attack', 'flee'] as const) {
      expect(nextState(s, see({ hpFraction: 0 }), params, fresh())).toBe('dead');
    }
    expect(nextState('dead', see(), params, fresh())).toBe('dead');
  });
});
