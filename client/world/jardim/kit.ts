// Shared layout and pieces of "Jardim do Dragão" (docs: the Chinese estate design): the sector rectangles,
// garden walls with their gates, spirit walls, water basins, bridges, bamboo groves and small props.
// Every sector file builds on a `Ctx` so the lanterns, props and animations end up in one place.
import * as THREE from 'three';
import { fitText } from '../canvasText';
import { toon, toonGradient } from '../../render/materials';
import type { SpatialKindName, SpatialSfx, Vec } from '../../audio/spatial';
import type { MapFrame } from '../gameMap';
import type { WaterDrops } from '../hydrant';
import { MapBuilder, stairRun, worldUVs } from '../mapBuilder';
import type { PropBus } from '../props';
import { surfaceMaterial, type SurfaceKey } from '../surfaces';
import { column, curvedRoof, foliageGeometry, Lanterns, leafClump, lumps, ORIENTAL as C, moonGateWall, railing, seeded, solidIntervals, wallCap, type Rect } from '../oriental';

export interface GardenSfx extends SpatialSfx {
  gong(): void;
  bell(size: number, note?: number): void;
  drum(size: number): void;
  roar(): void;
  lanternTap(): void;
  ambientBird(): void;
  /** A cherry knocked off the tree. */
  fruitSplat(): void;
}

export interface Ctx {
  b: MapBuilder;
  scene: THREE.Scene;
  /** Seeded: rocks, trees and bamboo collide the same way on every client. */
  rand: () => number;
  lanterns: Lanterns;
  props: PropBus;
  sfx: GardenSfx;
  /** Glowing cores (stone lanterns, crypt lamps): merged into one unlit mesh at the end. */
  glow: THREE.BufferGeometry[];
  animate(f: (dt: number, frame: MapFrame) => void): void;
  water: THREE.Material;
  drops: WaterDrops;
  /** Holes the sectors cut in the ground (ponds, the lake, the stream). */
  holes: Rect[];
}

// --- Layout -----------------------------------------------------------------------------------------
//
//            x=-45        -18          18          45
//   z=-45    +-----------+------------+-----------+
//            | SANTUÁRIO |   BONSAI   |   LAGO    |
//   z=-20    |           +------------+           |
//            |           |    anel    |           |
//   z=0      +-----------+  +------+  +-----------+
//            |   BAMBU   |  | CASA |  | LANTERNAS |
//   z=20     |           +------------+           |
//            |           | GUERREIROS |           |
//   z=45     +-----------+------------+-----------+
//
// North is -Z. The six sectors ring the main house in the order of the design (each one touches the next
// and the ring around the house); the house sits on the ring, x/z -13..13.

/** Half extent of the estate (the inner face of the outer wall). */
export const W = 45;
/** Half width of the middle column (Bonsai, the ring, Guerreiros). */
export const MID_X = 18;
/** Half depth of the ring zone. */
export const MID_Z = 20;
/** Half extent of the main house. */
export const HOUSE = 13;
export const WALL_H = 4;
export const WALL_T = 0.6;

export const SECTOR = {
  bonsai: { x0: -MID_X, x1: MID_X, z0: -W, z1: -MID_Z },
  lago: { x0: MID_X, x1: W, z0: -W, z1: 0 },
  lanternas: { x0: MID_X, x1: W, z0: 0, z1: W },
  guerreiros: { x0: -MID_X, x1: MID_X, z0: MID_Z, z1: W },
  bambu: { x0: -W, x1: -MID_X, z0: 0, z1: W },
  santuario: { x0: -W, x1: -MID_X, z0: -W, z1: 0 },
} satisfies Record<string, Rect>;

export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });

// --- Ground, paving, water --------------------------------------------------------------------------

/** Rectangle minus holes as few boxes as possible (ground with ponds cut out, slabs with stairwells). */
export function slab(b: MapBuilder, r: Rect, holes: Rect[], y0: number, y1: number, surface: SurfaceKey, o: Parameters<MapBuilder['span']>[7] = {}) {
  const xs = [...new Set([r.x0, r.x1, ...holes.flatMap((h) => [h.x0, h.x1]).filter((x) => x > r.x0 && x < r.x1)])].sort((p, q) => p - q);
  const zs = [...new Set([r.z0, r.z1, ...holes.flatMap((h) => [h.z0, h.z1]).filter((z) => z > r.z0 && z < r.z1)])].sort((p, q) => p - q);
  for (let j = 0; j < zs.length - 1; j++) {
    const zm = (zs[j] + zs[j + 1]) / 2;
    let run: number | null = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const xm = (xs[i] + xs[i + 1]) / 2;
      const solid = !holes.some((h) => xm > h.x0 && xm < h.x1 && zm > h.z0 && zm < h.z1);
      if (solid && run === null) run = xs[i];
      if (!solid && run !== null) {
        b.span(run, y0, zs[j], xs[i], y1, zs[j + 1], surface, o);
        run = null;
      }
    }
    if (run !== null) b.span(run, y0, zs[j], xs[xs.length - 1], y1, zs[j + 1], surface, o);
  }
}

/** Flat paving laid over the grass (visual; the ground underneath collides). `y` staggers overlaps. */
export function pave(b: MapBuilder, r: Rect, tint: number = C.stone, surface: SurfaceKey = 'pedra', y = 0.03) {
  b.span(r.x0, 0, r.z0, r.x1, y, r.z1, surface, { tint, collide: false, castShadow: false });
}

export function waterPlane(c: Ctx, r: Rect, y = -0.25) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2), c.water);
  m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  m.receiveShadow = true;
  c.scene.add(m);
}

/**
 * Pond in a hole of the ground: a floor `depth` down, a stone lining, a coping around the edge (on `coping`
 * sides) and the water surface. Shallow enough to wade; jump or take the steps out.
 */
export function basin(c: Ctx, r: Rect, depth: number, o: { coping?: ('n' | 's' | 'e' | 'w')[]; waterY?: number; floor?: number } = {}) {
  const { b } = c;
  b.span(r.x0, -depth - 0.3, r.z0, r.x1, -depth, r.z1, 'pedra', { tint: o.floor ?? 0x6f7d6a, castShadow: false });
  const lining = { tint: 0x7d8178, collide: false, castShadow: false };
  b.span(r.x0, -depth, r.z0, r.x0 + 0.03, 0, r.z1, 'pedra', lining);
  b.span(r.x1 - 0.03, -depth, r.z0, r.x1, 0, r.z1, 'pedra', lining);
  b.span(r.x0, -depth, r.z0, r.x1, 0, r.z0 + 0.03, 'pedra', lining);
  b.span(r.x0, -depth, r.z1 - 0.03, r.x1, 0, r.z1, 'pedra', lining);
  const cope = { tint: C.stone, castShadow: false };
  const sides = o.coping ?? ['n', 's', 'e', 'w'];
  if (sides.includes('n')) b.span(r.x0 - 0.5, 0, r.z0 - 0.5, r.x1 + 0.5, 0.12, r.z0, 'pedra', cope);
  if (sides.includes('s')) b.span(r.x0 - 0.5, 0, r.z1, r.x1 + 0.5, 0.12, r.z1 + 0.5, 'pedra', cope);
  if (sides.includes('w')) b.span(r.x0 - 0.5, 0, r.z0, r.x0, 0.12, r.z1, 'pedra', cope);
  if (sides.includes('e')) b.span(r.x1, 0, r.z0, r.x1 + 0.5, 0.12, r.z1, 'pedra', cope);
  waterPlane(c, r, o.waterY ?? -0.25);
}

