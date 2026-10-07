// Pieces of the Pátio das Lanternas used by the catalog (catalog/gardenPieces.ts): the chime bells, the market
// stalls, baskets and the hand cart. The court itself is laid out piece by piece (conversao/jardimSetores.ts) in
// shared/data/mapas/jardim.json.
import * as THREE from 'three';
import { Bell, ORIENTAL as C } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import { crate, type Ctx, plaque } from './kit';

export interface Market {
  fruit: { p: THREE.Vector3; r: number; color: number }[];
  counters: { x0: number; x1: number; z0: number; z1: number; y: number }[];
}

/** Dó, ré, mi, fá, sol (C5 to G5), in Hz. */
export const NOTES = [523.25, 587.33, 659.25, 698.46, 783.99];

/**
 * Bianzhong: five bronze bells of falling size on a lacquered frame, the biggest (dó) on the right of whoever
 * faces them from the market (-X), down to the smallest (sol) on their left. Each rings its note and swings
 * when shot, synchronized as "carrilhao:0".."carrilhao:4".
 */
export function bianzhong(c: Ctx, x0: number, x1: number, z: number) {
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
export function stall(c: Ctx, x: number, z: number, cloth: number, goods: number[], market: Market | null) {
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
export function basket(c: Ctx, x: number, z: number) {
  c.b.cylinder(x, 0, z, 0.32, 0.45, 'madeira', { tint: 0xc9a46a, segments: 10, radiusTop: 0.38 });
  c.b.cylinder(x, 0.45, z, 0.39, 0.05, 'madeira', { tint: 0x8a6a3a, segments: 10, collide: false });
}

/** Hand cart with two wheels, along Z (cover in the middle of the street). */
export function cart(c: Ctx, x: number, z: number) {
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
