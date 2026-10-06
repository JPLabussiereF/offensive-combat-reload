// "Rua dos Vizinhos" (section 10) converted into pieces: the old buildBlockoutMap with every call recorded (see
// recorder.ts). 80 x 60 m, three east-west lanes. North: row of enterable two-story houses with gable roofs.
// Center: the street with cars and the ice cream truck. South: fenced yards, empty pool (2 m drop), tree house,
// 7 m watchtower and a doghouse loaded from glTF (public/models/casinha_cachorro.glb), guarded by Amora.
import * as THREE from 'three';
import { MAP_FORMAT, type Vec3 } from '@shared/mapData';
import { PALETTE } from '../../render/materials';
import { stairRun } from '../mapBuilder';
import type { MapMeta, Recorder } from './recorder';

export const SEED = 0;

const W = 40; // half extent X
const D = 30; // half extent Z
const TOWER_Y = 7;

export function meta(): MapMeta {
  const spawn = (x: number, z: number, yaw: number) => ({ p: [x, 0.2, z] as Vec3, yaw });
  const E = -Math.PI / 2; // facing +X
  const Wd = Math.PI / 2; // facing -X
  const N = Math.PI; // facing +Z (toward the street from the houses)
  const dummy = (x: number, y: number, z: number, yaw: number, patrulha?: { eixo: 'x' | 'z'; amplitude: number; velocidade: number }) => ({ p: [x, y, z] as Vec3, yaw, ...(patrulha ? { patrulha } : {}) });
  return {
    formato: MAP_FORMAT,
    nome: 'Rua dos Vizinhos',
    cartao: { emoji: '🏡', cor: '#cfe8ff' },
    ambiente: {
      // The sunny day (createRenderContext's), clouds drifting across it and a bird now and then.
      ceu: { cupula: { tipo: 'nuvens' } },
      celula: 40,
      killY: -20,
      sons: [{ som: 'passaro', primeiro: 4, intervalo: [6, 15] }],
    },
    arquivos: [{ id: 'casinha_cachorro', url: '/models/casinha_cachorro.glb' }],
    spawns: {
      // Team A (orange) west by the moving van, team B (blue) east by the garage.
      a: [spawn(-38, 0, E), spawn(-38, 3, E), spawn(-38, -3, E), spawn(-36, 13.5, E), spawn(-36, 20, E)],
      b: [spawn(38, 0, Wd), spawn(38, 3, Wd), spawn(36, 20, Wd)],
      ffa: ([
        // Houses: ground floor and upstairs.
        [-15, 0.2, -18], [3, 0.2, -18], [21, 0.2, -18],
        [-15, 3.2, -16], [3, 3.2, -16], [21, 3.2, -16],
        // Gaps between the houses and the strip behind them.
        [-9, 0.2, -19], [9, 0.2, -19], [-30, 0.2, -26], [0, 0.2, -26.5], [30, 0.2, -26],
        // Street ends and sidewalks.
        [-38, 0.2, -3], [38, 0.2, 3], [-20, 0.35, -8.5], [14, 0.35, 8.5],
        // Yards, tree house and tower.
        [-30, 0.2, 21], [-10, 0.2, 27], [8, 0.2, 13], [25, 0.2, 25.5], [-15, 3.2, 22], [31.8, 7.2, 27.5],
      ] as Vec3[]).map(([x, y, z]) => ({ p: [x, y, z] as Vec3, yaw: Math.atan2(x, z) })),
    },
    bonecos: [
      // Street: roughly 20 m and 45 m from the west spawn, to feel the rifle's damage falloff.
      dummy(-18, 0, 1.5, Wd),
      dummy(7, 0, 3, Wd),
      dummy(-4, 0, -4.5, Wd, { eixo: 'z', amplitude: 2.2, velocidade: 1.3 }),
      dummy(20, 0, 0, Wd, { eixo: 'z', amplitude: 3.5, velocidade: 0.9 }),
      dummy(31.5, 0, -4.5, Wd), // in front of the garage (x=34 is its wall)
      // Houses (ground floor and upstairs windows).
      dummy(-18, 0, -17, N),
      dummy(-1, 3, -16, N),
      dummy(20, 3, -16, N),
      // Yards, pool, tree house and tower.
      dummy(-2, -2, 20, Wd, { eixo: 'x', amplitude: 3, velocidade: 0.7 }),
      dummy(-15, 3, 22, Wd),
      dummy(31.8, TOWER_Y, 27.5, Wd),
      dummy(24, 0, 20, Wd, { eixo: 'z', amplitude: 4, velocidade: 1.1 }),
    ],
    objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
  };
}

