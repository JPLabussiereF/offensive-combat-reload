// The character editor's card pictures (PF-33). A card shows the piece, not the player's character (rules.ts): the
// piece built alone on the skeleton (Character `bodyless`), standing still, framed by its own box, on a transparent
// background; tattoos and gloves on a clay mannequin; hair, beards and the face's features on a clay head (the body
// with everything below the neck hidden). The PCD tab's cards are the player's character with each loss.
//
// Drawn into a render target of the big stage's renderer (no WebGL context of its own), at twice the size and scaled
// down, read back and kept as WebP: in IndexedDB (client/ui/customize/cardStore.ts) for the pictures that are the
// same for everyone, once per version of the game; in memory for the worn piece in its chosen colors and the PCD
// cards. One picture at a time, in the page's spare moments (requestIdleCallback, the map editor's line:
// client/editor/thumbQueue.ts): the worn piece first, then the cards in view, the rest of the open tab, and every
// other card of the catalog in the background. Held while a color is dragged (the stage gets the frames).
import * as THREE from 'three';
import { BEARDS, BROW_STYLES, DEFAULT_COLORS, DEFAULT_FACE, EAR_STYLES, EYE_STYLES, FACE_MARKS, FACE_SHAPES, HAIR_STYLES, MOUTH_STYLES, NOSE_STYLES, type Appearance, type Face } from '@shared/appearance';
import { CATALOG, catalogItem } from '@shared/catalog';
import type { Sex } from '@shared/protocol';
import { CharacterAnimator } from '../../character/animator';
import { Character, type CharacterConfig } from '../../character/character';
import type { RegionName } from '../../character/rig';
import { Avatar, itemColorKeys } from '../../entities/avatar';
import { ThumbQueue, type Schedule } from '../../editor/thumbQueue';
import { readAllCards, writeCard } from './cardStore';
import { setupScene } from './lights';
import { cardSignature, CLAY, shotOf, type Pic, type Shot } from './rules';

/** A card picture's side (px), drawn this many times bigger and scaled down. */
export const THUMB_PX = 144;
const SUPER = 2;
const N = THUMB_PX * SUPER;
const FOV = 24;

/** Items too small to read alone, shown on the clay head (slots or item ids). */
const ON_CLAY_HEAD = new Set<string>(['orelhas', 'piercings']);

/** Everything below the neck: hidden on the clay head. */
const BELOW_NECK: RegionName[] = ['chest', 'belly', 'pelvis', 'upperArm_L', 'forearm_L', 'hand_L', 'upperArm_R', 'forearm_R', 'hand_R', 'thigh_L', 'shin_L', 'ankle_L', 'foot_L', 'thigh_R', 'shin_R', 'ankle_R', 'foot_R'];

/** The page's spare moment (requestIdleCallback where there is one). */
const idle: Schedule = (run) => {
  const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(run, { timeout: 400 });
  else setTimeout(run, 30);
};

/** A neutral config: the clay body, default face and build, nothing worn. */
function clayConfig(sex: Sex): CharacterConfig {
  return {
    v: 1,
    sex,
    items: {},
    colors: { skin: CLAY, eyes: '#4a6fa5', hair: DEFAULT_COLORS.cabelo[0] },
    eyes: { style: 'redondo' },
    face: { ...DEFAULT_FACE },
    build: { height: 'medio', build: 'medio' },
    pcd: { braco: '', perna: '' },
  };
}

/** What's built for a picture, how it's framed and how it goes away. */
interface Built {
  root: THREE.Object3D;
  /** The box to frame (world). */
  frame: () => THREE.Box3;
  /** Turn of the model (radians: 0 faces the camera) and the camera's height angle. */
  yaw: number;
  pitch: number;
  /** A piece alone: its inside drawn dark (a hollow shirt doesn't show through). */
  inside: boolean;
  dispose(): void;
}

const tmpBox = new THREE.Box3();

/** The box of what these objects draw, with skinned meshes in their pose. */
function boxOf(objects: THREE.Object3D[], into = new THREE.Box3()): THREE.Box3 {
  for (const o of objects)
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        (mesh as THREE.SkinnedMesh).computeBoundingBox();
        tmpBox.copy((mesh as THREE.SkinnedMesh).boundingBox!);
      } else {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        tmpBox.copy(mesh.geometry.boundingBox!);
      }
      into.union(tmpBox.applyMatrix4(mesh.matrixWorld));
    });
  return into;
}

/** Around the head (the clay head's frame). */
function headBox(c: Character): THREE.Box3 {
  const p = c.bones.head.getWorldPosition(new THREE.Vector3());
  p.y += 0.1;
  return new THREE.Box3().setFromCenterAndSize(p, new THREE.Vector3(0.26, 0.32, 0.26));
}

