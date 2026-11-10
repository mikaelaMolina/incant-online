import type { LlmMode } from '../../src/schemas/interpret.js';

export type Env = Readonly<Record<string, string | undefined>>;

/** Server environment (Vercel / Node). Typed locally so the client build never needs Node types. */
export function serverEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {};
}

/** Fast model by default, for low latency. Override with LLM_MODEL. */
export const DEFAULT_LLM_MODEL = 'claude-haiku-5-5';

export interface ModeConfig {
  mode: LlmMode;
  model: string;
  apiKey: string | undefined;
  /** Why the effective mode differs from what was asked for, if it does. */
  note?: string;
}

/**
 * LLM_MODE=mock | llm. Default: llm when ANTHROPIC_API_KEY is set, otherwise mock.
 * LLM_MODE=llm without a key falls back to mock (never an error).
 */
export function resolveMode(env: Env): ModeConfig {
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || undefined;
  const model = env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL;
  const asked = env.LLM_MODE?.trim().toLowerCase();
  if (asked === 'mock') return { mode: 'mock', model, apiKey };
  if (!apiKey) {
    return {
      mode: 'mock',
      model,
      apiKey,
      ...(asked === 'llm' ? { note: 'LLM_MODE=llm but ANTHROPIC_API_KEY is missing: using mock mode.' } : {}),
    };
  }
  return { mode: 'llm', model, apiKey };
}
