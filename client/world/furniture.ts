// Furniture and props for code-built maps (made for "Vila Assombrada", usable anywhere): crates with framed
// edges, hay bales, barrels with hoops, park benches, a sofa, dining chairs and tables, candles in their
// holders, beds, coffins, church pews, suits of armor, a toy chest, a rocking horse, bookshelves full of
// books and witch's potion bottles. Everything goes into the MapBuilder's static batches (tinted pieces of
// the surface library), with one simple collider per prop.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MapBuilder, worldUVs } from './mapBuilder';
import { surfaceMaterial, type SurfaceKey } from './surfaces';
import type { SurfaceMaterial } from './physics';
import type { Glow } from './halloween';

type Vec3 = [number, number, number];
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/**
 * Places pieces in a prop's own frame (x right, y up, z its front at yaw 0) into the static batches.
 * Positions are a piece's center; `rot` turns it around its own center first.
 */
export class Place {
  readonly m: THREE.Matrix4;
  readonly q: THREE.Quaternion;
  private piece = new THREE.Matrix4();

  constructor(
    private b: MapBuilder,
    x: number,
    y: number,
    z: number,
    yaw = 0,
  ) {
    this.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    this.m = new THREE.Matrix4().compose(V(x, y, z), this.q, V(1, 1, 1));
  }

  /** Any geometry already in the prop's frame. */
  geo(g: THREE.BufferGeometry, surface: SurfaceKey, tint: number, shadow = true) {
    g.applyMatrix4(this.m);
    worldUVs(g);
    this.b.addGeometry(g, surfaceMaterial(surface), tint, shadow);
    g.dispose();
  }

  /** Geometry centered at the origin, turned by `rot` and moved to `at`. */
  put(g: THREE.BufferGeometry, at: Vec3, surface: SurfaceKey, tint: number, rot?: Vec3, shadow = true) {
    this.piece.compose(V(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))), V(1, 1, 1));
    this.geo(g.applyMatrix4(this.piece), surface, tint, shadow);
  }

  box(at: Vec3, size: Vec3, surface: SurfaceKey, tint: number, rot?: Vec3, shadow = true) {
    this.put(new THREE.BoxGeometry(...size), at, surface, tint, rot, shadow);
  }

  round(at: Vec3, size: Vec3, radius: number, surface: SurfaceKey, tint: number, rot?: Vec3) {
    this.put(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(radius, Math.min(...size) / 2 - 0.001)), at, surface, tint, rot);
  }

  /** Cylinder centered at `at` (vertical unless turned by `rot`). */
  cyl(at: Vec3, r: number, h: number, surface: SurfaceKey, tint: number, o: { top?: number; seg?: number; rot?: Vec3; shadow?: boolean } = {}) {
    this.put(new THREE.CylinderGeometry(o.top ?? r, r, h, o.seg ?? 10), at, surface, tint, o.rot, o.shadow);
  }

  /** Box collider in the prop's frame (center and half sizes). */
  solid(at: Vec3, half: Vec3, physics: SurfaceMaterial = 'wood') {
    this.b.cuboidCollider(this.at(...at), V(...half), this.q, physics);
  }

  /** A point of the prop's frame in the world. */
  at(x: number, y: number, z: number) {
    return V(x, y, z).applyMatrix4(this.m);
  }
}