function build(shot: Shot, sex: Sex, look: Appearance): Built {
  const pic = shot.pic;
  if ('pcd' in pic) {
    // The player's character with this loss (rifle put away), framed whole, the same for every card.
    const holder = new THREE.Group();
    const a = new Avatar(holder, { ...look, pcd: { ...pic.pcd } }, sex, { bake: false });
    a.idle(false);
    a.visible = true;
    return {
      root: holder,
      frame: () => new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.3), new THREE.Vector3(0.5, 1.95, 0.3)),
      yaw: 0.4,
      pitch: 0.06,
      inside: false,
      dispose: () => a.dispose(),
    };
  }
  const config = clayConfig(sex);
  let head = false;
  let slot: string | null = null;
  if ('face' in pic) {
    head = true;
    if (pic.face === 'olhosEstilo') config.eyes.style = pic.value as CharacterConfig['eyes']['style'];
    else config.face = { ...DEFAULT_FACE, [pic.face]: pic.value } as Face;
  } else {
    const it = catalogItem(pic.item)!;
    if (it.category === 'cabelo' || it.category === 'barba') {
      head = true;
      slot = it.category === 'cabelo' ? 'hair' : 'beard';
      config.items[slot as 'hair'] = it.id;
      config.colors.hair = shot.colors[0] ?? config.colors.hair;
    } else {
      slot = it.slots[0];
      config.items[it.slots[0]] = it.id;
      Object.assign(config.colors, itemColorKeys(it.slots[0], it.id, shot.colors));
      // Tattoos and gloves read on a body (the clay mannequin), earrings and piercings on the clay head (alone they're
      // a few dots); everything else alone.
      head = ON_CLAY_HEAD.has(slot) || ON_CLAY_HEAD.has(it.id);
      config.bodyless = !head && slot !== 'pele' && slot !== 'maos';
    }
  }
  const c = new Character(config);
  new CharacterAnimator(c).idle(0);
  if (head) c.hideBody(BELOW_NECK);
  const piece = slot ? c.objectsOf(slot as 'hair') : [];
  const back = slot === 'costas';
  const low = slot === 'calcado' || slot === 'pes';
  return {
    root: c.root,
    frame: () => (head ? boxOf(piece, headBox(c)) : boxOf(piece)),
    // A backpack from behind; shoes from above; the face more from the front.
    yaw: back ? Math.PI + 0.45 : 'face' in pic ? 0.28 : 0.45,
    pitch: low ? 0.5 : head ? 0.1 : 0.22,
    inside: !!config.bodyless,
    dispose: () => c.dispose(),
  };
}

/** Draws pictures into a render target of the stage's renderer and reads them back as WebP. */
class CardShooter {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 40);
  private target = new THREE.WebGLRenderTarget(N, N, { colorSpace: THREE.SRGBColorSpace, depthBuffer: true });
  private pixels = new Uint8Array(N * N * 4);
  private big = document.createElement('canvas');
  private small = document.createElement('canvas');
  private clear = new THREE.Color();
  /** The inside of a piece alone: dark, unlit. */
  private inside = new THREE.MeshBasicMaterial({ color: 0x2b2731, side: THREE.BackSide });

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    setupScene(this.scene);
    this.big.width = this.big.height = N;
    this.small.width = this.small.height = THUMB_PX;
  }

  async shoot(shot: Shot, sex: Sex, look: Appearance): Promise<Blob | null> {
    const b = build(shot, sex, look);
    try {
      b.root.rotation.y = b.yaw;
      this.scene.add(b.root);
      b.root.updateMatrixWorld(true);
      const box = b.frame();
      if (box.isEmpty()) return null;
      this.draw(box, b.pitch, b.inside);
    } finally {
      b.root.removeFromParent();
      b.dispose();
    }
    return this.encode();
  }

  private draw(box: THREE.Box3, pitch: number, inside: boolean) {
    // Framed by what the camera sees of the box (its width, and its height and depth seen from above), so thin pieces
    // (glasses, belts) fill the card like the big ones.
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const half = Math.max(0.035, (Math.max(size.x, size.y * Math.cos(pitch) + size.z * Math.sin(pitch)) / 2) * 1.12);
    const r = size.length() / 2;
    const dist = half / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) + size.z / 2;
    const cam = this.camera;
    cam.position.copy(center).add(new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch)).multiplyScalar(dist));
    cam.near = Math.max(0.01, dist - r * 1.6);
    cam.far = dist + r * 1.6;
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const gl = this.renderer;
    const before = { target: gl.getRenderTarget(), alpha: gl.getClearAlpha(), auto: gl.autoClear };
    gl.getClearColor(this.clear);
    try {
      gl.setRenderTarget(this.target);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.autoClear = false;
      if (inside) {
        // The back faces first, dark: what shows through the neck or the sleeves is the inside.
        this.scene.overrideMaterial = this.inside;
        gl.render(this.scene, cam);
        this.scene.overrideMaterial = null;
      }
      gl.render(this.scene, cam);
      gl.readRenderTargetPixels(this.target, 0, 0, N, N, this.pixels);
    } finally {
      this.scene.overrideMaterial = null;
      gl.autoClear = before.auto;
      gl.setRenderTarget(before.target);
      gl.setClearColor(this.clear, before.alpha);
    }
  }

  /** The pixels read back as a WebP (bottom-up and premultiplied by WebGL); null when nothing was drawn. */
  private encode(): Promise<Blob | null> {
    const big = this.big.getContext('2d')!;
    const img = big.createImageData(N, N);
    const src = this.pixels;
    const out = img.data;
    let any = false;
    for (let y = 0; y < N; y++) {
      const from = (N - 1 - y) * N * 4;
      const to = y * N * 4;
      for (let x = 0; x < N * 4; x += 4) {
        const a = src[from + x + 3];
        if (a) any = true;
        const k = a > 0 && a < 255 ? 255 / a : 1;
        out[to + x] = Math.min(255, src[from + x] * k);
        out[to + x + 1] = Math.min(255, src[from + x + 1] * k);
        out[to + x + 2] = Math.min(255, src[from + x + 2] * k);
        out[to + x + 3] = a;
      }
    }
    if (!any) return Promise.resolve(null);
    big.putImageData(img, 0, 0);
    const small = this.small.getContext('2d')!;
    small.clearRect(0, 0, THUMB_PX, THUMB_PX);
    small.imageSmoothingEnabled = true;
    small.imageSmoothingQuality = 'high';
    small.drawImage(this.big, 0, 0, THUMB_PX, THUMB_PX);
    return new Promise((resolve) => this.small.toBlob((blob) => resolve(blob), 'image/webp', 0.9));
  }

  dispose() {
    this.target.dispose();
    this.inside.dispose();
  }
}

