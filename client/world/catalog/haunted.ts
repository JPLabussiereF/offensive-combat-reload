// "Vila Assombrada" pieces: enterable houses with doors on several sides, market stalls, the family portraits,
// dead trees, tombstones with epitaphs, crooked signs, wrought-iron fences and their gate arches, hedges,
// jack-o'-lanterns, circus trailers, painted wall plaques and murky water.
import * as THREE from 'three';
import { fitText } from '../canvasText';
import { toonGradient } from '../../render/materials';
import { MapBuilder, stairRun, type Opening } from '../mapBuilder';
import type { SurfaceKey } from '../surfaces';
import type { SpatialSfx } from '../../audio/spatial';
import { railing, type Rect } from '../oriental';
import { canvasTexture, deadTree, epitaph, gateArch, hedge, ironFence, signBoard, SPOOKY as C, staticPumpkin, tombstone, type TombKind } from '../halloween';
import { at, P, scaleOf, V, yawOf, type Adapter, type BuildCtx } from './types';
import { hedgeThorns } from './cemetery';

export interface HauntedSfx extends SpatialSfx {
  ghostMoan(): void;
  grumble(): void;
  churchBell(pitch?: number): void;
  carHorn(seconds: number): void;
  pumpkinSmash(): void;
  bulbPop(): void;
  ratSqueak(): void;
  ratHit(): void;
  ratDeath(): void;
  cabinetCreak(): void;
  cauldronBubble(): void;
  quack(): void;
  evilLaugh(): void;
  clockChime(n: number): void;
  targetDing(): void;
  carnivalJingle(): void;
  strawThud(): void;
  ambientCrow(): void;
  ambientHowl(): void;
}

type Side = 'n' | 's' | 'e' | 'w';
type Sides = Partial<Record<Side, number[]>>;

/** A light spot (the pool lights the nearest for real); `bulb` also draws a glowing bulb there. */
export function light(c: BuildCtx, x: number, y: number, z: number, o: { color?: number; intensity?: number; range?: number; flicker?: number; bulb?: boolean } = {}) {
  c.s.lights.add({ at: V(x, y, z), color: new THREE.Color(o.color ?? 0xffb46a), intensity: o.intensity ?? 10, range: o.range ?? 10, flicker: o.flicker });
  if (o.bulb) c.s.c.glow.add(new THREE.SphereGeometry(0.1, 8, 6).translate(x, y, z), 0xffe0a8);
}

/** A bulb hanging on its cord from a ceiling at `top`. */
export function hangingLamp(c: BuildCtx, x: number, top: number, z: number, o: { intensity?: number; range?: number } = {}) {
  c.b.box(x, top - 0.3, z, 0.02, 0.6, 0.02, 'pintura', { tint: 0x1a1414, collide: false, castShadow: false });
  c.b.cylinder(x, top - 0.75, z, 0.16, 0.12, 'metal', { tint: 0x3a3436, collide: false, castShadow: false, radiusTop: 0.04, segments: 8 });
  light(c, x, top - 0.8, z, { range: 8, ...o, bulb: true });
}

interface HouseSpec extends Rect {
  stories?: 1 | 2;
  /** Floor-to-floor height (m). */
  h?: number;
  wall: SurfaceKey;
  tint: number;
  roof: number;
  ridge?: 'x' | 'z';
  rise?: number;
  /** Door and window centers along each side (absolute x for n/s, z for e/w). */
  doors?: Sides;
  doorW?: number;
  /** Ground-floor windows: sill at 0.9 m, top at 2.3 m (crouch-jump through). */
  windows?: Sides;
  /** Upstairs windows (two-story houses). */
  upper?: Sides;
  /** Planks nailed across the windows (visual: bullets and grenades still get through). */
  boarded?: boolean;
  frame: number;
}