/** Lily pads, some with a lotus flower. */
export function lilies(c: Ctx, r: Rect, n: number, y = -0.235) {
  const paint = surfaceMaterial('pintura');
  for (let i = 0; i < n; i++) {
    const x = r.x0 + 0.5 + c.rand() * (r.x1 - r.x0 - 1);
    const z = r.z0 + 0.5 + c.rand() * (r.z1 - r.z0 - 1);
    const s = 0.3 + c.rand() * 0.25;
    c.b.addGeometry(new THREE.CylinderGeometry(s, s, 0.02, 12, 1, false, 0.4, Math.PI * 2 - 0.8).translate(x, y, z), paint, 0x4f9e3a, false);
    if (c.rand() < 0.4) c.b.addGeometry(new THREE.ConeGeometry(0.13, 0.2, 6).translate(x + 0.08, y + 0.1, z), paint, 0xff8fb8, false);
  }
}

/** Reeds standing in the water: they hide whoever is behind, but bullets go through. */
export function reeds(c: Ctx, x: number, z: number, n: number, spread: number, y0 = -0.8) {
  const paint = surfaceMaterial('pintura');
  for (let i = 0; i < n; i++) {
    const a = c.rand() * Math.PI * 2;
    const d = Math.sqrt(c.rand()) * spread;
    const h = 1.9 + c.rand() * 0.9;
    const sx = x + Math.cos(a) * d;
    const sz = z + Math.sin(a) * d;
    c.b.addGeometry(new THREE.ConeGeometry(0.05, h, 4).translate(sx, y0 + h / 2, sz), paint, c.rand() < 0.5 ? 0x6f9a3a : 0x86a84a, false);
    if (c.rand() < 0.35) c.b.addGeometry(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 5).translate(sx, y0 + h * 0.8, sz), paint, 0x6b4a2a, false);
  }
}

// --- Walls and gates --------------------------------------------------------------------------------

export interface Gate {
  /** Center along the wall. */
  at: number;
  /** 'portal': roofed gate with columns and a name plaque; 'lua': round moon gate; 'porta': a plain side door. */
  kind?: 'portal' | 'lua' | 'porta';
  w?: number;
  h?: number;
  /** Characters on the plaque (portal). */
  name?: string;
  /** Column color (portal). */
  tint?: number;
  /** Lacquered door leaves swung open against the wall. */
  leaves?: boolean;
  /** Portal without its own roof (under a building's eaves). */
  roof?: boolean;
}

/**
 * Plaster garden wall with a stone base and a tiled cap, cut by its gates. `axis` 'x' runs along X at
 * z = `fixed`; 'z' runs along Z at x = `fixed`. Walls between sectors are 4 m: nobody looks over them.
 */
export function gardenWall(c: Ctx, axis: 'x' | 'z', fixed: number, a: number, end: number, gates: Gate[] = [], h = WALL_H, t = WALL_T) {
  const { b } = c;
  const size = (g: Gate) => ({ w: g.w ?? (g.kind === 'porta' ? 1.8 : g.kind === 'lua' ? 3.2 : 3.2), h: g.h ?? (g.kind === 'porta' ? 2.5 : 3.2) });
  const moon = gates.find((g) => g.kind === 'lua');
  const rect = gates.filter((g) => g !== moon).map((g): [number, number, number, number] => [g.at - size(g).w / 2, g.at + size(g).w / 2, 0, size(g).h]);
  if (moon) moonGateWall(b, axis, fixed, a, end, t, h, moon.at, size(moon).w / 2 + 0.2, rect);
  else b.wall(axis, fixed, a, end, t, h, 'concreto', rect, 0, { tint: C.plaster });
  // Stone base band and the tiled cap, interrupted at the gates. At a gate the band wraps 4 cm into the
  // passage (as proud of the jamb as of the faces): ending flush with the jamb, the two faces fought.
  const bandGap = (g: Gate) => (g.kind === 'lua' ? -0.2 : g.kind === 'porta' ? 0 : 0.04);
  const holes = gates.map((g): [number, number] => [g.at - size(g).w / 2 + bandGap(g), g.at + size(g).w / 2 - bandGap(g)]);
  const band = { tint: C.stoneDark, collide: false, castShadow: false };
  for (const [s0, s1] of solidIntervals(a, end, holes)) {
    if (axis === 'x') b.span(s0, 0, fixed - t / 2 - 0.04, s1, 0.55, fixed + t / 2 + 0.04, 'pedra', band);
    else b.span(fixed - t / 2 - 0.04, 0, s0, fixed + t / 2 + 0.04, 0.55, s1, 'pedra', band);
  }
  const caps = solidIntervals(a, end, gates.filter((g) => g.kind === 'portal' || !g.kind).map((g) => [g.at - size(g).w / 2 - 0.9, g.at + size(g).w / 2 + 0.9]));
  for (const [s0, s1] of caps) {
    if (axis === 'x') wallCap(b, s0, fixed - t / 2 - 0.05, s1, fixed + t / 2 + 0.05, h);
    else wallCap(b, fixed - t / 2 - 0.05, s0, fixed + t / 2 + 0.05, s1, h);
  }
  for (const g of gates) {
    const { w, h: gh } = size(g);
    if (g.kind === 'porta') doorFrame(c, axis, fixed, g.at, w, gh, t);
    else if (g.kind !== 'lua') gateway(c, axis, fixed, g, w, gh, h, t);
    if (g.leaves) doorLeaves(c, axis, fixed, g.at, w, gh, t);
  }
}

/** Point on a wall: `s` along it, `d` off its center line. */
const onWall = (axis: 'x' | 'z', fixed: number, s: number, d: number): [number, number] => (axis === 'x' ? [s, fixed + d] : [fixed + d, s]);

