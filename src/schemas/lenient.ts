import { z } from 'zod';
import { closest } from './fuzzy';

/**
 * Lenient field builders. The LLM's output is never trusted to be in range:
 * numbers are clamped, enums map to the nearest allowed value, bad values fall back to defaults.
 * Only structurally hopeless input (e.g. a FloorSpec that isn't an object) fails to parse.
 */

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Base for every lenient field. `.optional()` matters: in zod 4 a missing object key never reaches
 * a plain `anyInput().transform()`, so the default would not be applied.
 */
const anyInput = () => z.unknown().optional();

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/** Number clamped to [min, max]; non-numbers become `fallback`. */
export const num = (min: number, max: number, fallback: number) =>
  anyInput().transform((v): number => {
    const n = toNumber(v);
    return Number.isFinite(n) ? clamp(n, min, max) : fallback;
  });

/** Integer clamped to [min, max]; non-numbers become `fallback`. */
export const int = (min: number, max: number, fallback: number) =>
  anyInput().transform((v): number => {
    const n = toNumber(v);
    return Number.isFinite(n) ? clamp(Math.round(n), min, max) : fallback;
  });

/** Angle in degrees, wrapped to [0, 360). */
export const degrees = (fallback = 0) =>
  anyInput().transform((v): number => {
    const n = toNumber(v);
    if (!Number.isFinite(n)) return fallback;
    return ((n % 360) + 360) % 360;
  });

/** Trimmed string cut to `max` characters; non-strings or empty strings become `fallback`. */
export const text = (max: number, fallback: string) =>
  anyInput().transform((v): string => {
    const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
    return s || fallback;
  });

/** One of `values`; unknown strings map to the nearest value, anything else to `fallback`. */
export const fuzzyEnum = <const T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
  aliases: Readonly<Record<string, T[number]>> = {},
) =>
  anyInput().transform((v): T[number] =>
    typeof v === 'string' ? (closest(v, values, { aliases }) ?? fallback) : fallback,
  );

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHex(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const m = HEX.exec(v.trim());
  if (!m?.[1]) return undefined;
  const h = m[1].toLowerCase();
  return '#' + (h.length === 3 ? [...h].map((c) => c + c).join('') : h);
}

/** "#rrggbb" (accepts "#rgb" and missing "#"); anything else becomes `fallback`. */
export const hexColor = (fallback: string) => anyInput().transform((v): string => parseHex(v) ?? fallback);

/** Optional "#rrggbb": invalid values become undefined instead of failing. */
export const optionalHexColor = () => anyInput().transform((v): string | undefined => parseHex(v));

/** Array whose items are parsed one by one; items that fail are dropped, the rest capped at `max`. */
export const lenientArray = <S extends z.ZodType>(item: S, max: number) =>
  anyInput().transform((v): z.output<S>[] => {
    if (!Array.isArray(v)) return [];
    const out: z.output<S>[] = [];
    for (const raw of v) {
      const r = item.safeParse(raw);
      if (r.success) out.push(r.data);
      if (out.length >= max) break;
    }
    return out;
  });

/** Treat a missing / non-object value as {} so every field falls back to its default. */
export const objectOrEmpty = (v: unknown): unknown => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
