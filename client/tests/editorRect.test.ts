// The Rect tool (T) as numbers (PF-6 Revisions 01, etapa 3): the rectangle on the face that looks at the camera,
// the inside moving the box in that plane, the edges stretching a box-shaped piece by its size (the opposite side
// stays put), the corners scaling the rest evenly from the opposite corner, and snapping.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import type { Peca } from '@shared/mapData';
import { applyStretch, dragRect, dropAxis, handlesOf, rectCorners, rectDelta, stretchable, stretchBox, type RectFrame } from '../editor/rectTool';

const near = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-6) => expect(a.distanceTo(b)).toBeLessThan(eps);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The world box of a selection, seen from above. */
const fromAbove = (mode: RectFrame['mode']): RectFrame => ({ world: new THREE.Matrix4(), min: V(-1, 0, -2), max: V(1, 2, 2), drop: 1, mode });

describe('ferramenta retângulo', () => {
  it('o retângulo fica na face que mais olha para a câmera', () => {
    const I = new THREE.Matrix4();
    expect(dropAxis(I, V(0, -1, 0))).toBe(1);
    expect(dropAxis(I, V(0.2, -0.3, -0.9))).toBe(2);
    expect(dropAxis(I, V(-0.8, -0.5, 0.1))).toBe(0);
    // A box turned 90° about the vertical: looking along world x is looking along its own z.
    expect(dropAxis(new THREE.Matrix4().makeRotationY(Math.PI / 2), V(1, 0, 0))).toBe(2);
    const corners = rectCorners(fromAbove('uniform'));
    for (const c of corners) expect(c.y).toBe(1);
    expect(handlesOf('stretch').length).toBe(8);
    expect(handlesOf('uniform').length).toBe(4);
    expect(handlesOf('move').length).toBe(0);
  });

  it('arrastar por dentro move no plano (com Ctrl ou a grade, em passos)', () => {
    const f = fromAbove('move');
    const free = dragRect(f, { u: 0, v: 0 }, V(0, 1, 0), V(0.7, 1, -1.3), null);
    near(free.min, V(-0.3, 0, -3.3));
    near(free.max, V(1.7, 2, 0.7));
    const snapped = dragRect(f, { u: 0, v: 0 }, V(0, 1, 0), V(0.7, 1, -1.3), 0.5);
    near(snapped.min, V(-0.5, 0, -3.5));
    const delta = rectDelta(f, snapped.min, snapped.max);
    near(V(0, 5, 0).applyMatrix4(delta), V(0.5, 5, -1.5));
  });

  it('uma borda estica só o seu lado; a oposta fica; não passa do tamanho mínimo', () => {
    const f = fromAbove('stretch');
    const right = dragRect(f, { u: 1, v: 0 }, V(1, 1, 0), V(2.2, 1, 5), null);
    near(right.min, f.min);
    near(right.max, V(2.2, 2, 2));
    const snapped = dragRect(f, { u: 1, v: 0 }, V(1, 1, 0), V(2.2, 1, 0), 0.5);
    expect(snapped.max.x).toBeCloseTo(2, 9);
    const corner = dragRect(f, { u: -1, v: 1 }, V(-1, 1, 2), V(-2, 1, 3), null);
    near(corner.min, V(-2, 0, -2));
    near(corner.max, V(1, 2, 3));
    const crushed = dragRect(f, { u: 1, v: 0 }, V(1, 1, 0), V(-5, 1, 0), null);
    expect(crushed.max.x - crushed.min.x).toBeGreaterThan(0);
    expect(crushed.min.x).toBe(-1);
    // The preview takes the old box to the new one, axis by axis.
    const m = rectDelta(f, right.min, right.max);
    near(f.min.clone().applyMatrix4(m), right.min);
    near(f.max.clone().applyMatrix4(m), right.max);
  });

  it('um canto escala por igual a partir do canto oposto (em décimos ao encaixar)', () => {
    const f = fromAbove('uniform');
    const d = dragRect(f, { u: 1, v: 1 }, V(1, 1, 2), V(3, 1, 6), null);
    expect(d.k).toBeCloseTo(2, 9);
    near(d.anchor!, V(-1, 1, -2));
    near(d.min, V(-1, -1, -2));
    near(d.max, V(3, 3, 6));
    const s = dragRect(f, { u: 1, v: 1 }, V(1, 1, 2), V(2.03, 1, 4.1), 0.5);
    expect(s.k).toBeCloseTo(1.5, 9);
    // The anchor doesn't move under the preview.
    near(d.anchor!.clone().applyMatrix4(rectDelta(f, d.min, d.max, d.k)), d.anchor!);
  });

  it('esticar uma caixa girada muda o tamanho e o lugar: a face oposta fica onde estava', () => {
    const caixa: Peca = { id: 'c', tipo: 'caixa', p: [5, 1, 0], yaw: Math.PI / 2, params: { tamanho: [2, 2, 4], superficie: 'concreto' } };
    expect(stretchable(caixa)).toBe(true);
    const b = stretchBox(caixa, null);
    near(b.min, V(-1, -1, -2));
    // Its own +x grows by 1 m; its own x points to world -z (turned 90°).
    const next = applyStretch(caixa, null, b.min, V(2, 1, 2));
    expect(next.params.tamanho).toEqual([3, 2, 4]);
    expect(next.yaw).toBeCloseTo(Math.PI / 2, 5);
    near(V(...next.p!), V(5, 1, -0.5));
    const oppositeBefore = V(-1, 0, 0).applyMatrix4(b.world);
    const nb = stretchBox(next, null);
    near(V(-1.5, 0, 0).applyMatrix4(nb.world), oppositeBefore);
  });

  it('o colisor estica pela meia medida; caixa com rot, parede e carro não esticam', () => {
    const col: Peca = { id: 'k', tipo: 'colisor', p: [0, 1, 0], params: { meia: [0.5, 1, 0.5], fisica: 'wood' } };
    const b = stretchBox(col, null);
    near(b.max, V(0.5, 1, 0.5));
    expect(applyStretch(col, null, b.min, V(1.5, 1, 0.5)).params.meia).toEqual([1, 1, 0.5]);
    expect(stretchable({ id: 'c', tipo: 'caixa', p: [0, 0, 0], params: { tamanho: [1, 1, 1], superficie: 'concreto', rot: [0.1, 0, 0] } })).toBe(false);
    expect(stretchable({ id: 'w', tipo: 'parede', params: { eixo: 'x', fixo: 0, de: 0, ate: 4, espessura: 0.3, altura: 3, superficie: 'reboco', vaos: [], y0: 0 } })).toBe(false);
    expect(stretchable({ id: 'v', tipo: 'carro', p: [0, 0, 0], params: {} })).toBe(false);
    expect(stretchable({ id: 's', tipo: 'sala', p: [0, 0, 0], params: { tamanho: [4, 3, 4], fechamento: 1 } })).toBe(true);
  });
});