/** Roofed gate: lacquered columns on both faces, a painted lintel, a curved roof and the name plaque. */
export function gateway(c: Ctx, axis: 'x' | 'z', fixed: number, g: Gate, w: number, gh: number, h: number, t: number) {
  const { b } = c;
  const s0 = g.at - w / 2;
  const s1 = g.at + w / 2;
  for (const side of [-1, 1]) {
    for (const s of [s0 - 0.28, s1 + 0.28]) {
      const [x, z] = onWall(axis, fixed, s, side * (t / 2 + 0.3));
      b.cylinder(x, 0, z, 0.32, 0.3, 'pedra', { tint: C.stone, segments: 8, collide: false });
      b.cylinder(x, 0, z, 0.2, g.roof === false ? gh + 0.55 : h + 0.25, 'pintura', { tint: g.tint ?? C.lacquer, segments: 10, physics: 'wood' });
    }
  }
  const beam = (y0: number, y1: number, d: number, tint: number) => {
    if (axis === 'x') b.span(s0 - 0.6, y0, fixed - d / 2, s1 + 0.6, y1, fixed + d / 2, 'pintura', { tint, collide: false });
    else b.span(fixed - d / 2, y0, s0 - 0.6, fixed + d / 2, y1, s1 + 0.6, 'pintura', { tint, collide: false });
  };
  beam(gh, gh + 0.3, t + 0.95, C.beam);
  beam(gh - 0.05, gh, t + 0.97, C.gold);
  if (g.roof === false) {
    nameBoards(c, axis, fixed, g, w, gh + 0.4, t);
    return;
  }
  beam(h - 0.05, h + 0.2, t + 0.95, g.tint ?? C.lacquer);
  // For the sound: a roofed passage through the wall, open at both ends.
  const p0 = onWall(axis, fixed, s0, -(t / 2 + 1.2));
  const p1 = onWall(axis, fixed, s1, t / 2 + 1.2);
  b.room({ x: p0[0], y: 0, z: p0[1] }, { x: p1[0], y: gh, z: p1[1] }, 0.5);
  const along: Rect = axis === 'x' ? { x0: s0 - 1.3, x1: s1 + 1.3, z0: fixed - t / 2 - 1.2, z1: fixed + t / 2 + 1.2 } : { x0: fixed - t / 2 - 1.2, x1: fixed + t / 2 + 1.2, z0: s0 - 1.3, z1: s1 + 1.3 };
  const top: Rect = axis === 'x' ? { x0: s0 - 0.1, x1: s1 + 0.1, z0: fixed, z1: fixed } : { x0: fixed, x1: fixed, z0: s0 - 0.1, z1: s1 + 0.1 };
  curvedRoof(b, { outer: along, top, eaveY: h + 0.2, topY: h + 1.15, curl: 0.5, ridges: true, collide: false });
  for (const side of [-1, 1]) {
    const [x, z] = onWall(axis, fixed, g.at, side * (t / 2 + 0.75));
    c.lanterns.hang(new THREE.Vector3(x, h + 0.15, z), 0.75);
  }
  nameBoards(c, axis, fixed, g, w, (gh + h) / 2 + 0.05, t);
}

/** The gate's name plaque on both faces of the wall. */
function nameBoards(c: Ctx, axis: 'x' | 'z', fixed: number, g: Gate, w: number, y: number, t: number) {
  if (!g.name) return;
  for (const side of [-1, 1]) {
    const [x, z] = onWall(axis, fixed, g.at, side * (t / 2 + 0.06));
    const yaw = axis === 'x' ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
    plaque(c.scene, g.name, x, y, z, yaw, Math.min(w - 0.2, 0.75 * g.name.length + 0.4), 0.62);
  }
}

/** Plain lacquered frame around a side door. */
function doorFrame(c: Ctx, axis: 'x' | 'z', fixed: number, at: number, w: number, gh: number, t: number) {
  const o = { tint: C.lacquerDark, collide: false, castShadow: false };
  const d = t + 0.1;
  const piece = (s0: number, s1: number, y0: number, y1: number) => {
    if (axis === 'x') c.b.span(s0, y0, fixed - d / 2, s1, y1, fixed + d / 2, 'pintura', o);
    else c.b.span(fixed - d / 2, y0, s0, fixed + d / 2, y1, s1, 'pintura', o);
  };
  // 3 cm proud of the opening's jambs and lintel (closer, the faces fight from a distance).
  piece(at - w / 2 - 0.14, at - w / 2 + 0.03, 0, gh);
  piece(at + w / 2 - 0.03, at + w / 2 + 0.14, 0, gh);
  piece(at - w / 2 - 0.14, at + w / 2 + 0.14, gh - 0.03, gh + 0.16);
}

/** Two lacquered leaves with golden studs, swung all the way open against one face of the wall. */
export function doorLeaves(c: Ctx, axis: 'x' | 'z', fixed: number, at: number, w: number, gh: number, t: number, side: 1 | -1 = 1) {
  const lw = w / 2;
  for (const s of [-1, 1]) {
    const mid = at + s * (w / 2 + lw / 2 + 0.05);
    const [x, z] = onWall(axis, fixed, mid, side * (t / 2 + 0.06));
    const sx = axis === 'x' ? lw : 0.1;
    const sz = axis === 'x' ? 0.1 : lw;
    c.b.box(x, gh / 2, z, sx, gh - 0.05, sz, 'pintura', { tint: C.lacquer, collide: false });
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 3; k++) {
        const ss = mid + (k - 1) * lw * 0.28;
        const [sx2, sz2] = onWall(axis, fixed, ss, side * (t / 2 + 0.13));
        c.b.box(sx2, 0.7 + r * 0.55, sz2, 0.07, 0.07, 0.07, 'pintura', { tint: C.gold, collide: false, castShadow: false });
      }
    }
  }
}

// --- Signs ------------------------------------------------------------------------------------------

function canvasMaterial(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() });
}

const CJK = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", serif';

/**
 * Box for a sign: its +Z face (and -Z with `both`) takes material 1, the edges material 0. The faces are
 * reordered into two groups: two draw calls instead of six.
 */
function boardGeometry(w: number, h: number, d: number, both: boolean) {
  const g = new THREE.BoxGeometry(w, h, d);
  const idx = Array.from(g.index!.array);
  const face = (k: number) => idx.slice(k * 6, k * 6 + 6);
  const front = both ? [4, 5] : [4];
  const rest = [0, 1, 2, 3, 4, 5].filter((k) => !front.includes(k));
  g.setIndex([...rest.flatMap(face), ...front.flatMap(face)]);
  g.clearGroups();
  g.addGroup(0, rest.length * 6, 0);
  g.addGroup(rest.length * 6, front.length * 6, 1);
  return g;
}

/** Hanging plaque with big characters (a gate's name board). Readable from its front (+Z after `yaw`). */
export function plaque(scene: THREE.Scene, text: string, x: number, y: number, z: number, yaw: number, w: number, h: number, bg = '#1f3d6b', fg = '#f2c94c') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#e7b847';
  g.lineWidth = 10;
  g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${Math.round(Math.min(c.height * 0.62, (c.width * 0.8) / text.length))}px ${CJK}`;
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const face = canvasMaterial(c);
  const edge = toon(0xe7b847);
  const board = new THREE.Mesh(boardGeometry(w, h, 0.08, false), [edge, face]);
  board.position.set(x, y, z);
  board.rotation.y = yaw;
  scene.add(board);
}

/**
 * Stone-carved inscription in vertical columns, read top to bottom and right to left (as on a stele). The
 * characters are cut dark into a pale panel framed in gold. Faces +Z after `yaw`.
 */
export function inscription(scene: THREE.Scene, columns: string[], x: number, y: number, z: number, yaw: number, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9c3b6';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#b08a3a';
  g.lineWidth = 6;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  const rows = Math.max(...columns.map((col) => [...col].length));
  const size = Math.min((c.width - 30) / columns.length, (c.height - 30) / rows) * 0.92;
  g.fillStyle = '#3a3f4b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${Math.round(size)}px ${CJK}`;
  const colW = (c.width - 24) / columns.length;
  columns.forEach((col, k) => {
    const cx = c.width - 12 - colW * (k + 0.5);
    const chars = [...col];
    const top = (c.height - chars.length * size) / 2;
    chars.forEach((ch, i) => g.fillText(ch, cx, top + size * (i + 0.5)));
  });
  const board = new THREE.Mesh(boardGeometry(w, h, 0.04, false), [toon(0xb08a3a), canvasMaterial(c)]);
  board.position.set(x, y, z);
  board.rotation.y = yaw;
  scene.add(board);
}

