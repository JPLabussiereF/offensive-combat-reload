// "Vila Assombrada" converted into pieces: the old buildHauntedTownMap with every call recorded (see
// recorder.ts). 120 x 110 m abandoned Halloween town at night (design doc: README_Halloween.md).
// North: the forest with the witch's cabin and the twisted tree, and the Estrada Maldita coming in from the
// north-east (spawn A) past the barn. Center-north: the cemetery (chapel with its bell tower, mausoleum
// with a roof you can climb, rows of tombstones, the grumpy ghost's grave). West: the haunted mansion (two
// floors around a great hall, basement) and its garden. Center: the village street with six houses.
// South-east: the abandoned amusement park (Ferris wheel, shooting gallery, stage, bumper cars). South: the
// Praça da Lua Cheia, the big open arena behind a hedge (spawn B court at its west end). Underground: a
// sewer from the mansion basement to the plaza and the park.
import * as THREE from 'three';
import { MAP_FORMAT, type Vec3 } from '@shared/mapData';
import { PICKUPS, RATS, WITCHES } from '@shared/maps';
import { MapBuilder, STEP_D, stairRun, stairSteps, type Opening } from '../mapBuilder';
import { deadTree, SPOOKY as C, type TombKind } from '../halloween';
import type { SurfaceKey } from '../surfaces';
import type { MapMeta, Recorder } from './recorder';

/** Same seed on every client: trees, rocks and tombstones collide identically online. */
export const SEED = 1031;

/** Moon direction: the shadows come from it too. */
const MOON: Vec3 = [45, 62, -38];
const W = 60; // half extent X
const D = 55; // half extent Z
const UG = -4; // sewer floor
const CEIL = -0.5; // underside of the ground slab
const FH = 3.6; // the mansion's floor to floor

type Side = 'n' | 's' | 'e' | 'w';
type Rect = { x0: number; z0: number; x1: number; z1: number };
interface HouseSpec extends Rect {
  stories?: 1 | 2;
  h?: number;
  wall: SurfaceKey;
  tint: number;
  roof: number;
  ridge?: 'x' | 'z';
  rise?: number;
  doors?: Partial<Record<Side, number[]>>;
  doorW?: number;
  windows?: Partial<Record<Side, number[]>>;
  upper?: Partial<Record<Side, number[]>>;
  boarded?: boolean;
  frame: number;
}

export function meta(): MapMeta {
  const at = (x: number, y: number, z: number, yaw: number) => ({ p: [x, y, z] as Vec3, yaw });
  const E = -Math.PI / 2; // facing +X
  const Wd = Math.PI / 2; // facing -X
  const S = Math.PI; // facing +Z
  const dummy = (x: number, y: number, z: number, yaw: number, patrulha?: { eixo: 'x' | 'z'; amplitude: number; velocidade: number }) => ({ p: [x, y, z] as Vec3, yaw, ...(patrulha ? { patrulha } : {}) });
  return {
    formato: MAP_FORMAT,
    nome: 'Vila Assombrada',
    cartao: { emoji: '🎃', cor: '#e3dbff' },
    ambiente: {
      ceu: {
        atmosfera: {
          fundo: 0x120f26,
          neblina: { cor: 0x2e2648, perto: 55, longe: 210 },
          hemisferio: { ceu: 0xbab6f2, chao: 0x625668, intensidade: 2.3 },
          // Moonlight; its shadows reach the whole map within the shadow camera's 150 m depth.
          sol: { cor: 0xd2daff, intensidade: 2.0, de: MOON },
          arma: { ceu: 0xbab6f2, chao: 0x625668, hemisferio: 1.6, sol: 1.6, corSol: 0xd2daff },
        },
        cupula: { tipo: 'lua', lua: MOON },
      },
      celula: 60,
      sombra: Math.max(W, D) + 24,
      killY: -20,
      // Crows and, now and then, a wolf far away.
      sons: [
        { som: 'corvo', primeiro: 3, intervalo: [7, 17] },
        { som: 'uivo', primeiro: 25, intervalo: [40, 80] },
      ],
    },
    arquivos: [],
    spawns: {
      a: [at(56, 0.2, -47, Wd), at(56, 0.2, -44.8, Wd), at(56, 0.2, -49.2, Wd), at(52, 0.2, -38, Wd), at(57, 0.2, -36, Wd)],
      b: [at(-56, 0.2, 50, E), at(-56, 0.2, 46.5, E), at(-53, 0.2, 53, E), at(-57, 0.2, 38, E), at(-50, 0.2, 36.5, E)],
      ffa: ([
        // Mansion: hall, library, kitchen, upstairs rooms, basement; the sewer.
        [-48, 0.2, 2], [-36, 0.2, -5], [-50, 0.2, 10], [-51, FH + 0.2, -4], [-37, FH + 0.2, 9], [-48, UG + 0.2, 10.5], [-30, UG + 0.2, 31.5],
        // Forest, cabin, cemetery (chapel, mausoleum, paths).
        [-37, 0.2, -44], [-15, 0.2, -46], [-44, 0.2, -20], [-20, 0.2, -29.5], [19, 0.2, -31], [-6, 0.2, -24.5],
        // Road and barn; village houses.
        [28, 0.2, -45], [51, 0.2, -29], [-15.5, 0.2, -8.8], [0.5, 0.2, 9.5], [14.5, 0.2, -8.8],
        // Park, plaza, garden and the corners.
        [30, 0.2, 24.6], [-30, 0.2, 52], [26, 0.2, 49.5], [0, 0.2, 36.5], [-42, 0.2, 27.5], [53, 0.2, 43], [-55, 0.2, 40],
      ] as Vec3[]).map(([x, y, z]) => at(x, y, z, Math.atan2(x, z))),
    },
    bonecos: [
      // From the road: along it, behind the car, at the barn and the cemetery gate.
      dummy(44, 0, -47, Wd, { eixo: 'z', amplitude: 2, velocidade: 0.9 }),
      dummy(32.5, 0, -45.2, Wd),
      dummy(39, 0, -31, Wd, { eixo: 'z', amplitude: 3, velocidade: 0.8 }),
      dummy(51, 0, -27, Wd),
      dummy(31.5, 0, -24, Wd),
      // Cemetery: mausoleum (inside and on the roof), the ghost's grave, the chapel.
      dummy(19, 0, -31, Wd),
      dummy(19, 4.45, -31, Wd),
      dummy(7.5, 0, -18, Wd),
      dummy(-20, 0, -29.5, E),
      // Village, mansion hall, park, plaza.
      dummy(12, 0, -1.2, Wd, { eixo: 'x', amplitude: 3, velocidade: 1.1 }),
      dummy(-40, 0, 2, E),
      dummy(30, 0, 24.6, S),
      dummy(0, 0.6, 40.5, S),
    ],
    objetos: {
      coletaveis: PICKUPS.halloween.map((k) => ({ id: k.id, tipo: k.kind, p: [...k.p] as Vec3 })),
      bruxa: [...WITCHES.halloween!] as Vec3,
      ratos: RATS.halloween.map((k) => ({ id: k.id, p: [...k.p] as Vec3 })),
      peixes: [],
    },
    servicos: { luzes: 10 },
  };
}

