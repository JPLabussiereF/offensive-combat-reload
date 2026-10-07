// Sticker studio: from a built scene to a baked picture. One WebGL renderer for the whole page (transparent
// background, pixel ratio 1, sRGB, no tone mapping, no shadows: the editor thumbnails' setup); the editor's
// light rig aimed at each shot; then the die-cut (dieCut.ts), the halving to the baked size and the PNG.
// Before every render: objects marked userData.facecam turn to the camera (stars, confetti), every additive
// material becomes a normal-blended clone (additive light washes out on a transparent canvas), and every light
// but the rig's is switched off unless Built.propLights (a prop's or an effect's light, even one made in a
// Shot.before, would tint the sticker).
// After a subject, teardown() frees everything its scene reached; three.js uploads shared caches again on next
// use, so a later subject never sees a disposed resource. prepareSurfaces() paints the map surfaces once, in a
// fixed order, before any subject (their shared noise tile would otherwise depend on which sticker came first).
import * as THREE from 'three';
import { setupScene } from '../../../ui/customize';
import { SURFACES, surfaceMaterial, type SurfaceKey } from '../../../world/surfaces';
import { dieCut, type CutResult, type CutSpec } from './dieCut';
import type { Built, Shot, V3 } from './types';

/** A V3 as a new Vector3. Duck-typed: a Vector3 from another copy of three.js must not read as (0, 0, 0). */
export function vec(p: V3): THREE.Vector3 {
  if ((p as THREE.Vector3).isVector3) return new THREE.Vector3().copy(p as THREE.Vector3);
  const [x, y, z] = p as readonly [number, number, number];
  return new THREE.Vector3(x, y, z);
}

let shared: THREE.WebGLRenderer | null = null;

/** The page's one renderer (WebGL contexts are slow to make under SwiftShader, and a page gets few). */
export function studioRenderer(): THREE.WebGLRenderer {
  if (!shared) {
    shared = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    shared.setPixelRatio(1);
    shared.outputColorSpace = THREE.SRGBColorSpace;
    shared.toneMapping = THREE.NoToneMapping;
    shared.shadowMap.enabled = false;
    shared.setClearColor(0x000000, 0);
  }
  return shared;
}

/**
 * Every map surface's shared material and texture, made once in SURFACES order before any subject. The painters
 * share one lazily made noise tile (world/textures.ts), filled with the dice of whichever surface is painted
 * first: without this, the grass's grain in one sticker would depend on the surface an earlier one painted. Run it
 * before loadTextureOverrides (which paints the surfaces it replaces in the order their files arrive).
 */
export function prepareSurfaces() {
  for (const key of Object.keys(SURFACES) as SurfaceKey[]) surfaceMaterial(key);
}

/** The GPU behind the renderer (the bake only accepts SwiftShader: same pixels on every machine). */
export function rendererName(): string {
  const gl = studioRenderer().getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}

// --- Light -----------------------------------------------------------------------------------------------------

export interface Rig {
  group: THREE.Group;
  /** Aims the lights at a shot: key above and to the right of the camera, rim behind the subject on the left. */
  aim(shot: Shot): void;
}