export async function pieces(r: Recorder) {
  const { b } = r;
  const P = PALETTE;

  // --- Ground with a hole for the pool (x -6..6, z 16..24) -------------------------------------------
  const G = -3;
  const grass = { tint: P.grass, castShadow: false }; // ground receives shadows but never casts them
  b.span(-W, G, -D, W, 0, 16, 'grama', grass);
  b.span(-W, G, 24, W, 0, D, 'grama', grass);
  b.span(-W, G, 16, -6, 0, 24, 'grama', grass);
  b.span(6, G, 16, W, 0, 24, 'grama', grass);
  // Street and sidewalks.
  b.span(-W, 0, -7, W, 0.02, 7, 'asfalto', { tint: P.asphalt, collide: false, castShadow: false });
  b.span(-W, 0, -10, W, 0.15, -7, 'calcada', { tint: P.sidewalk, castShadow: false });
  b.span(-W, 0, 7, W, 0.15, 10, 'calcada', { tint: P.sidewalk, castShadow: false });
  for (let x = -36; x <= 36; x += 6) b.span(x - 1.2, 0.02, -0.12, x + 1.2, 0.03, 0.12, 'pintura', { tint: 0xfff2a8, collide: false, castShadow: false });

  // --- Pool: 2 m deep, ramp on the east end, steps on the west end -----------------------------------
  b.span(-6, -2.3, 16, 6, -2, 24, 'azulejo', { tint: P.poolTile, castShadow: false });
  // Tile lining over the pool walls (they are the sides of the grass blocks, which would show grass).
  const lining = { tint: P.poolTile, collide: false, castShadow: false };
  b.span(-6, -2, 16, -5.97, 0, 24, 'azulejo', lining);
  b.span(5.97, -2, 16, 6, 0, 24, 'azulejo', lining);
  b.span(-6, -2, 16, 6, 0, 16.03, 'azulejo', lining);
  b.span(-6, -2, 23.97, 6, 0, 24, 'azulejo', lining);
  b.span(-6.3, -2, 15.7, 6.3, 0.12, 16, 'concreto', { tint: 0xe8e4da });
  b.span(-6.3, -2, 24, 6.3, 0.12, 24.3, 'concreto', { tint: 0xe8e4da });
  {
    // Ramp: 2 m over 5.5 m (~20 deg), bottom at x=0.5, top at x=6, across z 16..19.
    const run = 5.5;
    const rise = 2;
    const ang = Math.atan2(rise, run);
    b.box(6 - run / 2, -2 + rise / 2 - 0.15, 17.5, Math.hypot(run, rise), 0.3, 3, 'azulejo', { tint: P.poolTile, rot: new THREE.Euler(0, 0, ang) });
  }
  b.stairs('x', -1, -6 + stairRun(2), 21, 24, -2, 2, 'concreto', { tint: 0xe8e4da });

  // --- Perimeter -------------------------------------------------------------------------------------
  const wallH = 4;
  const brick = { tint: P.brick };
  b.span(-W - 1, 0, -D - 1, W + 1, wallH, -D, 'tijolo', brick);
  b.span(-W - 1, 0, D, W + 1, wallH, D + 1, 'tijolo', brick);
  b.span(-W - 1, 0, -D, -W, wallH, D, 'tijolo', brick);
  b.span(W, 0, -D, W + 1, wallH, D, 'tijolo', brick);
  // Concrete cap on top of the wall.
  for (const [x0, z0, x1, z1] of [[-W - 1.1, -D - 1.1, W + 1.1, -D + 0.1], [-W - 1.1, D - 0.1, W + 1.1, D + 1.1], [-W - 1.1, -D, -W + 0.1, D], [W - 0.1, -D, W + 1.1, D]]) {
    b.span(x0, wallH, z0, x1, wallH + 0.12, z1, 'concreto', { tint: 0xd9d4c8, collide: false });
  }

  // --- North lane: three enterable two-story houses --------------------------------------------------
  const houses: [number, number, number][] = [[-18, P.house, 0x8e4b3a], [0, P.houseAlt, 0x4a5a6e], [18, P.houseAlt2, 0x6e4a5a]];
  for (const [cx, wallTint, roofTint] of houses) r.place('casaRua', { corParede: wallTint, corTelhado: roofTint }, { p: [cx, 0, -19] });
  const bushesLater: [number, number, number][] = houses.flatMap(([cx]) => [[cx - 3, -13.85, 2.4], [cx + 4.6, -13.85, 1.6]] as [number, number, number][]);

  // --- Center lane: parked cars, ice cream truck, street props ---------------------------------------
  const car = (x: number, z: number, color: number, rotY = 0) => r.place('carro', { cor: color }, { p: [x, 0, z], yaw: rotY || undefined });
  car(-24, -5, P.carRed);
  car(-8, 5, P.carYellow);
  car(8, -5.2, P.carGreen);
  car(26, 4.8, P.carRed, Math.PI);
  car(-30, 5, P.carGreen, 0.25);

  // Ice cream truck: breaks the long street sightline and plays a jingle when shot.
  r.place('caminhaoSorvete', { cor: P.truck, detalhe: P.truckTrim }, { prop: 'caminhao' });

  // High crates (2.0 m) near the lane ends.
  b.span(-33, 0, -3, -31, 2.0, -1, 'madeira', { tint: P.teamA });
  b.span(31, 0, 1, 33, 2.0, 3, 'madeira', { tint: P.teamB });
  // Fire hydrants on the sidewalks: shoot one and it gushes; stand on it and you fly.
  [[-12, -8], [12, 8], [28, -8]].forEach(([x, z], hi) => r.place('hidrante', {}, { p: [x, 0.15, z], prop: `hidrante:${hi}` }));
  for (const [x, z] of [[-20, 8.5], [4, 8.5], [22, -8.5]]) {
    b.span(x - 0.05, 0.15, z - 0.05, x + 0.05, 1.1, z + 0.05, 'madeira', { tint: P.wood, collide: false });
    b.span(x - 0.25, 1.1, z - 0.2, x + 0.25, 1.4, z + 0.2, 'metal', { tint: 0x3a6ee8 }); // mailbox
  }

  // --- South lane: fenced yards ----------------------------------------------------------------------
  const fenceH = 1.8;
  const fenceT = 0.15;
  const wood = { tint: P.wood };
  b.wall('x', 11, -W, W, fenceT, fenceH, 'madeira', [[-30, -27, 0, fenceH], [-12, -9, 0, fenceH], [8, 11, 0, fenceH], [26, 29, 0, fenceH]], 0, wood);
  for (const x of [-22, 13]) b.wall('z', x, 11, D, fenceT, fenceH, 'madeira', [[18, 21, 0, fenceH]], 0, wood);

  // Tree house overlooking the pool: platform at 3 m.
  const th = { x: -15, z: 22 };
  const trunk = { tint: P.trunk };
  b.span(th.x - 2, 2.75, th.z - 2, th.x + 2, 3, th.z + 2, 'piso', wood);
  for (const [ox, oz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) {
    b.span(th.x + ox - 0.12, 0, th.z + oz - 0.12, th.x + ox + 0.12, 2.75, th.z + oz + 0.12, 'madeira', trunk);
  }
  b.wall('x', th.z - 2, th.x - 2, th.x + 2, 0.1, 1.0, 'madeira', [], 3, wood);
  b.wall('z', th.x + 2, th.z - 2, th.z + 2, 0.1, 1.0, 'madeira', [[th.z - 0.8, th.z + 0.8, 0, 1]], 3, wood);
  b.stairs('x', 1, th.x - 2 - stairRun(3), th.z + 0.9, th.z + 2, 0, 3, 'madeira', wood);
  b.span(th.x - 2.4, 0, th.z + 3.1, th.x - 1.6, 5, th.z + 3.9, 'madeira', trunk);
  r.place('copaSimples', { raio: 2.6, cor: P.foliage }, { p: [th.x - 2, 6, th.z + 3.5] });

  // Watchtower (7 m) in the south-east corner, reached by a long staircase along the south wall.
  const tw = { x0: 30, x1: 33.5, z0: 25.5, z1: D };
  const towerY = TOWER_Y;
  b.span(tw.x0, towerY - 0.3, tw.z0, tw.x1, towerY, tw.z1, 'piso', wood);
  for (const [x, z] of [[tw.x0, tw.z0], [tw.x1 - 0.25, tw.z0], [tw.x1 - 0.25, tw.z1 - 0.25]]) {
    b.span(x, 0, z, x + 0.25, towerY - 0.3, z + 0.25, 'madeira', wood);
  }
  b.wall('x', tw.z0, tw.x0, tw.x1, 0.12, 1.0, 'madeira', [], towerY, wood);
  b.wall('z', tw.x1, tw.z0, tw.z1, 0.12, 1.0, 'madeira', [], towerY, wood);
  const stairStart = tw.x0 - stairRun(towerY);
  b.stairs('x', 1, stairStart, 28.3, D, 0, towerY, 'madeira', wood);
  // Tall railing standing ON the perimeter wall (not over the stairs, where it would hit players' heads),
  // so nobody falls out of the map from the stairs or platform.
  b.span(stairStart, wallH, D, tw.x1, towerY + 1.0, D + 0.12, 'madeira', wood);
  b.gableRoof(tw.x0, tw.z0, tw.x1, tw.z1, towerY + 2.2, 1.0, 'telhado', { tint: 0x8e4b3a, ridgeAxis: 'x', overhang: 0.3, collide: false });
  b.room({ x: tw.x0, y: towerY, z: tw.z0 }, { x: tw.x1, y: towerY + 2.2, z: tw.z1 }, 0.3); // roofed lookout, open all around
  for (const [x, z] of [[tw.x0, tw.z0], [tw.x1 - 0.15, tw.z0], [tw.x0, tw.z1 - 0.15], [tw.x1 - 0.15, tw.z1 - 0.15]]) {
    b.span(x, towerY, z, x + 0.15, towerY + 2.2, z + 0.15, 'madeira', wood);
  }

  // Flamingos: spin when shot; each one looks somewhere else.
  [[-30, 14], [-26, 26], [20, 15], [9, 27]].forEach(([x, z], fi) => r.place('flamingo', {}, { p: [x, 0, z], yaw: fi * 2.1 + 0.6, prop: `flamingo:${fi}` }));

  // --- Life: street trees, bushes, lamp posts, pun signs ------------------------------------------------
  const tree = (x: number, z: number, scale = 1) => r.place('arvoreRua', {}, { p: [x, 0, z], escala: scale === 1 ? undefined : scale });
  for (const x of [-27, -9, 9, 27]) tree(x, -12.2);
  for (const [x, z] of [[-33, 12.8], [-4, 12.8], [18, 12.8], [29.5, 12.8]]) tree(x, z, 0.9);
  for (const [x, z, w] of bushesLater) r.place('arbusto', { largura: w }, { p: [x, 0, z] });
  // Lamp posts along the sidewalks; the glowing heads are merged into one mesh.
  for (const x of [-30, -2, 26]) r.place('posteRua', { lado: 1 }, { p: [x, 0, -9.7] });
  for (const x of [-24, 6, 32]) r.place('posteRua', { lado: -1 }, { p: [x, 0, 9.7] });
  const sign = (linhas: string[], x: number, z: number, yaw: number, fundo: string, texto: string, altura?: number) => r.place('placaRua', { linhas, fundo, texto, altura }, { p: [x, 0, z], yaw: yaw || undefined });
  sign(['VENDE-SE', 'Vizinho barulhento', 'incluso no preço'], 22.6, -12.4, 0, '#fff8ec', '#c0271b');
  sign(['CUIDADO', 'Cão bravo', '(e muito fofo)'], 33.4, 16.6, 0, '#ffd23f', '#1b1530', 2.1);
  sign(['RUA DOS', 'VIZINHOS', 'Proibido estacionar tanque'], -38.6, -9.3, -Math.PI / 2, '#2f7d3a', '#ffffff', 2.4);

  // --- Spawns: team A (orange) west by the moving van, team B (blue) east by the garage --------------
  r.place('van', { cor: 0xf2f2f2, faixa: P.teamA }, { p: [-35.25, 0, -6.9] });
  b.span(-39.8, 0.01, -2, -37.8, 0.05, 2, 'pintura', { tint: P.teamA, collide: false, castShadow: false });
  b.wall('z', 34, -8, -2, 0.3, 3.2, 'tijolo', [], 0, { tint: P.teamB });
  b.span(34, 3.2, -8.3, W, 3.5, -2, 'metal', { tint: 0x5d6673 });
  b.span(34, 0, -8.3, W, 3.2, -8, 'tijolo', { tint: P.teamB });
  b.room({ x: 34.15, y: 0, z: -8 }, { x: W, y: 3.2, z: -2 }, 0.6); // the garage: roofed, open toward the street
  b.span(38, 0.01, -2, 39.8, 0.05, 2, 'pintura', { tint: P.teamB, collide: false, castShadow: false });

  // --- glTF prop: doghouse in the east yard, guarded by Amora -----------------------------------------
  // The model's door faces -Z; turned around so the entrance opens into the yard (+Z), in plain view.
  const house = { x: 36, z: 14.5, scale: 1.6 };
  await r.place('glb', { arquivo: 'casinha_cachorro' }, { p: [house.x, 0, house.z], yaw: Math.PI, escala: house.scale });
  r.place('cachorro', { nome: 'Amora' }, { p: [house.x, 0, house.z], yaw: Math.PI, escala: house.scale });
}