/** Pun sign on two posts, readable from both sides. */
export function signBoard(c: Ctx, lines: string[], x: number, z: number, yaw: number, bg: string, fg: string, height: number) {
  for (const side of [-1, 1]) {
    const ox = Math.cos(yaw) * side * 0.6;
    const oz = -Math.sin(yaw) * side * 0.6;
    c.b.cylinder(x + ox, 0, z + oz, 0.045, height + 0.3, 'pintura', { tint: C.lacquer, segments: 6 });
  }
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 160;
  const g = cv.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#1b1530';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 150);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((line, i) =>
    fitText(g, line, 128, i === 0 ? 44 : i === 1 ? 84 : 122, 224, (px) => (i < 2 ? `400 ${px}px "Lilita One", system-ui, sans-serif` : `800 ${px}px Nunito, system-ui, sans-serif`), i === 0 ? 40 : i === 1 ? 30 : 18),
  );
  const wood = toon(0x8a5432);
  const face = canvasMaterial(cv);
  const board = new THREE.Mesh(boardGeometry(1.1, 0.7, 0.05, true), [wood, face]);
  board.position.set(x, height, z);
  board.rotation.y = yaw;
  board.castShadow = true;
  c.scene.add(board);
}

/** A painting hung on a wall: canvas drawn by `paint` (512 x 512 * h / w). Faces +Z after `yaw`. */
export function painting(scene: THREE.Scene, x: number, y: number, z: number, yaw: number, w: number, h: number, paint: (g: CanvasRenderingContext2D, cw: number, ch: number) => void) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d')!;
  paint(g, c.width, c.height);
  const frame = toon(0x5a3420);
  const board = new THREE.Mesh(boardGeometry(w, h, 0.05, false), [frame, canvasMaterial(c)]);
  board.position.set(x, y, z);
  board.rotation.y = yaw;
  scene.add(board);
}

// --- Bridges, decks, small buildings ----------------------------------------------------------------

/**
 * Arched stone bridge along `axis` from `a` to `end` (ground level `y0` at both ends), `width` across,
 * rising to `peak` over the middle third. Ramps collide as rotated boxes; parapets on both sides.
 */
export function archBridge(c: Ctx, axis: 'x' | 'z', a: number, end: number, across: number, width: number, peak: number, y0 = 0, tint: number = C.stone, surface: SurfaceKey = 'pedra') {
  const { b } = c;
  const len = end - a;
  const ramp = len / 3;
  const P = (s: number, y: number, d: number) => (axis === 'x' ? new THREE.Vector3(s, y, across + d) : new THREE.Vector3(across + d, y, s));
  const seg = (sa: number, ya: number, sb: number, yb: number, thick: number, d: number, w: number, surf: SurfaceKey, t: number, collide = true) => {
    const ang = Math.atan2(yb - ya, sb - sa);
    const l = Math.hypot(sb - sa, yb - ya) + 0.06;
    const m = (sa + sb) / 2;
    const my = (ya + yb) / 2;
    // The box hangs under the walking line: its top face is the ramp.
    const off = -thick / 2;
    const p = P(m - off * Math.sin(ang), my + off * Math.cos(ang), d);
    const rot = axis === 'x' ? new THREE.Euler(0, 0, ang) : new THREE.Euler(-ang, 0, 0);
    b.box(p.x, p.y, p.z, axis === 'x' ? l : w, thick, axis === 'x' ? w : l, surf, { tint: t, rot, collide });
  };
  const top = y0 + peak;
  seg(a, y0, a + ramp, top, 0.35, 0, width, surface, tint);
  seg(a + ramp, top, end - ramp, top, 0.35, 0, width, surface, tint);
  seg(end - ramp, top, end, y0, 0.35, 0, width, surface, tint);
  // Parapets: low walls on the edges (cover while crossing, a little).
  for (const side of [-1, 1]) {
    const d = side * (width / 2 - 0.08);
    const rail = surface === 'pedra' ? C.stoneDark : C.lacquerDark;
    seg(a, y0 + 0.75, a + ramp, top + 0.75, 0.75, d, 0.16, surface, rail);
    seg(a + ramp, top + 0.75, end - ramp, top + 0.75, 0.75, d, 0.16, surface, rail);
    seg(end - ramp, top + 0.75, end, y0 + 0.75, 0.75, d, 0.16, surface, rail);
    const arch = new THREE.TorusGeometry(len * 0.42, 0.22, 6, 20, Math.PI);
    if (axis === 'z') arch.rotateY(Math.PI / 2);
    const mid = P((a + end) / 2, top - len * 0.42 - 0.2, side * (width / 2 - 0.1));
    arch.translate(mid.x, mid.y, mid.z);
    b.addGeometry(arch, surfaceMaterial(surface), surface === 'pedra' ? C.stoneDark : C.woodDark, false);
    arch.dispose();
  }
}

/** Wooden deck on posts (over water or ground). */
export function deck(c: Ctx, r: Rect, y: number, postsTo = -0.8, tint: number = C.wood) {
  c.b.span(r.x0, y - 0.15, r.z0, r.x1, y, r.z1, 'madeira', { tint });
  const nx = Math.max(1, Math.round((r.x1 - r.x0) / 2.5));
  const nz = Math.max(1, Math.round((r.z1 - r.z0) / 2.5));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      if (i > 0 && i < nx && j > 0 && j < nz) continue;
      const x = r.x0 + 0.12 + ((r.x1 - r.x0 - 0.24) * i) / nx;
      const z = r.z0 + 0.12 + ((r.z1 - r.z0 - 0.24) * j) / nz;
      c.b.cylinder(x, postsTo, z, 0.09, y - 0.15 - postsTo, 'madeira', { tint: C.woodDark, collide: false, segments: 6 });
    }
  }
}

/**
 * Open pavilion (ting): four columns, a pyramid roof, an optional stone platform with steps, and low
 * railings except where `open` leaves the way in. Returns the roof corners (for lanterns).
 */
