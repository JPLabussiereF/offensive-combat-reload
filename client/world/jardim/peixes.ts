// The koi of the garden's ponds (FISH in shared/maps.ts, rules in KOI). They swim loops just under the
// surface, timed by the game clock (online the server's: everyone sees them in the same place). A shot or
// a knife kills one: the game decides what that gives (offline it decides, online the server does; see
// main.ts), the fish turns belly-up, floats and fades, and comes back a while later, now and then as a golden
// carp that glows. Each fish is one vertex-colored mesh (body, forked tail, fins, eyes and its variety's
// patches) whose body bends in an S as it swims; they're drawn after the water, which writes no depth.
import * as THREE from 'three';
import { mergeColoredParts, toonGradient, type ColoredPart } from '../../render/materials';
import type { WaterDrops } from '../hydrant';
import { raySphere } from './frutas';

type Kind = { body: number; patches: number[]; fin: number; crown?: boolean };
const KINDS: Kind[] = [
  { body: 0xf7f3ea, patches: [0xe0301e, 0xe0301e], fin: 0xfff4ea }, // kohaku
  { body: 0xf7f3ea, patches: [0xe0301e, 0x1b1530], fin: 0xfff4ea }, // sanke
  { body: 0xffb52e, patches: [0xffd36b], fin: 0xffe08a }, // ogon
  { body: 0x1b1530, patches: [0xe0301e, 0xf7f3ea], fin: 0xf2e6d8 }, // showa
  { body: 0xff7a1a, patches: [0xf7f3ea], fin: 0xffd2a8 }, // orange with white
  { body: 0xf7f3ea, patches: [], fin: 0xfff4ea, crown: true }, // tancho: a red crown only
];
const GOLDEN: Kind = { body: 0xffc21a, patches: [0xffe27a], fin: 0xffe9a8 };
/** The pond's water surface (basin() in kit.ts). */
const WATER_Y = -0.25;
const HALF = 0.27;

interface Variant {
  mesh: THREE.Mesh;
  /** Positions before the swimming bend. */
  base: Float32Array;
  mat: THREE.MeshToonMaterial;
}

interface Fish {
  id: string;
  cx: number;
  cz: number;
  r: number;
  y: number;
  size: number;
  /** Angular speed along the loop (rad/s, signed) and where on it the clock's zero is. */
  w: number;
  a0: number;
  phase: number;
  plain: Variant;
  gold: Variant;
  halo: THREE.Mesh;
  golden: boolean;
  state: 'alive' | 'dying' | 'dead';
  t: number;
  /** Game clock when it's back, and whether it comes back golden. */
  ready: number;
  nextGolden: boolean;
  fade: number;
  pos: THREE.Vector3;
  heading: THREE.Vector3;
  roll: number;
}

export type FishHit = { id: string; golden: boolean; d: number; point: THREE.Vector3 };

