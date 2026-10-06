// Santuário Ancestral (north-west, x -45..-18, z -45..0): the spiritual, monumental part.
// A lower court (bell and drum pavilions, a stele on its base, guardian lions) leads to the grand stairs,
// which climb 3 m to the terrace: the incense court, with the great burner, and the temple at the back
// (three tiers of roof; inside, the ancestral hall with altars, portraits, the dragon and the gong).
// Inside the terrace is the crypt: tombs between pillars, lamps in niches, a door to the lower court, a
// door to the east path and a stair up to the incense court. It is the sector's way around: below the
// fight on the terrace, out on either side. The east path (to the bonsai garden) runs at ground level
// beside the terrace, overlooked from its edge.
import * as THREE from 'three';
import { stairRun } from '../mapBuilder';
import { Bell, column, curvedRoof, dragonGeometry, dragonMaterial, expand, Gong, ORIENTAL as C, pavilion, pine, railing, rock, stoneLantern, type DragonColors } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import { bench, type Ctx, incenseBurner, inscription, lamp, painting, pave, plaque, rect, slab, stoneLion, struck, ting, vase } from './kit';

const GOLDEN: DragonColors = { body: 0xe7b847, bodyDark: 0xb98a2a, belly: 0xf7e7b0, spikes: 0xc0352b, horns: 0xf7e7b0 };

/** Terrace top. */
const TY = 3.0;