export function ting(c: Ctx, x: number, z: number, half: number, o: { y0?: number; base?: number; h?: number; steps?: ('n' | 's' | 'e' | 'w')[]; rails?: boolean; roofTint?: number } = {}) {
  const { b } = c;
  const y0 = o.y0 ?? 0;
  const base = o.base ?? 0;
  const fy = y0 + base;
  if (base > 0) {
    b.span(x - half - 0.6, y0, z - half - 0.6, x + half + 0.6, fy, z + half + 0.6, 'pedra', { tint: C.stone });
    const run = stairRun(base, true);
    for (const sd of o.steps ?? []) {
      if (sd === 's') b.stairs('z', -1, z + half + 0.6 + run, x - 1, x + 1, y0, base, 'pedra', { tint: C.stone, gentle: true });
      if (sd === 'n') b.stairs('z', 1, z - half - 0.6 - run, x - 1, x + 1, y0, base, 'pedra', { tint: C.stone, gentle: true });
      if (sd === 'e') b.stairs('x', -1, x + half + 0.6 + run, z - 1, z + 1, y0, base, 'pedra', { tint: C.stone, gentle: true });
      if (sd === 'w') b.stairs('x', 1, x - half - 0.6 - run, z - 1, z + 1, y0, base, 'pedra', { tint: C.stone, gentle: true });
    }
  }
  const h = o.h ?? 2.8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) column(b, x + sx * half, z + sz * half, fy, fy + h, 0.16);
  const ring = { tint: C.beam, collide: false };
  b.span(x - half - 0.1, fy + h - 0.3, z - half - 0.1, x + half + 0.1, fy + h, z - half + 0.1, 'pintura', ring);
  b.span(x - half - 0.1, fy + h - 0.3, z + half - 0.1, x + half + 0.1, fy + h, z + half + 0.1, 'pintura', ring);
  b.span(x - half - 0.1, fy + h - 0.3, z - half, x - half + 0.1, fy + h, z + half, 'pintura', ring);
  b.span(x + half - 0.1, fy + h - 0.3, z - half, x + half + 0.1, fy + h, z + half, 'pintura', ring);
  if (o.rails) {
    const open = new Set(o.steps ?? []);
    const low = { h: 0.7 };
    const r = half + 0.45;
    const gap = (sd: 'n' | 's' | 'e' | 'w', axis: 'x' | 'z', fixed: number, from: number, to: number, mid: number) => {
      if (!open.has(sd)) railing(b, axis, fixed, from, to, fy, low);
      else {
        railing(b, axis, fixed, from, mid - 1, fy, low);
        railing(b, axis, fixed, mid + 1, to, fy, low);
      }
    };
    gap('n', 'x', z - r, x - r, x + r, x);
    gap('s', 'x', z + r, x - r, x + r, x);
    gap('w', 'z', x - r, z - r, z + r, z);
    gap('e', 'z', x + r, z - r, z + r, z);
  }
  // For the sound: roofed, open all around.
  b.room({ x: x - half - 0.6, y: fy, z: z - half - 0.6 }, { x: x + half + 0.6, y: fy + h, z: z + half + 0.6 }, 0.3);
  return curvedRoof(b, { outer: { x0: x - half - 1.1, x1: x + half + 1.1, z0: z - half - 1.1, z1: z + half + 1.1 }, top: { x0: x, x1: x, z0: z, z1: z }, eaveY: fy + h, topY: fy + h + half * 0.75 + 0.9, curl: 0.6, ridges: true, tint: o.roofTint });
}

// --- Plants -----------------------------------------------------------------------------------------

/**
 * Bamboo grove filling `r`: tall bare stalks with their nodes. The whole grove collides as one block (inset a
 * little so the edge stalks stand in front of it): you walk around groves and between them, never through.
 */
export function bambooGrove(c: Ctx, r: Rect, density = 1.1) {
  const { b, rand } = c;
  const paint = surfaceMaterial('pintura');
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const n = Math.max(3, Math.round(w * d * density));
  for (let i = 0; i < n; i++) {
    const sx = r.x0 + 0.15 + rand() * (w - 0.3);
    const sz = r.z0 + 0.15 + rand() * (d - 0.3);
    const h = 5 + rand() * 3;
    const rad = 0.05 + rand() * 0.035;
    const lean = (rand() - 0.5) * 0.12;
    const geo = new THREE.CylinderGeometry(rad * 0.8, rad, h, 5).translate(0, h / 2, 0).rotateZ(lean).translate(sx, 0, sz);
    b.addGeometry(geo, paint, rand() < 0.5 ? 0x7cb342 : 0x689f38, true);
    geo.dispose();
    // Bare stalks, no leafy tops: their nodes all the way up.
    for (let y = 0.7 + rand() * 0.5; y < h - 0.3; y += 1.1) {
      b.addGeometry(new THREE.CylinderGeometry(rad * 1.3, rad * 1.3, 0.05, 5).translate(sx - Math.sin(lean) * y, y, sz), paint, 0x557a2b, false);
    }
  }
  const inset = Math.min(0.3, w / 4, d / 4);
  b.cuboidCollider(new THREE.Vector3((r.x0 + r.x1) / 2, 3, (r.z0 + r.z1) / 2), new THREE.Vector3(w / 2 - inset, 3, d / 2 - inset), new THREE.Quaternion(), 'wood');
}

/**
 * Clipped hedge: one rounded mass of leaves (a box with rounded edges, its surface swelling and dipping in
 * smooth lumps), lighter on top and darker toward the ground where the leaves shade each other, with a few
 * sprigs poking out of the clipped line and, on the low ones, a sprinkle of small flowers. Seeded by its
 * position (the same on every client); it collides as one box.
 */
export function hedge(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, h = 1.1) {
  const rand = seeded(Math.round(x0 * 97 + z0 * 131 + h * 7));
  const seed = x0 * 0.37 + z0 * 0.61;
  b.cuboidCollider(new THREE.Vector3((x0 + x1) / 2, h / 2, (z0 + z1) / 2), new THREE.Vector3((x1 - x0) / 2, h / 2, (z1 - z0) / 2), new THREE.Quaternion(), 'grass');
  const green = [0x4a8a36, 0x4f9038, 0x45823a][Math.floor(rand() * 3)];
  const shade = (p: THREE.Vector3, n: THREE.Vector3) => {
    const k = THREE.MathUtils.clamp(p.y / h, 0, 1);
    const up = n.y * 0.5 + 0.5;
    return 0.55 + 0.55 * k * k + 0.3 * up * up;
  };

  // The mass: a subdivided box whose points are pushed onto a rounded box, then in and out along that
  // surface's normal by the lumps (both functions of the point: the faces' shared edges stay closed).
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const hx = (x1 - x0) / 2;
  const hz = (z1 - z0) / 2;
  const hy = h / 2;
  const round = Math.min(0.32, hx * 0.8, hz * 0.8, hy * 0.6);
  const seg = (len: number) => Math.max(2, Math.round(len / 0.3));
  const geo = new THREE.BoxGeometry(2 * hx, h, 2 * hz, seg(2 * hx), seg(h), seg(2 * hz));
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const inner = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    inner.set(THREE.MathUtils.clamp(p.x, -hx + round, hx - round), THREE.MathUtils.clamp(p.y, -hy + round, hy - round), THREE.MathUtils.clamp(p.z, -hz + round, hz - round));
    n.subVectors(p, inner);
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
    n.normalize();
    const wx = cx + p.x;
    const wy = hy + p.y;
    const wz = cz + p.z;
    // No lumps at the very bottom: the hedge sits on the ground.
    const d = 0.07 * lumps(wx * 1.6, wy * 1.6, wz * 1.6, seed) * Math.min(1, wy / 0.25);
    p.copy(inner).addScaledVector(n, round + d);
    // The base tucks in a little, as a clipped hedge does.
    const tuck = wy < 0.3 ? (0.3 - wy) * 0.25 : 0;
    pos.setXYZ(i, cx + p.x * (1 - tuck / Math.max(hx, 0.1)), Math.max(0, hy + p.y), cz + p.z * (1 - tuck / Math.max(hz, 0.1)));
  }
  const mass = foliageGeometry(geo, shade);
  geo.dispose();
  b.addGeometry(mass, surfaceMaterial('folhagem'), green);
  mass.dispose();

  // Sprigs that grew since the last clipping: small clumps along the top edges and the top.
  const alongX = x1 - x0 >= z1 - z0;
  const L = alongX ? x1 - x0 : z1 - z0;
  const Wd = alongX ? z1 - z0 : x1 - x0;
  const at = (s: number, w: number, y: number) => (alongX ? [x0 + s, y, z0 + w] : [x0 + w, y, z0 + s]) as [number, number, number];
  /** Height of the clipped top at a point (the same lumps as the mass). */
  const top = (x: number, _y: number, z: number) => h + 0.07 * lumps(x * 1.6, h * 1.6, z * 1.6, seed);
  const sprigs = Math.max(2, Math.round(L / 0.7));
  for (let i = 0; i < sprigs; i++) {
    const s = ((i + 0.3 + rand() * 0.4) / sprigs) * L;
    const w = rand() < 0.5 ? 0.1 + rand() * 0.15 : Wd - 0.1 - rand() * 0.15;
    const r = 0.13 + rand() * 0.1;
    leafClump(b, ...at(s, w, top(...at(s, w, 0)) - 0.05 - rand() * 0.06), r, r * 0.8, r, [0x579a3e, 0x4f9038, 0x5fa344][Math.floor(rand() * 3)], { shade, castShadow: false, detail: 1, rough: 0.25 });
  }
  if (h <= 1.4) {
    const paint = surfaceMaterial('pintura');
    const flower = [0xffffff, 0xf7a8c4, 0xffd23f][Math.floor(rand() * 3)];
    for (let f = 0; f < Math.round(L * 2.2); f++) {
      const [fx, , fz] = at(rand() * L, 0.12 + rand() * (Wd - 0.24), 0);
      const fl = new THREE.IcosahedronGeometry(0.045, 0).translate(fx, top(fx, 0, fz) + 0.01, fz);
      b.addGeometry(fl, paint, flower, false);
      fl.dispose();
    }
  }
}

