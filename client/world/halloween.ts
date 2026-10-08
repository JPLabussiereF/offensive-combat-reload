// Building blocks for the Halloween maps (the "Vila Assombrada" and the zumbi cemetery, whose pieces are in
// client/world/catalog): the night sky, ground
// mist, dead trees, tombstones with epitaphs, wrought-iron fences, hedges, jack-o'-lanterns and the animated
// gags: the grave's grumpy ghost, bells, pumpkins that smash, lamp posts that go out, the witch's cauldron
// and its rubber ducks, scarecrows that fall and get up, the shooting gallery, the Ferris wheel, the
// bonfire, the giant pumpkin, the grandfather clock, glowing mushrooms and bats.
// Static pieces go through the MapBuilder batches; only animated props are separate meshes. Every gag is
// registered on the PropBus, so online everyone in the session sees the same thing.
import { TOMB_BOXES, type TombKind } from '@shared/tombs';
import { treeShape, trunkOf } from '@shared/trees';
import * as THREE from 'three';
import { fitText } from './canvasText';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GROUP, groups, type PotionKind } from '@shared/constants';
import { mergeColoredParts, toon, toonGradient, type ColoredPart } from '../render/materials';
import { PackedInstances } from '../render/packedInstances';
import { MapBuilder, worldUVs } from './mapBuilder';
import { surfaceMaterial, type SurfaceKey } from './surfaces';
import { solidIntervals } from './oriental';
import type { PropBus } from './props';

export const SPOOKY = {
  grass: 0x5b6640,
  grassDark: 0x48522f,
  dirt: 0x5e4a35,
  path: 0x7a6e5e,
  stone: 0x9a968e,
  stoneDark: 0x66635e,
  moss: 0x5f6b4a,
  wood: 0x6b4a32,
  woodDark: 0x3f2a1e,
  plank: 0x8a6a4a,
  iron: 0x26242c,
  roof: 0x3a3442,
  roofRed: 0x5a2a2e,
  wine: 0x6e2f3a,
  mansion: 0x6a5560,
  trim: 0xcfc6b0,
  pumpkin: 0xf07a1a,
  stem: 0x4a5a2a,
  purple: 0x6a3a9a,
  hedge: 0x2f4a2a,
  asphalt: 0x45474e,
  candle: 0xffc861,
  window: 0xffb347,
} as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NO_ROT = new THREE.Quaternion();

// --- Glow, particles --------------------------------------------------------------------------------

/** Unlit, vertex-colored pieces (lit windows, candles, faces): merged into one mesh, one draw call. */
export class Glow {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const pos = src.getAttribute('position');
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', pos.clone());
    const c = new THREE.Color(color);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    geo.dispose();
  }

  finish(scene: THREE.Scene) {
    if (!this.parts.length) return;
    const merged = mergeGeometries(this.parts, false)!;
    this.parts.forEach((g) => g.dispose());
    this.parts = [];
    scene.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true })));
  }
}

const MAX_PUFFS = 260;

/** Soft rising puffs (flames, steam, smoke, the ghost's poof): one instanced mesh, only the live ones drawn. */
export class Puffs {
  private mesh: THREE.InstancedMesh;
  private packed: PackedInstances;
  private pos = new Float32Array(MAX_PUFFS * 3);
  private vel = new Float32Array(MAX_PUFFS * 3);
  private life = new Float32Array(MAX_PUFFS);
  private span = new Float32Array(MAX_PUFFS);
  private size = new Float32Array(MAX_PUFFS * 2);
  private cursor = 0;
  private m = new THREE.Matrix4();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }), MAX_PUFFS);
    this.mesh.frustumCulled = false;
    this.packed = new PackedInstances(this.mesh);
    scene.add(this.mesh);
  }

  emit(at: THREE.Vector3, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: THREE.ColorRepresentation) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PUFFS;
    this.pos.set([at.x, at.y, at.z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = this.span[i] = life;
    this.size.set([s0, s1], i * 2);
    this.packed.setColor(i, this.c.set(color));
  }

  update(dt: number) {
    const drag = Math.exp(-1.6 * dt);
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      this.vel[k] *= drag;
      this.vel[k + 2] *= drag;
      this.vel[k + 1] = this.vel[k + 1] * drag + 0.8 * dt;
      for (const a of [0, 1, 2]) this.pos[k + a] += this.vel[k + a] * dt;
      if (this.life[i] <= 0) this.packed.hide(i);
      else {
        const age = 1 - this.life[i] / this.span[i];
        const sz = (this.size[i * 2] + (this.size[i * 2 + 1] - this.size[i * 2]) * age) * Math.min(1, (1 - age) * 4);
        this.packed.set(i, this.m.compose(this.v.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]), NO_ROT, this.s.set(sz, sz, sz)));
      }
    }
    this.packed.flush();
  }
}

const MAX_DEBRIS = 160;

/** Chunks thrown by smashed props (pumpkin bits): fall, bounce once or twice, shrink away. Only the live ones drawn. */
export class Debris {
  private mesh: THREE.InstancedMesh;
  private packed: PackedInstances;
  private pos = new Float32Array(MAX_DEBRIS * 3);
  private vel = new Float32Array(MAX_DEBRIS * 3);
  private rot = new Float32Array(MAX_DEBRIS);
  private life = new Float32Array(MAX_DEBRIS);
  private sz = new Float32Array(MAX_DEBRIS);
  private floor = new Float32Array(MAX_DEBRIS);
  private cursor = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() }), MAX_DEBRIS);
    this.mesh.frustumCulled = false;
    this.packed = new PackedInstances(this.mesh);
    scene.add(this.mesh);
  }

  burst(at: THREE.Vector3, color: THREE.ColorRepresentation, n: number, speed: number, size: number, floor: number) {
    for (let j = 0; j < n; j++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_DEBRIS;
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.8;
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([Math.cos(a) * speed * (0.4 + Math.random()), speed * up * 1.4, Math.sin(a) * speed * (0.4 + Math.random())], i * 3);
      this.rot[i] = Math.random() * 6;
      this.life[i] = 2.2 + Math.random();
      this.sz[i] = size * (0.5 + Math.random() * 0.7);
      this.floor[i] = floor;
      this.packed.setColor(i, this.c.set(color).multiplyScalar(0.8 + Math.random() * 0.3));
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX_DEBRIS; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      this.vel[k + 1] -= 14 * dt;
      for (const a of [0, 1, 2]) this.pos[k + a] += this.vel[k + a] * dt;
      if (this.pos[k + 1] < this.floor[i] + this.sz[i] * 0.5) {
        this.pos[k + 1] = this.floor[i] + this.sz[i] * 0.5;
        this.vel[k + 1] = Math.abs(this.vel[k + 1]) * 0.3;
        this.vel[k] *= 0.6;
        this.vel[k + 2] *= 0.6;
      } else this.rot[i] += dt * 8;
      if (this.life[i] <= 0) this.packed.hide(i);
      else {
        const sz = this.sz[i] * Math.min(1, this.life[i] * 2);
        this.q.setFromEuler(this.e.set(this.rot[i], this.rot[i] * 0.7, 0));
        this.packed.set(i, this.m.compose(this.v.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]), this.q, this.s.set(sz, sz * 0.6, sz)));
      }
    }
    this.packed.flush();
  }
}

// --- Sky and mist -----------------------------------------------------------------------------------

/** Sky dome radius: inside the camera's far plane (400 m) from anywhere in a map up to ~100 m from the center. */
const SKY_R = 290;

/** Night sky: a gradient dome, stars and the full moon (with a halo) in direction `moonDir`. */
export function nightSky(scene: THREE.Scene, moonDir: THREE.Vector3) {
  const dome = new THREE.SphereGeometry(SKY_R, 32, 16);
  const pos = dome.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color(0x090a1f);
  const mid = new THREE.Color(0x1d1640);
  const horizon = new THREE.Color(0x4a2a55);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / SKY_R;
    if (h < 0.08) c.copy(horizon);
    else if (h < 0.35) c.copy(horizon).lerp(mid, (h - 0.08) / 0.27);
    else c.copy(mid).lerp(zenith, Math.min(1, (h - 0.35) / 0.5));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -2;
  scene.add(sky);

  const starPos: number[] = [];
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.12 + Math.random() * 0.88;
    const r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(a) * r * (SKY_R - 15), y * (SKY_R - 15), Math.sin(a) * r * (SKY_R - 15));
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xe8e4ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  stars.renderOrder = -1;
  scene.add(stars);

  const moonTex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#fff4d6';
    g.beginPath();
    g.arc(128, 128, 124, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(190, 175, 150, 0.55)';
    for (const [x, y, r] of [[90, 80, 26], [160, 110, 18], [120, 170, 30], [180, 170, 12], [70, 140, 14], [150, 60, 10]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
  const dir = moonDir.clone().normalize();
  const moon = new THREE.Mesh(new THREE.CircleGeometry(13, 40), new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false, depthWrite: false }));
  moon.position.copy(dir).multiplyScalar(SKY_R - 40);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -1;
  const haloTex = canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 236, 200, 0.55)');
    grad.addColorStop(0.4, 'rgba(200, 170, 255, 0.18)');
    grad.addColorStop(1, 'rgba(120, 80, 200, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.copy(dir).multiplyScalar(SKY_R - 38);
  halo.lookAt(0, 0, 0);
  halo.renderOrder = -1;
  scene.add(moon, halo);
}

