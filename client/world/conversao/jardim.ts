// "Jardim do Dragão" converted into pieces: the old buildDragonGardenMap with every call recorded (see
// recorder.ts). A great Chinese estate, 90 x 90 m: the main house in the middle, the ring around it and six
// walled sectors around the ring (jardim/kit.ts has the layout), each sector one piece.
//
// The walls between sectors are 4 m tall and their gates never line up with each other: sightlines stay
// inside one sector (or one room). The cherry under the courtyard's tree gives extra max health for a while
// (CHERRY); the koi can be shot for a little XP (KOI).
import { MAP_FORMAT, type Vec3 } from '@shared/mapData';
import { FISH } from '@shared/maps';
import { ORIENTAL as C } from '../oriental';
import { MID_X, MID_Z, rect, W } from '../jardim/kit';
import { NIGHT } from '../jardim/luzes';
import type { MapMeta, Recorder } from './recorder';

/** Same seed on every client: rocks, trees and bamboo collide identically online. */
export const SEED = 8128;

export function meta(): MapMeta {
  const at = (x: number, y: number, z: number, yaw: number) => ({ p: [x, y, z] as Vec3, yaw });
  const E = -Math.PI / 2; // facing +X
  const Wd = Math.PI / 2; // facing -X
  const N = 0; // facing -Z
  const S = Math.PI; // facing +Z
  const dummy = (x: number, y: number, z: number, yaw: number, patrulha?: { eixo: 'x' | 'z'; amplitude: number; velocidade: number }) => ({ p: [x, y, z] as Vec3, yaw, ...(patrulha ? { patrulha } : {}) });
  return {
    formato: MAP_FORMAT,
    nome: 'Jardim do Dragão',
    cartao: { emoji: '🏮', cor: '#ffe2b8' },
    ambiente: {
      ceu: {
        atmosfera: {
          fundo: NIGHT.background,
          neblina: { cor: NIGHT.fog.color, perto: NIGHT.fog.near, longe: NIGHT.fog.far },
          hemisferio: { ceu: NIGHT.hemi.sky, chao: NIGHT.hemi.ground, intensidade: NIGHT.hemi.intensity },
          sol: { cor: NIGHT.sun.color, intensidade: NIGHT.sun.intensity, de: NIGHT.sun.from },
          arma: { ceu: NIGHT.viewmodel.sky, chao: NIGHT.viewmodel.ground, hemisferio: NIGHT.viewmodel.hemi, sol: NIGHT.viewmodel.sun, corSol: NIGHT.viewmodel.sunColor },
        },
        // The night: the sky, the floating lanterns and the light of the lanterns.
        cupula: { tipo: 'oriental' },
      },
      // 45 m cells: the estate's four quadrants (40 m cells cut it in 16 pieces, doubling the draw calls).
      celula: W,
      sombra: W + 12,
      killY: -20,
      sons: [{ som: 'passaro', primeiro: 4, intervalo: [6, 15] }],
    },
    arquivos: [],
    spawns: {
      // Teams: west (sanctuary's lower court, bamboo valley) against east (lake's south bank, lantern street).
      a: [at(-40, 0.2, -3.5, E), at(-27.5, 0.2, -2.4, E), at(-22.4, 0.2, -16, E), at(-29.6, 0.2, 2.6, E), at(-24, 0.2, 7.4, E)],
      b: [at(23.8, 0.2, -2.6, Wd), at(36.6, 0.2, -6.6, Wd), at(31, 0.2, 5.2, Wd), at(26.4, 0.2, 12.6, Wd), at(37.4, 0.2, 13.6, Wd)],
      ffa: ([
        // House: corner rooms, library, east wing; the ring.
        [-10.6, 0.2, -11.2], [10.6, 0.2, 10.4], [-11.8, 0.2, -5.6], [9.6, 0.2, -1.2], [-12, 0.2, -16.4], [11.4, 0.2, 18.4],
        // Bonsai: the pavilion, the west lawn, the deck.
        [13, 1.1, -39.6], [-14, 0.2, -27.4], [0.8, 0.7, -43.2],
        // Lake: tea house, the island's upper floor, south bank, west bank.
        [32, 0.6, -42.6], [32.5, 3.85, -21.6], [40.5, 0.2, -6.4], [20.2, 0.2, -37.6],
        // Lantern court: servants' upper floor, music room, market, kitchen.
        [40, 3.5, 9], [39, 0.2, 21.2], [27, 0.2, 43.4], [24.6, 0.2, 21.8],
        // Warriors: dojo, the Master's Platform, zen garden, armory.
        [-12, 0.2, 29.4], [15, 2.2, 24.6], [-8, 0.2, 41.6], [13.2, 0.2, 42],
        // Bamboo: gardener's house, the dense stretch, the central path.
        [-40.6, 0.2, 40.2], [-42.4, 0.2, 7], [-30, 0.2, 10.8],
        // Sanctuary: crypt, temple, lower court, incense court.
        [-30, 0.2, -25.6], [-34.5, 3.7, -38.2], [-23.4, 0.2, -11.6], [-42, 3.2, -26],
      ] as Vec3[]).map(([x, y, z]) => at(x, y, z, Math.atan2(x, z))),
    },
    bonecos: [
      // The ring, the courtyard, the Great Hall.
      dummy(-15.4, 0, 0, E, { eixo: 'z', amplitude: 3, velocidade: 0.8 }),
      dummy(3, 0, 4.2, N),
      dummy(5, 0, -9.6, S),
      // Bonsai bridge, the lake's island balcony and old bridge.
      dummy(-10, 1.0, -38, Wd, { eixo: 'x', amplitude: 1.2, velocidade: 0.9 }),
      dummy(32.5, 3.65, -19.4, S),
      dummy(34.6, 0.25, -13, Wd, { eixo: 'z', amplitude: 3, velocidade: 0.8 }),
      // Behind paper: the music room (shoot through it), the lantern street.
      dummy(35.4, 0, 20.6, E),
      dummy(30.2, 0, 18.4, S),
      // Arena, the Master's Platform, under the bamboo bridge.
      dummy(4, 0, 31.3, N, { eixo: 'x', amplitude: 3, velocidade: 0.7 }),
      dummy(15, 2.0, 24.4, S),
      dummy(-31, -1.2, 26.7, E, { eixo: 'x', amplitude: 4, velocidade: 0.6 }),
      // Sanctuary: incense court, crypt.
      dummy(-34.5, 3.0, -25.4, S),
      dummy(-29.6, 0, -23.6, E),
    ],
    objetos: {
      coletaveis: [{ id: 'cereja', tipo: 'cereja', p: [0, 0.36, 2.1] }],
      bruxa: null,
      ratos: [],
      peixes: FISH.jardim.map((f) => ({ id: f.id, lago: f.pond, volta: [...f.loop] as Vec3, y: f.y })),
    },
  };
}

