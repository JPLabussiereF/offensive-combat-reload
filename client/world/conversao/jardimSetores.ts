// The Dragon Garden's sectors converted call by call (P31): the old buildCasa, buildRing, buildBonsai, buildLago,
// buildLanternas, buildGuerreiros, buildBambu and buildSantuario of client/world/jardim, every call recorded as a
// piece (see recorder.ts). The layout of each sector is described at the top of its function.
import * as THREE from 'three';
import { stairRun } from '../mapBuilder';
import type { MapBuilder } from '../mapBuilder';
import { expand, ORIENTAL as C, type PavilionSpec, type Rect } from '../oriental';
import { HOUSE, pave, rect } from '../jardim/kit';
import { TY } from '../jardim/santuario';
import type { Recorder } from './recorder';

type Side = 'n' | 's' | 'e' | 'w';
type V3 = [number, number, number];
const BLOSSOM = { greens: [0xf7a8c4, 0xf2c1d6, 0xee8fb4], trunk: 0x5a3b2a };

/** The kit's calls that this conversion records, as pieces. */
function kit(r: Recorder) {
  const b = r.b;
  /** pave() only lays a span: recorded as a box. */
  const paving = (x: Rect, tint?: number, surface?: 'pedra' | 'pintura', y?: number) => pave(b as unknown as MapBuilder, x, tint, surface, y);
  const lanternIds = () => `lanterna:${r.ctx.s.c.lanterns.count}`;
  return {
    paving,
    column: (x: number, z: number, y0: number, y1: number, raio?: number) => r.place('coluna', { topo: y1, raio }, { p: [x, y0, z] }),
    paperWall: (eixo: 'x' | 'z', fixo: number, de: number, ate: number, altura: number, y0: number, portas: number[] = []) => r.place('paredePapel', { eixo, fixo, de, ate, altura, y0, portas }),
    railing: (eixo: 'x' | 'z', fixo: number, de: number, ate: number, y: number, o: { h?: number; tint?: number } = {}) => r.place('corrimao', { eixo, fixo, de, ate, y, altura: o.h, cor: o.tint }),
    roof: (o: { outer: Rect; top: Rect; eaveY: number; topY: number; curl?: number; ridges?: boolean; collide?: boolean; thickness?: number; tint?: number }, lanternas?: number) =>
      r.place('telhadoCurvo', { externo: { ...o.outer }, topo: { ...o.top }, beiral: o.eaveY, cume: o.topY, curva: o.curl, cumeeiras: o.ridges, colide: o.collide, espessura: o.thickness, cor: o.tint, lanternas }),
    pavilion: (spec: PavilionSpec, lanternas?: number) => r.place('pavilhao', { spec: structuredClone(spec), lanternas }),
    lantern: (x: number, y: number, z: number, queda: number) => r.place('lanternaPapel', { queda }, { p: [x, y, z], prop: lanternIds() }),
    stoneLantern: (x: number, z: number, y0 = 0) => r.place('lanternaPedra', {}, { p: [x, y0, z] }),
    pine: (x: number, y: number, z: number, escala: number, o: { greens?: number[]; trunk?: number } = {}) => r.place('pinheiro', { verdes: o.greens, tronco: o.trunk }, { p: [x, y, z], escala }),
    rock: (x: number, y: number, z: number, sx: number, sy: number, sz: number, cor?: number) => r.place('rocha', { tamanho: [sx, sy, sz], cor }, { p: [x, y, z] }),
    vase: (x: number, y: number, z: number, altura?: number, cor?: number) => r.place('vaso', { altura, cor }, { p: [x, y, z] }),
    bench: (x: number, z: number, ao: 'x' | 'z', comprimento?: number, y = 0) => r.place('bancoJardim', { ao, comprimento }, { p: [x, y, z] }),
    crate: (x: number, y: number, z: number, s?: number, yaw?: number) => r.place('caixoteJardim', {}, { p: [x, y, z], escala: s, yaw: yaw || undefined }),
    hedge: (x0: number, z0: number, x1: number, z1: number, altura?: number) => r.place('sebeJardim', { x0, z0, x1, z1, altura }),
    screen: (x: number, y: number, z: number, ao: 'x' | 'z', paineis?: number) => r.place('biombo', { ao, paineis }, { p: [x, y, z] }),
    incense: (x: number, y: number, z: number, s?: number) => r.place('incensario', {}, { p: [x, y, z], escala: s }),
    lowTable: (x: number, y: number, z: number, largura: number, profundidade: number, topo?: 'cha' | 'nada') => r.place('mesaBaixa', { largura, profundidade, topo }, { p: [x, y, z] }),
    grove: (area: Rect, densidade?: number) => r.place('bosqueBambu', { area: { ...area }, densidade }),
    path: (pontos: [number, number][]) => r.place('caminhoPedras', { pontos }),
    lilies: (area: Rect, n: number, y?: number) => r.place('lirios', { area: { ...area }, n, y }),
    reeds: (x: number, z: number, n: number, espalhamento: number, y0 = -0.8) => r.place('juncos', { n, espalhamento }, { p: [x, y0, z] }),
    basin: (area: Rect, fundo: number, o: { coping?: Side[]; waterY?: number; floor?: number } = {}) => r.place('tanque', { area: { ...area }, fundo, bordas: o.coping, agua: o.waterY, cor: o.floor }),
    bridge: (eixo: 'x' | 'z', de: number, ate: number, atravessa: number, largura: number, pico: number, y0?: number, cor?: number, superficie?: string) => r.place('ponteArco', { eixo, de, ate, atravessa, largura, pico, y0, cor, superficie }),
    deck: (area: Rect, y: number, postesAte?: number, cor?: number) => r.place('deck', { area: { ...area }, y, postesAte, cor }),
    ting: (x: number, z: number, metade: number, o: { base?: number; h?: number; steps?: Side[]; rails?: boolean }, lanternas?: number) => r.place('ting', { metade, base: o.base, altura: o.h, degraus: o.steps, corrimao: o.rails, lanternas }, { p: [x, 0, z] }),
    sign: (linhas: string[], x: number, z: number, yaw: number, fundo: string, texto: string, altura: number) => r.place('placaJardim', { linhas, fundo, texto, altura }, { p: [x, 0, z], yaw: yaw || undefined }),
    plaque: (texto: string, x: number, y: number, z: number, yaw: number, largura: number, altura: number, fundo?: string) => r.place('placaNome', { texto, largura, altura, fundo }, { p: [x, y, z], yaw: yaw || undefined }),
    string: (de: V3, ate: V3, n: number) => r.place('varalLanternas', { de, ate, n }),
  };
}

// --- Casa Principal (x/z -13..13) ----------------------------------------------------------------------
//
// A courtyard house: four narrow wings around a wide courtyard (17 x 17 m) where the Dragon Cherry grows (its
// fruit is the map's collectible). North wing: the Great Hall (taller, the landmark roof) between two side
// rooms. South wing: the ceremony hall (throne, altar, dragon relief) between the south gate's vestibule and a
// store room. West wing: library and tea room. East wing: two rooms cut into L-shaped corridors by wooden
// partitions. Every room opens to the next one; six gates, one per sector, none in line with the sector gate
// across the ring.

const H = HOUSE;
/** Inner face line of the wings (the courtyard is -IN..IN). */
const IN = 8.5;
/** Middle line of each wing (doors between the rooms, the corner rooms' centers). */
const MID = (H + IN) / 2;
const TALL = 4.8;
const LOW = 3.6;
const T_OUT = 0.3;
const T_IN = 0.15;
const GATE_W = 2.4;
const GATE_H = 3.0;

