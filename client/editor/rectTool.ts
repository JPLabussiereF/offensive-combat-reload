// The Rect tool (T) as numbers (PF-6 Revisions 01, etapa 3), Unity's Rect Tool brought to the 3D map: a rectangle
// on the selection's box, on the face that most looks at the camera, with handles on its corners and edges.
// Dragging inside it moves the selection in that plane; dragging a handle stretches the box, the opposite side
// staying put. What the stretch does depends on what's selected:
// - one box-shaped piece (a box without its own `rot`, a sound room, an invisible collider): the rectangle is on
//   its own box, in its own axes, and each edge changes its size (`tamanho`, `meia`): 'stretch';
// - anything else that has something to scale (pieces with `escala`, groups): the rectangle is on the world box
//   of the selection, only the corners show, and they scale it all evenly from the opposite corner (as the scale
//   tool does: places spread, what has `escala` grows): 'uniform';
// - nothing scalable (walls, roofs and other pieces sized by their params): only moving: 'move'.
// client/editor/rectOverlay.ts draws it; client/tests/editorRect.test.ts runs this as is.
import * as THREE from 'three';
import type { Peca } from '@shared/mapData';
import { applyHandle, handleBase, handleWorld } from './transform';
import { clone } from './document';
import { snapTo } from './tools';

export type RectMode = 'stretch' | 'uniform' | 'move';
export type Axis3 = 0 | 1 | 2;

export interface RectFrame {
  /** From the box's own axes to the world (rigid; the world box: the identity). */
  world: THREE.Matrix4;
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** The axis the camera looks along most: the rectangle is across the two others. */
  drop: Axis3;
  mode: RectMode;
}

/** A spot of the rectangle: a corner (u and v ±1), an edge (one of them 0) or the inside (both 0). */
export interface RectHandle {
  u: -1 | 0 | 1;
  v: -1 | 0 | 1;
}

/** The two axes across the rectangle (in order). */
export const planeAxes = (drop: Axis3): [Axis3, Axis3] => (drop === 0 ? [1, 2] : drop === 1 ? [0, 2] : [0, 1]);

/** The box's axis most along the view direction (world) when the box is turned by `world`. */
export function dropAxis(world: THREE.Matrix4, view: THREE.Vector3): Axis3 {
  const q = new THREE.Quaternion();
  world.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  const local = view.clone().applyQuaternion(q.invert());
  const a = [Math.abs(local.x), Math.abs(local.y), Math.abs(local.z)];
  return (a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2) as Axis3;
}

/** The handles a mode shows: all eight, the corners, or none (the inside always moves). */
export function handlesOf(mode: RectMode): RectHandle[] {
  if (mode === 'move') return [];
  const corners: RectHandle[] = [
    { u: -1, v: -1 },
    { u: 1, v: -1 },
    { u: 1, v: 1 },
    { u: -1, v: 1 },
  ];
  if (mode === 'uniform') return corners;
  return [...corners, { u: 0, v: -1 }, { u: 1, v: 0 }, { u: 0, v: 1 }, { u: -1, v: 0 }];
}

/** A handle's place in the box's own axes (the rectangle sits across the box's middle along `drop`). */
export function handleLocalPoint(f: RectFrame, h: RectHandle, min = f.min, max = f.max): THREE.Vector3 {
  const [a, b] = planeAxes(f.drop);
  const p = min.clone().add(max).multiplyScalar(0.5);
  const at = (axis: Axis3, s: number) => (s < 0 ? min.getComponent(axis) : s > 0 ? max.getComponent(axis) : p.getComponent(axis));
  p.setComponent(a, at(a, h.u));
  p.setComponent(b, at(b, h.v));
  return p;
}

/** The rectangle's four corners in the world. */
export function rectCorners(f: RectFrame, min = f.min, max = f.max): THREE.Vector3[] {
  return handlesOf('uniform').map((h) => handleLocalPoint(f, h, min, max).applyMatrix4(f.world));
}

/** The plane of the rectangle in the world (where the pointer's ray is met while dragging). */
export function rectPlane(f: RectFrame): THREE.Plane {
  const n = new THREE.Vector3().setComponent(f.drop, 1);
  const q = new THREE.Quaternion();
  f.world.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  const c = f.min.clone().add(f.max).multiplyScalar(0.5).applyMatrix4(f.world);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(n.applyQuaternion(q), c);
}

const EPS = 0.05;
const MIN_K = 0.05;

