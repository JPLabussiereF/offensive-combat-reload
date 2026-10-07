// New pieces from the Project panel (PF-6 Revisions 01, etapa 4), without a screen: where a thumbnail dropped on the
// Scene lands (where the mouse points, on the grid of the move step), where one dropped on the Hierarchy lands (at
// the origin of the group it was dropped in: a group's row, the group of another row, or the top below the rows),
// and the edit that adds it: its place (a 'livre' piece by its p; the others by a pose that stands the middle of
// what they build on the point, as the palette did), its group and its place in the list (at the end of the
// group's children). The piece and the server's places it brings (a rat's, the witch's) are one edit, undone at
// once. client/tests/editorDrop.test.ts runs it as is.
import * as THREE from 'three';
import type { MapData, Peca, Vec3 } from '@shared/mapData';
import type { Rest } from './document';
import { newPiece } from './create';
import { finder, frameOf, isGroup, parentOf, subtree } from './groups';
import { snapTo } from './tools';

/** The data type of a thumbnail dragged from the Project: the Scene and the Hierarchy take drops of it. */
export const ASSET_MIME = 'application/x-oc-asset';

const r4 = (v: number) => {
  const x = Math.round(v * 1e4) / 1e4;
  return Object.is(x, -0) ? 0 : x;
};

/** Where a new piece lands. */
export interface DropSpot {
  /** In its group's frame (the world, at the top). */
  at: Vec3;
  /** The same point in the world. */
  world: Vec3;
  /** The group it goes into (null: the top). */
  pai: string | null;
}

/** Dropped on the Scene: where the mouse's ray meets the map, x and z on the grid of `step` (the height as it is). */
export function sceneSpot(hit: { x: number; y: number; z: number }, step: number | null): DropSpot {
  const at: Vec3 = [r4(snapTo(hit.x, step)), r4(hit.y), r4(snapTo(hit.z, step))];
  return { at, world: [...at], pai: null };
}

/**
 * Dropped on the Hierarchy: on a group's row, into it; on another row, into that row's group; below the rows
 * (`row` null), at the top. Always at the origin of that group (the world's origin at the top).
 */
export function hierarchySpot(data: MapData, row: string | null): DropSpot {
  const find = finder(data);
  const p = row ? find(row) : undefined;
  const pai = p ? (isGroup(p) ? p.id : parentOf(p, find)) : null;
  const frame = frameOf(data, pai, find);
  const o = frame ? new THREE.Vector3().setFromMatrixPosition(frame) : new THREE.Vector3();
  return { at: [0, 0, 0], world: [r4(o.x), r4(o.y), r4(o.z)], pai };
}

/** The box a piece builds in its own frame (no group, no pose), or null when it builds nothing to measure. */
export type Probe = (p: Peca) => Promise<THREE.Box3 | null>;

export interface DropOptions {
  /** The kind's example (the first piece of it in the official maps). */
  template?: Peca;
  /** Params over the new piece's (a GLB model: its file). */
  params?: Record<string, unknown>;
  probe: Probe;
  rand?: () => number;
}

/** The edit that adds a dropped piece: the whole new list of pieces (EditorDocument.setPieces) and the rest. */
export interface Dropped {
  id: string;
  pecas: Peca[];
  rest?: (r: Rest) => void;
}

/** A new piece of `tipo` dropped at `spot` (null: the map has as many of the kind as it may). */
export async function dropPiece(data: MapData, tipo: string, spot: DropSpot, o: DropOptions): Promise<Dropped | null> {
  const made = newPiece(data, tipo, spot.at, o.template, o.rand, spot.world);
  if (!made) return null;
  const peca = made.peca;
  if (o.params) peca.params = { ...peca.params, ...o.params };
  if (made.byPose) {
    // Its example builds where it was in its map: measured on its own, then posed so its middle stands on the point.
    const alone: Peca = { ...peca };
    delete alone.pai;
    delete alone.pose;
    const box = await o.probe(alone);
    if (box && !box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      peca.pose = { p: [r4(spot.at[0] - c.x), r4(spot.at[1] - box.min.y), r4(spot.at[2] - c.z)], r: [0, 0, 0] };
    }
  }
  if (spot.pai) peca.pai = spot.pai;
  return { id: peca.id, pecas: insertPiece(data, peca, spot.pai), rest: made.rest };
}

/** The list with `peca` at the end of its group's children (right after the group when it has none), or at the end. */
export function insertPiece(data: MapData, peca: Peca, pai: string | null): Peca[] {
  let at = data.pecas.length;
  if (pai) {
    const inside = subtree(data, [pai]);
    for (let i = data.pecas.length - 1; i >= 0; i--)
      if (inside.has(data.pecas[i].id)) {
        at = i + 1;
        break;
      }
  }
  return [...data.pecas.slice(0, at), peca, ...data.pecas.slice(at)];
}

/**
 * Where the ghost of a dropped asset goes: its box (from the drop point, as the thumbnail measured it) moved to the
 * point, or a 1 m cube standing on it when the box isn't known yet.
 */
export function ghostBox(point: { x: number; y: number; z: number }, box?: readonly number[]): THREE.Box3 {
  const p = new THREE.Vector3(point.x, point.y, point.z);
  if (!box || box.length !== 6) return new THREE.Box3(p.clone().add(new THREE.Vector3(-0.5, 0, -0.5)), p.clone().add(new THREE.Vector3(0.5, 1, 0.5)));
  return new THREE.Box3(new THREE.Vector3(box[0], box[1], box[2]).add(p), new THREE.Vector3(box[3], box[4], box[5]).add(p));
}
