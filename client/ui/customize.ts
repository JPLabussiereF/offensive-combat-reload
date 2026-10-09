// Character editor (Perfil → Personalizar), in the spirit of The Sims' Create-a-Sim: a big 3D stage that
// zooms to the part being edited, category tabs over the whole catalog (shared/catalog.ts), a search box,
// a card for every option and the colors of what is worn. Shows what the look does in the game (health, hitbox,
// reload, speed) as you choose.
//
// Light (PF-33): the cards show the piece, not the character (client/ui/customize/rules.ts), drawn once per version
// of the game into a render target of the stage's renderer and kept in the browser (client/ui/customize/itemThumbs.ts);
// only the PCD tab shows the character on its cards. Height and build are a line-up wall in SVG
// (client/ui/customize/lineup.ts). Clothes, accessories and tactical gear take any color in the game's own picker
// (client/ui/colorPicker.ts); skin, hair and eyes stay on the palette. The stage draws only when something changes and
// takes a color by uniform while it's dragged. showCustomizer gives back a handle whose dispose() frees the stage
// and the cards (profile.ts, home.ts and management.ts call it before changing their content), and tells who listens
// (the warehouse pauses while it's open: onCustomizerChange).
import * as THREE from 'three';
import {
  ARM_LOSSES,
  BEARDS,
  defaultAppearance,
  EYE_COLORS,
  EYE_STYLES,
  BROW_STYLES,
  EAR_STYLES,
  FACE_MARKS,
  FACE_SHAPES,
  MOUTH_STYLES,
  NOSE_STYLES,
  sanitizeFace,
  type Face,
  HAIR_COLORS,
  HAIR_STYLES,
  itemIn,
  LEG_LOSSES,
  SKIN_COLORS,
  bodyStats,
  randomAppearance,
  hitboxSize,
  wear,
  type Appearance,
  type Build,
  type Height,
} from '@shared/appearance';
import { catalogItem, catalogOf, CATALOG, type CatalogItem, type Category, type Slot } from '@shared/catalog';
import type { Sex } from '@shared/protocol';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { Avatar, appearanceToConfig, colorKey, disposeAvatar } from '../entities/avatar';
import { api } from '../net/api';
import { errorText } from './auth';
import { ColorPicker } from './colorPicker';
import { ItemThumbs } from './customize/itemThumbs';
import { setupScene } from './customize/lights';
import { lineupHtml } from './customize/lineup';
import type { Pic } from './customize/rules';
import { getLang } from './strings';

export { setupScene };