export class KoiSchool {
  private fish: Fish[] = [];
  private time = 0;
  private tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    specs: readonly { id: string; loop: readonly [number, number, number]; y: number }[],
    private drops: WaterDrops,
    rand: () => number,
  ) {
    const haloTex = glowTexture();
    specs.forEach((spec, i) => {
      const [cx, cz, r] = spec.loop;
      const size = 0.85 + rand() * 0.35;
      const plain = variant(scene, KINDS[i % KINDS.length], size, rand, 0x000000);
      const gold = variant(scene, GOLDEN, size, rand, 0xffa21a);
      gold.mesh.visible = false;
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(0.85 * size, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: haloTex, color: 0xffd36b, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.renderOrder = 3;
      halo.visible = false;
      scene.add(halo);
      const speed = (0.25 + rand() * 0.25) * (i % 2 ? 1 : -1);
      this.fish.push({
        id: spec.id,
        cx,
        cz,
        r,
        y: spec.y,
        size,
        w: (speed / Math.max(0.5, r)) * 2,
        a0: rand() * Math.PI * 2,
        phase: rand() * 6,
        plain,
        gold,
        halo,
        golden: false,
        state: 'alive',
        t: 0,
        ready: 0,
        nextGolden: false,
        fade: 1,
        pos: new THREE.Vector3(),
        heading: new THREE.Vector3(0, 0, 1),
        roll: 0,
      });
    });
  }

  /** Killed: belly-up now, back at `ready` (game clock), golden or not. */
  kill(id: string, ready: number, golden: boolean) {
    const f = this.fish.find((x) => x.id === id);
    if (!f) return;
    f.ready = ready;
    f.nextGolden = golden;
    if (f.state !== 'alive') return;
    f.state = 'dying';
    f.t = 0;
    for (let k = 0; k < 14; k++) this.drops.spawn(this.tmp.copy(f.pos).setY(WATER_Y + 0.02), 2.2, 1.1, WATER_Y);
  }

  /** How a fish is right now (joining a session): dead until `ready` (0: alive), golden when it's there. */
  set(id: string, ready: number, golden: boolean) {
    const f = this.fish.find((x) => x.id === id);
    if (!f) return;
    f.ready = ready;
    f.nextGolden = golden;
    if (ready > 0 && ready > this.time) {
      f.state = 'dead';
      f.fade = 0;
    } else this.revive(f, golden, true);
  }

  isAlive(id: string) {
    return this.fish.find((x) => x.id === id)?.state === 'alive';
  }

  /** The first live fish the shot from `o` along `dir` (unit) goes through within `dist`. */
  shot(o: THREE.Vector3, dir: THREE.Vector3, dist: number): FishHit | null {
    let best: FishHit | null = null;
    for (const f of this.fish) {
      if (f.state !== 'alive' || f.fade < 0.3) continue;
      // The body as three spheres from head to tail.
      for (const [along, rad] of [[0.17, 0.09], [0, 0.11], [-0.17, 0.08]] as const) {
        const c = this.tmp.copy(f.pos).addScaledVector(f.heading, along * f.size);
        const d = raySphere(o, dir, c, rad * f.size + 0.05);
        if (d === null || d > dist || (best && d >= best.d)) continue;
        best = { id: f.id, golden: f.golden, d, point: o.clone().addScaledVector(dir, d) };
      }
    }
    return best;
  }

  /** The nearest live fish in reach of a knife swing from `eye` looking along `fwd` (unit). */
  stab(eye: THREE.Vector3, fwd: THREE.Vector3, reach: number): FishHit | null {
    let best: FishHit | null = null;
    for (const f of this.fish) {
      if (f.state !== 'alive' || f.fade < 0.3) continue;
      const d = f.pos.distanceTo(eye);
      if (d > reach || (best && d >= best.d)) continue;
      if (this.tmp.subVectors(f.pos, eye).normalize().dot(fwd) < 0.6) continue;
      best = { id: f.id, golden: f.golden, d, point: f.pos.clone() };
    }
    return best;
  }

  update(dt: number, time: number) {
    this.time = time;
    for (const f of this.fish) {
      f.t += dt;
      if (f.state === 'dead') {
        if (time < f.ready) continue;
        this.revive(f, f.nextGolden, false);
      }
      const v = f.golden ? f.gold : f.plain;
      if (f.state === 'alive') {
        const a = f.a0 + f.w * time;
        f.pos.set(f.cx + Math.cos(a) * f.r, f.y, f.cz + Math.sin(a) * f.r * 0.7);
        // Along the loop: the ellipse's derivative.
        f.heading.set(-Math.sin(a) * f.r * Math.sign(f.w), 0, Math.cos(a) * f.r * 0.7 * Math.sign(f.w)).normalize();
        f.fade = Math.min(1, f.fade + dt / 1.2);
        f.phase += dt * (5 + Math.abs(f.w * f.r) * 3);
        bend(v, f.phase, 1);
      } else {
        // Dying: rolls belly-up, rises to the surface and drifts, then fades out.
        f.roll = Math.min(Math.PI, f.roll + dt * 5);
        f.pos.y += (WATER_Y - 0.06 - f.pos.y) * Math.min(1, dt * 2.5);
        f.pos.addScaledVector(f.heading, dt * 0.08 * Math.max(0, 1 - f.t / 2));
        bend(v, f.phase, Math.max(0, 1 - f.t * 2));
        if (f.t > 2.6) f.fade = Math.max(0, 1 - (f.t - 2.6));
        if (f.t > 3.6) {
          f.state = 'dead';
          f.fade = 0;
        }
      }
      v.mesh.visible = f.fade > 0;
      v.mesh.position.copy(f.pos);
      v.mesh.rotation.set(0, Math.atan2(f.heading.x, f.heading.z), f.state === 'alive' ? 0 : f.roll);
      v.mat.opacity = f.fade;
      if (f.golden) {
        // A soft glow: the body's light breathes and a halo follows it on the water.
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.6 + f.phase * 0.1);
        v.mat.emissiveIntensity = 0.35 + 0.35 * pulse;
        f.halo.visible = v.mesh.visible && f.state === 'alive';
        f.halo.position.set(f.pos.x, WATER_Y + 0.012, f.pos.z);
        (f.halo.material as THREE.MeshBasicMaterial).opacity = (0.35 + 0.25 * pulse) * f.fade;
      }
    }
  }

  private revive(f: Fish, golden: boolean, now: boolean) {
    f.state = 'alive';
    f.t = 0;
    f.roll = 0;
    f.fade = now ? 1 : 0;
    f.golden = golden;
    f.plain.mesh.visible = false;
    f.gold.mesh.visible = false;
    f.halo.visible = false;
  }
}

