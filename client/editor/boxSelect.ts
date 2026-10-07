// Selecting by a box dragged over the Scene view (PF-6 Revisions 01, etapa 3), without a screen: as in Unity, a
// piece is in the box when what it draws touches it. Each mesh is projected with the camera (perspective or
// orthographic): a mesh whose bounds land inside the box is in; one whose bounds miss it is out; the others are
// tested triangle by triangle (clipped at the camera's near plane, then a separating-axis test against the box).
// The meshes count wherever they're drawn from (P46 moves the batched pieces' own meshes to a hidden layer: they
// still are where the piece is). client/tests/editorBoxSelect.test.ts runs it as is.
import * as THREE from 'three';

/** A box on the view in normalized device coordinates (-1..1, y up), x0 < x1 and y0 < y1. */
export interface NdcRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The box between two points of the page (client px) over a canvas at `r`. */
export function rectToNdc(a: { x: number; y: number }, b: { x: number; y: number }, r: { left: number; top: number; width: number; height: number }): NdcRect {
  const nx = (x: number) => ((x - r.left) / r.width) * 2 - 1;
  const ny = (y: number) => -((y - r.top) / r.height) * 2 + 1;
  return { x0: Math.min(nx(a.x), nx(b.x)), x1: Math.max(nx(a.x), nx(b.x)), y0: Math.min(ny(a.y), ny(b.y)), y1: Math.max(ny(a.y), ny(b.y)) };
}

/** A polygon in clip space cut at the near plane (z + w >= 0: in front of the camera). */
export function clipNear(poly: THREE.Vector4[]): THREE.Vector4[] {
  const out: THREE.Vector4[] = [];
  const d = (v: THREE.Vector4) => v.z + v.w;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = d(a);
    const db = d(b);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) out.push(a.clone().lerp(b, da / (da - db)));
  }
  return out;
}

/** Whether a convex polygon on the view (ndc points) touches the box (separating axes). */
export function polygonTouchesRect(poly: { x: number; y: number }[], r: NdcRect): boolean {
  if (!poly.length) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (maxX < r.x0 || minX > r.x1 || maxY < r.y0 || minY > r.y1) return false;
  const corners = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    if (nx === 0 && ny === 0) continue;
    let pMin = Infinity;
    let pMax = -Infinity;
    for (const p of poly) {
      const v = p.x * nx + p.y * ny;
      pMin = Math.min(pMin, v);
      pMax = Math.max(pMax, v);
    }
    let rMin = Infinity;
    let rMax = -Infinity;
    for (const [x, y] of corners) {
      const v = x * nx + y * ny;
      rMin = Math.min(rMin, v);
      rMax = Math.max(rMax, v);
    }
    if (pMax < rMin || pMin > rMax) return false;
  }
  return true;
}

const v4 = () => new THREE.Vector4();

/** A triangle (world) against the box, through the camera's view and projection (`viewProj`). */
export function triangleTouchesRect(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, viewProj: THREE.Matrix4, r: NdcRect): boolean {
  const clip = [a, b, c].map((p) => v4().set(p.x, p.y, p.z, 1).applyMatrix4(viewProj));
  const poly = clipNear(clip).filter((v) => v.w > 1e-9);
  return polygonTouchesRect(
    poly.map((v) => ({ x: v.x / v.w, y: v.y / v.w })),
    r,
  );
}

const BOX_CORNERS = Array.from({ length: 8 }, (_, i) => [i & 1, (i >> 1) & 1, (i >> 2) & 1]);

