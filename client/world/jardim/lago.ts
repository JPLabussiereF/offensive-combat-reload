// Lago de Lótus (north-east, x 18..45, z -45..0): a big lake that never fills the sector.
// In the middle, the island with a two-story pavilion (balcony all around: the high-value spot), reached
// by the arched stone bridge from the west bank or by the old wooden bridge from the south bank. The tea
// house stands half over the water on the north shore. Wooden platforms jut out over the lake, reeds and
// lotus break the views, and the dragon fountain sits on its own islet (it breathes fire when shot).
import * as THREE from 'three';
import { column, dragonGeometry, dragonMaterial, FireBreath, ORIENTAL as C, pavilion, pine, railing, rock, stoneLantern, type DragonColors } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import { archBridge, basin, bench, type Ctx, deck, hedge, lilies, lowTable, rect, reeds, signBoard, ting } from './kit';

/** The fountain dragon's colors. */
export const JADE: DragonColors = { body: 0x2fae7a, bodyDark: 0x23895f, belly: 0xf2d98a, spikes: 0xe7b847, horns: 0xf2d98a };

export function buildLago(c: Ctx) {
  const { b, rand } = c;
  const LAKE = rect(22.5, -40.5, 42, -8);
  c.holes.push(LAKE);
  basin(c, LAKE, 0.8, { coping: ['s', 'e', 'w'] });
  const cope = { tint: C.stone, castShadow: false };
  b.span(LAKE.x0 - 0.5, 0, LAKE.z0 - 0.5, 26, 0.12, LAKE.z0, 'pedra', cope);
  b.span(38, 0, LAKE.z0 - 0.5, LAKE.x1 + 0.5, 0.12, LAKE.z0, 'pedra', cope);
  lilies(c, rect(23, -38, 28, -28), 10);
  lilies(c, rect(37, -27, 41.5, -18), 9);
  lilies(c, rect(23, -17, 32, -9), 12);
  lilies(c, rect(36, -38, 41, -33), 6);
  for (const [x, z, n, r] of [[24.6, -34.5, 14, 1.0], [40.4, -24.5, 14, 1.1], [25.6, -15.4, 12, 0.9], [37.2, -31, 10, 0.9], [29.8, -11.2, 10, 0.8], [41, -9.8, 8, 0.8]]) reeds(c, x, z, n, r);

  // --- Island and its pavilion ---------------------------------------------------------------------
  const ISLAND = rect(28, -27.5, 37, -18.5);
  b.span(ISLAND.x0, -1.1, ISLAND.z0, ISLAND.x1, 0, ISLAND.z1, 'pedra', { tint: C.stone });
  const trim = { tint: C.stoneDark, collide: false, castShadow: false };
  b.span(ISLAND.x0 - 0.05, -0.14, ISLAND.z0 - 0.05, ISLAND.x1 + 0.05, -0.02, ISLAND.z1 + 0.05, 'pintura', trim);
  const isle = pavilion(b, {
    cx: 32.5,
    cz: -23,
    plinth: { h: 0.45, margin: 0.5, steps: ['w', 's', 'e'] },
    stories: [
      { hw: 2.8, hd: 2.8, h: 3.2, style: 'papel', doors: { s: [0], e: [0], w: [0] }, stairs: [{ side: 'n', dir: 1, from: -2.2 }] },
      { hw: 2.8, hd: 2.8, h: 3.0, style: 'madeira', doors: { s: [0], e: [0], w: [0] }, balcony: { depth: 1.2, sides: ['n', 's', 'e', 'w'] }, skirt: 0.8 },
    ],
    roof: { overhang: 1.2, rise: 2.4, curl: 0.9 },
  });
  for (const h of isle.hooks) c.lanterns.hang(h, 0.8);
  lowTable(c, 31.2, isle.floors[0], -21.4, 1.0, 0.7);
  for (const [x, z, s] of [[28.4, -27, 0.8], [36.6, -27.1, 0.9], [36.7, -18.9, 0.7], [28.3, -19, 0.9]]) rock(b, x, 0, z, s, s * 0.8, s * 0.8, rand);

  // --- Bridges -------------------------------------------------------------------------------------
  archBridge(c, 'x', 21.4, 28.6, -23, 2.2, 0.9);
  // The old wooden bridge (south bank -> island): low, plain railings, a wooden screen on half of it.
  deck(c, rect(33.6, -18.7, 35.6, -7.6), 0.25, -0.8, 0x7a4a2c);
  for (let z = -18.2; z < -8; z += 1.3) b.span(33.62, 0.25, z, 35.58, 0.27, z + 0.22, 'madeira', { tint: 0x5a3420, collide: false, castShadow: false });
  railing(b, 'z', 33.66, -18.6, -7.7, 0.25, { h: 0.85, tint: C.woodDark });
  railing(b, 'z', 35.54, -18.6, -16.2, 0.25, { h: 0.85, tint: C.woodDark });
  b.span(35.48, 0.25, -16.2, 35.62, 1.45, -10.8, 'madeira', { tint: C.woodDark });
  railing(b, 'z', 35.54, -10.8, -7.7, 0.25, { h: 0.85, tint: C.woodDark });
  // Lantern posts at the bridge ends.
  lanternPost(c, 21.2, -24.6, 0, -1);
  lanternPost(c, 21.2, -21.4, 0, 1);
  lanternPost(c, 33.2, -7.2, -1, 0);

  // --- Platforms over the water --------------------------------------------------------------------
  deck(c, rect(38, -33.2, 42.4, -29.6), 0.3);
  railing(b, 'x', -33.14, 38, 42, 0.3, { h: 0.8, tint: C.woodDark });
  railing(b, 'z', 38.06, -33.2, -29.6, 0.3, { h: 0.8, tint: C.woodDark });
  deck(c, rect(22.1, -14.4, 26, -10.6), 0.3);
  railing(b, 'z', 25.94, -14.4, -10.6, 0.3, { h: 0.8, tint: C.woodDark });

  // --- Tea house, half over the water --------------------------------------------------------------
  const tea = pavilion(b, {
    cx: 32,
    cz: -41.8,
    plinth: { h: 0.4, margin: 0.5, steps: ['e', 'w'] },
    stories: [{ hw: 5.5, hd: 2.6, h: 3.2, style: 'papel', sideStyle: { n: 'madeira' }, doors: { s: [-3, 3], e: [0], w: [0] } }],
    roof: { overhang: 1.2, rise: 2.2, curl: 0.8 },
  });
  for (const h of tea.hooks) c.lanterns.hang(h, 0.8);
  for (let x = 26.4; x <= 37.6; x += 2.8) b.cylinder(x, -0.8, LAKE.z0 + 1.2, 0.12, 0.8, 'madeira', { tint: C.woodDark, collide: false, segments: 6 });
  // Veranda over the lake in front of the two south doors.
  deck(c, rect(26.5, -38.7, 37.5, -36.5), 0.4);
  railing(b, 'x', -36.56, 26.5, 37.5, 0.4, { h: 0.85 });
  railing(b, 'z', 26.56, -38.7, -36.5, 0.4, { h: 0.85 });
  railing(b, 'z', 37.44, -38.7, -36.5, 0.4, { h: 0.85 });
  lowTable(c, 29, 0.4, -42.4, 1.2, 0.7);
  lowTable(c, 35, 0.4, -42.4, 1.2, 0.7);
  lowTable(c, 32, 0.4, -40.6, 1.0, 0.6);

  // --- The dragon fountain on its islet ------------------------------------------------------------
  dragonFountain(c, 39, -14);

  // --- Banks: trees, rocks, a small pavilion on the south bank, lanterns ---------------------------
  ting(c, 40.5, -3.8, 1.8, { h: 2.6 });
  bench(b, 40.5, -3.8, 'x', 1.8);
  pine(b, 20.4, 0, -43, 1.0, rand);
  pine(b, 20.2, 0, -16.6, 0.9, rand, { greens: [0xf7a8c4, 0xf2c1d6, 0xee8fb4], trunk: 0x5a3b2a });
  pine(b, 43.6, 0, -27, 0.85, rand);
  pine(b, 26.4, 0, -3.4, 1.0, rand);
  pine(b, 43.4, 0, -42.8, 0.9, rand);
  for (const [x, z, sx, sy, sz] of [
    [20.4, -36.6, 1.0, 1.2, 1.0], [20.6, -31.4, 0.8, 0.9, 0.8], [20.4, -19.6, 1.0, 1.0, 1.0],
    [36.2, -4.6, 1.0, 1.1, 1.0], [23.6, -5.2, 1.2, 1.0, 1.0], [35.2, -1.8, 0.8, 0.9, 0.8],
  ]) {
    rock(b, x, 0, z, sx, sy, sz, rand);
  }
  // Half in the water along the narrow east bank, leaving the path free.
  for (const [z, s] of [[-36.4, 0.7], [-20.4, 0.8], [-9.2, 0.7]]) rock(b, 42.2, -0.4, z, s, s * 1.2, s, rand);
  hedge(b, 27.6, -6.4, 32.4, -5.6, 1.1);
  for (const [x, z] of [[19.4, -7.4], [19.4, -12.6], [44.2, -12], [21.2, -40.6], [27.6, -1.4]]) stoneLantern(b, x, z, 0, c.glow);
  signBoard(c, ['PROIBIDO', 'acordar o dragão', '(ele cospe fogo)'], 43.9, -15.8, Math.PI / 2, '#ffd23f', '#1b1530', 2.2);
}