/** Low mist drifting over the ground (cemetery, forest). Thin enough to never hide a player. */
export class GroundMist {
  private mesh: THREE.InstancedMesh;
  private specs: { x: number; z: number; r: number; y: number; phase: number; spin: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private t = 0;

  constructor(scene: THREE.Scene, patches: [x: number, z: number, r: number][], rand: () => number) {
    for (const [x, z, r] of patches) {
      for (let k = 0; k < 2; k++) this.specs.push({ x: x + (rand() - 0.5) * r * 0.4, z: z + (rand() - 0.5) * r * 0.4, r: r * (0.8 + rand() * 0.4), y: 0.25 + k * 0.35 + rand() * 0.1, phase: rand() * 6, spin: (rand() - 0.5) * 0.05 });
    }
    const tex = canvasTexture(128, 128, (g) => {
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x9a94c4, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat, Math.max(1, this.specs.length));
    this.mesh.count = this.specs.length;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.update(0);
  }

  update(dt: number) {
    this.t += dt;
    this.specs.forEach((p, i) => {
      const drift = Math.sin(this.t * 0.07 + p.phase) * 1.5;
      this.q.setFromEuler(this.e.set(0, p.phase + this.t * p.spin, 0));
      this.m.compose(this.v.set(p.x + drift, p.y, p.z + Math.cos(this.t * 0.05 + p.phase) * 1.2), this.q, this.s.set(p.r, 1, p.r));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --- Static pieces ----------------------------------------------------------------------------------

/** Tube along `curve` whose radius goes from r0 at the start to r1 at the end. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, segs: number, radial: number, r0: number, r1: number) {
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Dead tree: a crooked tapering trunk with bare, clawed branches. `scale` 1 ≈ 4 m tall; the plaza's giant
 * tree is ~2.6. Only the trunk collides (branches are visual: bullets fly through the canopy).
 */
export function deadTree(b: MapBuilder, x: number, z: number, scale: number, rand: () => number, o: { tint?: number; collide?: boolean; y?: number; branches?: number } = {}) {
  const s = scale;
  const y = o.y ?? 0;
  const paint = surfaceMaterial('pintura');
  const tint = o.tint ?? SPOOKY.woodDark;
  // Lean and height: the shared shape, so the zombie match knows the trunk too (shared/trees.ts).
  const shape = treeShape(rand, s);
  const { lean, lx, lz, h } = shape;
  const pts = [0, 0.3, 0.6, 0.85, 1].map((t) => V(x + lx * Math.sin(t * 2.4) * 0.55 * s + (rand() - 0.5) * 0.15 * s, y + t * h, z + lz * Math.sin(t * 2.4) * 0.55 * s + (rand() - 0.5) * 0.15 * s));
  const trunk = new THREE.CatmullRomCurve3(pts);
  const trunkGeo = taperedTube(trunk, 12, 7, 0.34 * s, 0.06 * s);
  b.addGeometry(trunkGeo, paint, tint);
  trunkGeo.dispose();
  // Roots flaring at the base.
  for (let k = 0; k < 4; k++) {
    const a = lean + k * 1.6 + rand() * 0.5;
    const root = new THREE.CatmullRomCurve3([V(x, y + 0.4 * s, z), V(x + Math.cos(a) * 0.45 * s, y + 0.12 * s, z + Math.sin(a) * 0.45 * s), V(x + Math.cos(a) * 0.85 * s, y - 0.05, z + Math.sin(a) * 0.85 * s)]);
    const g = taperedTube(root, 4, 5, 0.16 * s, 0.03 * s);
    b.addGeometry(g, paint, tint);
    g.dispose();
  }
  const n = o.branches ?? 4 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const t = 0.42 + (k / n) * 0.5 + rand() * 0.05;
    const from = trunk.getPointAt(Math.min(0.97, t));
    const a = lean + Math.PI + k * 2.4 + rand() * 0.7;
    const reach = (1.2 + rand() * 0.9) * s * (1.2 - t * 0.5);
    const tip = from.clone().add(V(Math.cos(a) * reach, (0.6 + rand() * 0.6) * s, Math.sin(a) * reach));
    const mid = from.clone().lerp(tip, 0.5).add(V(0, 0.35 * s, 0));
    // Clawed end: the tip droops a little.
    const claw = tip.clone().add(V(Math.cos(a) * 0.35 * s, -0.25 * s, Math.sin(a) * 0.35 * s));
    const branch = new THREE.CatmullRomCurve3([from, mid, tip, claw]);
    const g = taperedTube(branch, 7, 5, 0.11 * s * (1.1 - t * 0.5), 0.015 * s);
    b.addGeometry(g, paint, tint);
    g.dispose();
    const twigFrom = branch.getPointAt(0.55);
    const ta = a + (rand() < 0.5 ? 1 : -1) * (0.7 + rand() * 0.5);
    const twigTip = twigFrom.clone().add(V(Math.cos(ta) * 0.7 * s, 0.5 * s, Math.sin(ta) * 0.7 * s));
    const tg = taperedTube(new THREE.CatmullRomCurve3([twigFrom, twigFrom.clone().lerp(twigTip, 0.5).add(V(0, 0.12 * s, 0)), twigTip]), 4, 4, 0.045 * s, 0.01 * s);
    b.addGeometry(tg, paint, tint);
    tg.dispose();
  }
  if (o.collide !== false) {
    const t = trunkOf(x, y, z, s, shape);
    b.cuboidCollider(V(...t.c), V(...t.h), NO_ROT, 'wood', undefined, 'trunk');
  }
}

export type { TombKind };

/**
 * Tombstone at (x, z) facing `yaw` (0 = its face looks toward +Z), slightly crooked. Returns where an
 * epitaph goes: the center of its face and the size that fits.
 */
export function tombstone(b: MapBuilder, x: number, z: number, yaw: number, kind: TombKind, rand: () => number, tint: number = SPOOKY.stone) {
  const tilt = new THREE.Euler((rand() - 0.5) * 0.12, yaw, (rand() - 0.5) * 0.12, 'YXZ');
  const q = new THREE.Quaternion().setFromEuler(tilt);
  const m = new THREE.Matrix4().compose(V(x, 0, z), q, V(1, 1, 1));
  const mat = surfaceMaterial('pedra');
  const put = (geo: THREE.BufferGeometry, t = tint) => {
    geo.applyMatrix4(m);
    worldUVs(geo);
    b.addGeometry(geo, mat, t);
    geo.dispose();
  };
  // The collider is the shared table's box (shared/tombs.ts): the zombie match tells who stands on a stone by it.
  const { c, h } = TOMB_BOXES[kind];
  b.cuboidCollider(V(...c).applyMatrix4(m), V(...h), q, 'concrete');
  const face = (y: number, depth: number, w: number, h: number) => ({ at: V(0, y, depth + 0.012).applyMatrix4(m), yaw, w, h, tilt: q.clone() });
  put(new THREE.BoxGeometry(0.95, 0.16, 0.45).translate(0, 0.08, 0), SPOOKY.stoneDark);
  if (kind === 'arco') {
    put(new THREE.BoxGeometry(0.72, 0.8, 0.18).translate(0, 0.56, 0));
    put(new THREE.CylinderGeometry(0.36, 0.36, 0.18, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 0.96, 0));
    return face(0.72, 0.09, 0.62, 0.62);
  }
  if (kind === 'cruz') {
    put(new THREE.BoxGeometry(0.18, 1.55, 0.16).translate(0, 0.9, 0));
    put(new THREE.BoxGeometry(0.8, 0.18, 0.16).translate(0, 1.22, 0));
    return face(0.62, 0.08, 0.16, 0.5);
  }
  if (kind === 'laje') {
    put(new THREE.BoxGeometry(0.9, 0.28, 1.9).translate(0, 0.14, -0.9));
    put(new THREE.BoxGeometry(0.8, 0.62, 0.16).translate(0, 0.47, 0.05));
    return face(0.5, 0.13, 0.7, 0.45);
  }
  put(new THREE.CylinderGeometry(0.12, 0.3, 2.1, 4, 1).rotateY(Math.PI / 4).translate(0, 1.2, 0));
  put(new THREE.ConeGeometry(0.15, 0.3, 4).rotateY(Math.PI / 4).translate(0, 2.4, 0));
  return face(0.8, 0.18, 0.3, 0.4);
}

/** Carved letters on a tombstone face (transparent text over the stone, lit like the stone). */
export function epitaph(scene: THREE.Scene, f: ReturnType<typeof tombstone>, lines: string[]) {
  const W = 256;
  const H = Math.round((256 * f.h) / f.w);
  const tex = canvasTexture(W, H, (g) => {
    g.fillStyle = '#2a2622';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const size = Math.min(H / (lines.length + 0.6), W / 7.5);
    lines.forEach((line, i) => fitText(g, line, W / 2, (H * (i + 0.8)) / (lines.length + 0.6), W - 24, (px) => `${i === 0 ? 900 : 800} ${px}px Nunito, system-ui, sans-serif`, Math.round(size * (i === 0 ? 1 : 0.82))));
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.35, gradientMap: toonGradient() }));
  plate.position.copy(f.at);
  plate.quaternion.copy(f.tilt);
  scene.add(plate);
}

/** Crooked wooden sign on two posts, readable from both sides. */
export function signBoard(b: MapBuilder, scene: THREE.Scene, lines: string[], x: number, z: number, yaw: number, o: { bg?: string; fg?: string; height?: number; w?: number; h?: number; tilt?: number } = {}) {
  const w = o.w ?? 1.3;
  const h = o.h ?? 0.8;
  const height = o.height ?? 1.5;
  for (const side of [-1, 1]) {
    const ox = Math.cos(yaw) * side * (w / 2 - 0.08);
    const oz = -Math.sin(yaw) * side * (w / 2 - 0.08);
    b.cylinder(x + ox, 0, z + oz, 0.05, height + h / 2, 'madeira', { tint: SPOOKY.woodDark, segments: 6 });
  }
  const tex = canvasTexture(320, Math.round((320 * h) / w), (g) => {
    const H = g.canvas.height;
    g.fillStyle = o.bg ?? '#d9c8a6';
    g.fillRect(0, 0, 320, H);
    g.strokeStyle = '#2a1a12';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 310, H - 10);
    g.fillStyle = o.fg ?? '#2a1a12';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const rows = lines.length;
    // The posts stand in front of the board's edges: the text keeps clear of them.
    const textW = Math.min(280, 320 * ((w / 2 - 0.16) / (w / 2)));
    lines.forEach((line, i) =>
      fitText(g, line, 160, (H * (i + 0.75)) / (rows + 0.5), textW, (px) => (i === 0 ? `400 ${px}px "Lilita One", system-ui, sans-serif` : `800 ${px}px Nunito, system-ui, sans-serif`), Math.round(i === 0 ? H / (rows + 0.9) : H / (rows + 2.4))),
    );
  });
  const rot = new THREE.Euler(0, yaw, o.tilt ?? 0, 'YXZ');
  b.box(x, height, z, w, h, 0.06, 'madeira', { tint: 0x5a3a26, collide: false, rot });
  const faces = boardFaces(w, h, 0.06, tex);
  faces.position.set(x, height, z);
  faces.rotation.copy(rot);
  scene.add(faces);
}

/** Both painted faces of a board (front +Z, back -Z, each reading right from its side): one draw call. */
export function boardFaces(w: number, h: number, depth: number, map: THREE.Texture): THREE.Mesh {
  const front = new THREE.PlaneGeometry(w, h).translate(0, 0, depth / 2 + 0.003);
  const back = new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(0, 0, -depth / 2 - 0.003);
  return new THREE.Mesh(mergeGeometries([front, back], false)!, new THREE.MeshToonMaterial({ map, gradientMap: toonGradient() }));
}

/** Collider that stops players and grenades but not bullets (iron bars, railings you can shoot through). */
export function blocker(b: MapBuilder, center: THREE.Vector3, half: THREE.Vector3, rot: THREE.Quaternion = NO_ROT) {
  const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
    .setTranslation(center.x, center.y, center.z)
    .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
    .setCollisionGroups(groups(GROUP.BLOCKER, GROUP.PLAYER | GROUP.PROJECTILE));
  const col = b.physics.world.createCollider(desc, b.physics.staticBody);
  b.physics.surfaces.set(col.handle, { material: 'metal' });
  b.stats.colliders++;
}

/**
 * Wrought-iron fence along X (at z = fixed) or Z (at x = fixed), with spear-tipped bars and posts with
 * ball caps. Players can't pass; bullets fly between the bars. `gaps` are [from, to] along the fence.
 */
export function ironFence(b: MapBuilder, axis: 'x' | 'z', fixed: number, a: number, end: number, gaps: [number, number][] = [], h = 1.9) {
  const metal = surfaceMaterial('metal');
  const bar = new THREE.BoxGeometry(0.035, h - 0.1, 0.035);
  const tip = new THREE.ConeGeometry(0.045, 0.16, 4);
  const at = (s: number, y: number, depth = 0): [number, number, number] => (axis === 'x' ? [s, y, fixed + depth] : [fixed + depth, y, s]);
  for (const [s0, s1] of solidIntervals(a, end, gaps)) {
    const len = s1 - s0;
    const mid = (s0 + s1) / 2;
    for (const y of [0.22, h - 0.3]) {
      const rail = axis === 'x' ? new THREE.BoxGeometry(len, 0.05, 0.05) : new THREE.BoxGeometry(0.05, 0.05, len);
      b.addGeometry(rail.translate(...at(mid, y)), metal, SPOOKY.iron, false);
    }
    for (let s = s0 + 0.08; s < s1 - 0.04; s += 0.16) {
      b.addGeometry(bar.clone().translate(...at(s, (h - 0.1) / 2)), metal, SPOOKY.iron, false);
      b.addGeometry(tip.clone().translate(...at(s, h - 0.02)), metal, SPOOKY.iron, false);
    }
    const posts = Math.max(1, Math.round(len / 2.4));
    for (let k = 0; k <= posts; k++) {
      const s = s0 + (len * k) / posts;
      b.addGeometry(new THREE.BoxGeometry(0.12, h + 0.1, 0.12).translate(...at(s, (h + 0.1) / 2)), metal, SPOOKY.iron);
      b.addGeometry(new THREE.SphereGeometry(0.09, 8, 5).translate(...at(s, h + 0.16)), metal, SPOOKY.iron);
    }
    blocker(b, V(...at(mid, h / 2)), axis === 'x' ? V(len / 2, h / 2, 0.06) : V(0.06, h / 2, len / 2));
  }
  bar.dispose();
  tip.dispose();
}

/** Ornate iron gate frame: two stone pillars with lanterns and an arch with a sign across the top. */
export function gateArch(b: MapBuilder, scene: THREE.Scene, glow: Glow, axis: 'x' | 'z', fixed: number, s0: number, s1: number, text: string) {
  const at = (s: number, y: number): [number, number, number] => (axis === 'x' ? [s, y, fixed] : [fixed, y, s]);
  for (const s of [s0 - 0.35, s1 + 0.35]) {
    const [px, , pz] = at(s, 0);
    b.box(px, 1.4, pz, 0.7, 2.8, 0.7, 'pedra', { tint: SPOOKY.stoneDark });
    b.box(px, 2.9, pz, 0.85, 0.2, 0.85, 'pedra', { tint: SPOOKY.stone, collide: false });
    glow.add(new THREE.BoxGeometry(0.26, 0.34, 0.26).translate(px, 3.2, pz), SPOOKY.candle);
    b.box(px, 3.42, pz, 0.36, 0.1, 0.36, 'metal', { tint: SPOOKY.iron, collide: false });
  }
  const span = s1 - s0;
  const mid = (s0 + s1) / 2;
  const arch = new THREE.TorusGeometry(span / 2 + 0.1, 0.05, 4, 20, Math.PI);
  if (axis === 'z') arch.rotateY(Math.PI / 2);
  b.addGeometry(arch.translate(...at(mid, 2.9)), surfaceMaterial('metal'), SPOOKY.iron, false);
  const tex = canvasTexture(512, 96, (g) => {
    g.fillStyle = '#1c1a22';
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#d8cfb8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, text, 256, 52, 470, (px) => `400 ${px}px "Lilita One", system-ui, sans-serif`, 60);
  });
  const bw = Math.min(span, 4);
  const [bx, by, bz] = at(mid, 3.15 + span / 4);
  b.box(bx, by, bz, axis === 'x' ? bw : 0.05, 0.5, axis === 'x' ? 0.05 : bw, 'metal', { tint: SPOOKY.iron, collide: false });
  const board = boardFaces(bw, 0.5, 0.05, tex);
  board.position.set(bx, by, bz);
  if (axis === 'z') board.rotation.y = Math.PI / 2;
  scene.add(board);
}

/** Clipped hedge wall (blocks movement and sight) with a lumpy top; `gaps` are [from, to] along it. */
export function hedge(b: MapBuilder, axis: 'x' | 'z', fixed: number, a: number, end: number, gaps: [number, number][] = [], h = 2.6, t = 1.1) {
  const paint = surfaceMaterial('pintura');
  for (const [s0, s1] of solidIntervals(a, end, gaps)) {
    if (axis === 'x') b.span(s0, 0, fixed - t / 2, s1, h, fixed + t / 2, 'grama', { tint: SPOOKY.hedge });
    else b.span(fixed - t / 2, 0, s0, fixed + t / 2, h, s1, 'grama', { tint: SPOOKY.hedge });
    for (let s = s0 + 0.6; s < s1 - 0.3; s += 1.3) {
      const blob = new THREE.IcosahedronGeometry(0.62, 0).scale(1.1, 0.55, 0.95);
      b.addGeometry(axis === 'x' ? blob.translate(s, h, fixed) : blob.translate(fixed, h, s), paint, 0x35522e);
    }
  }
}

/** Ribbed, flattened pumpkin body and its stem, radius `r`, resting on y=0. */
function pumpkinParts(r: number): [body: THREE.BufferGeometry, stem: THREE.BufferGeometry] {
  const geo = new THREE.SphereGeometry(1, 18, 12);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const phi = Math.atan2(v.z, v.x);
    const rib = 1 - 0.09 * (0.5 - 0.5 * Math.cos(phi * 8));
    const dip = 1 - 0.18 * Math.pow(Math.abs(v.y), 6);
    pos.setXYZ(i, v.x * rib * r, v.y * 0.78 * r * dip, v.z * rib * r);
  }
  geo.computeVertexNormals();
  geo.translate(0, 0.74 * r, 0);
  const stem = new THREE.CylinderGeometry(0.07 * r, 0.12 * r, 0.38 * r, 6).rotateX(0.15).rotateZ(-0.25).translate(0.03 * r, 1.58 * r, 0);
  return [geo, stem];
}

/** Pumpkin as one vertex-colored geometry (instanced meshes). */
export function pumpkinGeometry(r: number, body: number = SPOOKY.pumpkin): THREE.BufferGeometry {
  const [geo, stem] = pumpkinParts(r);
  return mergeColoredParts([
    { geo, color: body, pos: [0, 0, 0] },
    { geo: stem, color: SPOOKY.stem, pos: [0, 0, 0] },
  ]);
}

/** Pumpkin into the static batches: body and stem tinted apart (batches color by tint, not vertex colors). */
function batchPumpkin(b: MapBuilder, m: THREE.Matrix4, r: number) {
  const [body, stem] = pumpkinParts(r);
  b.addGeometry(body.applyMatrix4(m), surfaceMaterial('pintura'), SPOOKY.pumpkin);
  b.addGeometry(stem.applyMatrix4(m), surfaceMaterial('pintura'), SPOOKY.stem);
  body.dispose();
  stem.dispose();
}

/** A jack-o'-lantern face on the +Z side of a pumpkin of radius `r` (eyes, nose, toothy grin). */
export function pumpkinFace(r: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shape = (pts: [number, number][]) => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * r, y * r)));
    const g = new THREE.ShapeGeometry(s);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    // Hug the curved surface: each vertex sits just in front of the body at its own x/y.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / r;
      const y = pos.getY(i) / r;
      const d = Math.sqrt(Math.max(0.05, 1 - x * x - (y / 0.78) * (y / 0.78))) * 0.99 + 0.035;
      pos.setXYZ(i, pos.getX(i), pos.getY(i) + 0.74 * r, d * r);
    }
    parts.push(g);
  };
  for (const s of [-1, 1]) shape([[s * 0.2, 0.08], [s * 0.48, 0.08], [s * 0.34, 0.34]]);
  shape([[-0.07, -0.04], [0.07, -0.04], [0, 0.08]]);
  shape([[-0.5, -0.12], [-0.34, -0.2], [-0.28, -0.12], [-0.18, -0.22], [-0.06, -0.14], [0.06, -0.24], [0.18, -0.14], [0.28, -0.22], [0.36, -0.13], [0.5, -0.12], [0.38, -0.36], [0.2, -0.44], [0.08, -0.36], [-0.04, -0.46], [-0.2, -0.42], [-0.36, -0.36]]);
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()), false)!;
  parts.forEach((g) => g.dispose());
  return merged;
}

/** Static jack-o'-lantern (no gag): body into the batches, face into the glow mesh. */
export function staticPumpkin(b: MapBuilder, glow: Glow, x: number, y: number, z: number, yaw: number, r: number, face = true) {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), V(1, 1, 1));
  batchPumpkin(b, m, r);
  if (face) glow.add(pumpkinFace(r).applyMatrix4(m), 0xffa632);
}

// --- Animated gags ----------------------------------------------------------------------------------

/** Comic speech bubble floating over a prop (the ghost, the bell, the distant neighbour). */
export class SpeechBubble {
  readonly sprite: THREE.Sprite;
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private timer = 0;
  private mat: THREE.SpriteMaterial;

