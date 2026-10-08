// Tombstones as solid boxes: the map builds their colliders from this table (client/world/halloween.ts
// tombstone), and the zombie match uses it to tell who is standing on one (the haunted graves: ghosts chase
// whoever climbs a tombstone, shared/zombieMatch.ts). One table, so the rule can't drift from the stones.
import type { Vec3 } from './protocol';

export type TombKind = 'arco' | 'cruz' | 'laje' | 'obelisco';

/** Each kind's collider in the stone's own frame (yaw 0: its face looks toward +Z): center and half sizes, metres. */
export const TOMB_BOXES: Record<TombKind, { c: [number, number, number]; h: [number, number, number] }> = {
  arco: { c: [0, 0.66, 0], h: [0.36, 0.66, 0.1] },
  cruz: { c: [0, 0.85, 0], h: [0.12, 0.85, 0.1] },
  laje: { c: [0, 0.3, -0.45], h: [0.45, 0.3, 1.0] },
  obelisco: { c: [0, 1.2, 0], h: [0.24, 1.2, 0.24] },
};

/** A tombstone on a map: where it stands, which way its face looks and its kind. */
export interface Tomb {
  x: number;
  z: number;
  yaw: number;
  kind: TombKind;
}

/** The tombstones among a map's pieces (shared/data/mapas/<map>.json, pieces of type 'lapide'). */
export function tombsOf(pieces: { tipo: string; p?: number[]; yaw?: number; params?: Record<string, unknown> }[]): Tomb[] {
  return pieces
    .filter((p) => p.tipo === 'lapide' && p.p && typeof p.params?.tipo === 'string' && p.params.tipo in TOMB_BOXES)
    .map((p) => ({ x: p.p![0], z: p.p![2], yaw: p.yaw ?? 0, kind: p.params!.tipo as TombKind }));
}

/**
 * The tombstone someone is standing on, or null: feet over its top (the body's radius may hang over the edge)
 * and at its height. Next to a stone on the ground the feet are well below every top (the lowest, a ledger
 * slab, is 0.6 m), so walking past never counts; jumping on one does.
 */
export function tombUnder(tombs: Tomb[], feet: Vec3, radius = 0.3): Tomb | null {
  for (const t of tombs) {
    const b = TOMB_BOXES[t.kind];
    const top = b.c[1] + b.h[1];
    if (feet[1] < top - 0.3 || feet[1] > top + 0.6) continue;
    const dx = feet[0] - t.x;
    const dz = feet[2] - t.z;
    if (Math.abs(dx) > 2.5 || Math.abs(dz) > 2.5) continue;
    // Into the stone's frame (the inverse of its yaw about Y).
    const cos = Math.cos(t.yaw);
    const sin = Math.sin(t.yaw);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx - b.c[0]) <= b.h[0] + radius && Math.abs(lz - b.c[2]) <= b.h[2] + radius) return t;
  }
  return null;
}
