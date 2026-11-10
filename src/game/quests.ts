/**
 * Quests given by NPCs. Pure (no three.js), so it is unit-tested. One quest is active at a time;
 * NPCs offer one when you approach them and none is active. Completing it gives bonus experience
 * and a full heal (applied by the game).
 */

export type QuestKind = 'clear_floor' | 'defeat_guardian' | 'gather_orbs';

export interface Quest {
  /** Unique per offer: giver + floor + kind. */
  id: string;
  kind: QuestKind;
  /** Who gave it ("Knight", "Wanderer"…). */
  giver: string;
  /** Short line for the tracker, e.g. "Clear the first floor". */
  title: string;
  /** What the giver says when offering it. */
  offer: string;
  /** The floor it applies to. */
  floor: number;
  goal: number;
  progress: number;
  rewardXp: number;
}

export type QuestEvent =
  | { kind: 'floor_cleared'; floor: number }
  | { kind: 'boss_defeated'; floor: number }
  | { kind: 'orb_collected'; floor: number };

export const ORBS_TO_GATHER = 3;

/** Reward grows with the floor, like the danger does. */
export function rewardFor(kind: QuestKind, floor: number): number {
  const base = kind === 'defeat_guardian' ? 120 : kind === 'clear_floor' ? 60 : 40;
  return Math.round(base * (1 + 0.25 * Math.max(0, floor - 1)));
}

/**
 * The quest an NPC offers, if any.
 * - In the village (the prologue, or a rest after a guardian) the Knight sends you to clear the next floor.
 * - On a combat floor its guide asks you to defeat the guardian (guardian floors), or alternately
 *   to clear the floor or gather healing orbs.
 */
export function questOffer(giver: string, floor: number, guardianFloor: boolean, village = false): Quest | undefined {
  if (floor === 0 || village) {
    // In the village (the prologue, or a rest after a guardian) the Knight sends you up the next floor.
    if (giver !== 'Knight') return undefined;
    if (floor === 0) {
      return make('clear_floor', giver, 1, 'Clear the first floor', 'Before you go, a task: clear every foe on the first floor beyond the gate. Do it, and the Spire will know your name.');
    }
    return make('clear_floor', giver, floor + 1, 'Clear the next floor', 'Rested? Good. The next floor waits, and so does its host. Clear every foe on it, and I will see you rewarded.');
  }
  if (guardianFloor) {
    return make('defeat_guardian', giver, floor, 'Defeat the guardian', 'A guardian holds this floor. Unmake it, Incanter, and I will give you what strength I have left.');
  }
  if (floor % 2 === 0) {
    return make('gather_orbs', giver, floor, `Gather ${ORBS_TO_GATHER} orbs`, `The fallen leave light behind. Gather ${ORBS_TO_GATHER} orbs from them, and I will share what I know of healing.`);
  }
  return make('clear_floor', giver, floor, 'Clear this floor', 'This floor will not let you rest until every foe is gone. Clear it, and I will reward you.');
}

function make(kind: QuestKind, giver: string, floor: number, title: string, offer: string): Quest {
  return {
    id: `${giver}:${floor}:${kind}`,
    kind,
    giver,
    title,
    offer,
    floor,
    goal: kind === 'gather_orbs' ? ORBS_TO_GATHER : 1,
    progress: 0,
    rewardXp: rewardFor(kind, floor),
  };
}

export class QuestLog {
  active: Quest | undefined;
  /** Every quest id ever offered, so an NPC never offers the same quest twice. */
  private readonly offered = new Set<string>();
  readonly completed: Quest[] = [];

  /** The quest this NPC would give now (none while another is active or it was already given). */
  offerFrom(giver: string, floor: number, guardianFloor: boolean, village = false): Quest | undefined {
    if (this.active) return undefined;
    const q = questOffer(giver, floor, guardianFloor, village);
    return q && !this.offered.has(q.id) ? q : undefined;
  }

  accept(q: Quest): void {
    this.offered.add(q.id);
    this.active = { ...q };
  }

  /** Progress the active quest; returns it when this event completes it. */
  record(e: QuestEvent): Quest | undefined {
    const q = this.active;
    if (!q || e.floor !== q.floor) return undefined;
    const counts =
      (q.kind === 'clear_floor' && e.kind === 'floor_cleared') ||
      (q.kind === 'defeat_guardian' && e.kind === 'boss_defeated') ||
      (q.kind === 'gather_orbs' && e.kind === 'orb_collected');
    if (!counts) return undefined;
    q.progress = Math.min(q.goal, q.progress + 1);
    if (q.progress < q.goal) return undefined;
    this.active = undefined;
    this.completed.push(q);
    return q;
  }

  /** Leaving a floor abandons a quest that belonged to it (a village quest targets the next floor). */
  leftFloor(floor: number): void {
    if (this.active && this.active.floor === floor) this.active = undefined;
  }
}
