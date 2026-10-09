// The color picker without a screen (PF-33): the recent colors, "Combina", where the square's cursor stops and the
// house palette. client/ui/colorPicker.ts draws them; client/tests/colorPicker.test.ts runs them (this file stays free
// of the DOM: the server's typecheck reaches it through the client's tests).
import { suggestedColors } from '@shared/appearance';
import type { Slot } from '@shared/catalog';
import { clampItemColor, hexToHsv, hexToRgb, hsvToHex, isBigMain, MAX_CHROMA, MIN_VALUE, normalizeHex, rgbToHex } from '@shared/color';
import { FAMILIES, type Family } from '@shared/palette';

/** The house palette's groups, in order (palette families of the item colors). */
const GROUPS: Family[] = ['fabricNeutral', 'fabricEarth', 'fabricCold', 'leather', 'metal', 'accent'];

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Where the recent colors are kept (this browser only). */
export const RECENT_KEY = 'oc.cores.recentes';
export const RECENT_MAX = 10;

/** The recent colors with `hex` first: at most 10, no repeats. */
export function pushRecent(list: readonly string[], hex: string): string[] {
  const h = normalizeHex(hex);
  if (!h) return list.slice(0, RECENT_MAX);
  return [h, ...list.filter((c) => c !== h)].slice(0, RECENT_MAX);
}

/** A kept list read back (anything that isn't a list of colors is dropped). */
export function parseRecent(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const c of v) {
      const h = normalizeHex(c);
      if (h && !out.includes(h)) out.push(h);
    }
    return out.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** The shade rule of the character's items (Character.channelsFor: secondary = primary × 0.72). */
export const SHADE = 0.72;

/**
 * "Combina": colors that go with `current` on this channel: tone on tone (× 0.72, the items' shade rule), the colors
 * the look already wears, and the hue neighbours (± 30°) at half the saturation. Within the channel's limits, without
 * `current`, no repeats, at most `max`.
 */
export function matchingColors(current: string, used: readonly string[], slot: Slot, channel: number, max = 8): string[] {
  const cur = normalizeHex(current);
  if (!cur) return [];
  const [r, g, b] = hexToRgb(cur);
  const { h, s, v } = hexToHsv(cur);
  const raw = [rgbToHex([r * SHADE, g * SHADE, b * SHADE]), hsvToHex({ h: h + 30, s: s * 0.5, v }), hsvToHex({ h: h - 30, s: s * 0.5, v }), ...used];
  const out: string[] = [];
  for (const c of raw) {
    const x = clampItemColor(c, slot, channel);
    if (x && x !== cur && !out.includes(x)) out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * A point of the saturation × value square (0–1 each, value up) within the channel's limits: the value never under
 * the floor, the saturation never past the neon edge (S × V = chroma) of a big piece's main color. `limit` says
 * which one stopped it.
 */
export function limitSv(s: number, v: number, slot: Slot, channel: number): { s: number; v: number; limit: 'neon' | 'escuro' | null } {
  let limit: 'neon' | 'escuro' | null = null;
  s = clamp01(s);
  v = clamp01(v);
  if (v < MIN_VALUE) {
    v = MIN_VALUE;
    limit = 'escuro';
  }
  if (isBigMain(slot, channel) && s * v > MAX_CHROMA) {
    s = MAX_CHROMA / v;
    limit = 'neon';
  }
  return { s, v, limit };
}

/** The house palette for a channel: its suggested colors in their families, each color once, with its name. */
export function houseGroups(slot: Slot, channel: number): { family: Family; colors: { hex: string; name: string }[] }[] {
  const allowed = new Set(suggestedColors(slot, channel));
  const seen = new Set<string>();
  return GROUPS.map((family) => ({
    family,
    colors: FAMILIES[family].filter(([, hex]) => allowed.has(hex) && !seen.has(hex) && seen.add(hex)).map(([name, hex]) => ({ hex, name })),
  })).filter((g) => g.colors.length);
}