/** Where a box (`local`, carried by `m`) lands on the view: 'in' (all of it), 'out' (none of it) or 'maybe'. */
export function boundsOnRect(local: THREE.Box3, m: THREE.Matrix4, viewProj: THREE.Matrix4, r: NdcRect): 'in' | 'out' | 'maybe' {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let behind = false;
  const p = new THREE.Vector3();
  const full = m.clone().premultiply(viewProj);
  for (const [i, j, k] of BOX_CORNERS) {
    p.set(i ? local.max.x : local.min.x, j ? local.max.y : local.min.y, k ? local.max.z : local.min.z);
    const v = v4().set(p.x, p.y, p.z, 1).applyMatrix4(full);
    if (v.z + v.w < 0 || v.w <= 1e-9) {
      behind = true;
      continue;
    }
    minX = Math.min(minX, v.x / v.w);
    maxX = Math.max(maxX, v.x / v.w);
    minY = Math.min(minY, v.y / v.w);
    maxY = Math.max(maxY, v.y / v.w);
  }
  // Partly behind the camera: its corners in front don't bound it (the triangles decide).
  if (behind) return 'maybe';
  if (minX >= r.x0 && maxX <= r.x1 && minY >= r.y0 && maxY <= r.y1) return 'in';
  if (maxX < r.x0 || minX > r.x1 || maxY < r.y0 || minY > r.y1) return 'out';
  return 'maybe';
}

/** The most triangles tested in one box selection (past it, a mesh whose bounds touch the box counts). */
export const TRIANGLE_BUDGET = 400_000;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();

/** Whether a mesh (each instance of an instanced one) touches the box. `budget.left` counts triangles down. */
function meshTouches(mesh: THREE.Mesh, viewProj: THREE.Matrix4, r: NdcRect, budget: { left: number }): boolean {
  const geo = mesh.geometry as THREE.BufferGeometry | undefined;
  const pos = geo?.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!geo || !pos) return false;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
  const count = inst ? inst.count : 1;
  const im = new THREE.Matrix4();
  const index = geo.index;
  const tris = index ? index.count / 3 : pos.count / 3;
  for (let n = 0; n < count; n++) {
    const m = inst ? mesh.matrixWorld.clone().multiply((inst.getMatrixAt(n, im), im)) : mesh.matrixWorld;
    const on = boundsOnRect(geo.boundingBox!, m, viewProj, r);
    if (on === 'in') return true;
    if (on === 'out') continue;
    if (budget.left <= 0) return true;
    const full = m.clone().premultiply(viewProj);
    const at = (i: number, out: THREE.Vector3) => out.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    for (let t = 0; t < tris; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      if (triangleTouchesRect(at(i0, tmpA), at(i1, tmpB), at(i2, tmpC), full, r)) return true;
      if (--budget.left <= 0) return true;
    }
  }
  return false;
}

/** Whether what an object draws (its visible meshes; lines and points don't count) touches the box. */
export function objectTouchesRect(root: THREE.Object3D, viewProj: THREE.Matrix4, r: NdcRect, budget = { left: TRIANGLE_BUDGET }): boolean {
  let hit = false;
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    if (hit || !(o as THREE.Mesh).isMesh || (o as THREE.BatchedMesh).isBatchedMesh) return;
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[];
    if (!Array.isArray(mat) && mat.visible === false) return;
    if (meshTouches(o as THREE.Mesh, viewProj, r, budget)) hit = true;
  });
  return hit;
}

/** The camera's view and projection together. */
export function viewProjection(camera: THREE.Camera): THREE.Matrix4 {
  camera.updateMatrixWorld();
  return new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
}

/** The ids of the pieces (id, what it built) that touch the box, in the order given. */
export function piecesInRect(camera: THREE.Camera, r: NdcRect, pieces: Iterable<[string, THREE.Object3D]>): string[] {
  const vp = viewProjection(camera);
  const budget = { left: TRIANGLE_BUDGET };
  const out: string[] = [];
  for (const [id, obj] of pieces) if (objectTouchesRect(obj, vp, r, budget)) out.push(id);
  return out;
}

/** The selection after a box: Shift adds it, Ctrl toggles each piece in it, nothing replaces. */
export function combineBox(current: string[], inBox: string[], mode: 'replace' | 'add' | 'toggle'): string[] {
  if (mode === 'replace') return [...inBox];
  if (mode === 'add') return [...current, ...inBox.filter((id) => !current.includes(id))];
  const boxed = new Set(inBox);
  return [...current.filter((id) => !boxed.has(id)), ...inBox.filter((id) => !current.includes(id))];
}
