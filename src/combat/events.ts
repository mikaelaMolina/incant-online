/**
 * Combat events for feedback only (damage numbers, sounds, screen shake). Gameplay code pushes,
 * the game loop drains once per frame. Never read by game logic, so nothing can depend on it.
 */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export type CombatEvent =
  | { kind: 'damage'; target: 'enemy' | 'player'; amount: number; at: Point3; color?: string; overTime?: boolean }
  | { kind: 'death'; archetype: string; at: Point3 };

const MAX_QUEUED = 200;
const queue: CombatEvent[] = [];

export function emitCombat(e: CombatEvent): void {
  if (queue.length < MAX_QUEUED) queue.push(e);
}

export function drainCombat(): CombatEvent[] {
  return queue.splice(0, queue.length);
}