/** Labels in pt-BR and en (the editor has many; they live here instead of strings.ts). */
const L: Record<string, [string, string]> = {
  title: ['Personalizar personagem', 'Customize character'],
  tabBody: ['Corpo', 'Body'],
  tabHair: ['Rosto e cabelo', 'Face & hair'],
  tabTop: ['Parte de cima', 'Tops'],
  tabBottom: ['Parte de baixo', 'Bottoms'],
  tabShoes: ['Calçados', 'Shoes'],
  tabHead: ['Cabeça', 'Headwear'],
  tabAcc: ['Acessórios', 'Accessories'],
  tabTactical: ['Tático', 'Tactical'],
  tabPcd: ['Modo PCD', 'PCD mode'],
  search: ['Buscar peça…', 'Search items…'],
  results: ['Resultados', 'Results'],
  noResults: ['Nada encontrado.', 'Nothing found.'],
  soon: ['As peças desta categoria chegam nas próximas atualizações.', 'Items in this category arrive in the next updates.'],
  height: ['Altura', 'Height'],
  build: ['Biotipo', 'Build'],
  wallNote: ['Só visual: hitbox e mira iguais para todos', 'Looks only: same hitbox and aim for everyone'],
  skin: ['Cor da pele', 'Skin color'],
  hairStyle: ['Cabelo', 'Hair'],
  hairColor: ['Cor do cabelo e da barba', 'Hair & beard color'],
  beard: ['Barba', 'Facial hair'],
  eyeColor: ['Cor dos olhos', 'Eye color'],
  eyeStyle: ['Olhos', 'Eyes'],
  redondo: ['Redondos', 'Round'],
  amendoado: ['Amendoados', 'Almond'],
  marcante: ['Marcantes', 'Sharp'],
  caido: ['Caídos', 'Downturned'],
  puxado: ['Puxados', 'Upturned'],
  grande: ['Grandes', 'Big'],
  // The face (keys prefixed: some values repeat across features).
  faceShape: ['Formato do rosto', 'Face shape'],
  'formato.oval': ['Oval', 'Oval'],
  'formato.quadrado': ['Quadrado', 'Square'],
  'formato.redondo': ['Redondo', 'Round'],
  'formato.longo': ['Fino e longo', 'Long'],
  'formato.coracao': ['Coração', 'Heart'],
  brows: ['Sobrancelhas', 'Brows'],
  'sobrancelhas.reta': ['Retas', 'Straight'],
  'sobrancelhas.arqueada': ['Arqueadas', 'Arched'],
  'sobrancelhas.grossa': ['Grossas', 'Thick'],
  'sobrancelhas.fina': ['Finas', 'Thin'],
  nose: ['Nariz', 'Nose'],
  'nariz.reto': ['Reto', 'Straight'],
  'nariz.largo': ['Largo', 'Wide'],
  'nariz.aquilino': ['Aquilino', 'Aquiline'],
  'nariz.arrebitado': ['Arrebitado', 'Upturned'],
  mouth: ['Boca', 'Mouth'],
  'boca.media': ['Média', 'Medium'],
  'boca.fina': ['Lábios finos', 'Thin lips'],
  'boca.carnuda': ['Lábios carnudos', 'Full lips'],
  ears: ['Orelhas', 'Ears'],
  'orelhas.normal': ['Normais', 'Normal'],
  'orelhas.pequena': ['Pequenas', 'Small'],
  'orelhas.abano': ['De abano', 'Protruding'],
  marks: ['Marcas', 'Marks'],
  'marcas.nenhuma': ['Nenhuma', 'None'],
  'marcas.sardas': ['Sardas', 'Freckles'],
  'marcas.cicatriz': ['Cicatriz', 'Scar'],
  'marcas.pinta': ['Pinta', 'Beauty mark'],
  animIdle: ['Parado', 'Idle'],
  animWalk: ['Andar', 'Walk'],
  animRun: ['Correr', 'Run'],
  animDance: ['Dançar', 'Dance'],
  animAim: ['Mirar', 'Aim'],
  random: ['Aleatório', 'Random'],
  copyJson: ['Copiar JSON', 'Copy JSON'],
  copied: ['Configuração copiada (JSON).', 'Config copied (JSON).'],
  exportGlb: ['Exportar GLB', 'Export GLB'],
  exported: ['Modelo exportado (personagem.glb).', 'Model exported (personagem.glb).'],
  colors: ['Cores', 'Colors'],
  P: ['Principal', 'Main'],
  S: ['Secundária', 'Secondary'],
  D: ['Detalhe', 'Detail'],
  arm: ['Braço ou mão', 'Arm or hand'],
  leg: ['Perna', 'Leg'],
  pcdHint: [
    'Personagem sem um braço, uma mão ou uma perna. A hitbox fica menor; sem mão ou braço recarrega 30% mais devagar, sem perna anda 25% mais devagar. Aparece também nas mãos em primeira pessoa.',
    'A character missing an arm, a hand or a leg. Smaller hitbox; no hand or arm reloads 30% slower, no leg moves 25% slower. Also shown on the first-person hands.',
  ],
  save: ['SALVAR', 'SAVE'],
  cancel: ['Cancelar', 'Cancel'],
  reset: ['Restaurar padrão', 'Reset to default'],
  saved: ['Personagem salvo.', 'Character saved.'],
  effects: ['No jogo', 'In the game'],
  health: ['Vida', 'Health'],
  reload: ['Recarga', 'Reload'],
  speed: ['Velocidade', 'Speed'],
  hitbox: ['Hitbox', 'Hitbox'],
  dragHint: ['Arraste para girar · role para aproximar', 'Drag to rotate · scroll to zoom'],
  none: ['Nenhum', 'None'],
  pequeno: ['Pequeno', 'Short'],
  medio: ['Médio', 'Medium'],
  alto: ['Alto', 'Tall'],
  magro: ['Magro', 'Slim'],
  gordo: ['Gordo', 'Heavy'],
  complete: ['Completo', 'Full'],
  bracoEsq: ['Sem braço esq.', 'No left arm'],
  bracoDir: ['Sem braço dir.', 'No right arm'],
  maoEsq: ['Sem mão esq.', 'No left hand'],
  maoDir: ['Sem mão dir.', 'No right hand'],
  pernaEsq: ['Sem perna esq.', 'No left leg'],
  pernaDir: ['Sem perna dir.', 'No right leg'],
  // Groups of the catalog.
  camiseta: ['Camisetas e regatas', 'Tees & tanks'],
  blusa: ['Blusas e moletons', 'Sweaters & hoodies'],
  jaqueta: ['Jaquetas e casacos (por cima)', 'Jackets & coats (over)'],
  calca: ['Calças', 'Pants'],
  short: ['Shorts e bermudas', 'Shorts'],
  saia: ['Saias', 'Skirts'],
  calcado: ['Calçados', 'Shoes'],
  // Slots.
  tronco: ['Parte de cima', 'Top'],
  sobreposicao: ['Jaqueta', 'Jacket'],
  baixo: ['Parte de baixo', 'Bottoms'],
  cabeca: ['Cabeça', 'Head'],
  rosto: ['Rosto', 'Face'],
  orelhas: ['Orelhas', 'Ears'],
  pescoco: ['Pescoço', 'Neck'],
  pulsoE: ['Pulso esquerdo', 'Left wrist'],
  pulsoD: ['Pulso direito', 'Right wrist'],
  maos: ['Mãos', 'Hands'],
  antebraco: ['Antebraço', 'Forearm'],
  cotovelos: ['Cotovelos', 'Elbows'],
  ombro: ['Ombro', 'Shoulder'],
  ombros: ['Ombros', 'Shoulders'],
  colete: ['Colete', 'Vest'],
  acessorioColete: ['No colete', 'On the vest'],
  peito: ['Peito', 'Chest'],
  costas: ['Costas', 'Back'],
  cintura: ['Cintura', 'Waist'],
  coxaE: ['Coxa esquerda', 'Left thigh'],
  coxaD: ['Coxa direita', 'Right thigh'],
  joelhos: ['Joelhos', 'Knees'],
  pes: ['Pés', 'Feet'],
  pele: ['Pele', 'Skin'],
};
const l = (key: string) => (L[key] ?? [key, key])[getLang() === 'en' ? 1 : 0];
const lang = (): 'pt' | 'en' => (getLang() === 'en' ? 'en' : 'pt');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const clone = (a: Appearance): Appearance => JSON.parse(JSON.stringify(a));

// --- Camera framing per part of the body ---------------------------------------------------------------

type Focus = 'full' | 'head' | 'torso' | 'legs' | 'feet';
/** Look-at height and distance, for an average body (scaled by the character's height). */
const FRAMES: Record<Focus, { y: number; dist: number }> = {
  full: { y: 0.95, dist: 5.4 },
  head: { y: 1.62, dist: 1.7 },
  torso: { y: 1.22, dist: 2.7 },
  legs: { y: 0.55, dist: 3.0 },
  feet: { y: 0.12, dist: 1.6 },
};

