// Pátio dos Guerreiros (south, x -18..18, z 20..45): the estate's military court.
// The big red gate (open leaves, the tiger plaque) leads into the training arena: an open stone court with
// a painted circle, its edges lined with weapon racks, training dummies, armor stands and a low wall. West:
// the dojo (tatami, racks, doors on three sides). North-east corner: the Master's Platform, one level up
// (2 m: a view over the arena, never over the walls). South-west: the zen garden that leads to the bamboo
// valley's moon gate. South-east: the armory shed by the lantern quarter's gate.
import * as THREE from 'three';
import { stairRun } from '../mapBuilder';
import { column, curvedRoof, ORIENTAL as C, pavilion, pine, railing, rock, stoneLantern } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import { bench, crate, type Ctx, pave, rect, steppingPath, struck } from './kit';

export function buildGuerreiros(c: Ctx) {
  const { b, rand } = c;

  // --- Arena ---------------------------------------------------------------------------------------
  pave(b, rect(-4.4, 24.2, 12.2, 38.4), 0xc2baa8);
  const ring = new THREE.TorusGeometry(4.2, 0.12, 4, 48).rotateX(Math.PI / 2).scale(1, 0.15, 1).translate(4, 0.045, 31.3);
  b.addGeometry(ring, surfaceMaterial('pintura'), C.lacquer, false);
  ring.dispose();
  for (const [x, z] of [[4, 27.1], [4, 35.5], [-0.2, 31.3], [8.2, 31.3]]) b.span(x - 0.3, 0.03, z - 0.3, x + 0.3, 0.05, z + 0.3, 'pintura', { tint: C.gold, collide: false, castShadow: false });
  // Low stone wall at the entrance: cover for whoever comes through the gate.
  b.span(2.6, 0, 23.2, 9.4, 1.1, 23.8, 'pedra', { tint: C.stoneDark });
  b.span(2.5, 1.1, 23.1, 9.5, 1.2, 23.9, 'pedra', { tint: C.stone, collide: false });
  weaponRack(c, -3.2, 27.6, 'z');
  weaponRack(c, -3.2, 34.8, 'z');
  weaponRack(c, 4, 38.2, 'x');
  for (const [x, z] of [[10.8, 26.4], [10.6, 30.2], [11, 35.6], [-2.4, 37.2], [1.2, 25.6]]) dummy(c, x, z);
  armorStand(c, 7.4, 38.2);
  armorStand(c, 0.6, 38.2);
  crate(b, 11.2, 0, 32.6, 1.0, 0.3);
  crate(b, 11.4, 1.0, 32.6, 0.7, 0.8);
  crate(b, -3.4, 0, 31.2, 0.9, 0.1);
  // A war drum on its stand.
  b.span(-3.9, 0, 23.6, -2.3, 0.5, 24.6, 'madeira', { tint: C.lacquerDark });
  const drum = new THREE.CylinderGeometry(0.62, 0.62, 0.7, 16).rotateX(Math.PI / 2).translate(-3.1, 1.15, 24.1);
  b.addGeometry(drum, surfaceMaterial('pintura'), C.lacquer);
  drum.dispose();
  const drumHit = struck(c, 'tambor:1', { x: -3.1, y: 1.15, z: 24.1 }, 'loud', (s) => s.drum(0.8));
  b.cuboidCollider(new THREE.Vector3(-3.1, 1.1, 24.1), new THREE.Vector3(0.6, 0.6, 0.35), new THREE.Quaternion(), 'wood', drumHit);

  // --- Dojo ----------------------------------------------------------------------------------------
  const dojo = pavilion(b, {
    cx: -11.5,
    cz: 29.5,
    stories: [{ hw: 5.2, hd: 6.0, h: 3.8, style: 'madeira', doors: { e: [-3, 3], n: [2], s: [-2] }, windows: { e: [0], n: [-2.6], s: [2.4] } }],
    roof: { overhang: 1.0, rise: 2.6, curl: 0.9 },
  });
  for (const h of dojo.hooks) c.lanterns.hang(h, 0.8);
  // Tatami: straw mats with dark borders.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 5; j++) {
      const x0 = -16.2 + i * 2.35;
      const z0 = 24.2 + j * 2.2;
      b.span(x0 + 0.03, 0.02, z0 + 0.03, x0 + 2.3, 0.035, z0 + 2.15, 'pintura', { tint: 0xd8cf98, collide: false, castShadow: false });
    }
  }
  weaponRack(c, -16.1, 26.2, 'z');
  weaponRack(c, -16.1, 32.6, 'z');
  // Shrine on the west wall, between the racks.
  b.span(-16.5, 0, 28.6, -15.7, 1.0, 30.4, 'madeira', { tint: C.lacquerDark });
  b.span(-16.6, 1.0, 29.1, -16.3, 2.2, 29.9, 'pintura', { tint: C.gold, collide: false });
  dummy(c, -11.6, 27.4);
  dummy(c, -9.2, 31.8);
  for (const z of [26.5, 32.5]) c.lanterns.hang(new THREE.Vector3(-11.5, 3.75, z), 0.8);

  // --- Master's Platform (one level up, roofed) ---------------------------------------------------
  {
    const x0 = 12.6;
    const x1 = 17.1;
    const z0 = 22.0;
    const z1 = 26.6;
    const y = 2.0;
    b.span(x0, y - 0.2, z0, x1, y, z1, 'madeira', { tint: C.wood });
    for (const [x, z] of [[x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2], [x1 - 0.2, z1 - 0.2], [x0 + 0.2, z1 - 0.2]]) column(b, x, z, 0, y + 2.6, 0.15);
    b.stairs('z', -1, z1 + stairRun(y), x0, x0 + 1.3, 0, y, 'madeira', { tint: C.wood });
    railing(b, 'x', z0 + 0.06, x0, x1, y);
    railing(b, 'z', x1 - 0.06, z0, z1, y);
    railing(b, 'x', z1 - 0.06, x0 + 1.4, x1, y);
    railing(b, 'z', x0 + 0.06, z0, z1 - 1.0, y);
    for (const h of curvedRoof(b, { outer: rect(x0 - 0.7, z0 - 0.7, x1 + 0.4, z1 + 0.7), top: rect((x0 + x1) / 2, (z0 + z1) / 2, (x0 + x1) / 2, (z0 + z1) / 2), eaveY: y + 2.6, topY: y + 3.8, curl: 0.6, ridges: true })) c.lanterns.hang(h, 0.6);
    // Under it: crates and a rack (the platform's shade is cover too).
    crate(b, 15.6, 0, 23.4, 1.0, 0.2);
    weaponRack(c, 16.8, 24.2, 'z');
  }

  // --- Zen garden (south-west) ---------------------------------------------------------------------
  pave(b, rect(-17.7, 37.6, -4.6, 44.7), 0xe9dfc6, 'pintura');
  for (let z = 38.1; z < 44.5; z += 0.45) b.span(-17.6, 0.03, z, -4.7, 0.045, z + 0.05, 'pintura', { tint: 0xd2c7ad, collide: false, castShadow: false });
  for (const [x, z, sx, sy, sz] of [[-13.6, 41.8, 1.4, 1.5, 1.1], [-9.2, 40.2, 1.0, 1.1, 0.9], [-6.6, 43.2, 0.8, 0.8, 0.8]]) rock(b, x, 0, z, sx, sy, sz, rand, 0x8f8a80);
  pine(b, -11.2, 0, 43.6, 1.0, rand);
  pine(b, -5.4, 0, 38.6, 0.8, rand, { greens: [0xf7a8c4, 0xf2c1d6, 0xee8fb4], trunk: 0x5a3b2a });
  bench(b, -9.6, 44, 'x', 2.0);
  stoneLantern(b, -16.8, 39.2, 0, c.glow);
  stoneLantern(b, -16.8, 42.8, 0, c.glow);
  steppingPath(c, [[-13.4, 36.2], [-14.4, 38.6], [-16.4, 41]]);
  steppingPath(c, [[-14.4, 38.6], [-10.6, 38.2], [-7, 40.8], [-3.6, 41.8]]);

  // --- Armory shed (south-east) --------------------------------------------------------------------
  pavilion(b, {
    cx: 13.6,
    cz: 41.4,
    stories: [{ hw: 2.8, hd: 2.6, h: 3.0, style: 'madeira', doors: { n: [0], w: [0] } }],
    roof: { overhang: 0.6, rise: 1.6, curl: 0.6 },
  });
  weaponRack(c, 15.8, 41.4, 'z');
  crate(b, 11.8, 0, 43.2, 0.8);
  armorStand(c, 15.4, 43.4);
  for (const [x, z, s, yaw] of [[16.4, 30.6, 1.0, 0.2], [16.6, 31.7, 0.8, 0], [13.6, 34.4, 0.9, 0.5]]) crate(b, x, 0, z, s, yaw);
  armorStand(c, 9.6, 43.6);
  pine(b, 3.2, 0, 42.8, 1.0, rand);
  rock(b, 6.6, 0, 43.8, 1.0, 1.1, 0.9, rand);
  stoneLantern(b, -0.6, 43.4, 0, c.glow);
  stoneLantern(b, 9.4, 21.2, 0, c.glow);
  stoneLantern(b, 2.6, 21.2, 0, c.glow);
}

