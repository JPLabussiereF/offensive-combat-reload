// "Cemitério da Capela": the zumbi mode's own map (shared/maps.ts: exclusive to that mode), 68 x 64 m at night.
// A walled churchyard (40 x 36 m inside) around a small chapel on a plinth, and the old grave field outside the
// wall where the horde rises. Everything is made for reading the horde:
// - the wall is low stone with iron bars above it: zombies outside are seen, and shot, through the bars; they
//   only get in through the five gaps (ZOMBIE.mapas.cemiterio.barricadas, where players nail barricades: the
//   boards are drawn by client/zombies/barricades.ts), each with lanterns on its pillars;
// - inside, low graves and wide paths, few trees: the main gate (south) opens onto the Alameda, a straight paved
//   avenue up to the chapel's terrace (the kill zone once the other gaps are boarded up); the Travessa crosses it
//   between the west and east gaps; the north-west and north-east gaps flank the chapel; the coffin stands by the
//   east wall;
// - outside, rows of old graves along a ring path (the spawn spots: ZOMBIE.mapas.cemiterio.surgir), low mist, a
//   hedge and dead woods around it all.
// The night is lit by the moon, the gap lanterns, four lamp posts along the Alameda and the chapel's candles.
import * as THREE from 'three';
import { ZOMBIE } from '@shared/zombies';
import type { Vec3 } from '@shared/protocol';
import type { Physics } from './physics';
import { MapBuilder, stairRun } from './mapBuilder';
import { PropBus } from './props';
import { skySpot, type SpatialSfx } from '../audio/spatial';
import { seeded } from './oriental';
import { surfaceMaterial } from './surfaces';
import { candle } from './furniture';
import { Bats, blocker, deadTree, epitaph, gateArch, Glow, GroundMist, hedge, LampPosts, LightPool, nightSky, SPOOKY as C, tombstone, type TombKind } from './halloween';
import type { GameMap, MapFrame, SpawnPoint } from './blockoutMap';

export interface CemeterySfx extends SpatialSfx {
  bulbPop(): void;
  ambientCrow(): void;
  ambientHowl(): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Moon direction: the shadows come from it too. */
const MOON: [number, number, number] = [38, 62, -30];
/** The map's half size (ground), and the hedge around the grave field. */
const HX = 34;
const HZ = 32;
const EDGE_X = 32;
const EDGE_Z = 30;
/** The wall: a low stone base up to BASE_H (stops bullets; low enough to see the field beyond it), iron bars up to TOP; T thick. */
const BASE_H = 0.6;
const TOP = 2.4;
const T = 0.5;
const WALL_TINT = 0x6f6a62;
const PILLAR_TINT = 0x5e5a54;

/** [from, to] pieces of [a, b] left after cutting the `gaps` out. */
function solid(a: number, b: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cursor = a;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > cursor + 0.01) out.push([cursor, Math.min(g0, b)]);
    cursor = Math.max(cursor, g1);
  }
  if (b > cursor + 0.01) out.push([cursor, b]);
  return out;
}