/** The subject's lights (Built.light, Built.rim), added to its scene. */
export function lightRig(built: Built): Rig {
  const group = new THREE.Group();
  group.name = 'estudio:luz';
  if (built.light === 'viewmodel') {
    // The first-person view's own light (render/renderer.ts), fixed to a camera at the origin looking down -Z.
    group.add(new THREE.HemisphereLight(0xe8f6ff, 0x5a6a48, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
    sun.position.set(-1, 2, 1.5);
    group.add(sun, sun.target);
    return { group, aim() {} };
  }
  const { sun, rim } = setupScene(group);
  rim.intensity = built.rim ?? rim.intensity;
  group.add(sun.target, rim.target);
  const f = new THREE.Vector3();
  const r = new THREE.Vector3();
  const u = new THREE.Vector3();
  return {
    group,
    aim(shot) {
      const target = vec(shot.target);
      f.subVectors(target, vec(shot.pos)).normalize();
      r.crossVectors(f, shot.up ? vec(shot.up) : new THREE.Vector3(0, 1, 0));
      if (r.lengthSq() < 1e-8) r.crossVectors(f, new THREE.Vector3(0, 0, -1));
      r.normalize();
      u.crossVectors(r, f);
      // The editor's offsets (customize.ts setupScene) taken in the camera's frame and mirrored left-right:
      // right, up, toward the camera.
      sun.position.copy(target).addScaledVector(r, 2.5).addScaledVector(u, 4).addScaledVector(f, -3);
      rim.position.copy(target).addScaledVector(r, -3).addScaledVector(u, 2.5).addScaledVector(f, 3);
      sun.target.position.copy(target);
      rim.target.position.copy(target);
    },
  };
}

// --- Passes before a render ------------------------------------------------------------------------------------

export function cameraFor(shot: Shot, aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(shot.fov ?? 30, aspect, shot.near ?? 0.01, shot.far ?? 300);
  cam.position.copy(vec(shot.pos));
  if (shot.up) cam.up.copy(vec(shot.up)).normalize();
  cam.lookAt(vec(shot.target));
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

const normalOf = new WeakMap<THREE.Material, THREE.Material>();

/** A normal-blended stand-in for an additive material (one per original; the original is never touched). */
function normalBlended(m: THREE.Material): THREE.Material {
  if (m.blending !== THREE.AdditiveBlending) return m;
  let c = normalOf.get(m);
  if (!c) {
    c = m.clone();
    c.blending = THREE.NormalBlending;
    normalOf.set(m, c);
  }
  return c;
}

/** Swaps every additive material under `root` for a normal-blended clone, except under userData.keepAdditive. */
export function unadd<T extends THREE.Object3D>(root: T): T {
  const walk = (o: THREE.Object3D) => {
    if (o.userData.keepAdditive) return;
    const holder = o as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
    if (holder.material) holder.material = Array.isArray(holder.material) ? holder.material.map(normalBlended) : normalBlended(holder.material);
    for (const child of o.children) walk(child);
  };
  walk(root);
  return root;
}

/** Switches off every light under `root` but the rig's (made lazily, an effect's light can appear at any time). */
function lightsOff(root: THREE.Object3D, rig: THREE.Object3D) {
  const walk = (o: THREE.Object3D) => {
    if (o === rig) return;
    if ((o as THREE.Light).isLight) o.visible = false;
    for (const c of o.children) walk(c);
  };
  walk(root);
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

/** Turns every userData.facecam object flat to the camera (keeping its userData.roll about the view axis). */
function faceCamera(scene: THREE.Scene, camera: THREE.Camera) {
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.userData.facecam || !o.parent) return;
    o.parent.getWorldQuaternion(qa).invert();
    o.quaternion.copy(qa).multiply(camera.quaternion);
    if (o.userData.roll) o.quaternion.multiply(qb.setFromAxisAngle(Z, o.userData.roll));
  });
}

/** Text that must stay legible on the card (k.bubble, k.label): grown until its cap height reaches `minPx`. */
export interface StudioText {
  obj: THREE.Object3D;
  /** Cap height in meters at the object's current scale. */
  cap(): number;
  /** Minimum cap height in pixels of the 800 x 600 card render (0: never grow). */
  minPx: number;
  label: string;
  /** Cap height on the card, once fitted. */
  px?: number;
}

/** Grows the texts too small for `camera` (the card's), about their own anchor, and records their size. */
export function fitTexts(texts: StudioText[], camera: THREE.PerspectiveCamera, height: number) {
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const p = new THREE.Vector3();
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  for (const t of texts) {
    t.obj.updateWorldMatrix(true, false);
    const depth = t.obj.getWorldPosition(p).sub(camera.position).dot(forward);
    if (depth <= 0) continue;
    const perMeter = height / (2 * depth * tan);
    let px = t.cap() * perMeter;
    if (t.minPx > 0 && px > 0 && px < t.minPx) {
      t.obj.scale.multiplyScalar(t.minPx / px);
      px = t.minPx;
    }
    t.px = px;
  }
}

// --- Render ----------------------------------------------------------------------------------------------------

/**
 * Renders a shot at the spec's size: RGBA premultiplied by alpha, top row first (what the die-cut reads). The
 * shot's before() is the caller's (bake.ts runs it seeded). Only the rig lights it unless `propLights`.
 */
export function renderShot(scene: THREE.Scene, shot: Shot, spec: CutSpec, rig: Rig, o: { propLights?: boolean } = {}): Uint8Array<ArrayBuffer> {
  const hidden = (shot.hide ?? []).filter((h) => h.visible);
  for (const h of hidden) h.visible = false;
  try {
    const camera = cameraFor(shot, spec.w / spec.h);
    rig.aim(shot);
    if (!o.propLights) lightsOff(scene, rig.group);
    faceCamera(scene, camera);
    unadd(scene);
    const r = studioRenderer();
    r.setSize(spec.w, spec.h, false);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, camera);
    const gl = r.getContext();
    const raw = new Uint8Array(spec.w * spec.h * 4);
    gl.readPixels(0, 0, spec.w, spec.h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    // WebGL reads bottom-up.
    const out = new Uint8Array(raw.length);
    const row = spec.w * 4;
    for (let y = 0; y < spec.h; y++) out.set(raw.subarray((spec.h - 1 - y) * row, (spec.h - y) * row), y * row);
    return out;
  } finally {
    for (const h of hidden) h.visible = true;
  }
}

export interface Picture {
  cut: CutResult;
  /** The baked PNG (half the render size). */
  png: Blob;
  /** Hash of its pixels (the bake rewrites a file only when this changes). */
  pixels: string;
}

const canvas2d = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // Read back on purpose: a CPU canvas, which also keeps the scaling the same on every run.
  return { c, g: c.getContext('2d', { willReadFrequently: true })! };
};