/** Every card picture that's the same for everyone (the background fill), for a body. */
export function catalogPics(): Pic[] {
  const face = (feature: keyof Face, values: readonly string[]): Pic[] => values.filter((v) => v !== 'nenhuma').map((value) => ({ face: feature, value }));
  return [
    ...CATALOG.filter((i) => i.ready && i.id !== 'descalco' && i.category !== 'cabelo' && i.category !== 'barba').map((i): Pic => ({ item: i.id })),
    ...HAIR_STYLES.map((id): Pic => ({ item: id })),
    ...BEARDS.filter(Boolean).map((id): Pic => ({ item: id })),
    ...EYE_STYLES.map((value): Pic => ({ face: 'olhosEstilo', value })),
    ...face('formato', FACE_SHAPES),
    ...face('sobrancelhas', BROW_STYLES),
    ...face('nariz', NOSE_STYLES),
    ...face('boca', MOUTH_STYLES),
    ...face('orelhas', EAR_STYLES),
    ...face('marcas', FACE_MARKS),
  ];
}

/** Pictures the same for everyone this page already has (from IndexedDB or drawn): kept across editor visits. */
const kept = new Map<string, { sig: string; url: string | null }>();
let preloaded: Promise<void> | null = null;
/** Reads every kept picture once per page (one IndexedDB transaction). */
const preload = () =>
  (preloaded ??= readAllCards().then((all) => {
    for (const [key, rec] of all) if (!kept.has(key)) kept.set(key, { sig: rec.sig, url: rec.blob ? URL.createObjectURL(rec.blob) : null });
  }));

/** Priorities on the line: the worn piece (and PCD cards), the cards in view, the open tab, the background. */
const P_MEMORY = 3;
const P_VIEW = 2;
const P_TAB = 1;