  constructor(width = 2.8) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    this.g = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(width, width / 2, 1);
    this.sprite.center.set(0.5, 0);
    this.sprite.visible = false;
    this.sprite.renderOrder = 5;
  }

  say(text: string, seconds = 3.2) {
    const g = this.g;
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = '#fffdf6';
    g.strokeStyle = '#1b1530';
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(14, 14, 484, 180, 40);
    g.moveTo(230, 192);
    g.lineTo(256, 246);
    g.lineTo(290, 192);
    g.fill();
    g.stroke();
    g.fillRect(232, 180, 56, 18);
    g.fillStyle = '#1b1530';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 54;
    let lines: string[] = [];
    // Shrink until the text fits in three lines.
    for (; size >= 28; size -= 4) {
      g.font = `400 ${size}px "Lilita One", system-ui, sans-serif`;
      lines = [];
      let line = '';
      for (const word of text.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (g.measureText(next).width > 440 && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
      if (lines.length <= 3) break;
    }
    lines.forEach((l, i) => g.fillText(l, 256, 104 + (i - (lines.length - 1) / 2) * size * 1.05));
    this.tex.needsUpdate = true;
    this.timer = seconds;
    this.sprite.visible = true;
  }

  update(dt: number) {
    if (this.timer <= 0) return;
    this.timer -= dt;
    this.mat.opacity = Math.min(1, this.timer * 3, this.mat.opacity + dt * 8);
    if (this.timer <= 0) this.sprite.visible = false;
  }
}

const GHOST_LINES = [
  ['Dá pra parar de atirar na minha casa?', 'Eu estou tentando dormir!', 'Eu já morri, cara!', 'Você não tem nada melhor pra fazer?'],
  ['DE NOVO?!', 'Isso é invasão de túmulo!', 'Vou reclamar com o coveiro.', 'Tem gente descansando aqui, sabia?'],
  ['Nem morto eu tenho paz!', 'Vou chamar a polícia... dos mortos.', 'Eu vou te assombrar até o fim da partida.', 'Cansei. Vou me mudar pro mausoléu.'],
];

/**
 * The cemetery's main grave. Shoot it and a ghost rises complaining, then goes back to sleep; the more
 * often it is woken, the grumpier the lines (synchronized as "fantasma").
 */
export class GraveGhost {
  /** Times it was woken (secrets read this). */
  activations = 0;
  private root = new THREE.Group();
  private body = new THREE.Group();
  private bubble = new SpeechBubble(3.2);
  private state: 'down' | 'rising' | 'up' | 'sinking' = 'down';
  private t = 0;
  private stateT = 0;
  private extraLine = 0;

  constructor(scene: THREE.Scene, b: MapBuilder, props: PropBus, private at: THREE.Vector3, yaw: number, private puffs: Puffs, private sfx: { moan(): void; talk(): void }) {
    const profile = [[0.5, 0], [0.47, 0.3], [0.43, 0.7], [0.41, 1.0], [0.37, 1.2], [0.27, 1.38], [0.13, 1.48], [0, 1.52]].map(([r, y]) => new THREE.Vector2(r, y));
    const sheet = new THREE.LatheGeometry(profile, 18);
    const pos = sheet.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0.01) continue;
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      pos.setY(i, Math.sin(a * 6) * 0.07);
    }
    sheet.computeVertexNormals();
    const ghostMat = new THREE.MeshToonMaterial({ color: 0xeaf6ff, emissive: 0x3a5a7a, transparent: true, opacity: 0.88, gradientMap: toonGradient(), side: THREE.DoubleSide });
    this.body.add(new THREE.Mesh(sheet, ghostMat));
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.35, 3, 8), ghostMat);
      arm.position.set(s * 0.45, 0.95, 0.05);
      arm.rotation.z = s * 1.0;
      this.body.add(arm);
    }
    const black = new THREE.MeshBasicMaterial({ color: 0x14101e });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 1.4, 0.5), black);
      eye.position.set(s * 0.13, 1.22, 0.36);
      this.body.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6).scale(1.2, 0.8, 0.4), black);
    mouth.position.set(0, 1.02, 0.39);
    this.body.add(mouth);
    this.root.add(this.body);
    this.bubble.sprite.position.set(0, 2.05, 0);
    this.root.add(this.bubble.sprite);
    this.root.position.copy(at);
    this.root.rotation.y = yaw;
    this.body.visible = false;
    scene.add(this.root);

    // The grave: a dirt mound in front of a big headstone. Shooting the mound (or the stone) wakes him.
    const wake = props.register('fantasma', (t) => this.wake(t.from));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const mound = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.75, 0.32, 1.25);
    b.addGeometry(mound.applyQuaternion(q).translate(at.x, at.y, at.z), surfaceMaterial('grama'), SPOOKY.dirt);
    b.cuboidCollider(V(at.x, at.y + 0.15, at.z), V(0.7, 0.15, 1.2), q, 'grass', wake);
  }

  /** `from`: the shooter (he faces them when he rises); unknown keeps his last facing. */
  private wake(from: THREE.Vector3 | null) {
    if (this.state !== 'down') {
      // Shot again while complaining: one extra line, now and then.
      if (this.state === 'up' && this.t - this.extraLine > 1.6) {
        this.extraLine = this.t;
        this.stateT = Math.min(this.stateT, 0.5);
        this.bubble.say(['EI!', 'PAAARA!', 'Sério mesmo?', 'Eu tô bem aqui!'][(this.activations + Math.floor(this.t)) % 4], 2.6);
        this.sfx.talk();
      }
      return;
    }
    const tier = GHOST_LINES[Math.min(GHOST_LINES.length - 1, Math.floor(this.activations / 4))];
    this.bubble.say(tier[this.activations % 4], 3.6);
    this.activations++;
    if (from) this.root.rotation.y = Math.atan2(from.x - this.at.x, from.z - this.at.z);
    this.state = 'rising';
    this.stateT = 0;
    this.body.visible = true;
    this.sfx.moan();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.puffs.emit(this.at, Math.cos(a) * 1.4, 0.6 + Math.random(), Math.sin(a) * 1.4, 0.9, 0.12, 0.35, 0xcfe4ff);
    }
  }

  update(dt: number) {
    this.t += dt;
    this.stateT += dt;
    this.bubble.update(dt);
    if (this.state === 'down') return;
    const bob = Math.sin(this.t * 2.6) * 0.08;
    let y = 0.25 + bob;
    if (this.state === 'rising') {
      const k = Math.min(1, this.stateT / 0.7);
      y = -1.6 + (1.85 + bob) * (1 - (1 - k) * (1 - k));
      if (k >= 1) this.setState('up');
      else if (Math.floor(this.stateT * 10) !== Math.floor((this.stateT - dt) * 10)) this.sfx.talk();
    } else if (this.state === 'up') {
      if (this.stateT > 3.6) this.setState('sinking');
    } else {
      const k = Math.min(1, this.stateT / 0.8);
      y = 0.25 + bob - 1.85 * k * k;
      if (k >= 1) {
        this.state = 'down';
        this.body.visible = false;
      }
    }
    this.body.position.y = y;
    this.body.rotation.z = Math.sin(this.t * 1.7) * 0.08;
    this.body.scale.set(1 + Math.sin(this.t * 3.1) * 0.03, 1, 1);
  }

  private setState(s: 'up' | 'sinking') {
    this.state = s;
    this.stateT = 0;
  }
}

/** Bronze bell hanging from a beam: swings and rings when shot. `onRing` gets how many rings in 8 s. */
export class Bell {
  /** Times it rang (secrets read this). */
  rings = 0;
  private pivot = new THREE.Group();
  private angle = 0;
  private vel = 0;
  private recent: number[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, b: MapBuilder, at: THREE.Vector3, size: number, props: PropBus, id: string, onRing: (recent: number) => void) {
    const s = size;
    const profile = [[0.02, 0], [0.16, 0], [0.22, -0.07], [0.25, -0.28], [0.32, -0.5], [0.42, -0.62], [0.45, -0.68]].map(([r, y]) => new THREE.Vector2(r * s, y * s));
    const bronze = new THREE.MeshToonMaterial({ color: 0xc9923a, emissive: 0x2a1806, gradientMap: toonGradient(), side: THREE.DoubleSide });
    const bell = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), bronze);
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), toon(0x5a4a3a));
    clapper.position.y = -0.6 * s;
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.12 * s, 0.5 * s), toon(SPOOKY.woodDark));
    this.pivot.add(bell, clapper, yoke);
    this.pivot.position.copy(at);
    this.pivot.traverse((o) => (o.castShadow = true));
    scene.add(this.pivot);
    const hit = props.register(id, () => {
      this.vel += this.vel >= 0 ? 2.2 : -2.2;
      this.rings++;
      this.recent.push(this.t);
      this.recent = this.recent.filter((r) => this.t - r < 8);
      onRing(this.recent.length);
    });
    b.ballCollider(V(at.x, at.y - 0.38 * s, at.z), 0.4 * s, 'metal', hit);
  }

  update(dt: number) {
    this.t += dt;
    this.vel = (this.vel - 18 * this.angle * dt) * Math.exp(-0.8 * dt);
    this.angle += this.vel * dt;
    this.pivot.rotation.x = this.angle;
  }
}

/**
 * Jack-o'-lanterns that smash when shot (orange chunks everywhere) and grow back later (synchronized as
 * "abobora:N"). Bodies and faces are two instanced meshes.
 */
export class Pumpkins {
  private specs: { pos: THREE.Vector3; yaw: number; s: number; id?: string; smashed: number; grow: number; col: RAPIER.Collider | null; hit: (() => void) | null }[] = [];
  private bodies!: THREE.InstancedMesh;
  private faces!: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sv = new THREE.Vector3();
  private t = 0;

  /** `id`: its PropBus id (default "abobora:N", N its order here). */
  add(x: number, y: number, z: number, yaw: number, s = 1, id?: string) {
    this.specs.push({ pos: V(x, y, z), yaw, s, id, smashed: 0, grow: 1, col: null, hit: null });
  }

  finish(scene: THREE.Scene, b: MapBuilder, props: PropBus, debris: Debris, onSmash: (at: THREE.Vector3) => void) {
    const n = this.specs.length;
    const R = 0.32;
    this.bodies = new THREE.InstancedMesh(pumpkinGeometry(R), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }), Math.max(1, n));
    this.faces = new THREE.InstancedMesh(pumpkinFace(R), new THREE.MeshBasicMaterial({ color: 0xffa632 }), Math.max(1, n));
    this.bodies.count = this.faces.count = n;
    this.bodies.castShadow = true;
    scene.add(this.bodies, this.faces);
    this.specs.forEach((p, i) => {
      const center = V(p.pos.x, p.pos.y + 0.26 * p.s, p.pos.z);
      const onShot = props.register(p.id ?? `abobora:${i}`, () => {
        if (p.smashed > 0) return;
        p.smashed = 28;
        p.col?.setEnabled(false);
        debris.burst(center, SPOOKY.pumpkin, 9, 3.2, 0.11 * p.s, p.pos.y);
        debris.burst(center, 0xffd27a, 4, 2.4, 0.07 * p.s, p.pos.y);
        onSmash(center);
      });
      p.hit = onShot;
      p.col = b.ballCollider(center, 0.3 * p.s, 'wood', onShot);
    });
    this.update(0);
  }

  /** A knife swing from `eye` along `fwd`: smashes the nearest whole pumpkin in reach and in front; its center, or null. */
  stab(eye: THREE.Vector3, fwd: THREE.Vector3, reach: number): THREE.Vector3 | null {
    let best: (typeof this.specs)[number] | null = null;
    let bestD = Infinity;
    const to = new THREE.Vector3();
    for (const p of this.specs) {
      if (p.smashed > 0 || p.grow < 1) continue;
      to.set(p.pos.x, p.pos.y + 0.26 * p.s, p.pos.z).sub(eye);
      const d = to.length();
      if (d > reach + 0.3 * p.s || d < 1e-3 || to.dot(fwd) / d < 0.6 || d >= bestD) continue;
      best = p;
      bestD = d;
    }
    if (!best) return null;
    best.hit?.();
    return V(best.pos.x, best.pos.y + 0.26 * best.s, best.pos.z);
  }

  update(dt: number) {
    this.t += dt;
    this.specs.forEach((p, i) => {
      if (p.smashed > 0) {
        p.smashed -= dt;
        p.grow = 0;
        if (p.smashed <= 0) p.col?.setEnabled(true);
      } else if (p.grow < 1) p.grow = Math.min(1, p.grow + dt * 2.5);
      // Pops back with a little overshoot.
      const k = p.grow >= 1 ? 1 : p.grow * (1 + 0.35 * Math.sin(p.grow * Math.PI));
      const flick = 1 + Math.sin(this.t * 9 + i * 2.3) * 0.02;
      this.q.setFromEuler(this.e.set(0, p.yaw, 0));
      this.m.compose(p.pos, this.q, this.sv.setScalar(p.s * k));
      this.bodies.setMatrixAt(i, this.m);
      this.m.compose(p.pos, this.q, this.sv.setScalar(p.s * k * flick));
      this.faces.setMatrixAt(i, this.m);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.faces.instanceMatrix.needsUpdate = true;
  }
}

export interface LampSpec {
  x: number;
  z: number;
  /** Direction the arm reaches out to (unit, on the ground plane). */
  dir: [number, number];
  flicker?: boolean;
}

/** Old street lamps. Some flicker; shooting the lamp puts it out for a while ("poste:N"). */
export class LampPosts {
  private specs: (LampSpec & { id?: string; head: THREE.Vector3; out: number; flick: number })[] = [];
  private heads!: THREE.InstancedMesh;
  private c = new THREE.Color();
  private t = 0;

  /** `id`: its PropBus id (default "poste:N", N its order here). */
  add(spec: LampSpec, id?: string) {
    this.specs.push({ ...spec, id, head: V(spec.x + spec.dir[0] * 0.85, 4.05, spec.z + spec.dir[1] * 0.85), out: 0, flick: 0 });
  }

  /** Where each lamp shines from and whether it's lit right now (for real lights, see LightPool). */
  lights(): LightSpot[] {
    return this.specs.map((p) => ({ at: V(p.head.x, p.head.y - 0.3, p.head.z), color: new THREE.Color(0xffc878), intensity: 14, range: 16, on: () => p.out <= 0 && p.flick >= 0 }));
  }

  finish(scene: THREE.Scene, b: MapBuilder, props: PropBus, onOut: (at: THREE.Vector3) => void) {
    const n = this.specs.length;
    const iron = { tint: SPOOKY.iron };
    this.heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, n));
    this.heads.count = n;
    scene.add(this.heads);
    const m = new THREE.Matrix4();
    this.specs.forEach((p, i) => {
      b.cylinder(p.x, 0, p.z, 0.16, 0.5, 'metal', { ...iron, segments: 8 });
      b.cylinder(p.x, 0.5, p.z, 0.07, 4.0, 'metal', { ...iron, segments: 8, radiusTop: 0.05 });
      const arm = new THREE.BoxGeometry(0.06, 0.06, 0.9).translate(0, 0, 0.45);
      const yaw = Math.atan2(p.dir[0], p.dir[1]);
      arm.applyMatrix4(new THREE.Matrix4().compose(V(p.x, 4.4, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), V(1, 1, 1)));
      b.addGeometry(arm, surfaceMaterial('metal'), SPOOKY.iron);
      b.box(p.head.x, 4.28, p.head.z, 0.36, 0.08, 0.36, 'metal', { ...iron, collide: false });
      b.box(p.head.x, 4.4, p.head.z, 0.04, 0.16, 0.04, 'metal', { ...iron, collide: false });
      b.box(p.head.x, 3.86, p.head.z, 0.3, 0.06, 0.3, 'metal', { ...iron, collide: false });
      for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(p.head.x + ox * 0.13, 4.07, p.head.z + oz * 0.13, 0.03, 0.4, 0.03, 'metal', { ...iron, collide: false, castShadow: false });
      m.makeTranslation(p.head.x, p.head.y, p.head.z);
      this.heads.setMatrixAt(i, m);
      const onShot = props.register(p.id ?? `poste:${i}`, () => {
        if (p.out > 0) return;
        p.out = 45;
        onOut(p.head);
      });
      b.cuboidCollider(p.head, V(0.18, 0.2, 0.18), NO_ROT, 'glass', onShot);
    });
    this.update(0);
  }

  update(dt: number) {
    this.t += dt;
    this.specs.forEach((p, i) => {
      let k = 1;
      if (p.out > 0) {
        p.out -= dt;
        k = 0.08;
      } else if (p.flicker) {
        p.flick -= dt;
        if (p.flick < -0.15) p.flick = Math.random() * 3;
        if (p.flick < 0) k = Math.random() < 0.5 ? 0.15 : 0.6;
      }
      this.c.setRGB(1 * k + 0.12 * (1 - k), 0.84 * k + 0.1 * (1 - k), 0.5 * k + 0.08 * (1 - k));
      this.heads.setColorAt(i, this.c);
    });
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
  }
}

const POTION = [0x6cff4a, 0xb04aff, 0xff8a2a, 0x4affe1, 0xff4ad8];

/**
 * The witch's cauldron: bubbles and changes color when shot; every fifth shot it spits out a rubber duck
 * that waddles around the cabin floor (synchronized as "caldeirao"). Ducks quack now and then.
 */
export class Cauldron {
  /** Shots it took (secrets read this). */
  stirs = 0;
  readonly light: THREE.PointLight;
  private liquid: THREE.MeshBasicMaterial;
  private surfaceY: number;
  private color = new THREE.Color(POTION[0]);
  private target = new THREE.Color(POTION[0]);
  private ducks: { mesh: THREE.Mesh; x: number; z: number; yaw: number; hop: number; from: THREE.Vector3; to: THREE.Vector3; quack: number; turn: number }[] = [];
  private duckGeo: THREE.BufferGeometry;
  private duckMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  private steam = 0;
  private t = 0;