export const haunted: Record<string, Adapter> = {
  /** Enterable house with doors on several sides, a gable roof and a bulb hanging in the middle of its ground floor. */
  casaAssombrada(c, p) {
    const q = P<{ x0: number; z0: number; x1: number; z1: number; andares?: 1 | 2; pe?: number; parede: SurfaceKey; cor: number; telhado: number; cumeeira?: 'x' | 'z'; subida?: number; portas?: Sides; larguraPorta?: number; janelas?: Sides; superiores?: Sides; tabuas?: boolean; moldura: number; lampada?: boolean }>(p);
    const spec: HouseSpec = { x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1, stories: q.andares, h: q.pe, wall: q.parede, tint: q.cor, roof: q.telhado, ridge: q.cumeeira, rise: q.subida, doors: q.portas, doorW: q.larguraPorta, windows: q.janelas, upper: q.superiores, boarded: q.tabuas, frame: q.moldura };
    house(c.b, spec);
    if (q.lampada !== false) hangingLamp(c, (spec.x0 + spec.x1) / 2, spec.h ?? 3.2, (spec.z0 + spec.z1) / 2);
  },

  barraca(c, p) {
    const [x, , z] = at(p);
    stall(c.b, x, z, yawOf(p), P<{ cor: number }>(p).cor);
  },

  retrato(c, p) {
    const [x, y, z] = at(p);
    portrait(c.b, c.scene, x, y, z, yawOf(p), P<{ quem: 0 | 1 }>(p).quem);
  },

  arvoreMorta(c, p) {
    const q = P<{ cor?: number; colide?: boolean; galhos?: number }>(p);
    const [x, y, z] = at(p);
    const o: { tint?: number; collide?: boolean; y?: number; branches?: number } = {};
    if (q.cor !== undefined) o.tint = q.cor;
    if (q.colide !== undefined) o.collide = q.colide;
    if (y) o.y = y;
    if (q.galhos !== undefined) o.branches = q.galhos;
    deadTree(c.b, x, z, scaleOf(p), c.rand, o);
  },

  /** A tombstone, slightly crooked (seeded), with the epitaph carved on its face when given. */
  lapide(c, p) {
    const q = P<{ tipo: TombKind; cor?: number; epitafio?: string[] }>(p);
    const [x, , z] = at(p);
    const face = tombstone(c.b, x, z, yawOf(p), q.tipo, c.rand, q.cor);
    if (q.epitafio) epitaph(c.scene, face, q.epitafio);
  },

  placa(c, p) {
    const q = P<{ linhas: string[]; fundo?: string; texto?: string; altura?: number; largura?: number; alturaPlaca?: number; inclinacao?: number }>(p);
    const [x, , z] = at(p);
    signBoard(c.b, c.scene, q.linhas, x, z, yawOf(p), { bg: q.fundo, fg: q.texto, height: q.altura, w: q.largura, h: q.alturaPlaca, tilt: q.inclinacao });
  },

  grade(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; de: number; ate: number; vaos: [number, number][]; altura?: number }>(p);
    ironFence(c.b, q.eixo, q.fixo, q.de, q.ate, q.vaos, q.altura);
  },

  arcoPortao(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; de: number; ate: number; texto: string }>(p);
    gateArch(c.b, c.scene, c.s.c.glow, q.eixo, q.fixo, q.de, q.ate, q.texto);
  },

  sebe(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; de: number; ate: number; vaos: [number, number][]; altura?: number; espessura?: number; espinhos?: boolean }>(p);
    hedge(c.b, q.eixo, q.fixo, q.de, q.ate, q.vaos, q.altura, q.espessura);
    // The zumbi cemetery's hedge: thorny (climbing it makes you bleed, ZOMBIE.espinhos).
    if (q.espinhos) hedgeThorns(c.b, q.eixo, q.fixo, q.de, q.ate, q.vaos, q.altura, q.espessura);
  },

  aboboraEstatica(c, p) {
    const q = P<{ raio: number; rosto?: boolean }>(p);
    const [x, y, z] = at(p);
    staticPumpkin(c.b, c.s.c.glow, x, y, z, yawOf(p), q.raio, q.rosto);
  },

  /** A painted plaque on a wall (the mausoleum's family name, the sewer's dead-end sign). */
  placaParede(c, p) {
    const q = P<{ texto: string; largura: number; altura: number; estilo: 'tumulo' | 'esgoto' }>(p);
    const [x, y, z] = at(p);
    const plate =
      q.estilo === 'tumulo'
        ? canvasTexture(256, 64, (g) => {
            g.fillStyle = '#4a4644';
            g.fillRect(0, 0, 256, 64);
            g.fillStyle = '#d8cfb8';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            fitText(g, q.texto, 128, 34, 230, (px) => `900 ${px}px Nunito, serif`, 30);
          })
        : canvasTexture(256, 96, (g) => {
            g.fillStyle = '#2a2a2a';
            g.fillRect(0, 0, 256, 96);
            g.strokeStyle = '#d8cfb8';
            g.lineWidth = 6;
            g.strokeRect(6, 6, 244, 84);
            g.fillStyle = '#d8cfb8';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            fitText(g, q.texto, 128, 50, 220, (px) => `400 ${px}px "Lilita One", system-ui, sans-serif`, 34);
          });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(q.largura, q.altura), new THREE.MeshToonMaterial({ map: plate, gradientMap: toonGradient() }));
    plaque.position.set(x, y, z);
    plaque.rotation.y = yawOf(p);
    c.scene.add(plaque);
  },

  /** A flat stretch of water (the sewer's murky channels). */
  agua(c, p) {
    const q = P<{ area: Rect; y: number; cor: number; opacidade: number }>(p);
    const { x0, z0, x1, z1 } = q.area;
    const water = new THREE.MeshToonMaterial({ color: q.cor, transparent: true, opacity: q.opacidade, gradientMap: toonGradient() });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), water);
    plane.position.set((x0 + x1) / 2, q.y, (z0 + z1) / 2);
    c.scene.add(plane);
  },
};

