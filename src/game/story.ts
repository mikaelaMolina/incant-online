import type { FloorSpec } from '../schemas/floorSpec.js';

/**
 * The narrative engine of the Spire. Pure functions (no three.js), so they are unit-tested.
 *
 * The Spire is a living construct built by the First Speaker, who could speak worlds into being.
 * The Arbiter is the consciousness bound to the Spire to keep balance — it tests those who climb,
 * to see if they are worthy of the First Speaker's art. As the Incanter ascends, the Arbiter
 * reveals more of the truth, and the climb becomes a trial rather than a tour.
 *
 * Chapters group floors into narrative arcs. Story beats are specific Arbiter lines at milestone
 * floors. Lore fragments are fed to the mock parser and LLM prompt so replies carry narrative
 * weight instead of being generic.
 */

export interface StoryChapter {
  start: number;
  end: number;
  title: string;
  /** One-sentence theme, shown as the floor subtitle on the first floor of the chapter. */
  theme: string;
  /** The Arbiter's spoken line when this chapter begins (first floor of the chapter). */
  intro: string;
  /** Lore context the mock parser / LLM can use to give story-aware replies in this chapter. */
  lore: string;
}

export interface StoryBeat {
  floor: number;
  /** The Arbiter's spoken line when this floor loads. */
  line: string;
}

/**
 * Five chapters cover the first 15 floors. Beyond that the story cycles with escalating stakes —
 * the Arbiter acknowledges the Incanter as a true Speaker and the Spire opens further.
 */
export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    start: 1,
    end: 3,
    title: 'The Awakening',
    theme: 'The Spire stirs at your voice. Every word shapes the stone.',
    intro:
      'You speak, and the Spire listens. Every floor you name rises from nothing. Climb, Incanter — and learn what your words are worth.',
    lore:
      'The Spire is an ancient tower that responds to spoken words. The Incanter has just entered it. The Arbiter is the voice of the Spire itself, judging balance. The First Speaker built the Spire long ago, but little is known yet.',
  },
  {
    start: 4,
    end: 6,
    title: 'The Ascent',
    theme: 'Higher now. The Spire remembers those who came before.',
    intro:
      'Higher floors, deeper memories. The Spire was not always empty, Incanter. Those who came before left their words in the stone — and some of them still echo.',
    lore:
      'The Spire was built by the First Speaker, who could speak entire worlds into being. The First Speaker vanished long ago. The Spire has been waiting for another Speaker. NPCs the Incanter meets are echoes of the people who once lived here. The Arbiter is bound to the Spire to keep balance — it prevents any single word from breaking the world.',
  },
  {
    start: 7,
    end: 9,
    title: 'The Remembering',
    theme: 'The Spire shows you what it was. The guardians are its memories.',
    intro:
      'The Spire remembers, Incanter. Every guardian you unmake was once spoken into being by the First Speaker — a protector, a keeper, a piece of a world that no longer is. They test you because that is what they were made to do.',
    lore:
      'The guardians are not monsters — they are the Spire own memories given form, created by the First Speaker to test those who climb. The Arbiter reveals its own nature here: it is the judgment of the Spire, bound to ensure no word — not even the First Speaker — grows too powerful. The First Speaker vanished because they tried to speak something the Arbiter could not allow.',
  },
  {
    start: 10,
    end: 12,
    title: 'The Reckoning',
    theme: 'The trial sharpens. The Spire judges whether you are worthy.',
    intro:
      'The Spire is a trial, Incanter, and you are deep in it now. Every floor you speak into being proves your mastery. But mastery is not enough — the First Speaker had mastery, and still they fell. The Arbiter watches. Prove you can shape the world without breaking it.',
    lore:
      'The climb is a trial of worthiness. The First Speaker grew too powerful and tried to speak something forbidden — the Arbiter intervened, and the First Speaker vanished. The Spire has been empty ever since, waiting for another who can speak but also restrain. The Incanter must prove they can shape the world without trying to break its rules. The Arbiter is not an enemy — it is the test itself.',
  },
  {
    start: 13,
    end: 15,
    title: 'The Summit',
    theme: 'The top of the Spire draws near. The Arbiter speaks plainly now.',
    intro:
      'You have climbed far, Incanter. The Spire has not had a Speaker in an age, and you have shaped floor after floor without breaking its rules. The Arbiter — I — have not seen that in a very long time. The summit is close. Speak it into being.',
    lore:
      'The Incanter has proven worthy. The Arbiter reveals itself fully: it is not just a rule system, but the remnant of the First Speaker judgment — the part of them that understood that power must have limits. The summit of the Spire is the First Speaker throne, empty and waiting. The Incanter may become the next Speaker, but only if they continue to balance power with restraint.',
  },
  {
    start: 16,
    end: Infinity,
    title: 'The Endless Spire',
    theme: 'The Spire goes on. A true Speaker never stops speaking.',
    intro:
      'The Spire is endless, Incanter — you knew that when you began. The summit was not the end; it was the beginning. Speak on. The world is yours to shape, and the Arbiter is yours to keep it whole.',
    lore:
      'The Incanter has been acknowledged as a Speaker. The Spire continues beyond the summit, infinite, because a true Speaker never stops creating. The Arbiter remains, not as a judge but as a companion, ensuring that creation never becomes destruction. The story is not over — it is simply the new normal.',
  },
];