export function casa(r: Recorder) {
  const { b } = r;
  const k = kit(r);
  const plaster = { tint: C.plaster, frame: { surface: 'pintura' as const, tint: C.lacquer, width: 0.12 } };
  const wood = { tint: C.lacquerDark, frame: { surface: 'pintura' as const, tint: C.gold, width: 0.08 } };
  const gate = (s: number): [number, number, number, number] => [s - GATE_W / 2, s + GATE_W / 2, 0, GATE_H];
  const door = (s: number): [number, number, number, number] => [s - 0.9, s + 0.9, 0, 2.4];
  const win = (s: number): [number, number, number, number] => [s - 0.75, s + 0.75, 0.9, 2.3];

  // --- Floors -------------------------------------------------------------------------------------
  const floor = { tint: C.floor, collide: false, castShadow: false };
  b.span(-H, 0, -H, H, 0.02, -IN, 'piso', floor);
  b.span(-H, 0, IN, H, 0.02, H, 'piso', floor);
  b.span(-H, 0, -IN, -IN, 0.02, IN, 'piso', floor);
  b.span(IN, 0, -IN, H, 0.02, IN, 'piso', floor);

  // --- Outer walls (plaster), with the six gates and a few windows ---------------------------------
  const e = T_OUT / 2;
  b.wall('x', -H, -H - e, H + e, T_OUT, TALL, 'concreto', [gate(3), win(-MID), win(-4), win(MID)], 0, plaster);
  b.wall('x', H, -H - e, H + e, T_OUT, LOW, 'concreto', [gate(-MID), win(4.5), win(MID)], 0, plaster);
  for (const sx of [-1, 1]) {
    b.wall('z', sx * H, -H + e, -IN, T_OUT, TALL, 'concreto', [win(-MID)], 0, plaster);
    b.wall('z', sx * H, -IN, H - e, T_OUT, LOW, 'concreto', [gate(-3.5), gate(3.5), win(MID)], 0, plaster);
  }
  // Gates: columns, lintel and name board under the eaves; the leaves swung open on the outside.
  const houseGate = (axis: 'x' | 'z', fixed: number, at: number, name: string, h: number, outside: 1 | -1) => {
    r.place('portalJardim', { eixo: axis, fixo: fixed, portao: { at, name, roof: false }, largura: GATE_W, altura: GATE_H, alturaMuro: h, espessura: T_OUT });
    r.place('folhasPorta', { eixo: axis, fixo: fixed, centro: at, largura: GATE_W, altura: GATE_H, espessura: T_OUT, lado: outside });
  };
  houseGate('x', -H, 3, '龍門', TALL, -1);
  houseGate('x', H, -MID, '虎門', LOW, 1);
  houseGate('z', -H, -3.5, '山門', LOW, -1);
  houseGate('z', -H, 3.5, '春門', LOW, -1);
  houseGate('z', H, -3.5, '月門', LOW, 1);
  houseGate('z', H, 3.5, '日門', LOW, 1);

  // --- Inner walls ---------------------------------------------------------------------------------
  // Courtyard faces: paper with doors (shot through). Between rooms: wood or paper, always with a door.
  k.paperWall('x', -IN, -IN, IN, TALL, 0, [-4, 4]);
  k.paperWall('x', IN, -IN, IN, LOW, 0, [-4, 4]);
  k.paperWall('z', -IN, -IN + 0.03, IN - 0.03, LOW, 0, [-4.25, 4.25]);
  k.paperWall('z', IN, -IN + 0.03, IN - 0.03, LOW, 0, [-4.25, 4.25]);
  // East wing: its doors to the corner rooms go in the outer half (the partitions split those rooms).
  const east = (MID + H - e) / 2;
  for (const sx of [-1, 1]) {
    const corner = sx < 0 ? -MID : east;
    // North wing: side room <-> Great Hall; side room <-> the wing below.
    b.wall('z', sx * IN, -H + e, -IN, T_IN, TALL, 'madeira', [door(-MID)], 0, wood);
    b.wall('x', -IN, Math.min(sx * IN, sx * H), Math.max(sx * IN, sx * H), T_IN, TALL, 'madeira', [door(corner)], 0, wood);
    // South wing: the same.
    b.wall('z', sx * IN, IN, H - e, T_IN, LOW, 'madeira', [door(MID)], 0, wood);
    b.wall('x', IN, Math.min(sx * IN, sx * H), Math.max(sx * IN, sx * H), T_IN, LOW, 'madeira', [door(corner)], 0, wood);
    // Middle of the side wings.
    k.paperWall('x', 0, Math.min(sx * IN, sx * H), Math.max(sx * IN, sx * H), LOW, 0, [sx * MID]);
  }
  // East wing: wooden partitions turn both rooms into L-shaped corridors.
  b.wall('z', MID, -IN + 0.08, -2, T_IN, LOW, 'madeira', [], 0, wood);
  b.wall('z', MID, 2, IN - 0.08, T_IN, LOW, 'madeira', [], 0, wood);
  // For the sound: the four wings are closed rooms; the veranda under the eaves around the courtyard is open
  // on the courtyard side.
  b.room({ x: -H, y: 0, z: -H }, { x: H, y: TALL, z: -IN }, 1);
  b.room({ x: -H, y: 0, z: IN }, { x: H, y: LOW, z: H }, 1);
  for (const sx of [-1, 1]) b.room({ x: sx * IN, y: 0, z: -IN }, { x: sx * H, y: LOW, z: IN }, 1);
  b.room({ x: -IN, y: 0, z: -IN }, { x: IN, y: TALL, z: -IN + 1.4 }, 0.6);
  b.room({ x: -IN, y: 0, z: IN - 1.4 }, { x: IN, y: LOW, z: IN }, 0.6);
  for (const sx of [-1, 1]) b.room({ x: sx * IN, y: 0, z: -IN }, { x: sx * (IN - 1.4), y: LOW, z: IN }, 0.6);

  // --- Roofs and the veranda around the courtyard --------------------------------------------------
  k.roof({ outer: rect(-H - 1.4, -H - 1.4, H + 1.4, -IN + 1.4), top: rect(-8.6, -MID, 8.6, -MID), eaveY: TALL, topY: TALL + 2.7, curl: 1.0, ridges: true }, 0.9);
  k.roof({ outer: rect(-H - 1.4, IN - 1.4, H + 1.4, H + 1.4), top: rect(-8.6, MID, 8.6, MID), eaveY: LOW, topY: LOW + 2.1, curl: 0.8, ridges: true });
  for (const sx of [-1, 1]) {
    k.roof({ outer: rect(sx < 0 ? -H - 1.4 : IN - 1.4, -IN + 0.8, sx < 0 ? -IN + 1.4 : H + 1.4, IN - 0.8), top: rect(sx * MID, -2.5, sx * MID, 2.5), eaveY: LOW, topY: LOW + 1.7, curl: 0.7, ridges: true });
  }
  // A golden pearl between two small dragons on the Great Hall's ridge: the map's landmark from afar.
  const ridgeY = TALL + 2.7;
  r.shape('pintura', C.gold, 'esfera', [0.45, 12, 8], [['translate', 0, ridgeY + 0.75, -MID]]);
  r.place('dragaoDecorativo', { caminho: [[-3.2, 0.2, 0], [-2.4, 0.55, 0.15], [-1.6, 0.3, -0.1], [-1.0, 0.75, 0]], raio: 0.16, cores: 'dourado', espelho: true }, { p: [0, ridgeY + 0.15, -MID] });
  const V = IN - 1;
  for (const x of [-V, -2.5, 2.5, V]) {
    k.column(x, -V, 0, TALL, 0.15);
    k.column(x, V, 0, LOW, 0.15);
  }
  for (const z of [-2.5, 2.5]) {
    k.column(-V, z, 0, LOW, 0.15);
    k.column(V, z, 0, LOW, 0.15);
  }

  // --- Courtyard and the Dragon Cherry (own seed), with the collectible under it --------------------
  k.paving(rect(-IN, -IN, IN, IN), 0xcfc8b8);
  r.place('cerejeiraDragao', {}, { p: [0, 0, 0], semente: 5150, coletavel: 'cereja' });
  for (const [x, z] of [[-6.3, -6.3], [6.3, -6.3], [-6.3, 6.3], [6.3, 6.3]]) k.stoneLantern(x, z);

  // --- Great Hall (north, -IN..IN) ----------------------------------------------------------------
  b.span(-3, 0, -MID - 0.45, 3, 0.75, -MID + 0.45, 'madeira', { tint: C.woodDark });
  b.span(-3.1, 0.75, -MID - 0.55, 3.1, 0.82, -MID + 0.55, 'madeira', { tint: C.lacquer, collide: false });
  for (const x of [-2.2, -0.8, 0.8, 2.2]) {
    for (const z of [-MID - 1.1, -MID + 1.1]) b.box(x, 0.25, z, 0.5, 0.5, 0.5, 'madeira', { tint: C.lacquerDark, collide: false });
  }
  k.screen(-6.2, 0, -MID, 'z', 3);
  k.screen(6.2, 0, -MID - 0.3, 'z', 3);
  for (const [x, z] of [[-7.9, -12.3], [7.9, -12.3], [-7.9, -9.1], [7.9, -9.1]]) k.vase(x, 0, z, 1.0, x < 0 ? 0x2f5d8a : 0x8a4a2f);
  for (const x of [-5, 0, 5]) k.lantern(x, 4.75, -MID, 0.9);
  r.place('quadro', { estilo: 'paisagem', largura: 2.6, altura: 1.4 }, { p: [-0.5, 2.6, -12.83] });

  // --- Ceremony hall (south, -IN..IN): throne on a dais, altars, the dragon relief ---------------
  b.span(-3, 0, 11.2, 3, 0.4, H - 0.15, 'madeira', { tint: C.lacquerDark });
  b.span(-2, 0, 10.8, 2, 0.2, 11.2, 'madeira', { tint: C.lacquerDark });
  b.span(-0.7, 0.4, 11.75, 0.7, 0.9, 12.45, 'pintura', { tint: C.lacquer });
  b.span(-0.8, 0.9, 12.4, 0.8, 2.3, 12.65, 'pintura', { tint: C.lacquer });
  b.span(-0.85, 2.2, 12.35, 0.85, 2.4, 12.7, 'pintura', { tint: C.gold, collide: false });
  for (const sx of [-1, 1]) b.span(sx * 0.7 - 0.08, 0.9, 11.75, sx * 0.7 + 0.08, 1.35, 12.45, 'pintura', { tint: C.gold, collide: false });
  for (const sx of [-1, 1]) {
    b.span(sx * 5.5 - 0.8, 0, 11.9, sx * 5.5 + 0.8, 0.9, 12.7, 'madeira', { tint: C.lacquerDark });
    k.incense(sx * 5.5, 0.9, 12.3, 0.25);
    k.vase(sx * 7.6, 0, 9.2, 1.0, 0x2f5d8a);
  }
  r.place('dragaoDecorativo', { caminho: [-5.5, -3.5, -1.5, 0.5, 2.5, 4.5, 5.6].map((x, i) => [x, 3.0 + Math.sin(i * 1.4) * 0.35, H - 0.35]), raio: 0.14, cores: 'carmesim', sombra: false });
  for (const x of [-4, 4]) k.lantern(x, 3.55, MID, 0.8);

  // --- West wing: library (north half) and tea room (south half) ----------------------------------
  // Free-standing shelf right between the gate and the courtyard door: you walk around it.
  r.place('estanteJardim', { ao: 'z', comprimento: 3.0 }, { p: [-MID, 0, -3.9] });
  r.place('estanteJardim', { ao: 'z', comprimento: 2.6 }, { p: [-12.6, 0, -6.9] });
  b.span(-9.6, 0, -1.6, -8.8, 0.78, -0.8, 'madeira', { tint: C.wood });
  for (let i = 0; i < 3; i++) b.cylinder(-9.45 + i * 0.22, 0.78, -1.2, 0.04, 0.3, 'pintura', { tint: 0xf2e6c8, collide: false, segments: 6 });
  k.screen(-MID, 0, 3.9, 'z', 3);
  k.lowTable(-12, 0, 1.5, 1.2, 0.7);
  k.lowTable(-9.6, 0, 7.0, 1.2, 0.7);
  b.span(-12.8, 0, 6.4, -12.2, 1.8, 7.6, 'madeira', { tint: C.lacquerDark });

  // --- Corner rooms and the east wing --------------------------------------------------------------
  b.span(-12.8, 0, -9.4, -12.2, 1.9, -8.7, 'madeira', { tint: C.lacquerDark });
  k.vase(-9.2, 0, -12.3, 0.9);
  b.span(8.65, 0, -12.8, 9.35, 1.9, -11.6, 'madeira', { tint: C.lacquerDark });
  k.vase(12.3, 0, -12.3, 0.9, 0x8a4a2f);
  k.screen(-MID, 0, MID, 'x', 3);
  k.vase(-12.3, 0, 9.1, 1.0);
  b.span(8.7, 0, 12.2, 9.9, 0.8, 12.8, 'madeira', { tint: C.wood });
  k.vase(12.3, 0, 12.3, 0.9, 0x8a4a2f);
  k.bench(10.4, -5.5, 'z', 1.6);
  k.bench(10.4, 5.5, 'z', 1.6);
  k.vase(12.3, 0, -1.2, 0.9);
  k.vase(12.3, 0, 1.2, 0.9, 0x8a4a2f);
}

