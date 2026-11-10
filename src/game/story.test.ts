import { describe, expect, it } from 'vitest';
import {
  STORY_CHAPTERS,
  STORY_BEATS,
  chapterFor,
  beatFor,
  isChapterStart,
  storyLineForFloor,
  storySubtitle,
  storyContextForFloor,
  chapterTitle,
  guideReply,
  guideGreeting,
} from './story';

describe('chapters', () => {
  it('every floor belongs to exactly one chapter', () => {
    for (let f = 1; f <= 50; f++) {
      const ch = chapterFor(f);
      expect(ch.start).toBeLessThanOrEqual(f);
      expect(ch.end).toBeGreaterThanOrEqual(f);
    }
  });

  it('chapters are contiguous and non-overlapping', () => {
    for (let i = 1; i < STORY_CHAPTERS.length; i++) {
      expect(STORY_CHAPTERS[i]!.start).toBe(STORY_CHAPTERS[i - 1]!.end + 1);
    }
  });

  it('the last chapter extends to infinity', () => {
    expect(STORY_CHAPTERS[STORY_CHAPTERS.length - 1]!.end).toBe(Infinity);
    expect(chapterFor(999).title).toBe(STORY_CHAPTERS[STORY_CHAPTERS.length - 1]!.title);
  });

  it('floor 1 is the first chapter start', () => {
    expect(isChapterStart(1)).toBe(true);
    expect(chapterFor(1).title).toBe('The Awakening');
  });
});

describe('story beats', () => {
  it('beat floors are unique and ascending', () => {
    const floors = STORY_BEATS.map((b) => b.floor);
    expect(floors).toEqual([...new Set(floors)]);
    expect([...floors].sort((a, b) => a - b)).toEqual(floors);
  });

  it('beat for floor 1 exists', () => {
    expect(beatFor(1)).toBeDefined();
    expect(beatFor(1)!.line.length).toBeGreaterThan(20);
  });

  it('non-milestone floors have no beat', () => {
    expect(beatFor(2)).toBeUndefined();
    expect(beatFor(4)).toBeUndefined();
  });
});

describe('storyLineForFloor', () => {
  it('returns the beat line on milestone floors', () => {
    const line = storyLineForFloor(3);
    expect(line).toBeDefined();
    expect(line).toBe(beatFor(3)!.line);
  });

  it('returns the chapter intro on chapter-start floors without a beat', () => {
    // Floor 4 is the start of chapter 2, but has no story beat
    const line = storyLineForFloor(4);
    expect(line).toBeDefined();
    expect(line).toBe(chapterFor(4).intro);
  });

  it('returns undefined for non-milestone, non-chapter-start floors', () => {
    // Floors 2, 6, 8, 11 have no beats and aren't chapter starts
    expect(storyLineForFloor(2)).toBeUndefined();
    expect(storyLineForFloor(6)).toBeUndefined();
    expect(storyLineForFloor(8)).toBeUndefined();
    expect(storyLineForFloor(11)).toBeUndefined();
  });
});

describe('storySubtitle', () => {
  it('chapter-start floors use the chapter theme', () => {
    expect(storySubtitle('forest', false, 1)).toBe(chapterFor(1).theme);
    expect(storySubtitle('castle', false, 4)).toBe(chapterFor(4).theme);
  });

  it('non-chapter floors use the biome subtitle', () => {
    const sub = storySubtitle('forest', false, 2);
    expect(sub).toContain('roots');
  });

  it('boss floors mention a guardian', () => {
    const sub = storySubtitle('forest', true, 2);
    expect(sub).toContain('guardian');
  });
});

describe('storyContextForFloor', () => {
  it('floor 1 has lore about the Spire', () => {
    const ctx = storyContextForFloor(1);
    expect(ctx.length).toBeGreaterThan(20);
    expect(ctx.toLowerCase()).toContain('spire');
  });

  it('higher floors have richer lore', () => {
    const early = storyContextForFloor(1);
    const later = storyContextForFloor(10);
    expect(later.length).toBeGreaterThan(early.length);
  });
});

describe('chapterTitle', () => {
  it('returns the chapter title for a floor', () => {
    expect(chapterTitle(1)).toBe('The Awakening');
    expect(chapterTitle(4)).toBe('The Ascent');
    expect(chapterTitle(13)).toBe('The Summit');
  });
});

describe('guideReply', () => {
  it('responds to greetings', () => {
    const reply = guideReply('hello there', 1);
    expect(reply.toLowerCase()).toContain('incanter');
  });

  it('answers questions about the Spire', () => {
    const reply = guideReply('what is the spire?', 1);
    expect(reply.toLowerCase()).toContain('spire');
    expect(reply.toLowerCase()).toContain('first speaker');
  });

  it('answers questions about the Arbiter', () => {
    const reply = guideReply('who is the arbiter?', 1);
    expect(reply.toLowerCase()).toContain('arbiter');
    expect(reply.toLowerCase()).toContain('balance');
  });

  it('falls back gracefully for unknown topics', () => {
    const reply = guideReply('xyzzy', 1);
    expect(reply.length).toBeGreaterThan(20);
  });
});

describe('guideGreeting', () => {
  it('gives a greeting for each chapter', () => {
    for (let i = 0; i < STORY_CHAPTERS.length; i++) {
      const floor = STORY_CHAPTERS[i]!.start;
      const greeting = guideGreeting(floor);
      expect(greeting.length).toBeGreaterThan(10);
    }
  });

  it('early greetings mention being new', () => {
    const g = guideGreeting(1);
    expect(g.toLowerCase()).toContain('incanter');
  });
});

describe('the prologue village (floor 0)', async () => {
  const story = await import('./story');
  const npc = await import('./npc');
  const { STARTING_ARENA } = await import('../fallback/floors');

  it('is peaceful: no enemies before the first battle', () => {
    expect(STARTING_ARENA.spawns).toEqual([]);
  });

  it('opens with the prologue narration and the first chapter lore', () => {
    expect(story.storyLineForFloor(npc.PROLOGUE_FLOOR)).toBe(story.PROLOGUE_NARRATION);
    expect(story.chapterFor(npc.PROLOGUE_FLOOR)).toBe(story.STORY_CHAPTERS[0]);
    expect(story.storySubtitle('ruins', false, npc.PROLOGUE_FLOOR)).toBe(story.PROLOGUE_TITLE);
  });

  it('has villagers to talk to, each with their own greeting and answers', () => {
    const villagers = npc.npcsForFloor(npc.PROLOGUE_FLOOR);
    expect(villagers.length).toBeGreaterThanOrEqual(3);
    for (const v of villagers) {
      const lines = story.prologueDialogueFor(v.role);
      expect(lines.role).toBe(v.role);
      expect(story.prologueGreeting(v.role).length).toBeGreaterThan(10);
      expect(story.prologueReply('hello', v.role).length).toBeGreaterThan(10);
    }
  });

  it('combat floors get one guide, placed near the spawn and inside the floor', () => {
    expect(npc.npcsForFloor(1)).toHaveLength(1);
    const p = npc.guideSpawnPoint({ x: 0, z: 0 }, 22, 'The Frostbound Keep');
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(3);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(20);
    expect(Math.abs(p.z)).toBeLessThanOrEqual(20);
  });
});
