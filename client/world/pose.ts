// A piece's pose (Peca.pose, P32): the rigid transform the editor's gizmo gives a whole piece, any kind at any
// angle. The piece is built where its params say (its own frame) and everything it makes is then carried by
// the pose: the static geometry (MapBuilder.pose), the colliders, the sound's rooms and the walls' holes (kept
// with their own frame: see RoomVolume.local and WallOpening.pose), and its objects (client/world/catalog/
// posed.ts). A piece without a pose builds exactly as it always did.
import * as THREE from 'three';
import type { Pose, Vec3 } from '@shared/mapData';
import type RAPIER from '@dimforge/rapier3d-compat';

// Only the parts used here (this module stays free of the DOM: the server's typecheck reaches it through the
// editor's tests).
type Physics = { world: RAPIER.World };
type RoomVolume = { local?: number[] };
type WallOpening = { axis: 'x' | 'z'; fixed: number; s0: number; s1: number; y0: number; y1: number; pose?: number[] };

/** The pose's matrix, or null when there's none (or it moves nothing). */
export function poseMatrix(pose: Pose | undefined): THREE.Matrix4 | null {
  if (!pose) return null;
  const { p, r } = pose;
  if (p.every((v) => v === 0) && r.every((v) => v === 0)) return null;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1));
}

/** The pose of a rigid matrix (rounded: what the map's data keeps), or undefined when it's the identity. */
export function poseOf(m: THREE.Matrix4): Pose | undefined {
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  m.decompose(t, q, new THREE.Vector3());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  const round = (v: number, k: number) => {
    const x = Math.round(v * k) / k;
    return Object.is(x, -0) ? 0 : x;
  };
  const p: Vec3 = [round(t.x, 1e4), round(t.y, 1e4), round(t.z, 1e4)];
  const r: Vec3 = [round(e.x, 1e6), round(e.y, 1e6), round(e.z, 1e6)];
  if (p.every((v) => v === 0) && r.every((v) => v === 0)) return undefined;
  return { p, r };
}

/** A pose's point and direction mappings, both ways. */
export class PoseMap {
  readonly inverse: THREE.Matrix4;
  readonly q = new THREE.Quaternion();
  readonly qInv = new THREE.Quaternion();

  constructor(readonly m: THREE.Matrix4) {
    this.inverse = m.clone().invert();
    m.decompose(new THREE.Vector3(), this.q, new THREE.Vector3());
    this.qInv.copy(this.q).invert();
  }

  /** A point of the piece's frame in the world (a new vector). */
  toWorld(v: { x: number; y: number; z: number }, out = new THREE.Vector3()) {
    return out.set(v.x, v.y, v.z).applyMatrix4(this.m);
  }
  /** A world point in the piece's frame (a new vector). */
  toLocal(v: { x: number; y: number; z: number }, out = new THREE.Vector3()) {
    return out.set(v.x, v.y, v.z).applyMatrix4(this.inverse);
  }
  dirToWorld(v: { x: number; y: number; z: number }, out = new THREE.Vector3()) {
    return out.set(v.x, v.y, v.z).applyQuaternion(this.q);
  }
  dirToLocal(v: { x: number; y: number; z: number }, out = new THREE.Vector3()) {
    return out.set(v.x, v.y, v.z).applyQuaternion(this.qInv);
  }
}

/** Moves colliders already made (the piece's, by handle) by the pose: whatever made them, they follow the piece. */
export function poseColliders(physics: Physics, handles: number[], m: THREE.Matrix4) {
  const map = new PoseMap(m);
  const q = new THREE.Quaternion();
  for (const h of handles) {
    const col = physics.world.getCollider(h);
    if (!col) continue;
    const t = map.toWorld(col.translation());
    const r = col.rotation();
    q.set(r.x, r.y, r.z, r.w).premultiply(map.q);
    // Map colliders hang from the fixed body at the origin, whose frame is the world's: the place relative to
    // it lasts through the steps, the world place counts right away (the navmesh is baked before any step).
    if (col.parent()) {
      col.setTranslationWrtParent({ x: t.x, y: t.y, z: t.z });
      col.setRotationWrtParent({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    col.setTranslation({ x: t.x, y: t.y, z: t.z });
    col.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }
}

/** A world-to-frame matrix as the 12 numbers RoomVolume.local keeps (3x4, row by row). */
export function affineRows(m: THREE.Matrix4): number[] {
  const e = m.elements; // column-major
  return [e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]];
}

/** The matrix of RoomVolume.local's 12 numbers. */
export function affineMatrix(rows: number[]): THREE.Matrix4 {
  const [a, b, c, d, e, f, g, h, i, j, k, l] = rows;
  return new THREE.Matrix4().set(a, b, c, d, e, f, g, h, i, j, k, l, 0, 0, 0, 1);
}

/** A room carried by the pose `m` (local→world): its box stays in its frame, the world point is taken there. */
export function poseRoom(r: RoomVolume, m: THREE.Matrix4) {
  const toFrame = m.clone().invert();
  if (r.local) toFrame.premultiply(affineMatrix(r.local));
  r.local = affineRows(toFrame);
}

/** A wall's hole carried by the pose `m`: its numbers stay in the wall's frame, `pose` puts them in the world. */
export function poseOpening(o: WallOpening, m: THREE.Matrix4) {
  const frame = m.clone();
  if (o.pose) frame.multiply(new THREE.Matrix4().fromArray(o.pose));
  o.pose = frame.toArray();
}

/** A hole's center in the world (structure checks, tests). */
export function openingCenter(o: WallOpening): THREE.Vector3 {
  const s = (o.s0 + o.s1) / 2;
  const y = (o.y0 + o.y1) / 2;
  const v = o.axis === 'x' ? new THREE.Vector3(s, y, o.fixed) : new THREE.Vector3(o.fixed, y, s);
  return o.pose ? v.applyMatrix4(new THREE.Matrix4().fromArray(o.pose)) : v;
}