export function pieces(r: Recorder) {
  const { b, rand } = r;
  let pumpkinCount = 0;
  let scarecrowCount = 0;
  /** A light spot; `bulb` also draws a glowing bulb there (hanging lamps). */
  const light = (x: number, y: number, z: number, o: { color?: number; intensity?: number; range?: number; flicker?: number; bulb?: boolean } = {}) =>
    r.place('luz', { cor: o.color, intensidade: o.intensity, alcance: o.range, piscar: o.flicker, lampada: o.bulb }, { p: [x, y, z] });
  /** A bulb hanging on its cord from a ceiling at `top`. */
  const hangingLamp = (x: number, top: number, z: number, o: { intensity?: number; range?: number } = {}) => r.place('lampadaPendurada', { intensidade: o.intensity, alcance: o.range }, { p: [x, top, z] });
  /** Candles in a wall bracket (`out`: the direction away from the wall). */
  const sconce = (x: number, y: number, z: number, out: [number, number]) => r.place('arandela', { para: out }, { p: [x, y, z] });
  /** An enterable house with a bulb hanging in the middle of its ground floor. */
  const home = (s: HouseSpec) =>
    r.place('casaAssombrada', { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, andares: s.stories, pe: s.h, parede: s.wall, cor: s.tint, telhado: s.roof, cumeeira: s.ridge, subida: s.rise, portas: s.doors, larguraPorta: s.doorW, janelas: s.windows, superiores: s.upper, tabuas: s.boarded, moldura: s.frame });
  const decal = (x0: number, z0: number, x1: number, z1: number, y: number, surface: SurfaceKey, tint: number) => b.span(x0, y - 0.01, z0, x1, y, z1, surface, { tint, collide: false, castShadow: false });
  const slabWithHoles = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, holes: Rect[], surface: SurfaceKey, o: { tint?: number; collide?: boolean; castShadow?: boolean } = {}) =>
    r.place('lajeComFuros', { x0, z0, x1, z1, y0, y1, furos: holes.map((h) => ({ ...h })), superficie: surface, cor: o.tint, colide: o.collide, sombra: o.castShadow });
  const tree = (x: number, z: number, scale: number, o: { tint?: number; collide?: boolean; y?: number; branches?: number } = {}) =>
    r.place('arvoreMorta', { cor: o.tint, colide: o.collide, galhos: o.branches }, { p: [x, o.y ?? 0, z], escala: scale });
  const tombstone = (x: number, z: number, yaw: number, kind: TombKind, tint?: number, epitafio?: string[]) => r.place('lapide', { tipo: kind, cor: tint, epitafio }, { p: [x, 0, z], yaw });
  const signBoard = (lines: string[], x: number, z: number, yaw: number, o: { bg?: string; fg?: string; height?: number; w?: number; h?: number; tilt?: number } = {}) =>
    r.place('placa', { linhas: lines, fundo: o.bg, texto: o.fg, altura: o.height, largura: o.w, alturaPlaca: o.h, inclinacao: o.tilt }, { p: [x, 0, z], yaw });
  const ironFence = (axis: 'x' | 'z', fixed: number, a: number, end: number, gaps: [number, number][] = [], h?: number) => r.place('grade', { eixo: axis, fixo: fixed, de: a, ate: end, vaos: gaps, altura: h });
  const gateArch = (axis: 'x' | 'z', fixed: number, s0: number, s1: number, text: string) => r.place('arcoPortao', { eixo: axis, fixo: fixed, de: s0, ate: s1, texto: text });
  const hedge = (axis: 'x' | 'z', fixed: number, a: number, end: number, gaps: [number, number][] = []) => r.place('sebe', { eixo: axis, fixo: fixed, de: a, ate: end, vaos: gaps });
  const railing = (axis: 'x' | 'z', fixed: number, a: number, end: number, y: number, o: { h?: number; tint?: number }) => r.place('corrimao', { eixo: axis, fixo: fixed, de: a, ate: end, y, altura: o.h, cor: o.tint });
  const candle = (x: number, y: number, z: number, h?: number) => r.place('vela', { altura: h }, { p: [x, y, z] });
  const crate = (x: number, y: number, z: number, s: number, yaw: number) => r.place('caixote', {}, { p: [x, y, z], escala: s, yaw: yaw || undefined });
  const hayBale = (x: number, y: number, z: number, yaw: number, size: Vec3) => r.place('fardoFeno', { tamanho: size }, { p: [x, y, z], yaw: yaw || undefined });
  const barrel = (x: number, y: number, z: number, rr?: number, h?: number, tint?: number) => r.place('barril', { raio: rr, altura: h, cor: tint }, { p: [x, y, z] });
  const table = (x: number, y: number, z: number, w: number, d: number, yaw: number, h: number, tint: number) => r.place('mesa', { largura: w, profundidade: d, altura: h, cor: tint }, { p: [x, y, z], yaw: yaw || undefined });
  const chair = (x: number, y: number, z: number, yaw: number, tint: number, seat?: number) => r.place('cadeira', { cor: tint, assento: seat }, { p: [x, y, z], yaw: yaw || undefined });
  const car = (x: number, z: number, color: number, yaw: number) => r.place('carro', { cor: color }, { p: [x, 0, z], yaw: yaw || undefined });
  const pumpkin = (x: number, y: number, z: number, yaw: number, s: number) => r.place('abobora', {}, { p: [x, y, z], yaw: yaw || undefined, escala: s, prop: `abobora:${pumpkinCount++}` });
  const staticPumpkin = (x: number, y: number, z: number, yaw: number, rr: number) => r.place('aboboraEstatica', { raio: rr }, { p: [x, y, z], yaw });
  const stall = (x: number, z: number, yaw: number, color: number) => r.place('barraca', { cor: color }, { p: [x, 0, z], yaw: yaw || undefined });
  const glowBox = (sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number) => r.glow(color, 'caixa', [sx, sy, sz], [['translate', x, y, z]]);

  // --- Ground: one slab with the three stairwells down to the sewer -----------------------------------
  const H_MANSION: Rect = { x0: -54, z0: 6.4, x1: -54 + stairRun(4), z1: 7.9 };
  const H_PLAZA: Rect = { x0: -19.2, z0: 34.6, x1: -17.4, z1: 34.6 + stairRun(4) };
  const H_PARK: Rect = { x0: 22.2, z0: 30 - stairRun(4), x1: 24.2, z1: 30 };
  slabWithHoles(-W, -D, W, D, CEIL, 0, [H_MANSION, H_PLAZA, H_PARK], 'grama', { tint: C.grass, castShadow: false });
  // Region floors (decals): the forest floor, the cemetery's dead grass, the park and the plaza.
  decal(-W, -D, 18, -37, 0.005, 'grama', C.grassDark);
  decal(-W, -37, -28, -11, 0.005, 'grama', C.grassDark);
  decal(-28, -36, 28, -14, 0.005, 'grama', 0x5e5e40);
  slabWithHoles(20, 13.5, 58, 30.4, 0, 0.012, [H_PARK], 'pedra', { tint: 0x6a5a62, collide: false, castShadow: false });
  slabWithHoles(-45, 31.6, 45, D, 0, 0.012, [H_PLAZA], 'pedra', { tint: 0x5f5a58, collide: false, castShadow: false });
  // Roads: the Estrada Maldita (east -> west, then south to the village) and the village street.
  decal(18, -50, W, -44, 0.02, 'asfalto', C.asphalt);
  decal(36, -44, 42, -2.5, 0.02, 'asfalto', C.asphalt);
  decal(-23, -2.5, 42, 2.5, 0.02, 'asfalto', C.asphalt);
  for (let x = 22; x < W; x += 6) decal(x, -47.12, x + 2.4, -46.88, 0.025, 'pintura', 0x9a9070);
  decal(-23, -4, 34, -2.5, 0.03, 'calcada', 0x6e6a66);
  decal(-23, 2.5, 34, 4, 0.03, 'calcada', 0x6e6a66);
  // Paths: cemetery cross, forest trails, the way from the cemetery to the mansion.
  decal(-1.2, -36, 1.2, -14, 0.015, 'pedra', C.path);
  decal(-28, -25.5, 28, -23.5, 0.015, 'pedra', C.path);
  decal(-1.2, -46, 1.2, -36, 0.015, 'grama', C.dirt);
  decal(-33, -47, 18, -45, 0.015, 'grama', C.dirt);
  decal(-45, -25.5, -28, -23.5, 0.015, 'grama', C.dirt);
  decal(-45, -23.5, -43, -11, 0.015, 'grama', C.dirt);

  // --- Perimeter: tall stone wall, and dead trees beyond it (silhouettes) -----------------------------
  const wallH = 4.5;
  const stoneWall = { tint: 0x4e4a50 };
  b.span(-W - 1, 0, -D - 1, W + 1, wallH, -D, 'pedra', stoneWall);
  b.span(-W - 1, 0, D, W + 1, wallH, D + 1, 'pedra', stoneWall);
  b.span(-W - 1, 0, -D, -W, wallH, D, 'pedra', stoneWall);
  b.span(W, 0, -D, W + 1, wallH, D, 'pedra', stoneWall);
  for (const [x0, z0, x1, z1] of [[-W - 1.15, -D - 1.15, W + 1.15, -D + 0.15], [-W - 1.15, D - 0.15, W + 1.15, D + 1.15], [-W - 1.15, -D, -W + 0.15, D], [W - 0.15, -D, W + 1.15, D]]) {
    b.span(x0, wallH, z0, x1, wallH + 0.18, z1, 'pedra', { tint: 0x3a363c, collide: false });
  }
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2 + rand() * 0.1;
    const rr = 1 + 0.12 + rand() * 0.2;
    tree(Math.cos(a) * W * rr * 1.08, Math.sin(a) * D * rr * 1.1, 1.6 + rand() * 1.2, { collide: false, tint: 0x241a1e });
  }

  // --- Forest (north and north-west) with the twisted tree ---------------------------------------------
  const keepOut: Rect[] = [
    { x0: -49, z0: -53, x1: -31, z1: -39 }, // cabin
    { x0: -36, z0: -48.5, x1: 19, z1: -43.5 }, // trail to the cabin and the road
    { x0: -2.5, z0: -48, x1: 2.5, z1: -36 }, // trail to the cemetery
    { x0: -46.5, z0: -27, x1: -27, z1: -22 }, // trail to the mansion
    { x0: -46.5, z0: -27, x1: -41.5, z1: -11 },
    { x0: 0, z0: -50, x1: 9, z1: -40 }, // twisted tree
    ...[[-22, -41], [-50, -52], [12, -52], [-30, -50], [-52, -20], [-8, -40]].map(([x, z]) => ({ x0: x - 2.2, z0: z - 2.2, x1: x + 2.2, z1: z + 2.2 })), // mushrooms
  ];
  const trees: [number, number][] = [];
  const free = (x: number, z: number) => !keepOut.some((k) => x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1) && trees.every(([tx, tz]) => Math.hypot(tx - x, tz - z) > 3.4);
  // Trees that would hide something are still drawn from `rand` (into a builder that keeps nothing), so every
  // tree, tombstone and potion after them keeps its place; they don't become pieces.
  const clearOf: [number, number][] = [[-36.5, -39.6]]; // the witch's sign
  const nowhere = { addGeometry() {}, cuboidCollider() {} } as unknown as MapBuilder;
  const plant = (x0: number, z0: number, x1: number, z1: number, n: number) => {
    for (let tries = 0, placed = 0; placed < n && tries < n * 30; tries++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      if (!free(x, z)) continue;
      trees.push([x, z]);
      placed++;
      const hidden = clearOf.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 2);
      const scale = 0.85 + rand() * 0.5;
      if (hidden) deadTree(nowhere, x, z, scale, rand);
      else tree(x, z, scale);
    }
  };
  plant(-58, -53.5, 17, -38, 34);
  plant(-58, -37, -30, -13, 18);
  tree(4.5, -42.5, 2.7, { branches: 10, tint: 0x2e2026 });
  for (let k = 0; k < 14; k++) {
    const x = -56 + rand() * 72;
    const z = -53 + rand() * 14;
    if (free(x, z)) {
      const sx = 0.7 + rand() * 0.6;
      const sy = 0.5 + rand() * 0.5;
      const sz = 0.7 + rand() * 0.5;
      r.place('rocha', { tamanho: [sx, sy, sz], cor: 0x5a5850 }, { p: [x, 0, z] });
    }
  }
  // Glowing mushrooms: decorative clusters, and three that light up when shot (a secret's ingredient).
  const shroomGlow = [0x6affd8, 0xb46aff, 0x6ad8ff];
  for (const [cx, cz] of [[-22, -41], [-50, -52], [12, -52], [-30, -50], [-52, -20], [-8, -40]]) {
    for (let k = 0; k < 5; k++) {
      const x = cx + (rand() - 0.5) * 2.4;
      const z = cz + (rand() - 0.5) * 2.4;
      const s = 0.5 + rand() * 0.6;
      b.cylinder(x, 0, z, 0.04 * s, 0.25 * s, 'pintura', { tint: 0xd8d2c0, collide: false, castShadow: false, segments: 5 });
      r.glow(shroomGlow[k % 3], 'esfera', [0.14 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2], [['scale', 1, 0.6, 1], ['translate', x, 0.24 * s, z]]);
    }
  }
  r.place('cogumelosBrilho', { pontos: [[-21, 0, -40], [-49, 0, -51], [13, 0, -51.5]] });

  // Witch's cabin: the witch stirring the cauldron in the middle, shelves full of potions along the back
  // wall, a worktable, the broom by the door. Standing near her you can drink her potion.
  home({ x0: -47, z0: -51, x1: -33, z1: -41, h: 4.6, wall: 'madeira', tint: 0x4a3a2e, roof: 0x2e3a2a, ridge: 'x', rise: 3.4, doors: { s: [-40], e: [-46] }, windows: { w: [-46], n: [-40.5] }, frame: 0x2a1a12 });
  b.span(-46.6, 3.0, -50.8, -45.2, 9.4, -49.4, 'pedra', { tint: C.stoneDark });
  for (const sx of [-44.5, -36.7]) r.place('estantePocoes', {}, { p: [sx, 0, -50.62] });
  table(-35.2, 0, -49.6, 1.4, 0.8, 0, 0.8, 0x4a3020);
  for (const [px, pz, kind, c] of [[-35.6, -49.8, 0, 0x6affd8], [-35.3, -49.4, 1, 0xff6ad8], [-34.8, -49.75, 2, 0xffb43a]] as const) r.place('pocao', { forma: kind, cor: c }, { p: [px, 0.8, pz], escala: 1.3 });
  b.box(-34.85, 0.82, -49.35, 0.36, 0.04, 0.26, 'pintura', { tint: 0xd8c8a0, collide: false });
  candle(-35.7, 0.8, -49.3, 0.14);
  // The broom leaning by the south door.
  b.box(-38.4, 0.75, -41.5, 0.05, 1.5, 0.05, 'madeira', { tint: 0x8a6a3a, collide: false, rot: new THREE.Euler(0.22, 0, 0) });
  b.box(-38.4, 0.14, -41.38, 0.3, 0.32, 0.18, 'feno', { tint: 0xc8a050, collide: false, rot: new THREE.Euler(0.22, 0, 0) });
  r.place('bruxa', {}, { p: [...WITCHES.halloween!] as Vec3, yaw: Math.PI / 2, prop: 'bruxa' });
  r.place('caldeirao', { area: { x0: -46.3, x1: -33.7, z0: -50.2, z1: -41.7 } }, { p: [-40, 0, -46], prop: 'caldeirao' });
  signBoard(['CUIDADO', 'Bruxa trabalhando', '(e de mau humor)'], -36.5, -39.6, 0, { bg: '#4a3a5a', fg: '#e6d8ff', height: 1.3 });

  // --- Cemetery -----------------------------------------------------------------------------------------
  ironFence('x', -36, -28, 28, [[-1.5, 1.5]]);
  ironFence('x', -14, -28, 28, [[-9.75, -7.75], [7, 9], [21, 24]]);
  ironFence('z', -28, -36, -14, [[-25.5, -23.5]]);
  ironFence('z', 28, -36, -14, [[-26, -22]]);
  gateArch('z', 28, -26, -22, 'CEMITÉRIO');
  gateArch('x', -36, -1.5, 1.5, 'SAÍDA ?');

  // Chapel with the bell tower over its door (east).
  {
    const cw = { tint: 0x7d7872, frame: { surface: 'pintura' as const, tint: 0x2a2428, width: 0.1 } };
    const op = (c: number): Opening => [c - 0.85, c + 0.85, 0, 2.4];
    b.wall('x', -33, -26, -16, 0.3, 4.6, 'pedra', [op(-23)], 0, cw);
    b.wall('x', -26, -26, -16, 0.3, 4.6, 'pedra', [op(-21)], 0, cw);
    b.wall('z', -26, -32.85, -26.15, 0.3, 4.6, 'pedra', [], 0, cw);
    b.wall('z', -16, -32.85, -26.15, 0.3, 4.6, 'pedra', [[-30.4, -28.6, 0, 2.6]], 0, cw);
    b.span(-25.85, 0, -32.85, -16.15, 0.02, -26.15, 'piso', { tint: 0x5a3a2e, collide: false, castShadow: false });
    b.span(-25.85, 4.4, -32.85, -16.15, 4.6, -26.15, 'concreto', { tint: 0x5a5458 });
    b.room({ x: -25.85, y: 0, z: -32.85 }, { x: -16.15, y: 4.4, z: -26.15 }, 1);
    b.gableRoof(-26, -33, -16, -26, 4.6, 3.2, 'telhado', { tint: C.roof, ridgeAxis: 'x', gableSurface: 'pedra', gableTint: 0x7d7872 });
    // Stained glass (painted on the walls, inside and out) and the rose window over the altar.
    const stained = [0xc23a5a, 0x3a6ac2, 0xe6b23a, 0x5ac23a];
    for (const [k, x] of [-24.4, -18.6].entries()) {
      for (const z of [-33.18, -32.82, -26.18, -25.82]) glowBox(1.0, 1.6, 0.02, x, 2.9, z, stained[(k + (z > -30 ? 2 : 0)) % 4]);
    }
    r.glow(0xb03ac2, 'cilindro', [0.7, 0.7, 0.02, 12], [['rotateZ', Math.PI / 2], ['translate', -26.17, 5.6, -29.5]]);
    // Pews (crouch cover) and the altar with candles.
    for (const x of [-23.6, -21.8, -20, -18.2]) for (const z of [-31.15, -27.85]) r.place('bancoIgreja', { comprimento: 1.5, cor: C.wood }, { p: [x, 0, z], yaw: -Math.PI / 2 });
    b.span(-25.8, 0, -30.6, -25, 1.05, -28.4, 'pedra', { tint: 0x9a948c });
    for (const z of [-30.3, -29.8, -29.2, -28.7]) candle(-25.4, 1.05, z, 0.24);
    light(-24.6, 1.8, -29.5, { intensity: 14, range: 11, flicker: 0.6 });
    // Standing candelabras by the door, and a lantern in the tower's vestibule.
    for (const z of [-32.3, -26.7]) {
      b.cylinder(-17.2, 0, z, 0.18, 0.08, 'metal', { tint: C.iron, segments: 8 });
      b.cylinder(-17.2, 0.08, z, 0.04, 1.4, 'metal', { tint: C.iron, segments: 6 });
      b.box(-17.2, 1.5, z, 0.5, 0.04, 0.04, 'metal', { tint: C.iron, collide: false });
      for (const dz of [-0.22, 0, 0.22]) r.glow(C.candle, 'cone', [0.035, 0.1, 5], [['translate', -17.2, 1.62, z + dz]]);
      light(-17.5, 1.9, z, { intensity: 9, range: 9, flicker: 0.6 });
    }
    hangingLamp(-14.5, 7.8, -29.5, { intensity: 8, range: 8 });
    // Bell tower (the vestibule is its ground floor), open belfry, the bell.
    const tw = { tint: 0x77726c };
    b.wall('x', -31, -15.85, -13, 0.3, 8, 'pedra', [], 0, tw);
    b.wall('x', -28, -15.85, -13, 0.3, 8, 'pedra', [], 0, tw);
    b.wall('z', -13, -30.85, -28.15, 0.3, 8, 'pedra', [[-30.3, -28.7, 0, 2.6]], 0, { ...tw, frame: { surface: 'pintura', tint: 0x2a2428, width: 0.1 } });
    // The tower's west face above the chapel roof (the gable only covers a triangle under it).
    b.wall('z', -16, -31.15, -27.85, 0.3, 3.4, 'pedra', [], 4.6, tw);
    b.span(-16.15, 7.8, -31.15, -12.85, 8.0, -27.85, 'pedra', { tint: 0x5a5650 });
    b.room({ x: -15.85, y: 0, z: -30.85 }, { x: -13.15, y: 7.8, z: -28.15 }, 1);
    for (const [x, z] of [[-16, -31], [-13, -31], [-13, -28], [-16, -28]]) b.box(x, 9.3, z, 0.35, 2.6, 0.35, 'pedra', { tint: 0x77726c });
    r.shape('telhado', C.roof, 'cone', [2.5, 3.6, 4], [['rotateY', Math.PI / 4], ['translate', -14.5, 10.6 + 1.8, -29.5]]);
    b.box(-14.5, 10.5, -29.5, 3.3, 0.2, 3.3, 'pedra', { tint: 0x5a5650, collide: false });
    b.box(-14.5, 10.25, -29.5, 0.12, 0.3, 2.6, 'madeira', { tint: C.woodDark, collide: false });
  }
  // The chapel bell: rung five times in a row, someone complains from the tower.
  r.place('sino', { tamanho: 1.1, som: [-14.5, 9.5, -29.5], alto: true, bolha: { p: [-14.5, 13.2, -29.5], largura: 4, texto: 'EU JÁ OUVI.', toques: 5 } }, { p: [-14.5, 10.1, -29.5], prop: 'sinocapela' });

  // Mausoleum: a corridor between four burial rooms, doors on three sides, roof reached by the stairs.
  {
    const mw = { tint: 0x7a766e, frame: { surface: 'pintura' as const, tint: 0x3a363a, width: 0.12 } };
    const op = (c: number, w = 1.7): Opening => [c - w / 2, c + w / 2, 0, 2.5];
    const h = 4.2;
    b.wall('x', -35, 14, 24, 0.4, h, 'pedra', [], 0, mw);
    b.wall('x', -27, 14, 24, 0.4, h, 'pedra', [op(17)], 0, mw);
    b.wall('z', 14, -34.8, -27.2, 0.4, h, 'pedra', [op(-31, 1.8)], 0, mw);
    b.wall('z', 24, -34.8, -27.2, 0.4, h, 'pedra', [op(-31, 1.8)], 0, mw);
    const inner = { tint: 0x6a665e };
    b.wall('x', -32.3, 14.2, 23.8, 0.3, h, 'pedra', [op(16.5), op(21.5)], 0, inner);
    b.wall('x', -29.7, 14.2, 23.8, 0.3, h, 'pedra', [op(16.5), op(21.5)], 0, inner);
    b.wall('z', 19, -34.8, -32.45, 0.3, h, 'pedra', [], 0, inner);
    b.wall('z', 19, -29.55, -27.2, 0.3, h, 'pedra', [], 0, inner);
    b.span(14.2, 0, -34.8, 23.8, 0.02, -27.2, 'pedra', { tint: 0x4a4644, collide: false, castShadow: false });
    b.span(13.8, h, -35.2, 24.2, h + 0.25, -26.8, 'pedra', { tint: 0x5a5650 });
    b.room({ x: 14.2, y: 0, z: -34.8 }, { x: 23.8, y: h, z: -27.2 }, 1);
    const top = h + 0.25;
    const par = { tint: 0x6a665e };
    b.span(13.8, top, -35.2, 24.2, top + 0.9, -34.95, 'pedra', par);
    b.span(13.8, top, -34.95, 14.05, top + 0.9, -26.8, 'pedra', par);
    b.span(23.95, top, -34.95, 24.2, top + 0.9, -26.8, 'pedra', par);
    b.span(14.05, top, -27.05, 22.2, top + 0.9, -26.8, 'pedra', par);
    // Its top step lands right at the gap in the parapet.
    b.stairs('x', 1, 23.9 - stairRun(top), -26.75, -25.55, 0, top, 'pedra', { tint: 0x6a665e });
    // Porch with columns on the west side, facing the graves.
    for (const z of [-32.7, -29.3]) b.cylinder(13.1, 0, z, 0.25, h, 'pedra', { tint: 0x8a867e, segments: 10 });
    b.span(12.6, h, -33.3, 14, h + 0.3, -28.7, 'pedra', { tint: 0x5a5650 });
    b.room({ x: 12.6, y: 0, z: -33.3 }, { x: 13.8, y: h, z: -28.7 }, 0.4); // roofed, open on three sides
    // Coffins in the burial rooms (not the north-west one: its outer door lines up with the corridor's).
    for (const [x, z] of [[16.5, -33.6], [21.5, -33.6], [21.5, -28.4]]) r.place('caixao', { cor: 0x3a2420 }, { p: [x, 0, z], yaw: Math.PI / 2 });
    sconce(19.3, 2.2, -32.13, [0, 1]);
    sconce(19.3, 2.2, -29.87, [0, -1]);
    r.place('placaParede', { texto: 'FAMÍLIA DESCANSO', largura: 2.6, altura: 0.65, estilo: 'tumulo' }, { p: [12.58, h + 0.15, -31], yaw: -Math.PI / 2 });
  }

  // Tombstones: rows broken by the paths, a few with epitaphs, and the ghost's grave.
  const kinds: TombKind[] = ['arco', 'arco', 'arco', 'arco', 'cruz', 'cruz', 'laje', 'obelisco'];
  const special: [number, number, TombKind, string[]][] = [
    [-3.5, -20.5, 'arco', ['AQUI JAZ', 'JOÃO', 'ELE DISSE QUE', 'NÃO IA CLICAR.', 'CLICOU.']],
    [-3.5, -28, 'arco', ['DESCONHECIDO', 'PROVAVELMENTE', 'FOI FLANQUEADO.']],
    [3.5, -31.5, 'arco', ['AQUI JAZ', 'O CAMPEÃO', 'DE ESCONDE-', 'ESCONDE']],
    [-7.2, -16.6, 'laje', ['R.I.P.', 'LAG']],
    [9.6, -28, 'arco', ['VOLTO JÁ']],
    [5, -22.1, 'arco', ['AQUI JAZ', 'UM FANTASMA', 'COM SONO']],
  ];
  for (const [x, z, kind, lines] of special) tombstone(x, z, 0, kind, undefined, lines);
  for (let x = -12; x <= 11.5; x += 2.4) {
    if (Math.abs(x) < 2) continue;
    for (const z of [-34, -31.5, -29, -21.6, -19, -16.6]) {
      if (special.some(([sx, sz]) => Math.abs(sx - x) < 1.6 && Math.abs(sz - z) < 1.6)) continue;
      if (x > 2 && x < 8.5 && z > -24 && z < -17) continue; // the ghost's grave
      if (x < -10 && z > -32 && z < -27) continue; // the way into the bell tower
      if (rand() < 0.22) continue;
      const tx = x + (rand() - 0.5) * 0.5;
      const tz = z + (rand() - 0.5) * 0.4;
      const yaw = (rand() - 0.5) * 0.3;
      const kind = kinds[Math.floor(rand() * kinds.length)];
      tombstone(tx, tz, yaw, kind, rand() < 0.3 ? 0x7a7a70 : C.stone);
    }
  }
  for (const [x, z] of [[-10.5, -35], [12, -17], [-14.5, -18], [26, -34.5], [11, -35]]) tree(x, z, 1 + rand() * 0.3);
  r.place('fantasma', {}, { p: [5, 0, -20.4], prop: 'fantasma' });
  b.box(6.4, 0.5, -19.2, 0.06, 1.0, 0.25, 'metal', { tint: 0x5a5a60, collide: false, rot: new THREE.Euler(0, 0.3, 0.35) }); // the shovel

  // --- Estrada Maldita: the road in, the barn, the roadside ---------------------------------------------
  signBoard(['BEM-VINDO.', 'Se você chegou até aqui,', 'já era.'], 47, -42.4, Math.PI / 2, { bg: '#d9c8a6', fg: '#5a1a1a', height: 1.6, w: 1.8, h: 1.0, tilt: 0.12 });
  signBoard(['NÃO ENTRE.'], 31.2, -27.6, Math.PI / 2, { bg: '#e8e0d0', fg: '#a01a1a', height: 1.4, w: 1.4, h: 0.6 });
  signBoard(['ENTRADA →'], 31.2, -19.5, Math.PI / 2, { bg: '#d8342a', fg: '#ffffff', height: 2.0, w: 2.6, h: 0.9 });
  // The car's horn: six honks in a row and the neighbour up the road complains.
  r.place('carroBuzina', { cor: 0x4a5a6a, vizinho: [51, 9.6, -29], fala: 'CHEGA.' }, { p: [30, 0, -47], yaw: 0.3, prop: 'buzina' });
  car(39.2, -20, 0x6a3a2a, Math.PI / 2 + 0.25);
  home({ x0: 46, z0: -34, x1: 56, z1: -24, h: 4.4, wall: 'madeira', tint: 0x6a2a24, roof: C.roof, ridge: 'z', rise: 3.6, doorW: 3, doors: { w: [-29], e: [-29], s: [51] }, windows: { n: [51] }, frame: 0xd8cfb8 });
  for (const [x, y, z, yaw] of [[48.0, 0, -33.0, 0], [49.3, 0, -33.0, 0], [48.65, 0.5, -33.0, 0.05], [48.6, 0, -32.3, 0], [54.2, 0, -26.2, Math.PI / 2], [54.2, 0.5, -26.2, Math.PI / 2 + 0.1], [52.5, 0, -31.2, 0.6]] as const) hayBale(x, y, z, yaw, [1.2, 0.5, 0.6]);
  for (const [x, z] of [[44, -40], [58.5, -33], [33, -40], [47, -18], [57, -16], [32, -10], [24, -52], [58, -53]]) tree(x, z, 1 + rand() * 0.4);
  tombstone(44.5, -36.5, -0.4, 'cruz');
  tombstone(53.5, -40.2, 0.3, 'arco');
  car(50, -3, 0x3a5a3a, 0.6);
  car(55.5, 6, 0x5a2a4a, -0.2);
  for (const [x, z, y, yaw] of [[46, 8, 0, 0.1], [47.15, 8, 0, -0.1], [46.6, 8.1, 0.95, 0.3], [57, -9, 0, 0.4]] as const) crate(x, y, z, 0.95, yaw);
  // Vending machine (a gag for later): lit front with rows of cans, buttons, the coin slot and the tray.
  r.place('maquinaRefrigerante', {}, { p: [58.9, 0, -2], yaw: -Math.PI / 2 });

  // --- Mansion ------------------------------------------------------------------------------------------
  const M = { x0: -56, z0: -8, x1: -30, z1: 12 };
  const MWH = FH * 2 + 0.2;
  // The hall's open void up to the ceiling. Its east edge leaves the east gallery wide enough to reach the
  // upstairs door over the hall (x -35), in one straight railing.
  const hall = { x0: -43.1, z0: -0.5, x1: -36.2, z1: 5.85 };
  {
    const t = 0.3;
    const ext = { tint: C.mansion, frame: { surface: 'pintura' as const, tint: C.trim, width: 0.12 } };
    const door = (c: number, w = 1.7, h = 2.4): Opening => [c - w / 2, c + w / 2, 0, h];
    const win = (c: number): Opening => [c - 1, c + 1, 0.9, 2.3];
    const up = (c: number): Opening => [c - 0.9, c + 0.9, FH + 0.9, FH + 2.2];
    b.wall('x', M.z0, M.x0, M.x1, t, MWH, 'reboco', [door(-50), door(-36), win(-53), win(-46), win(-40), win(-33), up(-53), up(-47.5), up(-39), up(-33)], 0, ext);
    b.wall('x', M.z1, M.x0, M.x1, t, MWH, 'reboco', [door(-50), door(-36), win(-53), win(-46), win(-40), win(-33), up(-53), up(-47.5), up(-39), up(-33)], 0, ext);
    b.wall('z', M.x0, M.z0 + t / 2, M.z1 - t / 2, t, MWH, 'reboco', [door(2, 2), win(-5), win(9), up(-5), up(2), up(9)], 0, ext);
    b.wall('z', M.x1, M.z0 + t / 2, M.z1 - t / 2, t, MWH, 'reboco', [door(2, 2.4, 2.8), win(-5), win(9), up(-5), up(2), up(9)], 0, ext);
    // Interior walls: the hall band (z -2..6) between the north rooms (dining, library) and the south
    // rooms (kitchen, parlor); every room has two or more ways in. Same layout upstairs.
    const wallpaper = { tint: 0x8a4656, frame: { surface: 'pintura' as const, tint: 0x3a2420, width: 0.08 } };
    const ix0 = M.x0 + t / 2;
    const ix1 = M.x1 - t / 2;
    const iz0 = M.z0 + t / 2;
    const iz1 = M.z1 - t / 2;
    for (const [y0, h] of [[0, FH - 0.25], [FH, FH]] as const) {
      b.wall('x', -2, ix0, ix1, 0.25, h, 'reboco', [door(-48), door(-38)], y0, wallpaper);
      b.wall('x', 6, ix0, ix1, 0.25, h, 'reboco', [door(-47), door(-35)], y0, wallpaper);
      b.wall('z', -43, iz0, -2.125, 0.25, h, 'reboco', [door(-5)], y0, wallpaper);
      // Downstairs the kitchen-parlor door is by the hall, to leave the wall to the fireplace.
      b.wall('z', -43, 6.125, iz1, 0.25, h, 'reboco', [door(y0 === 0 ? 7 : 9)], y0, wallpaper);
    }
    slabWithHoles(ix0, iz0, ix1, iz1, 0, 0.02, [H_MANSION], 'piso', { tint: 0x8a5e44, collide: false, castShadow: false });
    slabWithHoles(ix0, iz0, ix1, iz1, FH - 0.25, FH, [hall], 'piso', { tint: 0x8a5e44 });
    b.span(ix0, FH * 2, iz0, ix1, MWH, iz1, 'concreto', { tint: 0x4e4246 });
    b.room({ x: ix0, y: 0, z: iz0 }, { x: ix1, y: FH * 2, z: iz1 }, 1);
    // Grand staircase along the hall's south side, landing on the west gallery; railings around the void.
    b.stairs('x', -1, -38.5, 3.6, 5.75, 0, FH, 'madeira', { tint: 0x4a1e24 });
    const rail = { h: 1.0, tint: 0x2a1a14 };
    railing('x', hall.z0, hall.x0, hall.x1, FH, rail);
    railing('z', hall.x1, hall.z0, hall.z1, FH, rail);
    railing('z', hall.x0, hall.z0, 3.5, FH, rail);
    decal(-55.5, 1.2, -30.5, 2.8, 0.03, 'pintura', 0x7a1a24); // red carpet from door to door
    // Roof, chimneys and the lit cupola on the ridge (seen from the whole map).
    b.gableRoof(M.x0, M.z0, M.x1, M.z1, MWH, 4.0, 'telhado', { tint: 0x2e2834, ridgeAxis: 'x', gableSurface: 'reboco', gableTint: C.mansion });
    b.span(-52.6, MWH, -4.6, -51.4, MWH + 5.2, -3.4, 'tijolo', { tint: 0x4a3a3a, collide: false });
    b.span(-34.6, MWH, 7.4, -33.4, MWH + 5.2, 8.6, 'tijolo', { tint: 0x4a3a3a, collide: false });
    b.span(-45, MWH + 3, 0, -41, MWH + 6.4, 4, 'reboco', { tint: C.mansion, collide: false });
    r.shape('telhado', 0x2e2834, 'cone', [3.1, 2.8, 4], [['rotateY', Math.PI / 4], ['translate', -43, MWH + 6.4 + 1.4, 2]]);
    for (const [x, z, sx, sz] of [[-43, -0.02, 1.2, 0.02], [-43, 4.02, 1.2, 0.02], [-45.02, 2, 0.02, 1.2], [-40.98, 2, 0.02, 1.2]]) glowBox(sx, 1.4, sz, x, MWH + 4.7, z, C.window);
    // Painted attic windows on both gables.
    for (const x of [M.x0 - 0.17, M.x1 + 0.17]) r.glow(C.window, 'cilindro', [0.6, 0.6, 0.02, 12], [['rotateZ', Math.PI / 2], ['translate', x, MWH + 1.6, 2]]);
    // Front porch with columns, toward the village.
    b.span(-30, 0, -1.2, -27, 0.3, 5.2, 'pedra', { tint: 0x6a6460 });
    for (const z of [-0.8, 4.8]) b.cylinder(-27.4, 0.3, z, 0.18, 3.0, 'pintura', { tint: C.trim, segments: 10 });
    b.span(-30, 3.3, -1.4, -26.9, 3.5, 5.4, 'telhado', { tint: 0x2e2834, collide: false });
    b.room({ x: -29.85, y: 0.3, z: -1.4 }, { x: -26.9, y: 3.3, z: 5.4 }, 0.4); // roofed, open on three sides
    // Hall: the clock, suits of armor, a chandelier with candles (the only warm light inside).
    for (const z of [-1.2, 5.2]) r.place('armadura', {}, { p: [-30.85, 0, z], yaw: -Math.PI / 2 });
    r.place('lustre', {}, { p: [-38.5, 5.6, 2.6] });
    light(-38.5, 5.2, 2.6, { intensity: 20, range: 10, flicker: 0.25 });
    // Candles on the walls of the hall, and a lamp in every room, upstairs too.
    sconce(-55.75, 2.2, 5.5, [1, 0]);
    sconce(-55.75, 2.2, -1.2, [1, 0]);
    hangingLamp(-32.2, FH * 2, 2.2);
    for (const [x, z] of [[-50, -5], [-36.5, -5], [-50, 9], [-36.5, 9.4], [-49, 2]]) hangingLamp(x, FH * 2, z);
    // Two portraits of the family, each one only once.
    r.place('retrato', { quem: 0 }, { p: [-44.6, 1.9, 5.86], yaw: Math.PI });
    r.place('relogio', { som: [-46, 2, -1.6] }, { p: [-46, 0, -1.58], prop: 'relogio' });
    // Dining room: the long table, chairs, candles.
    table(-49.5, 0, -5, 6.4, 1.2, 0, 0.78, 0x3a2018);
    for (let x = -52.2; x <= -46.8; x += 1.35) {
      chair(x, 0, -6.05, 0, 0x3a2018);
      chair(x, 0, -3.95, Math.PI, 0x3a2018);
    }
    chair(-53.25, 0, -5, Math.PI / 2, 0x3a2018);
    chair(-45.75, 0, -5, -Math.PI / 2, 0x3a2018);
    for (const x of [-51.5, -49.5, -47.5]) candle(x, 0.78, -5, 0.18);
    for (const x of [-52.2, -50.85, -49.5, -48.15, -46.8]) for (const z of [-5.35, -4.65]) b.cylinder(x, 0.78, z, 0.11, 0.012, 'pintura', { tint: 0xe8e4dc, collide: false, castShadow: false, segments: 12 });
    light(-49.5, 1.6, -5, { intensity: 12, range: 10, flicker: 0.5 });
    hangingLamp(-49.5, FH - 0.25, -5);
    // Library: shelves against the walls (around the doors and windows), one double-sided stack in the east
    // half for cover, and the reading desk under the north-west window, its chair facing the glass.
    r.place('estante', { largura: 1.8, altura: 2.2, dosDoisLados: false }, { p: [-42.6, 0, -6.85], yaw: Math.PI / 2 });
    r.place('estante', { largura: 1.8, altura: 2.2, dosDoisLados: false }, { p: [-42.6, 0, -3.15], yaw: Math.PI / 2 });
    r.place('estante', { largura: 1.9, altura: 2.2, dosDoisLados: false }, { p: [-37.93, 0, -7.57] });
    r.place('estante', { largura: 3 }, { p: [-33.6, 0, -5], yaw: Math.PI / 2 });
    table(-40, 0, -7.35, 1.4, 0.7, 0, 0.78, 0x3a2018);
    chair(-40, 0, -6.55, Math.PI, 0x3a2018, 0x2a4a3a);
    b.cylinder(-39.5, 0.78, -7.45, 0.07, 0.35, 'metal', { tint: 0xc8a03a, collide: false, segments: 8 });
    b.cylinder(-39.5, 1.13, -7.45, 0.2, 0.2, 'pintura', { tint: 0x2a5a3a, collide: false, radiusTop: 0.1, segments: 10 });
    light(-39.6, 1.2, -6.9, { intensity: 10, range: 8 });
    hangingLamp(-37.2, FH - 0.25, -4.6);
    // Kitchen: tiled floor, a counter with the sink under the window, the stove under its hood, the fridge,
    // a table under hanging pots, the basement stairs, and the tall cabinet with the Scooby biscuits
    // (shoot or stab it and the doors swing open).
    slabWithHoles(ix0, 6.125, -43.125, iz1, 0, 0.03, [H_MANSION], 'azulejo', { tint: 0xd8cfc0, collide: false, castShadow: false });
    const cabinetWood = { tint: 0x7a5238 };
    b.box(-53.4, 0.45, 11.52, 4.4, 0.9, 0.62, 'madeira', cabinetWood);
    b.box(-53.4, 0.925, 11.49, 4.5, 0.05, 0.7, 'pedra', { tint: 0xe0dcd4, collide: false });
    b.box(-53, 0.95, 11.45, 0.8, 0.02, 0.42, 'metal', { tint: 0x4a4a52, collide: false, castShadow: false });
    b.cylinder(-53, 0.95, 11.74, 0.02, 0.32, 'metal', { tint: 0xc8c8d0, collide: false, segments: 6 });
    b.box(-53, 1.25, 11.64, 0.03, 0.03, 0.2, 'metal', { tint: 0xc8c8d0, collide: false });
    for (let k = 0; k < 4; k++) b.box(-55.1 + k * 1.1, 0.5, 11.2, 0.9, 0.7, 0.02, 'madeira', { tint: 0x6a4630, collide: false, castShadow: false });
    b.box(-55.0, 2.05, 11.62, 1.2, 0.7, 0.42, 'madeira', cabinetWood);
    b.box(-48, 0.45, 11.45, 0.9, 0.9, 0.75, 'metal', { tint: 0x2a2a2e });
    b.box(-48, 0.91, 11.45, 0.92, 0.03, 0.77, 'metal', { tint: 0x1a1a1e, collide: false });
    for (const [px, pr, ph] of [[-48.2, 0.16, 0.22], [-47.78, 0.13, 0.14]]) b.cylinder(px, 0.93, 11.4, pr, ph, 'metal', { tint: 0x9a9aa2, collide: false, segments: 12 });
    b.box(-48, 2.1, 11.6, 1.0, 0.45, 0.5, 'metal', { tint: 0x5a5a62, collide: false });
    b.box(-48, 2.85, 11.7, 0.3, 1.05, 0.3, 'metal', { tint: 0x5a5a62, collide: false });
    b.box(-43.6, 1.0, 11.35, 0.85, 2.0, 0.8, 'metal', { tint: 0xd8d0c0 });
    b.box(-44.05, 1.2, 11.0, 0.03, 0.6, 0.04, 'metal', { tint: 0x8a8a90, collide: false });
    table(-51.4, 0, 9.7, 1.6, 0.9, 0, 0.78, 0x5a3a28);
    chair(-52.55, 0, 9.7, Math.PI / 2, 0x4a2e20, 0xd8c8a0);
    chair(-50.25, 0, 9.7, -Math.PI / 2, 0x4a2e20, 0xd8c8a0);
    b.box(-51.4, 2.9, 9.7, 1.5, 0.05, 0.05, 'metal', { tint: C.iron, collide: false, castShadow: false });
    // The rack hangs from the ceiling (FH - 0.25) by a rod at each end.
    for (const px of [-52.05, -50.75]) b.box(px, (2.925 + FH - 0.25) / 2, 9.7, 0.02, FH - 0.25 - 2.925, 0.02, 'metal', { tint: C.iron, collide: false, castShadow: false });
    for (const [px, pr] of [[-51.9, 0.14], [-51.4, 0.11], [-50.9, 0.16]]) {
      b.box(px, 2.75, 9.7, 0.015, 0.3, 0.015, 'metal', { tint: C.iron, collide: false, castShadow: false });
      b.cylinder(px, 2.42, 9.7, pr, 0.18, 'metal', { tint: 0xb87a4a, collide: false, segments: 10 });
    }
    hangingLamp(-48.6, FH - 0.25, 9.3, { intensity: 12, range: 8 });
    railing('x', H_MANSION.z1 + 0.05, H_MANSION.x0, H_MANSION.x1, 0, { h: 1.0, tint: 0x2a1a14 });
    railing('z', H_MANSION.x0 - 0.05, H_MANSION.z0, H_MANSION.z1 + 0.05, 0, { h: 1.0, tint: 0x2a1a14 });
    const [biscuit] = PICKUPS.halloween;
    r.place('armarioBiscoito', { som: [-43.7, 1.2, 9] }, { p: [-43.125 - 0.3, 0, 9], yaw: -Math.PI / 2, prop: 'armario', coletavel: biscuit.id });
    // Parlor: the fireplace on the wall shared with the kitchen, the sofa and armchairs facing it, a rug.
    b.box(-42.55, 0.75, 10, 0.6, 1.5, 2.3, 'pedra', { tint: 0x7a706a });
    b.box(-42.6, 2.45, 10, 0.5, 1.8, 1.7, 'pedra', { tint: 0x7a706a });
    b.box(-42.4, 1.55, 10, 0.85, 0.1, 2.6, 'madeira', { tint: 0x3a2418 });
    b.box(-42.24, 0.45, 10, 0.02, 0.62, 1.1, 'pintura', { tint: 0x140c0a, collide: false, castShadow: false });
    glowBox(0.02, 0.32, 0.8, -42.215, 0.32, 10, 0xff8a2a);
    for (let k = 0; k < 3; k++) b.box(-42.05, 0.2, 10, 0.1, 0.1, 0.9, 'madeira', { tint: C.woodDark, collide: false, castShadow: false, rot: new THREE.Euler(k * 1.05, 0, 0) });
    for (const z of [9.1, 10.9]) r.glow(C.candle, 'cone', [0.04, 0.11, 5], [['translate', -42.3, 1.75, z]]);
    light(-41.6, 0.8, 10, { color: 0xff8a3a, intensity: 18, range: 11, flicker: 0.8 });
    r.place('brasas', {}, { p: [-42.08, 0.25, 10] });
    b.span(-43.6, MWH, 9.4, -42.2, MWH + 4.6, 10.6, 'tijolo', { tint: 0x4a3a3a, collide: false });
    decal(-41.8, 8.4, -38.8, 11.6, 0.035, 'pintura', 0x5a2030);
    r.place('sofa', { comprimento: 2.4, cor: 0x7a2a3a }, { p: [-38.75, 0, 10], yaw: -Math.PI / 2 });
    table(-40.55, 0, 10, 0.55, 1.0, 0, 0.42, 0x3a2418);
    candle(-40.55, 0.42, 10.25, 0.12);
    // Upstairs: the children's room (NW), master bedroom (NE), storage (SW), portrait gallery (SE).
    const fy = FH;
    r.place('cama', { largura: 1.0, comprimento: 1.8, coberta: 0x5a7ab0, madeira: 0x6a4a5a }, { p: [-54.95, fy, -7.2], yaw: Math.PI / 2 });
    r.place('bauBrinquedos', {}, { p: [-45, fy, -7.45] });
    r.place('cavaloBalanco', {}, { p: [-49, fy, -4.2], yaw: 0.4 });
    r.place('cama', { largura: 1.6, comprimento: 2.0, coberta: 0x4a2a5a }, { p: [-36, fy, -6.85] });
    for (const [x, z, y, yaw] of [[-54.2, 8, 0, 0.1], [-53.1, 8, 0, -0.15], [-53.7, 8.05, 0.95, 0.3], [-54.2, 9.3, 0, 0.5], [-50, 10.8, 0, -0.3], [-46, 8.6, 0, 0.2]] as const) crate(x, fy + y, z, 0.95, yaw);
    r.place('retrato', { quem: 1 }, { p: [-35, fy + 1.8, 11.84], yaw: Math.PI });
  }
  // Mansion grounds: iron fence along the street with the gate, and toward the forest.
  ironFence('z', -23, -11, 13, [[-2.5, 2.5]]);
  gateArch('z', -23, -2.5, 2.5, 'MANSÃO');
  // The gates' lanterns light their way in.
  for (const [x, z] of [[-23, 0], [28, -24], [0, -36], [24, 13.5]]) light(x, 3.4, z, { intensity: 10, range: 11 });
  ironFence('x', -11, -W, -23, [[-45, -43], [-37, -35]]);

  // Mansion garden (south-west): hedges, the dry fountain, the family plot.
  hedge('x', 18, -58, -36, [[-51.5, -48.5]]);
  hedge('z', -30, 15, 27, [[19.5, 22.5]]);
  hedge('x', 25.5, -50, -36, [[-45, -42]]);
  {
    const fx = -42;
    const fz = 21.5;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      b.box(fx + Math.cos(a) * 2.3, 0.35, fz + Math.sin(a) * 2.3, 0.4, 0.7, 0.95, 'pedra', { tint: C.stone, rot: new THREE.Euler(0, -a, 0) });
    }
    b.cylinder(fx, 0, fz, 0.35, 1.6, 'pedra', { tint: C.stoneDark, segments: 8 });
    b.cylinder(fx, 1.6, fz, 0.5, 0.25, 'pedra', { tint: C.stone, radiusTop: 0.9, segments: 10, collide: false });
    staticPumpkin(fx, 1.85, fz, Math.PI / 2, 0.45);
  }
  ironFence('x', 19.5, -58.5, -52.5, [], 1.1);
  ironFence('x', 25, -58.5, -52.5, [[-56, -54.6]], 1.1);
  ironFence('z', -52.5, 19.5, 25, [], 1.1);
  for (const [x, z] of [[-57.5, 21], [-55.8, 21], [-54.1, 21], [-57, 23.4]]) tombstone(x, z, 0, 'arco', 0x8a867e);
  for (const [x, z] of [[-26, 16], [-33, 29], [-58, 29]]) tree(x, z, 1.1);

  // --- Village: the street and its houses ------------------------------------------------------------
  const vf = 0x2a201c;
  home({ x0: -20, z0: -12.5, x1: -11, z1: -5, wall: 'reboco', tint: 0x6a5a4a, roof: C.roofRed, doors: { s: [-15.5], n: [-13], e: [-8.75] }, windows: { s: [-18.4, -12.4], w: [-8.75] }, frame: vf });
  b.box(-18.3, 0.52, -11.2, 2.6, 1.05, 0.6, 'madeira', { tint: 0x5a3a2a }); // butcher's counter, under the hooks (clear of the west window)
  // Chest freezer against the back wall, between the north door (x -13) and the counter: the lid with its seam
  // and handle, a dark kick plate. Only the body collides.
  {
    const [fx, fz] = [-15.4, -11.6];
    const front = fz + 0.5;
    const trim = { collide: false, castShadow: false };
    b.box(fx, 0.6, fz, 1.6, 1.2, 1.0, 'metal', { tint: 0xc8c8c0 });
    b.box(fx, 1.21, fz, 1.62, 0.02, 1.02, 'metal', { tint: 0xe2e2dc, ...trim });
    b.box(fx, 1.04, front + 0.005, 1.6, 0.025, 0.01, 'metal', { tint: 0x7a7a82, ...trim });
    b.box(fx, 0.95, front + 0.03, 0.5, 0.05, 0.05, 'metal', { tint: 0x5a5a62, ...trim });
    b.box(fx, 0.05, front + 0.005, 1.6, 0.1, 0.01, 'metal', { tint: 0x3a3a40, ...trim });
  }
  for (const x of [-19, -18.2, -17.4]) b.box(x, 2.3, -11.9, 0.04, 0.5, 0.04, 'metal', { tint: 0x8a8a90, collide: false }); // hooks
  home({ x0: -6, z0: -13, x1: 6, z1: -5, stories: 2, wall: 'tijolo', tint: 0x6a3a30, roof: C.roof, doors: { s: [2], n: [3.5], w: [-9], e: [-9] }, windows: { s: [-3] }, upper: { s: [-3, 3], n: [0], e: [-9], w: [-9] }, frame: vf });
  // The mayor's safe, his desk and chair.
  r.place('cofre', {}, { p: [4.5, 0, -7], yaw: -Math.PI / 2 });
  table(-3, 0, -9, 1.8, 0.9, 0, 0.78, 0x3a2018);
  chair(-3, 0, -9.85, 0, 0x3a2018, 0x2a3a5a);
  home({ x0: 10, z0: -12.5, x1: 19, z1: -5, wall: 'madeira', tint: 0x5a5856, roof: 0x3a3838, boarded: true, doors: { s: [14.5], n: [12], e: [-8.75] }, windows: { s: [11.8, 17.3], w: [-8.75] }, frame: vf });
  home({ x0: -20, z0: 5, x1: -11, z1: 12.5, wall: 'madeira', tint: 0x7a6a3a, roof: 0x4a3a2a, doors: { n: [-15.5], s: [-13], e: [8.75] }, windows: { n: [-18.4, -12.4], w: [8.75] }, frame: vf });
  for (const [x, y, z, yaw] of [[-18.8, 0, 11.5, 0], [-17.55, 0, 11.5, 0.05], [-18.2, 0.5, 11.5, -0.08]] as const) hayBale(x, y, z, yaw, [1.2, 0.5, 0.6]);
  home({ x0: -6, z0: 5, x1: 3, z1: 12.5, wall: 'reboco', tint: 0x6a4a6a, roof: 0x2a2a3a, doors: { n: [-1.5], s: [0], w: [8.75] }, windows: { n: [-4.3, 1.5] }, frame: vf });
  // Candy counter with its jars, toward the north wall: out of the way of the west door (z 8.75) and the
  // north door (x -1.5).
  const [ccx, ccz] = [-3.8, 10.7];
  b.box(ccx, 0.5, ccz, 3, 1.0, 0.7, 'madeira', { tint: 0x8a3a6a });
  for (let k = 0; k < 5; k++) {
    const jx = ccx - 1.2 + k * 0.6;
    b.cylinder(jx, 1.0, ccz, 0.135, 0.03, 'vidro', { tint: 0xd8f0f0, collide: false, segments: 10 });
    r.glow([0xff6ad8, 0xffd23f, 0x6affd8, 0xff8a3a, 0xb46aff][k], 'cilindro', [0.11, 0.11, 0.2, 10], [['translate', jx, 1.12, ccz]]);
    b.cylinder(jx, 1.22, ccz, 0.12, 0.04, 'metal', { tint: 0xd8d8d0, collide: false, segments: 10 });
  }
  home({ x0: 9, z0: 5, x1: 15, z1: 11, wall: 'madeira', tint: 0x4a4a52, roof: C.roof, doorW: 2.4, doors: { n: [12], s: [11], e: [8] }, frame: vf });
  signBoard(['AÇOUGUE', 'Carne fresca', '(mais ou menos)'], -15.5, -4.4, 0, { bg: '#8a2a2a', fg: '#f2e6d0', height: 2.6, w: 1.4, h: 0.8 });
  signBoard(['PREFEITURA', 'Fechada desde 1892'], -2, -4.4, 0, { bg: '#2a3a4a', fg: '#e6e0d0', height: 2.6, w: 1.5, h: 0.8 });
  signBoard(['DOCES', 'ou travessuras'], 1.2, 4.4, 0, { bg: '#6a2a6a', fg: '#ffd27a', height: 2.6, w: 1.3, h: 0.75 });
  car(8, 0.9, 0x5a4a3a, 0.08);
  for (const [x, z, yaw] of [[-8.5, -3.2, 0.1], [-7.6, -3.3, -0.2], [24, 3.1, 0.3], [24.9, 3.3, 0], [-22, 3.2, 0.5]] as const) crate(x, 0, z, 0.8, yaw);
  // Back yards between the village and the plaza: fences, a shed, a well, the pumpkin patch.
  const fence = { tint: 0x5a4632 };
  b.wall('x', 17, -23, -11, 0.12, 1.5, 'madeira', [[-17.5, -15.5, 0, 1.5]], 0, fence);
  b.wall('x', 17, -6, 3, 0.12, 1.5, 'madeira', [[-2, 0, 0, 1.5]], 0, fence);
  b.wall('z', 16, 15, 30, 0.12, 1.5, 'madeira', [[21, 23, 0, 1.5]], 0, fence);
  home({ x0: -21, z0: 21, x1: -16, z1: 25, h: 2.6, wall: 'madeira', tint: 0x4a3a2a, roof: 0x3a3030, rise: 1.4, doors: { e: [23] }, windows: { n: [-18.5] }, frame: vf });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.box(-2 + Math.cos(a) * 0.95, 0.4, 22 + Math.sin(a) * 0.95, 0.3, 0.8, 0.55, 'pedra', { tint: C.stoneDark, rot: new THREE.Euler(0, -a, 0) });
  }
  for (const s of [-1, 1]) b.box(-2 + s * 0.95, 1.3, 22, 0.1, 1.8, 0.1, 'madeira', { tint: C.woodDark });
  b.gableRoof(-3.1, 21.2, -0.9, 22.8, 2.2, 0.6, 'telhado', { tint: C.roofRed, ridgeAxis: 'z', overhang: 0.2, collide: false });
  for (const [x, z] of [[-10, 26], [-26, 13], [17, 28]]) tree(x, z, 1);
  for (let k = 0; k < 9; k++) {
    const x = 8 + (k % 3) * 1.6 + rand() * 0.4;
    const z = 20 + Math.floor(k / 3) * 1.7 + rand() * 0.4;
    const yaw = rand() * 6;
    const s = 0.9 + rand() * 0.5;
    pumpkin(x, 0, z, yaw, s);
  }

  // --- Amusement park --------------------------------------------------------------------------------
  ironFence('x', 13.5, 20, 58, [[22, 26]]);
  ironFence('z', 20, 13.5, 30.4, [[19, 22]]);
  gateArch('x', 13.5, 22, 26, 'PARQUE');
  // Ticket booth next to the gate.
  b.span(27, 0, 14.2, 29, 2.4, 16.2, 'madeira', { tint: 0x7a2a4a });
  b.span(26.7, 2.4, 13.9, 29.3, 2.6, 16.5, 'pintura', { tint: 0xf07a1a, collide: false });
  glowBox(1.2, 0.6, 0.02, 28, 1.5, 16.22, 0xffd27a);
  // Shooting gallery: a booth with its counter facing south, the targets along the back wall.
  {
    const x0 = 30.5;
    const x1 = 38.5;
    const booth = { tint: 0x5a2a6a };
    b.span(x0, 0, 14.0, x1, 3.0, 14.3, 'madeira', booth);
    b.span(x0, 0, 14.3, x0 + 0.3, 3.0, 17.6, 'madeira', booth);
    b.span(x1 - 0.3, 0, 14.3, x1, 3.0, 17.6, 'madeira', booth);
    b.span(x0 + 0.3, 0, 17.2, x1 - 0.3, 1.1, 17.6, 'madeira', { tint: 0x8a3a2a });
    b.room({ x: x0 + 0.3, y: 0, z: 14.3 }, { x: x1 - 0.3, y: 3.0, z: 17.2 }, 0.6); // roofed, open on one side
    for (let k = 0; k < 8; k++) b.span(x0 - 0.2 + k * 1.05, 3.0, 13.8, x0 - 0.2 + (k + 1) * 1.05, 3.15, 18.0, 'pintura', { tint: k % 2 ? 0xe8e0d0 : 0xb02a2a, collide: false });
    const bulbs: Vec3[] = [];
    for (let x = x0 + 0.2; x <= x1 - 0.2; x += 0.5) bulbs.push([x, 2.92, 17.7]);
    // Scattered (always the same spots), not in a row; whoever knocks down the last one gets sharp aim.
    const spots: Vec3[] = [[31.4, 1.0, 15.0], [32.5, 1.9, 14.7], [33.3, 1.25, 15.9], [34.6, 2.05, 15.2], [35.4, 0.95, 14.8], [36.5, 1.6, 16.2], [37.4, 1.15, 15.4]];
    r.place('alvos', { alvos: spots, lampadas: bulbs, festa: [34.5, 2, 16] });
    light(34.5, 2.7, 16.5, { color: 0xffd8a0, intensity: 12, range: 9 });
    signBoard(['TIRO AO ALVO', 'Acerte todos!'], 34.5, 18.6, 0, { bg: '#2a1a3a', fg: '#ffd27a', height: 3.6, w: 2.2, h: 0.8 });
  }
  // Stage with the curtain (a skeleton bows behind it, one day).
  {
    const top = 1.1;
    b.span(40.5, 0, 14.4, 47.5, top, 19, 'madeira', { tint: 0x4a2e22 });
    b.span(40.5, 0, 14.0, 47.5, 5, 14.4, 'madeira', { tint: 0x2a1a1a });
    for (let k = 0; k < 14; k++) b.span(40.6 + k * 0.49, top, 14.42, 40.6 + (k + 1) * 0.49 - 0.04, 4.6, 14.62 + (k % 2) * 0.08, 'pintura', { tint: 0x8a1a2a, collide: false });
    b.stairs('x', 1, 40.5 - stairRun(top), 17.4, 18.8, 0, top, 'madeira', { tint: 0x4a2e22 });
    b.stairs('x', -1, 47.5 + stairRun(top), 17.4, 18.8, 0, top, 'madeira', { tint: 0x4a2e22 });
    for (const x of [40.7, 47.3]) b.box(x, 2.5, 18.8, 0.15, 5, 0.15, 'metal', { tint: C.iron, collide: false });
    b.box(44, 5, 18.8, 6.8, 0.12, 0.12, 'metal', { tint: C.iron, collide: false });
    [0xff4a4a, 0xffd23f, 0x6aa0ff, 0xb46aff, 0x6aff9a].forEach((c, k) => r.glow(c, 'esfera', [0.15, 8, 6], [['translate', 41.4 + k * 1.3, 4.82, 18.8]]));
  }
  // Bumper cars inside a low rim (waist-high cover).
  {
    const rim = { tint: 0xb04a2a };
    b.wall('x', 21, 26.5, 39.5, 0.4, 0.9, 'madeira', [[32, 34, 0, 0.9]], 0, rim);
    b.wall('x', 28.5, 26.5, 39.5, 0.4, 0.9, 'madeira', [[32, 34, 0, 0.9]], 0, rim);
    b.wall('z', 26.5, 21.2, 28.3, 0.4, 0.9, 'madeira', [], 0, rim);
    b.wall('z', 39.5, 21.2, 28.3, 0.4, 0.9, 'madeira', [], 0, rim);
    decal(26.7, 21.2, 39.3, 28.3, 0.03, 'metal', 0x3a3a44);
    const cars = [[28.5, 23, 0xd8342a, 0xf2ead8, 0.4], [31, 26.5, 0x2a7ad8, 0xf2c230, -0.6], [35.5, 23.5, 0xf2c230, 0x2a2a30, 1.2], [37.5, 26.8, 0x3aae6a, 0xf2ead8, 2.6], [33.5, 25, 0xb46aff, 0xf2c230, -1.9]] as const;
    r.place('carrinhosBateBate', { carros: cars.map(([x, z, c, accent, yaw]) => ({ p: [x, z], cor: c, detalhe: accent, yaw })) });
    // The ceiling grid the poles run on, and a few colored bulbs around its edge.
    b.span(26.3, 2.9, 20.8, 39.7, 3.02, 28.7, 'metal', { tint: 0x3a2a4a, collide: false });
    b.room({ x: 26.7, y: 0, z: 21.2 }, { x: 39.3, y: 2.9, z: 28.3 }, 0.3); // roofed, open all around
    for (const [x, z] of [[26.5, 21], [39.5, 21], [26.5, 28.5], [39.5, 28.5]]) b.box(x, 1.45, z, 0.15, 2.9, 0.15, 'metal', { tint: C.iron, collide: false });
    for (let k = 0; k < 14; k++) r.glow([0xff4a4a, 0xffd23f, 0x6aa0ff, 0xb46aff][k % 4], 'esfera', [0.08, 6, 4], [['translate', 26.6 + k, 2.86, k % 2 ? 20.85 : 28.65]]);
    light(33, 2.6, 24.7, { color: 0xd8b0ff, intensity: 12, range: 10 });
  }
  r.place('rodaGigante', { raio: 7 }, { p: [52, 0, 22] });
  // Strength tester with its bell (the park's bell for the secrets).
  b.cylinder(44.5, 0, 26.5, 0.12, 5.0, 'metal', { tint: 0xd8d0c0, segments: 8 });
  b.box(44.5, 0.25, 26.5, 1.0, 0.5, 1.0, 'madeira', { tint: 0x8a2a2a });
  r.place('sino', { tamanho: 0.6, som: [44.5, 5.2, 26.5], tom: 1.8 }, { p: [44.5, 5.5, 26.5], prop: 'sinoparque' });
  // Striped tent.
  r.shape('pintura', 0x6a2a7a, 'cone', [2.2, 3.6, 12], [['translate', 48.5, 1.8, 28.3]]);
  b.cylinder(48.5, 0, 28.3, 1.4, 2.2, 'pintura', { tint: 0x4a1a5a });
  // Railings around the sewer stairs coming up in the park.
  for (const x of [H_PARK.x0 - 0.15, H_PARK.x1 + 0.15]) ironFence('z', x, H_PARK.z0, H_PARK.z1 + 0.2, [], 1.1);
  ironFence('x', H_PARK.z1 + 0.15, H_PARK.x0 - 0.15, H_PARK.x1 + 0.15, [], 1.1);

  // --- Praça da Lua Cheia (the open arena) -----------------------------------------------------------
  hedge('x', 31, -45, 45, [[-40, -36], [-10.5, -6.5], [4, 8], [33, 37]]);
  hedge('z', -45, 31.55, D, [[41, 45]]);
  hedge('z', 45, 31.55, D, [[43, 47]]);
  // The giant dead tree on its round base (two steps up).
  b.cylinder(0, 0, 44, 4.4, 0.3, 'pedra', { tint: 0x5a5650, segments: 20 });
  b.cylinder(0, 0, 44, 3.7, 0.6, 'pedra', { tint: 0x6a6660, segments: 20 });
  tree(0, 44, 2.9, { y: 0.6, branches: 11, tint: 0x2a1e22 });
  r.place('aboboraGigante', { raio: 2.2 }, { p: [-26, 0, 46], yaw: Math.PI / 2, prop: 'aboboragigante' });
  r.place('fogueira', {}, { p: [16, 0, 41] });
  // Low stage (elevation and cover), the gazebo, the statue.
  b.span(12, 0, 49, 22, 1.2, 53, 'madeira', { tint: 0x4a3426 });
  b.stairs('x', 1, 12 - stairRun(1.2), 50.2, 51.8, 0, 1.2, 'madeira', { tint: 0x4a3426 });
  b.stairs('x', -1, 22 + stairRun(1.2), 50.2, 51.8, 0, 1.2, 'madeira', { tint: 0x4a3426 });
  for (const [x, z, yaw] of [[14, 52.2, 0.2], [19.5, 49.8, -0.3]] as const) crate(x, 1.2, z, 0.9, yaw);
  {
    const gx = 33;
    const gz = 47;
    const top = 1.0;
    b.span(gx - 3, 0, gz - 3, gx + 3, top, gz + 3, 'madeira', { tint: 0x5a4030 });
    b.stairs('x', 1, gx - 3 - stairRun(top), gz - 0.9, gz + 0.9, 0, top, 'madeira', { tint: 0x5a4030 });
    b.stairs('x', -1, gx + 3 + stairRun(top), gz - 0.9, gz + 0.9, 0, top, 'madeira', { tint: 0x5a4030 });
    const low = { h: 0.9, tint: 0xd8cfb8 };
    railing('x', gz - 2.95, gx - 3, gx + 3, top, low);
    railing('x', gz + 2.95, gx - 3, gx + 3, top, low);
    for (const x of [gx - 2.95, gx + 2.95]) {
      railing('z', x, gz - 3, gz - 0.9, top, low);
      railing('z', x, gz + 0.9, gz + 3, top, low);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.cylinder(gx + sx * 2.8, top, gz + sz * 2.8, 0.1, 2.6, 'pintura', { tint: 0xd8cfb8, segments: 8 });
    b.room({ x: gx - 3, y: top, z: gz - 3 }, { x: gx + 3, y: top + 2.6, z: gz + 3 }, 0.3); // roofed, open all around
    r.shape('telhado', 0x4a2a4a, 'cone', [4.6, 2.2, 8], [['translate', gx, top + 2.6 + 1.1, gz]]);
  }
  b.box(-34, 0.7, 38, 1.6, 1.4, 1.6, 'pedra', { tint: C.stoneDark });
  b.box(-34, 2.2, 38, 0.7, 1.6, 0.45, 'pedra', { tint: C.stone });
  for (const s of [-1, 1]) b.box(-34 + s * 0.5, 2.4, 38, 0.25, 1.1, 0.25, 'pedra', { tint: C.stone, collide: false, rot: new THREE.Euler(0, 0, s * 0.3) });
  staticPumpkin(-34, 3.0, 38, Math.PI / 2, 0.42);
  // Cover: cars, market stalls, hay bales, crates, barrels, benches.
  car(-12, 50, 0x5a3a3a, 0.4);
  car(26, 37, 0x3a4a5a, -0.3);
  stall(-30, 34.6, 0, 0xb02a2a);
  stall(6, 52.8, Math.PI, 0x5a2a7a);
  stall(-39, 51.5, -Math.PI / 2, 0xf07a1a);
  for (const [x, z, rot] of [[-30, 49.5, 0.2], [-8, 37.5, 0], [8, 40.5, 1.1], [-16, 42.5, 0.5], [28, 52, 0.3], [39, 38, 0], [-40.5, 36.5, 0.8], [-20, 51, 1.3]]) {
    hayBale(x, 0, z, rot, [2.2, 0.9, 1.1]);
    crate(x + Math.cos(rot) * 0.45, 0.9, z - Math.sin(rot) * 0.45, 0.85, rot + 0.15);
  }
  for (const [x, z] of [[-22.5, 53.5], [24, 45.5], [-4.1, 53.4], [-3.2, 53.9], [41, 33.5], [-43, 45.5]]) barrel(x, 0, z);
  for (const [x, z, yaw] of [[-6, 47.6, Math.PI], [6, 47.6, Math.PI], [0, 38.6, 0]]) r.place('banco', {}, { p: [x, 0, z], yaw: yaw || undefined });
  for (const [x, z, yaw] of [[-14, 52.5, Math.PI], [6, 36.5, 0.4], [40, 51, -Math.PI / 2]]) r.place('espantalho', {}, { p: [x, 0, z], yaw, prop: `espantalho:${scarecrowCount++}` });
  // The sewer kiosk: stairs down, roofed, open to the south. The walls reach down past the ground slab (and
  // a hair into the stairwell) so its grassy edge doesn't show inside; a lamp under the roof lights the flight.
  {
    const k = { tint: 0x5a5a5a };
    const y0 = CEIL - 0.12;
    b.span(H_PLAZA.x0 - 0.3, y0, H_PLAZA.z0 - 0.3, H_PLAZA.x0 + 0.02, 2.6, H_PLAZA.z1, 'concreto', k);
    b.span(H_PLAZA.x1 - 0.02, y0, H_PLAZA.z0 - 0.3, H_PLAZA.x1 + 0.3, 2.6, H_PLAZA.z1, 'concreto', k);
    b.span(H_PLAZA.x0, y0, H_PLAZA.z0 - 0.3, H_PLAZA.x1, 2.6, H_PLAZA.z0 + 0.02, 'concreto', k);
    b.span(H_PLAZA.x0 - 0.5, 2.6, H_PLAZA.z0 - 0.5, H_PLAZA.x1 + 0.5, 2.8, H_PLAZA.z1 + 0.3, 'metal', { tint: 0x3a3a40 });
    b.room({ x: H_PLAZA.x0, y: y0, z: H_PLAZA.z0 }, { x: H_PLAZA.x1, y: 2.6, z: H_PLAZA.z1 }, 0.6); // roofed, open on one side
    hangingLamp((H_PLAZA.x0 + H_PLAZA.x1) / 2, 2.6, H_PLAZA.z1 - 1.2, { intensity: 7, range: 8 });
    signBoard(['ESGOTO', 'Proibido nadar'], H_PLAZA.x1 + 1.6, H_PLAZA.z1 + 0.4, 0, { bg: '#3a4a3a', fg: '#e6e0d0', height: 1.4, w: 1.2, h: 0.65 });
  }
  signBoard(['PRAÇA DA', 'LUA CHEIA', 'Proibido uivar'], -37.2, 32.4, 0, { bg: '#2a2a4a', fg: '#ffd27a', height: 2.4, w: 1.6, h: 1.0 });

  // South-west court (spawn B) and the south-east trailers.
  car(-52, 44, 0x1a1a1e, Math.PI / 2);
  for (const [x, z, y, yaw] of [[-48, 50.5, 0, 0.1], [-48, 51.6, 0, -0.1], [-48, 51.05, 0.95, 0.4], [-57.5, 33, 0, 0.3], [-47.5, 36.5, 0, -0.2]] as const) crate(x, y, z, 0.95, yaw);
  for (const [x, z] of [[-57, 52], [-50, 32.5], [58, 53], [47, 33]]) tree(x, z, 1.1);
  r.place('trailerCirco', { cor: 0x5a2a6a, faixa: 0xf07a1a, texto: 'CIRCO SINISTRO' }, { p: [52.25, 0, 36.25] });
  r.place('trailerCirco', { cor: 0x6a2a2a, faixa: 0xe8c040, texto: 'HOMEM-ABÓBORA' }, { p: [54.25, 0, 48.25], yaw: Math.PI });
  light(52.4, 2.4, 38.6, { intensity: 8, range: 8 });
  for (const [x, z, yaw] of [[48, 42, 0.2], [57, 42, -0.1], [57, 43.1, 0.15]] as const) crate(x, 0, z, 0.95, yaw);
  barrel(48.2, 0, 43.3);

  // --- Sewer: mansion basement -> south -> east under the plaza -> park; maintenance room with stairs ---
  {
    const brick = { tint: 0x7a7266 };
    const h = CEIL - UG;
    const ugWall = (axis: 'x' | 'z', fixed: number, a: number, end: number, ops: Opening[] = []) => b.wall(axis, fixed, a, end, 0.4, h, 'tijolo', ops, UG, brick);
    const floors: Rect[] = [
      { x0: -56.4, z0: 5.8, x1: -42.6, z1: 12.4 }, // basement
      { x0: -50.4, z0: 12.4, x1: -46.6, z1: 29.6 }, // tunnel south
      { x0: -50.4, z0: 29.6, x1: 24.9, z1: 33.4 }, // tunnel east
      { x0: -26.4, z0: 33.4, x1: -16.6, z1: 41.4 }, // maintenance room
      { x0: 5.6, z0: 33.4, x1: 9.4, z1: 43.8 }, // dead end
      { x0: 2.6, z0: 43.8, x1: 12.4, z1: 51.6 }, // the rat's chamber
    ];
    for (const f of floors) {
      b.span(f.x0, UG - 0.3, f.z0, f.x1, UG, f.z1, 'concreto', { tint: 0x5e5c56, castShadow: false });
      // Ceiling: blocks the moonlight (the ground slab doesn't cast shadows).
      slabWithHoles(f.x0, f.z0, f.x1, f.z1, CEIL - 0.12, CEIL, [H_MANSION, H_PLAZA, H_PARK], 'concreto', { tint: 0x4a4844, collide: false });
      b.room({ x: f.x0, y: UG, z: f.z0 }, { x: f.x1, y: CEIL - 0.12, z: f.z1 }, 1);
    }
    ugWall('z', -56.2, 5.8, 12.4);
    ugWall('z', -42.8, 5.8, 12.4);
    // Basement's north wall flush with the side of the stairs (z 6.4): no gap to snag on going up.
    ugWall('x', 6.2, -56.4, -42.6);
    ugWall('x', 12.2, -56.4, -42.6, [[-50, -47, 0, 3]]);
    ugWall('z', -50.2, 12.4, 33.4);
    ugWall('z', -46.8, 12.4, 29.6);
    ugWall('x', 29.8, -46.6, 24.9, [[H_PARK.x0, H_PARK.x1, 0, h]]);
    ugWall('x', 33.2, -50.4, 24.9, [[-24, -21.5, 0, 2.6], [6, 9, 0, 2.8]]);
    // The dead end: a corridor south to the chamber where the giant rat lives.
    ugWall('z', 5.8, 33.4, 43.8);
    ugWall('z', 9.2, 33.4, 43.8);
    ugWall('x', 44, 2.6, 12.4, [[6, 9, 0, 2.8]]);
    ugWall('z', 2.8, 43.8, 51.6);
    ugWall('z', 12.2, 43.8, 51.6);
    ugWall('x', 51.4, 2.6, 12.4);
    ugWall('z', 24.7, 29.6, 33.4);
    ugWall('z', -26.2, 33.4, 41.4);
    // Maintenance room's east wall flush with the side of the plaza stairs (x -17.4): no gap to snag on going up.
    ugWall('z', -17.2, 33.4, 41.4);
    ugWall('x', 41.2, -26.4, -16.6);
    ugWall('z', H_PARK.x0 - 0.2, H_PARK.z0, 29.6);
    ugWall('z', H_PARK.x1 + 0.2, H_PARK.z0, 29.6);
    b.stairs('x', 1, H_MANSION.x0, H_MANSION.z0, H_MANSION.z1, UG, -UG, 'madeira', { tint: 0x3a2a20 });
    b.stairs('z', 1, H_PLAZA.z0, H_PLAZA.x0, H_PLAZA.x1, UG, -UG, 'concreto', { tint: 0x5a5a56 });
    b.stairs('z', -1, H_PARK.z1, H_PARK.x0, H_PARK.x1, UG, -UG, 'concreto', { tint: 0x5a5a56 });
    // Glow-in-the-dark safety strips on the concrete steps' nosings: seen from the top, where the risers face away, a
    // flight going down otherwise reads as a flat floor you sink through.
    const nosings = (dir: 1 | -1, start: number, x0: number, x1: number) => {
      const n = stairSteps(-UG);
      for (let i = 0; i < n; i++) {
        const s = start + dir * i * STEP_D;
        const top = UG + (-UG / n) * (i + 1);
        glowBox(x1 - x0, 0.012, 0.08, (x0 + x1) / 2, top + 0.006, s + dir * 0.04, 0xc8a02a);
      }
    };
    nosings(1, H_PLAZA.z0, H_PLAZA.x0, H_PLAZA.x1);
    nosings(-1, H_PARK.z1, H_PARK.x0, H_PARK.x1);
    // Murky water along the channels, a pipe along the wall, caged lamps.
    for (const [x0, z0, x1, z1] of [[-49.2, 12.4, -47.8, 30.8], [-49.2, 30.8, 24.5, 32.2]]) r.place('agua', { area: { x0, z0, x1, z1 }, y: UG + 0.03, cor: 0x3a5a3a, opacidade: 0.75 });
    r.shape('metal', 0x4a5a4a, 'cilindro', [0.16, 0.16, 74.5, 8], [['rotateZ', Math.PI / 2], ['translate', -12.75, UG + 2.7, 30.25]]);
    const sewerLight = { color: 0xe6ee9a, intensity: 10, range: 12 };
    for (let x = -44; x < 24; x += 9) {
      glowBox(0.25, 0.25, 0.15, x, UG + 2.6, 32.92, 0xd8e070);
      b.box(x, UG + 2.6, 32.88, 0.32, 0.32, 0.2, 'metal', { tint: C.iron, collide: false, castShadow: false });
      light(x, UG + 2.4, 32.5, sewerLight);
    }
    for (const z of [16, 24]) {
      glowBox(0.15, 0.25, 0.25, -49.92, UG + 2.6, z, 0xd8e070);
      light(-49.5, UG + 2.4, z, sewerLight);
    }
    light(-46, UG + 2.4, 10, { intensity: 9, range: 9 });
    light(-21.5, UG + 2.5, 34, sewerLight);
    light(-23, UG + 2.5, 38.5, sewerLight);
    // A plaque at the dead end's mouth, a lamp halfway, and a dim red one where the rat waits among bones.
    r.place('placaParede', { texto: 'RUA SEM SAÍDA', largura: 1.4, altura: 0.52, estilo: 'esgoto' }, { p: [10.3, UG + 2.1, 32.98], yaw: Math.PI });
    glowBox(0.15, 0.22, 0.22, 5.98, UG + 2.6, 38.5, 0xd8e070);
    light(6.6, UG + 2.4, 38.5, { ...sewerLight, intensity: 8 });
    glowBox(0.15, 0.22, 0.22, 12.0, UG + 2.4, 49.5, 0xff5a3a);
    light(11.2, UG + 2.2, 49.5, { color: 0xff6a4a, intensity: 9, range: 11, flicker: 0.3 });
    for (let k = 0; k < 14; k++) {
      const bx = 3.4 + rand() * 8.2;
      const bz = 44.6 + rand() * 6.2;
      if (Math.hypot(bx - 7.5, bz - 47.5) < 2.4) continue;
      b.box(bx, UG + 0.05, bz, 0.5 + rand() * 0.3, 0.07, 0.07, 'pintura', { tint: 0xe8e0c8, collide: false, castShadow: false, rot: new THREE.Euler(0, rand() * 6, 0) });
    }
    for (const [sx, sz] of [[4, 50.6], [11, 45.2]]) r.shape('pintura', 0xe8e0c8, 'esfera', [0.16, 8, 6], [['scale', 1, 0.85, 1.1], ['translate', sx, UG + 0.14, sz]]);
    const [ratAt] = RATS.halloween;
    r.place('ratoGigante', { id: ratAt.id }, { p: [...ratAt.p] as Vec3, yaw: Math.PI });
    // Basement: the boiler, barrels, shelves. Maintenance room: generator, panels, fuses, a lever.
    b.cylinder(-45, UG, 10.2, 0.8, 2.2, 'metal', { tint: 0x5a3a2a, segments: 12 });
    for (const [x, z] of [[-55.3, 11.4], [-54.45, 11.5], [-55.4, 10.55], [-44, 6.9]]) barrel(x, UG, z, 0.38, 1.0, 0x5a3820);
    b.box(-51.5, UG + 1, 11.7, 3, 2, 0.5, 'madeira', { tint: C.woodDark });
    b.box(-24.5, UG + 0.6, 36.5, 1.8, 1.2, 1.1, 'metal', { tint: 0x5a6a3a });
    b.box(-25.7, UG + 1.4, 39.2, 0.3, 1.6, 2.4, 'metal', { tint: 0x4a4a52 });
    for (const [z, c] of [[38.4, 0xff4a3a], [39.0, 0x6aff6a], [39.6, 0xffd23f]] as const) glowBox(0.02, 0.12, 0.12, -25.54, UG + 1.8, z, c);
    b.box(-21, UG + 1.3, 40.9, 0.9, 1.1, 0.3, 'metal', { tint: 0x3a3a40 });
    glowBox(0.15, 0.2, 0.15, -21.5, UG + 2.7, 33.62, 0xd8e070);
  }

  // --- Lamp posts, pumpkins, bats, mist ------------------------------------------------------------------
  const lampSpecs: { x: number; z: number; dir: [number, number]; flicker?: boolean }[] = [
    { x: 24, z: -43.3, dir: [0, -1] }, { x: 34, z: -43.3, dir: [0, -1], flicker: true }, { x: 44, z: -43.3, dir: [0, -1] },
    { x: 35.3, z: -36, dir: [1, 0] }, { x: 35.3, z: -24, dir: [1, 0], flicker: true }, { x: 35.3, z: -12, dir: [1, 0] },
    { x: -18, z: -3.6, dir: [0, 1] }, { x: -2, z: -3.6, dir: [0, 1], flicker: true }, { x: 14, z: -3.6, dir: [0, 1] }, { x: 30, z: -3.6, dir: [0, 1] },
    { x: -10, z: 3.6, dir: [0, -1] }, { x: 6, z: 3.6, dir: [0, -1] }, { x: 22, z: 3.6, dir: [0, -1], flicker: true },
    { x: -42, z: 33.6, dir: [1, 0] }, { x: -22, z: 33, dir: [0, 1] }, { x: 0, z: 33, dir: [0, 1], flicker: true }, { x: 22, z: 33, dir: [0, 1] }, { x: 42, z: 33.6, dir: [-1, 0] },
    { x: -42, z: 53.2, dir: [1, 0] }, { x: -24, z: 54, dir: [0, -1] }, { x: 4, z: 54.2, dir: [0, -1], flicker: true }, { x: 26, z: 54, dir: [0, -1] }, { x: 42, z: 53.2, dir: [-1, 0] },
    { x: 23, z: 19, dir: [1, 0] }, { x: 42, z: 21, dir: [-1, 0], flicker: true }, { x: -48, z: 47, dir: [1, 0] }, { x: -28, z: 17, dir: [-1, 0] },
  ];
  lampSpecs.forEach((s, i) => r.place('poste', { braco: s.dir, piscar: s.flicker }, { p: [s.x, 0, s.z], prop: `poste:${i}` }));
  // Jack-o'-lanterns: on porches and doorsteps, along paths, around the plaza.
  for (const [x, z, yaw] of [
    [-16.6, -4.4, 0], [-13.9, -4.4, 0], [3.2, -4.4, 0], [13.2, -4.4, 0], [-16.6, 4.4, Math.PI], [-2.6, 4.4, Math.PI], [-0.4, 4.4, Math.PI], [13.6, 4.4, Math.PI],
    [-26.7, -1.5, -Math.PI / 2], [-26.7, 5.6, -Math.PI / 2], [-29.6, 12.6, Math.PI], [-23.6, -3, -Math.PI / 2], [-23.6, 3, -Math.PI / 2],
    [26.8, -26.6, -Math.PI / 2], [26.8, -21.4, -Math.PI / 2], [1.8, -14.6, 0], [-1.8, -14.6, 0], [-12.4, -31.3, -Math.PI / 2],
    [-38.6, -40.4, 0], [-41.4, -40.4, 0], [21.4, 13, 0], [26.6, 13, 0], [39.6, 19.6, Math.PI], [43.6, 19.6, Math.PI],
    [-3.4, 40.4, Math.PI], [3.4, 40.4, Math.PI], [-4.2, 47.4, 0], [4.2, 47.6, 0], [-22.5, 44, Math.PI / 2], [-26, 43.2, 0],
    [14.5, 39.5, 1], [17.6, 39.6, -1], [-35, 32.2, Math.PI], [-41, 32.2, Math.PI], [3.6, 32.2, Math.PI], [8.6, 32.2, Math.PI], [37.8, 32.2, Math.PI],
    [-55, 38.5, -Math.PI / 2], [-46.2, 40.2, -Math.PI / 2], [-20.1, 40.4, Math.PI], [53.2, -23.5, Math.PI], [58.5, -42.5, -Math.PI / 2],
  ] as const) pumpkin(x, 0, z, yaw, 0.8 + rand() * 0.5);
  pumpkin(-28.4, 0.3, -0.5, -Math.PI / 2, 1.3);
  r.place('morcegos', {
    bandos: [
      { centro: [-43, 15, 2], raio: 9, n: 9 },
      { centro: [-14.5, 13, -29.5], raio: 5, n: 5 },
      { centro: [52, 18, 22], raio: 7, n: 6 },
      { centro: [0, 14, 44], raio: 8, n: 6 },
    ],
  });
  r.place('nevoa', {
    manchas: [
      [-8, -30, 7], [6, -20, 7], [-12, -18, 6], [10, -32, 6], [0, -25, 8], [20, -18, 5],
      [-20, -45, 8], [-45, -30, 8], [-50, -18, 7], [10, -48, 7], [-32, -52, 7], [-5, -50, 7], [-55, -42, 7],
    ],
  });
}