/** Enterable house with doors on several sides, a gable roof and, with two stories, stairs along the north wall. */
function house(b: MapBuilder, s: HouseSpec) {
  const t = 0.3;
  const h = s.h ?? 3.2;
  const stories = s.stories ?? 1;
  const wallH = h * stories + 0.2;
  const dw = (s.doorW ?? 1.7) / 2;
  const ops = (side: Side): Opening[] => [
    ...(s.doors?.[side] ?? []).map((c): Opening => [c - dw, c + dw, 0, 2.4]),
    ...(s.windows?.[side] ?? []).map((c): Opening => [c - 1, c + 1, 0.9, 2.3]),
    ...(s.upper?.[side] ?? []).map((c): Opening => [c - 0.9, c + 0.9, h + 0.9, h + 2.2]),
  ];
  const o = { tint: s.tint, frame: { surface: 'pintura' as const, tint: s.frame, width: 0.1 } };
  b.wall('x', s.z0, s.x0, s.x1, t, wallH, s.wall, ops('n'), 0, o);
  b.wall('x', s.z1, s.x0, s.x1, t, wallH, s.wall, ops('s'), 0, o);
  b.wall('z', s.x0, s.z0 + t / 2, s.z1 - t / 2, t, wallH, s.wall, ops('w'), 0, o);
  b.wall('z', s.x1, s.z0 + t / 2, s.z1 - t / 2, t, wallH, s.wall, ops('e'), 0, o);
  if (s.boarded) {
    const plank = { tint: 0x7a6248, collide: false };
    const sides: [Side, 'x' | 'z', number, number][] = [['n', 'x', s.z0, -1], ['s', 'x', s.z1, 1], ['w', 'z', s.x0, -1], ['e', 'z', s.x1, 1]];
    for (const [side, axis, fixed, out] of sides) {
      for (const c of s.windows?.[side] ?? []) {
        const d = fixed + out * (t / 2 + 0.03);
        for (const a of [0.5, -0.45]) {
          const rot = axis === 'x' ? new THREE.Euler(0, 0, a) : new THREE.Euler(a, 0, 0);
          if (axis === 'x') b.box(c, 1.6, d, 2.3, 0.18, 0.04, 'madeira', { ...plank, rot });
          else b.box(d, 1.6, c, 0.04, 0.18, 2.3, 'madeira', { ...plank, rot });
        }
      }
    }
  }
  const ix0 = s.x0 + t / 2;
  const ix1 = s.x1 - t / 2;
  const iz0 = s.z0 + t / 2;
  const iz1 = s.z1 - t / 2;
  b.span(ix0, 0, iz0, ix1, 0.02, iz1, 'piso', { tint: 0x7a5e48, collide: false, castShadow: false });
  if (stories === 2) {
    const hx0 = ix0 + 0.8;
    const hx1 = hx0 + stairRun(h);
    const hz1 = iz0 + 1.3;
    const floor = { tint: 0x5a4636 };
    b.span(ix0, h - 0.25, hz1, ix1, h, iz1, 'piso', floor);
    b.span(ix0, h - 0.25, iz0, hx0, h, hz1, 'piso', floor);
    b.span(hx1, h - 0.25, iz0, ix1, h, hz1, 'piso', floor);
    b.stairs('x', 1, hx0, iz0, hz1, 0, h, 'madeira', { tint: 0x4a3426 });
    railing(b, 'x', hz1 + 0.05, hx0, hx1 - 1.2, h, { h: 1.0, tint: 0x2a1a14 });
  }
  b.span(ix0, h * stories, iz0, ix1, wallH, iz1, 'concreto', { tint: 0x4a4446 });
  b.room({ x: ix0, y: 0, z: iz0 }, { x: ix1, y: h * stories, z: iz1 }, 1);
  b.gableRoof(s.x0, s.z0, s.x1, s.z1, wallH, s.rise ?? 2.2, 'telhado', { tint: s.roof, ridgeAxis: s.ridge ?? 'x', gableSurface: s.wall, gableTint: s.tint });
}

