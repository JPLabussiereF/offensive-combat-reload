// "Cemitério da Capela" pieces: the churchyard wall (a low stone base that stops bullets, iron bars above it
// that bullets fly through and nobody climbs, a pillar every few metres) and its stone pillars.
import * as THREE from 'three';
import type { SpatialSfx } from '../../audio/spatial';
import type { MapBuilder } from '../mapBuilder';
import { surfaceMaterial } from '../surfaces';
import { blocker, SPOOKY as C } from '../halloween';
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

/** A stretch of wall from s0 to s1: stone base, iron bars above it, a pillar every few metres. */
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
  const half = axis === 'x' ? V(len / 2, (TOP - BASE_H) / 2, 0.08) : V(0.08, (TOP - BASE_H) / 2, len / 2);
  blocker(b, V(...at(mid, (BASE_H + TOP) / 2)), half);
  // Pillars every few metres along it.
  const n = Math.max(1, Math.round(len / 5));
  for (let k = 1; k < n; k++) {
    const [px, , pz] = at(s0 + (len * k) / n, 0);
    pillar(b, px, pz, 0.5, TOP + 0.2);
  }
}
