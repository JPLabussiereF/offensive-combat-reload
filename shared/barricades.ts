// Barricades of the zumbi mode: the gaps in the cemetery wall (ZombieMapData.barricadas) where players nail
// boards across to keep the horde out of that gap and steer it to the ones left open (the kill zone).
// - Geometry: where a gap is and its two sides; the strip of walkable area inside the wall's thickness that the
//   navmesh bakes as polygons of their own (an area and a flag per gap: tools/bake-navmesh.ts, client/ai/navmesh.ts),
//   so the match can shut a gap for the zombies' pathfinding by excluding that flag; the box a zombie stands in to
//   tear at the boards; how close a player must be to work on them.
// - Rules (the match's, on the server online and in the browser solo): building one costs money and puts up the
//   frame with every board at once; nailing a board back is free and pays a little; each blow takes health off
//   the top board and a board falls when its health runs out; while any board stands the gap is shut.
import { isBoss, ZOMBIE, type BarricadeSpot, type ZKind, type ZombieMapData } from './zombies';
import type { Vec3, ZBarricade } from './protocol';

/** Navmesh polygon flags: every walkable polygon has WALK_FLAG; a gap's polygons also carry their gate's bit. */
export const WALK_FLAG = 1;
/** The flag of gap `i`'s polygons (up to 15 gaps: Detour flags are 16 bits). */
export const gateFlag = (i: number) => 1 << (i + 1);
/** The Recast area id of gap `i`'s polygons (0 is plain ground): a different area keeps them from merging. */
export const gateArea = (i: number) => i + 1;

/** A box of the navmesh bake marked as one gap's own area, and the flags its polygons get. */
export interface GateArea {
  min: Vec3;
  max: Vec3;
  area: number;
  flags: number;
}

/** Half the depth (across the wall) of a gap's own polygons: the wall's thickness and a little on each side. */
export const GATE_HALF_DEPTH = 0.5;
/** How far in front of a gap (either side) a zombie stands to tear at its boards. */
const SMASH_DEPTH = 1.8;
const SMASH_SIDE = 0.6;

/** The boxes the navmesh bake marks, one per gap, in the map's order. */
export function gateAreas(map: ZombieMapData): GateArea[] {
  return map.barricadas.map((g, i) => {
    const [cx, cy, cz] = g.centro;
    const along = g.largura / 2 + 0.05;
    const hx = g.eixo === 'x' ? along : GATE_HALF_DEPTH;
    const hz = g.eixo === 'x' ? GATE_HALF_DEPTH : along;
    return { min: [cx - hx, cy - 0.5, cz - hz], max: [cx + hx, cy + 2, cz + hz], area: gateArea(i), flags: WALK_FLAG | gateFlag(i) };
  });
}

/** A point in a gap's own frame: `along` the wall from the gap's middle, `across` it (the sign tells the side). */
export function gapFrame(g: BarricadeSpot, p: Vec3): { along: number; across: number } {
  const dx = p[0] - g.centro[0];
  const dz = p[2] - g.centro[2];
  return g.eixo === 'x' ? { along: dx, across: dz } : { along: dz, across: dx };
}

/** Inside the cemetery wall (the players' yard), as opposed to the grave field outside. */
export function insideWall(map: ZombieMapData, p: Vec3): boolean {
  const [x0, z0, x1, z1] = map.dentro;
  return p[0] > x0 && p[0] < x1 && p[2] > z0 && p[2] < z1;
}

/**
 * Whether the wall stands between `a` and `b` (a zombie's swipe, PF-16): they're on opposite sides of it and the
 * straight line between them meets it off an open gap (the bars, the stone base, or a gap shut by boards). `open`:
 * whether gap i (the map's order) has no boards. On the same side, nothing of the wall is in between.
 */
export function wallBetween(map: ZombieMapData, a: Vec3, b: Vec3, open: (i: number) => boolean): boolean {
  if (insideWall(map, a) === insideWall(map, b)) return false;
  const [x0, z0, x1, z1] = map.dentro;
  const sides: [axis: 'x' | 'z', fixed: number, from: number, to: number][] = [
    ['x', z0, x0, x1],
    ['x', z1, x0, x1],
    ['z', x0, z0, z1],
    ['z', x1, z0, z1],
  ];
  for (const [axis, fixed, from, to] of sides) {
    // Where the line crosses this side of the wall (along it), if it does.
    const [ac, bc] = axis === 'x' ? [a[2], b[2]] : [a[0], b[0]];
    if ((ac - fixed) * (bc - fixed) > 0 || ac === bc) continue;
    const k = (fixed - ac) / (bc - ac);
    const along = axis === 'x' ? a[0] + (b[0] - a[0]) * k : a[2] + (b[2] - a[2]) * k;
    if (along < from || along > to) continue;
    const through = map.barricadas.some((g, i) => g.eixo === axis && Math.abs((axis === 'x' ? g.centro[2] : g.centro[0]) - fixed) < 0.3 && Math.abs(along - (axis === 'x' ? g.centro[0] : g.centro[2])) <= g.largura / 2 && open(i));
    if (!through) return true;
  }
  return false;
}

/**
 * Where a player is up on the thorns: on the wall's ledge or bars (off the gaps) or on the hedge. The capsule
 * (radius 0.35) keeps anyone standing on the ground farther than the bands from both center lines, so only
 * climbing counts.
 */