export function buildSantuario(c: Ctx) {
  const { b, rand } = c;
  const stone = { tint: C.stone };

  // --- Terrace and the crypt inside it -------------------------------------------------------------
  // North block (under the temple): solid. South part: the crypt, under a 0.4 m slab.
  b.span(-45, 0, -45, -24, TY, -33.6, 'pedra', { tint: 0xb4ae9f });
  const well = rect(-30.4, -33.6, -26.4, -32.2);
  slab(b, rect(-45, -33.6, -24, -21), [well], TY - 0.4, TY, 'pedra', { tint: 0xb4ae9f });
  const retain = { tint: 0xa8a294, frame: { surface: 'pintura' as const, tint: C.stoneDark, width: 0.12 } };
  b.wall('x', -21.3, -45, -24, 0.6, TY - 0.4, 'pedra', [[-42.9, -41.1, 0, 2.3]], 0, retain);
  b.wall('z', -24.3, -33.6, -21.6, 0.6, TY - 0.4, 'pedra', [[-27.9, -26.1, 0, 2.3]], 0, retain);
  // A darker band along the terrace's face.
  b.span(-45, TY - 0.45, -21.06, -24, TY - 0.3, -20.95, 'pintura', { tint: C.stoneDark, collide: false, castShadow: false });
  b.span(-24.06, TY - 0.45, -45, -23.95, TY - 0.3, -21, 'pintura', { tint: C.stoneDark, collide: false, castShadow: false });
  // Crypt inside: a wall splitting west from east, the west half in two chambers, tombs, pillars, lamps.
  const cryptH = TY - 0.4;
  b.room({ x: -45, y: 0, z: -33.6 }, { x: -24.6, y: cryptH, z: -21.6 }, 1);
  const stoneWall = { tint: 0x9d9a90 };
  b.wall('z', -36, -33.6, -21.6, 0.5, cryptH, 'pedra', [[-25.4, -23.6, 0, 2.3], [-31.4, -29.6, 0, 2.3]], 0, stoneWall);
  b.wall('x', -27.6, -45, -36.25, 0.5, cryptH, 'pedra', [[-41.4, -39.6, 0, 2.3]], 0, stoneWall);
  b.span(-45, 0, -33.6, -24, 0.02, -21, 'pedra', { tint: 0x7d7a72, collide: false, castShadow: false });
  for (const [x, z, along] of [[-41, -31.6, 'x'], [-41, -24.4, 'x'], [-33, -24.6, 'z'], [-28.6, -25.2, 'x'], [-32.6, -30.2, 'x']] as const) tomb(c, x, z, along);
  for (const [x, z] of [[-38.4, -30.6], [-38.4, -24.6], [-31.6, -27.4], [-27.2, -29.6]]) b.span(x - 0.3, 0, z - 0.3, x + 0.3, cryptH, z + 0.3, 'pedra', { tint: 0x8f8a80 });
  for (const [x, z] of [[-44.6, -30.6], [-44.6, -24.6], [-36.6, -33.2], [-35.4, -22], [-25, -24], [-30.8, -22], [-31, -33.4]]) lamp(c, x, 1.4, z);
  // Stair from the crypt up to the incense court, through the well in the slab. Up there a low stone
  // parapet closes the well on three sides; the top of the flight comes out on the open east side.
  b.stairs('x', 1, -30.4, -33.55, -32.25, 0, TY, 'pedra', { tint: C.stone });
  const parapet = { tint: C.stoneDark };
  const pTop = TY + 0.85;
  b.span(well.x0 - 0.3, TY, well.z1, well.x1 - 1.0, pTop, well.z1 + 0.3, 'pedra', parapet);
  b.span(well.x0 - 0.3, TY, well.z0 - 0.3, well.x1 - 1.0, pTop, well.z0, 'pedra', parapet);
  b.span(well.x0 - 0.3, TY, well.z0, well.x0, pTop, well.z1, 'pedra', parapet);
  b.span(well.x0 - 0.35, pTop, well.z0 - 0.35, well.x1 - 0.95, pTop + 0.08, well.z0 + 0.02, 'pedra', { tint: C.stone, collide: false });
  b.span(well.x0 - 0.35, pTop, well.z1 - 0.02, well.x1 - 0.95, pTop + 0.08, well.z1 + 0.35, 'pedra', { tint: C.stone, collide: false });
  b.span(well.x0 - 0.35, pTop, well.z0, well.x0 + 0.02, pTop + 0.08, well.z1, 'pedra', { tint: C.stone, collide: false });
  for (const z of [well.z0 - 0.15, well.z1 + 0.15]) lamp(c, well.x1 - 1.15, pTop + 0.08, z);

  // --- Grand stairs, side stairs and the terrace's balustrade --------------------------------------
  const run = stairRun(TY);
  b.stairs('z', -1, -21 + run, -37.5, -31.5, 0, TY, 'pedra', stone);
  for (const x of [-37.85, -31.15]) {
    for (let k = 0; k < 4; k++) {
      const z0 = -21 + (k * run) / 4;
      const h = TY * (1 - k / 4) + 0.55;
      b.span(x - 0.35, 0, z0, x + 0.35, h, z0 + run / 4, 'pedra', { tint: C.stoneDark });
    }
  }
  b.stairs('x', -1, -24 + run, -32.4, -30.4, 0, TY, 'pedra', stone);
  railing(b, 'x', -21.06, -45, -37.9, TY, { tint: C.stoneDark });
  railing(b, 'x', -21.06, -31.1, -24, TY, { tint: C.stoneDark });
  railing(b, 'z', -24.06, -45, -32.5, TY, { tint: C.stoneDark });
  railing(b, 'z', -24.06, -30.3, -21, TY, { tint: C.stoneDark });

  // --- Incense court (on the terrace) --------------------------------------------------------------
  // The court's paving leaves the crypt's stairwell open.
  slab(b, rect(-44.6, -33.6, -24.4, -21.4), [well], TY, TY + 0.03, 'pedra', { tint: 0xcfc8b8, collide: false, castShadow: false });
  incenseBurner(b, -34.5, TY, -28.4, 1.25);
  // Paifang at the top of the stairs.
  {
    const z = -22.4;
    for (const x of [-37.6, -35.6, -33.4, -31.4]) {
      b.box(x, TY + 0.3, z, 0.8, 0.6, 0.8, 'pedra', stone);
      column(b, x, z, TY, TY + 4.6, 0.22);
    }
    b.span(-38.2, TY + 4.0, z - 0.25, -30.8, TY + 4.5, z + 0.25, 'pintura', { tint: C.beam });
    b.span(-38.25, TY + 3.95, z - 0.27, -30.75, TY + 4.02, z + 0.27, 'pintura', { tint: C.gold, collide: false });
    for (const side of [-1, 1]) plaque(c.scene, '祖廟', -34.5, TY + 3.5, z + side * 0.28, side > 0 ? 0 : Math.PI, 1.8, 0.6);
    for (const h of curvedRoof(b, { outer: rect(-38.9, z - 1.0, -30.1, z + 1.0), top: rect(-36.6, z, -32.4, z), eaveY: TY + 4.5, topY: TY + 5.5, curl: 0.6, ridges: true, collide: false })) c.lanterns.hang(h, 0.7);
  }
  // Bells on frames, statues, ceremonial tables, trees in planters, lanterns.
  for (const [i, x] of [-41.6, -27.4].entries()) {
    bellFrame(c, x, TY, -30.6, i);
    planterPine(c, x, -24.2);
  }
  for (const x of [-40.4, -36]) {
    b.span(x - 0.9, TY, -32.9, x + 0.9, TY + 0.85, -32.2, 'madeira', { tint: C.lacquerDark });
    incenseBurner(b, x, TY + 0.85, -32.55, 0.22);
  }
  vase(b, -44, TY, -32.8, 1.1);
  vase(b, -44, TY, -21.9, 1.1, 0x8a4a2f);
  stoneLantern(b, -40, -26.4, TY, c.glow);
  stoneLantern(b, -29, -26.4, TY, c.glow);

  // --- Temple: the ancestral hall, three tiers of roof ---------------------------------------------
  const floorY = TY + 0.5;
  const TZ = -39.4;
  const TD = 4.2;
  const back = TZ - TD + 0.1; // just inside the north wall
  const temple = pavilion(b, {
    cx: -34.5,
    cz: TZ,
    plinth: { h: floorY, margin: 0.8, steps: [] },
    stories: [{ hw: 7, hd: TD, h: 6.2, style: 'madeira', doors: { s: [-4, 0, 4], e: [0] }, windows: { w: [0], e: [-2.6] } }],
    roof: { overhang: 1.2, rise: 3.2, curl: 1.0 },
  });
  for (const h of temple.hooks) c.lanterns.hang(h, 1.0);
  b.stairs('z', -1, TZ + TD + 0.8 + stairRun(0.5, true), -37, -32, TY, 0.5, 'pedra', { ...stone, gentle: true });
  b.stairs('x', -1, -34.5 + 7 + 0.8 + stairRun(0.5, true), TZ - 1, TZ + 1, TY, 0.5, 'pedra', { ...stone, gentle: true });
  // Two lower tiers: eave skirts around the walls.
  const walls = rect(-34.5 - 7.08, TZ - TD - 0.08, -34.5 + 7.08, TZ + TD + 0.08);
  for (const h of curvedRoof(b, { outer: expand(walls, 1.2), top: walls, eaveY: floorY + 2.9, topY: floorY + 3.5, curl: 0.6, thickness: 0.14, collide: false })) c.lanterns.hang(h, 0.8);
  curvedRoof(b, { outer: expand(walls, 0.7), top: walls, eaveY: floorY + 4.9, topY: floorY + 5.4, curl: 0.5, thickness: 0.12, collide: false });
  // Inside: altar along the north wall, portraits, the golden dragon above, the gong, statues.
  b.span(-40, floorY, back, -29, floorY + 1.0, back + 0.9, 'madeira', { tint: C.lacquerDark });
  b.span(-40.1, floorY + 1.0, back - 0.05, -28.9, floorY + 1.06, back + 0.95, 'pintura', { tint: C.gold, collide: false });
  for (let k = 0; k < 5; k++) {
    const x = -38.5 + k * 2;
    b.span(x - 0.3, floorY + 1.06, back + 0.2, x + 0.3, floorY + 1.66, back + 0.35, 'pintura', { tint: 0x3a2a1a, collide: false });
    b.span(x - 0.24, floorY + 1.12, back + 0.36, x + 0.24, floorY + 1.6, back + 0.38, 'pintura', { tint: C.gold, collide: false, castShadow: false });
    b.cylinder(x + 0.6, floorY + 1.06, back + 0.6, 0.06, 0.18, 'pintura', { tint: 0xf2efe6, collide: false, segments: 6 });
  }
  for (const [x, i] of [[-39.6, 0], [-34.5, 1], [-29.4, 2]] as const) painting(c.scene, x, floorY + 2.9, back - 0.07, 0, 1.4, 1.9, (g, w, h) => portrait(g, w, h, i));
  const relief = dragonGeometry([-40.5, -38, -35.5, -33, -30.5, -28.6].map((x, i) => new THREE.Vector3(x, floorY + 4.6 + Math.sin(i * 1.5) * 0.4, back + 0.05)), 0.17, GOLDEN);
  c.scene.add(new THREE.Mesh(relief.geo, dragonMaterial()));
  const gong = new Gong(c.scene, b, -34.5, floorY, TZ - 1.2, c.props, () => c.sfx.at({ x: -34.5, y: floorY + 2, z: TZ - 1.2 }, 'loud', (s) => s.gong()));
  c.animate((dt) => gong.update(dt));
  for (const [x, z] of [[-40.6, TZ + 2.2], [-38.6, TZ - 0.6]]) incenseBurner(b, x, floorY, z, 0.45);
  for (const x of [-41, -28]) b.span(x - 0.5, floorY, TZ + TD - 0.8, x + 0.5, floorY + 2.3, TZ + TD - 0.4, 'madeira', { tint: C.lacquerDark });
  for (const x of [-37.4, -31.6]) c.lanterns.hang(new THREE.Vector3(x, floorY + 5.9, TZ), 1.2);

  // --- East path (to the bonsai garden), under the terrace's edge ---------------------------------
  pave(b, rect(-23.9, -44.7, -18.3, -21), 0xbdb5a3);
  stoneLantern(b, -19.2, -35.4, 0, c.glow);
  stoneLantern(b, -19.2, -40.6, 0, c.glow);
  rock(b, -21, 0, -42.8, 1.1, 1.3, 1.0, rand);
  rock(b, -19.4, 0, -26.4, 0.9, 1.1, 0.9, rand);
  vase(b, -23.3, 0, -34.8, 1.2, 0x8a4a2f);
  bench(b, -18.9, -30.2, 'z', 1.8);

  // --- Lower court: the stele, bell and drum pavilions, lions, old pines ----------------------------
  pave(b, rect(-44.7, -21, -18.3, -0.3), 0xc8c0ae);
  // The male on the visitor's left, the female on the right, as at a temple's gate.
  stoneLion(b, -39, -15.6, 0, 'macho');
  stoneLion(b, -30, -15.6, 0, 'femea');
  stele(c, -34.5, -7.6);
  ting(c, -41.4, -9.6, 2.1, { h: 2.9, base: 0.3, steps: ['s', 'e'] });
  hangingBell(c, -41.4, 0.3 + 2.9, -9.6);
  ting(c, -26.6, -6.4, 2.1, { h: 2.9, base: 0.3, steps: ['w', 'n'] });
  bigDrum(c, -26.6, 0.3, -6.4);
  pine(b, -44, 0, -17.6, 1.15, rand);
  pine(b, -25.4, 0, -18.4, 1.05, rand);
  pine(b, -20.6, 0, -2.6, 1.0, rand, { greens: [0xf7a8c4, 0xf2c1d6, 0xee8fb4], trunk: 0x5a3b2a });
  pine(b, -43.6, 0, -2.4, 0.95, rand);
  for (const [x, z, sx, sy, sz] of [[-30.6, -2.6, 1.1, 1.2, 1.0], [-21, -15, 1.0, 1.1, 1.0], [-44, -13.6, 0.9, 1.0, 0.9], [-38.6, -3.6, 0.8, 0.9, 0.8]]) rock(b, x, 0, z, sx, sy, sz, rand);
  for (const [x, z] of [[-38.4, -1.2], [-33.6, -1.2], [-19.2, -12.4], [-19.2, -7.6]]) stoneLantern(b, x, z, 0, c.glow);
  // Cover across the court, so the ring's gate doesn't look straight down to the west wall.
  rock(b, -30.2, 0, -11.6, 1.1, 1.2, 1.0, rand);
  rock(b, -36.6, 0, -12.2, 0.9, 1.0, 0.9, rand);
}

