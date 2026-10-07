// Pieces of the Jardim de Bonsai used by the catalog (catalog/gardenPieces.ts): bonsai on pedestals and the
// Dragon Bonsai. The garden itself is laid out piece by piece (conversao/jardimSetores.ts) in
// shared/data/mapas/jardim.json.
import * as THREE from 'three';
import { worldUVs } from '../mapBuilder';
import { bonsai, foliageCrown, ORIENTAL as C } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import type { Ctx } from './kit';

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
