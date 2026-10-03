// Pátio das Lanternas (south-east, x 18..45, z 0..45): the estate's service quarter, close quarters.
// The Lantern Street runs south from the lake's gate (x 29..33) under strings of red lanterns, with a
// pailou over its middle and a cart to hide behind. West of it: tea house, kitchen, storehouse; east:
// the servants' house (two stories, a balcony over the street), the music room (paper walls) and the
// workshop. Alleys between them, and the inner market (stalls, crates, baskets) at the south end next to
// the warriors' gate. Everything here is a few meters apart: shotguns and ambushes.
import * as THREE from 'three';
import { Bell, column, curvedRoof, ORIENTAL as C, pavilion, pine } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import { bench, crate, type Ctx, lanternString, lowTable, pave, plaque, rect, signBoard, struck, vase } from './kit';
import { StallFruit } from './frutas';

/** Builds the sector; returns the fruit on the market's stalls (cut in half when hit). */
export function buildLanternas(c: Ctx): StallFruit {
  const { b } = c;
  const street = 0xa8a294;
  pave(b, rect(29, 0.3, 33, 30.6), street);
  pave(b, rect(18.3, 30.6, 44.7, 44.7), 0xb8b0a0);
  pave(b, rect(18.3, 10.6, 29, 15.6), street, 'pedra', 0.025);
  pave(b, rect(33, 12.6, 44.7, 15.4), street, 'pedra', 0.025);
  const hang = (p: { hooks: THREE.Vector3[] }) => p.hooks.forEach((h) => c.lanterns.hang(h, 0.75));

  // --- West row: tea house, kitchen, storehouse ----------------------------------------------------
  const teaHouse = pavilion(b, {
    cx: 23.6,
    cz: 6,
    stories: [{ hw: 4.4, hd: 4.2, h: 3.4, style: 'madeira', sideStyle: { e: 'papel' }, doors: { e: [-2], s: [2] }, windows: { e: [2.2], n: [-1] } }],
    roof: { overhang: 0.6, rise: 2.0, curl: 0.7 },
  });
  hang(teaHouse);
  lowTable(c, 22, 0, 4, 1.2, 0.7);
  lowTable(c, 25, 0, 8, 1.2, 0.7);
  b.span(19.6, 0, 2.2, 21, 1.8, 2.8, 'madeira', { tint: C.lacquerDark });

  pavilion(b, {
    cx: 23.6,
    cz: 20.2,
    stories: [{ hw: 4.4, hd: 4.2, h: 3.4, style: 'estuque', doors: { n: [1.5], e: [0], s: [-2] }, windows: { e: [-2.6], w: [1] } }],
    roof: { overhang: 0.6, rise: 2.0, curl: 0.7 },
  });
  // Stove (brick), worktable, water jars.
  b.span(19.6, 0, 16.4, 22.6, 0.95, 17.4, 'tijolo', { tint: 0xb06a4a });
  b.cylinder(20.4, 0.95, 16.9, 0.38, 0.22, 'metal', { tint: 0x3a3a3a, segments: 12, collide: false });
  b.cylinder(21.9, 0.95, 16.9, 0.32, 0.2, 'metal', { tint: 0x3a3a3a, segments: 12, collide: false });
  b.span(23.4, 0, 19.4, 26.2, 0.85, 20.4, 'madeira', { tint: C.wood });
  for (const [x, z] of [[19.8, 23.6], [20.7, 23.7], [27.2, 23.6]]) vase(b, x, 0, z, 0.9, 0x6b4a32);

  pavilion(b, {
    cx: 23.6,
    cz: 28.2,
    stories: [{ hw: 4.4, hd: 2.2, h: 3.2, style: 'madeira', doors: { e: [0], s: [2] } }],
    roof: { overhang: 0.5, rise: 1.6, curl: 0.6 },
  });
  crate(b, 20, 0, 27, 1.0);
  crate(b, 20, 1.0, 27, 0.8, 0.3);
  crate(b, 21.2, 0, 29.4, 0.9, 0.2);
  crate(b, 26.6, 0, 26.9, 0.8);

  // --- East row: servants' house (two stories), music room, workshop --------------------------------
  const servants = pavilion(b, {
    cx: 38.6,
    cz: 7.4,
    stories: [
      { hw: 4.6, hd: 5.2, h: 3.3, style: 'estuque', doors: { w: [-2.2], s: [2.5] }, windows: { w: [2.6], e: [0] }, stairs: [{ side: 'n', dir: 1, from: -3.8, inset: 0.25 }] },
      { hw: 4.6, hd: 5.2, h: 3.0, style: 'madeira', sideStyle: { w: 'papel' }, doors: { w: [3.4] }, windows: { s: [-2, 2], e: [0] }, balcony: { depth: 1.0, sides: ['w'] }, skirt: 0.6 },
    ],
    roof: { overhang: 0.8, rise: 2.2, curl: 0.8 },
  });
  hang(servants);
  b.span(41.4, 0, 9.6, 42.9, 0.6, 12, 'madeira', { tint: C.wood });
  b.span(41.4, servants.floors[1], 9.6, 42.9, servants.floors[1] + 0.6, 12, 'madeira', { tint: C.wood });
  lowTable(c, 39, servants.floors[1], 5.6, 1.2, 0.7, 'nada');

  const music = pavilion(b, {
    cx: 39,
    cz: 20,
    stories: [{ hw: 5.0, hd: 4.2, h: 3.4, style: 'papel', sideStyle: { e: 'madeira' }, doors: { w: [0], n: [2], s: [-2] } }],
    roof: { overhang: 0.6, rise: 2.0, curl: 0.8 },
  });
  hang(music);
  // A guzheng on its stand, two drums, cushions.
  b.span(36, 0.55, 17.3, 38.2, 0.7, 17.8, 'madeira', { tint: 0x8a5432, collide: false });
  for (const x of [36.3, 37.9]) b.span(x - 0.08, 0, 17.4, x + 0.08, 0.55, 17.7, 'madeira', { tint: C.woodDark, collide: false });
  b.cuboidCollider(new THREE.Vector3(37.1, 0.35, 17.55), new THREE.Vector3(1.1, 0.35, 0.25), new THREE.Quaternion(), 'wood');
  for (const [i, [x, z]] of [[41.6, 22.4], [42.8, 21.2]].entries()) {
    const hit = struck(c, `tambor:${2 + i}`, { x, y: 0.9, z }, 'normal', (s) => s.drum(0.55));
    b.cylinder(x, 0, z, 0.45, 0.9, 'pintura', { tint: C.lacquer, segments: 14, onShot: hit });
    b.cylinder(x, 0.9, z, 0.46, 0.04, 'pintura', { tint: 0xf2e6c8, segments: 14, collide: false });
  }
  for (const [x, z] of [[36.6, 21.8], [38, 22.6], [39.6, 21.6]]) b.span(x - 0.25, 0, z - 0.25, x + 0.25, 0.1, z + 0.25, 'pintura', { tint: 0xb8322a, collide: false, castShadow: false });

  pavilion(b, {
    cx: 39,
    cz: 28.2,
    stories: [{ hw: 5.0, hd: 2.2, h: 3.2, style: 'madeira', doors: { w: [0], n: [2.5], s: [-2] } }],
    roof: { overhang: 0.5, rise: 1.6, curl: 0.6 },
  });
  b.span(40.6, 0, 29.2, 43.8, 0.9, 30.0, 'madeira', { tint: C.wood });
  crate(b, 43.4, 0, 26.7, 0.8);
  crate(b, 35.2, 0, 29.6, 0.8, 0.4);

  // --- The street: lantern strings, the pailou, a cart, odds and ends ------------------------------
  for (let z = 2.2; z <= 29; z += 3) {
    if (Math.abs(z - 15) < 1.5) continue;
    lanternString(c, new THREE.Vector3(29.1, 4.3, z), new THREE.Vector3(32.9, 4.3, z), 3);
  }
  {
    const z = 15;
    for (const x of [29.4, 32.6]) {
      b.cylinder(x, 0, z, 0.3, 0.3, 'pedra', { tint: C.stone, segments: 8, collide: false });
      column(b, x, z, 0, 4.4, 0.18);
    }
    b.span(29.1, 3.9, z - 0.18, 32.9, 4.25, z + 0.18, 'pintura', { tint: C.beam, collide: false });
    b.span(29.1, 3.86, z - 0.2, 32.9, 3.9, z + 0.2, 'pintura', { tint: C.gold, collide: false });
    for (const side of [-1, 1]) plaque(c.scene, '燈籠街', 31, 3.45, z + side * 0.2, side > 0 ? 0 : Math.PI, 2.2, 0.55, '#8a2a22');
    for (const h of curvedRoof(b, { outer: rect(28.4, z - 0.9, 33.6, z + 0.9), top: rect(29.4, z, 32.6, z), eaveY: 4.4, topY: 5.3, curl: 0.5, ridges: true, collide: false })) c.lanterns.hang(h, 0.6);
  }
  cart(c, 31.7, 22.6);
  crate(b, 29.6, 0, 7.8, 0.8);
  crate(b, 32.3, 0, 27.6, 0.9, 0.5);
  for (const [x, z] of [[29.5, 18.4], [32.5, 10.8], [32.5, 3]]) basket(c, x, z);

  // --- Alleys --------------------------------------------------------------------------------------
  // East alley: crates stacked so the long view from the ring gate stops here.
  crate(b, 35.6, 0, 13.3, 1.1);
  crate(b, 35.6, 1.1, 13.3, 0.9, 0.4);
  crate(b, 38.6, 0, 13.7, 0.9, 0.2);
  vase(b, 44, 0, 13.4, 1.0, 0x6b4a32);
  bench(b, 26.6, 13.9, 'x', 1.8);
  crate(b, 20.4, 0, 11.2, 0.9, 0.3);
  pine(b, 21.4, 0, 15.0, 0.75, c.rand);

  // --- Market --------------------------------------------------------------------------------------
  // Oranges, limes and apples, peaches; the fourth stall sells pottery (it doesn't get cut).
  const goods: number[][] = [[0xff7a1a, 0xffb52e, 0xe0301e], [0x7cb342, 0x4f9e3a, 0xb6d36a], [0xc0352b, 0xe7b847, 0x8a2a22], [0x2f5d8a, 0xf2efe6, 0x3f6f8a]];
  const market: Market = { fruit: [], counters: [] };
  stall(c, 23, 34.2, 0x2f7f78, goods[0], market);
  stall(c, 29.6, 34.2, 0xc0352b, goods[1], market);
  stall(c, 40.4, 34.2, 0xe7b847, goods[2], market);
  stall(c, 25.4, 40.6, 0xc0352b, goods[3], null);
  stall(c, 34.2, 40.6, 0x2f7f78, goods[0], market);
  stall(c, 41.6, 41, 0x8a2a22, goods[1], market);
  const fruit = new StallFruit(c.scene, market.fruit, market.counters, c.props, (at) => c.sfx.at(at, 'normal', (s) => s.fruitSplat()));
  c.animate((dt) => fruit.update(dt));
  for (const [x, z, s, yaw] of [[19.4, 43.4, 1.0, 0], [20.6, 43.6, 0.8, 0.4], [19.5, 42.3, 0.7, 0.1], [36.6, 37.4, 0.9, 0.3], [44, 36, 0.9, 0]]) crate(b, x, 0, z, s, yaw);
  for (const [x, z] of [[27.6, 37.6], [33.4, 33], [44, 31.6], [38.6, 44]]) basket(c, x, z);
  // The chime bells: shoot them to play dó, ré, mi, fá, sol.
  bianzhong(c, 27.4, 32.6, 43.9);
  for (const [x, z] of [[21.4, 31.4], [44, 39.4]]) vase(b, x, 0, z, 1.2, 0x2f5d8a);
  lanternString(c, new THREE.Vector3(18.6, 4.4, 37.4), new THREE.Vector3(44.4, 4.4, 37.4), 9);
  lanternString(c, new THREE.Vector3(31, 4.6, 30.8), new THREE.Vector3(31, 4.6, 44.4), 4);
  signBoard(c, ['MERCADO', 'Pague antes', 'de oprimir'], 34.6, 31.4, 0, '#fff8ec', '#c0271b', 2.0);
  return fruit;
}

