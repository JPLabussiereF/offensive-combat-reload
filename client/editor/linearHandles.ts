// The ends of what runs along a line (walls, fences, railings, hedges, the cemetery's and the garden's walls,
// the arched bridge, a string of lanterns) and the sides of the holes in them (doors and windows, gaps in a
// fence), as handles: dragging one slides it along the line (in the piece's frame: a posed wall's handles turn
// with it). The functions on handles are pure (client/tests/editorHistory.test.ts uses them).
import * as THREE from 'three';
import type { Peca, Vec3 } from '@shared/mapData';
import { poseMatrix } from '../world/pose';

export interface HandlePoint {
  key: string;
  /** In the piece's frame (before its pose). */
  p: Vec3;
  /** The axis it slides along (null: anywhere). */
  axis: 'x' | 'z' | null;
}

type Q = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** The line a piece runs along: its axis, the across coordinate, its height, and its ends. */
function lineOf(q: Q): { axis: 'x' | 'z'; fixed: number; y: number; a: number; b: number } | null {
  const axis = q.eixo === 'z' ? 'z' : q.eixo === 'x' ? 'x' : null;
  const fixed = num(q.fixo) ?? num(q.atravessa);
  const a = num(q.de);
  const b = num(q.ate);
  if (!axis || fixed === undefined || a === undefined || b === undefined) return null;
  return { axis, fixed, y: num(q.y0) ?? num(q.y) ?? 0, a, b };
}

const along = (axis: 'x' | 'z', s: number, y: number, fixed: number): Vec3 => (axis === 'x' ? [s, y, fixed] : [fixed, y, s]);

/** Whether a piece has handles. */
export const hasHandles = (peca: Peca) => handlePoints(peca).length > 0;

/** A piece's handles: its two ends, and both sides of every hole it has. */
export function handlePoints(peca: Peca): HandlePoint[] {
  const q = peca.params;
  if (Array.isArray(q.de) && Array.isArray(q.ate) && q.de.length === 3 && q.ate.length === 3) {
    return [
      { key: 'de', p: q.de as Vec3, axis: null },
      { key: 'ate', p: q.ate as Vec3, axis: null },
    ];
  }
  const line = lineOf(q);
  if (!line) return [];
  const out: HandlePoint[] = [
    { key: 'de', p: along(line.axis, line.a, line.y, line.fixed), axis: line.axis },
    { key: 'ate', p: along(line.axis, line.b, line.y, line.fixed), axis: line.axis },
  ];
  if (Array.isArray(q.vaos)) {
    (q.vaos as number[][]).forEach((v, i) => {
      // [from, to] (fences, hedges) or [from, to, bottom, top] (walls): the handles halfway up the hole.
      const mid = v.length >= 4 ? line.y + (v[2] + v[3]) / 2 : line.y + 1;
      out.push({ key: `vao:${i}:0`, p: along(line.axis, v[0], mid, line.fixed), axis: line.axis }, { key: `vao:${i}:1`, p: along(line.axis, v[1], mid, line.fixed), axis: line.axis });
    });
  }
  return out;
}

/** The piece with one handle moved to `local` (a point in its frame). */
export function moveHandle(peca: Peca, key: string, local: Vec3): Peca {
  const next: Peca = structuredClone(peca);
  const q = next.params;
  if (Array.isArray(q.de) && q.de.length === 3) {
    q[key] = local.map(r4);
    return next;
  }
  const line = lineOf(q);
  if (!line) return next;
  const s = r4(line.axis === 'x' ? local[0] : local[2]);
  if (key === 'de' || key === 'ate') {
    q[key] = s;
    // The ends keep their order (a wall runs from `de` to `ate`).
    if ((q.de as number) > (q.ate as number)) [q.de, q.ate] = [q.ate, q.de];
    return next;
  }
  const m = /^vao:(\d+):([01])$/.exec(key);
  if (m && Array.isArray(q.vaos)) {
    const v = (q.vaos as number[][])[Number(m[1])];
    if (v) {
      v[Number(m[2])] = s;
      if (v[0] > v[1]) [v[0], v[1]] = [v[1], v[0]];
    }
  }
  return next;
}

/** The piece with one more hole in the middle of its run: a door (walls) or a 2 m gap (fences). */
export function addOpening(peca: Peca): Peca | null {
  const q = peca.params;
  const line = lineOf(q);
  if (!line || !Array.isArray(q.vaos)) return null;
  const next: Peca = structuredClone(peca);
  const mid = r4((line.a + line.b) / 2);
  const four = peca.tipo === 'parede' || peca.tipo === 'muroLua';
  (next.params.vaos as number[][]).push(four ? [mid - 0.5, mid + 0.5, 0, 2.2] : [mid - 1, mid + 1]);
  return next;
}

// --- Drawing -------------------------------------------------------------------------------------------------

const MAT = new THREE.MeshBasicMaterial({ color: 0xff8a00, depthTest: false, transparent: true });
const MAT_HOLE = new THREE.MeshBasicMaterial({ color: 0x00e0ff, depthTest: false, transparent: true });

export class LinearHandles {
  /** Carried by the piece's pose: the handles are placed in the piece's frame. */
  readonly group = new THREE.Group();
  private peca: Peca | null = null;

  constructor(scene: THREE.Scene) {
    this.group.name = 'pontas';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
  }

  /** Shows the handles of a piece (null: none); `frame`: where it builds in the world (its groups' and its own pose), when it's in a group. */
  show(peca: Peca | null, frame?: THREE.Matrix4 | null) {
    this.peca = peca;
    for (const o of [...this.group.children]) {
      o.removeFromParent();
      (o as THREE.Mesh).geometry.dispose();
    }
    if (!peca) return;
    this.group.matrix.copy(frame !== undefined ? (frame ?? new THREE.Matrix4()) : (poseMatrix(peca.pose) ?? new THREE.Matrix4()));
    this.group.updateMatrixWorld(true);
    for (const h of handlePoints(peca)) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(h.key.startsWith('vao') ? 0.16 : 0.22, 12, 8), h.key.startsWith('vao') ? MAT_HOLE : MAT);
      m.position.set(...h.p);
      m.renderOrder = 30;
      m.userData.ponta = h.key;
      m.userData.pontaDe = peca.id;
      this.group.add(m);
    }
  }

  /** A handle's world matrix: where it is, turned with the piece (its axis is the gizmo's local axis). */
  world(key: string): { world: THREE.Matrix4; axis: 'x' | 'z' | null } | null {
    if (!this.peca) return null;
    const h = handlePoints(this.peca).find((x) => x.key === key);
    if (!h) return null;
    const m = new THREE.Matrix4().makeTranslation(...h.p);
    return { world: this.group.matrix.clone().multiply(m), axis: h.axis };
  }

  /** A handle's world place back in the piece's frame. */
  toLocal(world: THREE.Matrix4): Vec3 {
    const p = new THREE.Vector3().setFromMatrixPosition(world).applyMatrix4(this.group.matrix.clone().invert());
    return [p.x, p.y, p.z];
  }

  dispose() {
    this.group.removeFromParent();
  }
}
