// The Hierarchy's tree (PF-6 Revisions 01): pieces hang from groups (Peca.pai, a piece of kind 'grupo' whose pose
// is its children's frame). Here, without a scene: who is whose child, the frames, and the edits as whole new
// lists of pieces (EditorDocument.setPieces makes each one undoable): putting pieces in and out of groups and
// reordering them (they stay where they are in the world, as in Unity), grouping a selection, moving, turning
// and scaling several pieces at once (a group takes its children along), duplicating and deleting with the
// children. The server's places tied to a piece (the witch's spot, a rat's, a collectible) follow it.
import * as THREE from 'three';
import type { MapData, Peca, Vec3 } from '@shared/mapData';
import { groupMatrix, worldPoseMatrix, type FindPiece } from '../world/pose';
import { clone, newPieceId, type Rest } from './document';
import { applyHandle, handleBase, handleDelta, handleLocal, handleWorld, hasLinked, moveLinked, placedByPosition, scalable } from './transform';
import { duplicatePiece } from './create';

export const isGroup = (p: Peca | undefined): boolean => p?.tipo === 'grupo';

/** Where a piece of the map is, by id. */
export function finder(data: MapData): FindPiece {
  const byId = new Map(data.pecas.map((p) => [p.id, p]));
  return (id) => byId.get(id);
}

/** The group a piece hangs from, if it's a group of the map (anything else puts it at the top). */
export function parentOf(peca: Peca, find: FindPiece): string | null {
  return peca.pai && isGroup(find(peca.pai)) ? peca.pai : null;
}

/** The frame its groups give a piece (null: it hangs from none, or they move nothing). */
export function parentFrame(data: MapData, peca: Peca, find = finder(data)): THREE.Matrix4 | null {
  return peca.pai ? groupMatrix(peca, find) : null;
}

/** A group's frame for its children (its groups' and its own pose); null: the world. */
export function frameOf(data: MapData, groupId: string | null, find = finder(data)): THREE.Matrix4 | null {
  const g = groupId ? find(groupId) : undefined;
  return g ? worldPoseMatrix(g, find) : null;
}

/** A group's children (null: the pieces at the top), in the map's order. */
export function childrenOf(data: MapData, id: string | null, find = finder(data)): Peca[] {
  return data.pecas.filter((p) => parentOf(p, find) === id);
}

/** The ids and everything under them (a group's children, theirs...). */
export function subtree(data: MapData, ids: Iterable<string>): Set<string> {
  const out = new Set(ids);
  const kids = new Map<string, string[]>();
  for (const p of data.pecas) if (p.pai) (kids.get(p.pai) ?? kids.set(p.pai, []).get(p.pai)!).push(p.id);
  const stack = [...out];
  while (stack.length) {
    for (const k of kids.get(stack.pop()!) ?? []) {
      if (out.has(k)) continue;
      out.add(k);
      stack.push(k);
    }
  }
  return out;
}

/** The groups a piece is in, from its own outward. */
export function ancestorsOf(data: MapData, id: string, find = finder(data)): string[] {
  const out: string[] = [];
  for (let p = find(id), g = p ? parentOf(p, find) : null; g && !out.includes(g); g = parentOf(find(g)!, find)) out.push(g);
  return out;
}

/** The ids that aren't inside another of them (moving a group moves its children already), in the map's order. */
export function topLevel(data: MapData, ids: Iterable<string>, find = finder(data)): string[] {
  const set = new Set(ids);
  return data.pecas.filter((p) => set.has(p.id) && !ancestorsOf(data, p.id, find).some((a) => set.has(a))).map((p) => p.id);
}

const ZERO = new THREE.Vector3();
const same = (a: THREE.Matrix4 | null, b: THREE.Matrix4 | null) => (!a && !b) || (!!a && !!b && a.equals(b));

/** A piece put in another frame (its groups' changed) without moving in the world. */
function reframe(peca: Peca, from: THREE.Matrix4 | null, to: THREE.Matrix4 | null): Peca {
  if (same(from, to)) return clone(peca);
  const base = handleBase(peca, ZERO);
  return applyHandle(peca, base, handleWorld(peca, base, from), to);
}

/** Where a piece goes in a list: before or after another, or (neither) at the end of a group's children. */
export interface Slot {
  before?: string;
  after?: string;
}

/**
 * The pieces `ids` put into group `pai` (null: out of every group), at `slot` in the list, where they are in
 * the world (their place in the group's frame is worked out). Null when it can't be done (a group into itself
 * or into one of its own children).
 */
