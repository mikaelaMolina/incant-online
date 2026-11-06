/**
 * Enemy behaviour state machine: idle → chase → attack → flee (+ dead). Pure, no Three/Rapier,
 * so it can be unit-tested. The Enemy class feeds it perception each step and acts on the result.
 */

export type EnemyState = 'idle' | 'chase' | 'attack' | 'flee' | 'dead';

export interface Perception {
  distToPlayer: number;
  playerAlive: boolean;
  /** Clear line of sight to the player (not blocked by floor props). */
  canSeePlayer: boolean;
  hpFraction: number;
  /** Attack cooldown has elapsed. */
  attackReady: boolean;
  /** Seconds spent in the current state. */
  timeInState: number;
  /** Took damage this step (wakes idle enemies regardless of range). */
  provoked: boolean;
  /**
   * Hunting: the last enemies of a floor (and any that already fled) come for the Incanter from
   * anywhere, so nobody is left standing idle at the far end of the map.
   */
  hunting?: boolean;
}

export interface BehaviourParams {
  aggroRange: number;
  /** Give up the chase beyond this distance. */
  leashRange: number;
  attackRange: number;
  /** Seconds an attack lasts (wind-up + recovery); attacks are committed, not cancelled. */
  attackDuration: number;
  /** Flee when HP fraction drops to this or below (0 = never). */
  fleeThreshold: number;
  fleeDuration: number;
}

export interface Memory {
  /** Each enemy flees at most once, then fights to the end. */
  hasFled: boolean;
}

export function nextState(state: EnemyState, p: Perception, b: BehaviourParams, mem: Memory): EnemyState {
  if (state === 'dead') return 'dead';
  if (p.hpFraction <= 0) return 'dead';

  const shouldFlee = !mem.hasFled && b.fleeThreshold > 0 && p.hpFraction <= b.fleeThreshold;
  const lostPlayer = !p.playerAlive || (!p.hunting && p.distToPlayer > b.leashRange);

  switch (state) {
    case 'idle':
      if (!p.playerAlive) return 'idle';
      if (p.provoked || p.hunting) return 'chase';
      // Notice the player in range if visible, or when very close even without sight.
      if (p.distToPlayer <= b.aggroRange && (p.canSeePlayer || p.distToPlayer <= b.aggroRange * 0.4)) return 'chase';
      return 'idle';

    case 'chase':
      if (lostPlayer) return 'idle';
      if (shouldFlee) return 'flee';
      if (p.distToPlayer <= b.attackRange && p.canSeePlayer && p.attackReady) return 'attack';
      return 'chase';

    case 'attack':
      if (p.timeInState < b.attackDuration) return 'attack';
      if (shouldFlee) return 'flee';
      return lostPlayer ? 'idle' : 'chase';

    case 'flee':
      if (!p.playerAlive) return 'idle';
      if (p.timeInState >= b.fleeDuration || p.distToPlayer > b.leashRange * 0.8) return 'chase';
      return 'flee';
  }
}

/** Apply side effects of entering a state to memory. */
export function onEnter(state: EnemyState, mem: Memory): void {
  if (state === 'flee') mem.hasFled = true;
}
