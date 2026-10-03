// Fruit that shots and the knife cut in half (map critters, see GameMap.critters): the cherries hanging in the
// Dragon Cherry and the fruit on the market's stalls. A hit fruit splits along a plane through its middle:
// both halves (skin outside, flesh on the cut face) fly apart with a squirt of juice, fall, lie there a while
// and shrink away; the fruit grows back later. Synchronized through the PropBus, so everyone sees it cut.
import * as THREE from 'three';
import { toonGradient } from '../../render/materials';
import type { PropBus } from '../props';

/** Seconds a cut fruit takes to grow back, that its pieces lie there, and that they take to shrink away. */
const REGROW = 40;
const LIE = 5;
const VANISH = 2;
const MAX_JUICE = 64;

/** Distance along the ray (`dir` unit) to where it enters the sphere, or null if it misses (or it's behind). */
export function raySphere(o: THREE.Vector3, dir: THREE.Vector3, c: THREE.Vector3, r: number): number | null {
  const lx = c.x - o.x;
  const ly = c.y - o.y;
  const lz = c.z - o.z;
  const along = lx * dir.x + ly * dir.y + lz * dir.z;
  const d2 = lx * lx + ly * ly + lz * lz - along * along;
  if (d2 > r * r) return null;
  const t = along - Math.sqrt(r * r - d2);
  return t >= 0 ? t : along >= 0 ? 0 : null;
}

const toonMat = (color: number, emissive = 0x000000) => new THREE.MeshToonMaterial({ color, emissive, gradientMap: toonGradient() });

/** A loose piece: where it rests when the fruit is whole, and its motion once cut. */
interface Piece {
  meshes: THREE.InstancedMesh[];
  idx: number;
  rest: THREE.Matrix4;
  /** Half its thickness: how high it lies above the floor. */
  size: number;
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
  v: THREE.Vector3;
  w: THREE.Vector3;
  /** Flutters down (a leaf) instead of falling. */
  leaf: boolean;
  still: boolean;
}

interface Fruit {
  /** The hit sphere. */
  center: THREE.Vector3;
  radius: number;
  state: 'on' | 'off' | 'growing';
  t: number;
  /** Whole pieces: hidden when cut, they grow back. */
  whole: Piece[];
  /** Pieces that only exist once cut (the halves). */
  cut: Piece[];
  /** Pieces that are there whole and fall when cut (stems, leaves). */
  loose: Piece[];
  trigger: () => void;
}

export type FruitHit = { k: number; d: number; point: THREE.Vector3 };

/**
 * The machinery every fruit set shares: the pieces' physics, the juice, hits and the cut synchronized as
 * `${prefix}:N`. Subclasses build the meshes and the fruit.
 */
abstract class FruitSet {
  protected fruit: Fruit[] = [];
  private juice: THREE.InstancedMesh;
  private juiceP = new Float32Array(MAX_JUICE * 3);
  private juiceV = new Float32Array(MAX_JUICE * 3);
  private juiceLife = new Float32Array(MAX_JUICE);
  private juiceCursor = 0;
  private knockDir: THREE.Vector3 | null = null;
  protected m = new THREE.Matrix4();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private dq = new THREE.Quaternion();
  protected zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private dirty = new Set<THREE.InstancedMesh>();