/** Wooden crate of side `s` resting on `y`: planked body, framed edges, a diagonal brace on every side. */
export function crate(b: MapBuilder, x: number, y: number, z: number, s = 1, yaw = 0, tint = 0x9a7650) {
  const p = new Place(b, x, y, z, yaw);
  const h = s / 2;
  const t = 0.075 * s;
  const frame = shade(tint, 0.72);
  p.box([0, h, 0], [s - 0.03, s - 0.03, s - 0.03], 'madeira', tint);
  const e = h - t / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.box([sx * e, h, sz * e], [t, s, t], 'madeira', frame);
    for (const y0 of [t / 2, s - t / 2]) {
      p.box([0, y0, sx * e], [s, t, t], 'madeira', frame);
      p.box([sx * e, y0, 0], [t, t, s], 'madeira', frame);
    }
  }
  const len = s * 1.12;
  const d = h - 0.004;
  for (const sx of [-1, 1]) {
    p.box([0, h, sx * d], [len, t * 0.9, 0.02], 'madeira', frame, [0, 0, sx * Math.PI / 4]);
    p.box([sx * d, h, 0], [0.02, t * 0.9, len], 'madeira', frame, [sx * Math.PI / 4, 0, 0]);
  }
  p.solid([0, h, 0], [h, h, h]);
}

/** Rectangular hay bale on `y`: straw texture, slightly rounded, two twine bands. */
export function hayBale(b: MapBuilder, x: number, y: number, z: number, yaw = 0, size: Vec3 = [1.1, 0.5, 0.55]) {
  const p = new Place(b, x, y, z, yaw);
  const [sx, sy, sz] = size;
  p.round([0, sy / 2, 0], size, 0.07, 'feno', 0xe0c070);
  for (const bx of [-sx * 0.27, sx * 0.27]) p.box([bx, sy / 2, 0], [0.025, sy + 0.012, sz + 0.012], 'pintura', 0x7a5a32, undefined, false);
  // A few loose straws sticking out of the ends.
  for (const ex of [-1, 1]) for (let k = 0; k < 3; k++) p.box([ex * (sx / 2 + 0.02), sy * (0.3 + k * 0.2), sz * (k - 1) * 0.25], [0.08, 0.008, 0.008], 'pintura', 0xd8b860, [0, k * 0.7, (k - 1) * 0.4], false);
  p.solid([0, sy / 2, 0], [sx / 2, sy / 2, sz / 2], 'grass');
}

/** Wooden barrel on `y`: bulging staves, iron hoops, a lid. */
export function barrel(b: MapBuilder, x: number, y: number, z: number, r = 0.38, h = 1.0, tint = 0x7a4a2a) {
  const p = new Place(b, x, y, z, 0);
  const profile = [[r * 0.84, 0], [r * 0.95, h * 0.2], [r, h * 0.5], [r * 0.95, h * 0.8], [r * 0.84, h]].map(([a, c]) => new THREE.Vector2(a, c));
  p.geo(new THREE.LatheGeometry(profile, 16), 'madeira', tint);
  p.cyl([0, h - 0.01, 0], r * 0.82, 0.02, 'madeira', shade(tint, 0.8));
  const radiusAt = (t: number) => r * (0.84 + 0.16 * Math.sin(t * Math.PI));
  for (const t of [0.08, 0.3, 0.7, 0.92]) p.put(new THREE.TorusGeometry(radiusAt(t) + 0.005, 0.018, 4, 20), [0, h * t, 0], 'metal', 0x3a3a40, [Math.PI / 2, 0, 0]);
  p.solid([0, h / 2, 0], [r * 0.85, h / 2, r * 0.85]);
}

/** Park bench facing +Z: wooden slats on cast-iron sides with armrests. */
export function bench(b: MapBuilder, x: number, z: number, yaw = 0, len = 1.8) {
  const p = new Place(b, x, 0, z, yaw);
  const iron = 0x2a2a30;
  for (const sx of [-1, 1]) {
    const ex = sx * (len / 2 - 0.08);
    p.box([ex, 0.22, 0.2], [0.05, 0.44, 0.05], 'metal', iron);
    p.box([ex, 0.42, -0.12], [0.05, 0.84, 0.05], 'metal', iron, [-0.15, 0, 0]);
    p.box([ex, 0.43, 0.02], [0.05, 0.04, 0.48], 'metal', iron);
    p.box([ex, 0.64, 0.08], [0.06, 0.04, 0.42], 'metal', iron);
    p.box([ex, 0.53, 0.26], [0.04, 0.2, 0.04], 'metal', iron);
  }
  for (const sz of [-0.12, 0.02, 0.16]) p.box([0, 0.47, sz], [len, 0.035, 0.11], 'madeira', 0x8a5a32);
  for (const sy of [0.66, 0.82]) p.box([0, sy, -0.2 + (sy - 0.66) * -0.25], [len, 0.1, 0.03], 'madeira', 0x8a5a32, [-0.15, 0, 0]);
  p.solid([0, 0.3, 0], [len / 2, 0.3, 0.28]);
}

