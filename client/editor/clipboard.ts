// Copy and paste in the editor (PF-6 Revisions 01, etapa 3), without a screen. Ctrl+C keeps a snapshot of the
// selected pieces with everything inside the groups among them (the originals may change or go before pasting),
// plus where each top piece's group put it in the world and the box around them. Ctrl+V adds copies as one edit:
// new ids, gag ids, seeds and server places as Ctrl+D makes them (client/editor/create.ts), children hanging from
// their copied group; a top piece whose group is still in the map goes back into it, one whose group is gone
// lands at the top where it was in the world; then the copies move by `delta` (pasting where the mouse points, or
// in the same place with an offset). client/tests/editorClipboard.test.ts runs it as is.
import * as THREE from 'three';
import type { MapData, Peca, Vec3 } from '@shared/mapData';
import { clone, restOf, type Rest } from './document';
import { finder, isGroup, linkedRest, moveTree, parentFrame, subtree, topLevel } from './groups';
import { duplicatePiece } from './create';
import { applyHandle, handleBase, handleWorld } from './transform';

export interface Clip {
  /** The pieces copied (the selection's top pieces and everything inside them), in the map's order. */
  pecas: Peca[];
  /** The top pieces' ids. */
  tops: string[];
  /** Where each top piece's groups put it in the world when copied (null: at the top). */
  frames: Record<string, number[] | null>;
  /** The box around what they built when copied (world), if known. */
  box: { min: Vec3; max: Vec3 } | null;
}

/** The snapshot Ctrl+C keeps (null: no piece selected). */
export function copyPieces(data: MapData, ids: Iterable<string>, box: THREE.Box3 | null = null): Clip | null {
  const find = finder(data);
  const tops = topLevel(data, ids, find);
  if (!tops.length) return null;
  const all = subtree(data, tops);
  const frames: Clip['frames'] = {};
  for (const id of tops) frames[id] = parentFrame(data, find(id)!, find)?.toArray() ?? null;
  return {
    pecas: data.pecas.filter((p) => all.has(p.id)).map(clone),
    tops,
    frames,
    box: box && !box.isEmpty() ? { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 } : null,
  };
}

/** Where the copies land: the bottom of their box in the middle (what goes on the point the mouse aims at). */
export function clipAnchor(c: Clip): THREE.Vector3 | null {
  if (!c.box) return null;
  const [x0, y0, z0] = c.box.min;
  const [x1, , z1] = c.box.max;
  return new THREE.Vector3((x0 + x1) / 2, y0, (z0 + z1) / 2);
}

export interface Pasted {
  /** The map's new list of pieces (the copies at the end). */
  pecas: Peca[];
  /** The top copies' ids (what gets selected). */
  copies: string[];
  /** The server's places the copies come with (a rat's, moved with it). */
  rest?: (r: Rest) => void;
  /** Pieces not copied: their kind is at its limit (and what was inside them). */
  skipped: string[];
}

/** The copies of a snapshot added to `data`, moved by `delta` (a rigid move of the world). */
export function pastePieces(data: MapData, clip: Clip, delta: THREE.Matrix4 = new THREE.Matrix4()): Pasted {
  const find = finder(data);
  const tops = new Set(clip.tops);
  // The copies are made against a working map that grows with them: ids, gag ids and object ids look at it all.
  const work: MapData = { ...(restOf(data) as Rest), pecas: [...data.pecas] } as MapData;
  const map = new Map<string, string>();
  const made: Peca[] = [];
  const rests: ((r: Rest) => void)[] = [];
  const skipped: string[] = [];
  for (const src of clip.pecas) {
    let from = src;
    if (tops.has(src.id)) {
      const pai = src.pai && isGroup(find(src.pai)) ? src.pai : null;
      if (!pai && src.pai) {
        // Its group is gone: it goes to the top, where it was in the world.
        const f = clip.frames[src.id];
        const base = handleBase(src, new THREE.Vector3());
        from = applyHandle(src, base, handleWorld(src, base, f ? new THREE.Matrix4().fromArray(f) : null));
        delete from.pai;
      }
    } else if (!src.pai || !map.has(src.pai)) {
      // Inside a group that wasn't copied (its kind was at its limit).
      skipped.push(src.id);
      continue;
    }
    const copy = duplicatePiece(work, from, [0, 0, 0]);
    if (!copy) {
      skipped.push(src.id);
      continue;
    }
    if (src.nome) copy.peca.nome = src.nome;
    if (from.pai) copy.peca.pai = map.get(from.pai) ?? from.pai;
    map.set(src.id, copy.peca.id);
    work.pecas.push(copy.peca);
    made.push(copy.peca);
    if (copy.rest) {
      rests.push(copy.rest);
      copy.rest(work);
    }
  }
  const copies = clip.tops.map((id) => map.get(id)).filter((id): id is string => !!id);
  const moved = delta.equals(new THREE.Matrix4()) ? work.pecas : moveTree(work, copies, delta);
  const linked = linkedRest(work, moved);
  const all = [...rests, ...(linked ? [linked] : [])];
  return { pecas: moved, copies, rest: all.length ? (r) => all.forEach((f) => f(r)) : undefined, skipped };
}