  constructor(
    protected scene: THREE.Scene,
    private props: PropBus,
    private prefix: string,
    juiceColor: number,
    /** Height pieces land on. */
    private groundAt: (x: number, z: number, from: THREE.Vector3) => number,
    private sound: (at: THREE.Vector3) => void,
  ) {
    this.juice = this.instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: juiceColor }), MAX_JUICE);
  }

  protected instanced(geo: THREE.BufferGeometry, mat: THREE.Material, n: number) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) mesh.setMatrixAt(i, this.zero);
    this.scene.add(mesh);
    return mesh;
  }

  protected piece(meshes: THREE.InstancedMesh[], idx: number, rest: THREE.Matrix4, size: number, shown: boolean, leaf = false): Piece {
    for (const mesh of meshes) mesh.setMatrixAt(idx, shown ? rest : this.zero);
    return { meshes, idx, rest, size, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), leaf, still: false };
  }

  protected add(f: Omit<Fruit, 'trigger' | 'state' | 't'>) {
    const k = this.fruit.length;
    const fruit: Fruit = { ...f, state: 'on', t: 0, trigger: () => {} };
    fruit.trigger = this.props.register(`${this.prefix}:${k}`, () => {
      this.cutFruit(fruit, this.knockDir);
      this.knockDir = null;
    });
    this.fruit.push(fruit);
  }

  /** The two halves of a fruit of radius `r` resting whole at `rest`: same place, cut faces together. */
  protected halves(rest: THREE.Matrix4, r: number, shell: THREE.InstancedMesh, cap: THREE.InstancedMesh, idx: number): Piece[] {
    return [0, 1].map((h) => {
      // The half-sphere's dome is +Y; the other half is the same turned over.
      const m = rest.clone().multiply(new THREE.Matrix4().makeRotationX(h ? Math.PI : 0));
      return this.piece([shell, cap], idx * 2 + h, m, r * 0.5, false);
    });
  }

  /** The nearest whole fruit the shot from `o` along `dir` (unit) goes through within `dist`. */
  shot(o: THREE.Vector3, dir: THREE.Vector3, dist: number): FruitHit | null {
    let best: FruitHit | null = null;
    for (const [k, f] of this.fruit.entries()) {
      if (f.state !== 'on') continue;
      const d = raySphere(o, dir, f.center, f.radius);
      if (d === null || d > dist || (best && d > best.d)) continue;
      best = { k, d, point: o.clone().addScaledVector(dir, d) };
    }
    return best;
  }

  /** The nearest whole fruit in reach of a knife swing from `eye` looking along `fwd` (unit). */
  stab(eye: THREE.Vector3, fwd: THREE.Vector3, reach: number): FruitHit | null {
    let best: FruitHit | null = null;
    for (const [k, f] of this.fruit.entries()) {
      if (f.state !== 'on') continue;
      const d = f.center.distanceTo(eye);
      if (d > reach || (best && d > best.d)) continue;
      if (this.tmp.subVectors(f.center, eye).normalize().dot(fwd) < 0.7) continue;
      best = { k, d, point: f.center.clone() };
    }
    return best;
  }

  /** Our hit on fruit `k`: it's cut here and for everyone else. */
  hit(k: number, dir: THREE.Vector3) {
    const f = this.fruit[k];
    if (!f || f.state !== 'on') return;
    this.knockDir = dir.clone();
    f.trigger();
  }

  private cutFruit(f: Fruit, dir: THREE.Vector3 | null) {
    if (f.state !== 'on') return;
    f.state = 'off';
    f.t = 0;
    const a = Math.random() * Math.PI * 2;
    const push = dir ? this.tmp.copy(dir).setY(0).normalize() : this.tmp.set(Math.cos(a), 0, Math.sin(a));
    for (const p of f.whole) this.show(p, false);
    // The cut: the halves part along their own axis (dome outward), away from each other.
    for (const p of f.cut) {
      p.rest.decompose(p.p, p.q, p.s);
      const axis = this.tmp2.set(0, 1, 0).applyQuaternion(p.q);
      p.v.copy(push).multiplyScalar(0.6 + Math.random() * 0.8).addScaledVector(axis, 1.4 + Math.random() * 0.6).add(new THREE.Vector3(0, 0.8 + Math.random() * 0.8, 0));
      p.w.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      p.still = false;
    }
    for (const p of f.loose) {
      p.rest.decompose(p.p, p.q, p.s);
      const away = p.p.clone().sub(f.center).setY(0);
      p.v.copy(push).multiplyScalar(0.8 + Math.random()).addScaledVector(away, 8).add(new THREE.Vector3((Math.random() - 0.5), 0.5 + Math.random(), (Math.random() - 0.5)));
      p.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      p.still = false;
    }
    for (let i = 0; i < 12; i++) {
      const j = this.juiceCursor;
      this.juiceCursor = (j + 1) % MAX_JUICE;
      this.juiceP.set([f.center.x, f.center.y, f.center.z], j * 3);
      this.juiceV.set([push.x * 1.2 + (Math.random() - 0.5) * 2.6, 0.5 + Math.random() * 1.6, push.z * 1.2 + (Math.random() - 0.5) * 2.6], j * 3);
      this.juiceLife[j] = 0.4 + Math.random() * 0.3;
    }
    this.sound(f.center);
  }

  private show(p: Piece, on: boolean, m: THREE.Matrix4 = p.rest) {
    for (const mesh of p.meshes) {
      mesh.setMatrixAt(p.idx, on ? m : this.zero);
      this.dirty.add(mesh);
    }
  }

  update(dt: number) {
    for (const f of this.fruit) {
      if (f.state === 'on') continue;
      f.t += dt;
      if (f.state === 'off' && f.t >= REGROW) {
        f.state = 'growing';
        f.t = 0;
        for (const p of [...f.cut, ...f.loose]) this.show(p, false);
      }
      if (f.state === 'growing') {
        // Grows back where it was, swelling from nothing.
        const k = Math.min(1, f.t / 1.5);
        const e = k * k * (3 - 2 * k);
        for (const p of [...f.whole, ...f.loose]) {
          p.rest.decompose(p.p, p.q, p.s);
          this.show(p, true, k >= 1 ? p.rest : this.m.compose(p.p, p.q, p.s.multiplyScalar(Math.max(0.001, e))));
        }
        if (k >= 1) f.state = 'on';
        continue;
      }
      // Cut: the pieces fall, bounce, lie there, then shrink away.
      const shrink = f.t > LIE ? Math.max(0, 1 - (f.t - LIE) / VANISH) : 1;
      if (f.t - dt > LIE + VANISH) continue;
      for (const p of [...f.cut, ...f.loose]) {
        if (!p.still) this.fall(p, f.t, dt);
        this.show(p, shrink > 0, this.m.compose(p.p, p.q, this.tmp.copy(p.s).multiplyScalar(Math.max(0.001, shrink))));
      }
    }
    // Juice: droplets flung out and falling.
    let juice = false;
    for (let j = 0; j < MAX_JUICE; j++) {
      if (this.juiceLife[j] <= 0) continue;
      juice = true;
      this.juiceLife[j] -= dt;
      this.juiceV[j * 3 + 1] -= 9.8 * dt;
      for (const a of [0, 1, 2]) this.juiceP[j * 3 + a] += this.juiceV[j * 3 + a] * dt;
      const r = this.juiceLife[j] > 0 ? 0.016 : 0;
      this.m.compose(this.tmp.set(this.juiceP[j * 3], this.juiceP[j * 3 + 1], this.juiceP[j * 3 + 2]), this.dq.identity(), this.tmp2.set(r, r, r));
      this.juice.setMatrixAt(j, this.m);
    }
    if (juice) this.dirty.add(this.juice);
    for (const mesh of this.dirty) mesh.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
  }

  private fall(p: Piece, t: number, dt: number) {
    if (p.leaf) {
      p.v.multiplyScalar(Math.exp(-3 * dt));
      p.v.y -= 2.5 * dt;
      p.v.x += Math.sin(t * 7 + p.idx) * 2 * dt;
    } else p.v.y -= 9.8 * dt;
    const from = this.tmp2.copy(p.p);
    p.p.addScaledVector(p.v, dt);
    const len = p.w.length();
    if (len > 1e-3) p.q.premultiply(this.dq.setFromAxisAngle(this.tmp.copy(p.w).divideScalar(len), len * dt));
    const floor = this.groundAt(p.p.x, p.p.z, from) + p.size;
    if (p.p.y >= floor) return;
    p.p.y = floor;
    if (!p.leaf && p.v.y < -1.2) {
      p.v.y *= -0.3;
      p.v.x *= 0.55;
      p.v.z *= 0.55;
      p.w.multiplyScalar(0.5);
    } else {
      p.still = true;
      p.v.set(0, 0, 0);
      p.w.set(0, 0, 0);
    }
  }
}