/** Stone tomb: a plinth and a lid (good cover in the crypt). */
function tomb(c: Ctx, x: number, z: number, along: 'x' | 'z') {
  const [sx, sz] = along === 'x' ? [2.2, 1.0] : [1.0, 2.2];
  c.b.box(x, 0.45, z, sx, 0.9, sz, 'pedra', { tint: 0x9d9a90 });
  c.b.box(x, 0.95, z, sx + 0.12, 0.12, sz + 0.12, 'pedra', { tint: 0x8f8a80, collide: false });
  c.b.box(x, 1.05, z, sx * 0.6, 0.1, sz * 0.6, 'pedra', { tint: 0x8f8a80, collide: false });
}

/** Bronze bell hanging in a wooden frame (on the terrace): rings and swings when shot. */
function bellFrame(c: Ctx, x: number, y: number, z: number, i: number) {
  const { b } = c;
  for (const s of [-1, 1]) b.box(x + s * 0.8, y + 1.3, z, 0.16, 2.6, 0.16, 'pintura', { tint: C.lacquer, physics: 'wood' });
  b.box(x, y + 2.55, z, 1.9, 0.16, 0.2, 'pintura', { tint: C.lacquer, collide: false });
  for (const s of [-1, 1]) b.box(x + s * 0.98, y + 2.62, z, 0.28, 0.1, 0.16, 'pintura', { tint: C.gold, collide: false, rot: new THREE.Euler(0, 0, s * 0.4) });
  const top = y + 2.47;
  const bell = new Bell(c.scene, b, x, top, z, 0.85, c.props, `sino:${i}`, () => c.sfx.at({ x, y: top - 0.7, z }, 'normal', (s) => s.bell(0.85)));
  c.animate((dt) => bell.update(dt));
}

