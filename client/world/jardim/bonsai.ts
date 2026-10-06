// Jardim de Bonsai (north, x -18..18, z -45..-20): the most refined part of the estate.
// From the south gate a stone path winds between clipped hedges to the Dragon Bonsai (a huge pot with a
// pine trained into a dragon's coils), then on to the bonsai pavilion on its platform (NE, a defensive
// spot) and to the moon gate of the lake. West: the ornamental pond with koi, cut in two by an arched
// bridge that comes straight from the sanctuary's gate (the quick, exposed way in). Bonsai on pedestals,
// rocks and hedges give cover all over; the tall hedges keep the garden from being one open field.
import * as THREE from 'three';
import { stairRun, worldUVs } from '../mapBuilder';
import { bonsai, foliageCrown, ORIENTAL as C, pine, rock, stoneLantern } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import { archBridge, basin, bench, type Ctx, deck, hedge, lilies, rect, signBoard, steppingPath, ting } from './kit';

export function buildBonsai(c: Ctx) {
  const { b, rand } = c;

  // --- Pond and the arched bridge ------------------------------------------------------------------
  const pond = rect(-15, -42.5, -5, -33.5);
  c.holes.push(pond);
  basin(c, pond, 0.6);
  lilies(c, pond, 12);
  archBridge(c, 'x', -16.4, -3.6, -38, 2.0, 1.0);
  for (const [x, z, s] of [[-13.8, -41.4, 0.7], [-6.4, -41.4, 0.7], [-15.3, -33.4, 0.9], [-4.6, -33.2, 1.1]]) rock(b, x, -0.4, z, s, s * 0.9, s * 0.8, rand);

  // --- Paths ---------------------------------------------------------------------------------------
  steppingPath(c, [[-6, -21], [-4.5, -24], [-1.4, -25.8], [-1.6, -29.5], [-0.2, -36.4], [3.5, -38.6], [8.6, -39.6]]);
  steppingPath(c, [[-1.6, -29.5], [5, -28.6], [11, -30.2], [17.2, -29]]);
  steppingPath(c, [[-3.6, -38], [-1.6, -36.4]]);
  steppingPath(c, [[12.2, -21], [12.6, -26], [11, -30.2]]);

  // --- The Dragon Bonsai: a giant glazed pot, a pine trained into a dragon's coils -----------------
  dragonBonsai(c, 2, -32.5);

  // --- Bonsai pavilion (NE): a platform with railings, a bench and two bonsai -----------------------
  const tx = 13;
  const tz = -40.5;
  for (const h of ting(c, tx, tz, 2.2, { base: 0.9, steps: ['w', 's'], rails: true, h: 2.8 })) c.lanterns.hang(h, 0.7);
  bench(b, tx, tz - 1.4, 'x', 2.0, 0.9);
  pedestal(c, tx + 1.4, tz + 1.3, 0.9);
  pedestal(c, tx - 1.4, tz + 1.3, 0.9);

  // --- Raised deck behind the pond (north), with a bench ---------------------------------------------
  deck(c, rect(-3, -44.6, 3.5, -42), 0.5, 0);
  b.stairs('z', -1, -42 + stairRun(0.5, true), -0.6, 0.6, 0, 0.5, 'madeira', { tint: C.wood, gentle: true });
  bench(b, 0.2, -44, 'x', 2.2, 0.5);
  pedestal(c, -2.2, -43.3, 0.5);
  pedestal(c, 2.8, -43.3, 0.5);

  // --- Hedges: low ones are cover, the tall ones (2 m) cut the long views ---------------------------
  hedge(b, -10, -27.2, -3, -26.4, 2.0);
  hedge(b, 3, -23.4, 9, -22.6, 1.1);
  hedge(b, 7.6, -34.5, 8.4, -30.8, 2.0);
  hedge(b, 7.6, -27.6, 8.4, -25, 2.0);
  hedge(b, -3, -42, -2.2, -39.4, 1.2);
  hedge(b, 14, -24.2, 17.4, -23.4, 1.0);
  hedge(b, -17.4, -30, -14, -29.2, 1.3);
  hedge(b, 4.5, -45, 5.3, -41.8, 1.3);
  hedge(b, -16.2, -24.6, -13.4, -23.8, 1.1);

  // --- Bonsai on pedestals (low cover) ---------------------------------------------------------------
  for (const [x, z] of [[-11, -22.5], [-9, -22.5], [-14.5, -26.6], [-12.5, -30.6], [-7.5, -31], [-4.2, -30.4], [1, -22.6], [5.6, -26.2], [10.6, -26.6], [15.6, -27], [10.6, -34.6], [15.6, -33.4], [2.6, -37.4], [1.6, -40.4]]) {
    pedestal(c, x, z);
  }

  // --- Trees, rocks, lanterns -----------------------------------------------------------------------
  const blossom = { greens: [0xf7a8c4, 0xf2c1d6, 0xee8fb4], trunk: 0x5a3b2a };
  pine(b, -16.2, 0, -21.8, 0.9, rand);
  pine(b, 16.4, 0, -36.2, 1.0, rand, blossom);
  pine(b, -2.8, 0, -33.2, 0.8, rand);
  pine(b, 6.6, 0, -43.6, 0.85, rand, blossom);
  pine(b, 16.4, 0, -21.6, 0.8, rand);
  for (const [x, z, sx, sy, sz] of [
    [-10.5, -29, 1.1, 1.0, 1.0], [4.2, -29.8, 0.9, 1.0, 0.8], [10.8, -22.4, 1.0, 0.9, 1.0],
    [16.6, -43.6, 1.0, 1.4, 1.0], [-4.6, -23, 0.8, 0.8, 0.9], [10, -35.6, 0.9, 0.9, 0.9], [-12.6, -32.5, 0.7, 0.6, 0.7],
  ]) {
    rock(b, x, 0, z, sx, sy, sz, rand);
  }
  for (const [x, z] of [[-8.8, -21.4], [-3.2, -21.4], [16.8, -30.8], [16.8, -27.2], [-17.2, -35.2], [-17.2, -40.8], [6.2, -35.4]]) stoneLantern(b, x, z, 0, c.glow);
  signBoard(c, ['JARDIM DO', 'DRAGÃO', 'Não alimente o dragão'], -1.6, -21.6, 0, '#c0352b', '#ffe9a8', 2.2);
}