  constructor(private scene: THREE.Scene, b: MapBuilder, private at: THREE.Vector3, props: PropBus, private puffs: Puffs, private area: { x0: number; x1: number; z0: number; z1: number }, private sfx: { bubble(at: THREE.Vector3): void; quack(at: THREE.Vector3): void }) {
    const { x, y, z } = at;
    const profile = [[0, -0.42], [0.42, -0.4], [0.64, -0.15], [0.68, 0.08], [0.6, 0.3], [0.56, 0.36], [0.64, 0.4], [0.6, 0.44]].map(([r, h]) => new THREE.Vector2(r, h));
    const pot = new THREE.LatheGeometry(profile, 18).translate(x, y + 0.85, z);
    b.addGeometry(pot, surfaceMaterial('metal'), 0x2a2a30);
    pot.dispose();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      b.box(x + Math.cos(a) * 0.4, y + 0.22, z + Math.sin(a) * 0.4, 0.08, 0.45, 0.08, 'metal', { tint: 0x2a2a30, collide: false, rot: new THREE.Euler(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25) });
    }
    // Embers under the pot.
    for (let k = 0; k < 4; k++) b.box(x, y + 0.08, z, 0.9, 0.12, 0.12, 'madeira', { tint: SPOOKY.woodDark, collide: false, rot: new THREE.Euler(0, (k / 4) * Math.PI, 0) });
    this.surfaceY = y + 1.2;
    this.liquid = new THREE.MeshBasicMaterial({ color: this.color });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.56, 20).rotateX(-Math.PI / 2), this.liquid);
    disc.position.set(x, this.surfaceY, z);
    scene.add(disc);
    this.light = new THREE.PointLight(this.color, 6, 7, 1.6);
    this.light.position.set(x, y + 1.7, z);
    scene.add(this.light);
    const stir = props.register('caldeirao', () => this.stir());
    b.cuboidCollider(V(x, y + 0.65, z), V(0.62, 0.65, 0.62), NO_ROT, 'metal', stir);
    this.duckGeo = mergeColoredParts([
      { geo: new THREE.SphereGeometry(0.16, 12, 8), color: 0xffd23f, pos: [0, 0.13, 0], scale: [1, 0.8, 1.25] },
      { geo: new THREE.SphereGeometry(0.1, 10, 8), color: 0xffd23f, pos: [0, 0.3, 0.12] },
      { geo: new THREE.ConeGeometry(0.05, 0.12, 6), color: 0xff8a1a, pos: [0, 0.29, 0.25], rot: [Math.PI / 2, 0, 0], scale: [1.4, 1, 0.6] },
      { geo: new THREE.SphereGeometry(0.02, 6, 4), color: 0x111111, pos: [0.055, 0.34, 0.2] },
      { geo: new THREE.SphereGeometry(0.02, 6, 4), color: 0x111111, pos: [-0.055, 0.34, 0.2] },
      { geo: new THREE.ConeGeometry(0.06, 0.12, 6), color: 0xffd23f, pos: [0, 0.2, -0.2], rot: [-1.1, 0, 0] },
    ]);
  }

  private stir() {
    this.stirs++;
    this.target.set(POTION[this.stirs % POTION.length]);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.4;
      this.puffs.emit(V(this.at.x + Math.cos(a) * r, this.surfaceY, this.at.z + Math.sin(a) * r), Math.cos(a) * 0.6, 1.5 + Math.random() * 1.5, Math.sin(a) * 0.6, 0.8, 0.08, 0.22, this.target);
    }
    this.sfx.bubble(this.at);
    if (this.stirs % 5 === 0) this.spawnDuck();
  }

  private spawnDuck() {
    if (this.ducks.length >= 3) {
      const old = this.ducks.shift()!;
      this.scene.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(this.duckGeo, this.duckMat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    const from = V(this.at.x, this.surfaceY, this.at.z);
    const to = V(this.at.x + Math.cos(a) * 1.4, this.at.y, this.at.z + Math.sin(a) * 1.4);
    to.x = THREE.MathUtils.clamp(to.x, this.area.x0, this.area.x1);
    to.z = THREE.MathUtils.clamp(to.z, this.area.z0, this.area.z1);
    this.ducks.push({ mesh, x: to.x, z: to.z, yaw: a + Math.PI / 2, hop: 0, from, to, quack: 1 + Math.random() * 3, turn: 0 });
    this.sfx.quack(from);
  }

  update(dt: number) {
    this.t += dt;
    this.color.lerp(this.target, Math.min(1, dt * 3));
    this.liquid.color.copy(this.color);
    this.light.color.copy(this.color);
    this.light.intensity = 5 + Math.sin(this.t * 7) * 0.8 + Math.sin(this.t * 13) * 0.5;
    this.steam -= dt;
    if (this.steam <= 0) {
      this.steam = 0.18;
      this.puffs.emit(V(this.at.x + (Math.random() - 0.5) * 0.6, this.surfaceY + 0.05, this.at.z + (Math.random() - 0.5) * 0.6), 0, 0.5 + Math.random() * 0.4, 0, 1.6, 0.08, 0.3, this.color.clone().lerp(new THREE.Color(0xffffff), 0.5));
    }
    for (const d of this.ducks) {
      if (d.hop < 1) {
        d.hop = Math.min(1, d.hop + dt * 1.6);
        d.mesh.position.lerpVectors(d.from, d.to, d.hop);
        d.mesh.position.y += Math.sin(d.hop * Math.PI) * 1.0;
        d.mesh.rotation.set(d.hop * Math.PI * 2, d.yaw, 0);
        continue;
      }
      d.turn -= dt;
      if (d.turn <= 0) {
        d.turn = 1.5 + Math.random() * 2.5;
        d.yaw += (Math.random() - 0.5) * 2.4;
      }
      const sp = 0.5;
      const nx = d.x + Math.sin(d.yaw) * sp * dt;
      const nz = d.z + Math.cos(d.yaw) * sp * dt;
      const far = Math.hypot(nx - this.at.x, nz - this.at.z) < 0.9;
      if (nx < this.area.x0 || nx > this.area.x1 || nz < this.area.z0 || nz > this.area.z1 || far) d.yaw += Math.PI * 0.7;
      else {
        d.x = nx;
        d.z = nz;
      }
      d.mesh.position.set(d.x, this.at.y + Math.abs(Math.sin(this.t * 9)) * 0.03, d.z);
      d.mesh.rotation.set(0, d.yaw, Math.sin(this.t * 9) * 0.18);
      d.quack -= dt;
      if (d.quack <= 0) {
        d.quack = 5 + Math.random() * 8;
        this.sfx.quack(d.mesh.position);
      }
    }
  }
}

/** Scarecrows: knocked over when shot, they lie there a moment and get back up ("espantalho:N"). */
export class Scarecrows {
  private specs: { x: number; z: number; yaw: number; id?: string; pivot: THREE.Group; state: 'up' | 'falling' | 'down' | 'rising'; t: number; cols: RAPIER.Collider[] }[] = [];

  /** `id`: its PropBus id (default "espantalho:N", N its order here). */
  add(x: number, z: number, yaw: number, id?: string) {
    this.specs.push({ x, z, yaw, id, pivot: new THREE.Group(), state: 'up', t: 0, cols: [] });
  }

  finish(scene: THREE.Scene, b: MapBuilder, props: PropBus, onFall: (at: THREE.Vector3) => void) {
    const geo = mergeColoredParts([
      { geo: new THREE.CylinderGeometry(0.05, 0.06, 2.1, 6), color: SPOOKY.wood, pos: [0, 1.05, 0] },
      { geo: new THREE.CylinderGeometry(0.04, 0.04, 1.7, 6), color: SPOOKY.wood, pos: [0, 1.55, 0], rot: [0, 0, Math.PI / 2] },
      { geo: new THREE.BoxGeometry(0.55, 0.62, 0.26), color: 0x8a3a2a, pos: [0, 1.4, 0] },
      { geo: new THREE.BoxGeometry(0.5, 0.06, 0.28), color: 0x4a2a1a, pos: [0, 1.12, 0] },
      { geo: new THREE.CylinderGeometry(0.1, 0.13, 0.55, 6), color: 0x8a3a2a, pos: [-0.5, 1.55, 0], rot: [0, 0, Math.PI / 2] },
      { geo: new THREE.CylinderGeometry(0.1, 0.13, 0.55, 6), color: 0x8a3a2a, pos: [0.5, 1.55, 0], rot: [0, 0, -Math.PI / 2] },
      { geo: new THREE.ConeGeometry(0.1, 0.22, 5), color: 0xd8b24a, pos: [-0.86, 1.55, 0], rot: [0, 0, Math.PI / 2] },
      { geo: new THREE.ConeGeometry(0.1, 0.22, 5), color: 0xd8b24a, pos: [0.86, 1.55, 0], rot: [0, 0, -Math.PI / 2] },
      { geo: new THREE.BoxGeometry(0.2, 0.55, 0.22), color: 0x3a4a6a, pos: [-0.13, 0.85, 0] },
      { geo: new THREE.BoxGeometry(0.2, 0.55, 0.22), color: 0x3a4a6a, pos: [0.13, 0.85, 0] },
      { geo: new THREE.SphereGeometry(0.24, 10, 8), color: 0xd9c08a, pos: [0, 1.95, 0], scale: [1, 1.1, 1] },
      { geo: new THREE.CylinderGeometry(0.38, 0.38, 0.03, 12), color: 0x6a5a3a, pos: [0, 2.14, 0] },
      { geo: new THREE.ConeGeometry(0.2, 0.42, 10), color: 0x6a5a3a, pos: [0, 2.34, 0], rot: [0, 0, 0.18] },
    ]);
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    const eyes = new THREE.MeshBasicMaterial({ color: 0xffa632 });
    const eyeGeo = mergeGeometries([-1, 1].map((s) => new THREE.CircleGeometry(0.045, 3).rotateZ(Math.PI / 2).translate(s * 0.09, 1.99, 0.235)), false)!;
    this.specs.forEach((p, i) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      p.pivot.add(mesh);
      p.pivot.add(new THREE.Mesh(eyeGeo, eyes));
      p.pivot.position.set(p.x, 0, p.z);
      p.pivot.rotation.y = p.yaw;
      scene.add(p.pivot);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, 0));
      const knock = props.register(p.id ?? `espantalho:${i}`, () => {
        if (p.state !== 'up') return;
        p.state = 'falling';
        p.t = 0;
        p.cols.forEach((c) => c.setEnabled(false));
        onFall(V(p.x, 1, p.z));
      });
      p.cols.push(b.cuboidCollider(V(p.x, 1.05, p.z), V(0.08, 1.05, 0.08), q, 'wood', knock));
      p.cols.push(b.cuboidCollider(V(p.x, 1.6, p.z), V(0.9, 0.55, 0.14), q, 'wood', knock));
    });
  }

  update(dt: number) {
    for (const p of this.specs) {
      if (p.state === 'up') continue;
      p.t += dt;
      let a = 0;
      if (p.state === 'falling') {
        const k = Math.min(1, p.t / 0.55);
        a = 1.45 * k * k;
        if (k >= 1) [p.state, p.t] = ['down', 0];
      } else if (p.state === 'down') {
        a = 1.45 - Math.max(0, 0.08 * Math.sin(p.t * 14) * Math.exp(-p.t * 5));
        if (p.t > 4) [p.state, p.t] = ['rising', 0];
      } else {
        const k = Math.min(1, p.t / 1.2);
        a = 1.45 * (1 - k) * (1 - k) - Math.sin(k * Math.PI) * 0.06;
        if (k >= 1) {
          p.state = 'up';
          a = 0;
          p.cols.forEach((c) => c.setEnabled(true));
        }
      }
      p.pivot.rotation.set(-a, p.yaw, 0, 'YXZ');
    }
  }
}

/**
 * A shooting gallery target, its base at the origin: the bullseye (four rings, white and red, 0.44 m across)
 * facing +Z with its center 0.32 m up, on the short iron post it flips down about. TargetRow's targets; the
 * album's sticker studio straps the bare bullseye (`post` false) on a player.
 */
export function bullseyeGeometry(post = true): THREE.BufferGeometry {
  const ring = (r: number, color: number, z: number): ColoredPart => ({ geo: new THREE.CylinderGeometry(r, r, 0.02, 20), color, pos: [0, 0.32, z], rot: [Math.PI / 2, 0, 0] });
  const pole: ColoredPart[] = post ? [{ geo: new THREE.BoxGeometry(0.04, 0.3, 0.04), color: SPOOKY.iron, pos: [0, 0.15, 0] }] : [];
  return mergeColoredParts([...pole, ring(0.22, 0xf2efe6, 0), ring(0.16, 0xd8342a, 0.006), ring(0.1, 0xf2efe6, 0.012), ring(0.045, 0xd8342a, 0.018)]);
}

/**
 * Shooting gallery targets on a rail: each flips down when hit ("alvo:N"); knocking all of them down
 * starts the celebration (`onAll`), and they pop back up a few seconds later.
 */
export class TargetRow {
  /** Times every target went down (secrets read this). */
  clears = 0;
  private targets: { pivot: THREE.Group; down: boolean; a: number; col: RAPIER.Collider }[] = [];
  private bulbs: THREE.InstancedMesh | null = null;
  private party = 0;
  private reset = 0;
  private t = 0;
  private c = new THREE.Color();

  /** `spots`: each target's base; it stands on a pole down to the floor. `onAll(local)`: true when we knocked down the last one. */
  constructor(scene: THREE.Scene, b: MapBuilder, props: PropBus, spots: THREE.Vector3[], private onHit: (at: THREE.Vector3) => void, private onAll: (local: boolean) => void, bulbAt: THREE.Vector3[] = []) {
    const targetGeo = bullseyeGeometry();
    const targetMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    spots.forEach((at, i) => {
      b.box(at.x, at.y / 2, at.z - 0.06, 0.04, at.y, 0.04, 'metal', { tint: SPOOKY.iron, collide: false, castShadow: false });
      const pivot = new THREE.Group();
      pivot.add(new THREE.Mesh(targetGeo, targetMat));
      pivot.position.copy(at);
      scene.add(pivot);
      const tgt = { pivot, down: false, a: 0, col: null as unknown as RAPIER.Collider };
      const hit = props.register(`alvo:${i}`, (t) => {
        if (tgt.down) return;
        tgt.down = true;
        tgt.col.setEnabled(false);
        this.onHit(at);
        if (this.targets.every((t) => t.down)) {
          this.clears++;
          this.party = 4;
          this.reset = 5;
          this.onAll(t.local);
        }
      });
      tgt.col = b.cuboidCollider(V(at.x, at.y + 0.32, at.z), V(0.22, 0.22, 0.04), NO_ROT, 'metal', hit);
      this.targets.push(tgt);
    });
    if (bulbAt.length) {
      this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbAt.length);
      const m = new THREE.Matrix4();
      bulbAt.forEach((p, i) => this.bulbs!.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
      scene.add(this.bulbs);
    }
  }

  update(dt: number) {
    this.t += dt;
    if (this.reset > 0) {
      this.reset -= dt;
      if (this.reset <= 0)
        for (const t of this.targets) {
          t.down = false;
          t.col.setEnabled(true);
        }
    }
    for (const t of this.targets) {
      t.a += ((t.down ? -Math.PI / 2 : 0) - t.a) * Math.min(1, dt * 12);
      t.pivot.rotation.x = t.a;
    }
    if (this.bulbs) {
      this.party = Math.max(0, this.party - dt);
      for (let i = 0; i < this.bulbs.count; i++) {
        if (this.party > 0) this.c.setHSL((i * 0.13 + this.t * 1.5) % 1, 1, 0.6);
        else this.c.setRGB(0.55, 0.42, 0.25).multiplyScalar(0.7 + 0.3 * Math.sin(this.t * 2 + i));
        this.bulbs.setColorAt(i, this.c);
      }
      if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    }
  }
}

/**
 * Ferris wheel turning slowly around an axle along X, gondolas hanging level, purple and orange bulbs on
 * the rim. Only the A-frame legs and the base collide (the park's landmark, seen from the whole map).
 */
export class FerrisWheel {
  private wheel = new THREE.Group();
  private gondolas: THREE.InstancedMesh;
  private bulbs: THREE.InstancedMesh;
  private hub: THREE.Vector3;
  private n = 12;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private t = 0;

