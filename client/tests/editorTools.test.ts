// The toolbar's handle settings (PF-6 Revisions 01, etapa 3), without a screen: snapping free by default, on
// while Ctrl is held or always with the grid button (and its steps); Pivot or Center (where the gizmo sits and
// the point the selection turns and scales about); Local or Global (the gizmo's axes); the settings kept in the
// browser and read back.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { MAP_FORMAT, type MapData } from '@shared/mapData';
import { DEFAULT_PREFS, gizmoAxes, gizmoFrame, gizmoSpace, MOVE_RANGE, parseStep, readPrefs, snapSteps, snapTo, TURN_RANGE, writePrefs } from '../editor/tools';
import { moveTree, scaleTree } from '../editor/groups';
import { handleDelta } from '../editor/transform';

const near = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-4) => expect(a.distanceTo(b)).toBeLessThan(eps);

describe('encaixe (Ctrl e o botão de grade)', () => {
  it('livre por padrão; Ctrl segurado encaixa em 0,5 m, 15° e décimos de escala', () => {
    expect(snapSteps(DEFAULT_PREFS, false)).toEqual({ move: null, turn: null, scale: null });
    const s = snapSteps(DEFAULT_PREFS, true);
    expect(s.move).toBe(0.5);
    expect(s.turn).toBeCloseTo(Math.PI / 12, 12);
    expect(s.scale).toBe(0.1);
  });

  it('o botão de grade deixa sempre ligado, com ou sem Ctrl, nos passos escolhidos', () => {
    const p = { ...DEFAULT_PREFS, grid: true, move: 0.25, turn: 45 };
    for (const ctrl of [false, true]) {
      const s = snapSteps(p, ctrl);
      expect(s.move).toBe(0.25);
      expect(s.turn).toBeCloseTo(Math.PI / 4, 12);
    }
  });

  it('os passos digitados aceitam vírgula e ficam nas faixas', () => {
    expect(parseStep('0,25', MOVE_RANGE)).toBe(0.25);
    expect(parseStep(' 2 ', MOVE_RANGE)).toBe(2);
    expect(parseStep('0', MOVE_RANGE)).toBeNull();
    expect(parseStep('abc', MOVE_RANGE)).toBeNull();
    expect(parseStep('90', TURN_RANGE)).toBe(90);
    expect(parseStep('360', TURN_RANGE)).toBeNull();
    expect(snapTo(1.26, 0.25)).toBeCloseTo(1.25, 12);
    expect(snapTo(1.26, null)).toBe(1.26);
  });

  it('as escolhas voltam do navegador; o que estiver quebrado volta ao padrão', () => {
    const mine = { center: true, global: false, grid: true, move: 1, turn: 30 };
    expect(readPrefs(writePrefs(mine))).toEqual(mine);
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(readPrefs('{quebrado')).toEqual(DEFAULT_PREFS);
    expect(readPrefs('[1,2]')).toEqual(DEFAULT_PREFS);
    expect(readPrefs(JSON.stringify({ center: 'sim', grid: true, move: -3, turn: 30 }))).toEqual({ ...DEFAULT_PREFS, grid: true, turn: 30 });
    // Before etapa 3 the gizmo sat on the active piece in the world's axes: that stays the default.
    expect(DEFAULT_PREFS).toMatchObject({ center: false, global: true, grid: false, move: 0.5, turn: 15 });
  });
});

