// Pieces of the Santuário Ancestral used by the catalog (catalog/gardenPieces.ts): tombs, bells, the big drum,
// the stele, the planter pines and the ancestor portraits. The sanctuary itself is laid out piece by piece
// (conversao/jardimSetores.ts) in shared/data/mapas/jardim.json.
import * as THREE from 'three';
import { Bell, ORIENTAL as C, pine } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import { type Ctx, inscription, struck } from './kit';

/** Terrace top. */
export const TY = 3.0;

/** Stone tomb: a plinth and a lid (good cover in the crypt). */
export function tomb(c: Ctx, x: number, z: number, along: 'x' | 'z') {
  const [sx, sz] = along === 'x' ? [2.2, 1.0] : [1.0, 2.2];
  c.b.box(x, 0.45, z, sx, 0.9, sz, 'pedra', { tint: 0x9d9a90 });
  c.b.box(x, 0.95, z, sx + 0.12, 0.12, sz + 0.12, 'pedra', { tint: 0x8f8a80, collide: false });
  c.b.box(x, 1.05, z, sx * 0.6, 0.1, sz * 0.6, 'pedra', { tint: 0x8f8a80, collide: false });
}

/** Bronze bell hanging in a wooden frame (on the terrace): rings and swings when shot. */
export function bellFrame(c: Ctx, x: number, y: number, z: number, i: number) {
  const { b } = c;
  for (const s of [-1, 1]) b.box(x + s * 0.8, y + 1.3, z, 0.16, 2.6, 0.16, 'pintura', { tint: C.lacquer, physics: 'wood' });
  b.box(x, y + 2.55, z, 1.9, 0.16, 0.2, 'pintura', { tint: C.lacquer, collide: false });
  for (const s of [-1, 1]) b.box(x + s * 0.98, y + 2.62, z, 0.28, 0.1, 0.16, 'pintura', { tint: C.gold, collide: false, rot: new THREE.Euler(0, 0, s * 0.4) });
  const top = y + 2.47;
  const bell = new Bell(c.scene, b, x, top, z, 0.85, c.props, `sino:${i}`, () => c.sfx.at({ x, y: top - 0.7, z }, 'normal', (s) => s.bell(0.85)));
  c.animate((dt) => bell.update(dt));
}

/** A great bell hung from a beam across a pavilion: an obstacle (and cover) in the middle of it. Rings when shot. */
export function hangingBell(c: Ctx, x: number, top: number, z: number, id = 'sino:2') {
  c.b.span(x - 2.1, top - 0.32, z - 0.12, x + 2.1, top - 0.04, z + 0.12, 'pintura', { tint: C.lacquer, collide: false });
  const hook = top - 0.32;
  const bell = new Bell(c.scene, c.b, x, hook, z, 1.35, c.props, id, () => c.sfx.at({ x, y: hook - 1, z }, 'loud', (s) => s.bell(1.35)));
  c.animate((dt) => bell.update(dt));
}

/** Big drum on a stand: booms when shot. */
export function bigDrum(c: Ctx, x: number, y: number, z: number, id = 'tambor:0') {
  const { b } = c;
  b.span(x - 0.9, y, z - 0.5, x + 0.9, y + 0.7, z + 0.5, 'madeira', { tint: C.lacquerDark });
  const drum = new THREE.CylinderGeometry(0.85, 0.85, 1.0, 18).rotateZ(Math.PI / 2).translate(x, y + 1.55, z);
  b.addGeometry(drum, surfaceMaterial('pintura'), C.lacquer);
  drum.dispose();
  for (const s of [-1, 1]) {
    const head = new THREE.CylinderGeometry(0.8, 0.8, 0.02, 18).rotateZ(Math.PI / 2).translate(x + s * 0.51, y + 1.55, z);
    b.addGeometry(head, surfaceMaterial('pintura'), 0xf2e6c8, false);
    head.dispose();
  }
  const hit = struck(c, id, { x, y: y + 1.55, z }, 'loud', (s) => s.drum(1));
  b.cuboidCollider(new THREE.Vector3(x, y + 1.5, z), new THREE.Vector3(0.55, 0.85, 0.85), new THREE.Quaternion(), 'wood', hit);
}

/** Memorial stele on a square stone base, in the middle of the lower court: it blocks the view up the stairs. */
export function stele(c: Ctx, x: number, z: number) {
  const { b } = c;
  b.box(x, 0.4, z, 2.8, 0.8, 2.8, 'pedra', { tint: 0x9d9a90 });
  b.box(x, 0.74, z, 2.86, 0.06, 2.86, 'pedra', { tint: 0x8f8a80, collide: false, castShadow: false });
  b.box(x, 2.55, z, 2.4, 3.5, 0.55, 'pedra', { tint: 0xb4ae9f });
  // The inscription, in columns read top to bottom, right to left: "I fucked the ass of whoever is reading
  // this" (the pt-BR joke "comi o cu de quem tá lendo"; 操 carries the slang meaning that 吃, "eat", wouldn't).
  for (const side of [-1, 1]) inscription(c.scene, ['我操了正在', '读这句话的', '人的屁眼'], x, 2.7, z + side * 0.285, side > 0 ? 0 : Math.PI, 1.5, 2.7);
}

export function planterPine(c: Ctx, x: number, z: number) {
  c.b.box(x, TY + 0.4, z, 1.6, 0.8, 1.6, 'pedra', { tint: C.stoneDark });
  pine(c.b, x, TY + 0.8, z, 0.7, c.rand);
}

/** Ancestor portrait: a robed figure on silk, three different ones. */
export function portrait(g: CanvasRenderingContext2D, w: number, h: number, i: number) {
  g.fillStyle = '#efe2c2';
  g.fillRect(0, 0, w, h);
  const robes = ['#8a2a22', '#1f3d6b', '#2f7f78'];
  g.fillStyle = robes[i % 3];
  g.beginPath();
  g.moveTo(w * 0.2, h * 0.92);
  g.lineTo(w * 0.32, h * 0.42);
  g.lineTo(w * 0.68, h * 0.42);
  g.lineTo(w * 0.8, h * 0.92);
  g.fill();
  g.fillStyle = '#f0d0a8';
  g.beginPath();
  g.arc(w * 0.5, h * 0.33, w * 0.12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1b1530';
  g.fillRect(w * 0.36, h * 0.17, w * 0.28, h * 0.07);
  g.fillRect(w * 0.42, h * 0.38, w * 0.16, h * 0.08);
  g.fillStyle = '#e7b847';
  g.fillRect(w * 0.44, h * 0.55, w * 0.12, h * 0.12);
  g.fillStyle = '#c0352b';
  g.fillRect(w * 0.08, h * 0.05, w * 0.1, h * 0.06);
}