/** Sofa facing +Z on `y`: plush seat and back cushions, rolled arms, throw pillows, wooden feet. */
export function sofa(b: MapBuilder, x: number, y: number, z: number, yaw = 0, len = 2.3, tint = 0x8a2a3a, accent = 0xd8b060) {
  const p = new Place(b, x, y, z, yaw);
  const dark = shade(tint, 0.78);
  const armW = 0.22;
  const inner = len - armW * 2;
  p.round([0, 0.27, 0], [len, 0.26, 0.92], 0.05, 'tecido', dark);
  p.round([0, 0.62, -0.38], [len, 0.78, 0.18], 0.07, 'tecido', dark);
  const n = 3;
  const cw = inner / n;
  for (let k = 0; k < n; k++) {
    const cx = -inner / 2 + cw * (k + 0.5);
    p.round([cx, 0.47, 0.06], [cw - 0.02, 0.16, 0.74], 0.07, 'tecido', tint);
    p.round([cx, 0.76, -0.24], [cw - 0.03, 0.46, 0.18], 0.08, 'tecido', tint, [-0.14, 0, 0]);
  }
  for (const sx of [-1, 1]) {
    p.round([sx * (len / 2 - armW / 2), 0.46, 0], [armW, 0.44, 0.92], 0.06, 'tecido', dark);
    p.cyl([sx * (len / 2 - armW / 2), 0.7, 0.02], 0.13, 0.9, 'tecido', tint, { rot: [Math.PI / 2, 0, 0], seg: 12 });
    for (const sz of [-0.36, 0.36]) p.cyl([sx * (len / 2 - 0.08), 0.06, sz], 0.035, 0.12, 'madeira', 0x3a2418, { top: 0.025, seg: 6 });
    p.round([sx * (inner / 2 - 0.2), 0.68, -0.14], [0.36, 0.34, 0.12], 0.06, 'tecido', accent, [-0.25, sx * 0.25, sx * 0.12]);
  }
  p.solid([0, 0.45, 0], [len / 2, 0.45, 0.46]);
}

/** Wooden table on `y`: top, apron and four turned legs. */
export function table(b: MapBuilder, x: number, y: number, z: number, w: number, d: number, yaw = 0, h = 0.78, tint = 0x5a3424) {
  const p = new Place(b, x, y, z, yaw);
  p.box([0, h - 0.03, 0], [w, 0.06, d], 'madeira', tint);
  p.box([0, h - 0.12, 0], [w - 0.12, 0.12, d - 0.12], 'madeira', shade(tint, 0.8));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl([sx * (w / 2 - 0.08), (h - 0.06) / 2, sz * (d / 2 - 0.08)], 0.035, h - 0.06, 'madeira', shade(tint, 0.85), { top: 0.045, seg: 8 });
  p.solid([0, h / 2, 0], [w / 2, h / 2, d / 2]);
}

