// The chapel's altar: the box piece the totem stands on. The zombie match punishes whoever stays up there (the
// sacrilege, ZOMBIE.sacrilegio, shared/zombieMatch.ts). Found in the map's pieces, so it is wherever the map puts it.
import type { Vec3 } from './protocol';

/** The altar's box: center and half sizes (metres), turned `yaw` around the vertical. */
export interface Altar {
  c: Vec3;
  h: Vec3;
  yaw: number;
}

/**
 * The altar among a map's pieces: the box (type 'caixa', not tilted) whose top is where the totem stands and
 * that holds it. Null without a totem or such a box.
 */
export function altarOf(pieces: { tipo: string; p?: number[]; yaw?: number; params?: Record<string, unknown> }[], totem: Vec3 | undefined): Altar | null {
  if (!totem) return null;
  for (const p of pieces) {
    const size = p.params?.tamanho;
    const rot = p.params?.rot as number[] | undefined;
    if (p.tipo !== 'caixa' || !p.p || !Array.isArray(size) || (rot && rot.some((r) => r))) continue;
    const a: Altar = { c: [p.p[0], p.p[1], p.p[2]], h: [size[0] / 2, size[1] / 2, size[2] / 2], yaw: p.yaw ?? 0 };
    if (Math.abs(a.c[1] + a.h[1] - totem[1]) < 0.05 && onTop(a, totem, 0)) return a;
  }
  return null;
}

/** `feet` over the altar's top (the body's radius may hang over the edge), whatever the height. */
function onTop(a: Altar, feet: Vec3, radius: number): boolean {
  const dx = feet[0] - a.c[0];
  const dz = feet[2] - a.c[2];
  // Into the box's own frame (yaw turns it like any piece: 0 keeps its sizes along x and z).
  const cos = Math.cos(a.yaw);
  const sin = Math.sin(a.yaw);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= a.h[0] + radius && Math.abs(lz) <= a.h[2] + radius;
}

/** Someone standing on the altar: feet over its top and at its height (in front of it, on the floor, never counts). */
export function onAltar(a: Altar, feet: Vec3, radius = 0.3): boolean {
  const top = a.c[1] + a.h[1];
  return feet[1] >= top - 0.3 && feet[1] <= top + 0.6 && onTop(a, feet, radius);
}