/** Market stall: counter (cover), back panel, posts and a striped awning. Faces +Z at yaw 0. */
function stall(b: MapBuilder, x: number, z: number, yaw: number, color: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const rot = new THREE.Euler(0, yaw, 0);
  const [cx, cz] = P(0, 0.5);
  b.box(cx, 0.52, cz, 2.6, 1.05, 0.5, 'madeira', { tint: 0x5a3a26, rot });
  const [bx, bz] = P(0, -0.9);
  b.box(bx, 1.2, bz, 2.6, 2.4, 0.1, 'madeira', { tint: 0x4a3020, rot });
  for (const lx of [-1.25, 1.25]) {
    const [px, pz] = P(lx, 0.7);
    b.box(px, 1.2, pz, 0.1, 2.4, 0.1, 'madeira', { tint: C.woodDark, rot, collide: false });
  }
  const [r0x, r0z] = P(-1.3, -0.85);
  const [r1x, r1z] = P(1.3, 0.25);
  b.room({ x: r0x, y: 0, z: r0z }, { x: r1x, y: 2.35, z: r1z }, 0.4); // under the awning: open on three sides
  for (let k = 0; k < 6; k++) {
    const [ax, az] = P(-1.35 + (k + 0.5) * 0.45, -0.1);
    b.box(ax, 2.5, az, 0.45, 0.06, 1.9, 'pintura', { tint: k % 2 ? 0xe8e0d0 : color, rot: new THREE.Euler(0.15, yaw, 0, 'YXZ'), collide: false });
  }
}

/** Gloomy portrait in a gilded frame, hung on a wall facing `yaw` (0 = facing +Z). */
function portrait(b: MapBuilder, scene: THREE.Scene, x: number, y: number, z: number, yaw: number, who: 0 | 1) {
  const art = new THREE.MeshToonMaterial({ map: portraitTexture(who), gradientMap: toonGradient() });
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  b.box(x + dx * 0.03, y, z + dz * 0.03, 0.9, 1.1, 0.06, 'pintura', { tint: 0x8a6a2a, collide: false, castShadow: false, rot: new THREE.Euler(0, yaw, 0) });
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.96), art);
  canvas.position.set(x + dx * 0.065, y, z + dz * 0.065);
  canvas.rotation.y = yaw;
  scene.add(canvas);
}

/** The family: 0 = the lady of the house (dark hair in a bun, pearls), 1 = the old master (mustache, monocle). */
function portraitTexture(who: 0 | 1) {
  return canvasTexture(256, 320, (g) => {
    const bg = g.createRadialGradient(128, 120, 20, 128, 160, 200);
    bg.addColorStop(0, who ? '#3a3226' : '#3a2630');
    bg.addColorStop(1, '#140c10');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 320);
    const ell = (x: number, y: number, rx: number, ry: number, c: string) => {
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    };
    // Shoulders and clothes.
    ell(128, 330, 112, 110, who ? '#2a2a3a' : '#4a1a2a');
    if (who) {
      g.fillStyle = '#e8e4dc';
      g.beginPath();
      g.moveTo(108, 225);
      g.lineTo(128, 300);
      g.lineTo(148, 225);
      g.fill();
      ell(128, 238, 10, 8, '#8a1a1a');
    } else {
      for (let k = 0; k < 9; k++) ell(92 + k * 9, 236 + Math.sin((k / 8) * Math.PI) * 14, 5, 5, '#f2ece0');
    }
    // Neck, face, hair.
    g.fillStyle = '#d8b8a0';
    g.fillRect(112, 180, 32, 50);
    if (!who) {
      ell(128, 74, 34, 26, '#1e1214');
      ell(128, 118, 56, 60, '#1e1214');
    } else ell(128, 90, 48, 22, '#c8c8c8');
    ell(128, 130, 44, 56, '#e0c4ac');
    ell(110, 124, 6, 4, '#1a1214');
    ell(146, 124, 6, 4, '#1a1214');
    g.fillStyle = '#b89480';
    g.fillRect(124, 128, 8, 22);
    if (who) {
      ell(112, 162, 22, 7, '#d8d8d8');
      ell(144, 162, 22, 7, '#d8d8d8');
      g.strokeStyle = '#c8a040';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(146, 124, 12, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(158, 128);
      g.lineTo(168, 200);
      g.stroke();
    } else {
      ell(128, 166, 12, 4, '#8a2a3a');
      ell(84, 132, 6, 8, '#f2ece0');
    }
    // Varnish: a soft glare across the top.
    const glare = g.createLinearGradient(0, 0, 256, 320);
    glare.addColorStop(0, 'rgba(255,240,210,0.12)');
    glare.addColorStop(0.5, 'rgba(255,240,210,0)');
    g.fillStyle = glare;
    g.fillRect(0, 0, 256, 320);
  });
}