/** Half a fruit of radius 1: the skin's dome (+Y) and the cut face (flesh) at y = 0, with the pit's dot. */
function halfGeometries(): { shell: THREE.BufferGeometry; cap: THREE.BufferGeometry } {
  const shell = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const cap = new THREE.CircleGeometry(0.98, 14).rotateX(Math.PI / 2);
  return { shell, cap };
}

// --- Cherries hanging in the tree ---------------------------------------------------------------------

const STEM = 0.24;
const CHERRY_R = 0.075;

/**
 * Pairs of cherries hanging from the tree's leaves on their stems, each with a leaf. Shot or stabbed, both
 * cherries are cut in half and the stems and leaf fall with them. Synchronized as "fruta:N".
 */
export class HangingCherries extends FruitSet {
  /**
   * `spots`: where each pair is attached (just inside the leaves) and its turn; `groundAt`: the height
   * pieces land on; `sound`: the splat, at a point.
   */
  constructor(scene: THREE.Scene, spots: { at: THREE.Vector3; yaw: number }[], props: PropBus, groundAt: (x: number, z: number) => number, sound: (at: THREE.Vector3) => void) {
    super(scene, props, 'fruta', 0xa00c24, groundAt, sound);
    const n = spots.length;
    const cherries = this.instanced(new THREE.SphereGeometry(CHERRY_R, 10, 8), toonMat(0xc8102e, 0x3a0810), n * 2);
    const stems = this.instanced(new THREE.CylinderGeometry(0.009, 0.011, 1, 4), toonMat(0x5a7a2a), n * 2);
    const leaves = this.instanced(new THREE.SphereGeometry(1, 8, 5), toonMat(0x4f9e3a), n);
    const half = halfGeometries();
    const shell = this.instanced(half.shell, toonMat(0xc8102e, 0x3a0810), n * 4);
    const cap = this.instanced(half.cap, toonMat(0xff8a96, 0x401018), n * 4);
    const tilt = Math.atan2(0.065, STEM);
    spots.forEach(({ at, yaw }, k) => {
      const frame = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
      const local = (pos: [number, number, number], rot: [number, number, number], scale: [number, number, number]) =>
        frame.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
      const whole: Piece[] = [];
      const cut: Piece[] = [];
      const loose: Piece[] = [];
      for (const s of [-1, 1]) {
        const i = k * 2 + (s > 0 ? 1 : 0);
        loose.push(this.piece([stems], i, local([s * 0.0325, -STEM / 2, 0], [0, 0, s * tilt], [1, STEM, 1]), 0.012, true));
        whole.push(this.piece([cherries], i, local([s * 0.065, -STEM - 0.06, 0], [0, 0, 0], [1, 0.95, 1]), CHERRY_R, true));
        // Cut across, at a slant: the halves fly apart sideways.
        cut.push(...this.halves(local([s * 0.065, -STEM - 0.06, 0], [0.4, Math.random() * Math.PI, Math.PI / 2], [CHERRY_R, CHERRY_R, CHERRY_R]), CHERRY_R, shell, cap, i));
      }
      loose.push(this.piece([leaves], k, local([0.05, -0.03, 0.02], [0.3, 0.5, -0.5], [0.085, 0.014, 0.04]), 0.015, true, true));
      this.add({ center: new THREE.Vector3(0, -STEM - 0.04, 0).applyMatrix4(frame), radius: 0.17, whole, cut, loose });
    });
    for (const mesh of [cherries, stems, leaves]) mesh.instanceMatrix.needsUpdate = true;
  }
}

