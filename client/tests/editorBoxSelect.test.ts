// Selecting by a box on the Scene view (PF-6 Revisions 01, etapa 3), without a screen: as in Unity, the pieces
// whose drawing touches the box, projected by the camera (perspective or orthographic); what's behind the camera
// or hidden doesn't count; a big floor under the box does (it touches it); Shift adds, Ctrl toggles.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { clipNear, combineBox, piecesInRect, polygonTouchesRect, rectToNdc, triangleTouchesRect, viewProjection } from '../editor/boxSelect';

const R = { x0: -0.2, y0: -0.2, x1: 0.2, y1: 0.2 };

describe('projeção e retângulo', () => {
  it('o retângulo arrastado em pixels vira coordenadas da vista, em qualquer direção', () => {
    const r = rectToNdc({ x: 700, y: 100 }, { x: 300, y: 400 }, { left: 100, top: 50, width: 800, height: 600 });
    expect(r.x0).toBeCloseTo(-0.5, 9);
    expect(r.x1).toBeCloseTo(0.5, 9);
    expect(r.y0).toBeCloseTo(-1 / 6, 9);
    expect(r.y1).toBeCloseTo(5 / 6, 9);
  });

  it('um polígono toca o retângulo por dentro, por cima ou cruzando; o que só tem a caixa por perto não toca', () => {
    expect(polygonTouchesRect([{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0, y: 0.1 }], R)).toBe(true);
    expect(polygonTouchesRect([{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 0, y: 5 }], R)).toBe(true);
    expect(polygonTouchesRect([{ x: -1, y: 0 }, { x: 1, y: 0.05 }, { x: 1, y: -0.05 }], R)).toBe(true);
    expect(polygonTouchesRect([{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.5, y: 0.6 }], R)).toBe(false);
    // A thin diagonal sliver: its bounds overlap the box's corner, the sliver itself passes by.
    expect(polygonTouchesRect([{ x: 0.15, y: 0.6 }, { x: 0.6, y: 0.15 }, { x: 0.61, y: 0.16 }], R)).toBe(false);
    expect(polygonTouchesRect([], R)).toBe(false);
  });

  it('o triângulo atrás da câmera é cortado no plano de perto', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 0, 0);
    cam.updateMatrixWorld();
    const vp = viewProjection(cam);
    const clip = [new THREE.Vector3(0, 0, -5), new THREE.Vector3(1, 0, 5), new THREE.Vector3(-1, 0, 5)].map((p) => new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(vp));
    const cut = clipNear(clip);
    expect(cut.length).toBe(3);
    for (const v of cut) expect(v.z + v.w).toBeGreaterThanOrEqual(-1e-9);
    // Wholly behind: nothing; in front, under the box: touches.
    expect(triangleTouchesRect(new THREE.Vector3(0, 0, 5), new THREE.Vector3(1, 0, 6), new THREE.Vector3(-1, 0, 6), vp, R)).toBe(false);
    expect(triangleTouchesRect(new THREE.Vector3(0, 0, -5), new THREE.Vector3(0.1, 0, -5), new THREE.Vector3(0, 0.1, -5), vp, R)).toBe(true);
  });
});

/** Three crates in a row, a floor under them, one crate behind the camera and a hidden one. */
function scene() {
  const g = (id: string, o: THREE.Object3D) => {
    const grp = new THREE.Group();
    grp.userData.peca = id;
    grp.add(o);
    return [id, grp] as [string, THREE.Object3D];
  };
  const box = (x: number, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    m.position.set(x, 0.5, z);
    return m;
  };
  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.1, 40), new THREE.MeshBasicMaterial());
  floor.position.y = -0.05;
  const hidden = box(0.3);
  hidden.visible = false;
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial(), 2);
  inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-8, 0.25, 0));
  inst.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0.2, 0.25, 0.4));
  return [g('esq', box(-5)), g('meio', box(0)), g('dir', box(5)), g('chao', floor), g('atras', box(0, 30)), g('oculta', hidden), g('instancias', inst)];
}

describe('seleção por caixa', () => {
  it('perspectiva: o que encosta no retângulo entra (o chão também, mesmo encoberto); atrás da câmera e oculto não', () => {
    const cam = new THREE.PerspectiveCamera(60, 1.5, 0.05, 400);
    cam.position.set(0, 6, 12);
    cam.lookAt(0, 0.5, 0);
    cam.updateMatrixWorld();
    const pieces = scene();
    const center = new THREE.Vector3(0, 0.5, 0).project(cam);
    const r = { x0: center.x - 0.05, y0: center.y - 0.05, x1: center.x + 0.05, y1: center.y + 0.05 };
    // The floor behind the crate counts too: what's under the box counts even when something hides it.
    expect(piecesInRect(cam, r, pieces)).toEqual(['meio', 'chao', 'instancias']);
    // A wide box across the row picks the three crates, the floor and the instanced one (one of its copies).
    const wide = { x0: -0.95, y0: center.y - 0.3, x1: 0.95, y1: center.y + 0.3 };
    expect(piecesInRect(cam, wide, pieces)).toEqual(['esq', 'meio', 'dir', 'chao', 'instancias']);
    // Above the horizon of the map: nothing.
    expect(piecesInRect(cam, { x0: -1, y0: 0.9, x1: 1, y1: 1 }, pieces)).toEqual([]);
  });

  it('ortográfica de cima: o retângulo pega o que está embaixo dele', () => {
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 1000);
    cam.position.set(0, 20, 0);
    cam.rotation.set(-Math.PI / 2, 0, 0);
    cam.updateMatrixWorld();
    const pieces = scene().filter(([id]) => id !== 'chao');
    // x from -6 to -4 in the world: the left crate only (the instanced copy at -8 stays out).
    expect(piecesInRect(cam, { x0: -0.6, y0: -0.1, x1: -0.4, y1: 0.1 }, pieces)).toEqual(['esq']);
    // A strip down the middle: the middle crate and the instanced copy beside it (the hidden one doesn't count).
    expect(piecesInRect(cam, { x0: -0.1, y0: -1, x1: 0.1, y1: 1 }, pieces)).toEqual(['meio', 'instancias']);
  });

  it('Shift soma, Ctrl alterna, sem nada substitui', () => {
    expect(combineBox(['a', 'b'], ['b', 'c'], 'replace')).toEqual(['b', 'c']);
    expect(combineBox(['a', 'b'], ['b', 'c'], 'add')).toEqual(['a', 'b', 'c']);
    expect(combineBox(['a', 'b'], ['b', 'c'], 'toggle')).toEqual(['a', 'c']);
  });
});
