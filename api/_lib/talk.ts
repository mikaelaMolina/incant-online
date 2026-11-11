import { z } from 'zod';
import {
  GUIDE_LINES,
  chapterFor,
  guideGreeting,
  guideReply,
  prologueDialogueFor,
  prologueReply,
} from '../../src/game/story.js';
import { callClaudeText } from './llm/client.js';
import { createRateLimiter } from './rateLimit.js';
import { resolveMode, type Env } from './env.js';

/**
 * NPC conversation (POST /api/talk). In llm mode each NPC is played by Claude, briefed with its own
 * written dialogue (what it knows and how it talks) and the current chapter's lore. In mock mode,
 * or when the call fails, times out or is rate limited, the NPC answers from its written dialogue,
 * so talking always gets an in-character answer.
 */
export const TALK_TIMEOUT_MS = 300_000;
export const TALK_RATE_LIMIT = { requests: 40, windowMs: 10 * 60 * 1000 } as const;
const MAX_REPLY_CHARS = 320;
const MAX_TOKENS = 220;

export const TalkRequest = z.object({
  text: z.string().trim().min(1).max(300),
  /** Which NPC: "Elder", "Villager", "Knight", "Wanderer" (prologue) or a floor's guide. */
  role: z.string().trim().min(1).max(32),
  /** 0 = the prologue village. */
  floor: z.number().int().min(0).max(999),
  floorName: z.string().max(48).optional(),
  biome: z.string().max(16).optional(),
  /** The last few exchanges with this NPC, oldest first. */
  history: z.array(z.object({ who: z.enum(['player', 'npc']), text: z.string().max(400) })).max(6).optional(),
});
export type TalkRequest = z.infer<typeof TalkRequest>;

export interface TalkResponse {
  reply: string;
  mode: 'mock' | 'llm';
  source: 'mock' | 'llm' | 'cache';
}

const limiter = createRateLimiter(TALK_RATE_LIMIT);

/** The written answer (mock mode and every fallback). */
export function writtenReply(req: Pick<TalkRequest, 'text' | 'role' | 'floor'>): string {
  return req.floor === 0 ? prologueReply(req.text, req.role) : guideReply(req.text, req.floor);
}

/** The NPC's brief for Claude: who they are, what they know, how to answer. */
export function npcSystemPrompt(req: Pick<TalkRequest, 'role' | 'floor' | 'floorName' | 'biome'>): string {
  const chapter = chapterFor(req.floor);
  const prologue = req.floor === 0;
  const known = prologue
    ? (() => {
        const d = prologueDialogueFor(req.role);
        return [d.greeting, ...d.lines.map((l) => l.line)];
      })()
    : [guideGreeting(req.floor), ...GUIDE_LINES.map((l) => l.line)];
  const place = [req.floorName ? `"${req.floorName}"` : '', req.biome ?? ''].filter(Boolean).join(', ');
  const where = prologue
    ? 'You live in the Threshold, the last camp of the old world at the foot of the Spire, before the climb begins.'
    : `You are an echo of someone who once lived in the Spire, standing on floor ${req.floor}${place ? ` (${place})` : ''}.`;
  return [
    `You are the ${req.role}, a character in the Spire, a fantasy world where words become power. ${where}`,
    'The person talking to you is the Incanter: a hero who forges spells by speaking them, casts them by saying their names, and climbs the Spire floor by floor.',
    `Story so far (chapter "${chapter.title}"): ${chapter.lore}`,
    `What you know, and how you talk (stay consistent with it, but do not just repeat it):\n- ${known.join('\n- ')}`,
    `Rules: answer in character as the ${req.role}, in at most two short spoken sentences (under 220 characters). Warm, a little mysterious, plain words. Never mention being an AI, a model, a prompt or a game; never break character; no lists, stage directions or emojis. If asked how to play, explain briefly in character: describe a spell to forge it, say its name to cast it, step through the gate to climb. If asked for something unsafe or unrelated to this world, deflect gently in character. Use only original names: never mention existing games, films or books.`,
  ].join('\n\n');
}

function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '').trim();
  if (t.length <= MAX_REPLY_CHARS) return t;
  const cut = t.slice(0, MAX_REPLY_CHARS);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

export interface TalkOptions {
  env: Env;
  ip: string;
  fetchImpl?: typeof fetch | undefined;
  log?: ((msg: string) => void) | undefined;
}

/** One reply from an NPC. Never throws: any problem ends in the NPC's written answer. */
export async function talk(body: unknown, opts: TalkOptions): Promise<TalkResponse> {
  const cfg = resolveMode(opts.env);
  const parsed = TalkRequest.safeParse(body);
  if (!parsed.success) return { reply: 'Speak again, Incanter. The wind took your words.', mode: cfg.mode, source: 'mock' };
  const req = parsed.data;
  if (cfg.mode === 'mock' || !cfg.apiKey) return { reply: writtenReply(req), mode: 'mock', source: 'mock' };
  if (!limiter.allow(opts.ip)) {
    opts.log?.(`talk rate limit: ${opts.ip}`);
    return { reply: writtenReply(req), mode: cfg.mode, source: 'cache' };
  }
  const messages = [
    ...(req.history ?? []).map((h) => ({ role: h.who === 'player' ? ('user' as const) : ('assistant' as const), content: h.text })),
    { role: 'user' as const, content: req.text },
  ];
  // The Messages API wants the conversation to start with the player.
  while (messages.length && messages[0]!.role !== 'user') messages.shift();
  try {
    const reply = await callClaudeText({
      apiKey: cfg.apiKey,
      model: cfg.model,
      system: npcSystemPrompt(req),
      messages,
      maxTokens: MAX_TOKENS,
      signal: AbortSignal.timeout(TALK_TIMEOUT_MS),
      fetchImpl: opts.fetchImpl,
    });
    return { reply: clip(reply), mode: 'llm', source: 'llm' };
  } catch (err) {
    opts.log?.(`talk failed: ${err instanceof Error ? err.message : String(err)}`);
    return { reply: writtenReply(req), mode: 'llm', source: 'cache' };
  }
}

export function resetTalkRateLimit(): void {
  limiter.reset();
}