/** Dining chair facing +Z on `y`: turned legs, upholstered seat, a tall back with spindles. */
export function chair(b: MapBuilder, x: number, y: number, z: number, yaw = 0, tint = 0x4a2a1c, seat = 0x7a2a3a) {
  const p = new Place(b, x, y, z, yaw);
  for (const sx of [-1, 1]) {
    p.cyl([sx * 0.2, 0.23, 0.19], 0.022, 0.46, 'madeira', tint, { seg: 6 });
    p.box([sx * 0.2, 0.55, -0.2], [0.045, 1.1, 0.045], 'madeira', tint);
  }
  p.box([0, 0.47, 0], [0.48, 0.05, 0.46], 'madeira', tint);
  p.round([0, 0.51, 0.02], [0.42, 0.05, 0.4], 0.02, 'tecido', seat);
  p.box([0, 1.06, -0.2], [0.48, 0.09, 0.045], 'madeira', tint);
  for (const sx of [-0.1, 0, 0.1]) p.box([sx, 0.79, -0.2], [0.03, 0.46, 0.025], 'madeira', tint);
  p.solid([0, 0.55, 0], [0.24, 0.55, 0.24]);
}

/**
 * Candle on `y` with its wax, wick and flame (the flame into `glow`); `holder` adds a brass candlestick.
 * Returns the flame's position.
 */
export function candle(b: MapBuilder, glow: Glow, x: number, y: number, z: number, h = 0.16, holder = true, wax = 0xf0e6cc) {
  const p = new Place(b, x, y, z, 0);
  let y0 = 0;
  if (holder) {
    p.cyl([0, 0.01, 0], 0.055, 0.02, 'metal', 0xc8a040, { seg: 10, shadow: false });
    p.cyl([0, 0.07, 0], 0.012, 0.1, 'metal', 0xc8a040, { seg: 6, shadow: false });
    p.cyl([0, 0.13, 0], 0.03, 0.02, 'metal', 0xc8a040, { seg: 8, shadow: false });
    y0 = 0.14;
  }
  p.cyl([0, y0 + h / 2, 0], 0.022, h, 'pintura', wax, { seg: 8, shadow: false });
  p.box([0.012, y0 + h - 0.03, 0.01], [0.012, 0.05, 0.012], 'pintura', wax, undefined, false); // a drip
  p.cyl([0, y0 + h + 0.012, 0], 0.003, 0.025, 'pintura', 0x1a1410, { seg: 4, shadow: false });
  const flame = p.at(0, y0 + h + 0.06, 0);
  glow.add(new THREE.ConeGeometry(0.018, 0.07, 6).translate(flame.x, flame.y, flame.z), 0xffc861);
  glow.add(new THREE.SphereGeometry(0.012, 6, 4).translate(flame.x, flame.y - 0.02, flame.z), 0xfff4c0);
  return flame;
}

/** Bed with its head at -Z, on `y`: frame, headboard, mattress, pillows and a blanket folded back. */
export function bed(b: MapBuilder, x: number, y: number, z: number, yaw = 0, w = 1.4, l = 2.0, blanket = 0x6a3a5a, wood = 0x4a2e20) {
  const p = new Place(b, x, y, z, yaw);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.box([sx * (w / 2 - 0.04), 0.2, sz * (l / 2 - 0.04)], [0.07, 0.4, 0.07], 'madeira', wood);
    p.box([sx * (w / 2 - 0.04), 0.3, 0], [0.05, 0.14, l], 'madeira', wood);
  }
  p.box([0, 0.65, -l / 2 + 0.03], [w + 0.06, 1.1, 0.06], 'madeira', wood);
  p.box([0, 1.18, -l / 2 + 0.03], [w + 0.14, 0.08, 0.1], 'madeira', shade(wood, 0.8));
  p.box([0, 0.42, l / 2 - 0.03], [w + 0.06, 0.55, 0.05], 'madeira', wood);
  p.round([0, 0.47, 0], [w - 0.06, 0.2, l - 0.1], 0.06, 'tecido', 0xe8e0d0);
  const pillows = w > 1.1 ? [-w / 4, w / 4] : [0];
  for (const px of pillows) p.round([px, 0.62, -l / 2 + 0.28], [w / pillows.length - 0.12, 0.12, 0.34], 0.05, 'tecido', 0xf2ece0, [0.15, 0, 0]);
  p.round([0, 0.6, l * 0.12], [w - 0.02, 0.07, l * 0.66], 0.03, 'tecido', blanket);
  p.round([0, 0.62, -l * 0.21], [w - 0.02, 0.1, 0.18], 0.04, 'tecido', shade(blanket, 1.2));
  p.solid([0, 0.33, 0], [w / 2, 0.33, l / 2]);
}