export async function buildCemeteryMap(physics: Physics, scene: THREE.Scene, sfx: CemeterySfx): Promise<GameMap> {
  const b = new MapBuilder(physics, scene, HX);
  const data = ZOMBIE.mapas.cemiterio!;
  const [X0, Z0, X1, Z1] = data.dentro;
  const animated: ((dt: number, frame: MapFrame) => void)[] = [];
  const props = new PropBus();
  const glow = new Glow();
  const lamps = new LampPosts();
  // Same seed on every client (and in the server's bake): graves and trees collide identically everywhere.
  const rand = seeded(4410);
  // Real lights: the 10 light spots nearest the camera light the scene for real.
  const lights = new LightPool(scene, 10);
  animated.push((dt, { listener }) => lights.update(dt, listener));
  const light = (x: number, y: number, z: number, o: { color?: number; intensity?: number; range?: number; flicker?: number } = {}) =>
    lights.add({ at: V(x, y, z), color: new THREE.Color(o.color ?? 0xffb46a), intensity: o.intensity ?? 10, range: o.range ?? 10, flicker: o.flicker });
  const decal = (x0: number, z0: number, x1: number, z1: number, y: number, surface: 'grama' | 'pedra', tint: number) =>
    b.span(x0, y - 0.01, z0, x1, y, z1, surface, { tint, collide: false, castShadow: false });

  // --- Ground: the grave field, the yard's dead grass, the paths -------------------------------------------
  b.span(-HX, -0.5, -HZ, HX, 0, HZ, 'grama', { tint: C.grassDark, castShadow: false });
  decal(X0, Z0, X1, Z1, 0.005, 'grama', 0x5e5e40);
  // The ring path outside the wall (the zombies' road around the yard).
  decal(-29.5, -25.6, 29.5, -23, 0.012, 'grama', C.dirt);
  decal(-29.5, 23.2, 29.5, 25.8, 0.012, 'grama', C.dirt);
  decal(-27.6, -23, -24.6, 23.2, 0.012, 'grama', C.dirt);
  decal(24.6, -23, 27.6, 23.2, 0.012, 'grama', C.dirt);
  // The Alameda (gate to terrace) and the Travessa (west gap to east gap).
  decal(-1.8, -6.7, 1.8, Z1 + 0.3, 0.02, 'pedra', C.path);
  decal(X0 - 0.3, 4, X1 + 0.3, 6, 0.018, 'pedra', C.path);

  // --- The wall, its pillars and the gaps ---------------------------------------------------------------------
  const metal = surfaceMaterial('metal');
  /** A stretch of wall: stone base (stops bullets), iron bars above it (bullets fly between them, nobody climbs). */
  const fence = (axis: 'x' | 'z', fixed: number, s0: number, s1: number) => {
    const len = s1 - s0;
    const mid = (s0 + s1) / 2;
    const at = (s: number, y: number): [number, number, number] => (axis === 'x' ? [s, y, fixed] : [fixed, y, s]);
    if (axis === 'x') b.span(s0, 0, fixed - T / 2, s1, BASE_H, fixed + T / 2, 'pedra', { tint: WALL_TINT });
    else b.span(fixed - T / 2, 0, s0, fixed + T / 2, BASE_H, s1, 'pedra', { tint: WALL_TINT });
    const cope = axis === 'x' ? [len, 0.08, T + 0.12] : [T + 0.12, 0.08, len];
    b.box(...at(mid, BASE_H + 0.04), cope[0], cope[1], cope[2], 'pedra', { tint: 0x7d786f, collide: false });
    const bar = new THREE.BoxGeometry(0.035, TOP - BASE_H - 0.12, 0.035);
    const tip = new THREE.ConeGeometry(0.045, 0.16, 4);
    const geos: THREE.BufferGeometry[] = [];
    for (let s = s0 + 0.1; s < s1 - 0.05; s += 0.17) {
      geos.push(bar.clone().translate(...at(s, (BASE_H + TOP - 0.12) / 2 + 0.04)));
      geos.push(tip.clone().translate(...at(s, TOP - 0.02)));
    }
    for (const y of [BASE_H + 0.18, TOP - 0.3]) geos.push((axis === 'x' ? new THREE.BoxGeometry(len, 0.05, 0.05) : new THREE.BoxGeometry(0.05, 0.05, len)).translate(...at(mid, y)));
    for (const g of geos) {
      b.addGeometry(g, metal, C.iron, false);
      g.dispose();
    }
    bar.dispose();
    tip.dispose();
    const half = axis === 'x' ? V(len / 2, (TOP - BASE_H) / 2, 0.08) : V(0.08, (TOP - BASE_H) / 2, len / 2);
    blocker(b, V(...at(mid, (BASE_H + TOP) / 2)), half);
    // Pillars every few metres along it.
    const n = Math.max(1, Math.round(len / 5));
    for (let k = 1; k < n; k++) pillar(...at(s0 + (len * k) / n, 0), 0.5, TOP + 0.2);
  };
  const pillar = (x: number, _y: number, z: number, w: number, h: number) => {
    b.box(x, h / 2, z, w, h, w, 'pedra', { tint: PILLAR_TINT });
    b.box(x, h + 0.06, z, w + 0.14, 0.12, w + 0.14, 'pedra', { tint: 0x7d786f, collide: false });
  };
  const gapsOn = (axis: 'x' | 'z', fixed: number) =>
    data.barricadas.filter((g) => g.eixo === axis && (axis === 'x' ? g.centro[2] : g.centro[0]) === fixed).map((g) => {
      const c = axis === 'x' ? g.centro[0] : g.centro[2];
      return [c - g.largura / 2, c + g.largura / 2] as [number, number];
    });
  for (const z of [Z0, Z1]) for (const [s0, s1] of solid(X0, X1, gapsOn('x', z))) fence('x', z, s0, s1);
  for (const x of [X0, X1]) for (const [s0, s1] of solid(Z0, Z1, gapsOn('z', x))) fence('z', x, s0, s1);
  for (const x of [X0, X1]) for (const z of [Z0, Z1]) pillar(x, 0, z, 0.8, TOP + 0.3);
  // Each gap: lanterns on stone posts (the main gate under its arch), a worn threshold, and real light.
  for (const g of data.barricadas) {
    const axis = g.eixo;
    const fixed = axis === 'x' ? g.centro[2] : g.centro[0];
    const c = axis === 'x' ? g.centro[0] : g.centro[2];
    const s0 = c - g.largura / 2;
    const s1 = c + g.largura / 2;
    const at = (s: number, y: number): [number, number, number] => (axis === 'x' ? [s, y, fixed] : [fixed, y, s]);
    if (g.id === 'portao') gateArch(b, scene, glow, axis, fixed, s0, s1, 'CEMITÉRIO DA CAPELA');
    else {
      for (const s of [s0 - 0.35, s1 + 0.35]) {
        const [px, , pz] = at(s, 0);
        b.box(px, 1.4, pz, 0.7, 2.8, 0.7, 'pedra', { tint: C.stoneDark });
        b.box(px, 2.9, pz, 0.85, 0.2, 0.85, 'pedra', { tint: C.stone, collide: false });
        glow.add(new THREE.BoxGeometry(0.26, 0.34, 0.26).translate(px, 3.2, pz), C.candle);
        b.box(px, 3.42, pz, 0.36, 0.1, 0.36, 'metal', { tint: C.iron, collide: false });
      }
    }
    for (const s of [s0 - 0.35, s1 + 0.35]) light(...at(s, 3.1), { intensity: 9, range: 9, flicker: 0.4 });
    // Trodden earth through the gap, a little past both faces.
    const [tx, , tz] = at(c, 0);
    const hx = axis === 'x' ? g.largura / 2 : 1.4;
    const hz = axis === 'x' ? 1.4 : g.largura / 2;
    decal(tx - hx, tz - hz, tx + hx, tz + hz, 0.024, 'grama', 0x4a3a2a);
  }

  // --- The chapel: on a plinth, its terrace over the Alameda, doors south, west and east -------------------------
  const PL = 0.6; // plinth top
  {
    const stone = { tint: 0x6a665e };
    b.span(-5, 0, -17.5, 5, PL, -7.4, 'pedra', stone);
    b.stairs('z', -1, -7.4 + stairRun(PL), -2, 2, 0, PL, 'pedra', stone);
    b.stairs('x', 1, -5 - stairRun(PL), -14.3, -12.7, 0, PL, 'pedra', stone);
    b.stairs('x', -1, 5 + stairRun(PL), -14.3, -12.7, 0, PL, 'pedra', stone);
    // The terrace's balustrade (crouch cover), open where the stairs come up.
    b.wall('x', -7.55, -5, 5, 0.3, 0.55, 'pedra', [[-2, 2, 0, 0.55]], PL, { tint: 0x7a766e });
    for (const x of [-4.85, 4.85]) b.wall('z', x, -10.2, -7.7, 0.3, 0.55, 'pedra', [], PL, { tint: 0x7a766e });
    const cw = { tint: 0x7d7872, frame: { surface: 'pintura' as const, tint: 0x2a2428, width: 0.1 } };
    const H = 4.4;
    b.wall('x', -10.2, -4.5, 4.5, 0.3, H, 'pedra', [[-1, 1, 0, 2.6]], PL, cw);
    b.wall('x', -17.2, -4.5, 4.5, 0.3, H, 'pedra', [], PL, cw);
    for (const x of [-4.5, 4.5]) b.wall('z', x, -17.05, -10.35, 0.3, H, 'pedra', [[-14.3, -12.7, 0, 2.4]], PL, cw);
    b.span(-4.35, PL, -17.05, 4.35, PL + 0.02, -10.35, 'piso', { tint: 0x5a3a2e, collide: false, castShadow: false });
    b.span(-4.35, PL + H - 0.2, -17.05, 4.35, PL + H, -10.35, 'concreto', { tint: 0x5a5458 });
    b.gableRoof(-4.5, -17.2, 4.5, -10.2, PL + H, 2.6, 'telhado', { tint: C.roof, ridgeAxis: 'z', gableSurface: 'pedra', gableTint: 0x7d7872 });
    // The bell-cote over the front gable (the waves start with its bell).
    const ridge = PL + H + 2.6;
    for (const x of [-0.42, 0.42]) b.box(x, ridge + 0.55, -10.3, 0.16, 1.1, 0.3, 'pedra', { tint: 0x77726c, collide: false });
    b.box(0, ridge + 1.15, -10.3, 1.2, 0.12, 0.5, 'pedra', { tint: 0x5a5650, collide: false });
    b.cylinder(0, ridge + 0.35, -10.3, 0.22, 0.42, 'metal', { tint: 0x9a7a3a, collide: false, radiusTop: 0.1, segments: 10 });
    // Stained glass painted on the side walls (inside and out) and a rose window over the door.
    // Dim, deep colors: glass lit by the candles inside, not neon.
    const stained = [0x7a2a40, 0x2a4a8a, 0x8a6a2a, 0x3a6a3a];
    let k = 0;
    for (const z of [-15.6, -12.0]) {
      for (const x of [-4.67, -4.33, 4.33, 4.67]) glow.add(new THREE.BoxGeometry(0.02, 1.5, 0.9).translate(x, PL + 2.6, z), stained[k++ % 4]);
    }
    glow.add(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 12).rotateX(Math.PI / 2).translate(0, PL + 3.6, -10.03), 0x5a2a6a);
    // The altar with its candles, the pews (crouch cover).
    b.span(-1.2, PL, -17.0, 1.2, PL + 1.0, -16.2, 'pedra', { tint: 0x9a948c });
    for (const x of [-0.8, -0.3, 0.3, 0.8]) candle(b, glow, x, PL + 1.0, -16.6, 0.24);
    light(0, PL + 1.9, -15.6, { intensity: 12, range: 10, flicker: 0.6 });
    for (const z of [-14.9, -13.6, -12.3]) {
      // Short pews: wide aisles in the middle and along the walls, from the side doors too.
      for (const sx of [-1, 1]) {
        const x = sx * 2.2;
        b.box(x, PL + 0.45, z, 1.8, 0.06, 0.42, 'madeira', { tint: C.wood });
        b.box(x, PL + 0.22, z, 1.7, 0.44, 0.06, 'madeira', { tint: C.woodDark });
        b.box(x, PL + 0.75, z + 0.2, 1.8, 0.55, 0.05, 'madeira', { tint: C.wood, collide: false });
      }
    }
    // Lanterns by the door, on the terrace.
    for (const x of [-1.6, 1.6]) {
      b.cylinder(x, PL, -9.8, 0.05, 1.5, 'metal', { tint: C.iron, segments: 6 });
      glow.add(new THREE.BoxGeometry(0.22, 0.3, 0.22).translate(x, PL + 1.65, -9.8), C.candle);
      light(x, PL + 1.8, -9.4, { intensity: 8, range: 8, flicker: 0.5 });
    }
  }
  const bats = new Bats(scene, [{ center: V(0, PL + 9, -10.5), radius: 4, count: 5 }], rand);

  // --- The yard: low graves in rows off the paths, a few landmarks, the coffin's corner --------------------------
  const yardKinds: TombKind[] = ['laje', 'laje', 'laje', 'laje', 'laje', 'arco', 'arco', 'arco', 'arco', 'cruz'];
  const taken: Vec3[] = [];
  const free = (x: number, z: number, r: number) => taken.every((p) => Math.hypot(p[0] - x, p[2] - z) >= r);
  const grave = (x: number, z: number, kind: TombKind, tint: number = C.stone, yaw = (rand() - 0.5) * 0.3) => {
    taken.push([x, 0, z]);
    return tombstone(b, x, z, yaw, kind, rand, tint);
  };
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const x = side * (4.6 + k * 2.6);
      for (const z of [-3.6, -0.6, 2.2, 9.5, 12.5, 15.5]) {
        if (rand() < 0.2) continue;
        grave(x + (rand() - 0.5) * 0.4, z + (rand() - 0.5) * 0.3, yardKinds[Math.floor(rand() * yardKinds.length)], rand() < 0.3 ? 0x7a7a70 : C.stone);
      }
    }
  }
  // Two obelisks at the head of the Alameda and an angel's column in each north yard: landmarks over the low graves.
  for (const [x, z] of [[-3.2, 13.6], [3.2, 13.6], [-13.5, -9], [13.5, -13.5]] as const) grave(x, z, 'obelisco', 0x8a867e, 0);
  epitaph(scene, grave(-7.2, -8.6, 'arco', 0x8a867e, 0), ['R.I.P.', '1887 — 1923']);
  epitaph(scene, grave(7.6, -8.2, 'arco', 0x8a867e, 0), ['R.I.P.', 'LAG']);
  // A fresh mound with its shovel (the gravedigger's), west yard.
  b.box(-11.5, 0.18, -13.2, 1.1, 0.36, 2.0, 'grama', { tint: C.dirt });
  b.box(-10.6, 0.55, -12.1, 0.06, 1.0, 0.25, 'metal', { tint: 0x5a5a60, collide: false, rot: new THREE.Euler(0, 0.3, 0.35) });
  deadTree(b, -16.5, -15, 1.1, rand);
  deadTree(b, 16.8, 15.6, 1.0, rand);
  // The coffin's corner, by the east wall: a dark slab under it and two candelabras.
  {
    const [cx, , cz] = data.caixa;
    decal(cx - 1.4, cz - 1.8, cx + 1.4, cz + 1.8, 0.03, 'pedra', 0x3e3a38);
    for (const dz of [-1.5, 1.5]) {
      b.cylinder(cx - 0.6, 0, cz + dz, 0.16, 0.08, 'metal', { tint: C.iron, segments: 8 });
      b.cylinder(cx - 0.6, 0.08, cz + dz, 0.04, 1.3, 'metal', { tint: C.iron, segments: 6 });
      for (const dx of [-0.2, 0, 0.2]) glow.add(new THREE.ConeGeometry(0.035, 0.1, 5).translate(cx - 0.6 + dx, 1.48, cz + dz), C.candle);
      light(cx - 0.8, 1.7, cz + dz, { intensity: 8, range: 8, flicker: 0.6 });
    }
  }
  // Lamp posts along the Alameda.
  for (const s of [{ x: -2.6, z: -2.5, dir: [1, 0] }, { x: 2.6, z: -2.5, dir: [-1, 0] }, { x: -2.6, z: 9.2, dir: [1, 0], flicker: true }, { x: 2.6, z: 9.2, dir: [-1, 0] }] as const) {
    lamps.add({ x: s.x, z: s.z, dir: [s.dir[0], s.dir[1]], flicker: 'flicker' in s });
  }
  lamps.finish(scene, b, props, (at) => sfx.at(at, 'normal', (s) => s.bulbPop()));
  lights.add(...lamps.lights());
  animated.push((dt) => lamps.update(dt));

  // --- Outside: the old grave field, where the horde rises ---------------------------------------------------
  // Spawn spots stay clear (2.2 m), boss spots more (a boss is big, and the mayor charges), and so does the ground
  // right in front of each gap.
  const keepClear: [Vec3, number][] = [...data.surgir.map((p): [Vec3, number] => [p, 2.2]), ...Object.values(data.chefe).map((p): [Vec3, number] => [p, 4])];
  const nearGap = (x: number, z: number) =>
    data.barricadas.some((g) => Math.hypot(x - g.centro[0], z - g.centro[2]) < g.largura / 2 + 3.2);
  const oldKinds: TombKind[] = ['arco', 'arco', 'cruz', 'cruz', 'laje', 'obelisco'];
  const oldGrave = (x: number, z: number) => {
    if (rand() < 0.38) return;
    const gx = x + (rand() - 0.5) * 0.6;
    const gz = z + (rand() - 0.5) * 0.5;
    if (keepClear.some(([p, r]) => Math.hypot(p[0] - gx, p[2] - gz) < r) || nearGap(gx, gz) || !free(gx, gz, 1.5)) return;
    grave(gx, gz, oldKinds[Math.floor(rand() * oldKinds.length)], rand() < 0.5 ? C.stoneDark : C.moss, (rand() - 0.5) * 0.6);
  };
  for (let x = -29.5; x <= 29.5; x += 2.4) {
    for (const z of [-21.3, -27.6, 21.3, 27.6]) oldGrave(x, z);
  }
  for (let z = -18.5; z <= 18.5; z += 2.4) {
    for (const x of [-22.6, -29.6, 22.6, 29.6]) oldGrave(x, z);
  }
  for (const [x, z] of [[-30, -26], [29.6, 25.4], [-29.5, 18.5], [30, -12]] as const) deadTree(b, x, z, 1 + rand() * 0.3, rand);
  // The hedge around the field, and dead woods beyond it (the skyline; nothing to walk into).
  hedge(b, 'x', -EDGE_Z, -EDGE_X - 0.55, EDGE_X + 0.55);
  hedge(b, 'x', EDGE_Z, -EDGE_X - 0.55, EDGE_X + 0.55);
  hedge(b, 'z', -EDGE_X, -EDGE_Z, EDGE_Z);
  hedge(b, 'z', EDGE_X, -EDGE_Z, EDGE_Z);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rand() * 0.1;
    const r = 1.12 + rand() * 0.15;
    deadTree(b, Math.cos(a) * EDGE_X * r * 1.05, Math.sin(a) * EDGE_Z * r * 1.1, 1.5 + rand() * 1.1, rand, { collide: false, tint: 0x241a1e });
  }
  const mist = new GroundMist(scene, [
    [-20, -25, 6], [0, -26, 6], [20, -25, 6], [-20, 25, 6], [10, 26, 6], [-27, -10, 5], [-27, 12, 5], [27, -8, 5], [27, 14, 5],
  ], rand);
  animated.push((dt) => {
    bats.update(dt);
    mist.update(dt);
  });
  nightSky(scene, V(...MOON));

  // Ambience: crows and, now and then, a wolf far away.
  let crowTimer = 4;
  let howlTimer = 30;
  animated.push((dt, { listener }) => {
    crowTimer -= dt;
    howlTimer -= dt;
    if (crowTimer <= 0) {
      crowTimer = 8 + Math.random() * 10;
      sfx.at(skySpot(listener), 'ambient', (s) => s.ambientCrow());
    }
    if (howlTimer <= 0) {
      howlTimer = 45 + Math.random() * 40;
      sfx.at(skySpot(listener), 'ambient', (s) => s.ambientHowl());
    }
  });

  glow.finish(scene);
  b.finish();

  const at = (x: number, y: number, z: number, yaw: number): SpawnPoint => ({ position: V(x, y, z), yaw });
  // Players come in on the paths of the yard, the terrace and the chapel (facing the gate, more or less).
  const inside: SpawnPoint[] = ([
    [0, 0.2, -3], [0, 0.2, 2], [0, 0.2, 10], [0, 0.2, 14], [-8, 0.2, 5], [-14, 0.2, 5], [8, 0.2, 5], [14, 0.2, 5],
    [-3, PL + 0.2, -8.8], [3, PL + 0.2, -8.8], [0, PL + 0.2, -12.6], [-10, 0.2, -6.5], [10, 0.2, -6.5], [-15, 0.2, -2], [15, 0.2, -2.2], [-9, 0.2, -15.5],
  ] as [number, number, number][]).map(([x, y, z]) => at(x, y, z, Math.PI));
  return {
    spawnsA: inside,
    spawnsB: inside,
    spawnsFFA: inside,
    dummies: [],
    killY: -10,
    stats: b.stats,
    openings: b.openings,
    props,
    update(dt, frame) {
      for (const f of animated) f(dt, frame);
    },
    dog: null,
    shadowExtent: Math.max(HX, HZ) + 4,
    atmosphere: {
      background: 0x0c130f,
      // Green, but pushed back: the gaps and the field beyond them stay readable from anywhere in the yard.
      fog: { color: 0x2c3a30, near: 18, far: 85 },
      hemi: { sky: 0xb4c8bc, ground: 0x4c5a4e, intensity: 2.2 },
      sun: { color: 0xd2e4dc, intensity: 1.9, from: MOON },
      viewmodel: { sky: 0xb4c8bc, ground: 0x4c5a4e, hemi: 1.6, sun: 1.6, sunColor: 0xd2e4dc },
    },
  };
}