  constructor(scene: THREE.Scene, b: MapBuilder, x: number, z: number, private r: number) {
    const hubY = r + 1.6;
    this.hub = V(x, hubY, z);
    const strut = { tint: 0x7a3a4a };
    // A-frames: two legs on each side, leaning in to the axle.
    for (const sx of [-1.7, 1.7]) {
      for (const sz of [-1, 1]) {
        const foot = V(x + sx, 0, z + sz * r * 0.55);
        const top = V(x + sx * 0.75, hubY, z);
        const mid = foot.clone().add(top).multiplyScalar(0.5);
        const len = foot.distanceTo(top);
        const dir = top.clone().sub(foot).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
        const geo = new THREE.BoxGeometry(0.28, len, 0.28);
        geo.applyMatrix4(new THREE.Matrix4().compose(mid, q, V(1, 1, 1)));
        worldUVs(geo);
        b.addGeometry(geo, surfaceMaterial('metal'), strut.tint);
        geo.dispose();
        b.cuboidCollider(mid, V(0.14, len / 2, 0.14), q, 'metal');
      }
      b.box(x + sx, 0.15, z, 0.6, 0.3, r * 1.2, 'concreto', { tint: SPOOKY.stoneDark });
    }
    b.cylinder(x, hubY, z, 0.25, 0.1, 'metal', { collide: false });
    const axle = new THREE.CylinderGeometry(0.22, 0.22, 3.8, 10).rotateZ(Math.PI / 2).translate(x, hubY, z);
    b.addGeometry(axle, surfaceMaterial('metal'), 0x3a3a44);
    axle.dispose();

    // The turning frame (rims, spokes, gondola bars) is one merged mesh.
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      parts.push(new THREE.TorusGeometry(r, 0.09, 6, 40).rotateY(Math.PI / 2).translate(sx * 1.1, 0, 0));
      parts.push(new THREE.TorusGeometry(r * 0.45, 0.06, 5, 28).rotateY(Math.PI / 2).translate(sx * 1.1, 0, 0));
      for (let k = 0; k < this.n; k++) {
        const a = (k / this.n) * Math.PI * 2;
        parts.push(new THREE.BoxGeometry(0.06, r, 0.06).rotateX(Math.PI / 2 - a).translate(sx * 1.1, Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.5));
      }
    }
    for (let k = 0; k < this.n; k++) {
      const a = (k / this.n) * Math.PI * 2;
      parts.push(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6).rotateZ(Math.PI / 2).translate(0, Math.sin(a) * r, Math.cos(a) * r));
    }
    const frame = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed()), false)!, toon(0x9a4a5a));
    parts.forEach((g) => g.dispose());
    frame.castShadow = true;
    this.wheel.add(frame);
    this.wheel.position.copy(this.hub);
    scene.add(this.wheel);

    const cabin = mergeColoredParts([
      { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), color: 0x3a3a44, pos: [0, -0.35, 0] },
      { geo: new THREE.BoxGeometry(1.3, 0.5, 0.9), color: 0x5a2a6a, pos: [0, -1.05, 0] },
      { geo: new THREE.BoxGeometry(1.2, 0.1, 0.8), color: 0x3a1a4a, pos: [0, -0.8, 0] },
      { geo: new THREE.CylinderGeometry(0.55, 0.75, 0.25, 8), color: 0xf07a1a, pos: [0, -0.15, 0] },
    ]);
    this.gondolas = new THREE.InstancedMesh(cabin, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }), this.n);
    this.gondolas.castShadow = true;
    this.gondolas.frustumCulled = false;
    scene.add(this.gondolas);
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.n * 4);
    this.bulbs.frustumCulled = false;
    scene.add(this.bulbs);
    this.update(0);
  }

  update(dt: number) {
    this.t += dt;
    const rot = this.t * 0.09;
    this.wheel.rotation.x = rot;
    for (let k = 0; k < this.n; k++) {
      // Turning the group by `rot` about +X moves a point at angle a0 (y = sin, z = cos) to a0 - rot.
      const a = (k / this.n) * Math.PI * 2 - rot;
      const y = this.hub.y + Math.sin(a) * this.r;
      const z = this.hub.z + Math.cos(a) * this.r;
      this.m.makeTranslation(this.hub.x, y, z);
      this.gondolas.setMatrixAt(k, this.m);
    }
    this.gondolas.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < this.n * 4; k++) {
      const a = (k / (this.n * 4)) * Math.PI * 2 - rot;
      const side = k % 2 ? 1.1 : -1.1;
      this.m.makeTranslation(this.hub.x + side, this.hub.y + Math.sin(a) * (this.r + 0.15), this.hub.z + Math.cos(a) * (this.r + 0.15));
      this.bulbs.setMatrixAt(k, this.m);
      const on = Math.sin(this.t * 3 - k * 0.6) > -0.2;
      this.c.set(k % 3 === 0 ? 0xb46aff : 0xffa040).multiplyScalar(on ? 1 : 0.25);
      this.bulbs.setColorAt(k, this.c);
    }
    this.bulbs.instanceMatrix.needsUpdate = true;
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
}

/** Bonfire in a ring of stones: flame puffs, rising sparks and a flickering orange light. */
export class Bonfire {
  readonly light: THREE.PointLight;
  private acc = 0;
  private t = 0;

  constructor(scene: THREE.Scene, b: MapBuilder, private at: THREE.Vector3, private puffs: Puffs) {
    const { x, y, z } = at;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      b.box(x + Math.cos(a) * 1.05, y + 0.18, z + Math.sin(a) * 1.05, 0.5, 0.36, 0.4, 'pedra', { tint: SPOOKY.stoneDark, rot: new THREE.Euler(0, -a, 0), collide: false });
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const log = new THREE.CylinderGeometry(0.1, 0.12, 1.5, 6).translate(0, 0.75, 0).rotateX(0.75).rotateY(a).translate(x, y, z);
      b.addGeometry(log, surfaceMaterial('pintura'), SPOOKY.woodDark);
      log.dispose();
    }
    b.cuboidCollider(V(x, y + 0.25, z), V(1.2, 0.25, 1.2), NO_ROT, 'concrete');
    this.light = new THREE.PointLight(0xff8a3a, 30, 20, 1.5);
    this.light.position.set(x, y + 1.6, z);
    scene.add(this.light);
  }

  update(dt: number) {
    this.t += dt;
    this.acc += dt * 38;
    while (this.acc >= 1) {
      this.acc--;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.45;
      const hot = Math.random();
      this.puffs.emit(V(this.at.x + Math.cos(a) * r, this.at.y + 0.35, this.at.z + Math.sin(a) * r), (Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 1.4, (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.3, 0.32, 0.08, hot < 0.4 ? 0xffd25a : hot < 0.8 ? 0xff8a2a : 0xd8401a);
    }
    this.light.intensity = 26 + Math.sin(this.t * 11) * 4 + Math.sin(this.t * 23) * 3;
  }
}

/** The plaza's giant jack-o'-lantern: shot, it laughs and its face flares (synchronized as "aboboragigante"). */
export class GiantPumpkin {
  /** Times it laughed (secrets read this). */
  laughs = 0;
  private face: THREE.Mesh;
  private mat = new THREE.MeshBasicMaterial({ color: 0xff9a2a });
  private flare = 0;
  private t = 0;

  constructor(scene: THREE.Scene, b: MapBuilder, x: number, z: number, r: number, yaw: number, props: PropBus, onLaugh: () => void) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const m = new THREE.Matrix4().compose(V(x, 0, z), q, V(1, 1, 1));
    batchPumpkin(b, m, r);
    this.face = new THREE.Mesh(pumpkinFace(r), this.mat);
    this.face.position.set(x, 0, z);
    this.face.quaternion.copy(q);
    scene.add(this.face);
    const laugh = props.register('aboboragigante', () => {
      this.laughs++;
      this.flare = 3;
      onLaugh();
    });
    b.cuboidCollider(V(x, r * 0.74, z), V(r * 0.88, r * 0.74, r * 0.88), q, 'wood', laugh);
  }

  update(dt: number) {
    this.t += dt;
    this.flare = Math.max(0, this.flare - dt);
    const k = this.flare > 0 ? 1 + 0.6 * Math.abs(Math.sin(this.t * 14)) : 0.75 + Math.sin(this.t * 2.2) * 0.08;
    this.mat.color.setRGB(Math.min(1, k), 0.6 * k, 0.16 * k);
  }
}

/**
 * Grandfather clock: pendulum swinging, hands on the dial. Shot, it chimes and jumps one hour ahead
 * ("relogio"); the hour it shows is kept for the secrets.
 */
export class GrandfatherClock {
  hour = 11;
  private hourHand = new THREE.Group();
  private minuteHand = new THREE.Group();
  private pendulum = new THREE.Group();
  private t = 0;
  private spin = 0;

  constructor(scene: THREE.Scene, b: MapBuilder, x: number, y: number, z: number, yaw: number, props: PropBus, onChime: (hour: number) => void) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const m = new THREE.Matrix4().compose(V(x, y, z), q, V(1, 1, 1));
    const wood = surfaceMaterial('madeira');
    const put = (geo: THREE.BufferGeometry, tint: number) => {
      geo.applyMatrix4(m);
      worldUVs(geo);
      b.addGeometry(geo, wood, tint);
      geo.dispose();
    };
    put(new THREE.BoxGeometry(0.75, 0.4, 0.5).translate(0, 0.2, 0), SPOOKY.woodDark);
    put(new THREE.BoxGeometry(0.6, 1.4, 0.4).translate(0, 1.1, -0.02), 0x4a2a1e);
    put(new THREE.BoxGeometry(0.8, 0.8, 0.5).translate(0, 2.2, 0), SPOOKY.woodDark);
    put(new THREE.BoxGeometry(0.9, 0.12, 0.56).translate(0, 2.66, 0), 0x2a1a12);
    put(new THREE.ConeGeometry(0.5, 0.35, 4).rotateY(Math.PI / 4).scale(1, 1, 0.6).translate(0, 2.9, 0), 0x2a1a12);
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.quaternion.copy(q);
    scene.add(root);
    const dial = canvasTexture(256, 256, (g) => {
      g.fillStyle = '#efe4c8';
      g.beginPath();
      g.arc(128, 128, 124, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2a1a12';
      g.lineWidth = 8;
      g.stroke();
      g.fillStyle = '#2a1a12';
      g.font = '800 34px Nunito, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, i) => {
        const a = (i / 12) * Math.PI * 2;
        g.fillText(n, 128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92);
      });
    });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshToonMaterial({ map: dial, gradientMap: toonGradient() }));
    face.position.set(0, 2.2, 0.252);
    root.add(face);
    const dark = toon(0x1a1210);
    this.hourHand.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.01).translate(0, 0.07, 0), dark));
    this.minuteHand.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.01).translate(0, 0.11, 0), dark));
    for (const h of [this.hourHand, this.minuteHand]) {
      h.position.set(0, 2.2, 0.262);
      root.add(h);
    }
    const brass = toon(0xc9a03a);
    this.pendulum.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.8, 0.02).translate(0, -0.4, 0), brass));
    this.pendulum.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16).rotateX(Math.PI / 2).translate(0, -0.85, 0), brass));
    this.pendulum.position.set(0, 1.75, 0.2);
    root.add(this.pendulum);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.2), new THREE.MeshBasicMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.18, depthWrite: false }));
    glass.position.set(0, 1.12, 0.185);
    root.add(glass);
    const chime = props.register('relogio', () => {
      this.hour = (this.hour % 12) + 1;
      this.spin = 1;
      onChime(this.hour);
    });
    b.cuboidCollider(V(0, 1.45, 0).applyMatrix4(m), V(0.42, 1.45, 0.28), q, 'wood', chime);
    this.setHands(0);
  }

  private setHands(extra: number) {
    this.hourHand.rotation.z = -((this.hour % 12) / 12) * Math.PI * 2 + extra * 0.52;
    this.minuteHand.rotation.z = extra * Math.PI * 2;
  }

  update(dt: number) {
    this.t += dt;
    this.pendulum.rotation.z = Math.sin(this.t * Math.PI) * 0.18;
    if (this.spin > 0) {
      this.spin = Math.max(0, this.spin - dt * 1.5);
      this.setHands(this.spin);
    }
  }
}

/** Glowing mushrooms you can shoot to light up for a while ("cogumelo:N"); the rest of the time they're dim. */
export class GlowShrooms {
  private caps: { mat: THREE.MeshBasicMaterial; lit: number }[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, b: MapBuilder, spots: THREE.Vector3[], props: PropBus, onLight: (at: THREE.Vector3) => void) {
    spots.forEach((p, i) => {
      b.cylinder(p.x, p.y, p.z, 0.07, 0.42, 'pintura', { tint: 0xd8d2c0, collide: false, segments: 6, radiusTop: 0.05 });
      const mat = new THREE.MeshBasicMaterial({ color: 0x2a4a5a });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), mat);
      cap.position.set(p.x, p.y + 0.4, p.z);
      scene.add(cap);
      const spec = { mat, lit: 0 };
      this.caps.push(spec);
      const onShot = props.register(`cogumelo:${i}`, () => {
        spec.lit = 40;
        onLight(cap.position);
      });
      b.ballCollider(V(p.x, p.y + 0.35, p.z), 0.28, 'grass', onShot);
    });
  }

  /** Is mushroom `i` lit right now? */
  lit(i: number) {
    return (this.caps[i]?.lit ?? 0) > 0;
  }

  update(dt: number) {
    this.t += dt;
    this.caps.forEach((c, i) => {
      c.lit = Math.max(0, c.lit - dt);
      if (c.lit > 0) c.mat.color.setRGB(0.4, 1, 0.95).multiplyScalar(0.85 + 0.15 * Math.sin(this.t * 6 + i));
      else c.mat.color.setRGB(0.16, 0.3, 0.36);
    });
  }
}

/** Bats circling over the rooftops: one instanced mesh for bodies, one per wing (visual only). */
export class Bats {
  private bats: { c: THREE.Vector3; r: number; a: number; sp: number; h: number; ph: number }[] = [];
  private body: THREE.InstancedMesh;
  private wings: THREE.InstancedMesh[] = [];
  private o = new THREE.Object3D();
  private w = new THREE.Object3D();
  private t = 0;

  constructor(scene: THREE.Scene, flocks: { center: THREE.Vector3; radius: number; count: number }[], rand: () => number) {
    for (const f of flocks) for (let i = 0; i < f.count; i++) this.bats.push({ c: f.center, r: f.radius * (0.6 + rand() * 0.6), a: rand() * Math.PI * 2, sp: (0.5 + rand() * 0.5) * (rand() < 0.5 ? 1 : -1), h: (rand() - 0.5) * 3, ph: rand() * 6 });
    const n = Math.max(1, this.bats.length);
    const dark = new THREE.MeshBasicMaterial({ color: 0x1a1420, side: THREE.DoubleSide });
    this.body = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4).scale(1, 0.8, 1.6), dark, n);
    const wingShape = new THREE.Shape([new THREE.Vector2(0, 0.1), new THREE.Vector2(0.55, 0.12), new THREE.Vector2(0.45, -0.02), new THREE.Vector2(0.32, -0.08), new THREE.Vector2(0.18, -0.03), new THREE.Vector2(0, -0.1)]);
    for (const s of [1, -1]) {
      const g = new THREE.ShapeGeometry(wingShape).rotateX(-Math.PI / 2).scale(s, 1, 1);
      const mesh = new THREE.InstancedMesh(g, dark, n);
      mesh.frustumCulled = false;
      this.wings.push(mesh);
      scene.add(mesh);
    }
    this.body.frustumCulled = false;
    scene.add(this.body);
    this.o.add(this.w);
  }

  update(dt: number) {
    this.t += dt;
    this.bats.forEach((b, i) => {
      b.a += (b.sp * dt * 2.2) / Math.max(2, b.r) * 3;
      this.o.position.set(b.c.x + Math.cos(b.a) * b.r, b.c.y + b.h + Math.sin(this.t * 1.3 + b.ph) * 0.8, b.c.z + Math.sin(b.a) * b.r);
      this.o.rotation.set(0, -b.a + (b.sp > 0 ? 0 : Math.PI), 0);
      this.o.updateMatrixWorld();
      this.body.setMatrixAt(i, this.o.matrixWorld);
      const flap = Math.sin(this.t * 16 + b.ph) * 0.8;
      this.wings.forEach((mesh, k) => {
        this.w.rotation.set(0, 0, k === 0 ? flap : -flap);
        this.w.updateMatrixWorld();
        mesh.setMatrixAt(i, this.w.matrixWorld);
      });
    });
    this.body.instanceMatrix.needsUpdate = true;
    for (const mesh of this.wings) mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Slab of `surface` over [x0,x1]x[z0,z1] between y0 and y1 with rectangular holes cut out of it. */
export function slabWithHoles(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, holes: { x0: number; z0: number; x1: number; z1: number }[], surface: SurfaceKey, o: Parameters<MapBuilder['span']>[7] = {}) {
  // Only the holes that overlap the slab cut it (one beside it would add a cut outside the slab, and the
  // piece between that cut and the slab's edge would be laid out there).
  holes = holes.filter((h) => h.x0 < x1 && h.x1 > x0 && h.z0 < z1 && h.z1 > z0);
  const cuts = [...new Set([x0, x1, ...holes.flatMap((h) => [Math.max(x0, h.x0), Math.min(x1, h.x1)])])].sort((p, q) => p - q);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i];
    const c = cuts[i + 1];
    if (c - a < 0.005) continue;
    const mid = (a + c) / 2;
    const covering = holes.filter((h) => h.x0 <= mid && h.x1 >= mid).map((h) => [h.z0, h.z1] as [number, number]);
    for (const [s0, s1] of solidIntervals(z0, z1, covering)) b.span(a, y0, s0, c, y1, s1, surface, o);
  }
}