export function thornsAt(map: ZombieMapData, p: Vec3): 'muro' | 'sebe' | null {
  const t = ZOMBIE.espinhos;
  if (p[1] < t.alturaMinima) return null;
  const [x0, z0, x1, z1] = map.dentro;
  const lines: [axis: 'x' | 'z', fixed: number, from: number, to: number][] = [
    ['x', z0, x0, x1],
    ['x', z1, x0, x1],
    ['z', x0, z0, z1],
    ['z', x1, z0, z1],
  ];
  for (const [axis, fixed, from, to] of lines) {
    const across = Math.abs((axis === 'x' ? p[2] : p[0]) - fixed);
    const along = axis === 'x' ? p[0] : p[2];
    if (across > t.faixaMuro || along < from - t.faixaMuro || along > to + t.faixaMuro) continue;
    const inGapHere = map.barricadas.some((g) => g.eixo === axis && (axis === 'x' ? g.centro[2] : g.centro[0]) === fixed && Math.abs(along - (axis === 'x' ? g.centro[0] : g.centro[2])) < g.largura / 2);
    if (!inGapHere) return 'muro';
  }
  if (map.sebe) {
    const [hx0, hz0, hx1, hz1] = map.sebe;
    const near = (v: number, a: number, b: number) => Math.min(Math.abs(v - a), Math.abs(v - b)) <= t.faixaSebe;
    const within = (v: number, a: number, b: number) => v >= a - t.faixaSebe && v <= b + t.faixaSebe;
    if ((near(p[0], hx0, hx1) && within(p[2], hz0, hz1)) || (near(p[2], hz0, hz1) && within(p[0], hx0, hx1))) return 'sebe';
  }
  return null;
}

/** Standing in the gap itself (within the wall's thickness), `margin` metres around it counted. */
export function inGap(g: BarricadeSpot, p: Vec3, margin = 0): boolean {
  const f = gapFrame(g, p);
  return Math.abs(f.along) <= g.largura / 2 + margin && Math.abs(f.across) <= GATE_HALF_DEPTH + margin && Math.abs(p[1] - g.centro[1]) < 2;
}

/** In front of a gap (either side), close enough to tear at its boards. */
export function atGap(g: BarricadeSpot, p: Vec3): boolean {
  const f = gapFrame(g, p);
  return Math.abs(f.along) <= g.largura / 2 + SMASH_SIDE && Math.abs(f.across) <= SMASH_DEPTH && Math.abs(p[1] - g.centro[1]) < 2;
}

/** A player's feet close enough to a gap to build or nail its barricade (from either side). */
export function inReach(g: BarricadeSpot, feet: Vec3): boolean {
  return Math.hypot(feet[0] - g.centro[0], feet[2] - g.centro[2]) <= ZOMBIE.barricadas.alcance && Math.abs(feet[1] - g.centro[1]) < 1.6;
}

/** No barricade yet: the gap is open. */
export const emptyBarricade = (): ZBarricade => ({ built: false, boards: 0, hp: 0 });

/** Any board standing shuts the gap. */
export const isClosed = (b: ZBarricade) => b.boards > 0;

/** Whether holding E there does anything: build it, or nail a board (a missing one, or the damaged top one). */
export const needsWork = (b: ZBarricade) => !b.built || b.boards < ZOMBIE.barricadas.tabuas || b.hp < ZOMBIE.barricadas.vidaTabua;

/** Builds it: the frame and every board, whole. */
export function buildBarricade(b: ZBarricade) {
  b.built = true;
  b.boards = ZOMBIE.barricadas.tabuas;
  b.hp = ZOMBIE.barricadas.vidaTabua;
}

/** One board nailed: the damaged top board made whole, or a missing one put back on top. */
export function nailBoard(b: ZBarricade) {
  const { tabuas, vidaTabua } = ZOMBIE.barricadas;
  if (b.boards > 0 && b.hp < vidaTabua) b.hp = vidaTabua;
  else if (b.boards < tabuas) {
    b.boards++;
    b.hp = vidaTabua;
  }
}

/** A blow on the boards: off the top board, the next taking what's left when one falls. Returns the boards lost. */
export function hitBarricade(b: ZBarricade, amount: number): number {
  let left = amount;
  let lost = 0;
  while (left > 0 && b.boards > 0) {
    const d = Math.min(b.hp, left);
    b.hp -= d;
    left -= d;
    if (b.hp <= 0) {
      b.boards--;
      lost++;
      b.hp = b.boards > 0 ? ZOMBIE.barricadas.vidaTabua : 0;
    }
  }
  return lost;
}

/** What one blow of a kind takes off the boards (bosses all hit as hard). */
export const boardDamage = (kind: ZKind) => (isBoss(kind) ? ZOMBIE.barricadas.dano.chefe : ZOMBIE.barricadas.dano[kind]);

/** The kinds that never go around a shut gap: they tear straight through it (the bruiser and every boss). */
export const smashesThrough = (kind: ZKind) => kind === 'brutamontes' || isBoss(kind);

/** How whole a barricade is (0: no boards, 1: every board whole), for the HUD and the boards' look. */
export function barricadeHealth(b: ZBarricade): number {
  const { tabuas, vidaTabua } = ZOMBIE.barricadas;
  if (b.boards <= 0) return 0;
  return ((b.boards - 1) * vidaTabua + b.hp) / (tabuas * vidaTabua);
}