/** A great bell hung from a beam across a pavilion: an obstacle (and cover) in the middle of it. Rings when shot. */
function hangingBell(c: Ctx, x: number, top: number, z: number) {
  c.b.span(x - 2.1, top - 0.32, z - 0.12, x + 2.1, top - 0.04, z + 0.12, 'pintura', { tint: C.lacquer, collide: false });
  const hook = top - 0.32;
  const bell = new Bell(c.scene, c.b, x, hook, z, 1.35, c.props, 'sino:2', () => c.sfx.at({ x, y: hook - 1, z }, 'loud', (s) => s.bell(1.35)));
  c.animate((dt) => bell.update(dt));
}

/** Big drum on a stand: booms when shot. */
function bigDrum(c: Ctx, x: number, y: number, z: number) {
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
  const hit = struck(c, 'tambor:0', { x, y: y + 1.55, z }, 'loud', (s) => s.drum(1));
  b.cuboidCollider(new THREE.Vector3(x, y + 1.5, z), new THREE.Vector3(0.55, 0.85, 0.85), new THREE.Quaternion(), 'wood', hit);
}

/** Memorial stele on a square stone base, in the middle of the lower court: it blocks the view up the stairs. */
function stele(c: Ctx, x: number, z: number) {
  const { b } = c;
  b.box(x, 0.4, z, 2.8, 0.8, 2.8, 'pedra', { tint: 0x9d9a90 });
  b.box(x, 0.74, z, 2.86, 0.06, 2.86, 'pedra', { tint: 0x8f8a80, collide: false, castShadow: false });
  b.box(x, 2.55, z, 2.4, 3.5, 0.55, 'pedra', { tint: 0xb4ae9f });
  // The inscription, in columns read top to bottom, right to left: "I fucked the ass of whoever is reading
  // this" (the pt-BR joke "comi o cu de quem tá lendo"; 操 carries the slang meaning that 吃, "eat", wouldn't).
  for (const side of [-1, 1]) inscription(c.scene, ['我操了正在', '读这句话的', '人的屁眼'], x, 2.7, z + side * 0.285, side > 0 ? 0 : Math.PI, 1.5, 2.7);
}

function planterPine(c: Ctx, x: number, z: number) {
  c.b.box(x, TY + 0.4, z, 1.6, 0.8, 1.6, 'pedra', { tint: C.stoneDark });
  pine(c.b, x, TY + 0.8, z, 0.7, c.rand);
}

/** Ancestor portrait: a robed figure on silk, three different ones. */
function portrait(g: CanvasRenderingContext2D, w: number, h: number, i: number) {
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