// --- Real lights ------------------------------------------------------------------------------------

/** A place that gives light: candles, lamps, the fire. Only the nearest few become real lights (LightPool). */
export interface LightSpot {
  at: THREE.Vector3;
  color: THREE.Color;
  /** Point light intensity (candela) when it's a real light. */
  intensity: number;
  /** How far it reaches (m). */
  range: number;
  /** Lit right now (a lamp shot out isn't); omitted = always. */
  on?: () => boolean;
  /** 0..1: how much it flickers (candles, fire). */
  flicker?: number;
}

/**
 * A fixed number of point lights handed to the light spots nearest the camera, a few times a second, fading
 * in and out as they move. The number of lights never changes, so shaders never recompile, and the cost
 * stays the same however many candles and lamps the map has.
 */
export class LightPool {
  private spots: LightSpot[] = [];
  private lights: { light: THREE.PointLight; spot: number; level: number }[] = [];
  private pick = 0;
  private t = 0;

  constructor(scene: THREE.Scene, count = 8) {
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      scene.add(light);
      this.lights.push({ light, spot: -1, level: 0 });
    }
  }

  add(...spots: LightSpot[]) {
    this.spots.push(...spots);
  }

  /** Takes spots away (the map editor rebuilding a piece); the lights are handed out again on the next pick. */
  remove(...spots: LightSpot[]) {
    const gone = new Set(spots);
    this.spots = this.spots.filter((s) => !gone.has(s));
    for (const l of this.lights) l.spot = -1;
    this.pick = 0;
  }

  update(dt: number, camera: THREE.Vector3) {
    this.t += dt;
    this.pick -= dt;
    if (this.pick <= 0) {
      this.pick = 0.2;
      // Nearest first, a bigger light counting as a little nearer; out of reach or unlit ones never.
      const score = this.spots.map((s, i) => {
        const d = s.at.distanceTo(camera);
        return { i, v: d > s.range + 14 || (s.on && !s.on()) ? Infinity : d - s.range * 0.4 };
      });
      const nearest = new Set(score.filter((s) => s.v < Infinity).sort((a, b) => a.v - b.v).slice(0, this.lights.length).map((s) => s.i));
      const kept = new Set(this.lights.filter((l) => nearest.has(l.spot)).map((l) => l.spot));
      const free = [...nearest].filter((i) => !kept.has(i));
      for (const l of this.lights) {
        if (nearest.has(l.spot)) continue;
        l.spot = free.shift() ?? -1;
        l.level = 0;
      }
    }
    this.lights.forEach((l, k) => {
      const s = this.spots[l.spot];
      const lit = !!s && (!s.on || s.on());
      l.level = THREE.MathUtils.clamp(l.level + (lit ? dt : -dt) * 4, 0, 1);
      if (!s || l.level <= 0) {
        l.light.intensity = 0;
        return;
      }
      const f = s.flicker ?? 0;
      const wobble = 1 - f * (0.18 + 0.12 * Math.sin(this.t * 13 + k * 1.7) + 0.08 * Math.sin(this.t * 29 + k));
      l.light.position.copy(s.at);
      l.light.color.copy(s.color);
      l.light.distance = s.range;
      l.light.intensity = s.intensity * l.level * wobble;
    });
  }
}

// --- The sewer's giant rat ----------------------------------------------------------------------------

/**
 * The giant rat at the end of the sewer's dead end (RAT). It watches whoever comes near, squeaks, flinches
 * when hit; our hits are counted here and the one that brings it down reports it (`onDown`): the game
 * decides (offline at once, online through the server) and calls kill(). Dead, it rolls over and sinks,
 * and it's back at `ready` on the game clock.
 */
/** The rat's model is built ~1.4 m tall; this makes it properly giant. */
const RAT_SCALE = 1.35;

export class GiantRat {
  private group = new THREE.Group();
  private body: THREE.Mesh;
  private tail = new THREE.Group();
  private hp: number;
  private claimed = -99;
  private state: 'alive' | 'dying' | 'dead' = 'alive';
  private ready = 0;
  private stateT = 0;
  private flinch = 0;
  private squeakIn = 3;
  private t = 0;
  private cols: RAPIER.Collider[] = [];
  private yaw: number;

  constructor(
    scene: THREE.Scene,
    b: MapBuilder,
    readonly id: string,
    private at: THREE.Vector3,
    yaw: number,
    private maxHp: number,
    private stabDamage: number,
    private onDown: (id: string) => void,
    private puffs: Puffs,
    private sfx: { squeak(at: THREE.Vector3): void; hurt(at: THREE.Vector3): void; death(at: THREE.Vector3): void },
  ) {
    this.yaw = yaw;
    this.hp = maxHp;
    const fur = 0x5e504a;
    const pink = 0xd89aa0;
    type P = [number, number, number];
    const side = (s: number) => [
      { geo: new THREE.CylinderGeometry(0.26, 0.26, 0.05, 14), color: fur, pos: [s * 0.32, 1.42, 1.08] as P, rot: [Math.PI / 2, 0, s * 0.3] as P },
      { geo: new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), color: pink, pos: [s * 0.32, 1.42, 1.1] as P, rot: [Math.PI / 2, 0, s * 0.3] as P },
      // Legs and pink paws.
      { geo: new THREE.CylinderGeometry(0.11, 0.09, 0.5, 8), color: fur, pos: [s * 0.36, 0.25, 0.75] as P },
      { geo: new THREE.CylinderGeometry(0.14, 0.1, 0.55, 8), color: fur, pos: [s * 0.4, 0.27, -0.7] as P },
      { geo: new THREE.SphereGeometry(0.12, 8, 6), color: pink, pos: [s * 0.36, 0.05, 0.85] as P, scale: [1, 0.5, 1.4] as P },
      { geo: new THREE.SphereGeometry(0.14, 8, 6), color: pink, pos: [s * 0.4, 0.05, -0.6] as P, scale: [1, 0.5, 1.5] as P },
      // Whiskers.
      ...[-0.08, 0.04].map((dy) => ({ geo: new THREE.BoxGeometry(0.6, 0.012, 0.012), color: 0x2a2220, pos: [s * 0.32, 0.92 + dy, 1.95] as P, rot: [0, s * 0.25, s * dy * 2] as P })),
    ];
    const geo = mergeColoredParts([
      { geo: new THREE.SphereGeometry(1, 16, 12), color: fur, pos: [0, 0.8, 0], scale: [0.66, 0.6, 1.25] },
      { geo: new THREE.SphereGeometry(1, 12, 10), color: 0x7a6c64, pos: [0, 0.6, 0.1], scale: [0.52, 0.42, 0.95] },
      { geo: new THREE.SphereGeometry(1, 12, 10), color: fur, pos: [0, 0.78, -0.75], scale: [0.6, 0.55, 0.65] },
      { geo: new THREE.SphereGeometry(1, 14, 10), color: fur, pos: [0, 1.0, 1.25], scale: [0.44, 0.42, 0.62] },
      { geo: new THREE.ConeGeometry(0.26, 0.6, 10), color: fur, pos: [0, 0.94, 1.85], rot: [Math.PI / 2, 0, 0] },
      { geo: new THREE.SphereGeometry(0.09, 8, 6), color: pink, pos: [0, 0.94, 2.15] },
      { geo: new THREE.BoxGeometry(0.05, 0.14, 0.04), color: 0xf2ead0, pos: [-0.04, 0.76, 1.98] },
      { geo: new THREE.BoxGeometry(0.05, 0.14, 0.04), color: 0xf2ead0, pos: [0.04, 0.76, 1.98] },
      ...side(-1),
      ...side(1),
    ]);
    this.body = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
    this.body.castShadow = true;
    const eyes = new THREE.Mesh(mergeGeometries([-1, 1].map((s) => new THREE.SphereGeometry(0.075, 8, 6).translate(s * 0.2, 1.12, 1.74)), false)!, new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    const tailCurve = new THREE.CatmullRomCurve3([V(0, 0.65, 0), V(0, 0.35, -0.6), V(0.6, 0.15, -1.1), V(1.4, 0.1, -1.2), V(1.9, 0.25, -0.9)]);
    this.tail.add(new THREE.Mesh(taperedTube(tailCurve, 16, 6, 0.13, 0.025), toon(pink)));
    this.tail.position.z = -1.35;
    this.group.add(this.body, eyes, this.tail);
    this.group.position.copy(at);
    this.group.rotation.y = yaw;
    this.group.scale.setScalar(RAT_SCALE);
    scene.add(this.group);
    const hit = () => this.damage(1);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const k = RAT_SCALE;
    const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => this.cols.push(b.cuboidCollider(V(x * k, y * k, z * k).applyQuaternion(q).add(at), V(hx * k, hy * k, hz * k), q, 'wood', hit));
    box(0, 0.75, 0, 0.66, 0.68, 1.3);
    box(0, 1.0, 1.5, 0.42, 0.42, 0.65);
  }

  get alive() {
    return this.state === 'alive';
  }

  /** Our hit (a bullet counts 1). */
  damage(n: number) {
    if (this.state !== 'alive') return;
    this.hp -= n;
    this.flinch = 1;
    if (this.hp > 0) {
      this.sfx.hurt(this.group.localToWorld(V(0, 1.1, 1.4)));
      return;
    }
    // Ours: claim it (again after a while, if nobody answered).
    if (this.t - this.claimed > 2) {
      this.claimed = this.t;
      this.onDown(this.id);
    }
  }

  /** A knife swing from `eye` along `fwd`: hits the rat when it's in reach and in front; where, or null. */
  stab(eye: THREE.Vector3, fwd: THREE.Vector3, reach: number): THREE.Vector3 | null {
    if (this.state !== 'alive') return null;
    const center = this.group.localToWorld(V(0, 0.9, 0.6));
    const to = center.clone().sub(eye);
    const d = to.length();
    if (d > reach + 1.4 * RAT_SCALE || to.dot(fwd) / d < 0.4) return null;
    this.damage(this.stabDamage);
    return eye.clone().addScaledVector(fwd, Math.max(0.3, Math.min(reach, d - 0.6)));
  }

  kill(ready: number) {
    this.ready = ready;
    if (this.state !== 'alive') return;
    this.state = 'dying';
    this.stateT = 0;
    this.cols.forEach((c) => c.setEnabled(false));
    const at = this.group.localToWorld(V(0, 1, 0));
    this.sfx.death(at);
    // Its humanity leaves the body: a pale wisp rising.
    for (let i = 0; i < 24; i++) this.puffs.emit(at, (Math.random() - 0.5) * 0.6, 1 + Math.random() * 2, (Math.random() - 0.5) * 0.6, 1.6, 0.18, 0.05, 0xf2ecff);
  }

  set(ready: number) {
    this.ready = ready;
    this.state = 'dead';
    this.group.visible = false;
    this.cols.forEach((c) => c.setEnabled(false));
  }

  update(dt: number, time: number, listener: THREE.Vector3) {
    this.t += dt;
    this.stateT += dt;
    if (this.state === 'dead') {
      if (time < this.ready) return;
      this.state = 'alive';
      this.hp = this.maxHp;
      this.group.visible = true;
      this.group.position.copy(this.at);
      this.group.scale.setScalar(0.01);
      this.cols.forEach((c) => c.setEnabled(true));
    }
    if (this.state === 'dying') {
      const k = Math.min(1, this.stateT / 0.7);
      this.group.rotation.set(0, this.yaw, k * k * 1.6);
      this.group.position.y = this.at.y - Math.max(0, this.stateT - 1.5) * 0.8;
      if (this.stateT > 3) {
        this.state = 'dead';
        this.group.visible = false;
      }
      return;
    }
    // Alive: grows back in, breathes, turns to watch whoever is near, squeaks now and then.
    this.group.scale.setScalar(Math.min(RAT_SCALE, this.group.scale.x + dt * 1.5));
    const dx = listener.x - this.at.x;
    const dz = listener.z - this.at.z;
    const near = Math.abs(listener.y - this.at.y) < 4 && dx * dx + dz * dz < 18 * 18;
    if (near) {
      const d = Math.atan2(dx, dz) - this.yaw;
      this.yaw += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 2);
    }
    this.flinch = Math.max(0, this.flinch - dt * 4);
    this.group.rotation.set(-this.flinch * 0.15, this.yaw + Math.sin(this.t * 40) * this.flinch * 0.08, 0);
    this.body.scale.set(1, 1 + Math.sin(this.t * 2.2) * 0.025, 1);
    this.tail.rotation.y = Math.sin(this.t * 1.6) * 0.35;
    this.squeakIn -= dt;
    if (near && this.squeakIn <= 0) {
      this.squeakIn = 4 + Math.random() * 5;
      this.sfx.squeak(this.group.localToWorld(V(0, 1.1, 1.6)));
    }
  }
}

// --- Vehicles of the park -----------------------------------------------------------------------------

/**
 * Bumper car facing +X, resting on y = 0: rounded chassis inside a fat black rubber bumper, a fiberglass
 * shell with a high back, seat, steering wheel, headlights and the pole to the ceiling grid (with its spark
 * brush). One vertex-colored geometry; the map merges all of them.
 */
export function bumperCarGeometry(color: THREE.ColorRepresentation, accent: THREE.ColorRepresentation): THREE.BufferGeometry {
  const dark = new THREE.Color(color).multiplyScalar(0.6);
  return mergeColoredParts([
    { geo: new RoundedBoxGeometry(1.7, 0.22, 1.2, 2, 0.08), color: 0x2a2a30, pos: [0, 0.13, 0] },
    { geo: new THREE.TorusGeometry(1, 0.13, 8, 28), color: 0x18181c, pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0], scale: [0.86, 0.6, 1] },
    { geo: new RoundedBoxGeometry(1.5, 0.42, 1.06, 3, 0.16), color, pos: [0, 0.48, 0] },
    { geo: new RoundedBoxGeometry(0.5, 0.36, 0.98, 3, 0.14), color, pos: [0.5, 0.78, 0] },
    { geo: new RoundedBoxGeometry(0.22, 0.78, 1.0, 3, 0.1), color, pos: [-0.62, 0.98, 0] },
    { geo: new RoundedBoxGeometry(0.42, 0.14, 0.8, 2, 0.06), color: 0x3a2a3a, pos: [-0.3, 0.74, 0] },
    { geo: new RoundedBoxGeometry(0.12, 0.5, 0.78, 2, 0.05), color: 0x3a2a3a, pos: [-0.47, 0.99, 0] },
    { geo: new THREE.BoxGeometry(1.52, 0.06, 1.08), color: accent, pos: [0, 0.6, 0] },
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6), color: 0x2a2a2a, pos: [0.22, 0.98, 0], rot: [0, 0, 0.6] },
    { geo: new THREE.TorusGeometry(0.15, 0.025, 6, 18), color: 0x1a1a1a, pos: [0.12, 1.12, 0], rot: [0, Math.PI / 2, 0.6] },
    { geo: new THREE.SphereGeometry(0.07, 8, 6), color: 0xfff0b0, pos: [0.76, 0.8, 0.3] },
    { geo: new THREE.SphereGeometry(0.07, 8, 6), color: 0xfff0b0, pos: [0.76, 0.8, -0.3] },
    { geo: new THREE.BoxGeometry(0.06, 0.2, 0.5), color: dark, pos: [0.76, 0.56, 0] },
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 1.55, 6), color: 0x9a9aa4, pos: [-0.66, 2.05, 0] },
    { geo: new THREE.BoxGeometry(0.1, 0.06, 0.24), color: 0xd8c050, pos: [-0.66, 2.84, 0] },
    { geo: new THREE.SphereGeometry(0.09, 8, 6), color: accent, pos: [-0.66, 1.4, 0] },
  ]);
}