/** Bonsai in a glazed pot on a stone pedestal (`y` = ground under it). */
export function pedestal(c: Ctx, x: number, z: number, y = 0) {
  c.b.box(x, y + 0.35, z, 0.9, 0.7, 0.7, 'pedra', { tint: C.stone });
  bonsai(c.b, x, y + 0.7, z, 1, c.rand, c.rand() < 0.5 ? 0x2f5d8a : 0x8a4a2f);
}

/**
 * The landmark: a pot 4.6 m wide and a pine whose trunk rises, then snakes sideways in coils like a dragon,
 * with crowns of foliage along its back and a "head" crown at the end. Only the pot and the trunk's base collide.
 */
export function dragonBonsai(c: Ctx, x: number, z: number) {
  const { b, rand } = c;
  const pot = 0x2f5d8a;
  b.box(x, 0.55, z, 4.6, 1.1, 3.2, 'pintura', { tint: pot });
  b.box(x, 1.12, z, 4.85, 0.14, 3.4, 'pintura', { tint: pot, collide: false });
  b.box(x, 1.17, z, 4.4, 0.04, 3.0, 'pintura', { tint: 0x5a4030, collide: false, castShadow: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + sx * 2.0, 0.1, z + sz * 1.3, 0.5, 0.2, 0.5, 'pintura', { tint: 0x1f3d6b, collide: false });
  b.box(x, 0.6, z + 1.62, 2.2, 0.5, 0.04, 'pintura', { tint: C.gold, collide: false, castShadow: false });
  const y0 = 1.17;
  const pts = [
    new THREE.Vector3(x - 0.6, y0, z),
    new THREE.Vector3(x - 0.3, y0 + 1.2, z + 0.2),
    new THREE.Vector3(x + 0.5, y0 + 2.0, z - 0.3),
    new THREE.Vector3(x + 1.6, y0 + 2.4, z + 0.5),
    new THREE.Vector3(x + 0.8, y0 + 3.0, z + 1.2),
    new THREE.Vector3(x - 0.8, y0 + 3.2, z + 0.4),
    new THREE.Vector3(x - 1.6, y0 + 3.8, z - 0.6),
    new THREE.Vector3(x - 0.6, y0 + 4.4, z - 1.1),
    new THREE.Vector3(x + 0.6, y0 + 4.6, z - 0.5),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.TubeGeometry(curve, 48, 0.24, 7);
  // Taper toward the head.
  const pos = trunk.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const ring = 8;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.floor(i / ring) / 48;
    const center = curve.getPoint(Math.min(1, t));
    v.fromBufferAttribute(pos, i).sub(center).multiplyScalar(1.15 - 0.6 * t).add(center);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  trunk.computeVertexNormals();
  worldUVs(trunk);
  b.addGeometry(trunk, surfaceMaterial('casca'), 0x6b4a32);
  trunk.dispose();
  // Crowns of foliage along the back (the dragon's crest) and the head at the end.
  const greens = [0x3f8a3a, 0x4f9e44, 0x3a7a30];
  const y1 = y0 + 5.4;
  for (let k = 0; k < 7; k++) {
    const t = 0.25 + k * 0.11;
    const p = curve.getPoint(Math.min(1, t));
    const r = 0.75 + rand() * 0.35;
    foliageCrown(b, p.add(new THREE.Vector3(0, 0.35, 0)), r, [...greens.slice(k % 3), ...greens.slice(0, k % 3)], { flat: 0.42, y0: y0 + 1.5, y1 });
  }
  const head = curve.getPoint(1);
  foliageCrown(b, head.add(new THREE.Vector3(0.4, 0.25, 0)), 1.05, [0x4f9e44, 0x3f8a3a], { flat: 0.5, y0: y0 + 1.5, y1 });
  b.cuboidCollider(new THREE.Vector3(x - 0.4, y0 + 1.2, z), new THREE.Vector3(0.35, 1.2, 0.35), new THREE.Quaternion(), 'wood', undefined, 'trunk');
  c.lanterns.hang(new THREE.Vector3(x + 1.6, y0 + 2.2, z + 0.5), 0.6);
  c.lanterns.hang(new THREE.Vector3(x - 1.6, y0 + 3.6, z - 0.6), 0.6);
}
