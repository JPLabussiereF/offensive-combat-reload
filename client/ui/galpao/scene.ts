// Galpão: the 3D home of Offensive Combat. Builds the warehouse (textures and materials painted on canvases, so
// no asset downloads), lights it, runs a small HDR post chain (bloom, ACES, grade, grain) and a camera director
// that flies between the stations. Each station's DOM panel is pinned onto its prop with a CSS homography, so the
// UI lives in the world but stays real HTML. Every text painted into a texture comes from GalpaoOptions.labels
// (the game ships pt-BR and en); the arsenal's pegboard is laid out from the weapon catalog passed in.
import * as THREE from 'three';
import { STATION_ORDER } from './galpaoRules';
import type { CamStation, StationId } from './galpaoRules';

export { STATION_ORDER };
export type { CamStation, StationId };

export interface GalpaoLabels {
  /** Floor stencils, e.g. '01 · OPERAÇÕES' (the album has none). */
  stations: Record<Exclude<StationId, 'album'>, string>;
  /** Pegboard section headers. */
  sections: { primaria: string; secundaria: string; faca: string; granada: string };
  adminTitle: string;
  adminSub: string;
  danger: string;
  highVoltage: string;
  exit: string;
  /** Magazine cover, in order: masthead, title line 1, title line 2, footer. */
  album: string[];
}

export interface GalpaoOptions {
  canvas: HTMLCanvasElement;
  mobile?: boolean;
  duration?: number;
  /** The nameplate on the locker (was hardcoded 'AIRAM #4821'). */
  playerTag: string;
  labels: GalpaoLabels;
  /** The pegboard's weapons per section, in order. 'mina' in granada is the mine upgrade shown as a prop. */
  arsenal: { primaria: readonly string[]; secundaria: readonly string[]; faca: readonly string[]; granada: readonly string[] };
  onProgress?(p: number): void;
  onArrive?(id: CamStation): void;
  onLeave?(prev: CamStation, id: CamStation): void;
  onWeaponPick?(id: string): void;
  onStationPick?(id: StationId): void;
  onHoverStation?(id: StationId | null): void;
  onZoom?(full: boolean): void;
}

/**
 * A character for the hero table (the player's own, client/ui/galpao/heroCharacter.ts), in the hero group's space:
 * the scene adds it, calls `update` every frame and `dispose` when it is replaced or the scene goes.
 */
export interface GalpaoHero {
  object: THREE.Object3D;
  update(dt: number, camera: THREE.Camera, time: number): void;
  dispose(): void;
}

export interface Galpao {
  goTo(id: StationId | 'home', instant?: boolean): void;
  /** Puts a character at the hero table in place of the clay mannequin (null: the mannequin again). */
  setHero(h: GalpaoHero | null): void;
  intro(): void;
  readonly station: CamStation;
  setDuration(s: number): void;
  peek(id: StationId | null): void;
  bindSurface(id: StationId, el: HTMLElement): void;
  bindTag(id: string, el: HTMLElement): void;
  bindCard(el: HTMLElement): void;
  selectWeapon(id: string | null): void;
  resetPan(): void;
  flipPage(dir: number, mid?: () => void): void;
  launch(done: () => void): void;
  resetLaunch(): void;
  resize(): void;
  dispose(): void;
}

type V3 = THREE.Vector3;
type RGB = readonly number[];
type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
interface Pt { x: number; y: number }

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0): V3 => new THREE.Vector3(x, y, z);
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoother = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const SUN = V(-0.35, 0.68, -1).normalize();

function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function tileNoise(seed: number, per: number): (x: number, y: number, oct?: number) => number {
  const r = rng(seed), P = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) P[i] = r();
  const L = (ix: number, iy: number, p: number) => P[(((iy % p) + p) % p) * 256 + (((ix % p) + p) % p)];
  const n = (x: number, y: number, p: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = L(xi, yi, p), b = L(xi + 1, yi, p), c = L(xi, yi + 1, p), d = L(xi + 1, yi + 1, p);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, oct = 4) => {
    let s = 0, amp = 0.5, norm = 0, f = per;
    for (let i = 0; i < oct; i++) { s += amp * n(x * f, y * f, f); norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
}
function canvasTex(w: number, h: number, draw: Draw, { srgb = true, rep = [1, 1] }: { srgb?: boolean; rep?: [number, number] } = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('galpao: no 2d canvas context');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 8;
  return t;
}
function pixels(g: CanvasRenderingContext2D, w: number, h: number, f: (u: number, v: number, x: number, y: number) => RGB): void {
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = f(x / w, y / h, x, y), i = (y * w + x) * 4;
    d[i] = clamp(c[0], 0, 1) * 255; d[i + 1] = clamp(c[1], 0, 1) * 255; d[i + 2] = clamp(c[2], 0, 1) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
const mtx = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));

function boxGeo(w: number, h: number, d: number, s = 1): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  for (let i = 0; i < 24; i++) {
    const f = Math.floor(i / 4), dims = f < 2 ? [d, h] : f < 4 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * dims[0]) / s, (uv.getY(i) * dims[1]) / s);
  }
  return g;
}
function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  const parts = list.map((g) => { const p = g.index ? g.toNonIndexed() : g; n += p.attributes.position.count; return p; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    if (p.attributes.uv) uv.set(p.attributes.uv.array, o * 2);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}
// collects transformed geometry per material and flushes one merged mesh per material (few draw calls)
class Batch {
  private m = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  get base(): THREE.Matrix4 { return this.stack[this.stack.length - 1]; }
  push(m: THREE.Matrix4): this { this.stack.push(this.base.clone().multiply(m)); return this; }
  pop(): this { this.stack.pop(); return this; }
  add(mat: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m ? this.base.clone().multiply(m) : this.base);
    let list = this.m.get(mat);
    if (!list) { list = []; this.m.set(mat, list); }
    list.push(g);
    return this;
  }
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): this { return this.add(mat, boxGeo(w, h, d, s), mtx(x, y, z, rx, ry, rz)); }
  cyl(mat: THREE.Material, r1: number, r2: number, h: number, seg: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this { return this.add(mat, new THREE.CylinderGeometry(r1, r2, h, seg), mtx(x, y, z, rx, ry, rz)); }
  // a bar from a to b (w × d section)
  bar(mat: THREE.Material, a: V3, b: V3, w: number, d = w): this {
    const dir = b.clone().sub(a), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1));
    return this.add(mat, boxGeo(w, len, d), m);
  }
  rod(mat: THREE.Material, a: V3, b: V3, r: number, seg = 8): this {
    const dir = b.clone().sub(a), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize());
    return this.add(mat, new THREE.CylinderGeometry(r, r, len, seg, 1, true), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
  }
  flush(parent: THREE.Object3D, cast = true, receive = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.m) {
      const mesh = new THREE.Mesh(mergeGeos(list), mat);
      mesh.castShadow = cast && !mat.userData.noCast;
      mesh.receiveShadow = receive;
      parent.add(mesh);
      out.push(mesh);
    }
    this.m.clear();
    return out;
  }
}

interface TextLine { t: string; font?: string; fg?: string; y?: number }
interface TextOpts { w?: number; h?: number; bg?: string; fg?: string; font?: string; align?: CanvasTextAlign; pad?: number; after?: Draw }
type SectionKey = 'primaria' | 'secundaria' | 'faca' | 'granada';
type Section = { key: SectionKey; label: string; u0: number; u1: number; ids: readonly string[] } &
  ({ kind: 'vertical'; top: number } | { kind: 'grid'; cols: number; rows: number[] } | { kind: 'sub'; v: number });
interface WeaponDef { id: string; u: number; v: number; w: number; h: number }
interface Weapon { group: THREE.Group; def: WeaponDef; anchor: V3 }
interface KeyLight { light: THREE.Light; base: number; boost: number }
interface Surf {
  anchor: THREE.Object3D; w: number; h: number; dir: V3; fov: number; maxW?: number; noDom?: boolean;
  el: HTMLElement | null; reveal: number; want: number; W: number; H: number;
}
interface Basis { c: V3; r: V3; u: V3; n: V3; dir: V3 }
interface Pose { pos: V3; target: V3; up: V3; fov: number; film: number }
interface SurfPose extends Pose { d: number; basis: Basis }
interface Move { curve: THREE.CatmullRomCurve3; q0: THREE.Quaternion; q1: THREE.Quaternion; fov0: number; fov1: number; film0: number; film1: number; t: number; dur: number; id: StationId | 'home' }
interface Tween { obj: THREE.Euler; key: 'x' | 'y' | 'z'; from: number; to: number; dur: number; t: number; done?: () => void }
interface Drag { x: number; y: number; moved: number; pinch: number }