/** Die-cuts a render, halves it with high-quality smoothing and encodes the PNG. */
export async function bakePicture(art: Uint8Array, spec: CutSpec): Promise<Picture> {
  const cut = dieCut(art, spec);
  const big = canvas2d(spec.w, spec.h);
  big.g.putImageData(new ImageData(cut.rgba, spec.w, spec.h), 0, 0);
  const small = canvas2d(spec.outW, spec.outH);
  small.g.imageSmoothingEnabled = true;
  small.g.imageSmoothingQuality = 'high';
  small.g.drawImage(big.c, 0, 0, spec.outW, spec.outH);
  const pixels = pixelHash(small.g.getImageData(0, 0, spec.outW, spec.outH).data);
  const png = await new Promise<Blob>((resolve, reject) => small.c.toBlob((b) => (b ? resolve(b) : reject(new Error('o PNG não foi gerado'))), 'image/png'));
  return { cut, png, pixels };
}

/** A 64-bit hash of RGBA bytes (two 32-bit lanes), as 16 hex digits. */
export function pixelHash(data: Uint8ClampedArray): string {
  const words = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >>> 2);
  let h1 = 0xdeadbeef ^ words.length;
  let h2 = 0x41c6ce57 ^ words.length;
  for (let i = 0; i < words.length; i++) {
    const k = words[i];
    h1 = Math.imul(h1 ^ k, 2654435761);
    h2 = Math.imul(h2 ^ k, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

// --- Teardown --------------------------------------------------------------------------------------------------

/**
 * Frees everything a subject's scene reached: geometries, materials, their textures, skeletons, instanced
 * buffers, and the renderer's render lists. Shared caches (toon materials, surface textures, the characters'
 * geometry) are freed too and uploaded again when the next subject draws them.
 */
export function teardown(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  const instanced: THREE.InstancedMesh[] = [];
  const texturesOf = (m: THREE.Material) => {
    for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) textures.add(v as THREE.Texture);
    const uniforms = (m as THREE.ShaderMaterial).uniforms;
    if (uniforms) for (const u of Object.values(uniforms)) if (u?.value && (u.value as THREE.Texture).isTexture) textures.add(u.value as THREE.Texture);
  };
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mat = mesh.material;
    if (mat) for (const m of Array.isArray(mat) ? mat : [mat]) materials.add(m);
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((o as THREE.SkinnedMesh).skeleton);
    if ((o as THREE.InstancedMesh).isInstancedMesh) instanced.push(o as THREE.InstancedMesh);
  });
  for (const m of materials) texturesOf(m);
  scene.clear();
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  for (const t of textures) t.dispose();
  for (const s of skeletons) s.dispose();
  for (const i of instanced) i.dispose();
  studioRenderer().renderLists.dispose();
}