// --- Fruit on the market's stalls -----------------------------------------------------------------------

/**
 * Oranges, apples, peaches and limes lying on the stalls' counters. A hit one is cut in half: the halves
 * tumble off (onto the counter or the ground) and shrink away; it grows back later. Synchronized as "banca:N".
 */
export class StallFruit extends FruitSet {
  /** `fruit`: each one's center, radius and skin color; `counters`: where a falling half stops on a counter top. */
  constructor(scene: THREE.Scene, fruit: { p: THREE.Vector3; r: number; color: number }[], counters: { x0: number; x1: number; z0: number; z1: number; y: number }[], props: PropBus, sound: (at: THREE.Vector3) => void) {
    const groundAt = (x: number, z: number, from: THREE.Vector3) => {
      // On a counter if it's over one and came from above its top; the street's paving otherwise.
      const c = counters.find((k) => x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1 && from.y >= k.y - 0.02);
      return c ? c.y : 0.03;
    };
    super(scene, props, 'banca', 0xffb04a, groundAt, sound);
    const n = fruit.length;
    const whole = this.instanced(new THREE.SphereGeometry(1, 12, 9), toonMat(0xffffff), n);
    const half = halfGeometries();
    const shell = this.instanced(half.shell, toonMat(0xffffff), n * 2);
    const cap = this.instanced(half.cap, toonMat(0xffffff), n * 2);
    const flesh = new THREE.Color();
    fruit.forEach(({ p, r, color }, k) => {
      const skin = new THREE.Color(color);
      whole.setColorAt(k, skin);
      flesh.copy(skin).lerp(new THREE.Color(0xfff1d0), 0.55);
      for (const h of [0, 1]) {
        shell.setColorAt(k * 2 + h, skin);
        cap.setColorAt(k * 2 + h, flesh);
      }
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, Math.PI / 2));
      const rest = new THREE.Matrix4().compose(p, q, new THREE.Vector3(r, r, r));
      this.add({
        center: p.clone(),
        radius: r + 0.04,
        whole: [this.piece([whole], k, new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(r, r, r)), r, true)],
        cut: this.halves(rest, r, shell, cap, k),
        loose: [],
      });
    });
    for (const mesh of [whole, shell, cap]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
