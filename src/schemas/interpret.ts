import { z } from 'zod';
import { IncantationSpec } from './incantationSpec.js';
import { FloorSpec } from './floorSpec.js';
import { text } from './lenient.js';

export const INTENTS = ['forge', 'build', 'reply'] as const;
export type Intent = (typeof INTENTS)[number];

export const LLM_MODES = ['mock', 'llm'] as const;
export type LlmMode = (typeof LLM_MODES)[number];

/** Where a response came from. Not part of the LLM's output; added by the backend. */
export const RESPONSE_SOURCES = ['mock', 'llm', 'cache'] as const;
export type ResponseSource = (typeof RESPONSE_SOURCES)[number];

export const MAX_INPUT_LENGTH = 300;

/** POST /api/interpret body. `context` carries the last Incantation / floor for "make it…" refinements. */
export const InterpretRequest = z.object({
  text: z.string().transform((s) => s.trim().slice(0, MAX_INPUT_LENGTH)),
  context: z
    .object({
      incantation: z.unknown().optional(),
      floor: z.unknown().optional(),
      /** Current chapter lore, so the LLM gives story-aware replies in llm mode. */
      storyContext: z.string().max(600).optional(),
    })
    .optional()
    .catch(undefined),
});
export type InterpretRequest = z.output<typeof InterpretRequest>;

const nullToUndefined = (v: unknown): unknown => (v === null ? undefined : v);

const ResponseObject = z.object({
  intent: z.unknown().optional(),
  incantation: z.preprocess(nullToUndefined, IncantationSpec.optional()),
  floor: z.preprocess(nullToUndefined, FloorSpec.optional()),
  reply: z.preprocess(nullToUndefined, text(400, '').optional()),
  mode: z.enum(LLM_MODES).optional().catch(undefined),
  source: z.enum(RESPONSE_SOURCES).optional().catch(undefined),
});

/**
 * InterpretResponse (CLAUDE.md): { intent, incantation?, floor?, reply? } plus backend metadata.
 * The intent is made consistent with the payload: "forge" needs an Incantation, "build" a floor,
 * and anything without either becomes a "reply" (with a default line if empty).
 */
export const InterpretResponse = z
  .preprocess((v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined), ResponseObject)
  .transform((r) => {
    const said = typeof r.intent === 'string' ? r.intent.toLowerCase() : '';
    let intent: Intent;
    if (said === 'forge' && r.incantation) intent = 'forge';
    else if (said === 'build' && r.floor) intent = 'build';
    else if (r.incantation) intent = 'forge';
    else if (r.floor) intent = 'build';
    else intent = 'reply';
    const reply = r.reply || (intent === 'reply' ? 'The Spire is silent.' : undefined);
    return {
      intent,
      ...(intent === 'forge' && r.incantation ? { incantation: r.incantation } : {}),
      ...(intent === 'build' && r.floor ? { floor: r.floor } : {}),
      ...(reply ? { reply } : {}),
      ...(r.mode ? { mode: r.mode } : {}),
      ...(r.source ? { source: r.source } : {}),
    };
  });
export type InterpretResponse = z.output<typeof InterpretResponse>;

export function parseInterpretResponse(input: unknown): { ok: true; value: InterpretResponse } | { ok: false; error: string } {
  const r = InterpretResponse.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: z.prettifyError(r.error) };
}
