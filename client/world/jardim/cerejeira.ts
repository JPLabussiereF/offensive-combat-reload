// The Dragon Cherry tree, in the middle of the house's courtyard (conversao/jardimSetores.ts): an old cherry in a raised
// bed of mossy earth held by a low stone curb. A gnarled trunk whose roots spread over the earth and sink
// into it, four great limbs reaching out over the courtyard with smaller branches, crowns of blossom at their
// ends. Red lanterns hang from the limbs and pairs of cherries from the blossom (shot or stabbed, they're
// cut in half: HangingCherries); fallen petals are strewn over the bed and the paving around it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { foliageCrown, foliageUnder, leafClump, limb, ORIENTAL as C, rock, seeded, type Clump } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import { HangingCherries } from './frutas';
import type { Ctx } from './kit';

const BLOSSOM = [0xf7a8c4, 0xf2c1d6, 0xee8fb4, 0xfbd0de] as const;
const BARK = 0x5a3b2a;
/** The bed: radius of its earth (and collider) and the earth's height, where you stand on it. */
export const BED_R = 2.84;
export const BED_Y = 0.36;
const CURB_R = 2.92;
const CURB_TOP = 0.44;
/** Height of the courtyard's paving (pave() in kit.ts). */
const PAVING_Y = 0.03;

export interface CherryTree {
  /** Crown centers and horizontal radii (the collectible falls back from the nearest). */
  crowns: { p: THREE.Vector3; r: number }[];
  fruit: HangingCherries;
}