// --- Props ------------------------------------------------------------------------------------------

/** Wooden crate (cover; thick enough to stop bullets). */
export function crate(b: MapBuilder, x: number, y: number, z: number, s = 1, yaw = 0) {
  const rot = new THREE.Euler(0, yaw, 0);
  b.box(x, y + s / 2, z, s, s, s, 'madeira', { tint: 0xa8743f, rot, physics: 'concrete' });
  b.box(x, y + s / 2, z, s + 0.04, s * 0.14, s + 0.04, 'madeira', { tint: C.woodDark, rot, collide: false, castShadow: false });
}

/** Low table with cushions around it (and a bonsai or a tea set on top). */
export function lowTable(c: Ctx, x: number, y: number, z: number, w: number, d: number, top: 'cha' | 'nada' = 'cha') {
  const { b } = c;
  b.span(x - w / 2, y + 0.38, z - d / 2, x + w / 2, y + 0.46, z + d / 2, 'madeira', { tint: C.woodDark, collide: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.span(x + sx * (w / 2 - 0.1) - 0.05, y, z + sz * (d / 2 - 0.1) - 0.05, x + sx * (w / 2 - 0.1) + 0.05, y + 0.38, z + sz * (d / 2 - 0.1) + 0.05, 'madeira', { tint: C.woodDark, collide: false });
  b.cuboidCollider(new THREE.Vector3(x, y + 0.23, z), new THREE.Vector3(w / 2, 0.23, d / 2), new THREE.Quaternion(), 'wood');
  for (const [ox, oz] of [[0, -d / 2 - 0.35], [0, d / 2 + 0.35], [-w / 2 - 0.35, 0], [w / 2 + 0.35, 0]]) {
    b.span(x + ox - 0.25, y, z + oz - 0.25, x + ox + 0.25, y + 0.1, z + oz + 0.25, 'pintura', { tint: 0xb8322a, collide: false, castShadow: false });
  }
  if (top === 'cha') {
    b.cylinder(x, y + 0.46, z, 0.1, 0.16, 'pintura', { tint: 0xf2efe6, collide: false, segments: 10, radiusTop: 0.07 });
    for (const [ox, oz] of [[0.25, 0.12], [-0.25, -0.1], [0.05, -0.2]]) b.cylinder(x + ox, y + 0.46, z + oz, 0.04, 0.05, 'pintura', { tint: 0x3f6f8a, collide: false, segments: 8 });
  }
}

/** Big glazed vase (stops bullets; low cover). */
export function vase(b: MapBuilder, x: number, y: number, z: number, h = 1.0, tint = 0x2f5d8a) {
  b.cylinder(x, y, z, h * 0.22, h * 0.15, 'pintura', { tint, segments: 10, radiusTop: h * 0.32, collide: false });
  b.cylinder(x, y + h * 0.15, z, h * 0.32, h * 0.55, 'pintura', { tint, segments: 10, radiusTop: h * 0.18 });
  b.cylinder(x, y + h * 0.7, z, h * 0.12, h * 0.3, 'pintura', { tint, segments: 10, radiusTop: h * 0.16, collide: false });
  b.cylinder(x, y + h * 0.35, z, h * 0.325, h * 0.08, 'pintura', { tint: C.gold, segments: 10, collide: false, castShadow: false });
}

/** Folding screen of paper panels in a zigzag (bullets go through it, eyes don't). */
export function foldingScreen(b: MapBuilder, x: number, y: number, z: number, along: 'x' | 'z', panels = 4, pw = 0.7, h = 1.9) {
  for (let k = 0; k < panels; k++) {
    const s = (k - (panels - 1) / 2) * pw * 0.94;
    const ang = (k % 2 ? 1 : -1) * 0.35 + (along === 'x' ? 0 : Math.PI / 2);
    const px = along === 'x' ? x + s : x;
    const pz = along === 'x' ? z : z + s;
    b.box(px, y + h / 2 + 0.05, pz, pw, h, 0.05, 'papel', { tint: C.paper, rot: new THREE.Euler(0, ang, 0), physics: 'paper' });
    b.box(px, y + h + 0.06, pz, pw, 0.08, 0.08, 'madeira', { tint: C.woodDark, rot: new THREE.Euler(0, ang, 0), collide: false });
  }
}

/** Bronze incense burner (ding) on a stone base, with a little smoke-colored ash on top. */
export function incenseBurner(b: MapBuilder, x: number, y: number, z: number, s = 1) {
  const bronze = 0x9a6b2a;
  b.box(x, y + 0.2 * s, z, 1.6 * s, 0.4 * s, 1.6 * s, 'pedra', { tint: C.stoneDark });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.cylinder(x + sx * 0.45 * s, y + 0.4 * s, z + sz * 0.45 * s, 0.08 * s, 0.45 * s, 'metal', { tint: bronze, collide: false, segments: 6 });
  b.cylinder(x, y + 0.8 * s, z, 0.6 * s, 0.75 * s, 'metal', { tint: bronze, segments: 14, radiusTop: 0.72 * s });
  b.cylinder(x, y + 1.55 * s, z, 0.74 * s, 0.08 * s, 'metal', { tint: 0x7a5420, collide: false, segments: 14 });
  for (const sx of [-1, 1]) b.box(x + sx * 0.75 * s, y + 1.7 * s, z, 0.08 * s, 0.35 * s, 0.3 * s, 'metal', { tint: bronze, collide: false });
  b.cylinder(x, y + 1.6 * s, z, 0.6 * s, 0.04 * s, 'pintura', { tint: 0x9a948a, collide: false, segments: 12 });
  for (let k = 0; k < 5; k++) b.cylinder(x + (k - 2) * 0.12 * s, y + 1.62 * s, z + ((k % 2) - 0.5) * 0.15 * s, 0.012, 0.45 * s, 'pintura', { tint: 0xc0352b, collide: false, castShadow: false, segments: 4 });
}

/**
 * Stone guardian lion (shishi) on a carved pedestal, facing `yaw` (0 = +Z). Seated on its haunches, chest
 * up, with the big head of the classical ones: curly mane, heavy brows, bulging eyes, open mouth with
 * fangs, a collar with a bell and a red silk bow. They come in pairs: the male rests a paw on the
 * embroidered ball, the female on her cub. About 4k triangles; collides as its pedestal and one box.
 */
export function stoneLion(b: MapBuilder, x: number, z: number, yaw: number, kind: 'macho' | 'femea', y = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  const at = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
  const rot = new THREE.Euler(0, yaw, 0);
  const stone = surfaceMaterial('concreto');
  const paint = surfaceMaterial('pintura');
  const BODY = 0xbdb7aa;
  const SHADE = 0xaaa498;
  const CURL = 0xa39d90;
  const DARK = 0x5a564e;

  // --- Pedestal: base slab, carved block, top slab ---
  const slabAt = (ly: number, sx: number, sy: number, sz: number, surface: SurfaceKey, tint: number, collide = true) => {
    const p = at(0, ly, 0);
    b.box(p.x, p.y, p.z, sx, sy, sz, surface, { tint, rot, collide });
  };
  slabAt(0.11, 1.5, 0.22, 1.9, 'pedra', C.stoneDark);
  slabAt(0.53, 1.24, 0.62, 1.64, 'concreto', 0xb4ae9f);
  slabAt(0.91, 1.42, 0.14, 1.82, 'pedra', C.stone);
  slabAt(1.0, 1.1, 0.06, 1.5, 'concreto', 0x9d9a90, false);
  for (const [lx, lz, sx, sz] of [[0, 0.83, 0.9, 0.04], [0, -0.83, 0.9, 0.04], [0.63, 0, 0.04, 1.2], [-0.63, 0, 0.04, 1.2]]) {
    const p = at(lx, 0.53, lz);
    b.box(p.x, p.y, p.z, sx, 0.36, sz, 'concreto', { tint: 0x9d9a90, rot, collide: false, castShadow: false });
  }

  // --- The lion, from the pedestal's top (Y0) ---
  const Y0 = 1.03;
  const add = (g: THREE.BufferGeometry, tint: number, mat = stone) => {
    g.applyMatrix4(m);
    worldUVs(g);
    b.addGeometry(g, mat, tint);
    g.dispose();
  };
  /** Lumpy ellipsoid at a local point, optionally tilted (x, then z). */
  const blob = (lx: number, ly: number, lz: number, rx: number, ry: number, rz: number, tint = BODY, tiltX = 0, tiltZ = 0) => {
    add(new THREE.IcosahedronGeometry(1, 1).scale(rx, ry, rz).rotateX(tiltX).rotateZ(tiltZ).translate(lx, Y0 + ly, lz), tint);
  };
  const curl = (lx: number, ly: number, lz: number, r = 0.1) => add(new THREE.SphereGeometry(r, 7, 5).translate(lx, Y0 + ly, lz), CURL);
  /** Leg as a tapered cylinder from `a` to `b` (local). */
  const limb = (a: THREE.Vector3, bEnd: THREE.Vector3, r0: number, r1: number) => {
    const dir = bEnd.clone().sub(a);
    const g = new THREE.CylinderGeometry(r1, r0, dir.length(), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
    const mid = a.clone().add(bEnd).multiplyScalar(0.5);
    g.translate(mid.x, Y0 + mid.y, mid.z);
    add(g, BODY);
  };
  const paw = (lx: number, ly: number, lz: number) => {
    blob(lx, ly, lz, 0.12, 0.075, 0.16, BODY);
    for (const k of [-1, 0, 1]) curl(lx + k * 0.065, ly - 0.01, lz + 0.14, 0.04);
  };

  // Haunches, hind legs and paws.
  blob(0, 0.34, -0.32, 0.4, 0.34, 0.4);
  for (const s of [-1, 1]) {
    blob(s * 0.3, 0.24, -0.2, 0.16, 0.24, 0.3, SHADE);
    paw(s * 0.3, 0.06, 0.08);
  }
  // Chest, leaning back a little.
  blob(0, 0.74, -0.02, 0.34, 0.48, 0.32, BODY, -0.2);
  // Front legs: one straight down, the other resting on the ball (male) or the cub (female).
  const held = kind === 'macho' ? -1 : 1; // the male's right paw (-X), the female's left (+X)
  limb(new THREE.Vector3(-held * 0.19, 0.66, 0.12), new THREE.Vector3(-held * 0.2, 0.08, 0.34), 0.13, 0.1);
  paw(-held * 0.2, 0.06, 0.38);
  const rest = new THREE.Vector3(held * 0.22, 0.4, 0.38);
  limb(new THREE.Vector3(held * 0.19, 0.66, 0.12), rest, 0.13, 0.1);
  paw(rest.x, rest.y, rest.z + 0.02);
  if (kind === 'macho') {
    // The embroidered ball, with carved ribbons crossing it.
    add(new THREE.IcosahedronGeometry(0.2, 2).translate(held * 0.22, Y0 + 0.19, 0.38), SHADE);
    for (const a of [0, Math.PI / 2]) add(new THREE.TorusGeometry(0.2, 0.022, 4, 18).rotateY(a + 0.4).translate(held * 0.22, Y0 + 0.19, 0.38), CURL);
  } else {
    // The cub, lying on its back under her paw, looking up.
    blob(held * 0.25, 0.14, 0.36, 0.14, 0.12, 0.2, BODY, 0, 0.3);
    blob(held * 0.28, 0.22, 0.6, 0.11, 0.1, 0.1, BODY);
    for (const s of [-1, 1]) curl(held * 0.28 + s * 0.07, 0.3, 0.6, 0.04);
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.018, 5, 4).translate(held * 0.28 + s * 0.04, Y0 + 0.25, 0.7), DARK);
  }

  // Collar with a bell and a red silk bow.
  add(new THREE.TorusGeometry(0.25, 0.04, 5, 18).rotateX(Math.PI / 2 - 0.25).translate(0, Y0 + 0.98, 0.06), SHADE);
  add(new THREE.SphereGeometry(0.075, 8, 6).translate(0, Y0 + 0.9, 0.32), CURL);
  for (const s of [-1, 1]) add(new THREE.IcosahedronGeometry(1, 0).scale(0.09, 0.05, 0.03).rotateZ(s * 0.4).translate(s * 0.1, Y0 + 0.97, 0.31), C.lacquer, paint);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.2, 0.015).rotateZ(s * 0.25).translate(s * 0.06, Y0 + 0.82, 0.33), C.lacquer, paint);

  // Head: big (the classical ones are a third of the lion), on a mass of mane that the curls stud: around
  // the face, over the crown and down the nape. Head parts are laid out around its center, scaled by HS.
  const HS = 1.25;
  const hy = 1.36;
  const hz = 0.14;
  const H = (dx: number, dy: number, dz: number, rx: number, ry: number, rz: number, tint = BODY, tiltZ = 0) => blob(dx * HS, hy + dy * HS, hz + dz * HS, rx * HS, ry * HS, rz * HS, tint, 0, tiltZ);
  const Hc = (dx: number, dy: number, dz: number, r: number) => curl(dx * HS, hy + dy * HS, hz + dz * HS, r * HS);
  blob(0, hy - 0.05, hz - 0.16, 0.44 * HS, 0.4 * HS, 0.28 * HS, CURL);
  blob(0, 1.02, -0.2, 0.3, 0.28, 0.22, CURL, -0.3);
  H(0, 0, 0, 0.33, 0.3, 0.3);
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2;
    if (Math.sin(t) < -0.8) continue; // the chin
    Hc(Math.cos(t) * 0.36, Math.sin(t) * 0.33, -0.08, 0.1);
  }
  for (const dx of [-0.16, 0, 0.16]) for (const dz of [-0.16, -0.02]) Hc(dx, 0.32, dz, 0.09);
  for (const [ly, lz] of [[1.16, -0.3], [1.0, -0.34], [0.84, -0.33]]) for (const dx of [-0.18, 0, 0.18]) curl(dx, ly, lz, 0.12);
  // Face: brows, bulging eyes, nose, cheeks, open mouth with fangs, jaw, ears, beard.
  H(0, 0.13, 0.24, 0.28, 0.055, 0.08, SHADE);
  for (const s of [-1, 1]) {
    H(s * 0.12, 0.06, 0.27, 0.075, 0.068, 0.06, 0xc9c3b6);
    add(new THREE.SphereGeometry(0.032 * HS, 6, 4).translate(s * 0.12 * HS, Y0 + hy + 0.06 * HS, hz + 0.325 * HS), DARK);
    H(s * 0.1, -0.1, 0.3, 0.11, 0.09, 0.09);
    H(s * 0.3, 0.17, -0.08, 0.09, 0.05, 0.08, SHADE, s * 0.5);
    add(new THREE.ConeGeometry(0.022 * HS, 0.07 * HS, 5).rotateX(Math.PI).translate(s * 0.08 * HS, Y0 + hy - 0.17 * HS, hz + 0.32 * HS), 0xd8d2c4);
  }
  H(0, -0.03, 0.35, 0.1, 0.065, 0.07, SHADE);
  H(0, -0.2, 0.28, 0.15, 0.05, 0.06, DARK);
  H(0, -0.27, 0.24, 0.16, 0.05, 0.1);
  for (const dx of [-0.08, 0, 0.08]) Hc(dx, -0.36, 0.21, 0.065);
  // Tail: a tuft of curls rising off the back.
  for (const [lx, ly, lz] of [[0, 0.45, -0.72], [0, 0.62, -0.7], [0.08, 0.75, -0.62], [-0.08, 0.73, -0.6], [0, 0.86, -0.55]]) curl(lx, ly, lz, 0.1);

  const center = at(0, Y0 + 0.78, -0.05);
  b.cuboidCollider(center, new THREE.Vector3(0.42, 0.78, 0.62), q, 'concrete');
}