/** Weapon rack: a frame with spears and halberds standing in it (thin: bullets go through). */
function weaponRack(c: Ctx, x: number, z: number, along: 'x' | 'z', len = 2.2) {
  const { b } = c;
  const o = { tint: C.woodDark, collide: false };
  const piece = (s0: number, s1: number, y0: number, y1: number, d: number) => {
    if (along === 'x') b.span(x + s0, y0, z - d / 2, x + s1, y1, z + d / 2, 'madeira', o);
    else b.span(x - d / 2, y0, z + s0, x + d / 2, y1, z + s1, 'madeira', o);
  };
  piece(-len / 2, -len / 2 + 0.1, 0, 1.6, 0.4);
  piece(len / 2 - 0.1, len / 2, 0, 1.6, 0.4);
  piece(-len / 2, len / 2, 1.4, 1.5, 0.12);
  piece(-len / 2, len / 2, 0.3, 0.4, 0.4);
  const paint = surfaceMaterial('pintura');
  for (let k = 0; k < 6; k++) {
    const s = -len / 2 + 0.3 + (k * (len - 0.6)) / 5;
    const [px, pz] = along === 'x' ? [x + s, z] : [x, z + s];
    b.addGeometry(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 5).translate(px, 1.2, pz), paint, 0x8a5432);
    b.addGeometry(new THREE.ConeGeometry(0.05, 0.3, 4).translate(px, 2.5, pz), paint, k % 3 === 1 ? C.gold : 0xc9cdd2);
    if (k % 2 === 0) b.addGeometry(new THREE.SphereGeometry(0.06, 6, 4).translate(px, 2.28, pz), paint, 0xc0352b, false);
  }
  const center = new THREE.Vector3(x, 0.8, z);
  b.cuboidCollider(center, along === 'x' ? new THREE.Vector3(len / 2, 0.8, 0.1) : new THREE.Vector3(0.1, 0.8, len / 2), new THREE.Quaternion(), 'wood');
}