describe('Pivot/Center e Local/Global', () => {
  const turned = new THREE.Matrix4().compose(new THREE.Vector3(2, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4), new THREE.Vector3(1.5, 1.5, 1.5));
  const box = new THREE.Box3(new THREE.Vector3(-3, 0, -1), new THREE.Vector3(3, 2, 1));

  it('Pivot põe o gizmo na peça ativa; Center no meio da caixa da seleção, com o giro e a escala da ativa', () => {
    expect(gizmoFrame(turned, box, { center: false }).equals(turned)).toBe(true);
    const c = gizmoFrame(turned, box, { center: true });
    const t = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    c.decompose(t, q, s);
    near(t, new THREE.Vector3(0, 1, 0));
    expect(q.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4))).toBeLessThan(1e-6);
    near(s, new THREE.Vector3(1.5, 1.5, 1.5));
    // Without a box (a marker), Center stays on the piece.
    expect(gizmoFrame(turned, null, { center: true }).equals(turned)).toBe(true);
  });

  it('Local alinha os eixos do gizmo à rotação da peça ativa; Global aos do mundo; a ponta de parede sempre no dela', () => {
    expect(gizmoSpace({ global: true })).toBe('world');
    expect(gizmoSpace({ global: false })).toBe('local');
    expect(gizmoSpace({ global: true }, 'x')).toBe('local');
    const [wx, , wz] = gizmoAxes(turned, 'world');
    near(wx, new THREE.Vector3(1, 0, 0));
    near(wz, new THREE.Vector3(0, 0, 1));
    const [lx, ly, lz] = gizmoAxes(turned, 'local');
    const r = Math.SQRT1_2;
    near(lx, new THREE.Vector3(r, 0, -r));
    near(ly, new THREE.Vector3(0, 1, 0));
    near(lz, new THREE.Vector3(r, 0, r));
  });

  /** Two crates 4 m apart, the active one on the right. */
  function pair(): MapData {
    return {
      formato: MAP_FORMAT,
      nome: 'Pivô',
      cartao: { emoji: '🧪', cor: '#aabbcc' },
      ambiente: { ceu: {}, celula: 40, killY: -20 },
      pecas: [
        { id: 'esq', tipo: 'caixote', p: [-2, 0, 0], params: {} },
        { id: 'dir', tipo: 'caixote', p: [2, 0, 0], escala: 1.5, params: {} },
      ],
      arquivos: [],
      spawns: { a: [{ p: [0, 0.2, 0], yaw: 0 }], b: [{ p: [5, 0.2, 0], yaw: 0 }], ffa: [{ p: [0, 0.2, 5], yaw: 0 }] },
      bonecos: [],
      objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
    };
  }
  /** The gizmo turned 90° about the vertical from where it sat. */
  const turn90 = (at: THREE.Vector3) => {
    const start = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z);
    const end = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1));
    return handleDelta(start, end);
  };
  const pos = (pecas: MapData['pecas'], id: string) => new THREE.Vector3(...(pecas.find((p) => p.id === id)!.p ?? [0, 0, 0]));

  it('girar com Center gira a seleção em volta do meio dela; com Pivot, em volta da peça ativa', () => {
    const d = pair();
    const ids = ['esq', 'dir'];
    const center = gizmoFrame(new THREE.Matrix4().makeTranslation(2, 0, 0), new THREE.Box3(new THREE.Vector3(-2.5, 0, -0.5), new THREE.Vector3(2.5, 1, 0.5)), { center: true });
    const byCenter = moveTree(d, ids, turn90(new THREE.Vector3().setFromMatrixPosition(center)));
    near(pos(byCenter, 'esq'), new THREE.Vector3(0, 0, 2));
    near(pos(byCenter, 'dir'), new THREE.Vector3(0, 0, -2));
    expect(byCenter.find((p) => p.id === 'esq')!.yaw).toBeCloseTo(Math.PI / 2, 6);
    const byPivot = moveTree(d, ids, turn90(new THREE.Vector3(2, 0, 0)));
    near(pos(byPivot, 'dir'), new THREE.Vector3(2, 0, 0));
    near(pos(byPivot, 'esq'), new THREE.Vector3(2, 0, 4));
  });

  it('escalar com Center espalha a partir do meio e aumenta o que tem escala', () => {
    const d = pair();
    const next = scaleTree(d, ['esq', 'dir'], new THREE.Vector3(0, 0, 0), 2, () => new THREE.Vector3());
    near(pos(next, 'esq'), new THREE.Vector3(-4, 0, 0));
    near(pos(next, 'dir'), new THREE.Vector3(4, 0, 0));
    expect(next.find((p) => p.id === 'esq')!.escala).toBeCloseTo(2, 6);
    expect(next.find((p) => p.id === 'dir')!.escala).toBeCloseTo(3, 6);
  });
});