interface Market {
  fruit: { p: THREE.Vector3; r: number; color: number }[];
  counters: { x0: number; x1: number; z0: number; z1: number; y: number }[];
}

/** Dó, ré, mi, fá, sol (C5 to G5), in Hz. */
const NOTES = [523.25, 587.33, 659.25, 698.46, 783.99];

/**
 * Bianzhong: five bronze bells of falling size on a lacquered frame, the biggest (dó) on the right of whoever
 * faces them from the market (-X), down to the smallest (sol) on their left. Each rings its note and swings
 * when shot, synchronized as "carrilhao:0".."carrilhao:4".
 */
function bianzhong(c: Ctx, x0: number, x1: number, z: number) {
  const { b } = c;
  const top = 2.75;
  for (const x of [x0, x1]) {
    b.box(x, 0.15, z, 0.7, 0.3, 0.7, 'madeira', { tint: C.lacquerDark });
    b.box(x, 0.38, z, 0.4, 0.16, 0.4, 'pintura', { tint: C.gold, collide: false });
    b.box(x, 1.5, z, 0.16, 2.7, 0.16, 'pintura', { tint: C.lacquer, physics: 'wood' });
  }
  b.span(x0 - 0.35, top, z - 0.1, x1 + 0.35, top + 0.18, z + 0.1, 'pintura', { tint: C.lacquer, collide: false });
  b.span(x0 - 0.37, top + 0.18, z - 0.11, x1 + 0.37, top + 0.22, z + 0.11, 'pintura', { tint: C.gold, collide: false });
  for (const s of [-1, 1]) b.box(s < 0 ? x0 - 0.45 : x1 + 0.45, top + 0.24, z, 0.3, 0.12, 0.2, 'pintura', { tint: C.gold, collide: false, rot: new THREE.Euler(0, 0, -s * 0.5) });
  plaque(c.scene, '編鐘', (x0 + x1) / 2, top + 0.45, z - 0.02, Math.PI, 1.0, 0.42, '#8a2a22');
  const step = (x1 - x0 - 1.1) / (NOTES.length - 1);
  NOTES.forEach((f, i) => {
    const x = x0 + 0.55 + i * step;
    const size = (0.68 * NOTES[0]) / f;
    const bell = new Bell(c.scene, b, x, top, z, size, c.props, `carrilhao:${i}`, () => c.sfx.at({ x, y: top - 0.6, z }, 'normal', (s) => s.bell(size, f)));
    c.animate((dt) => bell.update(dt));
  });
}

