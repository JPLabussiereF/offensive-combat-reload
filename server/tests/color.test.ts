// Item colors (shared/color.ts, PF-33): any color for clothes, accessories and tactical gear, within two limits that the
// client's color picker shows and the server applies when a look is saved or read (sanitizeAppearance).
import { describe, expect, it } from 'bun:test';
import { SLOTS, type Slot } from '@shared/catalog';
import { chroma, clampItemColor, colorLimit, hexToHsv, hexToRgb, hsvToHex, isBigMain, MAX_CHROMA, MIN_VALUE, normalizeHex } from '@shared/color';
import { ALL_ITEM_COLORS, CLOTH_COLORS } from '@shared/palette';

/** Value (max of R, G, B), 0–1. */
const value = (hex: string) => Math.max(...hexToRgb(hex)) / 255;

/** A repeatable stream of numbers (no flaky test). */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe('cores livres das peças', () => {
  it('normaliza o código: #abc, maiúsculas, sem # e espaços; o resto não é cor', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('#AbCdEf')).toBe('#abcdef');
    expect(normalizeHex(' 1F2226 ')).toBe('#1f2226');
    expect(normalizeHex('F0A')).toBe('#ff00aa');
    for (const bad of ['', '#12', '#12345', '#1234567', 'red', '#ggg000', 42, null, undefined, ['#fff']]) expect(normalizeHex(bad)).toBeNull();
  });

  it('ida e volta entre código e HSV dá a mesma cor', () => {
    const r = rng(7);
    for (let i = 0; i < 500; i++) {
      const hex = `#${Math.floor(r() * 0xffffff).toString(16).padStart(6, '0')}`;
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00ff00').h).toBe(120);
    expect(hexToHsv('#808080').s).toBe(0);
  });

  it('as 22 cores de tecido valem na cor principal das peças grandes e as 33 de item em qualquer canal, sem mudar', () => {
    expect(CLOTH_COLORS).toHaveLength(22);
    expect(ALL_ITEM_COLORS).toHaveLength(33);
    for (const slot of ['tronco', 'sobreposicao', 'baixo'] as Slot[]) for (const c of CLOTH_COLORS) expect(clampItemColor(c, slot, 0)).toBe(c);
    for (const slot of SLOTS) for (const ch of [0, 1, 2]) for (const c of ALL_ITEM_COLORS) if (!isBigMain(slot, ch)) expect(clampItemColor(c, slot, ch)).toBe(c);
    // The most saturated fabric (mustard) is just under the limit; the palette's black just over the floor.
    expect(chroma('#b8912e')).toBeLessThanOrEqual(MAX_CHROMA);
    expect(value('#1f2226')).toBeGreaterThanOrEqual(MIN_VALUE);
  });

  it('principal das peças grandes não fica neon (mantém o brilho e o tom); as outras cores ficam livres', () => {
    const neon = '#ff00aa';
    const big = clampItemColor(neon, 'tronco', 0)!;
    expect(chroma(big)).toBeLessThanOrEqual(MAX_CHROMA);
    expect(value(big)).toBe(1);
    expect(Math.abs(hexToHsv(big).h - hexToHsv(neon).h)).toBeLessThan(1.5);
    expect(colorLimit(neon, 'tronco', 0)).toBe('neon');
    // Secondary channel, small items: free.
    expect(clampItemColor(neon, 'tronco', 1)).toBe(neon);
    expect(clampItemColor(neon, 'cabeca', 0)).toBe(neon);
    expect(colorLimit(neon, 'cabeca', 0)).toBeNull();
    // An accent of the palette on the main color of a big piece is toned down too.
    expect(chroma(clampItemColor('#e0702a', 'baixo', 0)!)).toBeLessThanOrEqual(MAX_CHROMA);
  });

  it('piso de brilho em todos os canais: nada de preto puro (o mais escuro fica logo abaixo do preto da paleta)', () => {
    for (const slot of ['tronco', 'cabeca', 'maos'] as Slot[]) {
      for (const ch of [0, 1, 2]) {
        expect(clampItemColor('#000000', slot, ch)).toBe('#1f1f1f');
        const navy = clampItemColor('#000814', slot, ch)!;
        expect(value(navy)).toBeGreaterThanOrEqual(MIN_VALUE);
        // Same hue (scaled up, not grayed).
        expect(hexToRgb(navy)[2]).toBeGreaterThan(hexToRgb(navy)[0]);
      }
    }
    expect(colorLimit('#050505', 'pulsoE', 2)).toBe('escuro');
    // Darker than the floor but still above it once scaled: the palette's black is untouched.
    expect(value('#1f1f1f')).toBeLessThan(value('#1f2226'));
  });

  it('ajustar e ajustar de novo não muda nada (idempotente), em qualquer slot e canal', () => {
    const r = rng(42);
    for (let i = 0; i < 2000; i++) {
      const hex = `#${Math.floor(r() * 0xffffff).toString(16).padStart(6, '0')}`;
      const slot = SLOTS[Math.floor(r() * SLOTS.length)];
      const ch = Math.floor(r() * 3);
      const once = clampItemColor(hex, slot, ch)!;
      expect(clampItemColor(once, slot, ch)).toBe(once);
      expect(colorLimit(once, slot, ch)).toBeNull();
      if (isBigMain(slot, ch)) expect(chroma(once)).toBeLessThanOrEqual(MAX_CHROMA);
      expect(value(once)).toBeGreaterThanOrEqual(MIN_VALUE);
    }
    expect(clampItemColor('nada', 'tronco', 0)).toBeNull();
  });
});