/**
 * Old circus trailer facing +X (its hitch end), on y = 0: a rounded painted body with a stripe, windows
 * (one lit), a door with a striped awning, roof vent and A/C, an axle pair under fenders, the tow hitch on
 * its jack and a sign. One mesh; the lit window goes to `glow`; it collides as its body.
 */
export function circusTrailer(b: MapBuilder, scene: THREE.Scene, glow: Glow, x: number, z: number, yaw: number, color: number, stripe: number, sign: string) {
  const L = 6.4;
  const Wd = 2.4;
  const H = 2.5;
  const y0 = 0.62;
  type P = [number, number, number];
  const parts: { geo: THREE.BufferGeometry; color: THREE.ColorRepresentation; pos: P; rot?: P; scale?: P }[] = [
    { geo: new RoundedBoxGeometry(L, H, Wd, 4, 0.38), color, pos: [0, y0 + H / 2, 0] },
    { geo: new RoundedBoxGeometry(L - 0.5, 0.18, Wd + 0.03, 2, 0.06), color: stripe, pos: [0, y0 + 0.9, 0] },
    { geo: new RoundedBoxGeometry(L - 0.5, 0.08, Wd + 0.03, 2, 0.03), color: 0xf2ead8, pos: [0, y0 + 1.1, 0] },
    { geo: new RoundedBoxGeometry(L - 0.2, 0.12, Wd - 0.1, 2, 0.05), color: 0xd8d4cc, pos: [0, y0 + H + 0.02, 0] },
    { geo: new THREE.BoxGeometry(0.9, 0.35, 0.8), color: 0xd8d4cc, pos: [-1.2, y0 + H + 0.25, 0] },
    { geo: new THREE.BoxGeometry(0.5, 0.15, 0.5), color: 0x9a9aa4, pos: [1.4, y0 + H + 0.12, 0] },
    { geo: new THREE.BoxGeometry(L - 0.6, 0.25, Wd - 0.3), color: 0x1a1a1e, pos: [0, y0 - 0.1, 0] },
  ];
  // Windows: dark glass in white frames on both sides (one lit, below), a round one at the back.
  for (const s of [-1, 1]) {
    for (const wx of [-1.9, 1.7]) {
      parts.push({ geo: new THREE.BoxGeometry(1.1, 0.75, 0.06), color: 0xf2ead8, pos: [wx, y0 + 1.75, s * (Wd / 2 + 0.005)] });
      parts.push({ geo: new THREE.BoxGeometry(0.95, 0.6, 0.07), color: 0x1e2430, pos: [wx, y0 + 1.75, s * (Wd / 2 + 0.01)] });
    }
    // A fender over the wheels, then the wheels.
    parts.push({ geo: new THREE.CylinderGeometry(0.55, 0.55, 0.3, 14, 1, false, -Math.PI / 2, Math.PI), color: stripe, pos: [-0.35, 0.36, s * (Wd / 2 - 0.12)], rot: [-Math.PI / 2, 0, 0], scale: [1.7, 1, 1] });
    for (const wx of [-0.75, 0.05]) {
      parts.push({ geo: new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14), color: 0x141416, pos: [wx, 0.36, s * (Wd / 2 - 0.16)], rot: [Math.PI / 2, 0, 0] });
      parts.push({ geo: new THREE.CylinderGeometry(0.18, 0.18, 0.26, 10), color: 0xc8c8d0, pos: [wx, 0.36, s * (Wd / 2 - 0.16)], rot: [Math.PI / 2, 0, 0] });
    }
  }
  // Door with a step and a striped awning (on the +Z side).
  parts.push({ geo: new THREE.BoxGeometry(0.85, 1.9, 0.06), color: stripe, pos: [0.15, y0 + 1.0, Wd / 2 + 0.01] });
  parts.push({ geo: new THREE.SphereGeometry(0.05, 6, 4), color: 0xd8c050, pos: [0.45, y0 + 1.0, Wd / 2 + 0.06] });
  parts.push({ geo: new THREE.BoxGeometry(0.9, 0.12, 0.5), color: 0x5a5a60, pos: [0.15, y0 - 0.25, Wd / 2 + 0.25] });
  for (let k = 0; k < 6; k++) parts.push({ geo: new THREE.BoxGeometry(0.3, 0.05, 0.9), color: k % 2 ? 0xf2ead8 : stripe, pos: [-0.6 + k * 0.3, y0 + 2.15, Wd / 2 + 0.42], rot: [0.25, 0, 0] });
  parts.push({ geo: new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), color: 0xf2ead8, pos: [-L / 2 - 0.005, y0 + 1.7, 0], rot: [0, 0, Math.PI / 2] });
  // Tow hitch: the A-frame, the coupler and the jack stand.
  for (const s of [-1, 1]) parts.push({ geo: new THREE.BoxGeometry(1.5, 0.1, 0.1), color: 0x2a2a30, pos: [L / 2 + 0.55, y0 - 0.05, s * 0.42], rot: [0, s * 0.5, 0] });
  parts.push({ geo: new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), color: 0x2a2a30, pos: [L / 2 + 1.2, y0, 0] });
  parts.push({ geo: new THREE.CylinderGeometry(0.04, 0.04, y0, 6), color: 0x5a5a60, pos: [L / 2 + 1.05, y0 / 2, 0] });
  parts.push({ geo: new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8), color: 0x5a5a60, pos: [L / 2 + 1.05, 0.02, 0] });
  const geo = mergeColoredParts(parts);
  parts.forEach((p) => p.geo.dispose());
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
  mesh.position.set(x, 0, z);
  mesh.quaternion.copy(q);
  mesh.castShadow = true;
  scene.add(mesh);
  const m = new THREE.Matrix4().compose(V(x, 0, z), q, V(1, 1, 1));
  glow.add(new THREE.BoxGeometry(0.95, 0.6, 0.02).translate(1.7, y0 + 1.75, Wd / 2 + 0.05).applyMatrix4(m), 0xffc070);
  // The sign along the -Z side, reading from that side.
  const tex = canvasTexture(512, 96, (g) => {
    g.fillStyle = '#f2ead8';
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#7a1a2a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, sign, 256, 52, 470, (px) => `400 ${px}px "Lilita One", system-ui, sans-serif`, 64);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() }));
  board.position.copy(V(-0.1, y0 + 2.2, -Wd / 2 - 0.02).applyMatrix4(m));
  board.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));
  scene.add(board);
  // A vehicle for the sound: it wraps around it (audio/spatial.ts).
  b.cuboidCollider(V(0, y0 + H / 2, 0).applyMatrix4(m), V(L / 2, H / 2 + 0.3, Wd / 2), q, 'metal', undefined, 'vehicle');
  b.cuboidCollider(V(-0.35, 0.35, 0).applyMatrix4(m), V(0.8, 0.35, Wd / 2 - 0.05), q, 'metal', undefined, 'vehicle');
}

// --- The mansion kitchen's cabinet and its Scooby biscuit ------------------------------------------------

/**
 * Tall kitchen cabinet against a wall, facing +Z at yaw 0 (`at`: its base's center). Shot or stabbed, its
 * two doors swing open (synchronized as "armario") and show the box of Scooby biscuits on the middle shelf;
 * they close again after a while. The biscuit itself is a collectible (ScoobyBiscuit).
 */
export class KitchenCabinet {
  /** Where the biscuit box stands, inside. */
  readonly shelf: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  private doors: { pivot: THREE.Group; sign: number }[] = [];
  private openFor = 0;
  private angle = 0;
  private front: THREE.Vector3;
  private trigger: () => void;

  constructor(scene: THREE.Scene, b: MapBuilder, at: THREE.Vector3, yaw: number, props: PropBus, private creak: () => void) {
    const W = 1.4;
    const Dp = 0.6;
    const H = 2.1;
    this.quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const m = new THREE.Matrix4().compose(at, this.quaternion, V(1, 1, 1));
    const wood = surfaceMaterial('madeira');
    const put = (geo: THREE.BufferGeometry, tint: number) => {
      geo.applyMatrix4(m);
      worldUVs(geo);
      b.addGeometry(geo, wood, tint);
      geo.dispose();
    };
    put(new THREE.BoxGeometry(W, H, 0.04).translate(0, H / 2, -Dp / 2 + 0.02), 0x4a3424);
    for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.05, H, Dp).translate(s * (W / 2 - 0.025), H / 2, 0), 0x6a4a34);
    put(new THREE.BoxGeometry(W + 0.1, 0.08, Dp + 0.08).translate(0, H + 0.04, 0.02), 0x4a3424);
    put(new THREE.BoxGeometry(W, 0.1, Dp).translate(0, 0.05, 0), 0x4a3424);
    for (const y of [0.55, 1.05, 1.55]) put(new THREE.BoxGeometry(W - 0.1, 0.03, Dp - 0.06).translate(0, y, 0), 0x8a6a4a);
    // Jars and tins on the other shelves.
    for (const [tx, ty, c] of [[-0.45, 0.57, 0xb8402a], [-0.15, 0.57, 0x3a6a8a], [0.35, 1.57, 0xd8b04a], [-0.4, 1.57, 0x6a8a3a], [0.4, 0.57, 0xc8c0b0]] as const) {
      put(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10).translate(tx, ty + 0.11, -0.05), c);
    }
    this.shelf = V(0, 1.065, -0.02).applyMatrix4(m);
    this.front = V(0, 1.1, Dp / 2).applyMatrix4(m);
    // Doors: hinged at the outer edges, swinging out toward the room (each one mesh: leaf, panel, knob).
    const doorMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    for (const sign of [-1, 1]) {
      const pivot = new THREE.Group();
      const leaf = mergeColoredParts([
        { geo: new THREE.BoxGeometry(W / 2 - 0.02, H - 0.16, 0.04), color: 0x7a5238, pos: [-sign * (W / 4), H / 2, 0] },
        { geo: new THREE.BoxGeometry(W / 2 - 0.2, H - 0.5, 0.02), color: 0x6a4630, pos: [-sign * (W / 4), H / 2, 0.025] },
        { geo: new THREE.SphereGeometry(0.035, 8, 6), color: 0xd8c070, pos: [-sign * (W / 2 - 0.1), H / 2, 0.05] },
      ]);
      pivot.add(new THREE.Mesh(leaf, doorMat));
      pivot.position.copy(V(sign * (W / 2 - 0.01), 0, Dp / 2 + 0.02).applyMatrix4(m));
      pivot.quaternion.copy(this.quaternion);
      pivot.traverse((o) => (o.castShadow = true));
      scene.add(pivot);
      this.doors.push({ pivot, sign });
    }
    this.trigger = props.register('armario', () => {
      if (this.openFor <= 0) this.creak();
      this.openFor = 25;
    });
    b.cuboidCollider(V(0, H / 2, 0).applyMatrix4(m), V(W / 2, H / 2, Dp / 2), this.quaternion, 'wood', this.trigger);
  }

  get isOpen() {
    return this.angle > 1.2;
  }

  /** A knife swing from `eye` along `fwd` that reaches the doors opens them; where, or null. */
  stab(eye: THREE.Vector3, fwd: THREE.Vector3, reach: number): THREE.Vector3 | null {
    const to = this.front.clone().sub(eye);
    const d = to.length();
    if (d > reach + 0.6 || to.dot(fwd) / d < 0.5) return null;
    this.trigger();
    return this.front.clone();
  }

  update(dt: number) {
    const was = this.openFor > 0;
    this.openFor = Math.max(0, this.openFor - dt);
    if (was && this.openFor <= 0) this.creak();
    this.angle += ((this.openFor > 0 ? 1.9 : 0) - this.angle) * Math.min(1, dt * (this.openFor > 0 ? 5 : 2.5));
    for (const d of this.doors) d.pivot.quaternion.copy(this.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), d.sign * this.angle));
  }
}

/**
 * The box of Scooby biscuits on the cabinet's middle shelf: a collectible (PICKUPS kind "biscoito") that can
 * only be taken while the cabinet is open. Taken, it pops; back, it's on the shelf again.
 */
export class ScoobyBiscuit {
  readonly position: THREE.Vector3;
  private box = new THREE.Group();
  private taken = false;
  private pop = 0;

  constructor(scene: THREE.Scene, readonly id: string, feet: THREE.Vector3, private cabinet: KitchenCabinet) {
    this.position = feet.clone();
    const label = canvasTexture(256, 192, (g) => {
      g.fillStyle = '#6ab04a';
      g.fillRect(0, 0, 256, 192);
      g.fillStyle = '#f2a83a';
      g.beginPath();
      g.ellipse(128, 96, 116, 70, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5a2a6a';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '400 52px "Lilita One", system-ui, sans-serif';
      g.fillText('SCOOBY', 128, 76);
      g.fillText('SNACKS', 128, 124);
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.14), toon(0x6ab04a));
    body.position.y = 0.21;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.4), new THREE.MeshToonMaterial({ map: label, gradientMap: toonGradient() }));
    front.position.set(0, 0.21, 0.071);
    // A couple of bone-shaped biscuits next to the box.
    const bone = mergeColoredParts([
      { geo: new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), color: 0xc8904a, pos: [0, 0, 0], rot: [0, 0, Math.PI / 2] },
      ...[-1, 1].flatMap((s) => [-1, 1].map((t) => ({ geo: new THREE.SphereGeometry(0.03, 8, 6), color: 0xc8904a, pos: [s * 0.085, t * 0.022, 0] as [number, number, number] }))),
    ]);
    const boneMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    for (const [bx, rz] of [[0.3, 0.4], [0.36, -0.2]]) {
      const piece = new THREE.Mesh(bone, boneMat);
      piece.position.set(bx, 0.04, 0.04);
      piece.rotation.z = rz;
      this.box.add(piece);
    }
    this.box.add(body, front);
    this.box.position.copy(cabinet.shelf);
    this.box.quaternion.copy(cabinet.quaternion);
    scene.add(this.box);
  }

  get available() {
    return !this.taken && this.cabinet.isOpen;
  }

  take() {
    this.taken = true;
    this.pop = 1;
  }

  restore() {
    this.taken = false;
    this.box.visible = true;
    this.box.scale.setScalar(1);
  }

  update(dt: number) {
    if (!this.taken) return;
    this.pop = Math.max(0, this.pop - dt * 4);
    this.box.scale.setScalar(1 + (1 - this.pop) * 0.4);
    this.box.visible = this.pop > 0;
  }
}

const WITCH_SCOLDS = ['Ei! Sem tiros na minha cabana!', 'Quer virar sapo?', 'Olha os modos, mocinho!', 'Vou te transformar em abóbora!'];
const WITCH_LINES: Record<PotionKind, string[]> = {
  pato: ['Quá-quá-quá! Agora é só pato!', 'Hihihi! Patinhos explosivos!'],
  veloz: ['Corre, corre, minhoca!', 'Hihi! Pernas pra que te quero!'],
  lerdo: ['Devagar, tartaruguinha... hihihi!', 'Sem pressa, querido. Muita... sem... pressa.'],
  critico: ['Cada tiro, uma desgraça!', 'Hehehe! Mira na cabeça... de todo mundo!'],
  bebado: ['Saúde! Hic!', 'Hihi! Tá vendo duas bruxas?'],
};

/**
 * The witch in her cabin, facing +Z at yaw 0 with the cauldron 1.2 m in front of her: a fat, hunched old
 * crone with a warty green face, a crooked hooked nose, a pointed chin, stringy grey hair and a bent hat.
 * She stirs the brew with a long ladle that dips into the cauldron, turns her head to watch whoever comes
 * close, cackles a line for each potion drunk (drink(kind)) and scolds whoever shoots her ("bruxa").
 */
export class Witch {
  private root = new THREE.Group();
  private head = new THREE.Group();
  private arm = new THREE.Group();
  private bubble = new SpeechBubble(1.9);
  private t = 0;
  private shake = 0;
  private scolds = 0;
  private lines = 0;