/** Coffin lying along Z (head at -Z) on `y`: the classic six-sided box with its lid, a cross and handles. */
export function coffin(b: MapBuilder, x: number, y: number, z: number, yaw = 0, tint = 0x4a2a22, l = 2.0) {
  const p = new Place(b, x, y, z, yaw);
  const outline = (k: number) =>
    new THREE.Shape([[-0.24, -1], [0.24, -1], [0.36, -0.45], [0.18, 1], [-0.18, 1], [-0.36, -0.45]].map(([a, c]) => new THREE.Vector2(a * k, (c * l) / 2)));
  const body = new THREE.ExtrudeGeometry(outline(1), { depth: 0.42, bevelEnabled: false }).rotateX(-Math.PI / 2).rotateY(Math.PI);
  p.geo(body, 'madeira', tint);
  const lid = new THREE.ExtrudeGeometry(outline(1.07), { depth: 0.06, bevelEnabled: false }).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(0, 0.42, 0);
  p.geo(lid, 'madeira', shade(tint, 0.8));
  p.box([0, 0.49, -0.25], [0.07, 0.02, 0.6], 'metal', 0xc8a040, undefined, false);
  p.box([0, 0.49, -0.35], [0.32, 0.02, 0.07], 'metal', 0xc8a040, undefined, false);
  for (const sx of [-1, 1]) for (const sz of [-0.2, 0.4]) p.box([sx * 0.31 * (sz < 0 ? 1.05 : 0.85), 0.22, sz * l * 0.5], [0.04, 0.04, 0.16], 'metal', 0xc8a040, undefined, false);
  p.solid([0, 0.24, 0], [0.34, 0.24, l / 2]);
}

/** Church pew facing +Z: seat, slanted back, carved end panels, a kneeler. */
export function pew(b: MapBuilder, x: number, z: number, yaw = 0, len = 1.6, tint = 0x5a3424) {
  const p = new Place(b, x, 0, z, yaw);
  p.box([0, 0.45, 0.02], [len, 0.06, 0.42], 'madeira', tint);
  p.box([0, 0.78, -0.2], [len, 0.55, 0.05], 'madeira', tint, [-0.12, 0, 0]);
  p.box([0, 0.3, -0.12], [len, 0.3, 0.03], 'madeira', shade(tint, 0.85));
  for (const sx of [-1, 1]) {
    p.box([sx * (len / 2 + 0.03), 0.5, -0.02], [0.06, 1.0, 0.5], 'madeira', shade(tint, 0.85));
    p.cyl([sx * (len / 2 + 0.03), 1.0, -0.02], 0.25, 0.06, 'madeira', shade(tint, 0.85), { rot: [0, 0, Math.PI / 2], seg: 12 });
  }
  p.box([0, 0.12, 0.38], [len - 0.1, 0.06, 0.14], 'madeira', shade(tint, 0.7));
  p.solid([0, 0.5, 0], [len / 2 + 0.05, 0.5, 0.28]);
}

