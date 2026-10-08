// Dead trees' trunks as solid boxes: the map builds each tree's collider from this shape (client/world/halloween.ts
// deadTree), and the zombie match uses it to tell who is standing on top of one (the crows peck whoever climbs a
// tree, shared/zombieMatch.ts). One shape, so the rule can't drift from the trees.
import type { Vec3 } from './protocol';
import { seeded } from './seeded';

/** A dead tree's first random draws (its piece's seed): which way it leans, and how tall it is. */
export function treeShape(rand: () => number, scale: number): { lean: number; lx: number; lz: number; h: number } {
  const lean = rand() * Math.PI * 2;
  return { lean, lx: Math.cos(lean), lz: Math.sin(lean), h: (3.4 + rand() * 1.2) * scale };
}

/** A tree's trunk collider: center and half sizes (metres, axis aligned). */
export interface Trunk {
  c: Vec3;
  h: Vec3;
}

/** The trunk collider of a dead tree standing at (x, y, z), `scale` times its size, with that shape. */
export function trunkOf(x: number, y: number, z: number, scale: number, shape: { lx: number; lz: number; h: number }): Trunk {
  return { c: [x + shape.lx * 0.2 * scale, y + shape.h * 0.32, z + shape.lz * 0.2 * scale], h: [0.3 * scale, shape.h * 0.32, 0.3 * scale] };
}

/** The trunks of a map's dead trees that have one (pieces of type 'arvoreMorta' not set to `colide: false`). */
export function treesOf(pieces: { tipo: string; p?: number[]; escala?: number; semente?: number; params?: Record<string, unknown> }[]): Trunk[] {
  return pieces
    .filter((p) => p.tipo === 'arvoreMorta' && p.p && p.params?.colide !== false)
    .map((p) => {
      const scale = p.escala ?? 1;
      return trunkOf(p.p![0], p.p![1] ?? 0, p.p![2], scale, treeShape(seeded(p.semente ?? 0), scale));
    });
}

/**
 * The tree someone is standing on top of, or null: feet over the top of its trunk (the body's radius may hang
 * over the edge) and at its height (over 2 m: walking past or leaning on one never counts).
 */
export function treeUnder(trees: Trunk[], feet: Vec3, radius = 0.3): Trunk | null {
  for (const t of trees) {
    const top = t.c[1] + t.h[1];
    if (feet[1] < top - 0.3 || feet[1] > top + 0.6) continue;
    if (Math.abs(feet[0] - t.c[0]) <= t.h[0] + radius && Math.abs(feet[2] - t.c[2]) <= t.h[2] + radius) return t;
  }
  return null;
}
