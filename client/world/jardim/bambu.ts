// Vale do Bambu (south-west, x -45..-18, z 0..45): the wild part of the estate, made for ambushes.
// Bamboo groves (solid: you go around them) carve three ways through the north half: the upper path,
// quick and fairly open, from the sanctuary's gate to the ring; the central one, winding between groves;
// and, in the north-west corner, a short stretch of dense bamboo with narrow lanes where you hear more
// than you see. A stream crosses the valley under a wooden bridge: walk its bed and you pass under the
// bridge unseen (the lower path), out to the gardener's house (a panda sits by it, eating bamboo) and the
// warriors' moon gate.
import { stairRun } from '../mapBuilder';
import { pavilion, pine, rock, stoneLantern, ORIENTAL as C } from '../oriental';
import { archBridge, bambooGrove, basin, bench, crate, type Ctx, lilies, rect, reeds, steppingPath, vase } from './kit';
import { panda } from './panda';

export function buildBambu(c: Ctx) {
  const { b, rand } = c;

  // --- Stream (east-west, z 25..28.5), its bed 1.2 m down, steps in and out ------------------------
  const STREAM = rect(-45, 25, -18.3, 28.5);
  c.holes.push(STREAM);
  basin(c, STREAM, 1.2, { coping: ['n', 's'], waterY: -0.78, floor: 0x5f6b58 });
  lilies(c, rect(-44, 25.4, -36, 28.1), 5, -0.765);
  const run = stairRun(1.2, true);
  // North and south flights side by side (facing each other they would meet in a V with no way out).
  for (const [xn, xs] of [[-43.4, -41.4], [-21.6, -23.6]]) {
    b.stairs('z', -1, STREAM.z0 + run, xn, xn + 1.3, -1.2, 1.2, 'pedra', { tint: C.stone, gentle: true });
    b.stairs('z', 1, STREAM.z1 - run, xs, xs + 1.3, -1.2, 1.2, 'pedra', { tint: C.stone, gentle: true });
  }
  for (const [x, z, s] of [[-39, 25.2, 0.8], [-35.6, 28.3, 0.7], [-26.4, 25.1, 0.9], [-27, 28.3, 0.7], [-44.5, 26.8, 0.8]]) rock(b, x, -1.1, z, s, s * 0.9, s * 0.8, rand);
  reeds(c, -37.4, 27.6, 10, 0.7, -1.2);
  reeds(c, -24.8, 25.8, 10, 0.7, -1.2);
  // The wooden bridge: high enough in the middle to walk under it along the stream bed.
  archBridge(c, 'z', 22.2, 31.3, -31, 2.4, 1.05, 0, C.wood, 'madeira');

  // --- Groves --------------------------------------------------------------------------------------
  // North-west corner: the dense stretch (narrow lanes between five groves).
  bambooGrove(c, rect(-45, 0.3, -40, 6), 1.0);
  bambooGrove(c, rect(-45, 8, -41.6, 13), 1.15);
  bambooGrove(c, rect(-39.4, 8.4, -36.6, 12.6), 1.15);
  bambooGrove(c, rect(-45, 15, -40.6, 20), 1.15);
  bambooGrove(c, rect(-38.6, 14.6, -34.6, 19.4), 1.15);
  // Between the upper and the central paths, and along the stream.
  bambooGrove(c, rect(-32, 5.6, -27, 9.2), 0.9);
  bambooGrove(c, rect(-33, 12.6, -28.4, 17), 0.9);
  bambooGrove(c, rect(-25, 13, -19.2, 18), 0.9);
  bambooGrove(c, rect(-29.6, 20.2, -24.4, 23.6), 0.9);
  bambooGrove(c, rect(-44.7, 21.2, -40.4, 24.2), 0.9);
  // South half.
  bambooGrove(c, rect(-45, 30.2, -40.4, 35.2), 0.9);
  bambooGrove(c, rect(-27, 33, -22.4, 37.6), 0.9);
  bambooGrove(c, rect(-35.6, 40, -31.4, 44.7), 0.9);

  // --- Paths ---------------------------------------------------------------------------------------
  steppingPath(c, [[-36, 0.8], [-33, 3], [-27, 4.4], [-22, 8], [-18.8, 10]]);
  steppingPath(c, [[-34.6, 3.4], [-35.4, 7], [-33.8, 11], [-27.2, 11.4], [-26.6, 18.8], [-31, 21.6]]);
  steppingPath(c, [[-31, 31.6], [-29, 34.6], [-28.2, 38.6], [-22.4, 40.6], [-18.8, 41]]);
  steppingPath(c, [[-31, 31.6], [-35.4, 34], [-37.4, 38.4]]);

  // --- Gardener's house (south-west) ---------------------------------------------------------------
  pavilion(b, {
    cx: -40.6,
    cz: 40.8,
    stories: [{ hw: 2.8, hd: 2.6, h: 3.0, style: 'madeira', doors: { e: [0], n: [1.2] }, windows: { e: [-1.6] } }],
    roof: { overhang: 0.6, rise: 1.6, curl: 0.5 },
  });
  // Shelves of pots, a table, seed sacks, tools against the wall.
  b.span(-43.2, 0, 38.4, -42.6, 1.9, 43.2, 'madeira', { tint: C.woodDark });
  for (let k = 0; k < 4; k++) vase(b, -42.9, 1.9, 38.9 + k * 1.2, 0.45, k % 2 ? 0x8a4a2f : 0x6b4a32);
  b.span(-41, 0, 42, -39, 0.8, 42.9, 'madeira', { tint: C.wood });
  for (const [x, z] of [[-38.3, 42.8], [-38.2, 39]]) b.cylinder(x, 0, z, 0.25, 0.6, 'pintura', { tint: 0xc9b48a, segments: 8 });
  for (let k = 0; k < 3; k++) b.box(-41.6 + k * 0.4, 0.8, 43.15, 0.05, 1.6, 0.05, 'madeira', { tint: 0x6b4a32, collide: false });
  crate(b, -36.6, 0, 43.6, 0.8, 0.3);
  crate(b, -37.2, 0, 37.6, 0.7, 0.1);
  bench(b, -36.2, 40.6, 'z', 1.6);
  // The panda: sitting against the house's north wall, beside the door, eating bamboo.
  panda(c, -42.2, 37.0, Math.PI);

  // --- Rocks, a few pines, lanterns ----------------------------------------------------------------
  for (const [x, z, sx, sy, sz] of [
    [-30.4, 2.2, 1.0, 1.1, 0.9], [-23, 4.6, 0.9, 1.0, 0.9], [-20.4, 20.2, 0.8, 0.9, 0.8], [-36.2, 22.4, 1.1, 1.2, 1.0],
    [-21.6, 22.6, 1.0, 1.1, 1.0], [-34, 31.6, 0.9, 1.0, 0.9], [-24, 31.4, 1.1, 1.0, 1.0], [-20.4, 34, 0.8, 0.9, 0.8], [-38.6, 7, 0.6, 0.7, 0.6],
  ]) {
    rock(b, x, 0, z, sx, sy, sz, rand);
  }
  pine(b, -23.4, 0, 1.8, 0.9, rand);
  pine(b, -27.4, 0, 29.8, 0.85, rand);
  pine(b, -21, 0, 44, 0.8, rand);
  for (const [x, z] of [[-34, 1.2], [-38, 1.2], [-19.2, 7.8], [-19.2, 12.2], [-33, 30.2], [-29, 30.2], [-19.4, 38.6]]) stoneLantern(b, x, z, 0, c.glow);
  // A small roadside shrine in the dense stretch.
  b.span(-44.6, 0, 13.6, -43.6, 0.9, 14.4, 'pedra', { tint: C.stone });
  stoneLantern(b, -44.1, 14, 0.9, c.glow);
}
