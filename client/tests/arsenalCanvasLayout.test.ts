// The Arsenal canvas of the home (client/ui/arsenalCanvasLayout.ts, PF-9): a frame per row in order, the row's
// weapons side by side, the upgrades under the weapon shown in rows by kind (sights, grenade modes, the rest; its
// progression's, locked when the weapon is), the links' states, and the camera: zoom clamped to 25%..200% around a
// fixed point, "show all" fitting the free width.
import { describe, expect, it } from 'bun:test';
import { DEFAULT_CHOICE, NO_XP, sanitizeChoice, type WeaponId, type WeaponXp } from '@shared/progression';
import { arsenalTree, upgradeNodes, type RowId } from '../ui/arsenalTree';
import { canvasLayout, fitView, homeView, revealView, rowView, UG, UH, URG, UW, UX0, WG, WH, WW, ZOOM_MAX, ZOOM_MIN, zoomAt, type Cam } from '../ui/arsenalCanvasLayout';

/** The layout the canvas draws for these points and this choice, with `shown` overriding the weapon under a row. */
function layoutFor(xp: WeaponXp, raw: unknown = DEFAULT_CHOICE, shown: Partial<Record<RowId, WeaponId>> = {}) {
  const choice = sanitizeChoice(raw, xp);
  const rows = arsenalTree(xp, choice);
  const sw: Partial<Record<RowId, WeaponId>> = {};
  const ups: Partial<Record<RowId, ReturnType<typeof upgradeNodes>>> = {};
  for (const r of rows) {
    const w = shown[r.id] ?? (r.armas.find((n) => n.equipada) ?? r.armas[0]).arma;
    sw[r.id] = w;
    ups[r.id] = upgradeNodes(w, xp, choice);
  }
  return canvasLayout(rows, sw, ups);
}

describe('canvas do Arsenal: layout', () => {
  it('quatro quadros, um embaixo do outro, com 7, 7, 7 e 1 armas lado a lado', () => {
    const L = layoutFor(NO_XP);
    expect(L.frames.map((f) => f.id)).toEqual(['primaria', 'secundaria', 'faca', 'granada']);
    for (let i = 1; i < L.frames.length; i++) expect(L.frames[i].y).toBe(L.frames[i - 1].y + L.frames[i - 1].h + 56);
    const count = (row: RowId) => L.weapons.filter((w) => w.row === row).length;
    expect([count('primaria'), count('secundaria'), count('faca'), count('granada')]).toEqual([7, 7, 7, 1]);
    // Side by side, with the design's gap; every weapon inside its frame.
    const rifles = L.weapons.filter((w) => w.row === 'primaria');
    expect(rifles.map((w) => w.x)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => i * (WW + WG)));
    for (const w of L.weapons) {
      const f = L.frames.find((x) => x.id === w.row)!;
      expect(w.x >= f.x && w.x + WW <= f.x + f.w && w.y >= f.y && w.y + WH <= f.y + f.h).toBe(true);
    }
    // The world's bounds hold every frame.
    for (const f of L.frames) expect(f.x >= L.bounds.x && f.y >= L.bounds.y && f.x + f.w <= L.bounds.x + L.bounds.w && f.y + f.h <= L.bounds.y + L.bounds.h).toBe(true);
  });

  it('as melhorias da arma mostrada ficam em linhas por tipo: miras, modos da granada e o resto, cada uma com rótulo', () => {
    const L = layoutFor(NO_XP);
    // Each row of upgrades: its kind (from its label) and its ids in level order.
    const rowsOf = (row: RowId) => {
      const ys = [...new Set(L.upgrades.filter((u) => u.row === row).map((u) => u.y))].sort((a, b) => a - b);
      return ys.map((y) => ({
        kind: L.labels.find((l) => l.row === row && l.y === y - 24)?.kind,
        ids: L.upgrades.filter((u) => u.row === row && u.y === y).map((u) => u.node.id),
      }));
    };
    expect(rowsOf('primaria')).toEqual([
      { kind: 'mira', ids: ['pontoVermelho', 'luneta', 'holoLupa', 'luneta2x', 'luneta4x'] },
      { kind: 'resto', ids: ['empunhadura', 'pente', 'silenciador'] },
    ]);
    expect(rowsOf('secundaria')).toEqual([
      { kind: 'mira', ids: ['pontoVermelho'] },
      { kind: 'resto', ids: ['gatilho', 'coldre', 'batata'] },
    ]);
    expect(rowsOf('faca')).toEqual([{ kind: 'resto', ids: ['afiador', 'tenis'] }]);
    expect(rowsOf('granada')).toEqual([
      { kind: 'modo', ids: ['mina', 'dupla'] },
      { kind: 'resto', ids: ['cinto', 'polvora'] },
    ]);
    // Every row starts right of the weapon shown (the Standard Rifle in hand), with the design's gaps; the rows
    // stack with room for their labels, and the frame holds the last one.
    const rifle = L.upgrades.filter((u) => u.row === 'primaria');
    const first = rifle.filter((u) => u.y === rifle[0].y);
    expect(first.map((u) => u.x)).toEqual([0, 1, 2, 3, 4].map((j) => UX0 + j * (UW + UG)));
    const second = rifle.filter((u) => u.y !== rifle[0].y);
    expect(second.map((u) => u.x)).toEqual([0, 1, 2].map((j) => UX0 + j * (UW + UG)));
    expect(second[0].y).toBe(first[0].y + UH + URG);
    const frame = L.frames.find((f) => f.id === 'primaria')!;
    expect(second[0].y + UH).toBeLessThanOrEqual(frame.y + frame.h);
    // One trunk per row of the tree, down from the weapon shown.
    expect(L.links.filter((l) => l.kind === 'trunk').length).toBe(4);
    // Another rifle shown: the same rifle upgrades, moved under it. The row ends at the last rifle or at the end of
    // the longest row of upgrades, whichever is further (the Golden Rifle's sights go past the rifles).
    const tia = layoutFor({ ...NO_XP, rifle: 2500 }, DEFAULT_CHOICE, { primaria: 'rifleTia' });
    const tiaX = tia.weapons.find((w) => w.node.arma === 'rifleTia')!.x;
    expect(tia.upgrades.filter((u) => u.row === 'primaria').every((u) => u.arma === 'rifleTia' && u.x >= tiaX + UX0)).toBe(true);
    const lastRifle = 6 * (WW + WG) + WW;
    expect(tia.branchEnd.primaria).toBe(Math.max(lastRifle, tiaX + UX0 + 4 * (UW + UG) + UW));
    const gold = layoutFor(NO_XP, DEFAULT_CHOICE, { primaria: 'rifleOuro' });
    const goldX = 6 * (WW + WG);
    expect(gold.branchEnd.primaria).toBe(goldX + UX0 + 4 * (UW + UG) + UW);
  });

  it('linhas: laranja até a melhoria ligada, tracejada até a trancada; a arma trancada tranca o ramo dela', () => {
    // 2.500 rifle points: red dot and grip unlocked and on, the rest locked.
    const L = layoutFor({ ...NO_XP, rifle: 2500 });
    const chain = L.upgrades.filter((u) => u.row === 'primaria');
    expect(chain.map((u) => [u.node.id, u.on, u.locked])).toEqual([
      ['pontoVermelho', true, false],
      ['luneta', false, true],
      ['holoLupa', false, true],
      ['luneta2x', false, true],
      ['luneta4x', false, true],
      ['empunhadura', true, false],
      ['pente', false, true],
      ['silenciador', false, true],
    ]);
    const links = L.links.filter((l) => l.kind === 'upgrade').slice(0, 8);
    expect(links.map((l) => [l.on, l.locked])).toEqual(chain.map((u) => [u.on, u.locked]));
    // The trunk is solid while something under it can be used.
    expect(L.links.find((l) => l.kind === 'trunk')!.locked).toBe(false);
    // The links between rifles: the locked ones (Fita is unlocked at 1,000) are drawn fainter.
    expect(L.links.filter((l) => l.kind === 'weapon').slice(0, 6).map((l) => l.locked)).toEqual([false, false, true, true, true, true]);
    // The Golden Rifle shown while locked: its upgrades read as locked even where the rifle has them on.
    const gold = layoutFor({ ...NO_XP, rifle: 2500 }, DEFAULT_CHOICE, { primaria: 'rifleOuro' });
    expect(gold.upgrades.filter((u) => u.row === 'primaria').every((u) => u.locked && !u.on)).toBe(true);
    expect(gold.links.find((l) => l.kind === 'trunk')!.locked).toBe(true);
  });
});

