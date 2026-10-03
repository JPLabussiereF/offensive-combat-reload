// Casa Principal (x/z -13..13) and the ring around it.
//
// The house is a courtyard house: four narrow wings around a wide courtyard (17 x 17 m) where the Dragon
// Cherry grows: a big cherry tree whose fruit is the map's collectible (jardim/cereja.ts). North wing: the
// Great Hall (taller, the landmark roof) between two side rooms. South wing: the ceremony hall (throne, altar,
// dragon relief) between the south gate's vestibule and a store room. West wing: library and tea room. East
// wing: two rooms cut into L-shaped corridors by wooden partitions. Every room opens to the next one, so
// the wings form an inner ring you can walk without crossing the courtyard; six gates, one per sector, none
// in line with the sector gate across the ring.
import * as THREE from 'three';
import { PICKUPS } from '@shared/maps';
import { surfaceMaterial } from '../surfaces';
import { column, curvedRoof, dragonGeometry, dragonMaterial, ORIENTAL as C, paperWall, pine, rock, stoneLantern, type DragonColors } from '../oriental';
import { bambooGrove, bench, type Ctx, doorLeaves, foldingScreen, gateway, HOUSE, hedge, incenseBurner, lowTable, painting, pave, rect, vase } from './kit';
import { CherryPickup } from './cereja';
import type { HangingCherries } from './frutas';
import { dragonCherryTree } from './cerejeira';

const CRIMSON: DragonColors = { body: 0xd33a2c, bodyDark: 0xa82a20, belly: 0xf2d98a, spikes: 0xe7b847, horns: 0xf2d98a };
const GOLDEN: DragonColors = { body: 0xe7b847, bodyDark: 0xb98a2a, belly: 0xf7e7b0, spikes: 0xc0352b, horns: 0xf7e7b0 };

const H = HOUSE;
/** Inner face line of the wings (the courtyard is -IN..IN). */
const IN = 8.5;
/** Middle line of each wing (doors between the rooms, the corner rooms' centers). */
const MID = (H + IN) / 2;
const TALL = 4.8;
const LOW = 3.6;
const T_OUT = 0.3;
const T_IN = 0.15;
const GATE_W = 2.4;
const GATE_H = 3.0;