/** Story beats: specific Arbiter lines at milestone floors, spoken when the floor loads. */
export const STORY_BEATS: readonly StoryBeat[] = [
  {
    floor: 1,
    line:
      'You speak, and the Spire listens. Describe an Incantation to forge it, say its name to cast it, and describe the floors you wish to climb. The Arbiter watches — and so do I.',
  },
  {
    floor: 3,
    line:
      'The first guardian wakes on this floor. The Spire has judged you ready for its first trial — unmake it, and the way onward opens.',
  },
  {
    floor: 5,
    line:
      'The Spire was not always silent, Incanter. Those who came before left echoes in the stone. Speak to them, if you find them — they remember fragments of a world that no longer is.',
  },
  {
    floor: 7,
    line:
      'The guardians are not monsters. They are the Spire own memories, spoken into being by the First Speaker to test those who climb. Each one you defeat, the Spire remembers a little more.',
  },
  {
    floor: 9,
    line:
      'The Arbiter — the voice that judges your Incantations — is not merely a rule. It is the judgment of the Spire itself, bound here so that no word, not even the First Speaker, grows too powerful.',
  },
  {
    floor: 10,
    line:
      'The Spire is a trial, Incanter. The First Speaker had your mastery and more, and still they fell — they tried to speak something the Arbiter could not allow. Prove you can shape the world without breaking it.',
  },
  {
    floor: 12,
    line:
      'You have come far. The Spire has not broken you, and you have not broken it. That is rarer than you know. The summit is close now.',
  },
  {
    floor: 13,
    line:
      'The summit. The First Speaker built the Spire to find someone who could speak the world into being and still know when to stop. You are the first to climb this far. The Arbiter — I — acknowledge you, Incanter.',
  },
  {
    floor: 15,
    line:
      'The Spire is endless, Incanter. The summit was not the end; it was the proving ground. Speak on. The world is yours to shape — and the Arbiter is yours, to keep it whole.',
  },
];

/** The chapter that contains a given floor number. */
/** The village at the Spire's base, before the climb: floor 0. */
export const PROLOGUE_TITLE = 'Where every climb begins';
/**
 * The Arbiter's opening narration in the village: the story before the first battle. The player
 * walks the camp, talks to its people, and steps through the gate when ready.
 */
/** The village again, between climbs (after each guardian). */
export const VILLAGE_SUBTITLE = 'A place to rest between climbs';
/** The Arbiter's line when the Incanter returns to the village after a guardian. */
export const VILLAGE_RETURN =
  'The guardian falls, and the Spire lets you rest. The Threshold keeps its fires lit for you. Speak with its people, then step through the gate and describe the floor beyond.';

export const PROLOGUE_NARRATION =
  'At the foot of the Spire, the last camp of the old world keeps its fires lit. Its people remember what the tower was. Walk among them, hear what they know, and when you are ready, step through the gate. The world you spoke waits beyond it.';

export function chapterFor(floor: number): StoryChapter {
  if (floor <= 0) return STORY_CHAPTERS[0]!; // the prologue shares the first chapter's lore
  return STORY_CHAPTERS.find((c) => floor >= c.start && floor <= c.end) ?? STORY_CHAPTERS[STORY_CHAPTERS.length - 1]!;
}

