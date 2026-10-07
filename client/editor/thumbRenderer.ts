// Drawing a thumbnail (PF-6 Revisions 01, etapa 4): one piece built alone by the game's loader (its editor mode,
// in a physics world of its own that's freed right after), in a scene and a camera of its own, out of sight: into a
// render target of the editor's renderer (no second WebGL context), with a light of its own and a transparent
// background, framed from above at three quarters. Drawn at twice the size and scaled down (smooth edges), read
// back, kept as a WebP image (client/editor/thumbCache.ts). The piece's box from the point it's dropped at comes
// with it (the ghost while dragging it over the Scene). Everything built goes away once drawn.
import * as THREE from 'three';
import { MAP_FORMAT, type MapData, type Peca } from '@shared/mapData';
import { createPhysics } from '../world/physics';
import { startBuild } from '../world/mapLoader';
import type { Rest } from './document';
import { silentSfx } from './view';

/** A thumbnail's side on the page (px). */
export const THUMB_PX = 128;
/** Drawn this many times bigger, then scaled down. */
const SUPER = 2;
const N = THUMB_PX * SUPER;
/** The camera: from the front right, above (radians), and its field of view (degrees). */
const YAW = 0.75;
const PITCH = 0.45;
const FOV = 28;

export interface Shot {
  /** The picture (null: the piece draws nothing to see). */
  blob: Blob | null;
  /** Its box from the drop point (min x y z, max x y z). */
  box: [number, number, number, number, number, number] | null;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The box of what's drawn (hidden things, like a gag's trigger zone, don't count). */
function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const g = (o as THREE.Mesh).geometry;
    const many = o as THREE.InstancedMesh & { isBatchedMesh?: boolean };
    if (many.isInstancedMesh || many.isBatchedMesh) {
      // Its instances' box, not its one geometry's.
      if (!many.boundingBox) many.computeBoundingBox();
      if (many.boundingBox) box.union(part.copy(many.boundingBox).applyMatrix4(o.matrixWorld));
    } else if (g && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine)) {
      if (!g.boundingBox) g.computeBoundingBox();
      if (g.boundingBox) box.union(part.copy(g.boundingBox).applyMatrix4(o.matrixWorld));
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return box;
}

/** A map with nothing but `pecas` (and its files), for building one piece alone. */
function soloMap(pecas: Peca[], arquivos: MapData['arquivos']): MapData {
  return {
    formato: MAP_FORMAT,
    nome: 'miniatura',
    cartao: { emoji: '🖼️', cor: '#ffffff' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas,
    arquivos,
    spawns: { a: [], b: [], ffa: [] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
  };
}

export class ThumbRenderer {
  private scene = new THREE.Scene();
  private holder = new THREE.Group();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 5000);
  private target: THREE.WebGLRenderTarget;
  private pixels = new Uint8Array(N * N * 4);
  private big = document.createElement('canvas');
  private small = document.createElement('canvas');
  private clear = new THREE.Color();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8796a8, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(-0.6, 1, 0.8);
    this.scene.add(sun, sun.target, this.holder);
    // sRGB storage: the picture comes out as the screen would show it.
    this.target = new THREE.WebGLRenderTarget(N, N, { colorSpace: THREE.SRGBColorSpace, depthBuffer: true });
    this.big.width = this.big.height = N;
    this.small.width = this.small.height = THUMB_PX;
  }

  /**
   * Builds `peca` alone and draws it. `anchor`: where it's dropped from: its own place ('p', a 'livre' piece) or
   * the middle of its base (a piece placed by its pose). `rest`: the server's places it brings (a rat's).
   */
  async shoot(peca: Peca, arquivos: MapData['arquivos'], anchor: 'p' | 'base', rest?: (r: Rest) => void): Promise<Shot> {
    const physics = await createPhysics();
    const data = soloMap([peca], arquivos);
    rest?.(data);
    const build = startBuild(data, { physics, scene: this.holder as unknown as THREE.Scene, renderer: this.renderer, sfx: silentSfx, modo: 'editor' });
    try {
      await build.piece(peca);
      this.holder.updateMatrixWorld(true);
      const box = visibleBounds(this.holder);
      if (box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return { blob: null, box: null };
      const blob = await this.draw(box);
      const c = box.getCenter(new THREE.Vector3());
      const a = anchor === 'p' ? new THREE.Vector3(...(peca.p ?? [0, 0, 0])) : new THREE.Vector3(c.x, box.min.y, c.z);
      return { blob, box: [r3(box.min.x - a.x), r3(box.min.y - a.y), r3(box.min.z - a.z), r3(box.max.x - a.x), r3(box.max.y - a.y), r3(box.max.z - a.z)] };
    } finally {
      build.remove(peca.id);
      // What the piece put elsewhere than its group goes too.
      for (const o of [...this.holder.children]) {
        o.removeFromParent();
        o.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
      }
      physics.world.free();
    }
  }

  /** The box framed and drawn into the render target, read back and kept as an image. */
  private async draw(box: THREE.Box3): Promise<Blob | null> {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 0.05);
    const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.04;
    const cam = this.camera;
    cam.position.copy(sphere.center).addScaledVector(dir, dist);
    cam.near = Math.max(0.01, dist - r * 1.5);
    cam.far = dist + r * 1.5;
    cam.lookAt(sphere.center);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    const gl = this.renderer;
    const before = { target: gl.getRenderTarget(), alpha: gl.getClearAlpha(), shadows: gl.shadowMap.needsUpdate };
    gl.getClearColor(this.clear);
    try {
      // The sun's shadow map is the editor's (refreshed on its own frames): not this drawing's.
      gl.shadowMap.needsUpdate = false;
      gl.setRenderTarget(this.target);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.render(this.scene, cam);
      gl.readRenderTargetPixels(this.target, 0, 0, N, N, this.pixels);
    } finally {
      gl.setRenderTarget(before.target);
      gl.setClearColor(this.clear, before.alpha);
      gl.shadowMap.needsUpdate = before.shadows;
    }

    // WebGL reads bottom up, and the colors over a clear background come premultiplied by their alpha.
    const big = this.big.getContext('2d')!;
    const img = big.createImageData(N, N);
    const src = this.pixels;
    const out = img.data;
    for (let y = 0; y < N; y++) {
      const from = (N - 1 - y) * N * 4;
      const to = y * N * 4;
      for (let x = 0; x < N * 4; x += 4) {
        const a = src[from + x + 3];
        const k = a > 0 && a < 255 ? 255 / a : 1;
        out[to + x] = Math.min(255, src[from + x] * k);
        out[to + x + 1] = Math.min(255, src[from + x + 1] * k);
        out[to + x + 2] = Math.min(255, src[from + x + 2] * k);
        out[to + x + 3] = a;
      }
    }
    big.putImageData(img, 0, 0);
    const small = this.small.getContext('2d')!;
    small.clearRect(0, 0, THUMB_PX, THUMB_PX);
    small.imageSmoothingEnabled = true;
    small.imageSmoothingQuality = 'high';
    small.drawImage(this.big, 0, 0, THUMB_PX, THUMB_PX);
    return new Promise((resolve) => this.small.toBlob((b) => resolve(b), 'image/webp', 0.9));
  }

  dispose() {
    this.target.dispose();
  }
}
