// The Inspector's Transform component (PF-6 Revisions 01), without a screen: a handle's place in its group's
// frame as Unity shows it (position in meters, rotation in degrees, Euler X, Y, Z, and the scale), back to a
// matrix, the values a multiple selection has in common, and one field changed (typed, or dragged by its label).
import * as THREE from 'three';

export const DEG = 180 / Math.PI;

export type Axis = 0 | 1 | 2;
export type Component = 'p' | 'r' | 's';

/** A Transform: position (m), rotation (degrees, Euler XYZ) and a uniform scale. */
export interface Fields {
  p: [number, number, number];
  r: [number, number, number];
  s: number;
}

/** What a multiple selection shows: a value where they all agree, null where they differ. */
export interface Shown {
  p: (number | null)[];
  r: (number | null)[];
  s: number | null;
}

/** One field edited: set to a value (typed) or moved by an amount (its label dragged). */
export interface FieldEdit {
  c: Component;
  /** Which of X, Y, Z (the scale has one: any). */
  axis: Axis;
  value?: number;
  delta?: number;
}

const round = (v: number, k: number) => {
  const x = Math.round(v * k) / k;
  return Object.is(x, -0) ? 0 : x;
};

/** Degrees to radians and back, as the fields show them (degrees to 3 decimals). */
export const toRad = (deg: number) => deg / DEG;
export const toDeg = (rad: number) => round(rad * DEG, 1e3);

/**
 * The fields of a matrix. `hint`: the fields last typed for it, kept when they still make the same matrix
 * (200° stays 200°, not -160°, as in Unity).
 */
export function fieldsOf(m: THREE.Matrix4, hint?: Fields): Fields {
  if (hint && close(matrixOf(hint), m)) return hint;
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(t, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return { p: [round(t.x, 1e4), round(t.y, 1e4), round(t.z, 1e4)], r: [toDeg(e.x), toDeg(e.y), toDeg(e.z)], s: round((s.x + s.y + s.z) / 3, 1e6) };
}

/** The matrix of some fields. */
export function matrixOf(f: Fields): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(toRad(f.r[0]), toRad(f.r[1]), toRad(f.r[2]), 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...f.p), q, new THREE.Vector3(f.s, f.s, f.s));
}

function close(a: THREE.Matrix4, b: THREE.Matrix4, eps = 1e-5) {
  return a.elements.every((v, i) => Math.abs(v - b.elements[i]) < eps);
}

/** What several Transforms have in common. */
export function common(list: Fields[]): Shown {
  const agree = (get: (f: Fields) => number) => {
    if (!list.length) return null;
    const v = get(list[0]);
    return list.every((f) => Math.abs(get(f) - v) < 1e-9) ? v : null;
  };
  return {
    p: [0, 1, 2].map((k) => agree((f) => f.p[k])),
    r: [0, 1, 2].map((k) => agree((f) => f.r[k])),
    s: agree((f) => f.s),
  };
}

/** One Transform with a field edited (a new object). The scale is uniform: any of its fields sets it; never 0 or below. */
export function applyEdit(f: Fields, e: FieldEdit): Fields {
  const next: Fields = { p: [...f.p], r: [...f.r], s: f.s };
  if (e.c === 's') {
    const v = e.value ?? next.s + (e.delta ?? 0);
    next.s = Math.max(0.01, round(v, 1e6));
    return next;
  }
  const arr = e.c === 'p' ? next.p : next.r;
  arr[e.axis] = e.value ?? arr[e.axis] + (e.delta ?? 0);
  arr[e.axis] = round(arr[e.axis], e.c === 'p' ? 1e4 : 1e3);
  return next;
}

/** How much a label dragged by one pixel changes its field (Shift: ten times as much). */
export function dragStep(c: Component, fast = false): number {
  const k = fast ? 10 : 1;
  return (c === 'p' ? 0.02 : c === 'r' ? 0.5 : 0.005) * k;
}