/**
 * A drum (or anything struck) that sounds when shot, synchronized as `id`: returns the collider's onShot.
 * At most one hit every 0.11 s is heard, so an automatic burst doesn't pile the sounds up.
 */
export function struck(c: Ctx, id: string, pos: Vec, kind: SpatialKindName, play: (s: GardenSfx) => void) {
  let last = -1;
  return c.props.register(id, () => {
    const now = performance.now();
    if (now - last < 110) return;
    last = now;
    c.sfx.at(pos, kind, play);
  });
}

/** Wooden bench. */
export function bench(b: MapBuilder, x: number, z: number, along: 'x' | 'z', len = 1.8, y = 0) {
  const w = 0.45;
  const [sx, sz] = along === 'x' ? [len, w] : [w, len];
  b.box(x, y + 0.45, z, sx, 0.08, sz, 'madeira', { tint: C.wood, collide: false });
  for (const k of [-1, 1]) {
    const [lx, lz] = along === 'x' ? [x + k * (len / 2 - 0.15), z] : [x, z + k * (len / 2 - 0.15)];
    b.box(lx, y + 0.21, lz, along === 'x' ? 0.1 : w, 0.42, along === 'x' ? w : 0.1, 'madeira', { tint: C.woodDark, collide: false });
  }
  b.cuboidCollider(new THREE.Vector3(x, y + 0.25, z), new THREE.Vector3(sx / 2, 0.25, sz / 2), new THREE.Quaternion(), 'wood');
}