// --- The ring between the house and the sector walls -------------------------------------------------
// A covered gallery, trees, lanterns and benches; each straight stretch has something that breaks the view.

export function anel(r: Recorder) {
  const { b } = r;
  const k = kit(r);
  // Paving along the house.
  const path = 0xbdb5a3;
  k.paving(rect(-H - 1.4, -19.7, H + 1.4, -H), path);
  k.paving(rect(-H - 1.4, H, H + 1.4, 19.7), path);
  k.paving(rect(-17.7, -H, -H, H), path);
  k.paving(rect(H, -H, 17.7, H), path);

  // Covered gallery along the north stretch: columns, a long roof, paper screens on its north side.
  {
    const x0 = 1;
    const x1 = 11.5;
    const zn = -19.2;
    const zs = -16.6;
    const bays = 4;
    for (let i = 0; i <= bays; i++) {
      const x = x0 + ((x1 - x0) * i) / bays;
      k.column(x, zn, 0, 3.0, 0.14);
      k.column(x, zs, 0, 3.0, 0.14);
    }
    for (const i of [0, 2, 3]) k.paperWall('x', zn, x0 + ((x1 - x0) * i) / bays + 0.15, x0 + ((x1 - x0) * (i + 1)) / bays - 0.15, 2.5, 0);
    b.span(x0, 2.7, zn - 0.12, x1, 3.0, zn + 0.12, 'pintura', { tint: C.beam, collide: false });
    b.span(x0, 2.7, zs - 0.12, x1, 3.0, zs + 0.12, 'pintura', { tint: C.beam, collide: false });
    b.room({ x: x0, y: 0, z: zn }, { x: x1, y: 2.7, z: zs }, 0.4); // roofed, open on three sides
    k.roof({ outer: rect(x0 - 0.7, zn - 0.7, x1 + 0.7, zs + 0.7), top: rect(x0 + 0.6, (zn + zs) / 2, x1 - 0.6, (zn + zs) / 2), eaveY: 3.0, topY: 4.0, curl: 0.4, ridges: true });
    for (let i = 0; i < bays; i++) k.lantern(x0 + ((x1 - x0) * (i + 0.5)) / bays, 3.3, (zn + zs) / 2, 0.7);
    k.bench((x0 + x1) / 2, zs + 0.55, 'x', 2.0);
  }

  // Corners: a tree and rocks in each, so nobody watches two stretches at once.
  k.pine(-16, 0, -17, 1.0);
  k.rock(-14.6, 0, -15.2, 1.0, 1.3, 0.9);
  k.pine(15.8, 0, -17.6, 0.9, BLOSSOM);
  k.rock(14.5, 0, -14.8, 0.9, 1.1, 0.9);
  k.grove(rect(14.3, 16.4, 17.4, 19.4), 1.3);
  k.rock(-15.8, 0, 16.8, 1.2, 1.4, 1.1);
  k.pine(-14.4, 0, 18.4, 0.85);

  // Stretches: hedges, benches, lanterns.
  k.hedge(-5, 16.6, 1.2, 17.4, 1.1);
  k.bench(-2, 15.6, 'x');
  k.rock(11.6, 0, 15.6, 0.8, 0.9, 0.8);
  k.hedge(-17.2, -2.2, -16.2, 2.2, 1.1);
  k.bench(-14.2, 0, 'z');
  k.hedge(16.2, -2.2, 17.2, 2.2, 1.1);
  k.vase(14.2, 0, -4.6, 1.0);
  k.vase(14.2, 0, 4.6, 1.0, 0x8a4a2f);
  for (const [x, z] of [[-15.6, -4.6], [-15.6, 4.6], [15.6, -4.2], [15.6, 6.4], [-11, -16.4], [11, 16.4], [-1.5, 18], [0, -16.2]]) k.stoneLantern(x, z);
}

// --- Jardim de Bonsai (north, x -18..18, z -45..-20) ---------------------------------------------------
// The most refined part of the estate: from the south gate a stone path winds between clipped hedges to the
// Dragon Bonsai, then on to the bonsai pavilion on its platform (NE) and to the lake's moon gate. West: the
// ornamental pond with koi, cut in two by an arched bridge from the sanctuary's gate. Bonsai on pedestals, rocks
// and hedges give cover all over; the tall hedges keep the garden from being one open field.

export function bonsai(r: Recorder) {
  const { b } = r;
  const k = kit(r);
  // --- Pond and the arched bridge ------------------------------------------------------------------
  const pond = rect(-15, -42.5, -5, -33.5);
  k.basin(pond, 0.6);
  k.lilies(pond, 12);
  k.bridge('x', -16.4, -3.6, -38, 2.0, 1.0);
  for (const [x, z, s] of [[-13.8, -41.4, 0.7], [-6.4, -41.4, 0.7], [-15.3, -33.4, 0.9], [-4.6, -33.2, 1.1]]) k.rock(x, -0.4, z, s, s * 0.9, s * 0.8);

  // --- Paths ---------------------------------------------------------------------------------------
  k.path([[-6, -21], [-4.5, -24], [-1.4, -25.8], [-1.6, -29.5], [-0.2, -36.4], [3.5, -38.6], [8.6, -39.6]]);
  k.path([[-1.6, -29.5], [5, -28.6], [11, -30.2], [17.2, -29]]);
  k.path([[-3.6, -38], [-1.6, -36.4]]);
  k.path([[12.2, -21], [12.6, -26], [11, -30.2]]);

  // --- The Dragon Bonsai: a giant glazed pot, a pine trained into a dragon's coils -----------------
  r.place('bonsaiDragao', {}, { p: [2, 0, -32.5] });

  // --- Bonsai pavilion (NE): a platform with railings, a bench and two bonsai -----------------------
  const tx = 13;
  const tz = -40.5;
  k.ting(tx, tz, 2.2, { base: 0.9, steps: ['w', 's'], rails: true, h: 2.8 }, 0.7);
  k.bench(tx, tz - 1.4, 'x', 2.0, 0.9);
  r.place('pedestalBonsai', {}, { p: [tx + 1.4, 0.9, tz + 1.3] });
  r.place('pedestalBonsai', {}, { p: [tx - 1.4, 0.9, tz + 1.3] });

  // --- Raised deck behind the pond (north), with a bench ---------------------------------------------
  k.deck(rect(-3, -44.6, 3.5, -42), 0.5, 0);
  b.stairs('z', -1, -42 + stairRun(0.5, true), -0.6, 0.6, 0, 0.5, 'madeira', { tint: C.wood, gentle: true });
  k.bench(0.2, -44, 'x', 2.2, 0.5);
  r.place('pedestalBonsai', {}, { p: [-2.2, 0.5, -43.3] });
  r.place('pedestalBonsai', {}, { p: [2.8, 0.5, -43.3] });

  // --- Hedges: low ones are cover, the tall ones (2 m) cut the long views ---------------------------
  k.hedge(-10, -27.2, -3, -26.4, 2.0);
  k.hedge(3, -23.4, 9, -22.6, 1.1);
  k.hedge(7.6, -34.5, 8.4, -30.8, 2.0);
  k.hedge(7.6, -27.6, 8.4, -25, 2.0);
  k.hedge(-3, -42, -2.2, -39.4, 1.2);
  k.hedge(14, -24.2, 17.4, -23.4, 1.0);
  k.hedge(-17.4, -30, -14, -29.2, 1.3);
  k.hedge(4.5, -45, 5.3, -41.8, 1.3);
  k.hedge(-16.2, -24.6, -13.4, -23.8, 1.1);

  // --- Bonsai on pedestals (low cover) ---------------------------------------------------------------
  for (const [x, z] of [[-11, -22.5], [-9, -22.5], [-14.5, -26.6], [-12.5, -30.6], [-7.5, -31], [-4.2, -30.4], [1, -22.6], [5.6, -26.2], [10.6, -26.6], [15.6, -27], [10.6, -34.6], [15.6, -33.4], [2.6, -37.4], [1.6, -40.4]]) {
    r.place('pedestalBonsai', {}, { p: [x, 0, z] });
  }

  // --- Trees, rocks, lanterns -----------------------------------------------------------------------
  k.pine(-16.2, 0, -21.8, 0.9);
  k.pine(16.4, 0, -36.2, 1.0, BLOSSOM);
  k.pine(-2.8, 0, -33.2, 0.8);
  k.pine(6.6, 0, -43.6, 0.85, BLOSSOM);
  k.pine(16.4, 0, -21.6, 0.8);
  for (const [x, z, sx, sy, sz] of [
    [-10.5, -29, 1.1, 1.0, 1.0], [4.2, -29.8, 0.9, 1.0, 0.8], [10.8, -22.4, 1.0, 0.9, 1.0],
    [16.6, -43.6, 1.0, 1.4, 1.0], [-4.6, -23, 0.8, 0.8, 0.9], [10, -35.6, 0.9, 0.9, 0.9], [-12.6, -32.5, 0.7, 0.6, 0.7],
  ]) {
    k.rock(x, 0, z, sx, sy, sz);
  }
  for (const [x, z] of [[-8.8, -21.4], [-3.2, -21.4], [16.8, -30.8], [16.8, -27.2], [-17.2, -35.2], [-17.2, -40.8], [6.2, -35.4]]) k.stoneLantern(x, z);
  k.sign(['JARDIM DO', 'DRAGÃO', 'Não alimente o dragão'], -1.6, -21.6, 0, '#c0352b', '#ffe9a8', 2.2);
}