export async function createGalpao(opt: GalpaoOptions): Promise<Galpao> {
  const { canvas, mobile = false, labels } = opt;
  let disposed = false;
  // every callback goes through here so nothing reaches the caller after dispose()
  const cb = {
    onProgress: (p: number) => { if (!disposed) opt.onProgress?.(p); },
    onArrive: (id: CamStation) => { if (!disposed) opt.onArrive?.(id); },
    onLeave: (prev: CamStation, id: CamStation) => { if (!disposed) opt.onLeave?.(prev, id); },
    onWeaponPick: (id: string) => { if (!disposed) opt.onWeaponPick?.(id); },
    onStationPick: (id: StationId) => { if (!disposed) opt.onStationPick?.(id); },
    onHoverStation: (id: StationId | null) => { if (!disposed) opt.onHoverStation?.(id); },
    onZoom: (full: boolean) => { if (!disposed) opt.onZoom?.(full); },
  };
  let duration = opt.duration ?? 1.0;
  const tick = async (p: number) => { cb.onProgress(p); await new Promise((r) => setTimeout(r, 0)); };
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms);
    timers.add(id);
  };
  const R = rng(1337);
  const TS = mobile ? 512 : 1024;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  // Dev only (PF-35): what the last frame drew, every pass together (the scene, a CCTV feed every third frame, the
  // post chain), in window.__ocGalpao; client/dev/bench.ts (?bench=galpao) measures with it.
  const devInfo = import.meta.env.DEV ? { renderer, chamadas: 0, triangulos: 0, quadros: 0 } : null;
  if (devInfo) Object.assign(window, { __ocGalpao: devInfo });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6));
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap was removed (three warns and falls back); PCF now does a soft Vogel-disk filter itself
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  if (devInfo) Object.assign(devInfo, { scene });
  scene.background = new THREE.Color(0x060708);
  scene.fog = new THREE.FogExp2(0x0d0f12, 0.03);
  await tick(0.05);

  // ---------- textures ----------
  const N8 = tileNoise(7, 8), N32 = tileNoise(13, 32), N4 = tileNoise(29, 4);
  const floorMap = canvasTex(TS, TS, (g, w, h) => {
    pixels(g, w, h, (u, v) => {
      const lo = N8(u, v, 4), hi = N32(u, v, 2), st = N4(u, v, 3);
      let c = 0.5 + (lo - 0.5) * 0.32 + (hi - 0.5) * 0.16;
      if (st > 0.6) c -= (st - 0.6) * 0.9;
      if (R() < 0.012) c -= 0.1;
      return [c * 0.98, c * 0.955, c * 0.91];
    });
    g.fillStyle = 'rgba(20,18,16,.6)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    g.fillStyle = 'rgba(20,18,16,.25)'; g.fillRect(0, h / 2, w, 1);
    for (let i = 0; i < 6; i++) { // tyre marks
      g.strokeStyle = 'rgba(15,14,13,.08)'; g.lineWidth = w * 0.02; g.beginPath();
      const y0 = R() * h; g.moveTo(0, y0); g.bezierCurveTo(w * 0.3, y0 + (R() - 0.5) * h * 0.4, w * 0.7, y0 + (R() - 0.5) * h * 0.4, w, y0); g.stroke();
    }
  }, { rep: [6, 4] });
  const floorRough = canvasTex(TS / 2, TS / 2, (g, w, h) => pixels(g, w, h, (u, v) => { const r = 0.55 + (N8(u, v, 3) - 0.5) * 0.9; return [r, r, r]; }), { srgb: false, rep: [6, 4] });
  await tick(0.18);
  const corrMap = canvasTex(512, 512, (g, w, h) => {
    pixels(g, w, h, (u, v) => { const c = 0.55 + (N8(u, v, 3) - 0.5) * 0.25 + (N32(u * 4, v * 0.25, 1) - 0.5) * 0.12; return [c * 0.93, c * 0.97, c]; });
    for (let i = 0; i < 26; i++) {
      const x = R() * w, y = R() * h * 0.8, len = 40 + R() * 160, gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, 'rgba(120,62,28,.55)'); gr.addColorStop(1, 'rgba(120,62,28,0)');
      g.fillStyle = gr; g.fillRect(x, y, 2 + R() * 4, len);
    }
  });
  const blockMap = canvasTex(512, 256, (g, w, h) => {
    pixels(g, w, h, (u, v) => { const c = 0.42 + (N8(u, v, 3) - 0.5) * 0.12 - (v > 0.86 ? (v - 0.86) * 1.2 : 0); return [c * 0.92, c, c * 0.9]; });
    g.fillStyle = 'rgba(25,26,24,.55)';
    for (let r = 0; r < 6; r++) {
      g.fillRect(0, (r * h) / 6, w, 3);
      for (let k = 0; k <= 6; k++) g.fillRect(((k + (r % 2) * 0.5) * w) / 6, (r * h) / 6, 3, h / 6);
    }
    g.fillStyle = 'rgba(201,154,28,.85)'; g.fillRect(0, h * 0.06, w, h * 0.05);
  });
  const woodMap = canvasTex(512, 512, (g, w, h) => {
    pixels(g, w, h, (u, v) => {
      const plank = Math.floor(v * 5), t = N32(u * 0.25 + plank * 0.13, v * 4 + plank * 0.71, 2);
      const c = 0.42 + (t - 0.5) * 0.3 + Math.sin(u * 80 + t * 12) * 0.03 + (plank % 2) * 0.04;
      return [c * 1.0, c * 0.74, c * 0.5];
    });
    g.fillStyle = 'rgba(20,12,6,.6)'; for (let p = 1; p < 5; p++) g.fillRect(0, (p * h) / 5, w, 2);
  });
  const corkMap = canvasTex(256, 256, (g, w, h) => pixels(g, w, h, (u, v) => { const c = 0.5 + (N32(u, v, 2) - 0.5) * 0.5 + (R() - 0.5) * 0.2; return [c * 0.78, c * 0.58, c * 0.38]; }), { rep: [1, 1] });
  const hazardMap = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#c99a1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#17171a';
    for (let x = -h; x < w + h; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 32 - h, h); g.lineTo(x - h, h); g.fill(); }
  }, { rep: [4, 1] });
  const cardboardMap = canvasTex(256, 256, (g, w, h) => {
    pixels(g, w, h, (u, v) => { const c = 0.62 + (N32(u, v, 2) - 0.5) * 0.18; return [c, c * 0.8, c * 0.56]; });
    g.fillStyle = 'rgba(190,170,130,.6)'; g.fillRect(0, h * 0.46, w, h * 0.08);
  });
  const skyMap = canvasTex(64, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff6e6'); gr.addColorStop(0.6, '#ffd9a8'); gr.addColorStop(1, '#f2b07a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const glowMap = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const textTex = (lines: TextLine[], o: TextOpts = {}) => canvasTex(o.w || 512, o.h || 128, (g, w, h) => {
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = o.fg || '#fff'; g.textBaseline = 'middle'; g.textAlign = o.align || 'center';
    lines.forEach((l, i) => { g.font = l.font || o.font || '700 64px "Barlow Condensed", Arial Narrow, sans-serif'; g.fillStyle = l.fg || o.fg || '#fff'; g.fillText(l.t, o.align === 'left' ? (o.pad || 16) : w / 2, l.y != null ? l.y * h : ((i + 0.5) * h) / lines.length); });
    if (o.after) o.after(g, w, h);
  });
  await tick(0.3);

  // ---------- materials ----------
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  const M = {
    floor: std({ map: floorMap, roughnessMap: floorRough, roughness: 1, metalness: 0, envMapIntensity: 0.6 }),
    corr: std({ map: corrMap, color: 0x8a9298, metalness: 0.55, roughness: 0.58, envMapIntensity: 0.5 }),
    block: std({ map: blockMap, roughness: 0.92 }),
    roof: std({ color: 0x2a2d31, metalness: 0.4, roughness: 0.7 }),
    steel: std({ color: 0x2c3035, metalness: 0.75, roughness: 0.45 }),
    steelL: std({ color: 0x6a7076, metalness: 0.8, roughness: 0.35 }),
    galv: std({ color: 0x9aa1a6, metalness: 0.85, roughness: 0.32 }),
    yellow: std({ color: 0xc9a227, roughness: 0.55, metalness: 0.2 }),
    paint: std({ color: 0xc9a227, roughness: 0.8, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    wood: std({ map: woodMap, roughness: 0.72 }),
    woodDark: std({ map: woodMap, color: 0x8a6a50, roughness: 0.6 }),
    cork: std({ map: corkMap, roughness: 0.95 }),
    paper: std({ color: 0xe8e1d1, roughness: 0.9 }),
    rubber: std({ color: 0x17181a, roughness: 0.92 }),
    plastic: std({ color: 0x232527, roughness: 0.55 }),
    gun: std({ color: 0x2b2e31, metalness: 0.7, roughness: 0.36 }),
    poly: std({ color: 0x1d1e20, roughness: 0.6 }),
    brass: std({ color: 0xb08d57, metalness: 1, roughness: 0.32 }),
    gold: std({ color: 0xd8b04a, metalness: 1, roughness: 0.22 }),
    olive: std({ color: 0x4a5140, roughness: 0.72 }),
    locker: std({ color: 0x545b4d, metalness: 0.45, roughness: 0.5 }),
    rackBlue: std({ color: 0x24456a, metalness: 0.5, roughness: 0.45 }),
    rackOrange: std({ color: 0xb7521c, metalness: 0.4, roughness: 0.5 }),
    red: std({ color: 0x8e2a22, roughness: 0.5, metalness: 0.2 }),
    cardboard: std({ map: cardboardMap, roughness: 0.9 }),
    film: std({ color: 0xc8ccd0, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.55 }),
    drum1: std({ color: 0x1f4b74, roughness: 0.5, metalness: 0.4 }),
    drum2: std({ color: 0x7a2a1d, roughness: 0.6, metalness: 0.35 }),
    drum3: std({ color: 0x3c4a2e, roughness: 0.6, metalness: 0.35 }),
    glass: std({ color: 0x9fb4c0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }),
    mirror: std({ color: 0xd9dde0, metalness: 1, roughness: 0.04, envMapIntensity: 1.4 }),
    clay: std({ color: 0x9c958a, roughness: 0.75, flatShading: true }),
    joint: std({ color: 0x3f3c39, roughness: 0.5, metalness: 0.2, flatShading: true }),
    sky: new THREE.MeshBasicMaterial({ map: skyMap, color: new THREE.Color(2.6, 2.3, 2.0), fog: false }),
    skylight: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.05, 1.25), fog: false }),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.8, 2.6) }),
    tube: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.4, 3.6) }),
    exit: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 0.9) }),
    off: std({ color: 0x1a1b1c, roughness: 0.3, metalness: 0.2 }),
  };
  for (const k of ['sky', 'skylight', 'bulb', 'tube', 'exit', 'glass', 'paint', 'film'] as const) M[k].userData.noCast = true;

  const world = new THREE.Group();
  scene.add(world);
  const pick: Partial<Record<StationId, THREE.Object3D[]>> = {}; // station -> objects for hover/click in the home view
  const addPick = (id: StationId, o: THREE.Object3D) => { (pick[id] ||= []).push(o); o.traverse((c) => (c.userData.station = id)); };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = cast && !mat.userData.noCast; m.receiveShadow = true; parent.add(m); return m;
  };

  // ---------- shell ----------
  const B = new Batch();
  const floor = mesh(new THREE.PlaneGeometry(24, 16), M.floor, world, 0, 0, 0, -Math.PI / 2, 0, 0, false);
  floor.receiveShadow = true;
  const wallDefs: Record<string, { m: THREE.Matrix4; len: number; open: number[][]; sun?: boolean }> = {
    back: { m: mtx(-12, 0, -8), len: 24, open: [[1.6, 4.4, 4.6, 6.2], [7.2, 10.2, 4.6, 6.2], [12.2, 14.4, 4.6, 6.2], [15, 19.6, 0, 4.2], [15.6, 19, 5.0, 6.2], [20.6, 23, 4.6, 6.2]], sun: true },
    left: { m: mtx(-12, 0, 8, 0, Math.PI / 2, 0), len: 16, open: [[4, 7, 4.6, 6.2], [11, 14, 4.6, 6.2]], sun: true },
    right: { m: mtx(12, 0, -8, 0, -Math.PI / 2, 0), len: 16, open: [[2, 5, 4.6, 6.2], [8, 11, 4.6, 6.2]] },
    front: { m: mtx(12, 0, 8, 0, Math.PI, 0), len: 24, open: [[11.6, 12.8, 0, 2.3], [3, 6, 4.6, 6.2], [18, 21, 4.6, 6.2]] },
  };
  function corrRect(a0: number, a1: number, b0: number, b1: number): THREE.PlaneGeometry {
    const w = a1 - a0, h = b1 - b0, n = Math.max(1, Math.ceil(w / 0.05));
    const g = new THREE.PlaneGeometry(w, h, n, 1), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const a = p.getX(i) + a0 + w / 2, b = p.getY(i) + b0 + h / 2; p.setXYZ(i, a, b, 0.022 * Math.sin((a / 0.19) * TAU)); uv.setXY(i, a / 4, b / 4); }
    g.computeVertexNormals();
    return g;
  }
  function flatRect(a0: number, a1: number, b0: number, b1: number): THREE.PlaneGeometry {
    const g = new THREE.PlaneGeometry(a1 - a0, b1 - b0); g.translate((a0 + a1) / 2, (b0 + b1) / 2, 0.025);
    const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.4, p.getY(i) / 1.2);
    return g;
  }
  const openings: { pts: V3[]; door: boolean; name: string }[] = []; // world rects for shafts
  for (const [name, w] of Object.entries(wallDefs)) {
    const xs = [...new Set([0, w.len, ...w.open.flatMap((o) => [o[0], o[1]])])].sort((a, b) => a - b);
    B.push(w.m);
    for (let i = 0; i < xs.length - 1; i++) {
      const a0 = xs[i], a1 = xs[i + 1], mid = (a0 + a1) / 2;
      const ops = w.open.filter((o) => o[0] < mid && o[1] > mid).sort((p, q) => p[2] - q[2]);
      let y = 0; const spans: [number, number][] = [];
      for (const o of ops) { if (o[2] > y) spans.push([y, o[2]]); y = Math.max(y, o[3]); }
      if (y < 7) spans.push([y, 7]);
      for (const [b0, b1] of spans) {
        if (b0 < 1.2 && b1 > 1.2) { B.add(M.block, flatRect(a0, a1, b0, 1.2)); B.add(M.corr, corrRect(a0, a1, 1.2, b1)); }
        else if (b1 <= 1.2) B.add(M.block, flatRect(a0, a1, b0, b1));
        else B.add(M.corr, corrRect(a0, a1, b0, b1));
      }
    }
    for (const o of w.open) {
      const [a0, a1, b0, b1] = o, door = b0 === 0;
      const fw = 0.07;
      if (!door) {
        B.box(M.steel, a1 - a0 + fw * 2, fw, 0.1, (a0 + a1) / 2, b0 - fw / 2, 0.02);
        B.box(M.steel, a1 - a0 + fw * 2, fw, 0.1, (a0 + a1) / 2, b1 + fw / 2, 0.02);
        B.box(M.steel, a1 - a0, 0.035, 0.06, (a0 + a1) / 2, (b0 + b1) / 2, 0.02);
        const n = Math.max(2, Math.round((a1 - a0) / 0.72));
        for (let k = 0; k <= n; k++) B.box(M.steel, k === 0 || k === n ? fw : 0.035, b1 - b0, 0.08, a0 + ((a1 - a0) * k) / n, (b0 + b1) / 2, 0.02);
        B.add(M.glass, new THREE.PlaneGeometry(a1 - a0, b1 - b0).translate((a0 + a1) / 2, (b0 + b1) / 2, 0.0));
      } else {
        B.box(M.steel, 0.14, b1 + 0.3, 0.16, a0 - 0.07, (b1 + 0.3) / 2, 0.05);
        B.box(M.steel, 0.14, b1 + 0.3, 0.16, a1 + 0.07, (b1 + 0.3) / 2, 0.05);
      }
      B.add(M.sky, new THREE.PlaneGeometry(a1 - a0 + 1.2, b1 - b0 + 1.2).translate((a0 + a1) / 2, (b0 + b1) / 2, door ? -1.6 : -0.6));
      if (w.sun) {
        const c = [[a0, b1], [a1, b1], [a1, door ? 0.45 : b0], [a0, door ? 0.45 : b0]].map(([a, b]) => V(a, door ? Math.min(b, 0.45) : b, 0).applyMatrix4(w.m));
        if (door) { c[0].y = 0.45; c[1].y = 0.45; c[2].y = 0.02; c[3].y = 0.02; }
        openings.push({ pts: c, door, name });
      }
    }
    B.pop();
  }
  // gables
  for (const gz of [-8, 8]) {
    const s = new THREE.Shape([new THREE.Vector2(-12, 7), new THREE.Vector2(12, 7), new THREE.Vector2(0, 8.25)]);
    const g = new THREE.ShapeGeometry(s); if (gz > 0) g.rotateY(Math.PI); g.translate(0, 0, gz);
    B.add(M.corr, g);
  }
  // roof with skylights
  const roofY = (x: number) => 7 + 1.2 * (1 - Math.abs(x) / 12);
  const slope = Math.atan(1.2 / 12);
  const skyZ = [[-6.6, -4.2], [-2.0, 0.4], [2.6, 5.0]];
  const roofStrip = (x0: number, x1: number, z0: number, z1: number, mat: THREE.Material = M.roof) => {
    const xm = (x0 + x1) / 2, len = (x1 - x0) / Math.cos(slope);
    B.box(mat, len, 0.04, z1 - z0, xm, roofY(xm) + 0.02, (z0 + z1) / 2, 0, 0, xm < 0 ? slope : -slope);
  };
  for (const side of [-1, 1]) {
    const xa = side < 0 ? [-12, -7.2, -5.4, 0] : [0, 5.4, 7.2, 12];
    roofStrip(xa[0], xa[1], -8, 8); roofStrip(xa[2], xa[3], -8, 8);
    let z = -8;
    for (const [s0, s1] of skyZ) { roofStrip(xa[1], xa[2], z, s0); roofStrip(xa[1], xa[2], s0, s1, M.skylight); z = s1; }
    roofStrip(xa[1], xa[2], z, 8);
  }
  // trusses, purlins, columns
  for (const tz of [-6, -2, 2, 6]) {
    const top = (x: number) => roofY(x) - 0.12;
    B.bar(M.steel, V(-12, 6.25, tz), V(12, 6.25, tz), 0.12, 0.1);
    for (let k = -8; k < 8; k++) {
      const x0 = k * 1.5, x1 = (k + 1) * 1.5;
      B.bar(M.steel, V(x0, top(x0), tz), V(x1, top(x1), tz), 0.12, 0.1);
      B.bar(M.steel, V(x0, 6.25, tz), V(x0, top(x0), tz), 0.06, 0.06);
      const up = k < 0;
      B.bar(M.steel, V(up ? x0 : x1, 6.25, tz), V(up ? x1 : x0, top(up ? x1 : x0), tz), 0.05, 0.05);
    }
  }
  for (let k = -8; k <= 8; k++) { const x = k * 1.5; B.box(M.steel, 0.06, 0.12, 16, x, roofY(x) - 0.1, 0); }
  const iShape = new THREE.Shape();
  [[-0.11, -0.15], [0.11, -0.15], [0.11, -0.13], [0.008, -0.13], [0.008, 0.13], [0.11, 0.13], [0.11, 0.15], [-0.11, 0.15], [-0.11, 0.13], [-0.008, 0.13], [-0.008, -0.13], [-0.11, -0.13]].forEach(([x, y], i) => (i ? iShape.lineTo(x, y) : iShape.moveTo(x, y)));
  const iGeo = new THREE.ExtrudeGeometry(iShape, { depth: 6.25, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const cols = [[-0.8, -7.82, 0], [2.7, -7.82, 0], [8.0, -7.82, 0], [-11.82, -6.9, Math.PI / 2], [-11.82, -2.0, Math.PI / 2], [-11.82, 2.0, Math.PI / 2], [-11.82, 6.6, Math.PI / 2], [11.82, -6.2, Math.PI / 2], [11.82, -0.4, Math.PI / 2], [11.82, 3.8, Math.PI / 2], [11.82, 7.6, Math.PI / 2]];
  for (const [x, z, ry] of cols) {
    B.add(M.steel, iGeo, mtx(x, 0, z, 0, ry, 0));
    B.box(M.yellow, ry ? 0.34 : 0.26, 0.9, ry ? 0.26 : 0.34, x, 0.45, z);
  }
  // cable trays + conduit runs
  for (const [x0, z0, x1, z1] of [[-11.6, -7.6, -11.6, 7.6], [11.6, -7.6, 11.6, 3.6], [-11.6, -7.6, 2.4, -7.6]]) {
    const a = V(x0, 3.4, z0), b = V(x1, 3.4, z1), d = b.clone().sub(a);
    const len = d.length(), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ry = Math.atan2(d.x, d.z);
    B.box(M.galv, 0.3, 0.02, len, cx, 3.4, cz, 0, ry, 0);
    B.box(M.galv, 0.02, 0.08, len, cx + Math.cos(ry) * 0.15, 3.44, cz - Math.sin(ry) * 0.15, 0, ry, 0);
    B.box(M.galv, 0.02, 0.08, len, cx - Math.cos(ry) * 0.15, 3.44, cz + Math.sin(ry) * 0.15, 0, ry, 0);
    for (let c = 0; c < 4; c++) B.box(M.rubber, 0.035, 0.035, len, cx + Math.cos(ry) * (c * 0.06 - 0.09), 3.43, cz - Math.sin(ry) * (c * 0.06 - 0.09), 0, ry, 0);
  }
  // floor paint: walkway lines + door hazard
  for (const [x, z, w, d] of [[-2.6, 0.6, 0.08, 13], [2.6, 0.6, 0.08, 13], [0, -5.9, 5.28, 0.08], [0, 7.1, 5.28, 0.08]]) B.add(M.paint, new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, 0.003, z));
  const hz = std({ map: hazardMap, roughness: 0.8, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); hz.userData.noCast = true;
  B.add(hz, new THREE.PlaneGeometry(4.6, 0.5).rotateX(-Math.PI / 2).translate(5.3, 0.003, -7.55));
  B.flush(world);
  await tick(0.42);

  // floor stencils (station names)
  const stencil = (txt: string, x: number, z: number, ry: number, w = 2.2) => {
    const t = textTex([{ t: txt }], { w: 512, h: 96, font: '700 70px "Barlow Condensed", Arial Narrow, sans-serif', fg: 'rgba(230,224,210,.9)' });
    const m = std({ map: t, transparent: true, opacity: 0.35, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    mesh(new THREE.PlaneGeometry(w, w * 0.1875), m, world, x, 0.004, z, -Math.PI / 2, 0, ry, false);
  };
  const st = labels.stations;
  stencil(st.play, 5.2, -2.6, 0); stencil(st.maps, -5.7, -5.9, 0, 2.6); stencil(st.arsenal, -9.6, -2.0, -Math.PI / 2);
  stencil(st.profile, -9.9, 4.7, -Math.PI / 2); stencil(st.settings, 9.6, -2.6, Math.PI / 2); stencil(st.admin, 6.4, 6.0, Math.PI / 2, 1.8);
  // wall zone numerals
  const wallNum = (txt: string, x: number, y: number, z: number, ry: number) => {
    const m = std({ map: textTex([{ t: txt }], { w: 256, h: 256, font: '800 210px "Barlow Condensed", Arial Narrow, sans-serif', fg: 'rgba(225,220,205,1)' }), transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    mesh(new THREE.PlaneGeometry(1.3, 1.3), m, world, x, y, z, 0, ry, 0, false);
  };
  wallNum('01', 8.6, 3.2, -7.95, 0); wallNum('02', -5.7, 3.4, -7.95, 0); wallNum('03', -11.95, 3.6, -5.0, Math.PI / 2); wallNum('06', 11.95, 3.6, -4.6, -Math.PI / 2);

  // ---------- lights ----------
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 12, 22), new THREE.MeshBasicMaterial({ color: 0x15171a, side: THREE.BackSide })));
  const envPanel = (w: number, h: number, x: number, y: number, z: number, ry: number, c: THREE.Color) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c })); p.position.set(x, y, z); p.rotation.y = ry; env.add(p); };
  envPanel(14, 2, 0, 5.4, -10.9, 0, new THREE.Color(3, 2.4, 1.7)); envPanel(4, 1.4, -14.9, 5.4, -2, Math.PI / 2, new THREE.Color(2.4, 2, 1.6));
  const sk = new THREE.Mesh(new THREE.PlaneGeometry(20, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.0, 1.2) })); sk.position.set(0, 5.9, 0); sk.rotation.x = Math.PI / 2; env.add(sk);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(env, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;

  const hemi = new THREE.HemisphereLight(0x8fa3b8, 0x2a2219, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd2a1, 7.5);
  sun.position.copy(SUN).multiplyScalar(40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 15, bottom: -15, near: 1, far: 90 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const keys: Record<string, KeyLight> = {};
  const spot = (id: string | null, x: number, y: number, z: number, tx: number, ty: number, tz: number, color: number, intensity: number, angle: number, shadow = false, pen = 0.7) => {
    const s = new THREE.SpotLight(color, intensity, 14, angle, pen, 2);
    s.position.set(x, y, z); s.target.position.set(tx, ty, tz);
    if (shadow) { s.castShadow = true; s.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024); s.shadow.bias = -0.0006; s.shadow.camera.near = 0.3; }
    scene.add(s, s.target);
    if (id) keys[id] = { light: s, base: intensity, boost: 0 };
    return s;
  };
  const point = (id: string | null, x: number, y: number, z: number, color: number, intensity: number, dist = 8) => {
    const p = new THREE.PointLight(color, intensity, dist, 2); p.position.set(x, y, z); scene.add(p);
    if (id) keys[id] = { light: p, base: intensity, boost: 0 };
    return p;
  };
  spot('home', 0.1, 2.4, 0.75, -0.25, 0.6, 0.45, 0xffc58a, 9, 0.8, true);
  spot('play', 5.2, 2.6, -5.6, 5.2, 0.6, -4.3, 0xffd2a0, 30, 0.9, !mobile);
  spot('arsenal', -9.3, 3.2, -2.0, -11.6, 1.6, -2.0, 0xfff0dc, 42, 0.95, false, 0.9);
  spot('maps', -5.7, 3.3, -5.2, -5.7, 1.7, -7.8, 0xffe3c0, 26, 0.85, false, 0.85);
  point('profile', -10.6, 2.55, 4.7, 0xdfe9ff, 9, 6);
  point('settings', 10.7, 2.5, -2.6, 0xfff1dd, 10, 6);
  point('admin', 10.0, 2.35, 5.9, 0x9fd8ff, 6, 6);
  point(null, 5.3, 0.35, -7.4, 0xffb067, 6, 5);
  spot(null, 0, 6.0, -2, 0, 0, 1, 0xffd9b0, 120, 1.0, false, 1); // high bay
  await tick(0.5);

  // lamps (pendants + high bays)
  const shadeGeo = new THREE.LatheGeometry([V(0.02, 0), V(0.06, -0.02), V(0.1, -0.08), V(0.22, -0.22), V(0.25, -0.26)].map((p) => new THREE.Vector2(p.x, p.y)), 20);
  const lamp = (x: number, y: number, z: number, cable: number, on = true, scale = 1) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(scale); world.add(g);
    mesh(shadeGeo, M.steel, g).material = std({ color: 0x2c3a33, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide });
    mesh(new THREE.SphereGeometry(0.06, 12, 8), on ? M.bulb : M.off, g, 0, -0.16, 0, 0, 0, 0, false);
    mesh(new THREE.CylinderGeometry(0.006, 0.006, cable, 4), M.rubber, g, 0, cable / 2, 0, 0, 0, 0, false);
    if (on) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xffb36b, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); s.position.y = -0.2; s.scale.setScalar(0.9); g.add(s); }
    return g;
  };
  lamp(0.1, 2.55, 0.75, 3.6); lamp(5.2, 2.75, -5.6, 3.4);
  const bays: [number, number, boolean][] = [[-6, -6, true], [0, -6, false], [6, -6, true], [-6, -2, false], [6, -2, true], [-6, 2, true], [0, 2, false], [6, 6, false], [-6, 6, false]];
  for (const [x, z, on] of bays) lamp(x, 5.6, z, 0.6, on, 1.6);
  const tubeFix = (x: number, y: number, z: number, ry: number, len = 1.25) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; world.add(g);
    mesh(boxGeo(len + 0.1, 0.05, 0.14), M.galv, g, 0, 0.03, 0);
    mesh(new THREE.CylinderGeometry(0.016, 0.016, len, 8).rotateZ(Math.PI / 2), M.tube, g, 0, -0.01, 0.03, 0, 0, 0, false);
    mesh(new THREE.CylinderGeometry(0.016, 0.016, len, 8).rotateZ(Math.PI / 2), M.tube, g, 0, -0.01, -0.03, 0, 0, 0, false);
  };
  tubeFix(-10.9, 2.75, 4.7, Math.PI / 2, 1.6); tubeFix(10.95, 2.7, -2.6, Math.PI / 2, 1.6); tubeFix(9.8, 2.68, 5.9, Math.PI / 2, 1.25);

  // ---------- shafts + dust ----------
  const D = SUN.clone().negate();
  const shaftU = { color: { value: new THREE.Color(1.0, 0.78, 0.52) }, time: { value: 0 }, strength: { value: mobile ? 0.1 : 0.085 } };
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: shaftU,
    vertexShader: `attribute float along; varying float vA; varying vec3 vN; varying vec3 vW;
      void main(){ vA=along; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 color; uniform float time, strength; varying float vA; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 v=normalize(cameraPosition-vW); float f=pow(abs(dot(normalize(vN),v)),1.8);
        float fade=smoothstep(0.,.1,vA)*(1.-smoothstep(.45,1.,vA));
        float n=.7+.3*sin(vW.x*1.9+time*.31)*sin(vW.z*1.4-time*.23+vW.y*.9);
        gl_FragColor=vec4(color*f*fade*n*strength,1.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const shaftPos: number[] = [], shaftAlong: number[] = [];
  const shafts: { p: V3[]; q: V3[] }[] = [];
  for (const o of openings) {
    const p = o.pts, q = p.map((c) => c.clone().addScaledVector(D, c.y / -D.y + 0.001));
    shafts.push({ p, q });
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const tri: [V3, number][] = [[p[i], 0], [p[j], 0], [q[j], 1], [p[i], 0], [q[j], 1], [q[i], 1]];
      for (const [v, a] of tri) { shaftPos.push(v.x, v.y, v.z); shaftAlong.push(a); }
    }
  }
  const shaftGeo = new THREE.BufferGeometry();
  shaftGeo.setAttribute('position', new THREE.Float32BufferAttribute(shaftPos, 3));
  shaftGeo.setAttribute('along', new THREE.Float32BufferAttribute(shaftAlong, 1));
  shaftGeo.computeVertexNormals();
  const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat); shaftMesh.renderOrder = 5; shaftMesh.frustumCulled = false; world.add(shaftMesh);
  const dustN = mobile ? 500 : 1800, dPos = new Float32Array(dustN * 3), dSeed = new Float32Array(dustN);
  const bil = (a: V3[], s: number, t: number) => a[0].clone().lerp(a[1], s).lerp(a[3].clone().lerp(a[2], s), t);
  for (let i = 0; i < dustN; i++) {
    const sh = shafts[Math.floor(R() * shafts.length)], s = R(), t = R(), a = 0.08 + R() * 0.7;
    const P = bil(sh.p, s, t).lerp(bil(sh.q, s, t), a);
    dPos.set([P.x, P.y, P.z], i * 3); dSeed[i] = R();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dustGeo.setAttribute('seed', new THREE.BufferAttribute(dSeed, 1));
  const dustU = { time: { value: 0 }, px: { value: renderer.getPixelRatio() } };
  const dustMat = new THREE.ShaderMaterial({
    uniforms: dustU,
    vertexShader: `attribute float seed; uniform float time, px; varying float vS;
      void main(){ vS=seed; vec3 p=position+vec3(sin(time*.11+seed*40.)*.25, sin(time*.07+seed*17.)*.18, cos(time*.09+seed*23.)*.25);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(1.2+seed*2.4)*px*(6./-mv.z); }`,
    fragmentShader: `uniform float time; varying float vS; void main(){ vec2 c=gl_PointCoord-.5; float a=smoothstep(.5,0.,length(c));
        float tw=.55+.45*sin(time*(.6+vS)+vS*30.); gl_FragColor=vec4(vec3(1.,.82,.6)*a*tw*.5,1.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; world.add(dust);
  await tick(0.56);

  // ---------- hero table + character + magazine ----------
  const hero = new THREE.Group(); world.add(hero);
  const tableAt = (b: Batch, x: number, z: number, w: number, d: number, top: number, mat: THREE.Material = M.wood) => {
    b.box(mat, w, 0.05, d, x, top - 0.025, z);
    b.box(M.steel, w - 0.04, 0.06, 0.04, x, top - 0.08, z - d / 2 + 0.04);
    b.box(M.steel, w - 0.04, 0.06, 0.04, x, top - 0.08, z + d / 2 - 0.04);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.steel, 0.06, top - 0.05, 0.06, x + sx * (w / 2 - 0.06), (top - 0.05) / 2, z + sz * (d / 2 - 0.06));
    b.box(M.steel, w - 0.1, 0.03, d - 0.1, x, 0.18, z);
  };
  const hb = new Batch();
  tableAt(hb, 0, 0.6, 2.2, 1.0, 0.92);
  hb.box(M.olive, 0.42, 0.2, 0.2, 0.62, 0.3, 0.6); hb.box(M.cardboard, 0.5, 0.26, 0.36, -0.5, 0.33, 0.62);
  // props on top
  hb.box(M.olive, 0.3, 0.16, 0.14, 0.88, 1.0, 0.28); hb.box(M.steelL, 0.06, 0.02, 0.03, 0.88, 1.09, 0.28); // ammo can
  hb.box(M.paper, 0.17, 0.012, 0.23, -0.92, 0.926, 0.62, 0, 0.3, 0); hb.box(M.red, 0.17, 0.004, 0.23, -0.92, 0.933, 0.62, 0, 0.3, 0);
  hb.cyl(M.steelL, 0.02, 0.02, 0.2, 10, 0.86, 0.94, 0.95, 0, 0.9, Math.PI / 2);
  hb.box(M.plastic, 0.06, 0.2, 0.04, -0.3, 0.94, 0.92, Math.PI / 2, 0.2, 0); hb.cyl(M.rubber, 0.006, 0.006, 0.12, 6, -0.36, 0.95, 0.83, Math.PI / 2, 0.2, 0);
  const mugGeo = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.04, 0), new THREE.Vector2(0.042, 0.1), new THREE.Vector2(0.037, 0.1), new THREE.Vector2(0.035, 0.012), new THREE.Vector2(0, 0.012)], 18);
  hb.add(std({ color: 0xd9d4c8, roughness: 0.35 }), mugGeo, mtx(-0.62, 0.92, 0.95));
  hb.flush(hero);

  // character (low-poly mannequin leaning on the table)
  const ch = new Batch();
  const H = V(-0.35, 0.92, -0.24), tilt = 0.4;
  const neck = H.clone().add(V(0, 0.52 * Math.cos(tilt), 0.52 * Math.sin(tilt)));
  const ik = (a: V3, t: V3, l1: number, l2: number, pole: V3) => {
    const d = t.clone().sub(a), L = clamp(d.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3), dir = d.normalize();
    const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const p = pole.clone().sub(a); p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
    return a.clone().addScaledVector(dir, x).addScaledVector(p, h);
  };
  const limb = (a: V3, b: V3, r1: number, r2: number, mat: THREE.Material = M.clay) => {
    const len = a.distanceTo(b);
    const g = new THREE.LatheGeometry([V(0, 0), V(r1 * 0.85, 0), V(r1 * 1.08, len * 0.28), V(r2 * 1.05, len * 0.78), V(r2 * 0.85, len), V(0, len)].map((p) => new THREE.Vector2(p.x, p.y)), 7);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    ch.add(mat, g, new THREE.Matrix4().compose(a, q, V(1, 1, 1)));
  };
  const ball = (p: V3, r: number) => ch.add(M.joint, new THREE.IcosahedronGeometry(r, 1), mtx(p.x, p.y, p.z));
  // torso
  const torsoG = new THREE.LatheGeometry([V(0, 0), V(0.12, 0), V(0.15, 0.08), V(0.135, 0.2), V(0.16, 0.34), V(0.17, 0.42), V(0.12, 0.5), V(0, 0.52)].map((p) => new THREE.Vector2(p.x, p.y)), 8);
  ch.add(M.clay, torsoG, new THREE.Matrix4().compose(H, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), neck.clone().sub(H).normalize()), V(1.25, 1, 0.78)));
  ch.add(M.clay, new THREE.SphereGeometry(0.15, 8, 6), mtx(H.x, H.y - 0.02, H.z, 0, 0, 0, 1.2, 0.75, 0.85));
  const sh = [neck.clone().add(V(-0.2, -0.04, -0.02)), neck.clone().add(V(0.2, -0.04, -0.02))];
  const hands = [V(-0.7, 0.955, 0.32), V(0.0, 0.955, 0.3)];
  sh.forEach((s, i) => {
    const e = ik(s, hands[i], 0.3, 0.28, s.clone().add(V(i ? 0.5 : -0.5, 0, -0.4)));
    ball(s, 0.055); ball(e, 0.042); ball(hands[i].clone().add(V(0, 0.02, -0.02)), 0.032);
    limb(s, e, 0.05, 0.042); limb(e, hands[i].clone().add(V(0, 0.02, -0.04)), 0.042, 0.032);
    ch.box(M.clay, 0.085, 0.03, 0.11, hands[i].x, hands[i].y - 0.008, hands[i].z + 0.02, 0, i ? -0.2 : 0.2, 0);
  });
  const feet = [V(-0.55, 0.08, -0.36), V(-0.17, 0.08, -0.16)];
  [-1, 1].forEach((sx, i) => {
    const hip = H.clone().add(V(sx * 0.1, -0.06, 0));
    const k = ik(hip, feet[i], 0.44, 0.42, hip.clone().add(V(sx * 0.1, -0.4, 0.6)));
    ball(hip, 0.07); ball(k, 0.052); ball(feet[i], 0.04);
    limb(hip, k, 0.075, 0.055); limb(k, feet[i], 0.055, 0.04);
    ch.box(M.clay, 0.1, 0.07, 0.24, feet[i].x, 0.035, feet[i].z + 0.06, 0, sx * 0.15, 0);
  });
  ball(neck, 0.05);
  const charG = new THREE.Group(); hero.add(charG);
  const headPivot = new THREE.Group(); headPivot.position.copy(neck).add(V(0, 0.06, 0.02)); charG.add(headPivot);
  ch.flush(charG);
  const hb2 = new Batch();
  hb2.add(M.clay, new THREE.CylinderGeometry(0.045, 0.05, 0.1, 7), mtx(0, 0.02, 0));
  hb2.add(M.clay, new THREE.IcosahedronGeometry(0.115, 1), mtx(0, 0.15, 0.02, 0, 0, 0, 0.88, 1.08, 1.0));
  hb2.box(M.joint, 0.12, 0.012, 0.01, 0, 0.17, 0.115);
  hb2.flush(headPivot);
  addPick('profile', charG);

  // magazine (album): spine pivot, cover hinge, flip page
  const mag = new THREE.Group(); mag.position.set(0.22, 0.922, 0.76); mag.rotation.y = -0.05; world.add(mag);
  const al = (i: number) => labels.album[i] ?? '';
  const cover = textTex([], {
    w: 512, h: 683, after: (g, w, h) => {
      g.fillStyle = '#121314'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8e2d4'; g.font = '700 26px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'left'; g.fillText(al(0), 32, 48);
      g.font = '800 120px "Barlow Condensed", Arial Narrow, sans-serif'; g.fillStyle = '#f07a2a'; g.fillText(al(1), 28, 150); g.fillText(al(2), 28, 260);
      g.strokeStyle = 'rgba(232,226,212,.25)'; g.lineWidth = 2;
      for (let i = -h; i < w; i += 18) { g.beginPath(); g.moveTo(i, 300); g.lineTo(i + 200, 640); g.stroke(); }
      g.fillStyle = '#e8e2d4'; g.font = '600 24px "JetBrains Mono", monospace'; g.fillText(al(3), 32, 660);
    },
  });
  const magPaper = std({ color: 0xf0ebe0, roughness: 0.6 });
  mesh(boxGeo(0.3, 0.012, 0.4), magPaper, mag, 0.15, 0.006, 0);
  const coverPivot = new THREE.Group(); coverPivot.position.y = 0.0076; mag.add(coverPivot);
  const coverMat = std({ map: cover, roughness: 0.35 });
  mesh(new THREE.PlaneGeometry(0.3, 0.4).rotateX(-Math.PI / 2), coverMat, coverPivot, 0.15, 0.0049, 0);
  mesh(new THREE.PlaneGeometry(0.3, 0.4).rotateX(Math.PI / 2), magPaper, coverPivot, 0.15, 0.0046, 0);
  const pagePivot = new THREE.Group(); pagePivot.position.y = 0.0076; mag.add(pagePivot); pagePivot.visible = false;
  mesh(new THREE.PlaneGeometry(0.3, 0.4, 8, 1).rotateX(-Math.PI / 2), std({ color: 0xf3eee4, roughness: 0.7, side: THREE.DoubleSide }), pagePivot, 0.15, 0.0058, 0, 0, 0, 0, false);
  const albumAnchor = new THREE.Object3D(); albumAnchor.position.set(0, 0.014, 0); albumAnchor.rotation.x = -Math.PI / 2; mag.add(albumAnchor);
  addPick('album', mag);
  await tick(0.64);

  // ---------- play: tactical table + roll-up door ----------
  const playG = new THREE.Group(); world.add(playG);
  const pb = new Batch();
  tableAt(pb, 5.2, -4.5, 3.0, 1.7, 0.9, M.woodDark);
  pb.box(M.cardboard, 0.6, 0.4, 0.4, 4.2, 0.4, -4.4); pb.box(M.olive, 0.5, 0.25, 0.3, 6.1, 0.33, -4.6);
  pb.cyl(std({ color: 0x3a3a35, roughness: 0.5 }), 0.05, 0.05, 0.02, 20, 6.55, 0.91, -5.25); // compass
  for (let i = 0; i < 3; i++) pb.cyl(i === 1 ? M.red : M.yellow, 0.004, 0.004, 0.17, 6, 3.92 + i * 0.03, 0.905, -3.85, Math.PI / 2, 0.1 * i, Math.PI / 2);
  pb.box(M.olive, 0.07, 0.22, 0.05, 6.55, 0.91, -3.82, Math.PI / 2, 0.4, 0); // radio
  pb.add(std({ color: 0xd9d4c8, roughness: 0.35 }), mugGeo, mtx(3.92, 0.9, -5.18));
  pb.flush(playG);
  const mapTex = canvasTex(mobile ? 1024 : 1536, mobile ? 555 : 832, (g, w, h) => {
    pixels(g, w, h, (u, v) => {
      const e = N8(u * 0.9 + 0.1, v * 0.5 + 0.2, 5);
      const band = Math.abs(((e * 22) % 1) - 0.5) < 0.035 ? 1 : 0, major = Math.abs(((e * 4.4) % 1) - 0.5) < 0.02 ? 1 : 0;
      const river = Math.abs(N4(u * 0.8, v * 0.6, 3) - 0.5) < 0.012;
      let c = [0.88 - e * 0.12, 0.85 - e * 0.06, 0.74 - e * 0.1];
      if (band) c = c.map((x, i) => x - [0.18, 0.24, 0.3][i]);
      if (major) c = c.map((x, i) => x - [0.32, 0.4, 0.46][i]);
      if (river) c = [0.42, 0.56, 0.66];
      return c;
    });
    g.strokeStyle = 'rgba(40,40,40,.35)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += w / 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += h / 6.5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(160,60,30,.6)'; g.lineWidth = 4; g.setLineDash([16, 10]);
    g.beginPath(); g.moveTo(w * 0.1, h * 0.8); g.bezierCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.9, w * 0.88, h * 0.3); g.stroke(); g.setLineDash([]);
    g.strokeStyle = 'rgba(30,30,30,.8)'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  }, { rep: [1, 1] });
  const playAnchor = new THREE.Object3D(); playAnchor.position.set(5.2, 0.912, -4.5); playAnchor.rotation.x = -Math.PI / 2; world.add(playAnchor);
  mesh(new THREE.PlaneGeometry(2.5, 1.36), std({ map: mapTex, roughness: 0.85 }), playAnchor, 0, 0, 0, 0, 0, 0, false);
  addPick('play', playG);
  // roll-up door
  const doorG = new THREE.Group(); doorG.position.set(5.3, 0, -7.9); world.add(doorG);
  const curtain = new THREE.Group(); doorG.add(curtain);
  const clipPlane = new THREE.Plane(V(0, -1, 0), 4.2);
  const slatMat = std({ color: 0x6d7378, metalness: 0.7, roughness: 0.42, clippingPlanes: [clipPlane], clipShadows: true });
  const sb = new Batch();
  for (let i = 0; i < 44; i++) { const y = 0.45 + i * 0.1; sb.box(slatMat, 4.6, 0.085, 0.03, 0, y + 0.05, 0.01); sb.box(slatMat, 4.6, 0.02, 0.045, 0, y + 0.002, 0.012); }
  sb.box(std({ color: 0x9aa1a6, metalness: 0.9, roughness: 0.3, clippingPlanes: [clipPlane] }), 4.62, 0.06, 0.07, 0, 0.47, 0.02);
  sb.flush(curtain);
  const db = new Batch();
  db.cyl(M.steelL, 0.36, 0.36, 4.9, 24, 0, 4.55, -0.1, 0, 0, Math.PI / 2);
  db.box(M.steel, 0.12, 4.3, 0.14, -2.36, 2.15, 0.06); db.box(M.steel, 0.12, 4.3, 0.14, 2.36, 2.15, 0.06);
  db.rod(M.galv, V(2.5, 3.6, 0.12), V(2.5, 1.1, 0.12), 0.006, 4);
  db.flush(doorG);
  mesh(new THREE.PlaneGeometry(4.4, 0.42), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 3.4, 2.5), fog: false }), doorG, 0, 0.22, -0.2, 0, 0, 0, false);
  await tick(0.7);

  // ---------- maps: corkboard ----------
  const mapsAnchor = new THREE.Object3D(); mapsAnchor.position.set(-5.7, 1.78, -7.84); world.add(mapsAnchor);
  const mb = new Batch(); mb.push(mapsAnchor.matrix.clone().compose(mapsAnchor.position, new THREE.Quaternion(), V(1, 1, 1)));
  mb.box(M.cork, 3.6, 2.0, 0.03, 0, 0, -0.015, 0, 0, 0, 0.5);
  for (const [w, h, x, y] of [[3.76, 0.08, 0, 1.04], [3.76, 0.08, 0, -1.04], [0.08, 2.16, -1.84, 0], [0.08, 2.16, 1.84, 0]]) mb.box(M.woodDark, w, h, 0.06, x, y, 0.0);
  mb.box(M.steel, 1.0, 1.0, 0.5, 2.6, -1.28, 0.2); mb.box(M.steelL, 0.2, 0.02, 0.02, 2.6, -1.05, 0.46); mb.box(M.steelL, 0.2, 0.02, 0.02, 2.6, -1.45, 0.46);
  mb.pop(); mb.flush(world);
  const fades: Partial<Record<StationId, THREE.Material[]>> = {};
  const fadeMat = <T extends THREE.Material>(id: StationId, base: T): T => { const m = base.clone(); m.transparent = true; (fades[id] ||= []).push(m); return m; };
  const mapsFade = new THREE.Group(); mapsAnchor.add(mapsFade);
  const polaroid = fadeMat('maps', std({ color: 0xece6d8, roughness: 0.8 }));
  const photoMats = [0x6f8a9c, 0x9c7d4f, 0x5d5a78, 0x5e7a52].map((c) => fadeMat('maps', std({ color: c, roughness: 0.7 })));
  const pinMat = fadeMat('maps', std({ color: 0xb3342a, roughness: 0.4 }));
  [[-1.25, 0.45], [-0.45, 0.42], [-1.2, -0.42], [-0.4, -0.45]].forEach(([x, y], i) => {
    mesh(new THREE.PlaneGeometry(0.62, 0.7), polaroid, mapsFade, x, y, 0.006, 0, 0, (R() - 0.5) * 0.08, false);
    mesh(new THREE.PlaneGeometry(0.54, 0.5), photoMats[i], mapsFade, x, y + 0.07, 0.008, 0, 0, 0, false);
    mesh(new THREE.SphereGeometry(0.018, 8, 6), pinMat, mapsFade, x, y + 0.3, 0.02);
  });
  mesh(new THREE.PlaneGeometry(1.15, 1.5), polaroid, mapsFade, 1.05, 0.0, 0.006, 0, 0, 0.02, false);
  addPick('maps', mapsAnchor);

  // ---------- arsenal: pegboard + weapons (layout generated from the catalog, one section per slot) ----------
  const peg = new THREE.Group(); peg.position.set(-11.42, 1.9, -2.0); peg.rotation.y = Math.PI / 2; world.add(peg);
  const BW = 6.2, BH = 2.2;
  const pu = (u: number) => (u + BW / 2) / BW, pv = (v: number) => 1 - (v + BH / 2) / BH;
  // secondaries: two rows up to 8 ids, more rows spread evenly between the same two heights past that
  const secIds = opt.arsenal.secundaria, secRowN = Math.ceil(secIds.length / 4);
  const secRows = secRowN <= 2 ? [0.42, -0.3] : Array.from({ length: secRowN }, (_, r) => lerp(0.42, -0.3, r / (secRowN - 1)));
  const SECTIONS: Section[] = [
    { key: 'primaria', label: labels.sections.primaria, u0: -3.02, u1: -0.92, ids: opt.arsenal.primaria, kind: 'vertical', top: 0.76 },
    { key: 'secundaria', label: labels.sections.secundaria, u0: -0.78, u1: 1.22, ids: secIds, kind: 'grid', cols: 4, rows: secRows },
    { key: 'faca', label: labels.sections.faca, u0: 1.36, u1: 3.02, ids: opt.arsenal.faca, kind: 'vertical', top: 0.76 },
    { key: 'granada', label: labels.sections.granada, u0: 1.36, u1: 3.02, ids: opt.arsenal.granada, kind: 'sub', v: -0.72 },
  ];
  interface RifleOpts { body?: THREE.Material; stock?: THREE.Material; guard?: THREE.Material; mag?: THREE.Material }
  const W = {
    rifle: (b: Batch, o: RifleOpts = {}) => {
      const body = o.body || M.gun, stock = o.stock || M.poly, guard = o.guard || M.poly;
      b.box(stock, 0.26, 0.075, 0.038, -0.34, -0.012, 0); b.box(stock, 0.05, 0.12, 0.042, -0.46, -0.03, 0);
      b.box(body, 0.3, 0.085, 0.05, -0.07, 0, 0); b.box(M.poly, 0.045, 0.11, 0.034, -0.13, -0.085, 0, 0, 0, 0.35);
      for (let i = 0; i < 3; i++) b.box(o.mag || M.gun, 0.05, 0.06, 0.03, 0.0 + i * 0.012, -0.075 - i * 0.05, 0, 0, 0, -0.14 * i);
      b.box(guard, 0.26, 0.066, 0.055, 0.21, 0, 0); b.cyl(body, 0.011, 0.011, 0.24, 10, 0.46, 0.008, 0, 0, 0, Math.PI / 2);
      b.cyl(body, 0.017, 0.017, 0.055, 10, 0.58, 0.008, 0, 0, 0, Math.PI / 2); b.box(body, 0.42, 0.012, 0.028, 0.05, 0.05, 0);
      b.box(body, 0.012, 0.05, 0.008, 0.31, 0.06, 0); b.box(body, 0.03, 0.035, 0.02, -0.17, 0.065, 0);
      for (let i = 0; i < 9; i++) b.box(body, 0.008, 0.006, 0.03, -0.12 + i * 0.04, 0.058, 0);
    },
    pistol: (b: Batch, o: { s?: number; body?: THREE.Material; comp?: boolean } = {}) => {
      const s = o.s || 1, body = o.body || M.gun;
      b.box(body, 0.19 * s, 0.035 * s, 0.028 * s, 0.01 * s, 0.035 * s, 0); b.box(M.poly, 0.15 * s, 0.022 * s, 0.026 * s, 0, 0.008 * s, 0);
      b.box(M.poly, 0.042 * s, 0.1 * s, 0.03 * s, -0.06 * s, -0.045 * s, 0, 0, 0, 0.26); b.box(M.poly, 0.05 * s, 0.006 * s, 0.02 * s, -0.005 * s, -0.022 * s, 0);
      b.cyl(body, 0.007 * s, 0.007 * s, 0.02 * s, 8, 0.11 * s, 0.035 * s, 0, 0, 0, Math.PI / 2);
      if (o.comp) b.box(body, 0.05 * s, 0.04 * s, 0.03 * s, 0.13 * s, 0.035 * s, 0);
    },
    stapler: (b: Batch) => {
      b.box(M.poly, 0.2, 0.018, 0.045, 0, -0.02, 0); b.box(M.red, 0.19, 0.026, 0.038, 0.005, 0.008, 0, 0, 0, -0.04);
      b.cyl(M.galv, 0.008, 0.008, 0.05, 8, -0.09, -0.004, 0, Math.PI / 2, 0, 0); b.box(M.poly, 0.04, 0.09, 0.03, -0.06, -0.07, 0, 0, 0, 0.3);
    },
    smg: (b: Batch) => {
      b.box(M.gun, 0.24, 0.07, 0.05, 0, 0, 0); b.box(M.gun, 0.03, 0.14, 0.026, 0.03, -0.1, 0); b.box(M.poly, 0.04, 0.1, 0.032, -0.07, -0.075, 0, 0, 0, 0.3);
      b.cyl(M.gun, 0.012, 0.012, 0.09, 10, 0.16, 0.005, 0, 0, 0, Math.PI / 2); b.cyl(M.galv, 0.016, 0.016, 0.012, 14, 0.0, 0.0, 0.032, Math.PI / 2, 0, 0);
      b.bar(M.galv, V(-0.12, 0.02, 0), V(-0.3, 0.0, 0), 0.008); b.bar(M.galv, V(-0.12, -0.03, 0), V(-0.3, -0.03, 0), 0.008); b.box(M.poly, 0.02, 0.07, 0.03, -0.3, -0.01, 0);
    },
    revolver: (b: Batch) => {
      b.box(M.gun, 0.11, 0.05, 0.03, 0, 0.01, 0); b.cyl(M.gun, 0.024, 0.024, 0.045, 12, 0.005, 0.01, 0, 0, 0, Math.PI / 2);
      b.cyl(M.gun, 0.009, 0.009, 0.16, 10, 0.135, 0.022, 0, 0, 0, Math.PI / 2); b.box(M.woodDark, 0.045, 0.1, 0.032, -0.065, -0.05, 0, 0, 0, 0.45);
      b.box(M.gun, 0.016, 0.02, 0.01, -0.045, 0.045, 0, 0, 0, -0.5);
    },
    drill: (b: Batch) => {
      const yel = std({ color: 0xc9a227, roughness: 0.5 });
      b.cyl(yel, 0.032, 0.03, 0.17, 12, 0, 0.02, 0, 0, 0, Math.PI / 2); b.cyl(M.gun, 0.018, 0.012, 0.05, 10, 0.11, 0.02, 0, 0, 0, Math.PI / 2);
      b.cyl(M.galv, 0.003, 0.003, 0.09, 6, 0.18, 0.02, 0, 0, 0, Math.PI / 2); b.box(M.poly, 0.04, 0.12, 0.034, -0.02, -0.06, 0, 0, 0, 0.12); b.box(M.poly, 0.08, 0.04, 0.06, -0.03, -0.13, 0);
    },
    garrucha: (b: Batch) => {
      b.cyl(M.gun, 0.011, 0.011, 0.2, 10, 0.06, 0.012, 0.012, 0, 0, Math.PI / 2); b.cyl(M.gun, 0.011, 0.011, 0.2, 10, 0.06, 0.012, -0.012, 0, 0, Math.PI / 2);
      b.box(M.gun, 0.06, 0.035, 0.03, -0.06, 0.008, 0); b.box(M.woodDark, 0.1, 0.045, 0.032, -0.12, -0.03, 0, 0, 0, 0.6);
    },
    knife: (b: Batch) => {
      const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.2, 0.0); s.quadraticCurveTo(0.17, 0.035, 0.0, 0.04); s.lineTo(0, 0);
      b.add(M.galv, new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false }), mtx(0.02, -0.02, -0.0015));
      b.box(M.poly, 0.11, 0.028, 0.02, -0.05, 0.0, 0); b.cyl(M.galv, 0.004, 0.004, 0.022, 6, -0.03, 0, 0, Math.PI / 2, 0, 0); b.cyl(M.galv, 0.004, 0.004, 0.022, 6, -0.07, 0, 0, Math.PI / 2, 0, 0);
    },
    chicken: (b: Batch) => {
      const yel = std({ color: 0xd9a52a, roughness: 0.65 }), org = std({ color: 0xc8611f, roughness: 0.6 });
      b.add(yel, new THREE.CapsuleGeometry(0.045, 0.16, 6, 10), mtx(0.0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 0.85));
      b.cyl(yel, 0.016, 0.02, 0.12, 8, -0.18, 0, 0, 0, 0, Math.PI / 2); b.add(yel, new THREE.SphereGeometry(0.03, 10, 8), mtx(-0.25, 0, 0));
      b.add(M.red, new THREE.SphereGeometry(0.012, 6, 5), mtx(-0.255, 0.028, 0)); b.add(M.red, new THREE.SphereGeometry(0.01, 6, 5), mtx(-0.27, 0.022, 0));
      b.cyl(org, 0.0, 0.012, 0.03, 6, -0.285, -0.005, 0, 0, 0, Math.PI / 2);
      b.cyl(org, 0.005, 0.005, 0.09, 6, 0.15, 0.015, 0.012, 0, 0, Math.PI / 2); b.cyl(org, 0.005, 0.005, 0.09, 6, 0.15, -0.015, -0.012, 0, 0, Math.PI / 2);
    },
    saber: (b: Batch) => {
      b.cyl(M.galv, 0.018, 0.018, 0.2, 14, -0.42, 0, 0, 0, 0, Math.PI / 2);
      for (let i = 0; i < 5; i++) b.cyl(M.poly, 0.02, 0.02, 0.012, 14, -0.48 + i * 0.03, 0, 0, 0, 0, Math.PI / 2);
      b.cyl(M.gun, 0.024, 0.02, 0.03, 14, -0.31, 0, 0, 0, 0, Math.PI / 2);
    },
    grenade: (b: Batch) => {
      b.add(M.olive, new THREE.SphereGeometry(0.036, 12, 10), mtx(0, 0, 0, 0, 0, 0, 1, 1.25, 1)); b.cyl(M.galv, 0.014, 0.016, 0.03, 10, 0, 0.055, 0);
      b.box(M.galv, 0.012, 0.08, 0.01, 0.026, 0.02, 0, 0, 0, -0.15); b.add(M.galv, new THREE.TorusGeometry(0.014, 0.002, 6, 16), mtx(-0.02, 0.07, 0, 0, Math.PI / 2, 0));
    },
    spoon: (b: Batch) => { const wd = std({ color: 0xa47648, roughness: 0.75 }); b.box(wd, 0.22, 0.016, 0.01, -0.06, 0, 0); b.add(wd, new THREE.SphereGeometry(1, 12, 8), mtx(0.1, 0, 0, 0, 0, 0, 0.055, 0.036, 0.012)); },
    baguette: (b: Batch) => { const br = std({ color: 0xc08a4a, roughness: 0.85 }); b.add(br, new THREE.CapsuleGeometry(0.028, 0.5, 6, 10), mtx(0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 0.9)); for (let k = 0; k < 5; k++) b.box(std({ color: 0xe0c08a, roughness: 0.9 }), 0.04, 0.008, 0.01, -0.2 + k * 0.1, 0.012, 0.024, 0, 0, 0.5); },
    fish: (b: Batch) => { const fs = std({ color: 0x8fa6b4, metalness: 0.4, roughness: 0.3 }); b.add(fs, new THREE.SphereGeometry(1, 14, 10), mtx(0.04, 0, 0, 0, 0, 0, 0.15, 0.045, 0.024)); b.box(fs, 0.06, 0.07, 0.006, -0.13, 0, 0, 0, 0, 0); b.add(M.poly, new THREE.SphereGeometry(0.007, 6, 5), mtx(0.15, 0.012, 0.02)); },
    noodle: (b: Batch) => { b.cyl(std({ color: 0x2a9f98, roughness: 0.8 }), 0.034, 0.034, 0.6, 12, 0, 0, 0, 0, 0, Math.PI / 2); b.cyl(M.poly, 0.012, 0.012, 0.602, 8, 0, 0, 0, 0, 0, Math.PI / 2); },
    mine: (b: Batch) => { b.cyl(M.olive, 0.07, 0.072, 0.035, 18, 0, 0, 0, Math.PI / 2, 0, 0); b.cyl(M.steel, 0.03, 0.03, 0.01, 12, 0, 0, 0.022, Math.PI / 2, 0, 0); b.cyl(M.galv, 0.004, 0.004, 0.03, 6, 0, 0, 0.035, Math.PI / 2, 0, 0); },
  };
  const tapeM = std({ color: 0xb9bcbf, roughness: 0.55, metalness: 0.2 }), pinkM = std({ color: 0xc8749b, roughness: 0.45 }), redM = std({ color: 0x9e2a1c, roughness: 0.4, metalness: 0.3 }), flameM = std({ color: 0xd9761e, roughness: 0.45 });
  const BUILD: Record<string, (b: Batch) => void> = {
    rifle: (b) => W.rifle(b), rifleVovo: (b) => W.rifle(b, { stock: M.woodDark, guard: M.woodDark }), rifleOuro: (b) => W.rifle(b, { body: M.gold, mag: M.gold }),
    rifleFita: (b) => { W.rifle(b); for (const x of [-0.38, -0.3, 0.14, 0.24, 0.3]) b.box(tapeM, 0.035, 0.09, 0.062, x, 0, 0); },
    rifleTia: (b) => { W.rifle(b, { body: pinkM, stock: pinkM, guard: pinkM }); b.add(std({ color: 0xf3efe6, roughness: 0.5 }), new THREE.SphereGeometry(0.014, 8, 6), mtx(-0.3, 0, 0.022)); },
    rifleNatal: (b) => W.rifle(b, { guard: M.drum3 }),
    rifleChama: (b) => W.rifle(b, { body: redM, guard: flameM, stock: redM }),
    pistola: (b) => W.pistol(b), pistolao: (b) => W.pistol(b, { s: 1.35, comp: true }), grampeador: W.stapler, revolver: W.revolver, smg: W.smg,
    furadeira: W.drill, garrucha: W.garrucha, faca: W.knife, colher: W.spoon, frango: W.chicken, baguete: W.baguette, peixe: W.fish, macarrao: W.noodle, sabre: W.saber, granada: W.grenade, mina: W.mine,
  };
  // ids the scene has no model for still get a prop: the section's generic one
  const FALLBACK: Record<SectionKey, (b: Batch) => void> = { primaria: (b) => W.rifle(b), secundaria: (b) => W.pistol(b), faca: W.knife, granada: W.grenade };
  const weapons: Record<string, Weapon> = {};
  const blade = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 2.2, 1.3) });
  const bulbs = [new THREE.Color(3, 0.4, 0.3), new THREE.Color(0.4, 2.6, 0.6), new THREE.Color(3, 2.2, 0.4)].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const box3 = new THREE.Box3();
  for (const sec of SECTIONS) {
    sec.ids.forEach((id, i) => {
      const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
      if (sec.kind === 'vertical') inner.rotation.z = id === 'frango' || id === 'peixe' ? Math.PI / 2 : -Math.PI / 2;
      const bt = new Batch(); (BUILD[id] ?? FALLBACK[sec.key])(bt); bt.flush(inner);
      if (id === 'sabre') mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.72, 10).rotateZ(Math.PI / 2), blade, inner, 0.06, 0, 0, 0, 0, 0, false);
      if (id === 'rifleNatal') for (let k = 0; k < 9; k++) mesh(new THREE.SphereGeometry(0.009, 6, 5), bulbs[k % 3], inner, -0.42 + k * 0.11, 0.045 - (k % 2) * 0.09, 0.03, 0, 0, 0, false);
      box3.setFromObject(g);
      const cx = (box3.min.x + box3.max.x) / 2, cy = (box3.min.y + box3.max.y) / 2, h = box3.max.y - box3.min.y, wdt = box3.max.x - box3.min.x;
      let u: number, v: number;
      if (sec.kind === 'vertical') { u = sec.u0 + ((i + 0.5) * (sec.u1 - sec.u0)) / sec.ids.length; v = sec.top - h / 2; }
      else if (sec.kind === 'sub') { u = sec.u0 + 0.35 + i * 0.55; v = sec.v; }
      else { const col = i % sec.cols, row = Math.floor(i / sec.cols); u = sec.u0 + ((col + 0.5) * (sec.u1 - sec.u0)) / sec.cols; v = sec.rows[row]; }
      g.position.set(u - cx, v - cy, 0.06); peg.add(g);
      const hook = new Batch();
      for (const dx of sec.kind === 'vertical' ? [0] : [-wdt * 0.28, wdt * 0.28]) hook.cyl(M.galv, 0.004, 0.004, 0.07, 6, cx + dx, box3.max.y + 0.012, -0.03, Math.PI / 2, 0, 0);
      hook.flush(g);
      weapons[id] = { group: g, def: { id, u, v, w: wdt, h }, anchor: V(u, v - h / 2 - 0.04, 0.08) };
      g.traverse((c) => (c.userData.weapon = id));
    });
  }
  const pegTex = canvasTex(mobile ? 1024 : 2048, mobile ? 363 : 726, (g, w, h) => {
    g.fillStyle = '#34383a'; g.fillRect(0, 0, w, h);
    const step = w / 248; g.fillStyle = '#121314';
    for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) { g.beginPath(); g.arc(x, y, step * 0.2, 0, TAU); g.fill(); }
    g.font = `700 ${h * 0.048}px "Barlow Condensed", Arial Narrow, sans-serif`; g.textAlign = 'left';
    for (const sec of SECTIONS) {
      const vy = sec.kind === 'sub' ? sec.v + 0.3 : 0.97, u0 = sec.u0, u1 = sec.u1;
      g.fillStyle = 'rgba(230,224,210,.88)'; g.fillText(`${sec.label} · ${sec.ids.length}`, pu(u0) * w, pv(vy) * h);
      g.fillStyle = 'rgba(230,224,210,.6)'; g.fillRect(pu(u0) * w, pv(vy - 0.07) * h, (pu(u1) - pu(u0)) * w, 3);
    }
    g.fillStyle = 'rgba(230,224,210,.18)'; for (const x of [-0.85, 1.29]) g.fillRect(pu(x) * w, pv(1.0) * h, 3, (BH - 0.2) / BH * h);
    // dashed outline behind each weapon
    g.strokeStyle = 'rgba(230,224,210,.2)'; g.lineWidth = 3; g.setLineDash([10, 8]);
    for (const wp of Object.values(weapons)) {
      const d = wp.def, bb = new THREE.Box3().setFromObject(wp.group.children[0]);
      const W2 = bb.max.x - bb.min.x + 0.05, H2 = bb.max.y - bb.min.y + 0.05;
      g.strokeRect(pu(d.u - W2 / 2) * w, pv(d.v + H2 / 2) * h, (W2 / BW) * w, (H2 / BH) * h);
    }
  });
  const pegB = new Batch();
  pegB.add(std({ map: pegTex, roughness: 0.8 }), new THREE.BoxGeometry(BW, BH, 0.025), mtx(0, 0, 0));
  pegB.flush(peg);
  const pegFrame = new Batch();
  for (const [w, h, x, y] of [[BW + 0.1, 0.05, 0, BH / 2 + 0.02], [BW + 0.1, 0.05, 0, -BH / 2 - 0.02], [0.05, BH + 0.08, -BW / 2 - 0.03, 0], [0.05, BH + 0.08, BW / 2 + 0.03, 0]]) pegFrame.box(M.steel, w, h, 0.05, x, y, 0.01);
  pegFrame.box(M.steel, BW, 0.74, 0.6, 0, -1.53, 0.18); pegFrame.box(std({ color: 0x1f2124, roughness: 0.6 }), BW, 0.04, 0.62, 0, -1.15, 0.18);
  for (let i = 0; i < 7; i++) { const x = -BW / 2 + 0.44 + i * 0.887; pegFrame.box(M.steelL, 0.83, 0.32, 0.01, x, -1.36, 0.485); pegFrame.box(M.steelL, 0.83, 0.32, 0.01, x, -1.72, 0.485); pegFrame.box(M.galv, 0.18, 0.02, 0.03, x, -1.25, 0.5); pegFrame.box(M.galv, 0.18, 0.02, 0.03, x, -1.61, 0.5); }
  pegFrame.flush(peg);
  const focus = new THREE.PointLight(0xfff2e0, 0, 1.6, 2); peg.add(focus);
  addPick('arsenal', peg);
  await tick(0.78);

  // ---------- profile: lockers ----------
  const lk = new THREE.Group(); lk.position.set(-11.65, 0, 4.7); lk.rotation.y = Math.PI / 2; world.add(lk);
  const ventTex = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#7a8070'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1d19'; for (let i = 0; i < 6; i++) { g.fillRect(w * 0.25, 30 + i * 16, w * 0.5, 7); g.fillRect(w * 0.25, h - 130 + i * 16, w * 0.5, 7); }
    g.fillStyle = '#c9c3b4'; g.fillRect(w * 0.3, h * 0.36, w * 0.4, 34);
  });
  const doorMat = std({ map: ventTex, color: 0x9aa08d, metalness: 0.45, roughness: 0.5 });
  const lb = new Batch();
  const LH = 2.05, LD = 0.55;
  const lockerBody = (x0: number, x1: number, open: boolean) => {
    const w = x1 - x0, xc = (x0 + x1) / 2;
    lb.box(M.locker, w, LH, 0.02, xc, LH / 2, 0.01); lb.box(M.locker, 0.02, LH, LD, x0 + 0.01, LH / 2, LD / 2); lb.box(M.locker, 0.02, LH, LD, x1 - 0.01, LH / 2, LD / 2);
    lb.box(M.locker, w, 0.02, LD, xc, LH - 0.01, LD / 2); lb.box(M.locker, w, 0.1, LD, xc, 0.05, LD / 2);
    if (!open) { lb.add(doorMat, boxGeo(w - 0.02, LH - 0.12, 0.02), mtx(xc, LH / 2 + 0.04, LD - 0.01)); lb.box(M.galv, 0.02, 0.12, 0.03, x1 - 0.06, 1.05, LD + 0.01); }
  };
  for (let i = 0; i < 3; i++) lockerBody(-2.0 + i * 0.45, -2.0 + (i + 1) * 0.45, false);
  for (let i = 0; i < 3; i++) lockerBody(0.65 + i * 0.45, 0.65 + (i + 1) * 0.45, false);
  lockerBody(-0.65, 0.65, true);
  lb.box(M.locker, 1.28, 0.02, LD - 0.04, 0, 0.92, LD / 2); lb.box(M.locker, 1.28, 0.02, LD - 0.04, 0, 1.98, LD / 2);
  lb.box(M.woodDark, 2.4, 0.05, 0.36, 0, 0.45, 1.05); lb.box(M.steel, 0.05, 0.43, 0.3, -1.0, 0.215, 1.05); lb.box(M.steel, 0.05, 0.43, 0.3, 1.0, 0.215, 1.05);
  lb.add(M.olive, new THREE.SphereGeometry(0.15, 14, 8, 0, TAU, 0, Math.PI / 2), mtx(-0.35, 0.1, 0.25, 0, 0, 0, 1, 0.8, 1.15));
  lb.box(M.rubber, 0.12, 0.16, 0.28, 0.25, 0.18, 0.25); lb.box(M.rubber, 0.12, 0.16, 0.28, 0.42, 0.18, 0.25);
  lb.flush(lk);
  const plate = std({ map: textTex([{ t: opt.playerTag }], { w: 512, h: 96, bg: '#d9d3c4', fg: '#1d1c1a', font: '700 62px "Barlow Condensed", Arial Narrow, sans-serif' }), roughness: 0.6 });
  mesh(new THREE.PlaneGeometry(0.62, 0.115), plate, lk, 0, LH + 0.08, LD - 0.02, 0, 0, 0, false);
  mesh(boxGeo(0.66, 0.14, 0.02), M.steel, lk, 0, LH + 0.08, LD - 0.035);
  const doorL = new THREE.Group(); doorL.position.set(-0.65, 0, LD); doorL.rotation.y = -1.85; lk.add(doorL);
  const doorR = new THREE.Group(); doorR.position.set(0.65, 0, LD); doorR.rotation.y = 1.85; lk.add(doorR);
  mesh(boxGeo(0.64, LH - 0.12, 0.02), doorMat, doorL, 0.32, LH / 2 + 0.04, 0);
  mesh(new THREE.PlaneGeometry(0.44, 0.9), M.mirror, doorL, 0.32, 1.45, -0.012, 0, Math.PI, 0, false);
  mesh(boxGeo(0.64, LH - 0.12, 0.02), doorMat, doorR, -0.32, LH / 2 + 0.04, 0);
  const profileAnchor = new THREE.Object3D(); profileAnchor.position.set(0, 1.45, 0.03); lk.add(profileAnchor);
  const profFade = fadeMat('profile', M.paper);
  mesh(new THREE.PlaneGeometry(0.6, 0.8), profFade, profileAnchor, -0.25, 0, 0, 0, 0, 0.03, false);
  mesh(new THREE.PlaneGeometry(0.4, 0.5), profFade, profileAnchor, 0.32, 0.1, 0.002, 0, 0, -0.05, false);
  addPick('profile', lk);

  // ---------- settings: workbench + electrical panel ----------
  const wb = new THREE.Group(); wb.position.set(11.65, 0, -2.6); wb.rotation.y = -Math.PI / 2; world.add(wb);
  const bb = new Batch();
  bb.box(M.wood, 3.2, 0.06, 0.78, 0, 0.89, 0.4, 0, 0, 0, 1);
  for (const x of [-1.52, 1.52]) for (const z of [0.06, 0.74]) bb.box(M.steel, 0.06, 0.86, 0.06, x, 0.43, z);
  bb.box(M.steel, 3.1, 0.03, 0.7, 0, 0.2, 0.4); bb.box(M.red, 0.6, 0.28, 0.28, -0.9, 0.36, 0.4); bb.box(M.steel, 0.62, 0.02, 0.3, -0.9, 0.51, 0.4);
  // panel box
  bb.box(std({ color: 0x8a8f86, metalness: 0.5, roughness: 0.5 }), 1.52, 1.08, 0.04, 0, 1.86, 0.02);
  for (const [w, h, x, y] of [[1.52, 0.04, 0, 2.38], [1.52, 0.04, 0, 1.34], [0.04, 1.08, -0.74, 1.86], [0.04, 1.08, 0.74, 1.86]]) bb.box(std({ color: 0x8a8f86, metalness: 0.5, roughness: 0.5 }), w, h, 0.22, x, y, 0.11);
  bb.cyl(M.galv, 0.03, 0.03, 3.6, 10, -0.5, 4.2, 0.08); bb.cyl(M.galv, 0.03, 0.03, 3.6, 10, 0.5, 4.2, 0.08); bb.cyl(M.galv, 0.025, 0.025, 0.45, 10, 0.2, 1.1, 0.08);
  // vise
  bb.box(M.rackBlue, 0.16, 0.12, 0.22, 1.35, 0.98, 0.3); bb.box(M.rackBlue, 0.16, 0.1, 0.06, 1.35, 1.03, 0.47); bb.cyl(M.galv, 0.008, 0.008, 0.2, 6, 1.35, 1.0, 0.56, 0, 0, Math.PI / 2);
  // radio
  const olive2 = std({ color: 0x48503c, roughness: 0.6, metalness: 0.2 });
  bb.box(olive2, 0.44, 0.27, 0.25, -0.35, 1.06, 0.3); bb.box(M.poly, 0.44, 0.02, 0.25, -0.35, 1.2, 0.3);
  for (let i = 0; i < 3; i++) bb.cyl(M.poly, 0.022, 0.022, 0.025, 12, -0.5 + i * 0.07, 1.0, 0.43, Math.PI / 2, 0, 0);
  bb.rod(M.galv, V(-0.52, 1.2, 0.25), V(-0.8, 1.85, 0.25), 0.004, 4);
  // PET bottle silencer + potato (easter eggs)
  const petGeo = new THREE.LatheGeometry([[0, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.2], [0.045, 0.24], [0.016, 0.28], [0.016, 0.31], [0, 0.31]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
  const pet = std({ color: 0x9fd0b2, roughness: 0.08, transparent: true, opacity: 0.45, depthWrite: false }); pet.userData.noCast = true;
  bb.add(pet, petGeo, mtx(0.45, 0.94, 0.3, 0, 0, Math.PI / 2)); bb.cyl(std({ color: 0x2a62a8, roughness: 0.5 }), 0.018, 0.018, 0.02, 10, 0.45 - 0.32, 0.94, 0.3, 0, 0, Math.PI / 2);
  const potGeo = new THREE.IcosahedronGeometry(0.045, 2); { const p = potGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (R() - 0.5) * 0.12; p.setXYZ(i, p.getX(i) * 1.35 * k, p.getY(i) * 0.9 * k, p.getZ(i) * k); } potGeo.computeVertexNormals(); }
  bb.add(std({ color: 0x8a6a3e, roughness: 0.9 }), potGeo, mtx(0.82, 0.96, 0.5));
  bb.box(std({ color: 0xc9a227, roughness: 0.5 }), 0.09, 0.16, 0.04, 1.0, 0.94, 0.5, -Math.PI / 2, 0.3, 0); // multimeter
  bb.add(M.rubber, new THREE.TorusGeometry(0.1, 0.012, 8, 24), mtx(-1.0, 0.93, 0.5, Math.PI / 2, 0, 0));
  bb.flush(wb);
  const radioDisp = new THREE.MeshBasicMaterial({ map: textTex([{ t: '88.7 MHZ' }], { w: 256, h: 64, bg: '#1a0e02', fg: '#ffb040', font: '700 44px "JetBrains Mono", monospace' }), color: new THREE.Color(1.8, 1.8, 1.8) });
  mesh(new THREE.PlaneGeometry(0.16, 0.04), radioDisp, wb, -0.28, 1.1, 0.426, 0, 0, 0, false);
  const panelDoor = new THREE.Group(); panelDoor.position.set(-0.75, 1.86, 0.22); panelDoor.rotation.y = -2.5; wb.add(panelDoor);
  mesh(boxGeo(1.5, 1.06, 0.02), std({ color: 0x8a8f86, metalness: 0.5, roughness: 0.5 }), panelDoor, 0.75, 0, 0);
  const warn = std({ map: textTex([{ t: labels.danger, y: 0.32 }, { t: labels.highVoltage, y: 0.72, font: '700 52px "Barlow Condensed", Arial Narrow, sans-serif' }], { w: 256, h: 160, bg: '#d4a51c', fg: '#141414', font: '800 64px "Barlow Condensed", Arial Narrow, sans-serif' }), roughness: 0.6 });
  mesh(new THREE.PlaneGeometry(0.32, 0.2), warn, wb, 1.05, 1.85, 0.012, 0, 0, 0, false);
  const settingsAnchor = new THREE.Object3D(); settingsAnchor.position.set(0, 1.86, 0.045); wb.add(settingsAnchor);
  const brk = fadeMat('settings', std({ color: 0x1d1f21, roughness: 0.5 })), rail = fadeMat('settings', M.galv);
  for (let r = 0; r < 3; r++) {
    mesh(boxGeo(1.3, 0.035, 0.01), rail, settingsAnchor, 0, 0.28 - r * 0.28, 0.005, 0, 0, 0, false);
    for (let i = 0; i < 16; i++) mesh(boxGeo(0.07, 0.17, 0.05), brk, settingsAnchor, -0.6 + i * 0.08, 0.28 - r * 0.28, 0.03, 0, 0, 0, false);
  }
  addPick('settings', wb);
  await tick(0.86);

  // ---------- admin: security booth ----------
  const bo = new Batch();
  const bwall = std({ color: 0x3b3f42, metalness: 0.3, roughness: 0.6 });
  bo.box(bwall, 4.4, 1.0, 0.08, 9.8, 0.5, 3.8); bo.box(M.steel, 4.4, 0.08, 0.1, 9.8, 2.72, 3.8);
  bo.add(M.glass, new THREE.PlaneGeometry(4.4, 1.68).translate(9.8, 1.86, 3.8));
  for (let i = 0; i <= 4; i++) bo.box(M.steel, 0.06, 1.72, 0.08, 7.6 + i * 1.1, 1.86, 3.8);
  bo.box(bwall, 0.08, 1.0, 1.1, 7.6, 0.5, 4.0); bo.box(bwall, 0.08, 1.0, 2.5, 7.6, 0.5, 6.75); bo.box(M.steel, 0.1, 0.08, 4.2, 7.6, 2.72, 5.9);
  bo.add(M.glass, new THREE.PlaneGeometry(1.1, 1.68).rotateY(Math.PI / 2).translate(7.6, 1.86, 4.0)); bo.add(M.glass, new THREE.PlaneGeometry(2.5, 1.68).rotateY(Math.PI / 2).translate(7.6, 1.86, 6.75));
  for (const z of [3.8, 4.55, 5.5, 6.75, 8.0]) bo.box(M.steel, 0.08, 2.7, 0.06, 7.6, 1.35, z);
  bo.box(bwall, 4.4, 0.1, 4.2, 9.8, 2.8, 5.9);
  bo.box(M.cardboard, 0.6, 0.4, 0.5, 8.6, 3.05, 5.0); bo.box(M.cardboard, 0.5, 0.3, 0.4, 9.3, 3.0, 5.2);
  // desk + chair
  bo.box(M.woodDark, 0.9, 0.04, 2.8, 11.3, 0.76, 5.95); bo.box(M.steel, 0.86, 0.72, 0.04, 11.3, 0.38, 4.6); bo.box(M.steel, 0.86, 0.72, 0.04, 11.3, 0.38, 7.3);
  bo.box(M.poly, 0.16, 0.02, 0.45, 11.0, 0.79, 5.95); bo.box(M.poly, 0.1, 0.02, 0.06, 11.0, 0.79, 6.4);
  bo.add(std({ color: 0x2b2d30, roughness: 0.4 }), mugGeo, mtx(11.1, 0.78, 7.0));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; bo.box(M.poly, 0.3, 0.03, 0.04, 10.35 + Math.cos(a) * 0.15, 0.06, 5.95 + Math.sin(a) * 0.15, 0, -a, 0); }
  bo.cyl(M.galv, 0.025, 0.025, 0.4, 10, 10.35, 0.25, 5.95); bo.box(M.poly, 0.48, 0.08, 0.46, 10.35, 0.48, 5.95); bo.box(M.poly, 0.06, 0.55, 0.44, 10.1, 0.82, 5.95, 0, 0, -0.12);
  bo.flush(world);
  const exitS = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.16), new THREE.MeshBasicMaterial({ map: textTex([{ t: labels.exit }], { w: 256, h: 96, bg: '#0d7a3a', fg: '#eafff0', font: '800 64px "Barlow Condensed", Arial Narrow, sans-serif' }), color: new THREE.Color(1.8, 1.8, 1.8) }));
  exitS.position.set(-0.55, 2.6, 7.94); exitS.rotation.y = Math.PI; world.add(exitS);
  // monitors
  const monG = new THREE.Group(); world.add(monG);
  const feeds: { rt: THREE.WebGLRenderTarget; cam: THREE.PerspectiveCamera }[] = [];
  const cctvU: { time: { value: number } }[] = [];
  const feedRT = () => new THREE.WebGLRenderTarget(mobile ? 160 : 320, mobile ? 90 : 180);
  const cctv = (tex: THREE.Texture | null, seed: number) => {
    const u = { t: { value: tex }, time: { value: 0 }, seed: { value: seed }, live: { value: tex ? 1 : 0 } };
    cctvU.push(u);
    return new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform sampler2D t; uniform float time, seed, live; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5); }
        void main(){ vec2 uv=vUv; uv.x+=(h(vec2(floor(uv.y*90.),floor(time*14.)+seed))-.5)*.003;
          float l = live>.5 ? dot(texture2D(t,uv).rgb, vec3(.3,.59,.11)) : .08+.06*h(floor(uv*vec2(160.,90.))+floor(time*20.));
          l=pow(clamp(l*1.8,0.,1.),.75); l*=.82+.18*sin(uv.y*420.+time*7.); l+=(h(uv*vec2(320.,180.)+fract(time))-.5)*.1;
          float vg=smoothstep(.9,.25,length((uv-.5)*vec2(1.,1.2)));
          vec3 c=vec3(.72,1.,.84)*l*vg*1.25; if(uv.x>.04&&uv.x<.16&&uv.y>.86&&uv.y<.93) c+=vec3(1.2,.2,.15)*step(.5,fract(time*.8));
          gl_FragColor=vec4(c,1.); }`,
    });
  };
  const idleScreen = textTex([], { w: 512, h: 288, after: (g, w, h) => { g.fillStyle = '#0b100f'; g.fillRect(0, 0, w, h); g.fillStyle = '#d5e8df'; g.font = '700 30px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.fillText(labels.adminTitle, w / 2, h / 2 - 6); g.fillStyle = '#6f8a80'; g.font = '500 16px "JetBrains Mono", monospace'; g.fillText(labels.adminSub, w / 2, h / 2 + 24); } });
  const monitor = (z: number, y: number, w: number, h: number, mat: THREE.Material) => {
    const g = new THREE.Group(); g.position.set(11.68, y, z); g.rotation.y = -Math.PI / 2; monG.add(g);
    mesh(boxGeo(w + 0.04, h + 0.04, 0.05), M.poly, g, 0, 0, -0.02);
    const scr = mesh(new THREE.PlaneGeometry(w, h), mat, g, 0, 0, 0.006, 0, 0, 0, false);
    return { g, scr };
  };
  const main = monitor(5.95, 1.38, 0.94, 0.53, new THREE.MeshBasicMaterial({ map: idleScreen, color: new THREE.Color(1.3, 1.3, 1.3) }));
  const feedSpots = [[5.28, 2.0], [5.95, 2.0], [6.62, 2.0], [5.1, 1.38], [6.8, 1.38]];
  const feedCams = [[V(-10, 5.2, 7), V(-1, 1, -1)], [V(9, 4.6, -1), V(5.2, 1, -6)], [V(-6, 4.2, 4), V(-11.5, 1.6, -2)]];
  feedSpots.forEach(([z, y], i) => {
    const rt = !mobile && i < 3 ? feedRT() : null;
    const m = monitor(z, y, 0.6, 0.34, cctv(rt ? rt.texture : null, i * 3.1));
    if (rt) { const c = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 40); c.position.copy(feedCams[i][0]); c.lookAt(feedCams[i][1]); feeds.push({ rt, cam: c }); }
    m.scr.userData.cctv = true;
  });
  monG.children.forEach((g) => g.children.forEach((c) => { if (c instanceof THREE.Mesh && c.material instanceof THREE.ShaderMaterial) c.userData.cctv = true; }));
  const adminAnchor = new THREE.Object3D(); main.g.add(adminAnchor); adminAnchor.position.z = 0.008;
  addPick('admin', monG);
  await tick(0.92);

  // ---------- clutter ----------
  const cb2 = new Batch();
  // pallet racking (back right)
  for (const x of [8.4, 10.1, 11.8]) for (const z of [-7.7, -6.6]) cb2.box(M.rackBlue, 0.08, 5.0, 0.08, x, 2.5, z);
  for (const y of [0.15, 1.7, 3.25, 4.8]) for (const z of [-7.7, -6.6]) { cb2.box(M.rackOrange, 1.62, 0.1, 0.05, 9.25, y, z); cb2.box(M.rackOrange, 1.62, 0.1, 0.05, 10.95, y, z); }
  const pallet = (x: number, y: number, z: number) => { for (let i = 0; i < 5; i++) cb2.box(M.wood, 1.2, 0.022, 0.1, x, y + 0.135, z - 0.45 + i * 0.225); for (const dz of [-0.45, 0, 0.45]) cb2.box(M.wood, 1.2, 0.1, 0.1, x, y + 0.07, z + dz); for (let i = 0; i < 3; i++) cb2.box(M.wood, 0.1, 0.022, 1.0, x - 0.5 + i * 0.5, y + 0.01, z); };
  for (const [x, y, wrap] of [[9.25, 0.2, 0], [10.95, 0.2, 1], [9.25, 1.75, 1], [10.95, 1.75, 0], [9.25, 3.3, 0], [10.95, 3.3, 1]]) {
    pallet(x, y, -7.15);
    if (wrap) cb2.box(M.film, 1.18, 1.1, 0.98, x, y + 0.7, -7.15);
    else { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) cb2.box(M.cardboard, 0.56, 0.42, 0.46, x - 0.29 + i * 0.58, y + 0.36, -7.4 + j * 0.48); cb2.box(M.cardboard, 0.56, 0.42, 0.46, x - 0.29, y + 0.8, -7.15); }
  }
  // crates (back left)
  const crate = std({ color: 0x4d5440, roughness: 0.75 });
  for (const [x, y, z, s] of [[-10.9, 0.4, -7.2, 0.8], [-10.0, 0.4, -7.25, 0.8], [-10.45, 1.2, -7.2, 0.8], [-9.1, 0.3, -7.1, 0.6], [-10.9, 0.3, -6.1, 0.6]]) {
    cb2.box(crate, s * 1.4, s, s, x, y, z); cb2.box(M.steel, s * 1.42, 0.04, s * 1.02, x, y + s / 2 - 0.06, z); cb2.box(M.steel, s * 1.42, 0.04, s * 1.02, x, y - s / 2 + 0.06, z);
  }
  // drums near the door
  const ribs = (mat: THREE.Material, x: number, z: number) => { cb2.cyl(mat, 0.29, 0.29, 0.88, 22, x, 0.44, z); for (const y of [0.3, 0.6]) cb2.add(mat, new THREE.TorusGeometry(0.292, 0.012, 6, 22), mtx(x, y, z, Math.PI / 2, 0, 0)); cb2.cyl(M.steel, 0.28, 0.28, 0.01, 22, x, 0.885, z); };
  ribs(M.drum1, 1.5, -7.4); ribs(M.drum2, 2.15, -7.45); ribs(M.drum1, 1.8, -6.85); ribs(M.drum3, 8.2, -5.6);
  // tyres
  for (let i = 0; i < 4; i++) cb2.add(M.rubber, new THREE.TorusGeometry(0.3, 0.11, 10, 24), mtx(11.2, 0.11 + i * 0.22, -5.4, Math.PI / 2, 0, 0));
  // leaning ladder
  { const a0 = V(-8.3, 0, -7.4), a1 = V(-8.3, 4.2, -7.85); for (const dx of [-0.22, 0.22]) cb2.bar(M.galv, a0.clone().add(V(dx, 0, 0)), a1.clone().add(V(dx, 0, 0)), 0.05, 0.03); for (let i = 1; i < 14; i++) { const p = a0.clone().lerp(a1, i / 14); cb2.box(M.galv, 0.44, 0.03, 0.03, p.x, p.y, p.z); } }
  // stacked boxes behind the hero
  for (const [x, y, z, w, h, d] of [[-2.6, 0.25, -1.9, 0.6, 0.5, 0.5], [-2.0, 0.25, -2.0, 0.5, 0.5, 0.45], [-2.35, 0.7, -1.95, 0.55, 0.4, 0.45], [2.9, 0.3, -2.6, 0.7, 0.6, 0.5]]) cb2.box(M.cardboard, w, h, d, x, y, z, 0, 0.1, 0);
  pallet(-2.3, 0, -0.6);
  // fire extinguisher
  cb2.cyl(M.red, 0.08, 0.08, 0.5, 14, -11.6, 0.6, -6.3); cb2.cyl(M.poly, 0.03, 0.03, 0.08, 8, -11.6, 0.9, -6.3);
  cb2.flush(world);
  // chain hoist
  const linkGeo = new THREE.TorusGeometry(0.025, 0.007, 6, 10);
  const links = new THREE.InstancedMesh(linkGeo, M.galv, 56);
  for (let i = 0; i < 56; i++) { links.setMatrixAt(i, mtx(2.8, 6.2 - i * 0.042, 1.6, 0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2)); }
  links.castShadow = true; world.add(links);
  mesh(boxGeo(0.22, 0.28, 0.16), M.yellow, world, 2.8, 6.3, 1.6);
  const hookGeo = new THREE.TorusGeometry(0.06, 0.016, 8, 16, Math.PI * 1.4); mesh(hookGeo, M.steelL, world, 2.8, 3.78, 1.6, 0, 0, 0.4);
  await tick(0.97);

  // ---------- surfaces ----------
  const surf = (d: Pick<Surf, 'anchor' | 'w' | 'h' | 'dir' | 'fov' | 'maxW' | 'noDom'>): Surf => ({ ...d, el: null, reveal: 0, want: 0, W: 0, H: 0 });
  const SURF: Record<StationId, Surf> = {
    play: surf({ anchor: playAnchor, w: 2.4, h: 1.3, dir: V(0, -0.47, 0.88), fov: 36, maxW: 1240 }),
    maps: surf({ anchor: mapsAnchor, w: 3.5, h: 1.92, dir: V(0, 0.04, 1), fov: 36, maxW: 1260 }),
    arsenal: surf({ anchor: peg, w: BW, h: BH, dir: V(0, 0.02, 1), fov: 36, noDom: true }),
    album: surf({ anchor: albumAnchor, w: 0.6, h: 0.4, dir: V(0, -0.26, 0.97), fov: 34, maxW: 1080 }),
    profile: surf({ anchor: profileAnchor, w: 1.18, h: 0.96, dir: V(0.0, 0.04, 1), fov: 36, maxW: 860 }),
    settings: surf({ anchor: settingsAnchor, w: 1.38, h: 0.94, dir: V(0, 0.02, 1), fov: 36, maxW: 900 }),
    admin: surf({ anchor: adminAnchor, w: 0.94, h: 0.53, dir: V(0, 0, 1), fov: 34, maxW: 960 }),
  };
  const surfOf = (id: CamStation): Surf | undefined => (id === 'home' || id === 'intro' ? undefined : SURF[id]);

  // ---------- post chain ----------
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true };
  const rtScene = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, samples: mobile ? 0 : 4 });
  const rtA = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
  const rtB = rtA.clone(), rtC = rtA.clone(), rtD = rtA.clone();
  const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsGeo = new THREE.BufferGeometry(); fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const fsMesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(fsGeo); fsMesh.frustumCulled = false; fsScene.add(fsMesh);
  const fsDefault = fsMesh.material;
  const VS = 'varying vec2 vUv; void main(){ vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }';
  const sm = (fs: string, u: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false });
  const brightU = { t: { value: null as THREE.Texture | null }, px: { value: new THREE.Vector2() }, thr: { value: 0.9 } };
  const brightMat = sm('uniform sampler2D t; uniform vec2 px; uniform float thr; varying vec2 vUv; void main(){ vec3 c=(texture2D(t,vUv+px*vec2(-.5,-.5)).rgb+texture2D(t,vUv+px*vec2(.5,-.5)).rgb+texture2D(t,vUv+px*vec2(-.5,.5)).rgb+texture2D(t,vUv+px*vec2(.5,.5)).rgb)*.25; float l=max(c.r,max(c.g,c.b)); gl_FragColor=vec4(c*clamp((l-thr)/max(l,1e-4),0.,1.),1.); }', brightU);
  const blurU = { t: { value: null as THREE.Texture | null }, dir: { value: new THREE.Vector2() } };
  const blurMat = sm('uniform sampler2D t; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 c=texture2D(t,vUv).rgb*.227027; c+=texture2D(t,vUv+dir*1.3846).rgb*.316216; c+=texture2D(t,vUv-dir*1.3846).rgb*.316216; c+=texture2D(t,vUv+dir*3.2308).rgb*.07027; c+=texture2D(t,vUv-dir*3.2308).rgb*.07027; gl_FragColor=vec4(c,1.); }', blurU);
  const copyU = { t: { value: null as THREE.Texture | null } };
  const copyMat = sm('uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor=vec4(texture2D(t,vUv).rgb,1.); }', copyU);
  const postU = {
    tS: { value: rtScene.texture }, tB1: { value: rtB.texture }, tB2: { value: rtD.texture }, exposure: { value: 1.0 }, bloom: { value: 0.55 }, vig: { value: 0.75 }, grain: { value: 0.035 }, time: { value: 0 }, white: { value: 0 }, black: { value: 1 }, ca: { value: 0.012 }, res: { value: new THREE.Vector2() },
  };
  const post = sm(`uniform sampler2D tS, tB1, tB2; uniform float exposure, bloom, vig, grain, time, white, black, ca; uniform vec2 res; varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
    float hh(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-.055, step(.0031308,c)); }
    void main(){ vec2 d=vUv-.5; float r2=dot(d,d);
      vec3 c=vec3(texture2D(tS,vUv-d*ca*r2).r, texture2D(tS,vUv).g, texture2D(tS,vUv+d*ca*r2).b);
      c+=(texture2D(tB1,vUv).rgb*.6+texture2D(tB2,vUv).rgb*.9)*bloom;
      c=aces(c*exposure);
      float l=dot(c,vec3(.2126,.7152,.0722));
      c=mix(c,c*vec3(.9,1.,1.09),(1.-l)*.5); c=mix(c,c*vec3(1.07,1.,.9),l*.32);
      c=srgb(c);
      c*=mix(1.,smoothstep(1.,.28,length(d*vec2(1.,1.2))),vig);
      c+=(hh(vUv*res+fract(time)*91.)-.5)*grain;
      c=mix(c,vec3(1.),white); c=mix(c,vec3(0.),black);
      gl_FragColor=vec4(c,1.); }`, postU);
  const pass = (mat: THREE.Material, target: THREE.WebGLRenderTarget | null) => { fsMesh.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };

  // ---------- camera director ----------
  const cam = new THREE.PerspectiveCamera(34, 1, 0.04, 80);
  const tmpCam = cam.clone();
  let vw = 1, vh = 1, aspect = 1, portrait = false;
  const HOME = { pos: V(0.45, 1.36, 3.25), target: V(-0.42, 1.12, -0.05), fov: 33 };
  let station: CamStation = 'intro', arrived = false, move: Move | null = null, peekId: StationId | null = null;
  const peekT = V();
  const pan = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  const lookQuat = (pos: V3, target: V3, up: V3) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, target, up));
  const margins = () => (mobile || vw < 900 || vh < 560 ? { x: 14, top: 58, bottom: 62 } : { x: 40, top: 80, bottom: 84 });
  const surfBasis = (s: Surf): Basis => {
    s.anchor.updateWorldMatrix(true, false);
    const c = V().setFromMatrixPosition(s.anchor.matrixWorld), m3 = new THREE.Matrix3().setFromMatrix4(s.anchor.matrixWorld);
    const r = V(1, 0, 0).applyMatrix3(m3).normalize(), u = V(0, 1, 0).applyMatrix3(m3).normalize(), n = V(0, 0, 1).applyMatrix3(m3).normalize();
    const dir = r.clone().multiplyScalar(s.dir.x).addScaledVector(u, s.dir.y).addScaledVector(n, s.dir.z).normalize();
    return { c, r, u, n, dir };
  };
  const corners = (s: Surf, out: V3[]) => {
    const hw = s.w / 2, hh = s.h / 2;
    out[0].set(-hw, hh, 0); out[1].set(hw, hh, 0); out[2].set(hw, -hh, 0); out[3].set(-hw, -hh, 0);
    for (const p of out) s.anchor.localToWorld(p);
    return out;
  };
  const C4 = [V(), V(), V(), V()], _v = V();
  // the pose that frames a station's surface inside the screen margins (iterated: perspective is not linear)
  function surfPose(id: StationId): SurfPose {
    const s = SURF[id], b = surfBasis(s), mg = margins();
    const fov = s.fov + (portrait ? 14 : 0);
    tmpCam.fov = fov; tmpCam.aspect = aspect; tmpCam.filmOffset = 0; tmpCam.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    let d = Math.max(s.h / 2 / t, s.w / 2 / (t * aspect)) * 1.1;
    const bx = 1 - (2 * mg.x) / vw, by = 1 - (mg.top + mg.bottom) / vh;
    corners(s, C4);
    for (let i = 0; i < 5; i++) {
      tmpCam.position.copy(b.c).addScaledVector(b.dir, d); tmpCam.up.copy(b.u); tmpCam.lookAt(b.c); tmpCam.updateMatrixWorld();
      let m = 0; for (const p of C4) { _v.copy(p).project(tmpCam); m = Math.max(m, Math.abs(_v.x) / bx, Math.abs(_v.y) / by); }
      d *= m;
    }
    return { pos: b.c.clone().addScaledVector(b.dir, d), target: b.c.clone(), up: b.u.clone(), fov, film: 0, d, basis: b };
  }
  function poseFor(id: StationId | 'home'): Pose {
    if (id === 'home') {
      const film = portrait ? 0 : vw < 900 ? 6.5 : 8.5;
      return { pos: HOME.pos.clone(), target: HOME.target.clone(), up: V(0, 1, 0), fov: portrait ? 48 : HOME.fov, film };
    }
    return surfPose(id);
  }
  function sizeSurface(id: StationId | 'home', pose: Pose) {
    const s = surfOf(id); if (!s || s.noDom || !s.el) return;
    tmpCam.fov = pose.fov; tmpCam.aspect = aspect; tmpCam.filmOffset = 0; tmpCam.updateProjectionMatrix();
    tmpCam.position.copy(pose.pos); tmpCam.up.copy(pose.up); tmpCam.lookAt(pose.target); tmpCam.updateMatrixWorld();
    corners(s, C4); const P = C4.map((p) => { _v.copy(p).project(tmpCam); return { x: (_v.x * 0.5 + 0.5) * vw, y: (0.5 - _v.y * 0.5) * vh }; });
    const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
    const pw = (dist(P[0], P[1]) + dist(P[3], P[2])) / 2, ph = (dist(P[0], P[3]) + dist(P[1], P[2])) / 2;
    const W = Math.min(pw, s.maxW ?? Infinity), H = (W * ph) / pw;
    s.W = W; s.H = H; s.el.style.width = `${W}px`; s.el.style.height = `${H}px`;
  }
  const WAY: Partial<Record<CamStation, V3[]>> = { admin: [V(6.9, 1.7, 5.0)] };
  function goTo(id: StationId | 'home', instant = false) {
    if (disposed) return;
    if (id === station && !move) return;
    const prev = station;
    const ps = surfOf(prev); if (ps) ps.want = 0;
    if (prev === 'album' && id !== 'album') animate(coverPivot.rotation, 'z', Math.PI, 0, 0.55);
    cb.onLeave(prev, id);
    station = id; arrived = false;
    if (id === 'arsenal') { pan.tx = pan.ty = pan.tz = 0; }
    const dest = poseFor(id);
    sizeSurface(id, dest);
    const q1 = lookQuat(dest.pos, dest.target, dest.up);
    if (instant) { cam.position.copy(dest.pos); cam.quaternion.copy(q1); cam.fov = dest.fov; cam.filmOffset = dest.film; cam.updateProjectionMatrix(); move = null; arrive(); return; }
    const p0 = cam.position.clone(), p3 = dest.pos.clone(), dist = p0.distanceTo(p3);
    const pts = [p0];
    if (dist > 1.5) {
      const back = V(0, 0, 1).applyQuaternion(cam.quaternion);
      pts.push(p0.clone().addScaledVector(back, Math.min(0.7, dist * 0.08)).add(V(0, Math.min(0.45, dist * 0.04), 0)));
    }
    for (const w of [...(WAY[id] || []), ...(WAY[prev] || [])]) pts.push(w.clone());
    if (dist > 1.2) pts.push(p3.clone().addScaledVector(p3.clone().sub(dest.target).normalize(), Math.min(1.2, dist * 0.2)));
    pts.push(p3);
    move = { curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), q0: cam.quaternion.clone(), q1, fov0: cam.fov, fov1: dest.fov, film0: cam.filmOffset, film1: dest.film, t: 0, dur: duration, id };
  }
  function arrive() {
    arrived = true;
    if (station === 'home') peekT.copy(HOME.target);
    if (station === 'album') { animate(coverPivot.rotation, 'z', 0, Math.PI, 0.6, () => { if (station === 'album') SURF.album.want = 1; }); }
    else { const s = surfOf(station); if (s && !s.noDom) s.want = 1; }
    if (station === 'arsenal') SURF.arsenal.want = 1;
    cb.onArrive(station);
  }
  const tweens: Tween[] = [];
  function animate(obj: THREE.Euler, key: Tween['key'], from: number, to: number, dur: number, done?: () => void) { obj[key] = from; tweens.push({ obj, key, from, to, dur, t: 0, done }); }

  // ---------- homography ----------
  const homography = (W: number, H: number, p: Pt[]) => {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = [p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y];
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const det = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
    return `matrix3d(${a / W},${d / W},0,${g / W},${b / H},${e / H},0,${h / H},0,0,1,0,${x0},${y0},0,1)`;
  };
  const SP: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  const toScreen = (p: V3, out: Pt): boolean => {
    _v.copy(p).applyMatrix4(cam.matrixWorldInverse); if (_v.z > -cam.near) return false;
    _v.applyMatrix4(cam.projectionMatrix); out.x = (_v.x * 0.5 + 0.5) * vw; out.y = (0.5 - _v.y * 0.5) * vh; return true;
  };
  let zoomFull = false;
  const tagEls: Record<string, HTMLElement> = {}; let cardEl: HTMLElement | null = null, selected: string | null = null; const card = { x: 0, y: 0, init: false };
  function updateSurfaces(dt: number) {
    for (const id of STATION_ORDER) {
      const s = SURF[id];
      s.reveal = clamp(s.reveal + (s.want ? dt / 0.35 : -dt / 0.16), 0, 1);
      const a = smoother(s.reveal);
      for (const m of fades[id] || []) m.opacity = 1 - a;
      if (s.noDom || !s.el) continue;
      if (s.reveal <= 0) { if (s.el.style.visibility !== 'hidden') { s.el.style.visibility = 'hidden'; s.el.style.pointerEvents = 'none'; } continue; }
      corners(s, C4);
      let ok = true; for (let i = 0; i < 4; i++) ok = toScreen(C4[i], SP[i]) && ok;
      if (!ok || !s.W) { s.el.style.visibility = 'hidden'; continue; }
      s.el.style.visibility = 'visible';
      s.el.style.opacity = a.toFixed(3);
      s.el.style.pointerEvents = s.reveal > 0.9 ? 'auto' : 'none';
      s.el.style.transform = homography(s.W, s.H, SP);
    }
    // arsenal tags + inspection card
    const ar = smoother(SURF.arsenal.reveal);
    for (const [id, w] of Object.entries(weapons)) {
      const el = tagEls[id]; if (!el) continue;
      if (ar <= 0) { el.style.visibility = 'hidden'; continue; }
      _v.copy(w.anchor); peg.localToWorld(_v);
      const o = { x: 0, y: 0 };
      if (!toScreen(_v, o)) { el.style.visibility = 'hidden'; continue; }
      el.style.visibility = 'visible'; el.style.opacity = ar.toFixed(3); el.style.pointerEvents = ar > 0.9 ? 'auto' : 'none';
      el.style.transform = `translate(${o.x.toFixed(1)}px,${o.y.toFixed(1)}px) translate(-50%,0)`;
    }
    if (cardEl) {
      const w = selected ? weapons[selected] : undefined;
      if (!w || ar <= 0) { cardEl.style.visibility = 'hidden'; cardEl.style.pointerEvents = 'none'; }
      else {
        _v.set(w.def.u, w.def.v, 0.08); peg.localToWorld(_v);
        const o = { x: 0, y: 0 }; toScreen(_v, o);
        const cw = cardEl.offsetWidth || 340, chh = cardEl.offsetHeight || 420, mg = margins();
        const side = o.x + 90 + cw < vw - mg.x ? 1 : -1;
        let tx = side > 0 ? o.x + 90 : o.x - 90 - cw; tx = clamp(tx, mg.x, vw - mg.x - cw);
        const ty = clamp(o.y - chh * 0.42, mg.top, Math.max(mg.top, vh - mg.bottom - chh));
        card.x = card.init ? lerp(card.x, tx, 1 - Math.exp(-dt * 10)) : tx; card.y = card.init ? lerp(card.y, ty, 1 - Math.exp(-dt * 10)) : ty; card.init = true;
        cardEl.style.visibility = 'visible'; cardEl.style.opacity = ar.toFixed(3); cardEl.style.pointerEvents = ar > 0.9 ? 'auto' : 'none';
        cardEl.style.transform = `translate(${card.x.toFixed(1)}px,${card.y.toFixed(1)}px)`;
      }
    }
  }

  // ---------- input ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pointers = new Map<number, Pt>(); let drag: Drag | null = null, hoverId: StationId | null = null;
  const pickAt = (cx: number, cy: number, list: THREE.Object3D[]): THREE.Intersection | undefined => {
    const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam); return ray.intersectObjects(list, true)[0];
  };
  const pickList = (): THREE.Object3D[] => STATION_ORDER.flatMap((id) => pick[id] ?? []);
  const stationOfHit = (hit: THREE.Intersection | undefined): StationId | null => (hit?.object.userData.station as StationId | undefined) ?? null;
  const weaponOfHit = (hit: THREE.Intersection | undefined): string | null => (hit?.object.userData.weapon as string | undefined) ?? null;
  const pinchDist = () => { const p = [...pointers.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, moved: 0, pinch: pointers.size === 2 ? pinchDist() : 0 };
    if (station === 'arsenal') canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (prev) { prev.x = e.clientX; prev.y = e.clientY; }
    if (drag && prev && station === 'arsenal' && arrived) {
      if (pointers.size === 2) { const d = pinchDist(); if (drag.pinch) pan.tz = clamp(pan.tz + (d - drag.pinch) * 0.006, 0, 0.62); drag.pinch = d; drag.moved += 10; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      const k = (SURF.arsenal.w / vw) * (1 - pan.tz) * 1.05;
      pan.tx = clamp(pan.tx - dx * k, -2.6, 2.6); pan.ty = clamp(pan.ty + dy * k, -0.8, 0.8);
      return;
    }
    if (station === 'home' && arrived && e.pointerType === 'mouse') {
      const id = stationOfHit(pickAt(e.clientX, e.clientY, pickList()));
      if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? 'pointer' : ''; cb.onHoverStation(id); }
    } else if (station === 'arsenal' && arrived && e.pointerType === 'mouse') {
      canvas.style.cursor = weaponOfHit(pickAt(e.clientX, e.clientY, [peg])) ? 'pointer' : 'grab';
    }
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (!drag) return;
    if (drag.moved < 6) {
      if (station === 'home' && arrived) { const id = stationOfHit(pickAt(e.clientX, e.clientY, pickList())); if (id) cb.onStationPick(id); }
      else if (station === 'arsenal' && arrived) { const id = weaponOfHit(pickAt(e.clientX, e.clientY, [peg])); if (id) cb.onWeaponPick(id); }
    }
    if (!pointers.size) drag = null;
  };
  const onWheel = (e: WheelEvent) => { if (station !== 'arsenal' || !arrived) return; e.preventDefault(); pan.tz = clamp(pan.tz - e.deltaY * 0.0012, 0, 0.62); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ---------- resize ----------
  const host = canvas.parentElement ?? canvas;
  function resize() {
    if (disposed) return;
    const r = host.getBoundingClientRect(); vw = Math.max(1, r.width); vh = Math.max(1, r.height); aspect = vw / vh; portrait = aspect < 1;
    renderer.setSize(vw, vh, false);
    const pr = renderer.getPixelRatio(), W = Math.floor(vw * pr), Hh = Math.floor(vh * pr);
    rtScene.setSize(W, Hh); rtA.setSize(W >> 1, Hh >> 1); rtB.setSize(W >> 1, Hh >> 1); rtC.setSize(W >> 2, Hh >> 2); rtD.setSize(W >> 2, Hh >> 2);
    postU.res.value.set(W, Hh);
    cam.aspect = aspect; cam.updateProjectionMatrix();
    if (station !== 'intro' && !move) { const p = poseFor(station); sizeSurface(station, p); cam.position.copy(p.pos); cam.quaternion.copy(lookQuat(p.pos, p.target, p.up)); cam.fov = p.fov; cam.filmOffset = p.film; cam.updateProjectionMatrix(); }
    else if (move && surfOf(move.id)) sizeSurface(move.id, poseFor(move.id));
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  // ---------- intro ----------
  cam.position.set(4.5, 5.6, 6.4); cam.quaternion.copy(lookQuat(cam.position, V(-0.5, 1.4, -2), V(0, 1, 0))); cam.fov = 40; cam.updateProjectionMatrix();
  let launchState: { t: number; done: () => void; fired: boolean } | null = null; let fadeIn = 0;

  // ---------- loop ----------
  let last = performance.now(), time = 0, frame = 0, raf = 0;
  const headQ = new THREE.Quaternion();
  let heroModel: GalpaoHero | null = null;
  const dropHero = () => {
    if (!heroModel) return;
    const o = heroModel.object;
    pick.profile = (pick.profile ?? []).filter((x) => x !== o);
    o.removeFromParent();
    heroModel.dispose();
    heroModel = null;
  };
  function loop(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (devInfo) {
      renderer.info.autoReset = false;
      renderer.info.reset();
    }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt; frame++;
    // camera
    if (move) {
      move.t = Math.min(1, move.t + dt / move.dur);
      const e = smoother(move.t);
      cam.position.copy(move.curve.getPointAt(e));
      cam.quaternion.slerpQuaternions(move.q0, move.q1, smoother(clamp((move.t - 0.04) / 0.9, 0, 1)));
      cam.fov = lerp(move.fov0, move.fov1, e); cam.filmOffset = lerp(move.film0, move.film1, e); cam.updateProjectionMatrix();
      const ms = surfOf(move.id);
      if (ms && move.t > 0.84 && move.id !== 'album' && !ms.noDom) ms.want = 1;
      if (move.t >= 1) { move = null; arrive(); }
    } else if (arrived && station === 'home') {
      const p = poseFor('home');
      const tgt = p.target.clone();
      if (peekId) { const c = surfBasis(SURF[peekId]).c; tgt.lerp(c, 0.035); }
      peekT.lerp(tgt, 1 - Math.exp(-dt * 3));
      const breathe = V(Math.sin(time * 0.31) * 0.012, Math.sin(time * 0.43) * 0.008, 0);
      cam.position.copy(p.pos).add(breathe);
      cam.quaternion.slerp(lookQuat(cam.position, peekT, p.up), 1 - Math.exp(-dt * 6));
    } else if (arrived && station === 'arsenal') {
      pan.x = lerp(pan.x, pan.tx, 1 - Math.exp(-dt * 9)); pan.y = lerp(pan.y, pan.ty, 1 - Math.exp(-dt * 9)); pan.z = lerp(pan.z, pan.tz, 1 - Math.exp(-dt * 9));
      const p = surfPose('arsenal'), b = p.basis;
      const off = b.r.clone().multiplyScalar(pan.x).addScaledVector(b.u, pan.y);
      cam.position.copy(p.pos).add(off).addScaledVector(b.dir, -p.d * pan.z);
      cam.quaternion.copy(lookQuat(cam.position, p.target.clone().add(off), p.up));
      const full = pan.z > 0.28; if (full !== zoomFull) { zoomFull = full; cb.onZoom(full); }
    }
    if (launchState) {
      launchState.t += dt;
      const k = clamp(launchState.t / 2.4, 0, 1);
      curtain.position.y = smoother(k) * 3.9;
      keys.play.light.intensity = keys.play.base * (1 + k * 2);
      move = null;
      cam.position.lerp(V(5.3, 1.55, -5.9), 1 - Math.exp(-dt * (0.6 + 1.4 * k)));
      cam.quaternion.slerp(lookQuat(cam.position, V(5.3, 1.5, -9.5), V(0, 1, 0)), 1 - Math.exp(-dt * 3));
      cam.filmOffset = lerp(cam.filmOffset, 0, 1 - Math.exp(-dt * 3)); cam.fov = lerp(cam.fov, 42, 1 - Math.exp(-dt * 2)); cam.updateProjectionMatrix();
      postU.white.value = clamp((launchState.t - 1.6) / 1.0, 0, 1);
      if (launchState.t > 2.7 && !launchState.fired) { launchState.fired = true; launchState.done(); }
    }
    fadeIn = Math.min(1, fadeIn + dt / 1.2); postU.black.value = 1 - smoother(fadeIn);
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; tw.t = Math.min(1, tw.t + dt / tw.dur); tw.obj[tw.key] = lerp(tw.from, tw.to, smoother(tw.t));
      if (tw.t >= 1) { tweens.splice(i, 1); tw.done?.(); }
    }
    for (const [id, k] of Object.entries(keys)) { k.boost = lerp(k.boost, peekId === id ? 1 : 0, 1 - Math.exp(-dt * 5)); if (!launchState || id !== 'play') k.light.intensity = k.base * (1 + k.boost * 0.9); }
    // character: head follows the camera a little
    if (heroModel) heroModel.update(dt, cam, time);
    else {
      const lookAt = cam.position.clone(); const local = charG.worldToLocal(lookAt).sub(headPivot.position);
      const yaw = clamp(Math.atan2(local.x, local.z), -0.6, 0.6), pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)) * 0.5 + 0.35, -0.1, 0.55);
      headQ.setFromEuler(new THREE.Euler(pitch + Math.sin(time * 0.6) * 0.015, yaw * 0.7, 0)); headPivot.quaternion.slerp(headQ, 1 - Math.exp(-dt * 2.5));
    }
    // weapon focus light
    if (selected && weapons[selected]) { const w = weapons[selected].def; focus.position.lerp(V(w.u, w.v + 0.15, 0.45), 1 - Math.exp(-dt * 8)); focus.intensity = lerp(focus.intensity, station === 'arsenal' ? 1.6 : 0, 1 - Math.exp(-dt * 6)); }
    shaftU.time.value = time; dustU.time.value = time; postU.time.value = time;
    for (const u of cctvU) u.time.value = time;
    cam.updateMatrixWorld();
    // CCTV feeds (round robin)
    if (feeds.length && frame % 3 === 0) {
      const f = feeds[(frame / 3) % feeds.length | 0];
      monG.visible = false; shaftMesh.visible = false;
      renderer.setRenderTarget(f.rt); renderer.render(scene, f.cam);
      monG.visible = true; shaftMesh.visible = true;
    }
    renderer.setRenderTarget(rtScene); renderer.render(scene, cam);
    brightU.t.value = rtScene.texture; brightU.px.value.set(1 / rtScene.width, 1 / rtScene.height); pass(brightMat, rtA);
    blurU.t.value = rtA.texture; blurU.dir.value.set(1 / rtA.width, 0); pass(blurMat, rtB);
    blurU.t.value = rtB.texture; blurU.dir.value.set(0, 1 / rtA.height); pass(blurMat, rtA);
    copyU.t.value = rtA.texture; pass(copyMat, rtC);
    blurU.t.value = rtC.texture; blurU.dir.value.set(2 / rtC.width, 0); pass(blurMat, rtD);
    blurU.t.value = rtD.texture; blurU.dir.value.set(0, 2 / rtC.height); pass(blurMat, rtC);
    postU.tB1.value = rtA.texture; postU.tB2.value = rtC.texture;
    pass(post, null);
    updateSurfaces(dt);
    if (devInfo) {
      devInfo.chamadas = renderer.info.render.calls;
      devInfo.triangulos = renderer.info.render.triangles;
      devInfo.quadros++;
    }
  }
  await tick(1);
  raf = requestAnimationFrame(loop);
  const onVis = () => { last = performance.now(); };
  document.addEventListener('visibilitychange', onVis);

  // frees every GPU resource the scene made: meshes' geometry, materials and their (canvas) textures, shadow maps,
  // the post chain, the CCTV feeds and the PMREM environment
  function release() {
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
    const addMat = (m: THREE.Material) => {
      if (mats.has(m)) return;
      mats.add(m);
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) texs.add(v);
      if (m instanceof THREE.ShaderMaterial) for (const u of Object.values(m.uniforms)) if (u.value instanceof THREE.Texture) texs.add(u.value);
    };
    const collect = (root: THREE.Object3D) => root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        geos.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) addMat(m);
      }
      if (o instanceof THREE.Sprite) addMat(o.material); // sprites share one static geometry: leave it
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.DirectionalLight || o instanceof THREE.SpotLight || o instanceof THREE.PointLight) o.shadow.dispose();
    });
    collect(scene); collect(env);
    for (const m of Object.values(M)) addMat(m);
    for (const m of [brightMat, blurMat, copyMat, post, fsDefault]) addMat(m);
    geos.add(fsGeo);
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const t of texs) if (!t.isRenderTargetTexture) t.dispose();
    for (const rt of [rtScene, rtA, rtB, rtC, rtD, envRT, ...feeds.map((f) => f.rt)]) rt.dispose();
    pmrem.dispose();
    renderer.dispose();
  }

  return {
    goTo,
    setHero(h: GalpaoHero | null) {
      if (disposed) return h?.dispose();
      dropHero();
      heroModel = h;
      charG.visible = !h;
      if (h) { hero.add(h.object); addPick('profile', h.object); }
    },
    intro() { if (disposed) return; station = 'intro'; goTo('home'); if (move) move.dur = 3.2; },
    get station() { return station; },
    setDuration(s: number) { duration = s; },
    peek(id: StationId | null) { peekId = id; },
    bindSurface(id: StationId, el: HTMLElement) { const s = SURF[id]; if (s) { s.el = el; el.style.visibility = 'hidden'; el.style.transformOrigin = '0 0'; } },
    bindTag(id: string, el: HTMLElement) { tagEls[id] = el; el.style.visibility = 'hidden'; },
    bindCard(el: HTMLElement) { cardEl = el; el.style.visibility = 'hidden'; },
    selectWeapon(id: string | null) {
      selected = id; card.init = card.init && !!id;
      if (id && weapons[id]) { const w = weapons[id].def; pan.tx = clamp(w.u * 0.6 + (w.u < 0.5 ? 0.4 : -0.4), -2.6, 2.6); pan.ty = clamp(w.v * 0.4, -0.8, 0.8); pan.tz = Math.max(pan.tz, 0.32); }
    },
    resetPan() { pan.tx = pan.ty = pan.tz = 0; },
    flipPage(dir: number, mid?: () => void) {
      if (disposed) return;
      const s = SURF.album; s.want = 0;
      pagePivot.visible = true;
      const from = dir > 0 ? 0 : Math.PI, to = dir > 0 ? Math.PI : 0;
      later(() => { animate(pagePivot.rotation, 'z', from, to, 0.55, () => { pagePivot.visible = false; if (station === 'album') s.want = 1; }); later(() => mid?.(), 260); }, 140);
    },
    launch(done: () => void) {
      if (disposed) return;
      launchState = { t: 0, done: () => { if (!disposed) done(); }, fired: false }; arrived = false;
      const s = surfOf(station); if (s) s.want = 0;
    },
    resetLaunch() { if (disposed) return; launchState = null; curtain.position.y = 0; postU.white.value = 0; fadeIn = 0; station = 'intro'; goTo('home', true); },
    resize,
    dispose() {
      if (disposed) return;
      dropHero();
      disposed = true;
      cancelAnimationFrame(raf);
      for (const id of timers) clearTimeout(id);
      timers.clear(); tweens.length = 0; launchState = null; move = null;
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.style.cursor = '';
      release();
    },
  };
}
