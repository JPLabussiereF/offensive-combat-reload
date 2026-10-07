// Pieces of the Pátio dos Guerreiros used by the catalog (catalog/gardenPieces.ts): weapon racks, training
// dummies and armor stands. The court itself is laid out piece by piece (conversao/jardimSetores.ts) in
// shared/data/mapas/jardim.json.
import * as THREE from 'three';
import { ORIENTAL as C } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import type { Ctx } from './kit';

/** Weapon rack: a frame with spears and halberds standing in it (thin: bullets go through). */
export function weaponRack(c: Ctx, x: number, z: number, along: 'x' | 'z', len = 2.2) {
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
export function dummy(c: Ctx, x: number, z: number) {
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
export function armorStand(c: Ctx, x: number, z: number) {
  const { b } = c;
  b.cylinder(x, 0, z, 0.3, 0.1, 'madeira', { tint: C.woodDark, collide: false, segments: 8 });
  b.cylinder(x, 0.1, z, 0.04, 1.0, 'madeira', { tint: C.woodDark, collide: false, segments: 6 });
  b.box(x, 1.35, z, 0.6, 0.7, 0.35, 'pintura', { tint: C.lacquerDark, physics: 'metal' });
  for (let k = 0; k < 3; k++) b.box(x, 1.12 + k * 0.2, z, 0.62, 0.05, 0.37, 'pintura', { tint: C.gold, collide: false, castShadow: false });
  for (const s of [-1, 1]) b.box(x + s * 0.38, 1.55, z, 0.2, 0.3, 0.38, 'pintura', { tint: C.lacquer, collide: false });
  b.addGeometry(new THREE.SphereGeometry(0.2, 10, 7, 0, Math.PI * 2, 0, Math.PI / 1.7).translate(x, 1.85, z), surfaceMaterial('pintura'), C.lacquerDark);
  b.box(x, 2.08, z, 0.04, 0.2, 0.04, 'pintura', { tint: C.gold, collide: false });
}