/** A string of lanterns across a street, sagging a little between two hooks. */
export function lanternString(c: Ctx, a: THREE.Vector3, bEnd: THREE.Vector3, n: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(a.clone().lerp(bEnd, t).add(new THREE.Vector3(0, -0.45 * 4 * t * (1 - t), 0)));
  }
  const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.02, 4);
  c.b.addGeometry(rope, surfaceMaterial('pintura'), 0x3a2a1a, false);
  rope.dispose();
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    c.lanterns.hang(a.clone().lerp(bEnd, t).add(new THREE.Vector3(0, -0.45 * 4 * t * (1 - t), 0)), 0.5);
  }
}

/** Round stepping stones along a polyline (visual; the ground collides). */
export function steppingPath(c: Ctx, pts: [number, number][], spacing = 0.95, y = 0.025) {
  const paint = surfaceMaterial('pedra');
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const r = 0.38 + c.rand() * 0.14;
      const geo = new THREE.CylinderGeometry(r, r, 0.06, 9).translate(x0 + (x1 - x0) * t + (c.rand() - 0.5) * 0.2, y, z0 + (z1 - z0) * t + (c.rand() - 0.5) * 0.2);
      c.b.addGeometry(geo, paint, c.rand() < 0.5 ? C.stone : 0xb4ae9f, false);
      geo.dispose();
    }
  }
}

/** Small glowing lamp (crypt niches, shrines): a stone box with a lit core. */
export function lamp(c: Ctx, x: number, y: number, z: number) {
  c.b.box(x, y + 0.2, z, 0.34, 0.4, 0.34, 'pedra', { tint: C.stoneDark, collide: false });
  c.glow.push(new THREE.BoxGeometry(0.2, 0.22, 0.36).translate(x, y + 0.22, z), new THREE.BoxGeometry(0.36, 0.22, 0.2).translate(x, y + 0.22, z));
}
