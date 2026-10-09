// The game's color picker without a screen (PF-33, client/ui/colorPicker.ts): the recent colors (at most 10, no
// repeats), "Combina", where the square's cursor stops (the neon edge of a big piece's main color, the floor of
// brightness) and the house palette in groups. The controller on its sliders: client/ui/padNav.ts.
import { describe, expect, it } from 'bun:test';
import { chroma, hexToHsv, hexToRgb, MAX_CHROMA, MIN_VALUE } from '@shared/color';
import { houseGroups, limitSv, matchingColors, parseRecent, pushRecent, RECENT_MAX, SHADE } from '../ui/colorPickerRules';
import { FOCUSABLE, sliderBack, sliderKey, sliderPress } from '../ui/padNavRules';

describe('seletor de cor: Recentes e Combina', () => {
  it('Recentes: a última primeiro, no máximo 10, sem repetir', () => {
    let list: string[] = [];
    for (let i = 0; i < 14; i++) list = pushRecent(list, `#0000${(i + 16).toString(16)}`);
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]).toBe('#00001d');
    // Picked again: back to the front, not twice.
    list = pushRecent(list, '#00001A');
    expect(list[0]).toBe('#00001a');
    expect(new Set(list).size).toBe(list.length);
    expect(list).toHaveLength(RECENT_MAX);
    // What's kept in the browser is read back clean.
    expect(parseRecent(JSON.stringify(['#abc', 'nada', '#AABBCC', 42, '#123456']))).toEqual(['#aabbcc', '#123456']);
    expect(parseRecent('{quebrado')).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
  });

  it('Combina: tom sobre tom (× 0,72), as cores já usadas e a vizinha de matiz dessaturada, dentro do limite', () => {
    const current = '#3e5878';
    const used = ['#a89a6e', '#3e5878', '#ff00aa'];
    const list = matchingColors(current, used, 'tronco', 0);
    const [r, g, b] = hexToRgb(current);
    expect(list[0]).toBe(`#${[r, g, b].map((c) => Math.round(c * SHADE).toString(16).padStart(2, '0')).join('')}`);
    expect(list).toContain('#a89a6e');
    expect(list).not.toContain(current);
    // The neon color worn on a small item comes toned down for a big piece's main color.
    expect(list).not.toContain('#ff00aa');
    for (const c of list) expect(chroma(c)).toBeLessThanOrEqual(MAX_CHROMA);
    // A desaturated hue neighbour.
    const h0 = hexToHsv(current).h;
    expect(list.some((c) => Math.abs(Math.abs(hexToHsv(c).h - h0) - 30) < 3 && hexToHsv(c).s < hexToHsv(current).s)).toBe(true);
    expect(new Set(list).size).toBe(list.length);
    expect(matchingColors(current, ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'], 'cabeca', 0, 5)).toHaveLength(5);
  });

  it('o cursor para na borda do neon (só na principal das peças grandes) e no piso de brilho', () => {
    expect(limitSv(1, 1, 'tronco', 0)).toEqual({ s: MAX_CHROMA, v: 1, limit: 'neon' });
    expect(limitSv(1, 1, 'tronco', 1)).toEqual({ s: 1, v: 1, limit: null });
    expect(limitSv(1, 1, 'cabeca', 0).limit).toBeNull();
    expect(limitSv(0.3, 0, 'cabeca', 0)).toEqual({ s: 0.3, v: MIN_VALUE, limit: 'escuro' });
    const mid = limitSv(0.5, 0.8, 'baixo', 0);
    expect(mid.limit).toBeNull();
    expect(limitSv(2, -1, 'sobreposicao', 0).v).toBe(MIN_VALUE);
  });

  it('paleta da casa: Neutros, Terrosos, Frios e Couros na principal das peças grandes; mais Metais e Acentos no resto', () => {
    const big = houseGroups('tronco', 0);
    expect(big.map((g) => g.family)).toEqual(['fabricNeutral', 'fabricEarth', 'fabricCold', 'leather']);
    expect(big.flatMap((g) => g.colors)).toHaveLength(22);
    const small = houseGroups('pulsoE', 0);
    expect(small.map((g) => g.family)).toEqual(['fabricNeutral', 'fabricEarth', 'fabricCold', 'leather', 'metal', 'accent']);
    expect(small.flatMap((g) => g.colors)).toHaveLength(33);
    expect(small[0].colors[0]).toEqual({ hex: '#1f2226', name: 'black' });
  });
});

describe('controle nos sliders do seletor (PadNav)', () => {
  const square = { twoD: true, vertical: false };
  const hue = { twoD: false, vertical: false };

  it('os sliders entram na navegação', () => {
    expect(FOCUSABLE).toContain('[role="slider"]');
  });

  it('quadrado: X entra no modo ajuste, o direcional move o cursor, X confirma e O desfaz', () => {
    // Not adjusting: the D-pad moves the focus.
    expect(sliderKey(square, false, 'left')).toBeNull();
    expect(sliderPress(square, false)).toEqual({ key: null, adjusting: true });
    for (const [dir, key] of [['left', 'ArrowLeft'], ['right', 'ArrowRight'], ['up', 'ArrowUp'], ['down', 'ArrowDown']] as const) expect(sliderKey(square, true, dir)).toBe(key);
    expect(sliderPress(square, true)).toEqual({ key: 'Enter', adjusting: false });
    expect(sliderBack(true)).toBe('Escape');
    expect(sliderBack(false)).toBeNull();
  });

  it('faixa de matiz: o direcional ao longo dela muda a cor, o outro eixo muda o foco; X confirma', () => {
    expect(sliderKey(hue, false, 'right')).toBe('ArrowRight');
    expect(sliderKey(hue, false, 'left')).toBe('ArrowLeft');
    expect(sliderKey(hue, false, 'down')).toBeNull();
    expect(sliderKey({ twoD: false, vertical: true }, false, 'up')).toBe('ArrowUp');
    expect(sliderPress(hue, false)).toEqual({ key: 'Enter', adjusting: false });
  });
});