function lanternPost(c: Ctx, x: number, z: number, ax: number, az: number) {
  column(c.b, x, z, 0, 3.3, 0.09);
  c.b.box(x + ax * 0.42, 3.22, z + az * 0.42, ax ? 0.9 : 0.08, 0.08, az ? 0.9 : 0.08, 'pintura', { tint: C.lacquer, collide: false });
  c.lanterns.hang(new THREE.Vector3(x + ax * 0.78, 3.18, z + az * 0.78), 0.75);
}

/**
 * Rock islet with a round basin and the jade dragon coiled up its pillar, looking west at the island. It
 * spits water into the basin; shot, it roars fire (synchronized online through the prop bus).
 */
function dragonFountain(c: Ctx, cx: number, cz: number) {
  const { b } = c;
  b.span(cx - 2.2, -1.1, cz - 2.4, cx + 2.2, 0.3, cz + 2.4, 'pedra', { tint: C.rock });
  for (const [x, z] of [[-1.8, -2.0], [1.8, -2.0], [1.8, 2.0], [-1.8, 2.0]]) rock(b, cx + x, 0.3, cz + z, 0.5, 0.55, 0.5, c.rand);
  // The stepping stone from the east bank.
  b.cylinder(cx + 2.9, -0.8, cz, 0.5, 0.95, 'pedra', { tint: C.stoneDark, segments: 9 });
  const r = 1.55;
  const y0 = 0.3;
  const h = 0.5;
  const segs = 16;
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    b.box(cx + Math.cos(a) * r, y0 + h / 2, cz + Math.sin(a) * r, 0.32, h, ((2 * Math.PI * r) / segs) * 1.08, 'pedra', { tint: C.stone, rot: new THREE.Euler(0, -a, 0) });
  }
  b.addGeometry(new THREE.TorusGeometry(r, 0.19, 5, segs * 2).rotateX(Math.PI / 2).translate(cx, y0 + h, cz), surfaceMaterial('pedra'), C.stone);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(r - 0.1, 28).rotateX(-Math.PI / 2), c.water);
  pool.position.set(cx, 0.68, cz);
  c.scene.add(pool);
  b.cylinder(cx, y0, cz, 0.3, 2.1, 'pedra', { tint: C.stoneDark, segments: 10 });

  const fountain = dragonGeometry(dragonCoil(cx, cz), 0.19, JADE);
  const dragon = new THREE.Mesh(fountain.geo, dragonMaterial());
  dragon.castShadow = true;
  c.scene.add(dragon);
  const fire = new FireBreath(c.scene);
  const shot = c.props.register('dragao', () => {
    if (!fire.active) c.sfx.at(fountain.mouth, 'loud', (s) => s.roar());
    fire.start(fountain.mouth, fountain.forward.clone().setY(0.12));
  });
  b.cuboidCollider(new THREE.Vector3(cx, 1.4, cz), new THREE.Vector3(0.9, 1.1, 0.9), new THREE.Quaternion(), 'concrete', shot);
  b.ballCollider(fountain.mouth.clone().addScaledVector(fountain.forward, -0.35), 0.45, 'concrete', shot);
  let spout = 0;
  c.animate((dt) => {
    fire.update(dt);
    if (fire.active) return;
    spout += dt * 40;
    const f = fountain.forward;
    while (spout >= 1) {
      spout--;
      c.drops.emit(fountain.mouth, f.x * 0.4 + (Math.random() - 0.5) * 0.25, 2.6 + Math.random() * 0.8, f.z * 0.4 + (Math.random() - 0.5) * 0.25, 0.68);
    }
  });
}

/**
 * The fountain dragon's path (tail first, head last) for dragonGeometry: coiled up its pillar at (cx, cz),
 * turning so the head ends up looking west (-X).
 */
export function dragonCoil(cx: number, cz: number): THREE.Vector3[] {
  const coil: THREE.Vector3[] = [];
  const turns = 1.6;
  const a0 = Math.PI - turns * Math.PI * 2 - 1.2;
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const a = a0 + u * turns * Math.PI * 2;
    coil.push(new THREE.Vector3(cx + Math.cos(a) * 0.7, 0.55 + u * 1.8, cz + Math.sin(a) * 0.7));
  }
  const aEnd = a0 + turns * Math.PI * 2;
  const look = aEnd + 1.2;
  coil.push(
    new THREE.Vector3(cx + Math.cos(aEnd + 0.6) * 0.75, 2.75, cz + Math.sin(aEnd + 0.6) * 0.75),
    new THREE.Vector3(cx + Math.cos(look) * 0.3, 3.25, cz + Math.sin(look) * 0.3),
    new THREE.Vector3(cx + Math.cos(look) * 0.65, 3.35, cz + Math.sin(look) * 0.65),
  );
  return coil;
}