/** The stage's pixel ratio at most (a big canvas on a phone or a HiDPI screen costs too many pixels). */
const MAX_DPR = 1.5;

/**
 * What the look does in the game, in one line. Height, build and clothes are only looks (same health, eye
 * and hitbox for everyone); only the PCD mode changes the hitbox, the reload and the speed.
 */
function effectsText(a: Appearance): string {
  const b = bodyStats(a);
  const parts = [`${l('health')} ${b.maxHealth}`, `${l('hitbox')} ${Math.round(hitboxSize(b) * 100)}%`];
  if (b.reloadMul !== 1) parts.push(`${l('reload')} +${Math.round((b.reloadMul - 1) * 100)}%`);
  if (b.speedMul !== 1) parts.push(`${l('speed')} −${Math.round((1 - b.speedMul) * 100)}%`);
  return parts.join(' · ');
}

type Anim = 'idle' | 'walk' | 'run' | 'dance' | 'aim';
const ANIMS: [Anim, string][] = [
  ['idle', 'animIdle'],
  ['walk', 'animWalk'],
  ['run', 'animRun'],
  ['dance', 'animDance'],
  ['aim', 'animAim'],
];

/**
 * The big stage: the character, the camera gliding to the part being edited. In the editor it draws only when
 * something changes (a drag, a change, the camera gliding, an animation other than Idle); `spin` (the classic home's
 * character card) turns it slowly and draws while it's on screen. Never drawn while off screen or in a hidden page.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  private floor: THREE.Mesh;
  private avatar: Avatar | null = null;
  /** The look on stage without its colors, and its colors (a color change doesn't rebuild the character). */
  private shape = '';
  private colors: Record<string, string> = {};
  private scale = 1;
  private yaw = 0.35;
  private zoom = 1;
  private focusName: Focus = 'full';
  private camY = FRAMES.full.y;
  private camDist = FRAMES.full.dist;
  private dragging = false;
  private lastX = 0;
  private raf = 0;
  private last = 0;
  private anim: Anim = 'idle';
  private t = 0;
  private readonly spin: boolean;
  private onScreen = true;
  private disposed = false;
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private onVis = () => this.kick();
  /** Frames drawn (the measures). */
  frames = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { wheelZoom?: boolean; spin?: boolean } = {},
  ) {
    this.spin = !!opts.spin;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(MAX_DPR, devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    setupScene(this.scene);
    // A round floor under the feet.
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: 0x9fc6ea, transparent: true, opacity: 0.6 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
    canvas.onpointerdown = (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
      this.kick();
    };
    canvas.onpointermove = (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * 0.012;
      this.lastX = e.clientX;
      this.invalidate();
    };
    canvas.onpointerup = canvas.onpointercancel = () => (this.dragging = false);
    if (opts.wheelZoom !== false)
      canvas.onwheel = (e) => {
        e.preventDefault();
        this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.5, 1.8);
        this.kick();
      };
    // Off screen (scrolled away, a hidden tab of the home, a warehouse surface turned away): no frames.
    this.io = new IntersectionObserver((entries) => {
      this.onScreen = entries[entries.length - 1].isIntersecting;
      if (this.onScreen) this.invalidate();
    });
    this.io.observe(canvas);
    this.ro = new ResizeObserver(() => this.invalidate());
    this.ro.observe(canvas);
    document.addEventListener('visibilitychange', this.onVis);
  }

  /** Something changed: one more frame. */
  invalidate() {
    this.kick();
  }

  /** Starts the frames if there's anything to draw and anyone to see it. */
  private kick() {
    if (this.raf || this.disposed || !this.onScreen || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  /** The camera is still gliding toward its framing. */
  private gliding() {
    const target = FRAMES[this.focusName];
    return Math.abs(target.y * this.scale - this.camY) > 0.002 || Math.abs(target.dist * this.zoom - this.camDist) > 0.002;
  }

  private frame(now: number) {
    this.raf = 0;
    if (this.disposed || !this.onScreen || document.hidden) return;
    const dt = Math.min(0.1, Math.max(0, now - this.last) / 1000);
    this.last = now;
    const moving = this.spin || this.anim !== 'idle';
    if (this.spin && !this.dragging) this.yaw += dt * 0.35;
    if (moving) this.animate(dt);
    this.draw(dt);
    if (moving || this.dragging || this.gliding()) {
      this.raf = requestAnimationFrame((n) => this.frame(n));
    }
  }

  /**
   * The look on stage: rebuilt when a piece, the body or the face changes; a change of colors only goes to the
   * character's tints (uniforms, no rebuild).
   */
  show(look: Appearance, sex: Sex) {
    const { colors, ...shape } = appearanceToConfig(look, sex);
    const key = JSON.stringify(shape);
    const sameKeys = Object.keys(colors).sort().join() === Object.keys(this.colors).sort().join();
    if (this.avatar && key === this.shape && sameKeys) {
      for (const [k, v] of Object.entries(colors)) if (this.colors[k] !== v) this.avatar.character.setColor(k, v);
      this.colors = { ...colors };
      return this.invalidate();
    }
    if (this.avatar) disposeAvatar(this.avatar);
    // Live (not baked): colors change by uniform.
    this.avatar = new Avatar(this.scene, look, sex, { bake: false });
    this.avatar.visible = true;
    this.shape = key;
    this.colors = { ...colors };
    this.scale = bodyStats(look).visualScale;
    this.t = 0;
    this.animate(0);
    this.invalidate();
  }

  /** A color while it's dragged (a channel key of the character: 'tronco', 'tronco.secondary'…): a uniform, no rebuild. */
  setColor(channel: string, hex: string) {
    if (!this.avatar || this.disposed || this.colors[channel] === hex) return;
    this.avatar.character.setColor(channel, hex);
    this.colors[channel] = hex;
    this.invalidate();
  }

  play(a: Anim) {
    this.anim = a;
    this.t = 0;
    this.animate(0);
    this.invalidate();
  }

  private animate(dt: number) {
    const a = this.avatar;
    if (!a) return;
    this.t += dt;
    if (this.anim === 'walk') a.walk(dt, 3);
    else if (this.anim === 'run') a.walk(dt, 7);
    else if (this.anim === 'dance') a.dance(this.t % 3.6);
    else if (this.anim === 'aim') a.pose(dt, { speed: 0, crouch: false, pitch: 0, ads: true, reload: false, knife: false, cook: false });
    // Standing still: breathing only where it turns all the time (the home's card).
    else a.idle(false, this.spin ? this.t : 0);
  }

  focus(f: Focus) {
    this.focusName = f;
    this.zoom = 1;
    this.kick();
  }

  private draw(dt: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    // Glide toward the framing of the current part.
    const target = FRAMES[this.focusName];
    const k = 1 - Math.exp(-dt * 6);
    this.camY += (target.y * this.scale - this.camY) * k;
    this.camDist += (target.dist * this.zoom - this.camDist) * k;
    this.camera.position.set(0, this.camY + 0.08, -this.camDist);
    this.camera.lookAt(0, this.camY, 0);
    if (this.avatar) this.avatar.root.rotation.y = this.yaw;
    this.renderer.render(this.scene, this.camera);
    this.frames++;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    if (this.avatar) disposeAvatar(this.avatar);
    this.avatar = null;
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/**
 * A head-and-shoulders picture of the character (the home's account chip), as a data URL: drawn once by a renderer
 * of its own that's freed right after.
 */
export function renderPortrait(look: Appearance, sex: Sex): Promise<string> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(150, 150, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      setupScene(scene);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
      const a = new Avatar(scene, look, sex, { bake: false });
      a.idle(false);
      a.visible = true;
      a.root.rotation.y = 0.25;
      const fr = FRAMES.head;
      const y = fr.y * bodyStats(look).visualScale;
      camera.position.set(0, y + 0.06, -fr.dist * 0.85);
      camera.lookAt(0, y, 0);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      disposeAvatar(a);
      renderer.dispose();
      renderer.forceContextLoss();
      resolve(url);
    }),
  );
}