/**
 * Market stall: a counter (cover), four posts and a sloping cloth canopy, goods on the counter. With a
 * `market`, the goods are fruit that can be cut (StallFruit builds them); without, pottery.
 */
function stall(c: Ctx, x: number, z: number, cloth: number, goods: number[], market: Market | null) {
  const { b } = c;
  b.span(x - 1.3, 0, z - 0.45, x + 1.3, 0.9, z + 0.45, 'madeira', { tint: C.wood });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.cylinder(x + sx * 1.35, 0, z + sz * 0.8, 0.05, sz < 0 ? 2.5 : 2.2, 'madeira', { tint: C.woodDark, collide: false, segments: 6 });
  const tilt = Math.atan2(0.3, 1.6);
  b.box(x, 2.4, z, 2.9, 0.04, 1.75, 'pintura', { tint: cloth, rot: new THREE.Euler(tilt, 0, 0), collide: false });
  b.box(x, 2.12, z + 0.86, 2.9, 0.28, 0.03, 'pintura', { tint: 0xf2efe6, collide: false, castShadow: false });
  const paint = surfaceMaterial('pintura');
  for (let k = 0; k < 9; k++) {
    const gx = x - 1.1 + (k % 5) * 0.55 + (c.rand() - 0.5) * 0.1;
    const gz = z - 0.2 + Math.floor(k / 5) * 0.35;
    const r = 0.1 + c.rand() * 0.06;
    if (market) market.fruit.push({ p: new THREE.Vector3(gx, 0.9 + r, gz), r, color: goods[k % goods.length] });
    else c.b.addGeometry(new THREE.SphereGeometry(r, 8, 6).translate(gx, 0.9 + r, gz), paint, goods[k % goods.length], false);
  }
  market?.counters.push({ x0: x - 1.3, x1: x + 1.3, z0: z - 0.45, z1: z + 0.45, y: 0.9 });
}

