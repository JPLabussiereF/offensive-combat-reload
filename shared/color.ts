// Item colors (PF-33): the player picks any color for clothes, accessories and tactical gear, with two limits that
// keep the character readable (style guide, "Paleta"): the main color of the big pieces (top, overlay, bottom) is
// never more saturated than the palette's most saturated fabric (mustard, chroma 0.54: no neon), and no item color
// is darker than just under the palette's black (#1f2226, value 0.15: no pure black to hide in). Skin, hair and
// eyes stay on the palette (shared/palette.ts `snap`). Pure: shared by the client (the color picker shows the
// limits and the adjusted color) and the server (sanitizeAppearance, when a look is saved and read).
//
// The limits are checked on the 8-bit channels, so a clamped color is a fixed point: clamping it again gives the
// same hex (what the server stores is stable).
import { BIG_SLOTS, type Slot } from './catalog';

/** Highest chroma (max − min of R, G, B, 0–1) of the main color of a big piece. */
export const MAX_CHROMA = 0.55;
/** Lowest value (max of R, G, B, 0–1) of any item color. */
export const MIN_VALUE = 0.12;

/** The same limits on the 8-bit channels (0–255). */
const MAX_CHROMA_8 = Math.floor(MAX_CHROMA * 255);
const MIN_VALUE_8 = Math.ceil(MIN_VALUE * 255);

export type Rgb = [number, number, number];
/** Hue in degrees (0–360), saturation and value 0–1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** '#rrggbb' in lower case from '#abc', 'ABC', ' #AbCdEf '…; null when it isn't a color. */
export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().toLowerCase();
  if (s.startsWith('#')) s = s.slice(1);
  if (/^[0-9a-f]{3}$/.test(s)) s = s.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
}

/** The 8-bit channels of a normalized hex ('#rrggbb'). */
export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsv([r, g, b]: Rgb): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max / 255 };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export const hexToHsv = (hex: string): Hsv => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (c: Hsv): string => rgbToHex(hsvToRgb(c));

/** Chroma (max − min of R, G, B), 0–1. */
export function chroma(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/** Whether a channel of a slot is the main color of a big piece (the one with the saturation limit). */
export const isBigMain = (slot: Slot, channel: number): boolean => channel === 0 && BIG_SLOTS.includes(slot);

/** The limits of a channel of a slot: the highest chroma (null: none) and the lowest value. */
export function itemColorLimits(slot: Slot, channel: number): { maxChroma: number | null; minValue: number } {
  return { maxChroma: isBigMain(slot, channel) ? MAX_CHROMA : null, minValue: MIN_VALUE };
}

/** What the limits would change in a color: too dark, too saturated (neon), or nothing. */
export function colorLimit(hex: string, slot: Slot, channel: number): 'escuro' | 'neon' | null {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  if (max < MIN_VALUE_8) return 'escuro';
  if (isBigMain(slot, channel) && max - Math.min(r, g, b) > MAX_CHROMA_8) return 'neon';
  return null;
}

/**
 * Any value as an item color for a channel of a slot: normalized, brought up to the lowest value (scaling the
 * channels: same hue and saturation) and, on the main color of a big piece, down to the highest chroma (keeping the
 * value and the hue). Null when it isn't a color. Clamping a clamped color changes nothing.
 */
export function clampItemColor(raw: unknown, slot: Slot, channel: number): string | null {
  const hex = normalizeHex(raw);
  if (!hex) return null;
  let rgb = hexToRgb(hex);
  let max = Math.max(...rgb);
  if (max < MIN_VALUE_8) {
    // Pure black has no hue: the darkest gray allowed.
    rgb = max === 0 ? [MIN_VALUE_8, MIN_VALUE_8, MIN_VALUE_8] : (rgb.map((c) => Math.round((c * MIN_VALUE_8) / max)) as Rgb);
    max = MIN_VALUE_8;
  }
  const min = Math.min(...rgb);
  if (isBigMain(slot, channel) && max - min > MAX_CHROMA_8) {
    // Toward the gray of the same value: the min channel lands on max − limit, the middle one keeps its ratio (hue).
    const k = MAX_CHROMA_8 / (max - min);
    rgb = rgb.map((c) => (c === max ? max : Math.round(max - (max - c) * k))) as Rgb;
  }
  return rgbToHex(rgb);
}