// --- Lago de Lótus (north-east, x 18..45, z -45..0) ----------------------------------------------------
// A big lake that never fills the sector. In the middle, the island with a two-story pavilion (balcony all
// around: the high-value spot), reached by the arched stone bridge from the west bank or by the old wooden
// bridge from the south bank. The tea house stands half over the water on the north shore. Wooden platforms jut
// out over the lake, reeds and lotus break the views, and the dragon fountain sits on its own islet.

export function lago(r: Recorder) {
  const { b } = r;
  const k = kit(r);
  const LAKE = rect(22.5, -40.5, 42, -8);
  k.basin(LAKE, 0.8, { coping: ['s', 'e', 'w'] });
  const cope = { tint: C.stone, castShadow: false };
  b.span(LAKE.x0 - 0.5, 0, LAKE.z0 - 0.5, 26, 0.12, LAKE.z0, 'pedra', cope);
  b.span(38, 0, LAKE.z0 - 0.5, LAKE.x1 + 0.5, 0.12, LAKE.z0, 'pedra', cope);
  k.lilies(rect(23, -38, 28, -28), 10);
  k.lilies(rect(37, -27, 41.5, -18), 9);
  k.lilies(rect(23, -17, 32, -9), 12);
  k.lilies(rect(36, -38, 41, -33), 6);
  for (const [x, z, n, rr] of [[24.6, -34.5, 14, 1.0], [40.4, -24.5, 14, 1.1], [25.6, -15.4, 12, 0.9], [37.2, -31, 10, 0.9], [29.8, -11.2, 10, 0.8], [41, -9.8, 8, 0.8]]) k.reeds(x, z, n, rr);

  // --- Island and its pavilion ---------------------------------------------------------------------
  const ISLAND = rect(28, -27.5, 37, -18.5);
  b.span(ISLAND.x0, -1.1, ISLAND.z0, ISLAND.x1, 0, ISLAND.z1, 'pedra', { tint: C.stone });
  const trim = { tint: C.stoneDark, collide: false, castShadow: false };
  b.span(ISLAND.x0 - 0.05, -0.14, ISLAND.z0 - 0.05, ISLAND.x1 + 0.05, -0.02, ISLAND.z1 + 0.05, 'pintura', trim);
  const isle: PavilionSpec = {
    cx: 32.5,
    cz: -23,
    plinth: { h: 0.45, margin: 0.5, steps: ['w', 's', 'e'] },
    stories: [
      { hw: 2.8, hd: 2.8, h: 3.2, style: 'papel', doors: { s: [0], e: [0], w: [0] }, stairs: [{ side: 'n', dir: 1, from: -2.2 }] },
      { hw: 2.8, hd: 2.8, h: 3.0, style: 'madeira', doors: { s: [0], e: [0], w: [0] }, balcony: { depth: 1.2, sides: ['n', 's', 'e', 'w'] }, skirt: 0.8 },
    ],
    roof: { overhang: 1.2, rise: 2.4, curl: 0.9 },
  };
  k.pavilion(isle, 0.8);
  // The ground floor stands on the plinth.
  k.lowTable(31.2, isle.plinth!.h, -21.4, 1.0, 0.7);
  for (const [x, z, s] of [[28.4, -27, 0.8], [36.6, -27.1, 0.9], [36.7, -18.9, 0.7], [28.3, -19, 0.9]]) k.rock(x, 0, z, s, s * 0.8, s * 0.8);

  // --- Bridges -------------------------------------------------------------------------------------
  k.bridge('x', 21.4, 28.6, -23, 2.2, 0.9);
  // The old wooden bridge (south bank -> island): low, plain railings, a wooden screen on half of it.
  k.deck(rect(33.6, -18.7, 35.6, -7.6), 0.25, -0.8, 0x7a4a2c);
  for (let z = -18.2; z < -8; z += 1.3) b.span(33.62, 0.25, z, 35.58, 0.27, z + 0.22, 'madeira', { tint: 0x5a3420, collide: false, castShadow: false });
  k.railing('z', 33.66, -18.6, -7.7, 0.25, { h: 0.85, tint: C.woodDark });
  k.railing('z', 35.54, -18.6, -16.2, 0.25, { h: 0.85, tint: C.woodDark });
  b.span(35.48, 0.25, -16.2, 35.62, 1.45, -10.8, 'madeira', { tint: C.woodDark });
  k.railing('z', 35.54, -10.8, -7.7, 0.25, { h: 0.85, tint: C.woodDark });
  // Lantern posts at the bridge ends.
  r.place('postoLanterna', { braco: [0, -1] }, { p: [21.2, 0, -24.6] });
  r.place('postoLanterna', { braco: [0, 1] }, { p: [21.2, 0, -21.4] });
  r.place('postoLanterna', { braco: [-1, 0] }, { p: [33.2, 0, -7.2] });

  // --- Platforms over the water --------------------------------------------------------------------
  k.deck(rect(38, -33.2, 42.4, -29.6), 0.3);
  k.railing('x', -33.14, 38, 42, 0.3, { h: 0.8, tint: C.woodDark });
  k.railing('z', 38.06, -33.2, -29.6, 0.3, { h: 0.8, tint: C.woodDark });
  k.deck(rect(22.1, -14.4, 26, -10.6), 0.3);
  k.railing('z', 25.94, -14.4, -10.6, 0.3, { h: 0.8, tint: C.woodDark });

  // --- Tea house, half over the water --------------------------------------------------------------
  k.pavilion(
    {
      cx: 32,
      cz: -41.8,
      plinth: { h: 0.4, margin: 0.5, steps: ['e', 'w'] },
      stories: [{ hw: 5.5, hd: 2.6, h: 3.2, style: 'papel', sideStyle: { n: 'madeira' }, doors: { s: [-3, 3], e: [0], w: [0] } }],
      roof: { overhang: 1.2, rise: 2.2, curl: 0.8 },
    },
    0.8,
  );
  for (let x = 26.4; x <= 37.6; x += 2.8) b.cylinder(x, -0.8, LAKE.z0 + 1.2, 0.12, 0.8, 'madeira', { tint: C.woodDark, collide: false, segments: 6 });
  // Veranda over the lake in front of the two south doors.
  k.deck(rect(26.5, -38.7, 37.5, -36.5), 0.4);
  k.railing('x', -36.56, 26.5, 37.5, 0.4, { h: 0.85 });
  k.railing('z', 26.56, -38.7, -36.5, 0.4, { h: 0.85 });
  k.railing('z', 37.44, -38.7, -36.5, 0.4, { h: 0.85 });
  k.lowTable(29, 0.4, -42.4, 1.2, 0.7);
  k.lowTable(35, 0.4, -42.4, 1.2, 0.7);
  k.lowTable(32, 0.4, -40.6, 1.0, 0.6);

  // --- The dragon fountain on its islet: spits water, roars fire when shot ---------------------------
  r.place('fonteDragao', {}, { p: [39, 0, -14], prop: 'dragao' });

  // --- Banks: trees, rocks, a small pavilion on the south bank, lanterns ---------------------------
  k.ting(40.5, -3.8, 1.8, { h: 2.6 });
  k.bench(40.5, -3.8, 'x', 1.8);
  k.pine(20.4, 0, -43, 1.0);
  k.pine(20.2, 0, -16.6, 0.9, BLOSSOM);
  k.pine(43.6, 0, -27, 0.85);
  k.pine(26.4, 0, -3.4, 1.0);
  k.pine(43.4, 0, -42.8, 0.9);
  for (const [x, z, sx, sy, sz] of [
    [20.4, -36.6, 1.0, 1.2, 1.0], [20.6, -31.4, 0.8, 0.9, 0.8], [20.4, -19.6, 1.0, 1.0, 1.0],
    [36.2, -4.6, 1.0, 1.1, 1.0], [23.6, -5.2, 1.2, 1.0, 1.0], [35.2, -1.8, 0.8, 0.9, 0.8],
  ]) {
    k.rock(x, 0, z, sx, sy, sz);
  }
  // Half in the water along the narrow east bank, leaving the path free.
  for (const [z, s] of [[-36.4, 0.7], [-20.4, 0.8], [-9.2, 0.7]]) k.rock(42.2, -0.4, z, s, s * 1.2, s);
  k.hedge(27.6, -6.4, 32.4, -5.6, 1.1);
  for (const [x, z] of [[19.4, -7.4], [19.4, -12.6], [44.2, -12], [21.2, -40.6], [27.6, -1.4]]) k.stoneLantern(x, z);
  k.sign(['PROIBIDO', 'acordar o dragão', '(ele cospe fogo)'], 43.9, -15.8, Math.PI / 2, '#ffd23f', '#1b1530', 2.2);
}

// --- Pátio das Lanternas (south-east, x 18..45, z 0..45) -----------------------------------------------
// The estate's service quarter, close quarters. The Lantern Street runs south from the lake's gate (x 29..33)
// under strings of red lanterns, with a pailou over its middle and a cart to hide behind. West of it: tea house,
// kitchen, storehouse; east: the servants' house (two stories, a balcony over the street), the music room
// (paper walls) and the workshop. Alleys between them, and the inner market at the south end.