export function moveInto(data: MapData, ids: string[], pai: string | null, slot: Slot = {}): Peca[] | null {
  const find = finder(data);
  if (pai && !isGroup(find(pai))) return null;
  const moving = topLevel(data, ids, find);
  if (!moving.length) return null;
  if (pai && (moving.includes(pai) || ancestorsOf(data, pai, find).some((a) => moving.includes(a)))) return null;
  const to = frameOf(data, pai, find);
  const moved = new Map<string, Peca>();
  for (const id of moving) {
    const p = find(id)!;
    const next = reframe(p, parentFrame(data, p, find), to);
    if (pai) next.pai = pai;
    else delete next.pai;
    moved.set(id, next);
  }
  const rest = data.pecas.filter((p) => !moved.has(p.id));
  let at = rest.length;
  const anchor = slot.before ?? slot.after;
  if (anchor && !moved.has(anchor)) {
    const i = rest.findIndex((p) => p.id === anchor);
    if (i >= 0) at = slot.before ? i : i + 1;
  } else if (pai) {
    // At the end of the group's children (right after the group when it has none).
    const inside = subtree(data, [pai]);
    for (let i = rest.length - 1; i >= 0; i--)
      if (inside.has(rest[i].id)) {
        at = i + 1;
        break;
      }
  }
  const list = moving.map((id) => moved.get(id)!);
  return [...rest.slice(0, at), ...list, ...rest.slice(at)];
}

/**
 * A new group around `ids` with its origin at `at` (world), in the list where the first of them was, inside
 * the group they all share (or at the top); empty `ids`: an empty group. Its id and the new list.
 */
export function makeGroup(data: MapData, ids: string[], at: Vec3): { id: string; pecas: Peca[] } {
  const find = finder(data);
  const top = topLevel(data, ids, find);
  const parents = new Set(top.map((id) => parentOf(find(id)!, find)));
  const pai = parents.size === 1 ? [...parents][0] : null;
  const id = newPieceId(data, 'grupo');
  const frame = frameOf(data, pai, find);
  const o = new THREE.Vector3(...at);
  if (frame) o.applyMatrix4(frame.clone().invert());
  const r4 = (v: number) => (Object.is(Math.round(v * 1e4) / 1e4, -0) ? 0 : Math.round(v * 1e4) / 1e4);
  const group: Peca = { id, tipo: 'grupo', params: {} };
  if (o.lengthSq() > 0) group.pose = { p: [r4(o.x), r4(o.y), r4(o.z)], r: [0, 0, 0] };
  if (pai) group.pai = pai;
  const first = top.length ? data.pecas.findIndex((p) => p.id === top[0]) : data.pecas.length;
  const withGroup = [...data.pecas.slice(0, first), group, ...data.pecas.slice(first)];
  if (!top.length) return { id, pecas: withGroup };
  const next = moveInto({ ...data, pecas: withGroup }, top, id, { after: id });
  return { id, pecas: next ?? withGroup };
}

/** Where each piece's handle is in the world (for the server's places to follow it). */
function handles(data: MapData, ids: Iterable<string>): Map<string, THREE.Matrix4> {
  const find = finder(data);
  const out = new Map<string, THREE.Matrix4>();
  for (const id of ids) {
    const p = find(id);
    if (p) out.set(id, handleWorld(p, handleBase(p, ZERO), parentFrame(data, p, find)));
  }
  return out;
}

/**
 * The rest of the map once the pieces went from `before` to `after`: the witch's spot, a rat's and a
 * collectible follow the piece they're tied to (undefined: nothing tied moved).
 */
export function linkedRest(before: MapData, after: Peca[]): ((r: Rest) => void) | undefined {
  const tied = before.pecas.filter((p) => hasLinked(p, before)).map((p) => p.id);
  if (!tied.length) return undefined;
  const a = handles(before, tied);
  const b = handles({ ...before, pecas: after }, tied);
  const moves: [Peca, THREE.Matrix4][] = [];
  for (const id of tied) {
    const from = a.get(id);
    const to = b.get(id);
    if (from && to && !from.equals(to)) moves.push([before.pecas.find((p) => p.id === id)!, handleDelta(from, to)]);
  }
  if (!moves.length) return undefined;
  return (r) => {
    for (const [p, delta] of moves) moveLinked(r, p, delta);
  };
}

/** The pieces `ids` (and what's inside the groups among them) moved by `delta`, a rigid move of the world. */
export function moveTree(data: MapData, ids: Iterable<string>, delta: THREE.Matrix4): Peca[] {
  const find = finder(data);
  const top = new Set(topLevel(data, ids, find));
  return data.pecas.map((p) => {
    if (!top.has(p.id)) return p;
    const base = handleBase(p, ZERO);
    const parent = parentFrame(data, p, find);
    return applyHandle(p, base, delta.clone().multiply(handleWorld(p, base, parent)), parent);
  });
}