/** Suit of armor on a plinth, facing +Z, holding a halberd. */
export function suitOfArmor(b: MapBuilder, x: number, y: number, z: number, yaw = 0) {
  const p = new Place(b, x, y, z, yaw);
  const steel = 0xa8aab8;
  const dark = 0x5a5c68;
  p.box([0, 0.1, 0], [0.7, 0.2, 0.6], 'pedra', 0x6a6460);
  for (const sx of [-1, 1]) {
    p.box([sx * 0.12, 0.25, 0.04], [0.14, 0.1, 0.26], 'metal', dark);
    p.cyl([sx * 0.12, 0.55, 0], 0.075, 0.5, 'metal', steel, { top: 0.085, seg: 10 });
    p.put(new THREE.SphereGeometry(0.085, 10, 8), [sx * 0.12, 0.82, 0.02], 'metal', dark);
    p.cyl([sx * 0.12, 1.02, 0], 0.09, 0.38, 'metal', steel, { top: 0.1, seg: 10 });
    p.put(new THREE.SphereGeometry(0.12, 10, 8).scale(1.2, 0.8, 1), [sx * 0.31, 1.62, 0], 'metal', steel);
    p.cyl([sx * 0.33, 1.33, 0.02], 0.06, 0.5, 'metal', steel, { rot: [0.15, 0, sx * 0.1], seg: 8 });
    p.put(new THREE.SphereGeometry(0.06, 8, 6), [sx * 0.35, 1.05, 0.08], 'metal', dark);
  }
  p.round([0, 1.27, 0], [0.24, 0.16, 0.22], 0.05, 'metal', dark);
  p.round([0, 1.47, 0], [0.48, 0.4, 0.3], 0.1, 'metal', steel);
  p.box([0, 1.48, 0.152], [0.03, 0.34, 0.01], 'metal', dark, undefined, false);
  p.cyl([0, 1.82, 0], 0.13, 0.26, 'metal', steel, { seg: 12 });
  p.put(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 1.95, 0], 'metal', steel);
  p.box([0, 1.84, 0.128], [0.18, 0.02, 0.01], 'pintura', 0x101014, undefined, false);
  p.put(new THREE.ConeGeometry(0.05, 0.3, 6), [0, 2.15, -0.04], 'pintura', 0xa02a2a, [-0.4, 0, 0]);
  // The halberd, standing in the right hand.
  p.cyl([0.36, 1.2, 0.12], 0.018, 2.2, 'madeira', 0x4a2e1e, { seg: 6 });
  p.put(new THREE.BoxGeometry(0.03, 0.28, 0.22), [0.36, 2.12, 0.2], 'metal', steel);
  p.put(new THREE.ConeGeometry(0.03, 0.22, 4), [0.36, 2.38, 0.12], 'metal', steel);
  p.solid([0, 1.1, 0], [0.35, 1.1, 0.3], 'metal');
}

/** Toy chest facing +Z on `y`: painted wood with a curved lid, blocks and a ball on top. */
export function toyChest(b: MapBuilder, x: number, y: number, z: number, yaw = 0) {
  const p = new Place(b, x, y, z, yaw);
  p.round([0, 0.25, 0], [1.0, 0.5, 0.55], 0.04, 'madeira', 0x3a6aa0);
  p.round([0, 0.53, 0], [1.04, 0.07, 0.59], 0.03, 'madeira', 0x2a5088);
  p.box([0, 0.3, 0.278], [0.9, 0.06, 0.01], 'pintura', 0xf2c230, undefined, false);
  // Toys on the lid: two blocks with a third on top, and a ball.
  for (const [bx, by, c] of [[-0.3, 0.625, 0xd8342a], [-0.16, 0.625, 0x3aae6a], [-0.23, 0.745, 0xf2c230]] as const) p.box([bx, by, 0.05], [0.12, 0.12, 0.12], 'pintura', c, [0, bx, 0]);
  p.put(new THREE.SphereGeometry(0.08, 12, 8), [0.25, 0.645, 0], 'pintura', 0xd84a8a);
  p.solid([0, 0.35, 0], [0.5, 0.35, 0.28]);
}