export function lanternas(r: Recorder) {
  const { b } = r;
  const k = kit(r);
  const street = 0xa8a294;
  k.paving(rect(29, 0.3, 33, 30.6), street);
  k.paving(rect(18.3, 30.6, 44.7, 44.7), 0xb8b0a0);
  k.paving(rect(18.3, 10.6, 29, 15.6), street, 'pedra', 0.025);
  k.paving(rect(33, 12.6, 44.7, 15.4), street, 'pedra', 0.025);

  // --- West row: tea house, kitchen, storehouse ----------------------------------------------------
  k.pavilion(
    {
      cx: 23.6,
      cz: 6,
      stories: [{ hw: 4.4, hd: 4.2, h: 3.4, style: 'madeira', sideStyle: { e: 'papel' }, doors: { e: [-2], s: [2] }, windows: { e: [2.2], n: [-1] } }],
      roof: { overhang: 0.6, rise: 2.0, curl: 0.7 },
    },
    0.75,
  );
  k.lowTable(22, 0, 4, 1.2, 0.7);
  k.lowTable(25, 0, 8, 1.2, 0.7);
  b.span(19.6, 0, 2.2, 21, 1.8, 2.8, 'madeira', { tint: C.lacquerDark });

  k.pavilion({
    cx: 23.6,
    cz: 20.2,
    stories: [{ hw: 4.4, hd: 4.2, h: 3.4, style: 'estuque', doors: { n: [1.5], e: [0], s: [-2] }, windows: { e: [-2.6], w: [1] } }],
    roof: { overhang: 0.6, rise: 2.0, curl: 0.7 },
  });
  // Stove (brick), worktable, water jars.
  b.span(19.6, 0, 16.4, 22.6, 0.95, 17.4, 'tijolo', { tint: 0xb06a4a });
  b.cylinder(20.4, 0.95, 16.9, 0.38, 0.22, 'metal', { tint: 0x3a3a3a, segments: 12, collide: false });
  b.cylinder(21.9, 0.95, 16.9, 0.32, 0.2, 'metal', { tint: 0x3a3a3a, segments: 12, collide: false });
  b.span(23.4, 0, 19.4, 26.2, 0.85, 20.4, 'madeira', { tint: C.wood });
  for (const [x, z] of [[19.8, 23.6], [20.7, 23.7], [27.2, 23.6]]) k.vase(x, 0, z, 0.9, 0x6b4a32);

  k.pavilion({
    cx: 23.6,
    cz: 28.2,
    stories: [{ hw: 4.4, hd: 2.2, h: 3.2, style: 'madeira', doors: { e: [0], s: [2] } }],
    roof: { overhang: 0.5, rise: 1.6, curl: 0.6 },
  });
  k.crate(20, 0, 27, 1.0);
  k.crate(20, 1.0, 27, 0.8, 0.3);
  k.crate(21.2, 0, 29.4, 0.9, 0.2);
  k.crate(26.6, 0, 26.9, 0.8);

  // --- East row: servants' house (two stories), music room, workshop --------------------------------
  const servants: PavilionSpec = {
    cx: 38.6,
    cz: 7.4,
    stories: [
      { hw: 4.6, hd: 5.2, h: 3.3, style: 'estuque', doors: { w: [-2.2], s: [2.5] }, windows: { w: [2.6], e: [0] }, stairs: [{ side: 'n', dir: 1, from: -3.8, inset: 0.25 }] },
      { hw: 4.6, hd: 5.2, h: 3.0, style: 'madeira', sideStyle: { w: 'papel' }, doors: { w: [3.4] }, windows: { s: [-2, 2], e: [0] }, balcony: { depth: 1.0, sides: ['w'] }, skirt: 0.6 },
    ],
    roof: { overhang: 0.8, rise: 2.2, curl: 0.8 },
  };
  k.pavilion(servants, 0.75);
  // The upper floor starts where the ground floor ends (no plinth).
  const upper = servants.stories[0].h;
  b.span(41.4, 0, 9.6, 42.9, 0.6, 12, 'madeira', { tint: C.wood });
  b.span(41.4, upper, 9.6, 42.9, upper + 0.6, 12, 'madeira', { tint: C.wood });
  k.lowTable(39, upper, 5.6, 1.2, 0.7, 'nada');

  k.pavilion(
    {
      cx: 39,
      cz: 20,
      stories: [{ hw: 5.0, hd: 4.2, h: 3.4, style: 'papel', sideStyle: { e: 'madeira' }, doors: { w: [0], n: [2], s: [-2] } }],
      roof: { overhang: 0.6, rise: 2.0, curl: 0.8 },
    },
    0.75,
  );
  // A guzheng on its stand, two drums, cushions.
  b.span(36, 0.55, 17.3, 38.2, 0.7, 17.8, 'madeira', { tint: 0x8a5432, collide: false });
  for (const x of [36.3, 37.9]) b.span(x - 0.08, 0, 17.4, x + 0.08, 0.55, 17.7, 'madeira', { tint: C.woodDark, collide: false });
  b.cuboidCollider(new THREE.Vector3(37.1, 0.35, 17.55), new THREE.Vector3(1.1, 0.35, 0.25), new THREE.Quaternion(), 'wood');
  for (const [i, [x, z]] of [[41.6, 22.4], [42.8, 21.2]].entries()) r.place('tamborBanco', {}, { p: [x, 0, z], prop: `tambor:${2 + i}` });
  for (const [x, z] of [[36.6, 21.8], [38, 22.6], [39.6, 21.6]]) b.span(x - 0.25, 0, z - 0.25, x + 0.25, 0.1, z + 0.25, 'pintura', { tint: 0xb8322a, collide: false, castShadow: false });

  k.pavilion({
    cx: 39,
    cz: 28.2,
    stories: [{ hw: 5.0, hd: 2.2, h: 3.2, style: 'madeira', doors: { w: [0], n: [2.5], s: [-2] } }],
    roof: { overhang: 0.5, rise: 1.6, curl: 0.6 },
  });
  b.span(40.6, 0, 29.2, 43.8, 0.9, 30.0, 'madeira', { tint: C.wood });
  k.crate(43.4, 0, 26.7, 0.8);
  k.crate(35.2, 0, 29.6, 0.8, 0.4);

  // --- The street: lantern strings, the pailou, a cart, odds and ends ------------------------------
  for (let z = 2.2; z <= 29; z += 3) {
    if (Math.abs(z - 15) < 1.5) continue;
    k.string([29.1, 4.3, z], [32.9, 4.3, z], 3);
  }
  {
    const z = 15;
    for (const x of [29.4, 32.6]) {
      b.cylinder(x, 0, z, 0.3, 0.3, 'pedra', { tint: C.stone, segments: 8, collide: false });
      k.column(x, z, 0, 4.4, 0.18);
    }
    b.span(29.1, 3.9, z - 0.18, 32.9, 4.25, z + 0.18, 'pintura', { tint: C.beam, collide: false });
    b.span(29.1, 3.86, z - 0.2, 32.9, 3.9, z + 0.2, 'pintura', { tint: C.gold, collide: false });
    for (const side of [-1, 1]) k.plaque('燈籠街', 31, 3.45, z + side * 0.2, side > 0 ? 0 : Math.PI, 2.2, 0.55, '#8a2a22');
    k.roof({ outer: rect(28.4, z - 0.9, 33.6, z + 0.9), top: rect(29.4, z, 32.6, z), eaveY: 4.4, topY: 5.3, curl: 0.5, ridges: true, collide: false }, 0.6);
  }
  r.place('carrinho', {}, { p: [31.7, 0, 22.6] });
  k.crate(29.6, 0, 7.8, 0.8);
  k.crate(32.3, 0, 27.6, 0.9, 0.5);
  for (const [x, z] of [[29.5, 18.4], [32.5, 10.8], [32.5, 3]]) r.place('cesto', {}, { p: [x, 0, z] });

  // --- Alleys --------------------------------------------------------------------------------------
  // East alley: crates stacked so the long view from the ring gate stops here.
  k.crate(35.6, 0, 13.3, 1.1);
  k.crate(35.6, 1.1, 13.3, 0.9, 0.4);
  k.crate(38.6, 0, 13.7, 0.9, 0.2);
  k.vase(44, 0, 13.4, 1.0, 0x6b4a32);
  k.bench(26.6, 13.9, 'x', 1.8);
  k.crate(20.4, 0, 11.2, 0.9, 0.3);
  k.pine(21.4, 0, 15.0, 0.75);

  // --- Market --------------------------------------------------------------------------------------
  // Oranges, limes and apples, peaches; the fourth stall sells pottery (it doesn't get cut).
  const goods: number[][] = [[0xff7a1a, 0xffb52e, 0xe0301e], [0x7cb342, 0x4f9e3a, 0xb6d36a], [0xc0352b, 0xe7b847, 0x8a2a22], [0x2f5d8a, 0xf2efe6, 0x3f6f8a]];
  const stall = (x: number, z: number, pano: number, mercadorias: number[], frutas: boolean) => r.place('barracaMercado', { pano, mercadorias, frutas }, { p: [x, 0, z] });
  stall(23, 34.2, 0x2f7f78, goods[0], true);
  stall(29.6, 34.2, 0xc0352b, goods[1], true);
  stall(40.4, 34.2, 0xe7b847, goods[2], true);
  stall(25.4, 40.6, 0xc0352b, goods[3], false);
  stall(34.2, 40.6, 0x2f7f78, goods[0], true);
  stall(41.6, 41, 0x8a2a22, goods[1], true);
  for (const [x, z, s, yaw] of [[19.4, 43.4, 1.0, 0], [20.6, 43.6, 0.8, 0.4], [19.5, 42.3, 0.7, 0.1], [36.6, 37.4, 0.9, 0.3], [44, 36, 0.9, 0]]) k.crate(x, 0, z, s, yaw);
  for (const [x, z] of [[27.6, 37.6], [33.4, 33], [44, 31.6], [38.6, 44]]) r.place('cesto', {}, { p: [x, 0, z] });
  // The chime bells: shoot them to play dó, ré, mi, fá, sol.
  r.place('sinosBianzhong', { de: 27.4, ate: 32.6 }, { p: [30, 0, 43.9] });
  for (const [x, z] of [[21.4, 31.4], [44, 39.4]]) k.vase(x, 0, z, 1.2, 0x2f5d8a);
  k.string([18.6, 4.4, 37.4], [44.4, 4.4, 37.4], 9);
  k.string([31, 4.6, 30.8], [31, 4.6, 44.4], 4);
  k.sign(['MERCADO', 'Pague antes', 'de oprimir'], 34.6, 31.4, 0, '#fff8ec', '#c0271b', 2.0);
}