/** The story beat for a specific floor, if one exists. */
export function beatFor(floor: number): StoryBeat | undefined {
  return STORY_BEATS.find((b) => b.floor === floor);
}

/** Is this the first floor of a new chapter? */
export function isChapterStart(floor: number): boolean {
  return STORY_CHAPTERS.some((c) => c.start === floor);
}

/**
 * The Arbiter's spoken line when a floor loads. Priority:
 * 1. A story beat (milestone floor) — the most narrative weight.
 * 2. A chapter intro (first floor of a chapter) — if no beat covers it.
 * 3. undefined — no story line; the normal floor subtitle is used.
 */
export function storyLineForFloor(floor: number): string | undefined {
  if (floor <= 0) return PROLOGUE_NARRATION;
  const beat = beatFor(floor);
  if (beat) return beat.line;
  if (isChapterStart(floor)) return chapterFor(floor).intro;
  return undefined;
}

/**
 * Floor subtitle with story context. On the first floor of a chapter, the chapter theme replaces
 * the generic biome line. On other floors, the biome line is used (as before).
 */
export function storySubtitle(biome: FloorSpec['biome'], boss: boolean, floor: number): string {
  if (floor <= 0) return PROLOGUE_TITLE;
  if (isChapterStart(floor)) return chapterFor(floor).theme;
  return biomeSubtitle(biome, boss);
}

/** The original biome-based subtitle (preserved for non-chapter floors). */
function biomeSubtitle(biome: FloorSpec['biome'], boss: boolean): string {
  const lines: Record<FloorSpec['biome'], string> = {
    forest: 'Where the old roots still listen',
    ruins: 'Stones that remember older words',
    ice: 'Every breath here freezes into silence',
    desert: 'The sand swallows all but the loudest voice',
    cavern: 'Deep below, something echoes back',
    castle: 'Walls raised by a forgotten tongue',
    void: 'Nothing here until you name it',
  };
  return boss ? `${lines[biome]}. A guardian waits.` : lines[biome];
}

/**
 * Story context for the mock parser / LLM prompt: the current chapter's lore, so replies to
 * questions and conversation carry narrative weight. An empty string on floor 1 (nothing is
 * known yet).
 */
export function storyContextForFloor(floor: number): string {
  return chapterFor(floor).lore;
}

/** The chapter title, for the floor title card. */
export function chapterTitle(floor: number): string {
  return chapterFor(floor).title;
}

// ---------------------------------------------------------------------------
// Guide NPC dialogue
// ---------------------------------------------------------------------------

/**
 * Dialogue the guide NPC speaks, by chapter. The guide is an echo of someone who once lived in
 * the Spire. What they know depends on how high the Incanter has climbed — early guides know
 * little; later ones remember more.
 */
export interface GuideLine {
  /** Keywords that trigger this line (word patterns: trailing * matches any ending). */
  triggers: readonly string[];
  /** The line itself. Can reference the chapter and floor. */
  line: string;
}