describe('canvas do Arsenal: câmera', () => {
  const cam: Cam = { x: 40, y: 76, z: 0.8 };

  it('o zoom fica entre 25% e 200%, com o ponto sob o ponteiro parado', () => {
    const at = (c: Cam, px: number, py: number) => ({ x: (px - c.x) / c.z, y: (py - c.y) / c.z });
    const before = at(cam, 300, 200);
    for (const z of [0.1, 0.5, 1.7, 9]) {
      const next = zoomAt(cam, 300, 200, z);
      expect(next.z).toBe(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)));
      const after = at(next, 300, 200);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it('"Ver tudo" cabe na largura livre; a primeira vista enquadra tudo ou começa no canto a 72%', () => {
    const L = layoutFor(NO_XP);
    const b = L.bounds;
    for (const [aw, vh] of [[1100, 700], [600, 500], [2600, 1400]]) {
      const v = fitView(b, aw, vh);
      expect(v.z).toBeGreaterThanOrEqual(ZOOM_MIN);
      expect(v.z).toBeLessThanOrEqual(1);
      // Inside the free width when it fits at all (above the minimum zoom).
      if (v.z > ZOOM_MIN) {
        expect(v.x + b.x * v.z).toBeGreaterThanOrEqual(0);
        expect(v.x + (b.x + b.w) * v.z).toBeLessThanOrEqual(aw);
      }
    }
    // A big screen: centered at up to 100%. A small one: the top left corner at 72%.
    const big = homeView(b, 4000, 3000);
    expect(big.z).toBe(1);
    const small = homeView(b, 900, 600);
    expect(small).toEqual({ z: 0.72, x: 40 - b.x * 0.72, y: 76 - b.y * 0.72 });
    // Jumping to a row frames it between 60% and 100%.
    const knives = L.frames.find((f) => f.id === 'faca')!;
    const r = rowView(knives, 1000, 700);
    expect(r.z).toBeGreaterThanOrEqual(0.6);
    expect(r.z).toBeLessThanOrEqual(1);
  });

  it('o foco num nó fora da tela move a câmera só o necessário para mostrá-lo', () => {
    const node = { x: 3000, y: 900, w: UW, h: 74 };
    const v = revealView(cam, node, 1000, 700);
    expect(v.z).toBe(cam.z);
    const right = v.x + (node.x + node.w) * v.z;
    const bottom = v.y + (node.y + node.h) * v.z;
    expect(right).toBeCloseTo(1000 - 48, 6);
    expect(bottom).toBeCloseTo(700 - 48, 6);
    // Already in view: nothing moves.
    const seen = { x: 100, y: 100, w: UW, h: 74 };
    expect(revealView(cam, seen, 1000, 700)).toEqual(cam);
  });
});
