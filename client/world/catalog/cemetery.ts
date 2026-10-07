// "Cemitério da Capela" pieces: the churchyard wall (a low stone base that stops bullets, iron bars above it
// that bullets fly through and nobody climbs, thorns on its rails, a pillar every few metres) and its stone
// pillars; and the thorns a hedge piece can have (`espinhos`).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SpatialSfx } from '../../audio/spatial';
import type { MapBuilder } from '../mapBuilder';
import { surfaceMaterial } from '../surfaces';
import { blocker, SPOOKY as C } from '../halloween';
import { seeded, solidIntervals } from '../oriental';
import { at, P, V, type Adapter } from './types';

export interface CemeterySfx extends SpatialSfx {
  bulbPop(): void;
  ambientCrow(): void;
  ambientHowl(): void;
}

/** The wall: a low stone base up to BASE_H (stops bullets; low enough to see the field beyond it), iron bars up to TOP; T thick. */
const BASE_H = 0.6;
const TOP = 2.4;
const T = 0.5;
const WALL_TINT = 0x6f6a62;
const PILLAR_TINT = 0x5e5a54;

export const cemetery: Record<string, Adapter> = {
  muroCemiterio(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; de: number; ate: number }>(p);
    churchyardWall(c.b, q.eixo, q.fixo, q.de, q.ate);
  },
  pilarCemiterio(c, p) {
    const q = P<{ largura: number; altura: number }>(p);
    const [x, , z] = at(p);
    pillar(c.b, x, z, q.largura, q.altura);
  },
};

function pillar(b: MapBuilder, x: number, z: number, w: number, h: number) {
  b.box(x, h / 2, z, w, h, w, 'pedra', { tint: PILLAR_TINT });
  b.box(x, h + 0.06, z, w + 0.14, 0.12, w + 0.14, 'pedra', { tint: 0x7d786f, collide: false });
}

/**
 * Thorns along a line (the wall's rails, the hedge's face): pale spikes leaning out along `out` (and against it
 * too when `both`), merged into one mesh. They hurt whoever climbs there in the zumbi mode (ZOMBIE.espinhos,
 * thornsAt in shared/barricades.ts); here they only show it. Their own random: the piece's decides where the
 * graves stand (colliders and the navmesh), so it mustn't move.
 */
function thorns(b: MapBuilder, rand: () => number, from: THREE.Vector3, to: THREE.Vector3, out: THREE.Vector3, step: number, both: boolean) {
  const spike = new THREE.ConeGeometry(0.022, 0.13, 4, 1, true).translate(0, 0.065, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const d = new THREE.Vector3();
  const along = to.clone().sub(from);
  const n = Math.max(1, Math.round(along.length() / step));
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i <= n; i++) {
    const p = from.clone().addScaledVector(along, i / n);
    for (const side of both ? [1, -1] : [1]) {
      d.copy(out).multiplyScalar(side).add(new THREE.Vector3((rand() - 0.5) * 0.9, (rand() - 0.3) * 0.8, (rand() - 0.5) * 0.9)).normalize();
      q.setFromUnitVectors(up, d);
      geos.push(spike.clone().applyQuaternion(q).translate(p.x + (rand() - 0.5) * step * 0.5, p.y + (rand() - 0.5) * 0.08, p.z + (rand() - 0.5) * step * 0.5));
    }
  }
  const merged = mergeGeometries(geos, false)!;
  b.addGeometry(merged, surfaceMaterial('pintura'), 0xd9ccb0, false);
  merged.dispose();
  for (const g of geos) g.dispose();
  spike.dispose();
}

/** A seed from a piece's line, so each stretch draws its own thorns the same way everywhere. */
const thornSeed = (fixed: number, s0: number) => 4421 + Math.round(fixed * 100) * 31 + Math.round(s0 * 100);

/**
 * A hedge's thorns (the `sebe` piece with `espinhos`): two rows on its face toward the middle of the map and
 * one along its top, skipping the gaps. `h` and `t` as the hedge's height and thickness.
 */