/** The middle of what a piece builds, in its own frame (before its pose): the editor's scene knows it. */
export type PivotOf = (peca: Peca) => THREE.Vector3;

/**
 * The pieces `ids` scaled by `s` about `pivot` (world): their places spread from it, and what can scale
 * (Peca.escala) grows with it; a group scales its children the same way about its own origin (its frame has
 * no scale of its own). Pieces that don't scale keep their size and only move.
 */
export function scaleTree(data: MapData, ids: Iterable<string>, pivot: THREE.Vector3, s: number, pivotOf: PivotOf): Peca[] {
  const find = finder(data);
  const out = new Map<string, Peca>();
  const spread = (t: THREE.Vector3, about: THREE.Vector3) => t.sub(about).multiplyScalar(s).add(about);
  const scaleLocal = (p: Peca, about: THREE.Vector3) => {
    if (isGroup(p)) {
      const next = clone(p);
      const o = spread(new THREE.Vector3(...(p.pose?.p ?? [0, 0, 0])), about);
      const r: Vec3 = p.pose ? [...p.pose.r] : [0, 0, 0];
      if (o.lengthSq() > 0 || r.some((v) => v !== 0)) next.pose = { p: [o.x, o.y, o.z].map(round) as Vec3, r };
      else delete next.pose;
      out.set(p.id, next);
      for (const c of childrenOf(data, p.id, find)) scaleLocal(c, new THREE.Vector3());
      return;
    }
    const base = handleBase(p, placedByPosition(p) ? ZERO : pivotOf(p));
    const local = handleLocal(p, base);
    const t = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    local.decompose(t, q, sc);
    spread(t, about);
    if (scalable(p)) sc.multiplyScalar(s);
    out.set(p.id, applyHandle(p, base, new THREE.Matrix4().compose(t, q, sc)));
  };
  for (const id of topLevel(data, ids, find)) {
    const p = find(id)!;
    const frame = parentFrame(data, p, find);
    scaleLocal(p, frame ? pivot.clone().applyMatrix4(frame.clone().invert()) : pivot.clone());
  }
  return data.pecas.map((p) => out.get(p.id) ?? p);
}

const round = (v: number) => {
  const x = Math.round(v * 1e4) / 1e4;
  return Object.is(x, -0) ? 0 : x;
};

/**
 * Copies of the pieces `ids` with what's inside the groups among them (their children follow the copied group),
 * the top ones `offset` aside in their frame; the copies go right after the last original. Kinds at their limit
 * aren't copied (`skipped`).
 */
export function duplicateTree(data: MapData, ids: Iterable<string>, offset: Vec3 = [1, 0, 1]): { pecas: Peca[]; copies: string[]; rest?: (r: Rest) => void; skipped: string[] } {
  const find = finder(data);
  const top = new Set(topLevel(data, ids, find));
  const all = subtree(data, top);
  const work: MapData = { ...data, pecas: [...data.pecas] };
  const map = new Map<string, string>();
  const copies: Peca[] = [];
  const rests: ((r: Rest) => void)[] = [];
  const skipped: string[] = [];
  let last = -1;
  data.pecas.forEach((src, i) => {
    if (!all.has(src.id)) return;
    last = i;
    // A child whose group wasn't copied isn't copied either.
    if (!top.has(src.id) && src.pai && !map.has(src.pai)) return;
    const made = duplicatePiece(work, src, top.has(src.id) ? offset : [0, 0, 0]);
    if (!made) {
      skipped.push(src.id);
      return;
    }
    if (src.nome) made.peca.nome = src.nome;
    if (src.pai) made.peca.pai = map.get(src.pai) ?? src.pai;
    map.set(src.id, made.peca.id);
    work.pecas.push(made.peca);
    copies.push(made.peca);
    if (made.rest) rests.push(made.rest);
  });
  const pecas = [...data.pecas.slice(0, last + 1), ...copies, ...data.pecas.slice(last + 1)];
  return { pecas, copies: copies.filter((c) => top.has([...map].find(([, v]) => v === c.id)?.[0] ?? '')).map((c) => c.id), rest: rests.length ? (r) => rests.forEach((f) => f(r)) : undefined, skipped };
}

/** The pieces deleting `ids` takes: them and everything inside the groups among them. */
export const removalOf = (data: MapData, ids: Iterable<string>) => [...subtree(data, ids)];