export interface RectDrag {
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** 'uniform': how much it scaled (about `anchor`, in the box's axes). */
  k?: number;
  anchor?: THREE.Vector3;
}

/**
 * The box after a drag from `start` to `now` (both in the box's own axes, on the rectangle's plane), holding
 * `h`. `step`: the snapping step (sizes and moves on it; the uniform scale in tenths), null when free.
 */
export function dragRect(f: RectFrame, h: RectHandle, start: THREE.Vector3, now: THREE.Vector3, step: number | null): RectDrag {
  const [a, b] = planeAxes(f.drop);
  const d = now.clone().sub(start);
  const min = f.min.clone();
  const max = f.max.clone();
  if (h.u === 0 && h.v === 0) {
    // The inside: a move in the plane.
    for (const axis of [a, b]) {
      const m = snapTo(d.getComponent(axis), step);
      min.setComponent(axis, min.getComponent(axis) + m);
      max.setComponent(axis, max.getComponent(axis) + m);
    }
    return { min, max };
  }
  if (f.mode === 'uniform') {
    const anchor = handleLocalPoint(f, { u: (-h.u || -1) as -1 | 1, v: (-h.v || -1) as -1 | 1 });
    const corner = handleLocalPoint(f, h);
    const d0 = corner.clone().sub(anchor);
    d0.setComponent(f.drop, 0);
    const d1 = corner.clone().add(d).sub(anchor);
    d1.setComponent(f.drop, 0);
    const len = d0.lengthSq();
    let k = len > 1e-12 ? d1.dot(d0) / len : 1;
    k = Math.max(MIN_K, step ? Math.max(MIN_K, Math.round(k * 10) / 10) : k);
    const out = { min: anchor.clone().add(f.min.clone().sub(anchor).multiplyScalar(k)), max: anchor.clone().add(f.max.clone().sub(anchor).multiplyScalar(k)), k, anchor };
    return out;
  }
  for (const [axis, s] of [
    [a, h.u],
    [b, h.v],
  ] as [Axis3, number][]) {
    if (!s) continue;
    const lo = f.min.getComponent(axis);
    const hi = f.max.getComponent(axis);
    if (s > 0) {
      const size = Math.max(EPS, snapTo(hi + d.getComponent(axis) - lo, step) || step || EPS);
      max.setComponent(axis, lo + size);
    } else {
      const size = Math.max(EPS, snapTo(hi - (lo + d.getComponent(axis)), step) || step || EPS);
      min.setComponent(axis, hi - size);
    }
  }
  return { min, max };
}

/** The world move that takes the frame's box to `min`..`max` (axis by axis), for the preview. */
export function rectDelta(f: RectFrame, min: THREE.Vector3, max: THREE.Vector3, k?: number): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const e = m.elements;
  for (let i = 0; i < 3; i++) {
    const e0 = f.max.getComponent(i) - f.min.getComponent(i);
    const e1 = max.getComponent(i) - min.getComponent(i);
    const s = k ?? (e0 > 1e-6 ? e1 / e0 : 1);
    e[i * 5] = s;
    // x' = min1 + (x - min0) s (uniform: about the anchor, whose image is itself).
    e[12 + i] = min.getComponent(i) - f.min.getComponent(i) * s;
  }
  return f.world.clone().multiply(m).multiply(f.world.clone().invert());
}

// --- Stretching a box-shaped piece -------------------------------------------------------------------------------

/** The kinds a Rect stretch resizes, by the param that holds their size (`half`: half sizes). */
export const STRETCH: Record<string, { param: string; half: boolean }> = {
  caixa: { param: 'tamanho', half: false },
  sala: { param: 'tamanho', half: false },
  colisor: { param: 'meia', half: true },
};

/** Whether the Rect tool stretches this piece by its size (a box turned by its own `rot` doesn't). */
export function stretchable(p: Peca): boolean {
  const s = STRETCH[p.tipo];
  if (!s || !Array.isArray(p.params[s.param])) return false;
  return !(p.tipo === 'caixa' && p.params.rot);
}

const ZERO = new THREE.Vector3();

/** A matrix without its scale. */
function rigid(m: THREE.Matrix4) {
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  m.decompose(t, q, new THREE.Vector3());
  return new THREE.Matrix4().compose(t, q, new THREE.Vector3(1, 1, 1));
}

/** A box-shaped piece's own box: its frame in the world (`parent`: its groups') and its size around it. */
export function stretchBox(p: Peca, parent: THREE.Matrix4 | null): { world: THREE.Matrix4; min: THREE.Vector3; max: THREE.Vector3 } {
  const s = STRETCH[p.tipo];
  const v = p.params[s.param] as number[];
  const half = new THREE.Vector3(v[0], v[1], v[2]).multiplyScalar(s.half ? 1 : 0.5);
  return { world: rigid(handleWorld(p, handleBase(p, ZERO), parent)), min: half.clone().negate(), max: half };
}

const r4 = (v: number) => {
  const x = Math.round(v * 1e4) / 1e4;
  return Object.is(x, -0) ? 0 : x;
};

/** The piece once its box went to `min`..`max` (its own axes): its size param and its place. */
export function applyStretch(p: Peca, parent: THREE.Matrix4 | null, min: THREE.Vector3, max: THREE.Vector3): Peca {
  const s = STRETCH[p.tipo];
  const box = stretchBox(p, parent);
  const size = max.clone().sub(min);
  const next = clone(p);
  next.params[s.param] = [size.x, size.y, size.z].map((x) => r4(Math.abs(x) * (s.half ? 0.5 : 1)));
  const c = min.clone().add(max).multiplyScalar(0.5);
  const world = box.world.clone().multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
  return applyHandle(next, handleBase(next, ZERO), world, parent);
}
