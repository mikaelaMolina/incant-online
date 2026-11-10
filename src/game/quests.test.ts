import { describe, expect, it } from 'vitest';
import { ORBS_TO_GATHER, QuestLog, questOffer, rewardFor } from './quests';

describe('quests', () => {
  it('in the village only the Knight gives a quest, and it targets the first floor', () => {
    expect(questOffer('Elder', 0, false)).toBeUndefined();
    const q = questOffer('Knight', 0, false);
    expect(q).toMatchObject({ kind: 'clear_floor', floor: 1, giver: 'Knight' });
  });

  it('back in the village after a guardian, the Knight sends you up the next floor', () => {
    expect(questOffer('Knight', 3, false, true)).toMatchObject({ kind: 'clear_floor', floor: 4 });
    expect(questOffer('Elder', 3, false, true)).toBeUndefined();
  });

  it('guides ask for the guardian on guardian floors, otherwise a clear or orbs', () => {
    expect(questOffer('Wanderer', 3, true)?.kind).toBe('defeat_guardian');
    expect(questOffer('Wanderer', 2, false)?.kind).toBe('gather_orbs');
    expect(questOffer('Wanderer', 5, false)?.kind).toBe('clear_floor');
  });

  it('rewards grow with the floor', () => {
    expect(rewardFor('clear_floor', 4)).toBeGreaterThan(rewardFor('clear_floor', 1));
    expect(rewardFor('defeat_guardian', 3)).toBeGreaterThan(rewardFor('clear_floor', 3));
  });

  it('a quest is offered once, accepted, progressed and completed by the matching event', () => {
    const log = new QuestLog();
    const q = log.offerFrom('Knight', 0, false)!;
    log.accept(q);
    expect(log.offerFrom('Knight', 0, false)).toBeUndefined(); // one at a time
    expect(log.record({ kind: 'boss_defeated', floor: 1 })).toBeUndefined(); // wrong event
    expect(log.record({ kind: 'floor_cleared', floor: 2 })).toBeUndefined(); // wrong floor
    const done = log.record({ kind: 'floor_cleared', floor: 1 });
    expect(done?.id).toBe(q.id);
    expect(log.active).toBeUndefined();
    expect(log.offerFrom('Knight', 0, false)).toBeUndefined(); // never the same quest twice
  });

  it('gathering orbs counts up to the goal', () => {
    const log = new QuestLog();
    log.accept(log.offerFrom('Wanderer', 2, false)!);
    for (let i = 1; i < ORBS_TO_GATHER; i++) {
      expect(log.record({ kind: 'orb_collected', floor: 2 })).toBeUndefined();
      expect(log.active?.progress).toBe(i);
    }
    expect(log.record({ kind: 'orb_collected', floor: 2 })?.kind).toBe('gather_orbs');
  });

  it('leaving a floor drops its unfinished quest, but not the village quest for floor 1', () => {
    const log = new QuestLog();
    log.accept(log.offerFrom('Wanderer', 2, false)!);
    log.leftFloor(2);
    expect(log.active).toBeUndefined();
    log.accept(log.offerFrom('Knight', 0, false)!);
    log.leftFloor(0);
    expect(log.active?.floor).toBe(1);
  });
});
