// What the gizmo does to a piece (P32): where its handle sits and how a handle moved and turned becomes the
// piece's data again. A 'livre' piece keeps standing on Peca.p, turned by Peca.yaw and sized by Peca.escala,
// while it's only moved, turned about the vertical and scaled; any other turn, and every move of a 'linear' or
// 'fixa' piece, goes into its pose (Peca.pose), the rigid transform the loader applies to everything it builds.
// The witch's spot, a giant rat's and the collectible a piece holds (the server's places) follow the piece.
import * as THREE from 'three';
import type { MapData, Peca, Vec3 } from '@shared/mapData';
import { MAP_CATALOG } from '@shared/mapCatalog';
import { poseMatrix, poseOf } from '../world/pose';
import type { Rest } from './document';

const UP = new THREE.Vector3(0, 1, 0);
const r4 = (v: number) => {
  const x = Math.round(v * 1e4) / 1e4;
  return Object.is(x, -0) ? 0 : x;
};
const r6 = (v: number) => {
  const x = Math.round(v * 1e6) / 1e6;
  return Object.is(x, -0) ? 0 : x;
};

/** Whether the gizmo moves the piece by Peca.p, yaw and escala (a 'livre' piece placed by its position). */
export const placedByPosition = (peca: Peca) => {
  const k = MAP_CATALOG[peca.tipo];
  return !!(k && k.transformacao === 'livre' && k.usa?.p);
};

/** Whether the gizmo may scale it (only kinds with Peca.escala). */
export const scalable = (peca: Peca) => !!MAP_CATALOG[peca.tipo]?.usa?.escala;

/**
 * Where the gizmo's handle sits on a piece before its pose: a 'livre' piece's own place (position, turn about
 * the vertical, scale); any other piece's `pivot` (the middle of what it built).
 */
export function handleBase(peca: Peca, pivot: THREE.Vector3): THREE.Matrix4 {
  const k = MAP_CATALOG[peca.tipo];
  if (placedByPosition(peca)) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, k.usa?.yaw ? (peca.yaw ?? 0) : 0);
    const s = k.usa?.escala ? (peca.escala ?? 1) : 1;
    return new THREE.Matrix4().compose(new THREE.Vector3(...(peca.p ?? [0, 0, 0])), q, new THREE.Vector3(s, s, s));
  }
  return new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z);
}

/** The handle in the world: the base carried by the piece's pose. */
export function handleWorld(peca: Peca, base: THREE.Matrix4): THREE.Matrix4 {
  const m = poseMatrix(peca.pose);
  return m ? m.clone().multiply(base) : base.clone();
}

/** A matrix without its scale (rigid). */
function rigid(m: THREE.Matrix4) {
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  m.decompose(t, q, new THREE.Vector3());
  return new THREE.Matrix4().compose(t, q, new THREE.Vector3(1, 1, 1));
}

/** The turn about the vertical a quaternion is, or null when it tilts. */
function pureYaw(q: THREE.Quaternion): number | null {
  if (Math.abs(q.x) > 1e-7 || Math.abs(q.z) > 1e-7) return null;
  return 2 * Math.atan2(q.y, q.w);
}

/** Wraps an angle to (-π, π]. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The piece once the gizmo put its handle at `world` (having started from `base`, the handle's place without
 * the pose): a new Peca (the old one is left alone).
 */
export function applyHandle(peca: Peca, base: THREE.Matrix4, world: THREE.Matrix4): Peca {
  const next: Peca = structuredClone(peca);
  const k = MAP_CATALOG[peca.tipo];
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  world.decompose(t, q, s);
  delete next.pose;
  if (placedByPosition(peca)) {
    if (k.usa?.escala) {
      const e = r6((s.x + s.y + s.z) / 3);
      if (Math.abs(e - 1) < 1e-6) delete next.escala;
      else next.escala = e;
    }
    const yaw = pureYaw(q);
    if (yaw !== null && (k.usa?.yaw || Math.abs(yaw) < 1e-7)) {
      next.p = [r4(t.x), r4(t.y), r4(t.z)];
      if (k.usa?.yaw) {
        const y = r6(wrap(yaw));
        if (y === 0 && peca.yaw === undefined) delete next.yaw;
        else next.yaw = y;
      }
      return next;
    }
  }
  // Tilted, or not placed by its position: the pose takes the handle from its base to where it is now.
  const pose = poseOf(rigid(world).multiply(rigid(base).invert()));
  if (pose) next.pose = pose;
  return next;
}

/** What the gizmo did, as a rigid move of the world (the piece's linked places follow it). */
export function handleDelta(from: THREE.Matrix4, to: THREE.Matrix4): THREE.Matrix4 {
  return rigid(to).multiply(rigid(from).invert());
}

const movePoint = (p: Vec3, m: THREE.Matrix4): Vec3 => {
  const v = new THREE.Vector3(...p).applyMatrix4(m);
  return [r4(v.x), r4(v.y), r4(v.z)];
};

/** Whether moving this piece moves places the server keeps (the witch, a rat, a collectible). */
export function hasLinked(peca: Peca, data: MapData): boolean {
  if (peca.tipo === 'bruxa' && data.objetos.bruxa) return true;
  if (peca.tipo === 'ratoGigante') return data.objetos.ratos.some((r) => r.id === (peca.params.id as string));
  return !!peca.coletavel && data.objetos.coletaveis.some((c) => c.id === peca.coletavel);
}

/** Moves the server's places tied to a piece (the witch's spot, its rat, its collectible) by `delta`. */
export function moveLinked(rest: Rest, peca: Peca, delta: THREE.Matrix4) {
  const o = rest.objetos;
  if (peca.tipo === 'bruxa' && o.bruxa) o.bruxa = movePoint(o.bruxa, delta);
  if (peca.tipo === 'ratoGigante') for (const r of o.ratos) if (r.id === peca.params.id) r.p = movePoint(r.p, delta);
  if (peca.coletavel) for (const c of o.coletaveis) if (c.id === peca.coletavel) c.p = movePoint(c.p, delta);
}