/** Wicker basket. */
function basket(c: Ctx, x: number, z: number) {
  c.b.cylinder(x, 0, z, 0.32, 0.45, 'madeira', { tint: 0xc9a46a, segments: 10, radiusTop: 0.38 });
  c.b.cylinder(x, 0.45, z, 0.39, 0.05, 'madeira', { tint: 0x8a6a3a, segments: 10, collide: false });
}

/** Hand cart with two wheels, along Z (cover in the middle of the street). */
function cart(c: Ctx, x: number, z: number) {
  const { b } = c;
  b.span(x - 0.65, 0.5, z - 1.1, x + 0.65, 1.15, z + 1.1, 'madeira', { tint: 0x8a5432 });
  b.span(x - 0.65, 0, z - 1.1, x + 0.65, 0.5, z + 1.1, 'madeira', { tint: 0x8a5432, collide: false });
  b.cuboidCollider(new THREE.Vector3(x, 0.4, z), new THREE.Vector3(0.65, 0.4, 1.1), new THREE.Quaternion(), 'wood');
  for (const sx of [-1, 1]) {
    const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12).rotateZ(Math.PI / 2).translate(x + sx * 0.72, 0.5, z);
    b.addGeometry(wheel, surfaceMaterial('madeira'), C.woodDark);
    wheel.dispose();
  }
  for (const sx of [-1, 1]) b.span(x + sx * 0.4 - 0.05, 0.75, z + 1.1, x + sx * 0.4 + 0.05, 0.85, z + 2.2, 'madeira', { tint: C.woodDark, collide: false });
  for (let k = 0; k < 4; k++) crate(b, x - 0.3 + (k % 2) * 0.6, 1.15, z - 0.5 + Math.floor(k / 2) * 0.9, 0.5, k * 0.3);
}