// --- Pátio dos Guerreiros (south, x -18..18, z 20..45) -------------------------------------------------
// The estate's military court: the big red gate leads into the training arena (an open stone court with a
// painted circle, weapon racks, training dummies, armor stands and a low wall). West: the dojo. North-east: the
// Master's Platform, one level up (a view over the arena, never over the walls). South-west: the zen garden by
// the bamboo valley's moon gate. South-east: the armory shed by the lantern quarter's gate.

export function guerreiros(r: Recorder) {
  const { b } = r;
  const k = kit(r);
  // --- Arena ---------------------------------------------------------------------------------------
  k.paving(rect(-4.4, 24.2, 12.2, 38.4), 0xc2baa8);
  r.shape('pintura', C.lacquer, 'toro', [4.2, 0.12, 4, 48], [['rotateX', Math.PI / 2], ['scale', 1, 0.15, 1], ['translate', 4, 0.045, 31.3]], false);
  for (const [x, z] of [[4, 27.1], [4, 35.5], [-0.2, 31.3], [8.2, 31.3]]) b.span(x - 0.3, 0.03, z - 0.3, x + 0.3, 0.05, z + 0.3, 'pintura', { tint: C.gold, collide: false, castShadow: false });
  // Low stone wall at the entrance: cover for whoever comes through the gate.
  b.span(2.6, 0, 23.2, 9.4, 1.1, 23.8, 'pedra', { tint: C.stoneDark });
  b.span(2.5, 1.1, 23.1, 9.5, 1.2, 23.9, 'pedra', { tint: C.stone, collide: false });
  const rack = (x: number, z: number, ao: 'x' | 'z') => r.place('suporteArmas', { ao }, { p: [x, 0, z] });
  const dummy = (x: number, z: number) => r.place('bonecoTreino', {}, { p: [x, 0, z] });
  const armor = (x: number, z: number) => r.place('armaduraLaqueada', {}, { p: [x, 0, z] });
  rack(-3.2, 27.6, 'z');
  rack(-3.2, 34.8, 'z');
  rack(4, 38.2, 'x');
  for (const [x, z] of [[10.8, 26.4], [10.6, 30.2], [11, 35.6], [-2.4, 37.2], [1.2, 25.6]]) dummy(x, z);
  armor(7.4, 38.2);
  armor(0.6, 38.2);
  k.crate(11.2, 0, 32.6, 1.0, 0.3);
  k.crate(11.4, 1.0, 32.6, 0.7, 0.8);
  k.crate(-3.4, 0, 31.2, 0.9, 0.1);
  // A war drum on its stand.
  r.place('tamborGuerra', {}, { p: [-3.1, 0, 24.1], prop: 'tambor:1' });

  // --- Dojo ----------------------------------------------------------------------------------------
  k.pavilion(
    {
      cx: -11.5,
      cz: 29.5,
      stories: [{ hw: 5.2, hd: 6.0, h: 3.8, style: 'madeira', doors: { e: [-3, 3], n: [2], s: [-2] }, windows: { e: [0], n: [-2.6], s: [2.4] } }],
      roof: { overhang: 1.0, rise: 2.6, curl: 0.9 },
    },
    0.8,
  );
  // Tatami: straw mats with dark borders.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 5; j++) {
      const x0 = -16.2 + i * 2.35;
      const z0 = 24.2 + j * 2.2;
      b.span(x0 + 0.03, 0.02, z0 + 0.03, x0 + 2.3, 0.035, z0 + 2.15, 'pintura', { tint: 0xd8cf98, collide: false, castShadow: false });
    }
  }
  rack(-16.1, 26.2, 'z');
  rack(-16.1, 32.6, 'z');
  // Shrine on the west wall, between the racks.
  b.span(-16.5, 0, 28.6, -15.7, 1.0, 30.4, 'madeira', { tint: C.lacquerDark });
  b.span(-16.6, 1.0, 29.1, -16.3, 2.2, 29.9, 'pintura', { tint: C.gold, collide: false });
  dummy(-11.6, 27.4);
  dummy(-9.2, 31.8);
  for (const z of [26.5, 32.5]) k.lantern(-11.5, 3.75, z, 0.8);

  // --- Master's Platform (one level up, roofed) ---------------------------------------------------
  {
    const x0 = 12.6;
    const x1 = 17.1;
    const z0 = 22.0;
    const z1 = 26.6;
    const y = 2.0;
    b.span(x0, y - 0.2, z0, x1, y, z1, 'madeira', { tint: C.wood });
    b.room({ x: x0, y, z: z0 }, { x: x1, y: y + 2.6, z: z1 }, 0.3); // roofed, open all around
    for (const [x, z] of [[x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2], [x1 - 0.2, z1 - 0.2], [x0 + 0.2, z1 - 0.2]]) k.column(x, z, 0, y + 2.6, 0.15);
    b.stairs('z', -1, z1 + stairRun(y), x0, x0 + 1.3, 0, y, 'madeira', { tint: C.wood });
    k.railing('x', z0 + 0.06, x0, x1, y);
    k.railing('z', x1 - 0.06, z0, z1, y);
    k.railing('x', z1 - 0.06, x0 + 1.4, x1, y);
    k.railing('z', x0 + 0.06, z0, z1 - 1.0, y);
    k.roof({ outer: rect(x0 - 0.7, z0 - 0.7, x1 + 0.4, z1 + 0.7), top: rect((x0 + x1) / 2, (z0 + z1) / 2, (x0 + x1) / 2, (z0 + z1) / 2), eaveY: y + 2.6, topY: y + 3.8, curl: 0.6, ridges: true }, 0.6);
    // Under it: crates and a rack (the platform's shade is cover too).
    k.crate(15.6, 0, 23.4, 1.0, 0.2);
    rack(16.8, 24.2, 'z');
  }

  // --- Zen garden (south-west) ---------------------------------------------------------------------
  k.paving(rect(-17.7, 37.6, -4.6, 44.7), 0xe9dfc6, 'pintura');
  for (let z = 38.1; z < 44.5; z += 0.45) b.span(-17.6, 0.03, z, -4.7, 0.045, z + 0.05, 'pintura', { tint: 0xd2c7ad, collide: false, castShadow: false });
  for (const [x, z, sx, sy, sz] of [[-13.6, 41.8, 1.4, 1.5, 1.1], [-9.2, 40.2, 1.0, 1.1, 0.9], [-6.6, 43.2, 0.8, 0.8, 0.8]]) k.rock(x, 0, z, sx, sy, sz, 0x8f8a80);
  k.pine(-11.2, 0, 43.6, 1.0);
  k.pine(-5.4, 0, 38.6, 0.8, BLOSSOM);
  k.bench(-9.6, 44, 'x', 2.0);
  k.stoneLantern(-16.8, 39.2);
  k.stoneLantern(-16.8, 42.8);
  k.path([[-13.4, 36.2], [-14.4, 38.6], [-16.4, 41]]);
  k.path([[-14.4, 38.6], [-10.6, 38.2], [-7, 40.8], [-3.6, 41.8]]);

  // --- Armory shed (south-east) --------------------------------------------------------------------
  k.pavilion({
    cx: 13.6,
    cz: 41.4,
    stories: [{ hw: 2.8, hd: 2.6, h: 3.0, style: 'madeira', doors: { n: [0], w: [0] } }],
    roof: { overhang: 0.6, rise: 1.6, curl: 0.6 },
  });
  rack(15.8, 41.4, 'z');
  k.crate(11.8, 0, 43.2, 0.8);
  armor(15.4, 43.4);
  for (const [x, z, s, yaw] of [[16.4, 30.6, 1.0, 0.2], [16.6, 31.7, 0.8, 0], [13.6, 34.4, 0.9, 0.5]]) k.crate(x, 0, z, s, yaw);
  armor(9.6, 43.6);
  k.pine(3.2, 0, 42.8, 1.0);
  k.rock(6.6, 0, 43.8, 1.0, 1.1, 0.9);
  k.stoneLantern(-0.6, 43.4);
  k.stoneLantern(9.4, 21.2);
  k.stoneLantern(2.6, 21.2);
}

// --- Vale do Bambu (south-west, x -45..-18, z 0..45) ---------------------------------------------------
// The wild part of the estate, made for ambushes. Bamboo groves (solid) carve three ways through the north half;
// in the north-west corner, a dense stretch with narrow lanes. A stream crosses the valley under a wooden
// bridge: walk its bed and you pass under the bridge unseen, out to the gardener's house (a panda sits by it)
// and the warriors' moon gate.