/** Builds the house; returns the courtyard's cherry (the collectible) and the cherries in its tree. */
export function buildCasa(c: Ctx): { cherry: CherryPickup; fruit: HangingCherries } {
  const { b } = c;
  const plaster = { tint: C.plaster, frame: { surface: 'pintura' as const, tint: C.lacquer, width: 0.12 } };
  const wood = { tint: C.lacquerDark, frame: { surface: 'pintura' as const, tint: C.gold, width: 0.08 } };
  const gate = (s: number): [number, number, number, number] => [s - GATE_W / 2, s + GATE_W / 2, 0, GATE_H];
  const door = (s: number): [number, number, number, number] => [s - 0.9, s + 0.9, 0, 2.4];
  const win = (s: number): [number, number, number, number] => [s - 0.75, s + 0.75, 0.9, 2.3];

  // --- Floors -------------------------------------------------------------------------------------
  const floor = { tint: C.floor, collide: false, castShadow: false };
  b.span(-H, 0, -H, H, 0.02, -IN, 'piso', floor);
  b.span(-H, 0, IN, H, 0.02, H, 'piso', floor);
  b.span(-H, 0, -IN, -IN, 0.02, IN, 'piso', floor);
  b.span(IN, 0, -IN, H, 0.02, IN, 'piso', floor);

  // --- Outer walls (plaster), with the six gates and a few windows ---------------------------------
  const e = T_OUT / 2;
  b.wall('x', -H, -H - e, H + e, T_OUT, TALL, 'concreto', [gate(3), win(-MID), win(-4), win(MID)], 0, plaster);
  b.wall('x', H, -H - e, H + e, T_OUT, LOW, 'concreto', [gate(-MID), win(4.5), win(MID)], 0, plaster);
  for (const sx of [-1, 1]) {
    b.wall('z', sx * H, -H + e, -IN, T_OUT, TALL, 'concreto', [win(-MID)], 0, plaster);
    b.wall('z', sx * H, -IN, H - e, T_OUT, LOW, 'concreto', [gate(-3.5), gate(3.5), win(MID)], 0, plaster);
  }
  // Gates: columns, lintel and name board under the eaves; the leaves swung open on the outside.
  const houseGate = (axis: 'x' | 'z', fixed: number, at: number, name: string, h: number, outside: 1 | -1) => {
    gateway(c, axis, fixed, { at, name, roof: false }, GATE_W, GATE_H, h, T_OUT);
    doorLeaves(c, axis, fixed, at, GATE_W, GATE_H, T_OUT, outside);
  };
  houseGate('x', -H, 3, '龍門', TALL, -1);
  houseGate('x', H, -MID, '虎門', LOW, 1);
  houseGate('z', -H, -3.5, '山門', LOW, -1);
  houseGate('z', -H, 3.5, '春門', LOW, -1);
  houseGate('z', H, -3.5, '月門', LOW, 1);
  houseGate('z', H, 3.5, '日門', LOW, 1);

  // --- Inner walls ---------------------------------------------------------------------------------
  // Courtyard faces: paper with doors (shot through). Between rooms: wood or paper, always with a door.
  paperWall(b, 'x', -IN, -IN, IN, TALL, 0, [-4, 4]);
  paperWall(b, 'x', IN, -IN, IN, LOW, 0, [-4, 4]);
  paperWall(b, 'z', -IN, -IN + 0.03, IN - 0.03, LOW, 0, [-4.25, 4.25]);
  paperWall(b, 'z', IN, -IN + 0.03, IN - 0.03, LOW, 0, [-4.25, 4.25]);
  // East wing: its doors to the corner rooms go in the outer half (the partitions split those rooms).
  const east = (MID + H - e) / 2;
  for (const sx of [-1, 1]) {
    const corner = sx < 0 ? -MID : east;
    // North wing: side room <-> Great Hall; side room <-> the wing below.
    b.wall('z', sx * IN, -H + e, -IN, T_IN, TALL, 'madeira', [door(-MID)], 0, wood);
    b.wall('x', -IN, Math.min(sx * IN, sx * H), Math.max(sx * IN, sx * H), T_IN, TALL, 'madeira', [door(corner)], 0, wood);
    // South wing: the same.
    b.wall('z', sx * IN, IN, H - e, T_IN, LOW, 'madeira', [door(MID)], 0, wood);
    b.wall('x', IN, Math.min(sx * IN, sx * H), Math.max(sx * IN, sx * H), T_IN, LOW, 'madeira', [door(corner)], 0, wood);
    // Middle of the side wings.
    paperWall(b, 'x', 0, Math.min(sx * IN, sx * H), Math.max(sx * IN, sx * H), LOW, 0, [sx * MID]);
  }
  // East wing: wooden partitions turn both rooms into L-shaped corridors (gate and courtyard door are on
  // opposite sides of the partition; you go around its end in the middle of the wing).
  b.wall('z', MID, -IN + 0.08, -2, T_IN, LOW, 'madeira', [], 0, wood);
  b.wall('z', MID, 2, IN - 0.08, T_IN, LOW, 'madeira', [], 0, wood);

  // --- Roofs and the veranda around the courtyard --------------------------------------------------
  for (const h of curvedRoof(b, { outer: rect(-H - 1.4, -H - 1.4, H + 1.4, -IN + 1.4), top: rect(-8.6, -MID, 8.6, -MID), eaveY: TALL, topY: TALL + 2.7, curl: 1.0, ridges: true })) c.lanterns.hang(h, 0.9);
  curvedRoof(b, { outer: rect(-H - 1.4, IN - 1.4, H + 1.4, H + 1.4), top: rect(-8.6, MID, 8.6, MID), eaveY: LOW, topY: LOW + 2.1, curl: 0.8, ridges: true });
  for (const sx of [-1, 1]) {
    curvedRoof(b, { outer: rect(sx < 0 ? -H - 1.4 : IN - 1.4, -IN + 0.8, sx < 0 ? -IN + 1.4 : H + 1.4, IN - 0.8), top: rect(sx * MID, -2.5, sx * MID, 2.5), eaveY: LOW, topY: LOW + 1.7, curl: 0.7, ridges: true });
  }
  // A golden pearl between two small dragons on the Great Hall's ridge: the map's landmark from afar.
  const ridgeY = TALL + 2.7;
  b.addGeometry(new THREE.SphereGeometry(0.45, 12, 8).translate(0, ridgeY + 0.75, -MID), surfacePaint(), C.gold);
  const ridgeDragon = dragonGeometry([new THREE.Vector3(-3.2, 0.2, 0), new THREE.Vector3(-2.4, 0.55, 0.15), new THREE.Vector3(-1.6, 0.3, -0.1), new THREE.Vector3(-1.0, 0.75, 0)], 0.16, GOLDEN);
  const dm = dragonMaterial();
  for (const sx of [-1, 1]) {
    const d = new THREE.Mesh(ridgeDragon.geo, dm);
    d.position.set(0, ridgeY + 0.15, -MID);
    d.scale.set(sx, 1, 1);
    c.scene.add(d);
  }
  const V = IN - 1;
  for (const x of [-V, -2.5, 2.5, V]) {
    column(b, x, -V, 0, TALL, 0.15);
    column(b, x, V, 0, LOW, 0.15);
  }
  for (const z of [-2.5, 2.5]) {
    column(b, -V, z, 0, LOW, 0.15);
    column(b, V, z, 0, LOW, 0.15);
  }

  // --- Courtyard and the Dragon Cherry -------------------------------------------------------------
  // Wide and open: the old cherry in its bed in the middle, stone lanterns in the corners, nothing else.
  pave(b, rect(-IN, -IN, IN, IN), 0xcfc8b8);
  const tree = dragonCherryTree(c, 0, 0);
  for (const [x, z] of [[-6.3, -6.3], [6.3, -6.3], [-6.3, 6.3], [6.3, 6.3]]) stoneLantern(b, x, z, 0, c.glow);

  // The collectible: under the tree, on its bed; it grows back by falling from the nearest crown.
  const spot = PICKUPS.jardim[0];
  const feet = new THREE.Vector3(...spot.p);
  const above = tree.crowns.reduce((best, k) => (Math.hypot(k.p.x - feet.x, k.p.z - feet.z) < Math.hypot(best.p.x - feet.x, best.p.z - feet.z) ? k : best));
  const cherry = new CherryPickup(c.scene, spot.id, feet, above.p.clone().setY(above.p.y - above.r * 0.5));
  c.animate((dt) => cherry.update(dt));

  // --- Great Hall (north, -IN..IN) ----------------------------------------------------------------
  b.span(-3, 0, -MID - 0.45, 3, 0.75, -MID + 0.45, 'madeira', { tint: C.woodDark });
  b.span(-3.1, 0.75, -MID - 0.55, 3.1, 0.82, -MID + 0.55, 'madeira', { tint: C.lacquer, collide: false });
  for (const x of [-2.2, -0.8, 0.8, 2.2]) {
    for (const z of [-MID - 1.1, -MID + 1.1]) b.box(x, 0.25, z, 0.5, 0.5, 0.5, 'madeira', { tint: C.lacquerDark, collide: false });
  }
  foldingScreen(b, -6.2, 0, -MID, 'z', 3);
  foldingScreen(b, 6.2, 0, -MID - 0.3, 'z', 3);
  for (const [x, z] of [[-7.9, -12.3], [7.9, -12.3], [-7.9, -9.1], [7.9, -9.1]]) vase(b, x, 0, z, 1.0, x < 0 ? 0x2f5d8a : 0x8a4a2f);
  for (const x of [-5, 0, 5]) c.lanterns.hang(new THREE.Vector3(x, 4.75, -MID), 0.9);
  painting(c.scene, -0.5, 2.6, -12.83, 0, 2.6, 1.4, inkLandscape);

  // --- Ceremony hall (south, -IN..IN): throne on a dais, altars, the dragon relief ---------------
  b.span(-3, 0, 11.2, 3, 0.4, H - 0.15, 'madeira', { tint: C.lacquerDark });
  b.span(-2, 0, 10.8, 2, 0.2, 11.2, 'madeira', { tint: C.lacquerDark });
  b.span(-0.7, 0.4, 11.75, 0.7, 0.9, 12.45, 'pintura', { tint: C.lacquer });
  b.span(-0.8, 0.9, 12.4, 0.8, 2.3, 12.65, 'pintura', { tint: C.lacquer });
  b.span(-0.85, 2.2, 12.35, 0.85, 2.4, 12.7, 'pintura', { tint: C.gold, collide: false });
  for (const sx of [-1, 1]) b.span(sx * 0.7 - 0.08, 0.9, 11.75, sx * 0.7 + 0.08, 1.35, 12.45, 'pintura', { tint: C.gold, collide: false });
  for (const sx of [-1, 1]) {
    b.span(sx * 5.5 - 0.8, 0, 11.9, sx * 5.5 + 0.8, 0.9, 12.7, 'madeira', { tint: C.lacquerDark });
    incenseBurner(b, sx * 5.5, 0.9, 12.3, 0.25);
    vase(b, sx * 7.6, 0, 9.2, 1.0, 0x2f5d8a);
  }
  const relief = dragonGeometry(
    [-5.5, -3.5, -1.5, 0.5, 2.5, 4.5, 5.6].map((x, i) => new THREE.Vector3(x, 3.0 + Math.sin(i * 1.4) * 0.35, H - 0.35)),
    0.14,
    CRIMSON,
  );
  const reliefMesh = new THREE.Mesh(relief.geo, dm);
  reliefMesh.castShadow = false;
  c.scene.add(reliefMesh);
  for (const x of [-4, 4]) c.lanterns.hang(new THREE.Vector3(x, 3.55, MID), 0.8);

  // --- West wing: library (north half) and tea room (south half) ----------------------------------
  // Free-standing shelf right between the gate and the courtyard door: you walk around it.
  bookshelf(c, -MID, -3.9, 'z', 3.0);
  bookshelf(c, -12.6, -6.9, 'z', 2.6);
  b.span(-9.6, 0, -1.6, -8.8, 0.78, -0.8, 'madeira', { tint: C.wood });
  for (let k = 0; k < 3; k++) b.cylinder(-9.45 + k * 0.22, 0.78, -1.2, 0.04, 0.3, 'pintura', { tint: 0xf2e6c8, collide: false, segments: 6 });
  foldingScreen(b, -MID, 0, 3.9, 'z', 3);
  lowTable(c, -12, 0, 1.5, 1.2, 0.7);
  lowTable(c, -9.6, 0, 7.0, 1.2, 0.7);
  b.span(-12.8, 0, 6.4, -12.2, 1.8, 7.6, 'madeira', { tint: C.lacquerDark });

  // --- Corner rooms and the east wing --------------------------------------------------------------
  b.span(-12.8, 0, -9.4, -12.2, 1.9, -8.7, 'madeira', { tint: C.lacquerDark });
  vase(b, -9.2, 0, -12.3, 0.9);
  b.span(8.65, 0, -12.8, 9.35, 1.9, -11.6, 'madeira', { tint: C.lacquerDark });
  vase(b, 12.3, 0, -12.3, 0.9, 0x8a4a2f);
  foldingScreen(b, -MID, 0, MID, 'x', 3);
  vase(b, -12.3, 0, 9.1, 1.0);
  b.span(8.7, 0, 12.2, 9.9, 0.8, 12.8, 'madeira', { tint: C.wood });
  vase(b, 12.3, 0, 12.3, 0.9, 0x8a4a2f);
  bench(b, 10.4, -5.5, 'z', 1.6);
  bench(b, 10.4, 5.5, 'z', 1.6);
  vase(b, 12.3, 0, -1.2, 0.9);
  vase(b, 12.3, 0, 1.2, 0.9, 0x8a4a2f);
  return { cherry, fruit: tree.fruit };
}