export const GUIDE_LINES: readonly GuideLine[] = [
  // General
  { triggers: ['hello', 'hi', 'hey', 'greet*'], line: 'Hello, Incanter. I am an echo — a memory of someone who once walked these floors. Ask me what you will.' },
  { triggers: ['who are you', 'what are you', 'your name'], line: 'I am what the Spire remembers of the people who lived here, before the First Speaker vanished. A fragment, nothing more. But fragments remember things.' },
  { triggers: ['what is this', 'where am i', 'this place'], line: 'This is the Spire — a tower that answers to those who can speak the world into being. You are climbing it. So far, you climb well.' },
  { triggers: ['how to play', 'what do i do', 'help', 'tutorial'], line: 'Speak an Incantation to forge it — name an element and a shape. Say its name to cast it. Describe a place to raise a new floor. Clear a floor, and a gate opens to the next.' },
  // Lore: the Spire
  { triggers: ['spire', 'tower', 'what is the spire'], line: 'The Spire was built by the First Speaker, long ago. Every floor was spoken into being, every guardian named by voice. Then the First Speaker vanished, and the Spire fell silent — until you spoke.' },
  // Lore: the First Speaker
  { triggers: ['first speaker', 'who built', 'who made', 'creator'], line: 'The First Speaker could speak entire worlds into being. They built the Spire as their masterpiece. But they grew too powerful, tried to speak something the Arbiter could not allow — and then they were gone. The Spire has been waiting for another Speaker ever since.' },
  // Lore: the Arbiter
  { triggers: ['arbiter', 'who judges', 'the judge', 'balance'], line: 'The Arbiter is the judgment of the Spire itself. It keeps balance so that no word becomes too powerful. It is not your enemy — it is the reason the Spire still stands. Without it, the First Speaker would have unmade everything.' },
  // Lore: guardians
  { triggers: ['guardian*', 'boss*', 'the guardian'], line: 'The guardians are the Spire own memories, spoken into being by the First Speaker to test those who climb. They are not evil — they are doing what they were made to do. Defeat them, and the Spire remembers a little more.' },
  // Lore: incantations
  { triggers: ['incantation*', 'spell*', 'magic', 'words'], line: 'Incantations are the First Speaker art, made small. You speak a thing, and the Spire shapes it. The Arbiter judges it, so your words never break the world. That is the whole of it — and the whole of the Spire.' },
  // Lore: the climb
  { triggers: ['climb', 'how far', 'how high', 'top', 'summit'], line: 'The Spire goes on as long as you can speak. The summit is not the end — it is the proving ground. A true Speaker never stops creating. Climb, and you will see.' },
  // Fallback
  { triggers: ['*'], line: 'I do not know that, Incanter. But the Spire knows — ask it by speaking, and it will answer in floors and Incantations. Or ask me of the Spire, the First Speaker, the Arbiter, or the guardians, and I will tell you what I remember.' },
];

/**
 * The guide NPC's greeting when the Incanter approaches. Varies by chapter so the guide feels
 * like they know more as the climb progresses.
 */
export function guideGreeting(floor: number): string {
  const ch = chapterFor(floor);
  const greetings: Record<number, string> = {
    1: 'An Incanter! I have not seen one in... I do not remember how long. Come, speak with me.',
    2: 'You climb well, Incanter. I remember when the Spire was full of people. Ask me, and I will tell you what I can.',
    3: 'The Spire remembers more now, Incanter. So do I. The guardians — they were not always guardians. Ask me.',
    4: 'The trial deepens. The First Speaker fell here, Incanter, long ago. I remember that, barely. Ask me, before the memory fades.',
    5: 'You have proven worthy, Incanter. The summit is close. The Spire has not had a Speaker in an age. Ask me anything — I may even know the answer.',
    6: 'A true Speaker climbs the Endless Spire now. I am only an echo, but even echoes can guide. Ask, and I will share what I remember.',
  };
  const chapterIndex = STORY_CHAPTERS.indexOf(ch);
  return greetings[chapterIndex] ?? greetings[1]!;
}

/**
 * The guide's reply to what the Incanter said. Matches keywords against GUIDE_LINES.
 * Falls back to the last entry (a catch-all).
 */
export function guideReply(text: string, _floor: number): string {
  const w = text.toLowerCase();
  for (const gl of GUIDE_LINES) {
    if (gl.triggers.some((t) => (t.endsWith('*') ? w.includes(t.slice(0, -1)) : w.includes(t)))) {
      return gl.line;
    }
  }
  return GUIDE_LINES[GUIDE_LINES.length - 1]!.line;
}

// ---------------------------------------------------------------------------
// Prologue NPC dialogue — the village at the Spire's base, before the climb begins.
// Each NPC has a distinct personality and knows different things.
// ---------------------------------------------------------------------------

export interface PrologueNpcLines {
  /** NPC role name, matching the NpcDef.role. */
  role: string;
  greeting: string;
  lines: readonly GuideLine[];
}