export function bambu(r: Recorder) {
  const { b } = r;
  const k = kit(r);
  // --- Stream (east-west, z 25..28.5), its bed 1.2 m down, steps in and out ------------------------
  const STREAM = rect(-45, 25, -18.3, 28.5);
  k.basin(STREAM, 1.2, { coping: ['n', 's'], waterY: -0.78, floor: 0x5f6b58 });
  k.lilies(rect(-44, 25.4, -36, 28.1), 5, -0.765);
  const run = stairRun(1.2, true);
  // North and south flights side by side (facing each other they would meet in a V with no way out).
  for (const [xn, xs] of [[-43.4, -41.4], [-21.6, -23.6]]) {
    b.stairs('z', -1, STREAM.z0 + run, xn, xn + 1.3, -1.2, 1.2, 'pedra', { tint: C.stone, gentle: true });
    b.stairs('z', 1, STREAM.z1 - run, xs, xs + 1.3, -1.2, 1.2, 'pedra', { tint: C.stone, gentle: true });
  }
  for (const [x, z, s] of [[-39, 25.2, 0.8], [-35.6, 28.3, 0.7], [-26.4, 25.1, 0.9], [-27, 28.3, 0.7], [-44.5, 26.8, 0.8]]) k.rock(x, -1.1, z, s, s * 0.9, s * 0.8);
  k.reeds(-37.4, 27.6, 10, 0.7, -1.2);
  k.reeds(-24.8, 25.8, 10, 0.7, -1.2);
  // The wooden bridge: high enough in the middle to walk under it along the stream bed.
  k.bridge('z', 22.2, 31.3, -31, 2.4, 1.05, 0, C.wood, 'madeira');

  // --- Groves --------------------------------------------------------------------------------------
  // North-west corner: the dense stretch (narrow lanes between five groves).
  k.grove(rect(-45, 0.3, -40, 6), 1.0);
  k.grove(rect(-45, 8, -41.6, 13), 1.15);
  k.grove(rect(-39.4, 8.4, -36.6, 12.6), 1.15);
  k.grove(rect(-45, 15, -40.6, 20), 1.15);
  k.grove(rect(-38.6, 14.6, -34.6, 19.4), 1.15);
  // Between the upper and the central paths, and along the stream.
  k.grove(rect(-32, 5.6, -27, 9.2), 0.9);
  k.grove(rect(-33, 12.6, -28.4, 17), 0.9);
  k.grove(rect(-25, 13, -19.2, 18), 0.9);
  k.grove(rect(-29.6, 20.2, -24.4, 23.6), 0.9);
  k.grove(rect(-44.7, 21.2, -40.4, 24.2), 0.9);
  // South half.
  k.grove(rect(-45, 30.2, -40.4, 35.2), 0.9);
  k.grove(rect(-27, 33, -22.4, 37.6), 0.9);
  k.grove(rect(-35.6, 40, -31.4, 44.7), 0.9);

  // --- Paths ---------------------------------------------------------------------------------------
  k.path([[-36, 0.8], [-33, 3], [-27, 4.4], [-22, 8], [-18.8, 10]]);
  k.path([[-34.6, 3.4], [-35.4, 7], [-33.8, 11], [-27.2, 11.4], [-26.6, 18.8], [-31, 21.6]]);
  k.path([[-31, 31.6], [-29, 34.6], [-28.2, 38.6], [-22.4, 40.6], [-18.8, 41]]);
  k.path([[-31, 31.6], [-35.4, 34], [-37.4, 38.4]]);

  // --- Gardener's house (south-west) ---------------------------------------------------------------
  k.pavilion({
    cx: -40.6,
    cz: 40.8,
    stories: [{ hw: 2.8, hd: 2.6, h: 3.0, style: 'madeira', doors: { e: [0], n: [1.2] }, windows: { e: [-1.6] } }],
    roof: { overhang: 0.6, rise: 1.6, curl: 0.5 },
  });
  // Shelves of pots, a table, seed sacks, tools against the wall.
  b.span(-43.2, 0, 38.4, -42.6, 1.9, 43.2, 'madeira', { tint: C.woodDark });
  for (let i = 0; i < 4; i++) k.vase(-42.9, 1.9, 38.9 + i * 1.2, 0.45, i % 2 ? 0x8a4a2f : 0x6b4a32);
  b.span(-41, 0, 42, -39, 0.8, 42.9, 'madeira', { tint: C.wood });
  for (const [x, z] of [[-38.3, 42.8], [-38.2, 39]]) b.cylinder(x, 0, z, 0.25, 0.6, 'pintura', { tint: 0xc9b48a, segments: 8 });
  for (let i = 0; i < 3; i++) b.box(-41.6 + i * 0.4, 0.8, 43.15, 0.05, 1.6, 0.05, 'madeira', { tint: 0x6b4a32, collide: false });
  k.crate(-36.6, 0, 43.6, 0.8, 0.3);
  k.crate(-37.2, 0, 37.6, 0.7, 0.1);
  k.bench(-36.2, 40.6, 'z', 1.6);
  // The panda: sitting against the house's north wall, beside the door, eating bamboo.
  r.place('panda', {}, { p: [-42.2, 0, 37.0], yaw: Math.PI });

  // --- Rocks, a few pines, lanterns ----------------------------------------------------------------
  for (const [x, z, sx, sy, sz] of [
    [-30.4, 2.2, 1.0, 1.1, 0.9], [-23, 4.6, 0.9, 1.0, 0.9], [-20.4, 20.2, 0.8, 0.9, 0.8], [-36.2, 22.4, 1.1, 1.2, 1.0],
    [-21.6, 22.6, 1.0, 1.1, 1.0], [-34, 31.6, 0.9, 1.0, 0.9], [-24, 31.4, 1.1, 1.0, 1.0], [-20.4, 34, 0.8, 0.9, 0.8], [-38.6, 7, 0.6, 0.7, 0.6],
  ]) {
    k.rock(x, 0, z, sx, sy, sz);
  }
  k.pine(-23.4, 0, 1.8, 0.9);
  k.pine(-27.4, 0, 29.8, 0.85);
  k.pine(-21, 0, 44, 0.8);
  for (const [x, z] of [[-34, 1.2], [-38, 1.2], [-19.2, 7.8], [-19.2, 12.2], [-33, 30.2], [-29, 30.2], [-19.4, 38.6]]) k.stoneLantern(x, z);
  // A small roadside shrine in the dense stretch.
  b.span(-44.6, 0, 13.6, -43.6, 0.9, 14.4, 'pedra', { tint: C.stone });
  k.stoneLantern(-44.1, 14, 0.9);
}

// --- Santuário Ancestral (north-west, x -45..-18, z -45..0) --------------------------------------------
// The monumental part: a lower court (bell and drum pavilions, a stele, guardian lions) leads to the grand
// stairs, which climb 3 m to the terrace: the incense court with the great burner, and the temple at the back
// (three tiers of roof; inside, the ancestral hall with altars, portraits, the dragon and the gong). Inside the
// terrace is the crypt: tombs between pillars, lamps in niches, doors to the lower court and the east path and a
// stair up to the incense court. The east path (to the bonsai garden) runs at ground level beside the terrace.