/** Wooden training dummy (mu ren zhuang): a post with three arms and a leg, on a low base. */
function dummy(c: Ctx, x: number, z: number) {
  const { b } = c;
  b.span(x - 0.35, 0, z - 0.35, x + 0.35, 0.12, z + 0.35, 'madeira', { tint: C.woodDark, collide: false });
  b.cylinder(x, 0.12, z, 0.16, 1.65, 'madeira', { tint: 0x8a5432, segments: 10 });
  const paint = surfaceMaterial('madeira');
  for (const [y, a, l] of [[1.35, 0.5, 0.45], [1.35, -0.5, 0.45], [1.05, 0, 0.5], [0.45, 0.3, 0.5]]) {
    const arm = new THREE.CylinderGeometry(0.04, 0.04, l, 6).rotateX(Math.PI / 2).translate(0, 0, l / 2).rotateY(a).translate(x, y, z);
    b.addGeometry(arm, paint, 0x6b4a32);
    arm.dispose();
  }
}

/** Lacquered armor on a stand (stops bullets). */
function armorStand(c: Ctx, x: number, z: number) {
  const { b } = c;
  b.cylinder(x, 0, z, 0.3, 0.1, 'madeira', { tint: C.woodDark, collide: false, segments: 8 });
  b.cylinder(x, 0.1, z, 0.04, 1.0, 'madeira', { tint: C.woodDark, collide: false, segments: 6 });
  b.box(x, 1.35, z, 0.6, 0.7, 0.35, 'pintura', { tint: C.lacquerDark, physics: 'metal' });
  for (let k = 0; k < 3; k++) b.box(x, 1.12 + k * 0.2, z, 0.62, 0.05, 0.37, 'pintura', { tint: C.gold, collide: false, castShadow: false });
  for (const s of [-1, 1]) b.box(x + s * 0.38, 1.55, z, 0.2, 0.3, 0.38, 'pintura', { tint: C.lacquer, collide: false });
  b.addGeometry(new THREE.SphereGeometry(0.2, 10, 7, 0, Math.PI * 2, 0, Math.PI / 1.7).translate(x, 1.85, z), surfaceMaterial('pintura'), C.lacquerDark);
  b.box(x, 2.08, z, 0.04, 0.2, 0.04, 'pintura', { tint: C.gold, collide: false });
}