/** `seed`: the tree's own randomness (the same on every client, whatever is built before it). */
export function dragonCherryTree(c: Ctx, x: number, z: number, seed = 5150): CherryTree {
  const { b } = c;
  const rand = seeded(seed);

  // --- The bed: stone curb, mossy earth (it collides up to where you stand), a few stones -----------
  const curb = new THREE.LatheGeometry(
    // Up the outside, over the top, down the inside: the lathe's faces look out of the stone.
    [[CURB_R, 0], [CURB_R, CURB_TOP - 0.04], [CURB_R - 0.04, CURB_TOP], [2.56, CURB_TOP], [2.52, CURB_TOP - 0.04], [2.52, 0.24]].map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  ).translate(x, 0, z);
  const curbUv = curb.getAttribute('uv') as THREE.BufferAttribute;
  // The lathe's own UVs, in meters: around the ring and up its profile.
  for (let i = 0; i < curbUv.count; i++) curbUv.setXY(i, curbUv.getX(i) * Math.PI * 2 * CURB_R, curbUv.getY(i) * 1.2);
  b.addGeometry(curb, surfaceMaterial('pedra'), C.stone);
  curb.dispose();
  b.cylinder(x, 0, z, BED_R, BED_Y, 'grama', { tint: 0x6f8f3e, segments: 36, castShadow: false });
  for (const [a, s] of [[0.5, 0.32], [2.3, 0.26], [3.9, 0.36], [5.3, 0.24]]) rock(b, x + Math.cos(a) * 2.2, BED_Y - 0.1, z + Math.sin(a) * 2.2, s, s * 0.7, s * 0.9, rand, C.rock, false);

  // --- Trunk and roots ------------------------------------------------------------------------------
  const trunkPts = [[0, 0.15, 0], [0.14, 1.1, -0.1], [-0.12, 2.0, 0.12], [0.1, 2.75, 0.02]].map(([dx, y, dz]) => new THREE.Vector3(x + dx, y, z + dz));
  const trunk = limb(b, trunkPts, 0.5, 0.3, BARK);
  b.cuboidCollider(new THREE.Vector3(x, 1.8, z), new THREE.Vector3(0.4, 1.45, 0.4), new THREE.Quaternion(), 'wood', undefined, 'trunk');
  // Roots: out of the trunk's foot, over the earth, then down into it.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rand() * 0.5;
    const reach = 1.3 + rand() * 0.8;
    const at = (r: number, y: number, bend = 0) => new THREE.Vector3(x + Math.cos(a + bend) * r, y, z + Math.sin(a + bend) * r);
    limb(b, [at(0.15, BED_Y + 0.75), at(0.5, BED_Y + 0.3), at(reach * 0.6, BED_Y + 0.08, 0.1), at(reach, BED_Y - 0.25, 0.2)], 0.2, 0.05, BARK, false);
  }

  // --- Limbs, branches and their crowns -------------------------------------------------------------
  const crowns: { p: THREE.Vector3; r: number }[] = [];
  const clumps: Clump[] = [];
  const mains: Clump[] = [];
  const lanternHooks: THREE.Vector3[] = [];
  const Y0 = 3.1;
  const Y1 = 6.3;
  const crown = (p: THREE.Vector3, r: number) => {
    // Every bump in any detail: the cherries hang from them (the same fruit on every client, PF-35).
    const cl = foliageCrown(b, p, r, BLOSSOM, { flat: 0.55, y0: Y0, y1: Y1, blossom: true, allBumps: true });
    clumps.push(...cl);
    mains.push(cl[0]);
    crowns.push({ p: p.clone(), r });
  };
  const fork = trunk.getPoint(0.92);
  const base = rand() * Math.PI * 2;
  const limbs: THREE.CatmullRomCurve3[] = [];
  for (let k = 0; k < 4; k++) {
    const a = base + (k / 4) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const out = (r: number, y: number) => fork.clone().addScaledVector(dir, r).setY(y);
    const reach = 2.8 + rand() * 0.5;
    const curve = limb(b, [fork.clone(), out(reach * 0.33, 3.35), out(reach * 0.7, 4.0), out(reach, 4.35 + rand() * 0.25)], 0.22, 0.07, BARK);
    limbs.push(curve);
    crown(curve.getPoint(1).add(new THREE.Vector3(0, 0.25, 0)), 1.2 + rand() * 0.15);
    // Two smaller branches off the outer half, to either side.
    for (const [t, side] of [[0.7, 1], [0.88, -1]] as const) {
      const from = curve.getPoint(t);
      const ba = a + side * (0.75 + rand() * 0.3);
      const len = 1.3 + rand() * 0.35;
      const to = from.clone().add(new THREE.Vector3(Math.cos(ba) * len, -0.1 + rand() * 0.35, Math.sin(ba) * len));
      const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.18, 0));
      limb(b, [from, mid, to], 0.085, 0.035, BARK);
      crown(to.clone().add(new THREE.Vector3(0, 0.2, 0)), 0.85 + rand() * 0.2);
    }
  }
  // The leader: up from the fork to the crown on top.
  const top = trunkPts[3].clone().add(new THREE.Vector3(-0.15, 2.3, 0.1));
  limb(b, [fork.clone(), fork.clone().lerp(top, 0.5).add(new THREE.Vector3(0.2, 0, -0.1)), top], 0.2, 0.08, BARK);
  crown(top.clone().add(new THREE.Vector3(0, 0.3, 0)), 1.5);

  // --- Lanterns, hung from the limbs where no blossom is in the way --------------------------------
  const DROP = 0.65;
  const clear = (body: THREE.Vector3) =>
    mains.every((m) => {
      const u = (body.x - m.x) / (m.rx * 1.2 + 0.45);
      const v = (body.y - m.y) / (m.ry * 1.2 + 0.45);
      const w = (body.z - m.z) / (m.rz * 1.2 + 0.45);
      return u * u + v * v + w * w > 1;
    });
  for (const curve of limbs) {
    for (const t of [0.5, 0.44, 0.56, 0.38]) {
      const hook = curve.getPoint(t).add(new THREE.Vector3(0, -0.12, 0));
      if (!clear(hook.clone().setY(hook.y - DROP))) continue;
      lanternHooks.push(hook);
      c.lanterns.hang(hook, DROP);
      break;
    }
  }

  // --- Cherries: pairs hanging from the underside of the blossom -----------------------------------
  const spots: { at: THREE.Vector3; yaw: number }[] = [];
  for (const m of mains) {
    const n = m.rx > 1.2 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * m.rz * 0.55;
      const under = foliageUnder(clumps, m.x + Math.cos(a) * d, m.z + Math.sin(a) * d);
      // Up into the leaves a little: the stem comes out of them, never off their surface.
      if (!under || under.y < 2.6) continue;
      const at = under.add(new THREE.Vector3(0, 0.05, 0));
      if (lanternHooks.some((h) => Math.hypot(h.x - at.x, h.z - at.z) < 0.6)) continue;
      spots.push({ at, yaw: rand() * Math.PI * 2 });
    }
  }
  const groundAt = (px: number, pz: number) => (Math.hypot(px - x, pz - z) < BED_R ? BED_Y : PAVING_Y);
  const fruit = new HangingCherries(c.scene, spots, c.props, groundAt, (at) => c.sfx.at(at, 'normal', (s) => s.fruitSplat()));
  c.animate((dt) => fruit.update(dt));

  // --- Moss and fallen petals ------------------------------------------------------------------------
  for (let k = 0; k < 9; k++) {
    const a = rand() * Math.PI * 2;
    const r = 0.8 + rand() * 1.5;
    const s = 0.14 + rand() * 0.12;
    leafClump(b, x + Math.cos(a) * r, BED_Y, z + Math.sin(a) * r, s * 1.4, s * 0.5, s * 1.2, rand() < 0.5 ? 0x5d8a3a : 0x6b9a40, { castShadow: false, detail: 1, rough: 0.3 });
  }
  const petals: THREE.BufferGeometry[] = [];
  const petal = (px: number, py: number, pz: number) => {
    const g = new THREE.CircleGeometry(1, 6).rotateX(-Math.PI / 2).scale(0.05 + rand() * 0.03, 1, 0.035 + rand() * 0.015).rotateY(rand() * Math.PI).translate(px, py, pz);
    g.deleteAttribute('uv');
    const sh = new Float32Array(g.getAttribute('position').count).fill(0.85 + rand() * 0.3);
    g.setAttribute('shade', new THREE.BufferAttribute(sh, 1));
    petals.push(g);
  };
  for (let k = 0; k < 90; k++) {
    const a = rand() * Math.PI * 2;
    const r = 0.6 + rand() * 1.85;
    petal(x + Math.cos(a) * r, BED_Y + 0.006, z + Math.sin(a) * r);
  }
  // Thinning out from the curb toward the courtyard's edges.
  for (let k = 0; k < 320; k++) {
    const a = rand() * Math.PI * 2;
    const r = CURB_R + 0.1 + Math.pow(rand(), 1.8) * 4.2;
    petal(x + Math.cos(a) * r, PAVING_Y + 0.004 + rand() * 0.002, z + Math.sin(a) * r);
  }
  const merged = mergeGeometries(petals, false)!;
  petals.forEach((g) => g.dispose());
  b.addGeometry(merged, surfaceMaterial('pintura'), 0xf6b3cb, false);
  merged.dispose();

  return { crowns, fruit };
}