/** One look of a fish (a koi variety or the golden carp): its mesh, own material (it fades alone). */
function variant(scene: THREE.Scene, k: Kind, size: number, rand: () => number, emissive: number): Variant {
  const tint = new THREE.Color(0x3fa49c);
  const c = (hex: number) => new THREE.Color(hex).lerp(tint, emissive ? 0.05 : 0.18).getHex();
  const fin = (pts: [number, number][]) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v))));
  // Body: a sphere stretched along +Z (the head), squeezed toward the tail.
  const body = new THREE.SphereGeometry(1, 14, 9).scale(0.1, 0.085, HALF);
  const pos = body.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const taper = z < 0 ? 1 + (z / HALF) * 0.62 : 1 - (z / HALF) * 0.12;
    pos.setXYZ(i, pos.getX(i) * taper, pos.getY(i) * taper + (z > 0.18 ? -0.01 : 0), z);
  }
  body.computeVertexNormals();
  const parts: ColoredPart[] = [
    { geo: body, color: c(k.body), pos: [0, 0, 0] },
    // Forked tail, upright, behind the body.
    { geo: fin([[0, 0], [-0.09, 0.03], [-0.2, 0.1], [-0.15, 0], [-0.2, -0.1], [-0.09, -0.03]]), color: c(k.fin), pos: [0, 0, -0.25], rot: [0, -Math.PI / 2, 0] },
    // Dorsal fin along the back.
    { geo: fin([[0.09, 0], [0.04, 0.06], [-0.1, 0.05], [-0.12, 0]]), color: c(k.fin), pos: [0, 0.06, -0.02], rot: [0, -Math.PI / 2, 0] },
  ];
  // Pectoral fins, spread like little fans behind the head.
  for (const s of [-1, 1]) parts.push({ geo: fin([[0, 0], [0.08, 0.02], [0.07, 0.08], [0, 0.05]]), color: c(k.fin), pos: [s * 0.06, -0.04, 0.13], rot: [-Math.PI / 2, 0, 0], scale: [s, 1, 1] });
  for (const s of [-1, 1]) parts.push({ geo: new THREE.SphereGeometry(0.014, 6, 4), color: 0x1b1530, pos: [s * 0.055, 0.02, 0.21] });
  if (k.crown) parts.push({ geo: new THREE.SphereGeometry(0.045, 8, 5), color: c(0xe0301e), pos: [0, 0.055, 0.16], scale: [1, 0.35, 1] });
  // Height of the back at z, so the patches ride just above it.
  const back = (z: number) => 0.085 * Math.sqrt(Math.max(0, 1 - (z / HALF) ** 2)) * (z < 0 ? 1 + (z / HALF) * 0.62 : 1 - (z / HALF) * 0.12);
  k.patches.forEach((hex, n) => {
    const z = 0.1 - n * 0.15 + (rand() - 0.5) * 0.04;
    parts.push({ geo: new THREE.SphereGeometry(0.06, 8, 5), color: c(hex), pos: [(rand() - 0.5) * 0.03, back(z) - 0.012, z], scale: [1.2, 0.45, 1.5] });
  });
  const geo = mergeColoredParts(parts);
  parts.forEach((p) => p.geo.dispose());
  geo.scale(size, size, size);
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide, transparent: true, opacity: 1, emissive, emissiveIntensity: emissive ? 0.5 : 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.order = 'YXZ';
  mesh.renderOrder = 2;
  scene.add(mesh);
  return { mesh, base: Float32Array.from(geo.getAttribute('position').array as Float32Array), mat };
}

/** Swimming: an S-wave running down the body, stronger toward the tail (`amount` 0 holds it straight). */
function bend(v: Variant, phase: number, amount: number) {
  const pos = v.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const bz = v.base[i + 2];
    const t = Math.max(0, Math.min(1, (0.12 - bz) / 0.55));
    arr[i] = v.base[i] + 0.07 * amount * t * t * Math.sin(phase - bz * 9);
  }
  pos.needsUpdate = true;
}

/** Soft round glow: white in the middle fading out to the edge. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