export function hedgeThorns(b: MapBuilder, axis: 'x' | 'z', fixed: number, a: number, end: number, gaps: [number, number][], h = 2.6, t = 1.1) {
  const rand = seeded(thornSeed(fixed, a));
  const inward = fixed > 0 ? -1 : 1;
  const face = fixed + inward * (t / 2 + 0.01);
  const pt = (s: number, y: number, f: number) => (axis === 'x' ? V(s, y, f) : V(f, y, s));
  const out = axis === 'x' ? V(0, 0, inward) : V(inward, 0, 0);
  for (const [s0, s1] of solidIntervals(a, end, gaps)) {
    for (const y of [(h * 1.6) / 2.6, (h * 2.3) / 2.6]) thorns(b, rand, pt(s0, y, face), pt(s1, y, face), out, 0.7, false);
    thorns(b, rand, pt(s0, h + 0.02, fixed), pt(s1, h + 0.02, fixed), V(0, 1, 0), 0.7, false);
  }
}

/** A stretch of wall from s0 to s1: stone base, iron bars above it, thorns on the rails, a pillar every few metres. */
function churchyardWall(b: MapBuilder, axis: 'x' | 'z', fixed: number, s0: number, s1: number) {
  const len = s1 - s0;
  const mid = (s0 + s1) / 2;
  const at = (s: number, y: number): [number, number, number] => (axis === 'x' ? [s, y, fixed] : [fixed, y, s]);
  if (axis === 'x') b.span(s0, 0, fixed - T / 2, s1, BASE_H, fixed + T / 2, 'pedra', { tint: WALL_TINT });
  else b.span(fixed - T / 2, 0, s0, fixed + T / 2, BASE_H, s1, 'pedra', { tint: WALL_TINT });
  const cope = axis === 'x' ? [len, 0.08, T + 0.12] : [T + 0.12, 0.08, len];
  b.box(...at(mid, BASE_H + 0.04), cope[0], cope[1], cope[2], 'pedra', { tint: 0x7d786f, collide: false });
  const metal = surfaceMaterial('metal');
  const bar = new THREE.BoxGeometry(0.035, TOP - BASE_H - 0.12, 0.035);
  const tip = new THREE.ConeGeometry(0.045, 0.16, 4);
  const geos: THREE.BufferGeometry[] = [];
  for (let s = s0 + 0.1; s < s1 - 0.05; s += 0.17) {
    geos.push(bar.clone().translate(...at(s, (BASE_H + TOP - 0.12) / 2 + 0.04)));
    geos.push(tip.clone().translate(...at(s, TOP - 0.02)));
  }
  for (const y of [BASE_H + 0.18, TOP - 0.3]) geos.push((axis === 'x' ? new THREE.BoxGeometry(len, 0.05, 0.05) : new THREE.BoxGeometry(0.05, 0.05, len)).translate(...at(mid, y)));
  for (const g of geos) {
    b.addGeometry(g, metal, C.iron, false);
    g.dispose();
  }
  bar.dispose();
  tip.dispose();
  // Thorns on both rails, both faces: the ledge and the bars look as bad to climb as they are.
  const rand = seeded(thornSeed(fixed, s0));
  const across = axis === 'x' ? V(0, 0, 1) : V(1, 0, 0);
  for (const [y, step] of [[TOP - 0.3, 0.28], [BASE_H + 0.18, 0.35]] as const) thorns(b, rand, V(...at(s0 + 0.05, y)), V(...at(s1 - 0.05, y)), across, step, true);
  const half = axis === 'x' ? V(len / 2, (TOP - BASE_H) / 2, 0.08) : V(0.08, (TOP - BASE_H) / 2, len / 2);
  blocker(b, V(...at(mid, (BASE_H + TOP) / 2)), half);
  // Pillars every few metres along it.
  const n = Math.max(1, Math.round(len / 5));
  for (let k = 1; k < n; k++) {
    const [px, , pz] = at(s0 + (len * k) / n, 0);
    pillar(b, px, pz, 0.5, TOP + 0.2);
  }
}