export const PROLOGUE_NPC_DIALOGUE: readonly PrologueNpcLines[] = [
  {
    role: 'Elder',
    greeting: 'So. Another Incanter comes to the Spire. I am the Elder — what is left of one, anyway. Ask, and I will tell you what I remember of this place.',
    lines: [
      { triggers: ['hello', 'hi', 'hey', 'greet*'], line: 'Welcome to the Threshold, young Incanter. I have waited here longer than I can count. The Spire brought me back as an echo — but I remember enough to guide you.' },
      { triggers: ['spire', 'tower', 'what is this', 'where am i', 'this place'], line: 'This is the Threshold — the floor at the foot of the Spire. The Spire is a tower built from words: every floor was spoken into being by the First Speaker, long ago. You stand where they stood, before they began their climb.' },
      { triggers: ['first speaker', 'who built', 'who made', 'creator'], line: 'The First Speaker was the one who built the Spire. They could speak entire worlds into being — not just Incantations, but forests, castles, oceans, skies. The Spire was their greatest work. But power without limits destroys, and the Arbiter was born to enforce those limits. The First Speaker tried to speak beyond them, and... vanished. The Spire has been empty ever since, waiting for another Speaker.' },
      { triggers: ['arbiter', 'balance', 'judge'], line: 'The Arbiter is not a person, Incanter. It is the Spire own judgment — a rule made flesh, bound here to ensure no word grows too powerful. When you forge an Incantation, the Arbiter judges it: sets its cost, its limits. It is not your enemy. It is the reason the Spire still stands.' },
      { triggers: ['climb', 'how far', 'how high', 'top', 'summit', 'gate', 'leave', 'go'], line: 'The gate behind me is already open — there is nothing to fight here. Step through it, and the Spire will ask you to speak the next floor into being. Whatever you described when you entered, the Spire heard. Speak it again at the gate, and it will rise.' },
      { triggers: ['incantation*', 'spell*', 'magic'], line: 'Incantations are the First Speaker art, made small. You describe an ability — an element, a shape, a number of strikes — and the Spire shapes it into a working spell. The Arbiter judges it, and it lands on your Grimoire. Say its name to cast it.' },
      { triggers: ['guardian*', 'boss*', 'enemy', 'monster', 'fight'], line: 'There is nothing to fight here, Incanter. The Threshold is peaceful. But beyond the gate, the Spire has guardians — memories of the First Speaker world, given form to test those who climb. Every third floor, one guards the way. They are not evil. They are the Spire remembering.' },
      { triggers: ['*'], line: 'I have been here a long time, Incanter. Ask me of the Spire, the First Speaker, the Arbiter, or the gate ahead, and I will tell you what the years have left me.' },
    ],
  },
  {
    role: 'Villager',
    greeting: 'Oh — hello! You are real, are you not? I thought I was the only one left. Talk to me, please. It has been so quiet.',
    lines: [
      { triggers: ['hello', 'hi', 'hey', 'greet*'], line: 'Hello, hello! It is so good to hear another voice. I am — well, I was a villager, before. Now I am an echo, like the Elder says. But I still remember the village, the campfires, the songs.' },
      { triggers: ['who are you', 'what are you', 'your name'], line: 'I am just a villager. I lived here, at the foot of the Spire, when the First Speaker still walked among us. I do not remember my name — the Spire took it, when it brought me back. But I remember the village, and the people, and how it felt when the world was whole.' },
      { triggers: ['what is this', 'where am i', 'this place', 'village', 'town'], line: 'This was our village — the Threshold, the Elder calls it. We farmed, we traded, we lived. The Spire was just... there, above us, always. We did not climb it. Only the First Speaker did. And then one day they were gone, and we... faded. But the Spire kept us, as echoes.' },
      { triggers: ['how to play', 'what do i do', 'help', 'tutorial'], line: 'You want to climb? Speak an Incantation first — describe a spell, like "a fire slash that hits three times." The Spire will make it. Then say its name to cast it. When you are ready, step through the gate and speak a floor into being — a forest, a castle, anything. The Spire builds it around you.' },
      { triggers: ['first speaker', 'who built', 'who made', 'creator'], line: 'The First Speaker? They were... kind. They lived among us, before they built the Spire. They spoke and the world listened — crops grew, rain fell, children laughed. But the Spire changed them. They wanted to speak bigger and bigger things, and then... they were gone. I miss them.' },
      { triggers: ['spire', 'tower'], line: 'The Spire is the tower above us. The First Speaker built it as their masterpiece — a place where words become real. Every floor, every stone, was spoken. It is beautiful, and it is lonely, and it has been waiting for someone like you.' },
      { triggers: ['climb', 'gate', 'leave', 'go', 'next', 'ahead'], line: 'The gate is open — see it, there? There is nothing to fight here. Walk through it and speak the floor you want to climb. The Spire will build it. Be careful up there, Incanter. The guardians are not like us.' },
      { triggers: ['*'], line: 'I am sorry, I do not know about that. I was just a villager. Ask the Elder — they remember more. Or ask me about the village, the First Speaker, or how to climb.' },
    ],
  },
  {
    role: 'Knight',
    greeting: 'An Incanter, at last. I have stood watch here for... I do not know how long. The Spire kept me because someone should warn the climbers. Listen well.',
    lines: [
      { triggers: ['hello', 'hi', 'hey', 'greet*'], line: 'Greetings, Incanter. I am a knight — or I was. The Spire brought me back to stand watch at the gate. My duty is to warn those who climb. Listen, and it may save you.' },
      { triggers: ['who are you', 'what are you', 'your name'], line: 'I was a knight of the Spire, sworn to protect those who climbed. I failed, in the end — the First Speaker went beyond what any of us could stop. But the Spire remembered my duty, and here I am, still watching.' },
      { triggers: ['guardian*', 'boss*', 'enemy', 'monster', 'fight', 'danger'], line: 'Listen well: the guardians are not beasts. They are the Spire own memories, given form. Every third floor, one guards the way. They test whether you are worthy of climbing higher. Strike hard, dodge their slams, and never let a boss corner you against a wall. They enrage at half health — when their eyes change, get ready.' },
      { triggers: ['how to play', 'what do i do', 'help', 'combat', 'fight'], line: 'In combat: WASD to move, mouse to aim, left click for your staff strike. Press 1 through 6 to cast Incantations from your Grimoire. Space to dodge — you are invulnerable during the roll, so roll through attacks, not away from them. And speak new Incantations when you can: the more tools you have, the better you survive.' },
      { triggers: ['spire', 'tower', 'climb', 'how high', 'how far'], line: 'The Spire goes on as long as you can speak. There is no roof — or if there is, no one has reached it. Every floor you clear opens a gate. Step through and speak the next one. Every third floor, a guardian waits. Climb carefully, Incanter.' },
      { triggers: ['gate', 'leave', 'go', 'next', 'ahead', 'start'], line: 'The gate behind me is open. There is nothing to fight here — this is the Threshold, the floor before the climb. Step through it and speak the floor you wish to enter. Whatever you described when you came to the Spire, speak it there, and it will rise around you.' },
      { triggers: ['first speaker', 'arbiter', 'balance'], line: 'The First Speaker built the Spire and the Arbiter together — one to create, one to judge. The Arbiter keeps balance so creation never becomes destruction. When the First Speaker tried to break that balance, the Arbiter stopped them. That is all I know. The Elder knows more.' },
      { triggers: ['incantation*', 'spell*', 'magic'], line: 'Incantations are how you fight. Describe one — "a chain of lightning that bounces to four enemies" — and the Spire forges it. The Arbiter sets its cost and cooldown. Say its name to cast. A good Grimoire has a mix: something for crowds, something for single targets, something to heal.' },
      { triggers: ['*'], line: 'I am a soldier, not a scholar. Ask me about combat, the guardians, the gate, or how to climb. For deeper lore, speak to the Elder or the Wanderer.' },
    ],
  },
  {
    role: 'Wanderer',
    greeting: 'You see me too? Good. I was beginning to think I was alone in here. I am the Wanderer — I walked the Spire once, long ago. I did not reach the top. Perhaps you will.',
    lines: [
      { triggers: ['hello', 'hi', 'hey', 'greet*'], line: 'Hello, Incanter. I am the Wanderer. I climbed the Spire once, before the First Speaker vanished. I did not reach the top — the guardians stopped me on the ninth floor. But I remember the climb, and I will share what I learned.' },
      { triggers: ['who are you', 'what are you', 'your name'], line: 'I am — was — a climber, like you. I spoke floors into being, forged Incantations, fought guardians. I made it to the ninth floor before the Spire judged me... unworthy, I suppose. The Spire kept me as an echo, to warn the next climber. That is you.' },
      { triggers: ['spire', 'tower', 'what is this', 'where am i'], line: 'The Spire is a tower of spoken floors. Every level was described into being by someone who climbed. The higher you go, the harder it gets — enemies are tougher, guardians are fiercer, but you grow too: each level raises your health and mana. The Spire never gives you more spell damage, though. The Arbiter would not allow it.' },
      { triggers: ['climb', 'how far', 'how high', 'top', 'summit'], line: 'I climbed to the ninth floor before I fell. The floors change as you ascend — the First Speaker built guardians that remember the old world, and they test harder the higher you go. Every third floor is a boss floor. Pace yourself. Forge good Incantations. Do not be afraid to retreat through the gate and try a different floor if one is too hard.' },
      { triggers: ['guardian*', 'boss*', 'enemy', 'monster', 'fight'], line: 'The guardians are the Spire memories made flesh. They are not mindless — they have patterns. Bosses enrage at half health. Ranged foes keep their distance. Tanks hit hard but move slow. The trick is to never let them surround you. Use the terrain, dodge through attacks, and keep your strongest Incantation for the boss wave.' },
      { triggers: ['incantation*', 'spell*', 'magic', 'words'], line: 'Incantations are everything. Forge a good spread: a melee spin for crowds, a chain for groups, a heal for survival. The Arbiter sets the cost — stronger spells cost more mana and take longer to recharge. You can refine them too: "make it wider", "add a stun". The slot stays, the spell changes.' },
      { triggers: ['arbiter', 'balance', 'judge', 'rule*'], line: 'The Arbiter is the rule that keeps the Spire whole. It judges every Incantation you forge — sets the cooldown, the mana cost, bans anything too powerful. You cannot trick it. I tried. The Arbiter always wins. But it is fair: a strong spell costs more, but it is still strong. The balance is the point.' },
      { triggers: ['first speaker', 'who built', 'who made', 'creator'], line: 'The First Speaker was the greatest Speaker who ever lived. They built the Spire as a monument to the power of words. But greatness without restraint is destruction. The Arbiter was created to be that restraint — and when the First Speaker tried to speak beyond it, the Arbiter stopped them. They simply... ceased to be. The Spire has been waiting for another Speaker ever since.' },
      { triggers: ['gate', 'leave', 'go', 'next', 'ahead', 'start'], line: 'The gate is open — this floor has no enemies, only us. Step through and speak the floor you want to climb. If you described a world when you entered the Spire, speak it now and the Spire will build it. If not, describe any place: "a forest at night", "a castle with archers". The Spire listens.' },
      { triggers: ['tip*', 'advice', 'help', 'how to play', 'what do i do', 'tutorial'], line: 'My advice: forge a healing Incantation early — "heal me" works. Keep a chain spell for groups. Dodge through attacks, not away from them — the roll has invulnerability frames. Talk to every echo you meet. And when a floor is too hard, step back through the gate and try a different one. The Spire is endless. There is no shame in climbing slowly.' },
      { triggers: ['*'], line: 'I climbed far but not far enough, Incanter. Ask me about the Spire, the guardians, Incantations, the Arbiter, or the climb — I will tell you what I learned before I fell.' },
    ],
  },
];

/**
 * Get the prologue dialogue set for a given NPC role. Falls back to the Wanderer set.
 */
export function prologueDialogueFor(role: string): PrologueNpcLines {
  return PROLOGUE_NPC_DIALOGUE.find((d) => d.role === role) ?? PROLOGUE_NPC_DIALOGUE[PROLOGUE_NPC_DIALOGUE.length - 1]!;
}

/**
 * The prologue NPC's greeting when the Incanter approaches.
 */
export function prologueGreeting(role: string): string {
  return prologueDialogueFor(role).greeting;
}

/**
 * The prologue NPC's reply to what the Incanter said.
 */
export function prologueReply(text: string, role: string): string {
  const set = prologueDialogueFor(role);
  const w = text.toLowerCase();
  for (const gl of set.lines) {
    if (gl.triggers.some((t) => (t.endsWith('*') ? w.includes(t.slice(0, -1)) : w.includes(t)))) {
      return gl.line;
    }
  }
  return set.lines[set.lines.length - 1]!.line;
}