// --- Editor -------------------------------------------------------------------------------------------------

type Tab = 'body' | 'hair' | 'top' | 'bottom' | 'shoes' | 'head' | 'acc' | 'tactical' | 'pcd';
const TABS: { id: Tab; icon: string; label: string; focus: Focus }[] = [
  { id: 'body', icon: '🧍', label: 'tabBody', focus: 'full' },
  { id: 'hair', icon: '💇', label: 'tabHair', focus: 'head' },
  { id: 'top', icon: '👕', label: 'tabTop', focus: 'torso' },
  { id: 'bottom', icon: '👖', label: 'tabBottom', focus: 'legs' },
  { id: 'shoes', icon: '👟', label: 'tabShoes', focus: 'feet' },
  { id: 'head', icon: '🧢', label: 'tabHead', focus: 'head' },
  { id: 'acc', icon: '🕶️', label: 'tabAcc', focus: 'head' },
  { id: 'tactical', icon: '🎖️', label: 'tabTactical', focus: 'torso' },
  { id: 'pcd', icon: '♿', label: 'tabPcd', focus: 'full' },
];

/** Where the camera goes to show an item of a slot. */
const SLOT_FOCUS: Partial<Record<Slot, Focus>> = {
  tronco: 'torso',
  sobreposicao: 'torso',
  baixo: 'legs',
  calcado: 'feet',
  cabeca: 'head',
  rosto: 'head',
  orelhas: 'head',
  pescoco: 'head',
  cintura: 'legs',
  coxaE: 'legs',
  coxaD: 'legs',
  joelhos: 'legs',
  pes: 'feet',
};
const focusOf = (slot: Slot): Focus => SLOT_FOCUS[slot] ?? 'torso';

/** A card: its label, what its picture shows (rules.ts Pic), and what choosing it does. */
interface CardOption {
  value: string;
  label: string;
  pic: (a: Appearance) => Pic;
  apply: (a: Appearance) => void;
  selected: (a: Appearance) => boolean;
}

/** One group of cards. */
interface CardGroup {
  kind: 'cards';
  title: string;
  options: CardOption[];
  focus: Focus;
}

/** Palette swatches (skin, hair, eyes: the style guide's tones). */
interface PaletteGroup {
  kind: 'palette';
  title: string;
  colors: readonly string[];
  get: (a: Appearance) => string;
  set: (a: Appearance, c: string) => void;
}

/** The colors of the piece worn in a slot: one chip per channel, each opening the color picker. */
interface ChipsGroup {
  kind: 'chips';
  slot: Slot;
}

/** The height or build line-up wall (the Body tab). */
interface WallGroup {
  kind: 'wall';
  which: 'height' | 'build';
  title: string;
}

type Group = CardGroup | PaletteGroup | ChipsGroup | WallGroup;

/** Accent-free search: lower case, no diacritics. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The icons of cards with no picture: nothing worn there, bare feet. */
const ICONS = {
  nenhum: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" stroke-width="4"/><path d="M13.5 34.5 34.5 13.5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  descalco:
    '<svg viewBox="0 0 48 48" aria-hidden="true" fill="currentColor"><path d="M17 20c4 0 6 4 6 9s-1 13-6 13-6-5-6-10 2-12 6-12z"/><circle cx="14" cy="14" r="2.6"/><circle cx="19" cy="11.5" r="2.3"/><circle cx="23.2" cy="12.5" r="2"/><path d="M33 12c3.6 0 5.4 3.4 5.4 7.6S37.5 31 33 31s-5.4-4.2-5.4-8.4S29.4 12 33 12z" opacity=".55"/></svg>',
};