/** Rocking horse facing +Z on `y`. */
export function rockingHorse(b: MapBuilder, x: number, y: number, z: number, yaw = 0) {
  const p = new Place(b, x, y, z, yaw);
  const wood = 0xc8a06a;
  for (const sx of [-1, 1]) p.put(new THREE.TorusGeometry(0.9, 0.025, 4, 16, 1.2).rotateZ(-Math.PI / 2 - 0.6), [sx * 0.16, 0.92, 0], 'madeira', 0x7a4a2a, [0, Math.PI / 2, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([sx * 0.1, 0.3, sz * 0.22], [0.05, 0.45, 0.05], 'madeira', wood, [sz * 0.2, 0, sx * -0.15]);
  p.put(new THREE.SphereGeometry(1, 12, 8).scale(0.15, 0.15, 0.36), [0, 0.6, 0], 'madeira', wood);
  p.box([0, 0.8, 0.3], [0.1, 0.32, 0.12], 'madeira', wood, [0.5, 0, 0]);
  p.put(new THREE.SphereGeometry(1, 10, 8).scale(0.08, 0.09, 0.17), [0, 0.95, 0.42], 'madeira', wood);
  p.box([0, 0.86, 0.24], [0.04, 0.32, 0.18], 'pintura', 0x2a1a14, [0.5, 0, 0]);
  p.round([0, 0.73, -0.02], [0.24, 0.05, 0.26], 0.02, 'tecido', 0xa02a2a);
  p.put(new THREE.ConeGeometry(0.05, 0.3, 6), [0, 0.55, -0.42], 'pintura', 0x2a1a14, [-2.4, 0, 0]);
  p.solid([0, 0.45, 0], [0.18, 0.45, 0.5]);
}

/**
 * Freestanding bookshelf, `w` wide, open on both faces (+Z and -Z), facing +Z at yaw 0. Its rows are full of
 * books of every height and thickness, some leaning, with gilt bands on the spines. `rand`: seeded.
 *
 * With the light object detail (PF-35 L6) the books of a row are one dark block with their spines painted on its
 * face (the same books, colors and heights, upright, without the bands): two triangles a book instead of 12 to 36.
 */
export function bookshelf(b: MapBuilder, x: number, z: number, w: number, rand: () => number, yaw = 0, h = 2.2, both = true) {
  const light = b.detalhe === 'leve';
  const p = new Place(b, x, 0, z, yaw);
  const D = 0.55;
  const wood = 0x4a2a1a;
  for (const sx of [-1, 1]) p.box([sx * (w / 2 - 0.03), h / 2, 0], [0.06, h, D], 'madeira', wood);
  p.box([0, h - 0.03, 0], [w, 0.06, D + 0.04], 'madeira', shade(wood, 0.85));
  p.box([0, 0.06, 0], [w - 0.06, 0.12, D], 'madeira', shade(wood, 0.85));
  p.box([0, h / 2, 0], [w - 0.06, h - 0.1, 0.02], 'madeira', shade(wood, 0.7));
  const rows = 4;
  const gap = (h - 0.18) / rows;
  const colors = [0x6a2222, 0x22405a, 0x2f4a26, 0x6a5422, 0x4a2a5a, 0x2a2a2a, 0x7a5a3a, 0x5a1a2a, 0x1f3a3a];
  for (let r = 0; r < rows; r++) {
    const y0 = 0.12 + r * gap;
    if (r > 0) p.box([0, y0 - 0.015, 0], [w - 0.06, 0.03, D], 'madeira', shade(wood, 0.95));
    for (const side of both ? [-1, 1] : [1]) {
      const row: { cx: number; bw: number; bh: number; c: number }[] = [];
      let cx = -w / 2 + 0.08;
      while (cx < w / 2 - 0.1) {
        if (rand() < 0.08) {
          cx += 0.06 + rand() * 0.1; // a gap
          continue;
        }
        const bw = 0.035 + rand() * 0.045;
        if (cx + bw > w / 2 - 0.07) break;
        const bh = Math.min(gap - 0.05, 0.2 + rand() * 0.14);
        const bd = 0.17 + rand() * 0.05;
        const lean = rand() < 0.1 ? (rand() - 0.5) * 0.4 : 0;
        const c = colors[Math.floor(rand() * colors.length)];
        const bz = side * (D / 2 - bd / 2 - 0.02);
        if (light) {
          row.push({ cx, bw, bh, c });
          rand();
        } else {
          p.box([cx + bw / 2, y0 + bh / 2, bz], [bw, bh, bd], 'pintura', c, [0, 0, lean], false);
          // Gilt bands on the spine.
          for (const by of rand() < 0.5 ? [0.2, 0.8] : [0.75]) p.box([cx + bw / 2, y0 + bh * by, bz + (side * bd) / 2], [bw * 0.9, 0.012, 0.004], 'pintura', 0xc8a050, [0, 0, lean], false);
        }
        cx += bw + 0.004;
      }
      if (row.length) bookRow(p, row, y0, side * (D / 2 - 0.02), 0.19);
    }
  }
  p.solid([0, h / 2, 0], [w / 2, h / 2, D / 2]);
}

/**
 * The light detail's row of books (PF-35 L6): one dark block from the first book to the last, as tall as the
 * tallest and `depth` deep behind the spines' plane (`front`: its z, the sign the side it faces), and each book's
 * spine painted on it.
 */
function bookRow(p: Place, row: { cx: number; bw: number; bh: number; c: number }[], y0: number, front: number, depth: number) {
  const x0 = row[0].cx;
  const x1 = row[row.length - 1].cx + row[row.length - 1].bw;
  const top = Math.max(...row.map((k) => k.bh));
  const side = Math.sign(front);
  p.box([(x0 + x1) / 2, y0 + top / 2, front - (side * depth) / 2], [x1 - x0, top, depth], 'pintura', 0x241a16, undefined, false);
  for (const k of row) p.put(new THREE.PlaneGeometry(k.bw, k.bh), [k.cx + k.bw / 2, y0 + k.bh / 2, front + side * 0.003], 'pintura', k.c, [0, side < 0 ? Math.PI : 0, 0], false);
}

/**
 * A witch's potion on `y`: 0 = round flask, 1 = tall bottle with a label, 2 = small vial. The liquid
 * glows (into `glow`); the neck is glass, the stopper cork.
 */
export function potion(b: MapBuilder, glow: Glow, x: number, y: number, z: number, kind: 0 | 1 | 2, color: number, scale = 1) {
  const s = scale;
  const p = new Place(b, x, y, z, 0);
  const lit = (g: THREE.BufferGeometry, at: Vec3) => {
    const w = p.at(...at);
    glow.add(g.translate(w.x, w.y, w.z), color);
  };
  const neckH = kind === 0 ? 0.08 : kind === 1 ? 0.07 : 0.03;
  let top = 0;
  if (kind === 0) {
    lit(new THREE.SphereGeometry(0.075 * s, 12, 10), [0, 0.075 * s, 0]);
    top = 0.14 * s;
  } else if (kind === 1) {
    lit(new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 0.17 * s, 12), [0, 0.085 * s, 0]);
    lit(new THREE.ConeGeometry(0.045 * s, 0.05 * s, 12), [0, 0.195 * s, 0]);
    p.box([0, 0.08 * s, 0.049 * s], [0.06 * s, 0.07 * s, 0.004], 'pintura', 0xe8dcc0, undefined, false);
    top = 0.21 * s;
  } else {
    lit(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.1 * s, 8), [0, 0.05 * s, 0]);
    top = 0.1 * s;
  }
  p.cyl([0, top + (neckH * s) / 2, 0], 0.018 * s, neckH * s, 'pintura', 0xb8d0d0, { seg: 8, shadow: false });
  p.cyl([0, top + neckH * s + 0.015 * s, 0], 0.021 * s, 0.03 * s, 'madeira', 0x8a6a42, { top: 0.024 * s, seg: 8, shadow: false });
  // A glint on the glass.
  const glint = p.at(0.03 * s, (kind === 1 ? 0.13 : 0.1) * s, 0.035 * s);
  glow.add(new THREE.SphereGeometry(0.012 * s, 6, 4).translate(glint.x, glint.y, glint.z), 0xffffff);
}