  constructor(scene: THREE.Scene, b: MapBuilder, readonly feet: THREE.Vector3, private yaw: number, props: PropBus, private sfx: { cackle(at: THREE.Vector3): void; scold(at: THREE.Vector3): void }) {
    type P = [number, number, number];
    type Part = { geo: THREE.BufferGeometry; color: THREE.ColorRepresentation; pos: P; rot?: P; scale?: P };
    const robe = 0x3a2a48;
    const robeDark = 0x2a1e36;
    const skin = 0x7aa040;
    const skinDark = 0x5a7a2a;
    const tube = (pts: P[], r0: number, r1: number, color: number, segs = 10): Part => ({ geo: taperedTube(new THREE.CatmullRomCurve3(pts.map((p) => V(...p))), segs, 6, r0, r1), color, pos: [0, 0, 0] });
    // Body: a fat robe, a hump, a tattered shawl, an apron, a belt, patches, pointed boots, the left
    // hand on her hip.
    const robeProfile = [[0.5, 0], [0.57, 0.08], [0.62, 0.3], [0.65, 0.55], [0.66, 0.75], [0.6, 0.95], [0.52, 1.1], [0.44, 1.24], [0.36, 1.36], [0.22, 1.46], [0.12, 1.5], [0, 1.51]];
    const shawlProfile = [[0.5, 1.1], [0.55, 1.18], [0.48, 1.3], [0.36, 1.42], [0.22, 1.5], [0.13, 1.54]];
    const tatters: Part[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      tatters.push({ geo: new THREE.ConeGeometry(0.06, 0.16, 4), color: 0x3a3a2e, pos: [Math.sin(a) * 0.53, 1.06, Math.cos(a) * 0.53], rot: [Math.PI, a, 0] });
    }
    const body = mergeColoredParts([
      { geo: new THREE.LatheGeometry(robeProfile.map(([r, y]) => new THREE.Vector2(r, y)), 28), color: robe, pos: [0, 0, 0] },
      { geo: new THREE.SphereGeometry(0.34, 18, 14), color: robe, pos: [0, 1.3, -0.24], scale: [1.15, 0.85, 0.9] },
      { geo: new THREE.LatheGeometry(shawlProfile.map(([r, y]) => new THREE.Vector2(r, y)), 28), color: 0x3a3a2e, pos: [0, 0, 0] },
      ...tatters,
      { geo: new THREE.BoxGeometry(0.52, 0.72, 0.03), color: 0x6a6458, pos: [0, 0.55, 0.64], rot: [-0.06, 0, 0] },
      { geo: new THREE.BoxGeometry(0.12, 0.1, 0.02), color: 0x4a2a1a, pos: [0.12, 0.42, 0.665], rot: [-0.06, 0, 0.3] },
      { geo: new THREE.TorusGeometry(0.63, 0.04, 6, 32), color: 0x5a3a22, pos: [0, 0.86, 0], rot: [Math.PI / 2, 0, 0] },
      { geo: new THREE.BoxGeometry(0.12, 0.1, 0.03), color: 0xd8b040, pos: [0, 0.86, 0.66] },
      { geo: new THREE.BoxGeometry(0.2, 0.18, 0.02), color: 0x2a4a3a, pos: [-0.42, 0.42, 0.47], rot: [0, -0.75, 0.2] },
      { geo: new THREE.BoxGeometry(0.16, 0.2, 0.02), color: 0x6a4a2a, pos: [0.5, 0.25, -0.38], rot: [0, 2.2, -0.1] },
      ...[-1, 1].flatMap((s) => [
        { geo: new THREE.ConeGeometry(0.08, 0.34, 8), color: 0x1a1420, pos: [s * 0.17, 0.06, 0.6] as P, rot: [Math.PI / 2 - 0.15, 0, 0] as P, scale: [1, 1, 0.6] as P },
        { geo: new THREE.TorusGeometry(0.04, 0.012, 4, 8, Math.PI), color: 0x1a1420, pos: [s * 0.17, 0.12, 0.78] as P, rot: [0, Math.PI / 2, 0] as P },
      ]),
      { geo: new THREE.CylinderGeometry(0.08, 0.1, 0.16, 12), color: skin, pos: [0, 1.56, 0.04] },
      // Left arm, hand on the hip (sleeve, then the green hand with knobbly fingers).
      tube([[0.4, 1.34, 0], [0.6, 1.08, 0.02], [0.56, 0.9, 0.2]], 0.1, 0.08, robe),
      { geo: new THREE.ConeGeometry(0.13, 0.22, 10, 1, true), color: robeDark, pos: [0.57, 0.95, 0.15], rot: [-0.9, 0, 0.4] },
      { geo: new THREE.SphereGeometry(0.065, 10, 8), color: skin, pos: [0.52, 0.86, 0.28], scale: [1, 0.8, 1.2] },
      ...[0, 1, 2].map((k) => ({ geo: new THREE.CylinderGeometry(0.014, 0.01, 0.1, 5), color: skin, pos: [0.47 + k * 0.03, 0.83, 0.33] as P, rot: [1.2, 0, 0.3] as P })),
    ]);
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    const bodyMesh = new THREE.Mesh(body, mat);
    bodyMesh.castShadow = true;

    // Head: warty green face, hooked crooked nose, jutting pointed chin, sunken mismatched eyes, a
    // unibrow, a crooked toothy grin, pointed ears, stringy grey hair and a bent hat. Built around (0,0,0).
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const hair: Part[] = [];
    for (let k = 0; k < 40; k++) {
      // Sides and back (her face looks toward +Z), from under the brim down past the shoulders.
      const a = Math.PI * 0.32 + (k / 39) * Math.PI * 1.36 + (rnd() - 0.5) * 0.08;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const len = 0.42 + rnd() * 0.3;
      const flare = 0.24 + rnd() * 0.12;
      const wave = (rnd() - 0.5) * 0.1;
      hair.push(tube([[s * 0.19, 0.09, c * 0.19], [s * 0.25 + wave, -0.08, c * 0.25], [s * flare - wave, -0.25 - len * 0.4, c * flare], [s * (flare + 0.06) + wave, -0.2 - len, c * (flare + 0.06)]], 0.026, 0.006, k % 3 === 0 ? 0x3a3432 : k % 3 === 1 ? 0x8a8680 : 0x6a6660, 8));
    }
    // A few frizzy strands sticking out at the sides.
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) hair.push(tube([[s * 0.19, 0.06 - k * 0.04, 0.05], [s * (0.3 + k * 0.03), 0.02 - k * 0.05, 0.08], [s * (0.38 + k * 0.04), -0.04 - k * 0.06, 0.04]], 0.014, 0.004, 0x8a8680, 5));
    const warts: Part[] = ([[0.025, -0.03, 0.33, 0.022], [0.12, -0.06, 0.15, 0.026], [-0.06, -0.25, 0.15, 0.02], [-0.13, 0.08, 0.13, 0.016]] as const).map(([x, y, z, r]) => ({ geo: new THREE.SphereGeometry(r, 8, 6), color: skinDark, pos: [x, y, z] as P }));
    const brim = new THREE.CylinderGeometry(0.46, 0.46, 0.025, 32, 2);
    const bp = brim.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i);
      const z = bp.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.3) bp.setY(i, bp.getY(i) - (r - 0.3) * 0.35 + Math.sin(Math.atan2(z, x) * 3) * 0.025);
    }
    brim.computeVertexNormals();
    const face = mergeColoredParts([
      { geo: new THREE.SphereGeometry(0.21, 22, 18), color: skin, pos: [0, 0, 0], scale: [1, 1.08, 0.95] },
      { geo: new THREE.SphereGeometry(0.14, 16, 12), color: skin, pos: [0, -0.13, 0.08], scale: [0.85, 0.7, 0.95] },
      { geo: new THREE.ConeGeometry(0.045, 0.11, 10), color: skin, pos: [0, -0.2, 0.16], rot: [1.77, 0, 0] },
      tube([[0, 0.03, 0.17], [0, 0.0, 0.27], [0.01, -0.06, 0.34], [0.025, -0.13, 0.33]], 0.055, 0.014, skin, 12),
      ...warts,
      ...[-1, 1].flatMap((s) => [
        { geo: new THREE.SphereGeometry(0.055, 12, 8), color: 0x3a4a1a, pos: [s * 0.085, 0.05, 0.15] as P, scale: [1.1, 0.8, 0.5] as P },
        { geo: new THREE.SphereGeometry(s < 0 ? 0.04 : 0.032, 10, 8), color: 0xe0d860, pos: [s * 0.085, 0.05, 0.17] as P },
        { geo: new THREE.SphereGeometry(0.014, 6, 4), color: 0x8a1010, pos: [s * 0.08, 0.05, 0.205] as P },
        { geo: new THREE.ConeGeometry(0.05, 0.14, 8), color: skin, pos: [s * 0.22, 0.03, -0.01] as P, rot: [0, 0, -s * 1.3] as P },
        { geo: new THREE.BoxGeometry(0.07, 0.008, 0.01), color: skinDark, pos: [s * 0.1, -0.06, 0.18] as P, rot: [0, s * 0.4, s * 0.5] as P },
      ]),
      { geo: new THREE.BoxGeometry(0.2, 0.025, 0.03), color: 0x2a2a28, pos: [0, 0.11, 0.17], rot: [0, 0, 0.08] },
      ...[0, 1, 2].map((k) => ({ geo: new THREE.BoxGeometry(0.14 - k * 0.02, 0.006, 0.01), color: skinDark, pos: [0, 0.15 + k * 0.025, 0.165 - k * 0.01] as P })),
      { geo: new THREE.SphereGeometry(0.07, 10, 6), color: 0x2a0a0a, pos: [0, -0.115, 0.165], scale: [1.2, 0.3, 0.5] },
      { geo: new THREE.BoxGeometry(0.022, 0.04, 0.012), color: 0xd8c860, pos: [-0.028, -0.105, 0.19], rot: [0, 0, 0.15] },
      { geo: new THREE.BoxGeometry(0.02, 0.055, 0.012), color: 0xc8b850, pos: [0.034, -0.12, 0.188], rot: [0, 0, -0.25] },
      ...hair,
      // The hat: a floppy wavy brim, a crooked cone in three bends with a curled tip, a band and buckle.
      { geo: brim, color: 0x1a1420, pos: [0, 0.15, 0] },
      { geo: new THREE.CylinderGeometry(0.14, 0.21, 0.3, 20), color: 0x1a1420, pos: [0, 0.31, -0.01], rot: [-0.08, 0, 0] },
      { geo: new THREE.CylinderGeometry(0.08, 0.14, 0.28, 16), color: 0x1a1420, pos: [0.03, 0.57, -0.04], rot: [-0.15, 0, -0.22] },
      { geo: new THREE.ConeGeometry(0.08, 0.3, 14), color: 0x1a1420, pos: [0.12, 0.78, -0.08], rot: [-0.2, 0, -0.65] },
      { geo: new THREE.SphereGeometry(0.03, 8, 6), color: 0x1a1420, pos: [0.24, 0.86, -0.1] },
      { geo: new THREE.TorusGeometry(0.205, 0.035, 6, 24), color: 0x6a3a8a, pos: [0, 0.2, -0.01], rot: [Math.PI / 2 - 0.08, 0, 0] },
      { geo: new THREE.BoxGeometry(0.08, 0.07, 0.015), color: 0xd8b040, pos: [0, 0.2, 0.215] },
      { geo: new THREE.BoxGeometry(0.06, 0.06, 0.01), color: 0x4a6a3a, pos: [-0.12, 0.33, 0.14], rot: [0, -0.5, 0] },
    ]);
    const faceMesh = new THREE.Mesh(face, mat);
    faceMesh.castShadow = true;
    this.head.add(faceMesh);
    this.head.position.set(0, 1.74, 0.06);

    // The stirring arm, from the right shoulder: sleeve, bell cuff, knobbly hand holding the ladle over the
    // cauldron's rim; the ladle dips into the brew (the cauldron's center is 1.2 m in front of her).
    const shoulder = V(-0.4, 1.36, 0.05);
    const hand: P = [0.14, 0.06, 0.55];
    const bowl: P = [0.36, -0.2, 1.08];
    const ladleDir = V(bowl[0] - hand[0], bowl[1] - hand[1], bowl[2] - hand[2]);
    const ladleLen = ladleDir.length();
    const ladleMid: P = [(bowl[0] + hand[0]) / 2, (bowl[1] + hand[1]) / 2, (bowl[2] + hand[2]) / 2];
    const ladleRot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), ladleDir.normalize()));
    const arm = mergeColoredParts([
      tube([[0, 0, 0], [0.06, -0.2, 0.25], [0.12, -0.02, 0.48]], 0.1, 0.075, robe),
      { geo: new THREE.ConeGeometry(0.12, 0.2, 10, 1, true), color: robeDark, pos: [0.12, 0.0, 0.47], rot: [-Math.PI / 2 + 0.4, 0, 0] },
      { geo: new THREE.SphereGeometry(0.065, 10, 8), color: skin, pos: hand, scale: [1, 0.9, 1.2] },
      ...[0, 1, 2].map((k) => ({ geo: new THREE.TorusGeometry(0.035, 0.014, 4, 8, Math.PI * 1.3), color: skin, pos: [hand[0] + 0.03, hand[1] - 0.02 - k * 0.03, hand[2] + 0.03] as P, rot: [0, Math.PI / 2, 0.4] as P })),
      { geo: new THREE.CylinderGeometry(0.016, 0.016, ladleLen + 0.12, 6), color: 0x5a3a22, pos: ladleMid, rot: [ladleRot.x, ladleRot.y, ladleRot.z] },
      { geo: new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), color: 0x4a4a52, pos: bowl },
    ]);
    const armMesh = new THREE.Mesh(arm, mat);
    armMesh.castShadow = true;
    this.arm.add(armMesh);
    this.arm.position.copy(shoulder);
    this.bubble.sprite.position.set(0, 2.6, 0);
    this.root.add(bodyMesh, this.head, this.arm, this.bubble.sprite);
    this.root.position.copy(feet);
    this.root.rotation.y = yaw;
    scene.add(this.root);
    const scold = props.register('bruxa', () => {
      this.shake = 0.6;
      this.bubble.say(WITCH_SCOLDS[this.scolds++ % WITCH_SCOLDS.length], 2.8);
      this.sfx.scold(this.mouth());
    });
    b.cuboidCollider(V(feet.x, feet.y + 0.8, feet.z), V(0.5, 0.8, 0.5), NO_ROT, 'wood', scold);
    b.ballCollider(V(feet.x, feet.y + 1.8, feet.z), 0.3, 'wood', scold);
  }

  private mouth() {
    return this.root.localToWorld(V(0, 1.62, 0.2));
  }

  /** Someone drank her potion (`kind`): she cackles a line about it. */
  drink(kind: PotionKind) {
    this.shake = 0.4;
    const lines = WITCH_LINES[kind];
    this.bubble.say(lines[this.lines++ % lines.length], 3.2);
    this.sfx.cackle(this.mouth());
  }

  update(dt: number, listener: THREE.Vector3) {
    this.t += dt;
    this.bubble.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    // Stirring: the ladle's bowl circles inside the cauldron.
    this.arm.rotation.set(Math.cos(this.t * 2.2) * 0.05, Math.sin(this.t * 2.2) * 0.13, 0);
    // Head: toward whoever is near (within her neck's reach), otherwise down at the brew.
    const dx = listener.x - this.feet.x;
    const dz = listener.z - this.feet.z;
    let want = 0;
    let tilt = 0.3;
    if (dx * dx + dz * dz < 64 && Math.abs(listener.y - this.feet.y) < 3) {
      const d = Math.atan2(dx, dz) - this.yaw;
      want = THREE.MathUtils.clamp(Math.atan2(Math.sin(d), Math.cos(d)), -1.1, 1.1);
      tilt = -0.05;
    }
    this.head.rotation.y += (want - this.head.rotation.y) * Math.min(1, dt * 4);
    this.head.rotation.x += (tilt - this.head.rotation.x) * Math.min(1, dt * 3);
    this.head.rotation.z = Math.sin(this.t * 30) * this.shake * 0.15 + Math.sin(this.t * 1.1) * 0.04;
    this.root.position.y = this.feet.y + Math.abs(Math.sin(this.t * 2.2)) * 0.012;
  }
}