export class ItemThumbs {
  private shooter: CardShooter;
  private queue: ThumbQueue<string>;
  private sig = cardSignature();
  /** What each key draws (and the look it was asked with: the PCD cards). */
  private shots = new Map<string, { shot: Shot; look: Appearance }>();
  /** Pictures drawn for this editor only (the worn piece in its colors, the PCD cards). */
  private memory = new Map<string, string | null>();
  /** The worn piece's picture by item (the one of older colors goes). */
  private wornKey = new Map<string, string>();
  private ready = false;
  /** Asked before the kept pictures were read. */
  private early = new Map<string, number>();
  private io: IntersectionObserver;
  private disposed = false;
  /** Pictures read from the cache and drawn now (the measures). */
  fromCache = 0;
  drawn = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly sex: Sex,
    /** The scrolling list the cards are in (what's in view of it goes first). */
    private readonly content: HTMLElement,
  ) {
    this.shooter = new CardShooter(renderer);
    this.queue = new ThumbQueue((k) => this.draw(k), idle);
    this.queue.onDone = (k, ok) => {
      if (!ok) {
        console.warn(`[personagem] miniatura ${k} não foi desenhada`);
        this.show(k);
      }
    };
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = (e.target as HTMLElement).dataset.shot;
          if (e.isIntersecting && key && !this.has(key)) this.want(key, P_VIEW);
        }
      },
      { root: content, rootMargin: '120px 0px' },
    );
    void preload().then(() => {
      if (this.disposed) return;
      this.ready = true;
      for (const [k, p] of this.early) this.want(k, p);
      this.early.clear();
    });
  }

  /** A card's picture: now if it's at hand, else once drawn (the image waits with its key). */
  card(img: HTMLImageElement, pic: Pic, look: Appearance) {
    const shot = shotOf(pic, look, this.sex);
    if (!shot) return;
    img.dataset.shot = shot.key;
    const url = this.url(shot.key);
    if (url !== undefined) return this.paint(img, url);
    if (!this.shots.has(shot.key)) this.shots.set(shot.key, { shot, look: structuredClone(look) });
    this.want(shot.key, shot.persist ? P_TAB : P_MEMORY);
    this.io.observe(img);
  }

  /** Every other card of the catalog, drawn in the background (after an update of the game, once). */
  background(look: Appearance) {
    // In the catalog's colors, whatever is worn: a look wearing nothing of the catalog.
    const none: Appearance = { ...look, itens: {}, barba: '', cabelo: { id: '', cor: look.cabelo.cor } };
    for (const pic of catalogPics()) {
      const shot = shotOf(pic, none, this.sex);
      if (!shot?.persist || this.has(shot.key)) continue;
      if (!this.shots.has(shot.key)) this.shots.set(shot.key, { shot, look: none });
      this.want(shot.key, 0);
    }
  }

  /** Another tab or search: what was asked for the old one waits like the background; the new cards are watched. */
  newTab() {
    this.queue.lower(0);
    this.io.disconnect();
  }

  /** Holds the drawing (a color being dragged: the stage gets the frames) or lets it go on. */
  hold(on: boolean) {
    this.queue.hold(on);
  }

  private has(key: string) {
    return this.url(key) !== undefined || this.queue.done.has(key);
  }

  /** The picture's URL (null: nothing to see), or undefined when there's none yet. */
  private url(key: string): string | null | undefined {
    if (this.memory.has(key)) return this.memory.get(key)!;
    const k = kept.get(key);
    return k && k.sig === this.sig ? k.url : undefined;
  }

  private want(key: string, priority: number) {
    if (this.disposed) return;
    const s = this.shots.get(key);
    if (s?.shot.persist && !this.ready) {
      this.early.set(key, Math.max(priority, this.early.get(key) ?? -1));
      return;
    }
    if (this.url(key) !== undefined) {
      if (s?.shot.persist) this.fromCache++;
      return this.show(key);
    }
    this.queue.request(key, priority);
  }

  private async draw(key: string) {
    const s = this.shots.get(key);
    if (!s || this.disposed) return;
    const blob = await this.shooter.shoot(s.shot, this.sex, s.look);
    if (this.disposed) return;
    const url = blob ? URL.createObjectURL(blob) : null;
    this.drawn++;
    if (s.shot.persist) {
      const old = kept.get(key);
      if (old?.url) URL.revokeObjectURL(old.url);
      kept.set(key, { sig: this.sig, url });
      void writeCard(key, { sig: this.sig, blob, em: Date.now() });
    } else {
      this.memory.set(key, url);
      const pic = s.shot.pic;
      if ('item' in pic) {
        const prev = this.wornKey.get(pic.item);
        if (prev && prev !== key) this.forget(prev);
        this.wornKey.set(pic.item, key);
      }
    }
    this.show(key);
  }

  private forget(key: string) {
    const u = this.memory.get(key);
    if (u) URL.revokeObjectURL(u);
    this.memory.delete(key);
    this.queue.done.delete(key);
    this.shots.delete(key);
  }

  /** The picture to every card waiting with its key. */
  private show(key: string) {
    const url = this.url(key);
    for (const img of this.content.querySelectorAll<HTMLImageElement>(`img[data-shot="${CSS.escape(key)}"]`)) this.paint(img, url ?? null);
  }

  private paint(img: HTMLImageElement, url: string | null) {
    this.io.unobserve(img);
    if (url) img.src = url;
    // Nothing to see, or it failed: the card's spare icon.
    else img.closest('.cz-thumb')?.classList.add('cz-thumb-empty');
  }

  dispose() {
    this.disposed = true;
    this.queue.clear();
    this.queue.hold(true);
    this.io.disconnect();
    for (const u of this.memory.values()) if (u) URL.revokeObjectURL(u);
    this.memory.clear();
    this.shooter.dispose();
  }
}