export function pieces(r: Recorder) {
  const { b } = r;

  // --- Sectors -------------------------------------------------------------------------------------
  for (const setor of ['casa', 'anel', 'bonsai', 'lago', 'lanternas', 'guerreiros', 'bambu', 'santuario']) r.place('setor', { setor });

  // --- Ground (with the ponds, the lake and the stream cut out) -------------------------------------
  r.place('laje', { area: rect(-W, -W, W, W), furos: r.ctx.s.holes.map((h) => ({ ...h })), y0: -3, y1: 0, superficie: 'grama', cor: 0x86c45a, sombra: false });

  // --- Outer wall (down to the ground's bottom: the stream runs into it) ---------------------------
  const outerH = 4.5;
  const plaster = { tint: C.plaster };
  b.span(-W - 1, -3, -W - 1, W + 1, outerH, -W, 'concreto', plaster);
  b.span(-W - 1, -3, W, W + 1, outerH, W + 1, 'concreto', plaster);
  b.span(-W - 1, -3, -W, -W, outerH, W, 'concreto', plaster);
  b.span(W, -3, -W, W + 1, outerH, W, 'concreto', plaster);
  const cap = (x0: number, z0: number, x1: number, z1: number, topo: number) => r.place('tampaMuro', { x0, z0, x1, z1, topo });
  cap(-W - 1, -W - 1, W + 1, -W, outerH);
  cap(-W - 1, W, W + 1, W + 1, outerH);
  cap(-W - 1, -W, -W, W, outerH);
  cap(W, -W, W + 1, W, outerH);
  const skirting = { tint: C.stoneDark, collide: false, castShadow: false };
  b.span(-W, 0, -W, W, 0.5, -W + 0.04, 'pedra', skirting);
  b.span(-W, 0, W - 0.04, W, 0.5, W, 'pedra', skirting);
  b.span(-W, 0, -W, -W + 0.04, 0.5, W, 'pedra', skirting);
  b.span(W - 0.04, 0, -W, W, 0.5, W, 'pedra', skirting);

  // --- Walls between the sectors, with their gates -------------------------------------------------
  // Every sector has a gate to the ring and one to each neighbor; no two gates face each other.
  const wall = (eixo: 'x' | 'z', fixo: number, de: number, ate: number, portoes: Record<string, unknown>[]) => r.place('muroJardim', { eixo, fixo, de, ate, portoes });
  wall('z', -MID_X, -W, W, [
    { at: -38, name: '松風' },
    { at: -10, name: '祖廟' },
    { at: 10, name: '竹谷' },
    { at: 41, kind: 'lua' },
  ]);
  wall('z', MID_X, -W, W, [
    { at: -29, kind: 'lua' },
    { at: -10, name: '蓮池' },
    { at: 13, name: '燈街' },
    { at: 37, name: '演武' },
  ]);
  wall('x', -MID_Z, -MID_X + 0.3, MID_X - 0.3, [{ at: -6, name: '盆景' }, { at: 13, kind: 'porta' }]);
  wall('x', MID_Z, -MID_X + 0.3, MID_X - 0.3, [{ at: 6, name: '武院', tint: C.lacquer, leaves: true }, { at: -12, kind: 'porta' }]);
  wall('x', 0, -W, -MID_X - 0.3, [{ at: -36, name: '竹林' }]);
  wall('x', 0, MID_X + 0.3, W, [{ at: 31, name: '燈籠' }]);

  // --- Koi in the ponds (they can be shot: see KOI), with their own seed ----------------------------
  r.place('peixes', {}, { semente: 4242 });
}