// --- Ring -------------------------------------------------------------------------------------------

/**
 * The ring between the house and the sector walls: a covered gallery, trees, lanterns and benches. Each
 * straight stretch has something in it that breaks the view.
 */
export function buildRing(c: Ctx) {
  const { b } = c;

  // Paving along the house.
  const path = 0xbdb5a3;
  pave(b, rect(-H - 1.4, -19.7, H + 1.4, -H), path);
  pave(b, rect(-H - 1.4, H, H + 1.4, 19.7), path);
  pave(b, rect(-17.7, -H, -H, H), path);
  pave(b, rect(H, -H, 17.7, H), path);

  // Covered gallery along the north stretch: columns, a long roof, paper screens on its north side.
  {
    const x0 = 1;
    const x1 = 11.5;
    const zn = -19.2;
    const zs = -16.6;
    const bays = 4;
    for (let k = 0; k <= bays; k++) {
      const x = x0 + ((x1 - x0) * k) / bays;
      column(b, x, zn, 0, 3.0, 0.14);
      column(b, x, zs, 0, 3.0, 0.14);
    }
    for (const k of [0, 2, 3]) paperWall(b, 'x', zn, x0 + ((x1 - x0) * k) / bays + 0.15, x0 + ((x1 - x0) * (k + 1)) / bays - 0.15, 2.5, 0);
    b.span(x0, 2.7, zn - 0.12, x1, 3.0, zn + 0.12, 'pintura', { tint: C.beam, collide: false });
    b.span(x0, 2.7, zs - 0.12, x1, 3.0, zs + 0.12, 'pintura', { tint: C.beam, collide: false });
    curvedRoof(b, { outer: rect(x0 - 0.7, zn - 0.7, x1 + 0.7, zs + 0.7), top: rect(x0 + 0.6, (zn + zs) / 2, x1 - 0.6, (zn + zs) / 2), eaveY: 3.0, topY: 4.0, curl: 0.4, ridges: true });
    for (let k = 0; k < bays; k++) c.lanterns.hang(new THREE.Vector3(x0 + ((x1 - x0) * (k + 0.5)) / bays, 3.3, (zn + zs) / 2), 0.7);
    bench(b, (x0 + x1) / 2, zs + 0.55, 'x', 2.0);
  }

  // Corners: a tree and rocks in each, so nobody watches two stretches at once.
  pine(b, -16, 0, -17, 1.0, c.rand);
  rock(b, -14.6, 0, -15.2, 1.0, 1.3, 0.9, c.rand);
  pine(b, 15.8, 0, -17.6, 0.9, c.rand, { greens: [0xf7a8c4, 0xf2c1d6, 0xee8fb4], trunk: 0x5a3b2a });
  rock(b, 14.5, 0, -14.8, 0.9, 1.1, 0.9, c.rand);
  bambooGrove(c, rect(14.3, 16.4, 17.4, 19.4), 1.3);
  rock(b, -15.8, 0, 16.8, 1.2, 1.4, 1.1, c.rand);
  pine(b, -14.4, 0, 18.4, 0.85, c.rand);

  // Stretches: hedges, benches, lanterns.
  hedge(b, -5, 16.6, 1.2, 17.4, 1.1);
  bench(b, -2, 15.6, 'x');
  rock(b, 11.6, 0, 15.6, 0.8, 0.9, 0.8, c.rand);
  hedge(b, -17.2, -2.2, -16.2, 2.2, 1.1);
  bench(b, -14.2, 0, 'z');
  hedge(b, 16.2, -2.2, 17.2, 2.2, 1.1);
  vase(b, 14.2, 0, -4.6, 1.0);
  vase(b, 14.2, 0, 4.6, 1.0, 0x8a4a2f);
  stoneLantern(b, -15.6, -4.6, 0, c.glow);
  stoneLantern(b, -15.6, 4.6, 0, c.glow);
  stoneLantern(b, 15.6, -4.2, 0, c.glow);
  stoneLantern(b, 15.6, 6.4, 0, c.glow);
  stoneLantern(b, -11, -16.4, 0, c.glow);
  stoneLantern(b, 11, 16.4, 0, c.glow);
  stoneLantern(b, -1.5, 18, 0, c.glow);
  stoneLantern(b, 0, -16.2, 0, c.glow);
}