export function santuario(r: Recorder) {
  const { b } = r;
  const k = kit(r);
  const stone = { tint: C.stone };

  // --- Terrace and the crypt inside it -------------------------------------------------------------
  // North block (under the temple): solid. South part: the crypt, under a 0.4 m slab.
  b.span(-45, 0, -45, -24, TY, -33.6, 'pedra', { tint: 0xb4ae9f });
  const well = rect(-30.4, -33.6, -26.4, -32.2);
  r.place('laje', { area: rect(-45, -33.6, -24, -21), furos: [{ ...well }], y0: TY - 0.4, y1: TY, superficie: 'pedra', cor: 0xb4ae9f });
  const retain = { tint: 0xa8a294, frame: { surface: 'pintura' as const, tint: C.stoneDark, width: 0.12 } };
  b.wall('x', -21.3, -45, -24, 0.6, TY - 0.4, 'pedra', [[-42.9, -41.1, 0, 2.3]], 0, retain);
  b.wall('z', -24.3, -33.6, -21.6, 0.6, TY - 0.4, 'pedra', [[-27.9, -26.1, 0, 2.3]], 0, retain);
  // A darker band along the terrace's face.
  b.span(-45, TY - 0.45, -21.06, -24, TY - 0.3, -20.95, 'pintura', { tint: C.stoneDark, collide: false, castShadow: false });
  b.span(-24.06, TY - 0.45, -45, -23.95, TY - 0.3, -21, 'pintura', { tint: C.stoneDark, collide: false, castShadow: false });
  // Crypt inside: a wall splitting west from east, the west half in two chambers, tombs, pillars, lamps.
  const cryptH = TY - 0.4;
  b.room({ x: -45, y: 0, z: -33.6 }, { x: -24.6, y: cryptH, z: -21.6 }, 1);
  const stoneWall = { tint: 0x9d9a90 };
  b.wall('z', -36, -33.6, -21.6, 0.5, cryptH, 'pedra', [[-25.4, -23.6, 0, 2.3], [-31.4, -29.6, 0, 2.3]], 0, stoneWall);
  b.wall('x', -27.6, -45, -36.25, 0.5, cryptH, 'pedra', [[-41.4, -39.6, 0, 2.3]], 0, stoneWall);
  b.span(-45, 0, -33.6, -24, 0.02, -21, 'pedra', { tint: 0x7d7a72, collide: false, castShadow: false });
  for (const [x, z, ao] of [[-41, -31.6, 'x'], [-41, -24.4, 'x'], [-33, -24.6, 'z'], [-28.6, -25.2, 'x'], [-32.6, -30.2, 'x']] as const) r.place('tumulo', { ao }, { p: [x, 0, z] });
  for (const [x, z] of [[-38.4, -30.6], [-38.4, -24.6], [-31.6, -27.4], [-27.2, -29.6]]) b.span(x - 0.3, 0, z - 0.3, x + 0.3, cryptH, z + 0.3, 'pedra', { tint: 0x8f8a80 });
  const lamp = (x: number, y: number, z: number) => r.place('lampiao', {}, { p: [x, y, z] });
  for (const [x, z] of [[-44.6, -30.6], [-44.6, -24.6], [-36.6, -33.2], [-35.4, -22], [-25, -24], [-30.8, -22], [-31, -33.4]]) lamp(x, 1.4, z);
  // Stair from the crypt up to the incense court, through the well in the slab. Up there a low stone parapet
  // closes the well on three sides; the top of the flight comes out on the open east side.
  b.stairs('x', 1, -30.4, -33.55, -32.25, 0, TY, 'pedra', { tint: C.stone });
  const parapet = { tint: C.stoneDark };
  const pTop = TY + 0.85;
  b.span(well.x0 - 0.3, TY, well.z1, well.x1 - 1.0, pTop, well.z1 + 0.3, 'pedra', parapet);
  b.span(well.x0 - 0.3, TY, well.z0 - 0.3, well.x1 - 1.0, pTop, well.z0, 'pedra', parapet);
  b.span(well.x0 - 0.3, TY, well.z0, well.x0, pTop, well.z1, 'pedra', parapet);
  b.span(well.x0 - 0.35, pTop, well.z0 - 0.35, well.x1 - 0.95, pTop + 0.08, well.z0 + 0.02, 'pedra', { tint: C.stone, collide: false });
  b.span(well.x0 - 0.35, pTop, well.z1 - 0.02, well.x1 - 0.95, pTop + 0.08, well.z1 + 0.35, 'pedra', { tint: C.stone, collide: false });
  b.span(well.x0 - 0.35, pTop, well.z0, well.x0 + 0.02, pTop + 0.08, well.z1, 'pedra', { tint: C.stone, collide: false });
  for (const z of [well.z0 - 0.15, well.z1 + 0.15]) lamp(well.x1 - 1.15, pTop + 0.08, z);

  // --- Grand stairs, side stairs and the terrace's balustrade --------------------------------------
  const run = stairRun(TY);
  b.stairs('z', -1, -21 + run, -37.5, -31.5, 0, TY, 'pedra', stone);
  for (const x of [-37.85, -31.15]) {
    for (let i = 0; i < 4; i++) {
      const z0 = -21 + (i * run) / 4;
      const h = TY * (1 - i / 4) + 0.55;
      b.span(x - 0.35, 0, z0, x + 0.35, h, z0 + run / 4, 'pedra', { tint: C.stoneDark });
    }
  }
  b.stairs('x', -1, -24 + run, -32.4, -30.4, 0, TY, 'pedra', stone);
  k.railing('x', -21.06, -45, -37.9, TY, { tint: C.stoneDark });
  k.railing('x', -21.06, -31.1, -24, TY, { tint: C.stoneDark });
  k.railing('z', -24.06, -45, -32.5, TY, { tint: C.stoneDark });
  k.railing('z', -24.06, -30.3, -21, TY, { tint: C.stoneDark });

  // --- Incense court (on the terrace) --------------------------------------------------------------
  // The court's paving leaves the crypt's stairwell open.
  r.place('laje', { area: rect(-44.6, -33.6, -24.4, -21.4), furos: [{ ...well }], y0: TY, y1: TY + 0.03, superficie: 'pedra', cor: 0xcfc8b8, colide: false, sombra: false });
  k.incense(-34.5, TY, -28.4, 1.25);
  // Paifang at the top of the stairs.
  {
    const z = -22.4;
    for (const x of [-37.6, -35.6, -33.4, -31.4]) {
      b.box(x, TY + 0.3, z, 0.8, 0.6, 0.8, 'pedra', stone);
      k.column(x, z, TY, TY + 4.6, 0.22);
    }
    b.span(-38.2, TY + 4.0, z - 0.25, -30.8, TY + 4.5, z + 0.25, 'pintura', { tint: C.beam });
    b.span(-38.25, TY + 3.95, z - 0.27, -30.75, TY + 4.02, z + 0.27, 'pintura', { tint: C.gold, collide: false });
    for (const side of [-1, 1]) k.plaque('祖廟', -34.5, TY + 3.5, z + side * 0.28, side > 0 ? 0 : Math.PI, 1.8, 0.6);
    k.roof({ outer: rect(-38.9, z - 1.0, -30.1, z + 1.0), top: rect(-36.6, z, -32.4, z), eaveY: TY + 4.5, topY: TY + 5.5, curl: 0.6, ridges: true, collide: false }, 0.7);
  }
  // Bells on frames, trees in planters, ceremonial tables, lanterns.
  for (const [i, x] of [-41.6, -27.4].entries()) {
    r.place('sinoPortico', {}, { p: [x, TY, -30.6], prop: `sino:${i}` });
    r.place('pinheiroVaso', {}, { p: [x, 0, -24.2] });
  }
  for (const x of [-40.4, -36]) {
    b.span(x - 0.9, TY, -32.9, x + 0.9, TY + 0.85, -32.2, 'madeira', { tint: C.lacquerDark });
    k.incense(x, TY + 0.85, -32.55, 0.22);
  }
  k.vase(-44, TY, -32.8, 1.1);
  k.vase(-44, TY, -21.9, 1.1, 0x8a4a2f);
  k.stoneLantern(-40, -26.4, TY);
  k.stoneLantern(-29, -26.4, TY);

  // --- Temple: the ancestral hall, three tiers of roof ---------------------------------------------
  const floorY = TY + 0.5;
  const TZ = -39.4;
  const TD = 4.2;
  const back = TZ - TD + 0.1; // just inside the north wall
  k.pavilion(
    {
      cx: -34.5,
      cz: TZ,
      plinth: { h: floorY, margin: 0.8, steps: [] },
      stories: [{ hw: 7, hd: TD, h: 6.2, style: 'madeira', doors: { s: [-4, 0, 4], e: [0] }, windows: { w: [0], e: [-2.6] } }],
      roof: { overhang: 1.2, rise: 3.2, curl: 1.0 },
    },
    1.0,
  );
  b.stairs('z', -1, TZ + TD + 0.8 + stairRun(0.5, true), -37, -32, TY, 0.5, 'pedra', { ...stone, gentle: true });
  b.stairs('x', -1, -34.5 + 7 + 0.8 + stairRun(0.5, true), TZ - 1, TZ + 1, TY, 0.5, 'pedra', { ...stone, gentle: true });
  // Two lower tiers: eave skirts around the walls.
  const walls = rect(-34.5 - 7.08, TZ - TD - 0.08, -34.5 + 7.08, TZ + TD + 0.08);
  k.roof({ outer: expand(walls, 1.2), top: walls, eaveY: floorY + 2.9, topY: floorY + 3.5, curl: 0.6, thickness: 0.14, collide: false }, 0.8);
  k.roof({ outer: expand(walls, 0.7), top: walls, eaveY: floorY + 4.9, topY: floorY + 5.4, curl: 0.5, thickness: 0.12, collide: false });
  // Inside: altar along the north wall, portraits, the golden dragon above, the gong, statues.
  b.span(-40, floorY, back, -29, floorY + 1.0, back + 0.9, 'madeira', { tint: C.lacquerDark });
  b.span(-40.1, floorY + 1.0, back - 0.05, -28.9, floorY + 1.06, back + 0.95, 'pintura', { tint: C.gold, collide: false });
  for (let i = 0; i < 5; i++) {
    const x = -38.5 + i * 2;
    b.span(x - 0.3, floorY + 1.06, back + 0.2, x + 0.3, floorY + 1.66, back + 0.35, 'pintura', { tint: 0x3a2a1a, collide: false });
    b.span(x - 0.24, floorY + 1.12, back + 0.36, x + 0.24, floorY + 1.6, back + 0.38, 'pintura', { tint: C.gold, collide: false, castShadow: false });
    b.cylinder(x + 0.6, floorY + 1.06, back + 0.6, 0.06, 0.18, 'pintura', { tint: 0xf2efe6, collide: false, segments: 6 });
  }
  for (const [x, i] of [[-39.6, 0], [-34.5, 1], [-29.4, 2]] as const) r.place('quadro', { estilo: 'ancestral', indice: i, largura: 1.4, altura: 1.9 }, { p: [x, floorY + 2.9, back - 0.07] });
  r.place('dragaoDecorativo', { caminho: [-40.5, -38, -35.5, -33, -30.5, -28.6].map((x, i) => [x, floorY + 4.6 + Math.sin(i * 1.5) * 0.4, back + 0.05]), raio: 0.17, cores: 'dourado' });
  r.place('gongo', {}, { p: [-34.5, floorY, TZ - 1.2], prop: 'gongo' });
  for (const [x, z] of [[-40.6, TZ + 2.2], [-38.6, TZ - 0.6]]) k.incense(x, floorY, z, 0.45);
  for (const x of [-41, -28]) b.span(x - 0.5, floorY, TZ + TD - 0.8, x + 0.5, floorY + 2.3, TZ + TD - 0.4, 'madeira', { tint: C.lacquerDark });
  for (const x of [-37.4, -31.6]) k.lantern(x, floorY + 5.9, TZ, 1.2);

  // --- East path (to the bonsai garden), under the terrace's edge ---------------------------------
  k.paving(rect(-23.9, -44.7, -18.3, -21), 0xbdb5a3);
  k.stoneLantern(-19.2, -35.4);
  k.stoneLantern(-19.2, -40.6);
  k.rock(-21, 0, -42.8, 1.1, 1.3, 1.0);
  k.rock(-19.4, 0, -26.4, 0.9, 1.1, 0.9);
  k.vase(-23.3, 0, -34.8, 1.2, 0x8a4a2f);
  k.bench(-18.9, -30.2, 'z', 1.8);

  // --- Lower court: the stele, bell and drum pavilions, lions, old pines ----------------------------
  k.paving(rect(-44.7, -21, -18.3, -0.3), 0xc8c0ae);
  // The male on the visitor's left, the female on the right, as at a temple's gate.
  r.place('leaoPedra', { tipo: 'macho' }, { p: [-39, 0, -15.6] });
  r.place('leaoPedra', { tipo: 'femea' }, { p: [-30, 0, -15.6] });
  r.place('estela', {}, { p: [-34.5, 0, -7.6] });
  k.ting(-41.4, -9.6, 2.1, { h: 2.9, base: 0.3, steps: ['s', 'e'] });
  r.place('sinoSuspenso', {}, { p: [-41.4, 0.3 + 2.9, -9.6], prop: 'sino:2' });
  k.ting(-26.6, -6.4, 2.1, { h: 2.9, base: 0.3, steps: ['w', 'n'] });
  r.place('tamborGrande', {}, { p: [-26.6, 0.3, -6.4], prop: 'tambor:0' });
  k.pine(-44, 0, -17.6, 1.15);
  k.pine(-25.4, 0, -18.4, 1.05);
  k.pine(-20.6, 0, -2.6, 1.0, BLOSSOM);
  k.pine(-43.6, 0, -2.4, 0.95);
  for (const [x, z, sx, sy, sz] of [[-30.6, -2.6, 1.1, 1.2, 1.0], [-21, -15, 1.0, 1.1, 1.0], [-44, -13.6, 0.9, 1.0, 0.9], [-38.6, -3.6, 0.8, 0.9, 0.8]]) k.rock(x, 0, z, sx, sy, sz);
  for (const [x, z] of [[-38.4, -1.2], [-33.6, -1.2], [-19.2, -12.4], [-19.2, -7.6]]) k.stoneLantern(x, z);
  // Cover across the court, so the ring's gate doesn't look straight down to the west wall.
  k.rock(-30.2, 0, -11.6, 1.1, 1.2, 1.0);
  k.rock(-36.6, 0, -12.2, 0.9, 1.0, 0.9);
}