/** The editor open now (one at a time), and who hears it open and close (the warehouse pauses). */
let openEditor: CustomizerHandle | null = null;
const listeners = new Set<(open: boolean) => void>();

/** Hears the editor open (true) and close (false). Returns the way to stop hearing it. */
export function onCustomizerChange(fn: (open: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Closes the open editor, if any, without saving (the warehouse's camera leaves the locker). */
export function closeCustomizer() {
  openEditor?.dispose();
}

export interface CustomizerHandle {
  /** Frees the stage, the cards and the picker (unsaved changes are dropped). Safe to call more than once. */
  dispose(): void;
}

interface Options {
  look: Appearance;
  sex: Sex;
  setStatus(msg: string, error?: boolean): void;
  /** Closed (saved or not): back to the profile. */
  onClose(saved: boolean): void;
  /**
   * Saves the look somewhere else than the player's own account (the Gerenciamento tab: another account's,
   * PATCH /api/gestao/contas/:id). Absent: the player's own (PATCH /api/perfil).
   */
  onSave?(look: Appearance): Promise<void>;
}

export function showCustomizer(root: HTMLElement, o: Options): CustomizerHandle {
  // One editor at a time (a second one would hold a second stage).
  openEditor?.dispose();
  let look = clone(o.look);
  // A look saved before the face's features: the defaults.
  look.rosto = sanitizeFace(look.rosto);
  const sex = o.sex;
  let tab: Tab = 'body';
  let query = '';
  const card = root.closest('.home-card');
  card?.classList.add('wide');

  root.innerHTML = `
    <div class="customizer">
      <div class="cz-stage">
        <canvas id="cz-canvas"></canvas>
        <div class="cz-anims seg">${ANIMS.map(([a, k]) => `<button type="button" data-anim="${a}" aria-pressed="${a === 'idle'}">${l(k)}</button>`).join('')}</div>
        <p class="hint">${l('dragHint')}</p>
        <p class="cz-effects"><b>${l('effects')}:</b> <span id="cz-effects"></span></p>
        <div class="cz-actions">
          <button id="cz-save" class="small-btn">${l('save')}</button>
          <button id="cz-random" class="link-btn">🎲 ${l('random')}</button>
          <button id="cz-reset" class="link-btn">${l('reset')}</button>
          <button id="cz-cancel" class="link-btn">${l('cancel')}</button>
        </div>
        <div class="cz-actions cz-dev">
          <button id="cz-json" class="link-btn">${l('copyJson')}</button>
          <button id="cz-glb" class="link-btn">${l('exportGlb')}</button>
        </div>
      </div>
      <div class="cz-panel">
        <h3>${l('title')}</h3>
        <nav class="cz-tabs" role="tablist">
          ${TABS.map((tb) => `<button type="button" role="tab" data-tab="${tb.id}" title="${esc(l(tb.label))}"><span class="cz-icon">${tb.icon}</span><span>${esc(l(tb.label))}</span></button>`).join('')}
        </nav>
        <input id="cz-search" class="cz-search" type="search" placeholder="${esc(l('search'))}" />
        <div id="cz-content" class="cz-content"></div>
      </div>
    </div>`;

  const stage = new Stage(root.querySelector<HTMLCanvasElement>('#cz-canvas')!);
  const content = root.querySelector<HTMLElement>('#cz-content')!;
  const thumbs = new ItemThumbs(stage.renderer, sex, content);
  const effects = root.querySelector<HTMLElement>('#cz-effects')!;
  const search = root.querySelector<HTMLInputElement>('#cz-search')!;
  search.oninput = () => {
    query = search.value;
    renderContent();
  };
  /** The color picker open now (one at a time) and the chip it belongs to. */
  let picker: { p: ColorPicker; slot: Slot; ch: number } | null = null;

  // --- Groups of each tab --------------------------------------------------------------------------------
  const nameOf = (i: CatalogItem) => (getLang() === 'en' ? i.name.en : i.name.pt);

  /** Applying a catalog item: hair and facial hair have their own fields, the rest goes in its slot. */
  const applyItem = (i: CatalogItem) => (a: Appearance) => {
    if (i.category === 'cabelo') a.cabelo.id = i.id;
    else if (i.category === 'barba') a.barba = i.id;
    else wear(a, i.slots[0], i.id, sex);
  };
  const isWorn = (i: CatalogItem) => (a: Appearance) =>
    i.category === 'cabelo' ? a.cabelo.id === i.id : i.category === 'barba' ? a.barba === i.id : itemIn(a, i.slots[0])?.id === i.id;
  const itemPic = (i: CatalogItem) => (): Pic => (i.id === 'descalco' ? { icon: 'descalco' } : { item: i.id });
  const nonePic = (): Pic => ({ icon: 'nenhum' });

  /** Cards for catalog items; `none` adds an option that empties the slot. */
  const itemCards = (title: string, items: CatalogItem[], focus: Focus, none?: Slot): CardGroup => ({
    kind: 'cards',
    title,
    focus,
    options: [
      ...(none ? [{ value: '', label: l('none'), pic: nonePic, apply: (a: Appearance) => wear(a, none, '', sex), selected: (a: Appearance) => !itemIn(a, none) }] : []),
      ...items.map((i) => ({ value: i.id, label: nameOf(i), pic: itemPic(i), apply: applyItem(i), selected: isWorn(i) })),
    ],
  });

  /** The color chips of the item stored in a slot (one per channel), if it has colors. */
  const slotColors = (slot: Slot): ChipsGroup[] => {
    const c = look.itens[slot];
    const it = c && catalogItem(c.id);
    return it && it.channels.length ? [{ kind: 'chips', slot }] : [];
  };

  /** One section of cards per slot used by a category (accessories, tactical gear, headwear). */
  const bySlot = (category: Category): Group[] => {
    const items = catalogOf(category);
    const slots = [...new Set(items.map((i) => i.slots[0]))];
    return slots.flatMap((slot) => [itemCards(l(slot), items.filter((i) => i.slots[0] === slot), focusOf(slot), slot), ...slotColors(slot)]);
  };

  /** Cards for one feature of the face (shape, brows, nose, mouth, ears, marks), on the clay head. */
  const faceCards = <K extends keyof Face>(title: string, key: K, values: readonly Face[K][]): CardGroup => ({
    kind: 'cards',
    title: l(title),
    focus: 'head',
    options: values.map((v) => ({
      value: v,
      label: l(`${key}.${v}`),
      pic: (): Pic => (v === 'nenhuma' ? { icon: 'nenhum' } : { face: key, value: v }),
      apply: (a: Appearance) => (a.rosto = { ...a.rosto, [key]: v }),
      selected: (a: Appearance) => a.rosto[key] === v,
    })),
  });

  const searchResults = (q: string): Group[] => {
    const n = norm(q);
    const items = CATALOG.filter((i) => i.ready && (norm(i.name.pt).includes(n) || norm(i.name.en).includes(n)));
    // One section per category, framed on the part of the body it dresses.
    const titles: Record<Category, string> = { cabelo: l('hairStyle'), barba: l('beard'), camiseta: l('camiseta'), blusa: l('blusa'), jaqueta: l('jaqueta'), calca: l('calca'), short: l('short'), calcado: l('calcado'), cabeca: l('tabHead'), acessorio: l('tabAcc'), tatico: l('tabTactical') };
    const cats = [...new Set(items.map((i) => i.category))];
    return cats.map((c) => {
      const list = items.filter((i) => i.category === c);
      const focus: Focus = c === 'cabelo' || c === 'barba' ? 'head' : focusOf(list[0].slots[0]);
      return itemCards(titles[c], list, focus);
    });
  };

  const groups = (): Group[] => {
    if (query.trim()) return searchResults(query);
    const nonEmpty = (gs: Group[]) => gs.filter((g) => g.kind !== 'cards' || g.options.some((op) => op.value));
    switch (tab) {
      case 'body':
        return [
          { kind: 'wall', which: 'height', title: l('height') },
          { kind: 'wall', which: 'build', title: l('build') },
          { kind: 'palette', title: l('skin'), colors: SKIN_COLORS, get: (a) => a.pele, set: (a, c) => (a.pele = c) },
        ];
      case 'hair':
        return [
          itemCards(l('hairStyle'), catalogOf('cabelo').filter((i) => HAIR_STYLES.includes(i.id)), 'head'),
          { kind: 'palette', title: l('hairColor'), colors: HAIR_COLORS, get: (a) => a.cabelo.cor, set: (a, c) => (a.cabelo.cor = c) },
          {
            kind: 'cards',
            title: l('beard'),
            focus: 'head',
            options: BEARDS.map((v) => ({
              value: v,
              label: v ? nameOf(catalogItem(v)!) : l('none'),
              pic: (): Pic => (v ? { item: v } : { icon: 'nenhum' }),
              apply: (a: Appearance) => (a.barba = v),
              selected: (a: Appearance) => a.barba === v,
            })),
          },
          faceCards('faceShape', 'formato', FACE_SHAPES),
          {
            kind: 'cards',
            title: l('eyeStyle'),
            focus: 'head',
            options: EYE_STYLES.map((v) => ({ value: v, label: l(v), pic: (): Pic => ({ face: 'olhosEstilo', value: v }), apply: (a) => (a.olhosEstilo = v), selected: (a) => a.olhosEstilo === v })),
          },
          { kind: 'palette', title: l('eyeColor'), colors: EYE_COLORS, get: (a) => a.olhos, set: (a, c) => (a.olhos = c) },
          faceCards('brows', 'sobrancelhas', BROW_STYLES),
          faceCards('nose', 'nariz', NOSE_STYLES),
          faceCards('mouth', 'boca', MOUTH_STYLES),
          faceCards('ears', 'orelhas', EAR_STYLES),
          faceCards('marks', 'marcas', FACE_MARKS),
        ];
      case 'top':
        return nonEmpty([
          itemCards(l('camiseta'), catalogOf('camiseta'), 'torso'),
          itemCards(l('blusa'), catalogOf('blusa'), 'torso'),
          ...slotColors('tronco'),
          itemCards(l('jaqueta'), catalogOf('jaqueta'), 'torso', 'sobreposicao'),
          ...slotColors('sobreposicao'),
        ]);
      case 'bottom':
        return nonEmpty([
          itemCards(l('calca'), catalogOf('calca'), 'legs'),
          itemCards(l('short'), catalogOf('short').filter((i) => !i.id.startsWith('saia')), 'legs'),
          itemCards(l('saia'), catalogOf('short').filter((i) => i.id.startsWith('saia')), 'legs'),
          ...slotColors('baixo'),
        ]);
      case 'shoes':
        return nonEmpty([itemCards(l('calcado'), catalogOf('calcado'), 'feet'), ...slotColors('calcado')]);
      case 'head':
        return bySlot('cabeca');
      case 'acc':
        return bySlot('acessorio');
      case 'tactical':
        return bySlot('tatico');
      case 'pcd':
        // The one tab with the character on its cards: each loss on the player's own look.
        return [
          {
            kind: 'cards',
            title: l('arm'),
            focus: 'torso',
            options: ARM_LOSSES.map((v) => ({ value: v, label: l(v || 'complete'), pic: (a: Appearance): Pic => ({ pcd: { braco: v, perna: a.pcd.perna } }), apply: (a) => (a.pcd.braco = v), selected: (a) => a.pcd.braco === v })),
          },
          {
            kind: 'cards',
            title: l('leg'),
            focus: 'legs',
            options: LEG_LOSSES.map((v) => ({ value: v, label: l(v || 'complete'), pic: (a: Appearance): Pic => ({ pcd: { braco: a.pcd.braco, perna: v } }), apply: (a) => (a.pcd.perna = v), selected: (a) => a.pcd.perna === v })),
          },
        ];
    }
  };

  // --- Rendering ---------------------------------------------------------------------------------------------
  let current: Group[] = [];

  /** Every card's picture (cached ones at once; the others as they're drawn, the ones in view first). */
  const loadThumbs = () => {
    current.forEach((g, gi) => {
      if (g.kind !== 'cards') return;
      g.options.forEach((op, oi) => {
        const img = content.querySelector<HTMLImageElement>(`.cz-card[data-g="${gi}"][data-o="${oi}"] img`);
        if (img) thumbs.card(img, op.pic(look), look);
      });
    });
  };

  /** The worn piece's card in its colors now (after a color is confirmed: only that card is drawn again). */
  const refreshWorn = (id: string) => {
    current.forEach((g, gi) => {
      if (g.kind !== 'cards') return;
      g.options.forEach((op, oi) => {
        if (op.value !== id) return;
        const img = content.querySelector<HTMLImageElement>(`.cz-card[data-g="${gi}"][data-o="${oi}"] img`);
        if (img) thumbs.card(img, op.pic(look), look);
      });
    });
  };

  const refreshSelection = () => {
    current.forEach((g, gi) => {
      if (g.kind === 'cards') {
        g.options.forEach((op, oi) => content.querySelector(`.cz-card[data-g="${gi}"][data-o="${oi}"]`)?.setAttribute('aria-pressed', String(op.selected(look))));
      } else if (g.kind === 'palette') {
        content.querySelectorAll<HTMLElement>(`.cz-colors[data-g="${gi}"] .cp-swatch`).forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.c === g.get(look))));
      }
    });
  };

  /** The look changed (a piece, the body, a palette color): the stage and the line of effects. */
  const changed = () => {
    stage.show(look, sex);
    effects.textContent = effectsText(look);
    refreshSelection();
  };

  const closePicker = () => {
    picker?.p.dispose();
    picker = null;
    content.querySelectorAll('.cp-chip[aria-expanded="true"]').forEach((c) => c.setAttribute('aria-expanded', 'false'));
  };

  /** Opens (or closes) the color picker of a channel of the piece worn in a slot, under its chips. */
  const togglePicker = (sec: HTMLElement, slot: Slot, ch: number) => {
    const same = picker && picker.slot === slot && picker.ch === ch;
    closePicker();
    if (same) return;
    const c = look.itens[slot];
    const it = c && catalogItem(c.id);
    if (!c || !it) return;
    const chip = sec.querySelector<HTMLElement>(`.cp-chip[data-ch="${ch}"]`)!;
    chip.setAttribute('aria-expanded', 'true');
    const key = colorKey(slot, it.channels[ch]);
    const p = new ColorPicker(sec.querySelector<HTMLElement>('.cp-host')!, {
      slot,
      channel: ch,
      value: c.cores[ch],
      lang: lang(),
      used: () => Object.values(look.itens).flatMap((x) => x!.cores),
      // While dragging: only the stage (a uniform) and the chip.
      onInput: (hex) => {
        stage.setColor(key, hex);
        chip.querySelector<HTMLElement>('.cp-chip-color')!.style.background = hex;
      },
      // Confirmed: into the look, and the worn piece's card in its new colors.
      onChange: (hex) => {
        const cur = look.itens[slot];
        if (!cur || cur.id !== it.id) return;
        cur.cores[ch] = hex;
        stage.show(look, sex);
        refreshWorn(it.id);
      },
      onDrag: (on) => thumbs.hold(on),
    });
    picker = { p, slot, ch };
  };

  /** Rebuilds the panel (an item change may add or remove color channels), keeping the scroll. */
  const renderContent = () => {
    const scroll = content.scrollTop;
    closePicker();
    thumbs.newTab();
    current = groups();
    const cards = current.filter((g) => g.kind === 'cards') as CardGroup[];
    const section = (g: Group, gi: number): string => {
      switch (g.kind) {
        case 'cards':
          return g.options.length
            ? `<section><h4>${esc(g.title)}</h4><div class="cz-grid">${g.options
                .map((op, oi) => {
                  const pic = op.pic(look);
                  const thumb = 'icon' in pic ? `<span class="cz-thumb cz-thumb-icon">${ICONS[pic.icon]}</span>` : `<span class="cz-thumb"><img alt="" /></span>`;
                  return `<button type="button" class="cz-card" data-g="${gi}" data-o="${oi}" aria-pressed="${op.selected(look)}">${thumb}<span class="cz-label">${esc(op.label)}</span></button>`;
                })
                .join('')}</div></section>`
            : '';
        case 'palette':
          return `<section class="cz-colors" data-g="${gi}"><h4>${esc(g.title)}</h4><div class="cp-swatches">${g.colors
            .map((c) => `<button type="button" class="cp-swatch" data-c="${c}" style="background:${c}" aria-pressed="${c === g.get(look)}" title="${c}" aria-label="${c}"></button>`)
            .join('')}</div></section>`;
        case 'chips': {
          const c = look.itens[g.slot]!;
          const it = catalogItem(c.id)!;
          return `<section class="cz-colors cz-chips" data-g="${gi}" data-slot="${g.slot}"><h4>${esc(`${l('colors')} · ${l(g.slot)}`)}</h4><div class="cp-chips">${it.channels
            .map((ch, i) => `<button type="button" class="cp-chip" data-ch="${i}" aria-expanded="false"><span class="cp-chip-color" style="background:${c.cores[i]}"></span><span>${esc(l(ch))}</span></button>`)
            .join('')}</div><div class="cp-host"></div></section>`;
        }
        case 'wall':
          return `<section class="cz-wall-section"><h4>${esc(g.title)}</h4>${lineupHtml(g.which, g.which === 'height' ? look.altura : look.biotipo, look.altura, { name: (v) => l(v), lang: lang() })}${g.which === 'build' ? `<p class="hint cz-wall-note">${esc(l('wallNote'))}</p>` : ''}</section>`;
      }
    };
    content.innerHTML =
      (tab === 'pcd' && !query.trim() ? `<p class="hint cz-pcd-hint">${l('pcdHint')}</p>` : '') +
      (query.trim() && !cards.some((g) => g.options.length) ? `<p class="hint">${l('noResults')}</p>` : '') +
      (!query.trim() && !current.length ? `<p class="hint">${l('soon')}</p>` : '') +
      current.map(section).join('');
    content.querySelectorAll<HTMLButtonElement>('.cz-card').forEach((btn) => {
      btn.onclick = () => {
        const g = current[Number(btn.dataset.g)] as CardGroup;
        g.options[Number(btn.dataset.o)].apply(look);
        stage.focus(g.focus);
        changed();
        renderContent();
      };
    });
    content.querySelectorAll<HTMLButtonElement>('.cz-wall-pick').forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.wall === 'height') look.altura = btn.dataset.v as Height;
        else look.biotipo = btn.dataset.v as Build;
        stage.focus('full');
        changed();
        renderContent();
        content.querySelector<HTMLElement>(`.cz-wall-pick[data-wall="${btn.dataset.wall}"][data-v="${btn.dataset.v}"]`)?.focus({ preventScroll: true });
      };
    });
    content.querySelectorAll<HTMLElement>('.cz-colors').forEach((sec) => {
      const g = current[Number(sec.dataset.g)];
      if (g.kind === 'palette') {
        sec.querySelectorAll<HTMLButtonElement>('.cp-swatch').forEach((sw) => {
          sw.onclick = () => {
            g.set(look, sw.dataset.c!);
            changed();
            // The worn hair style and beard follow the hair color on their cards.
            if (g.colors === HAIR_COLORS) {
              refreshWorn(look.cabelo.id);
              if (look.barba) refreshWorn(look.barba);
            }
          };
        });
      } else if (g.kind === 'chips') {
        sec.querySelectorAll<HTMLButtonElement>('.cp-chip').forEach((chip) => {
          chip.onclick = () => togglePicker(sec, g.slot, Number(chip.dataset.ch));
        });
      }
    });
    loadThumbs();
    content.scrollTop = scroll;
  };

  const selectTab = (t: Tab) => {
    tab = t;
    query = search.value = '';
    root.querySelectorAll<HTMLElement>('.cz-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    stage.focus(TABS.find((x) => x.id === t)!.focus);
    renderContent();
  };

  // --- Actions -------------------------------------------------------------------------------------------
  let disposed = false;
  const handle: CustomizerHandle = {
    dispose() {
      if (disposed) return;
      disposed = true;
      closePicker();
      thumbs.dispose();
      stage.dispose();
      // Its markup goes too (a dead stage and buttons left behind would show while the pane loads its next content).
      root.querySelector(':scope > .customizer')?.remove();
      card?.classList.remove('wide');
      if (openEditor === handle) {
        openEditor = null;
        for (const fn of listeners) fn(false);
      }
    },
  };
  const close = (saved: boolean) => {
    handle.dispose();
    o.onClose(saved);
  };

  root.querySelectorAll<HTMLButtonElement>('.cz-tabs button').forEach((b) => (b.onclick = () => selectTab(b.dataset.tab as Tab)));
  root.querySelector<HTMLButtonElement>('#cz-cancel')!.onclick = () => close(false);
  root.querySelectorAll<HTMLButtonElement>('.cz-anims button').forEach((b) => {
    b.onclick = () => {
      stage.play(b.dataset.anim as Anim);
      root.querySelectorAll('.cz-anims button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    };
  });
  root.querySelector<HTMLButtonElement>('#cz-random')!.onclick = () => {
    look = randomAppearance(sex);
    changed();
    renderContent();
  };
  // The whole look as the character system's config (what a GLB pipeline or a tool would consume).
  root.querySelector<HTMLButtonElement>('#cz-json')!.onclick = async () => {
    const json = JSON.stringify(appearanceToConfig(look, sex), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      o.setStatus(l('copied'));
    } catch {
      console.log(json);
      o.setStatus(l('copied'));
    }
  };
  // Exports the live character (skeleton, skin weights, morphs, masks) as a GLB, in rest pose.
  root.querySelector<HTMLButtonElement>('#cz-glb')!.onclick = async () => {
    const holder = new THREE.Scene();
    const a = new Avatar(holder, look, sex, { bake: false });
    a.visible = true;
    a.character.skeleton.pose();
    const glb = (await new GLTFExporter().parseAsync(a.root, { binary: true })) as ArrayBuffer;
    a.dispose();
    const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'personagem.glb';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    o.setStatus(l('exported'));
  };
  root.querySelector<HTMLButtonElement>('#cz-reset')!.onclick = () => {
    look = defaultAppearance(sex);
    changed();
    renderContent();
  };
  const save = root.querySelector<HTMLButtonElement>('#cz-save')!;
  save.onclick = async () => {
    save.disabled = true;
    try {
      if (o.onSave) await o.onSave(look);
      else await api('PATCH', '/api/perfil', { aparencia: look });
      if (disposed) return;
      o.setStatus(l('saved'));
      close(true);
    } catch (err) {
      o.setStatus(errorText(err), true);
      save.disabled = false;
    }
  };

  stage.show(look, sex);
  effects.textContent = effectsText(look);
  selectTab('body');
  // Every other card of the catalog, in the background (drawn once per version of the game).
  thumbs.background(look);
  openEditor = handle;
  for (const fn of listeners) fn(true);
  return handle;
}