// --- Helpers ----------------------------------------------------------------------------------------

const surfacePaint = () => surfaceMaterial('pintura');

/** Bookshelf full of colored spines on both faces, `len` long along `along`, 2.2 m tall. */
function bookshelf(c: Ctx, x: number, z: number, along: 'x' | 'z', len: number) {
  const { b } = c;
  const d = 0.45;
  const [sx, sz] = along === 'x' ? [len, d] : [d, len];
  b.box(x, 1.1, z, sx, 2.2, sz, 'madeira', { tint: C.woodDark });
  const colors = [0x8a2a22, 0x2f5d8a, 0x4f8a3a, 0xc9a24a, 0x6b4a32, 0xe8dcc0];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.3 + shelf * 0.5;
    let s = -len / 2 + 0.1;
    while (s < len / 2 - 0.15) {
      const w = 0.1 + c.rand() * 0.2;
      const h = 0.3 + c.rand() * 0.12;
      const tint = colors[Math.floor(c.rand() * colors.length)];
      const cx = along === 'x' ? x + s + w / 2 : x;
      const cz = along === 'x' ? z : z + s + w / 2;
      b.box(cx, y + h / 2, cz, along === 'x' ? w - 0.02 : d + 0.04, h, along === 'x' ? d + 0.04 : w - 0.02, 'pintura', { tint, collide: false, castShadow: false });
      s += w;
    }
  }
}

/** Ink landscape: misty mountains, a pine and a red seal. */
function inkLandscape(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = '#f3ead6';
  g.fillRect(0, 0, w, h);
  const ridge = (base: number, amp: number, color: string, seed: number) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, base - amp * Math.abs(Math.sin(x * 0.012 + seed) + 0.5 * Math.sin(x * 0.031 + seed * 2)));
    g.lineTo(w, h);
    g.fill();
  };
  ridge(h * 0.62, h * 0.35, '#c9c2b0', 1);
  ridge(h * 0.78, h * 0.3, '#8f8a80', 3);
  ridge(h * 0.95, h * 0.18, '#3a3f4b', 5);
  g.fillStyle = '#c0352b';
  g.fillRect(w - 50, 22, 26, 34);
  g.fillStyle = '#1b1530';
  g.font = `700 ${Math.round(h * 0.11)}px "Microsoft YaHei", serif`;
  g.fillText('山水', w - 120, 50);
}
