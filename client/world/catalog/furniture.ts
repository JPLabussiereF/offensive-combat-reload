// Furniture and props (client/world/furniture.ts and the garden's kit) as pieces, plus the haunted village's
// one-off props built in a prop's own frame: the witch's potion shelves, the mayor's safe, the vending machine.
import * as THREE from 'three';
import { barrel, bed, bench, bookshelf, candle, chair, coffin, crate, hayBale, pew, Place, potion, rockingHorse, sofa, suitOfArmor, table, toyChest } from '../furniture';
import { bench as gardenBench, crate as gardenCrate, foldingScreen, incenseBurner, lowTable, stoneLion, vase } from '../jardim/kit';
import { gardenCtx } from './garden';
import { at, P, scaleOf, yawOf, type Adapter } from './types';

type Vec3 = [number, number, number];

const POTION_COLORS = [0x6affd8, 0xb46aff, 0xff6ad8, 0x8aff4a, 0xffb43a, 0x4ac8ff, 0xff4a4a];

export const furniture: Record<string, Adapter> = {
  caixote(c, p) {
    const [x, y, z] = at(p);
    crate(c.b, x, y, z, scaleOf(p), yawOf(p), P<{ cor?: number }>(p).cor);
  },
  fardoFeno(c, p) {
    const [x, y, z] = at(p);
    hayBale(c.b, x, y, z, yawOf(p), P<{ tamanho?: Vec3 }>(p).tamanho);
  },
  barril(c, p) {
    const q = P<{ raio?: number; altura?: number; cor?: number }>(p);
    const [x, y, z] = at(p);
    barrel(c.b, x, y, z, q.raio, q.altura, q.cor);
  },
  banco(c, p) {
    const [x, , z] = at(p);
    bench(c.b, x, z, yawOf(p), P<{ comprimento?: number }>(p).comprimento);
  },
  sofa(c, p) {
    const q = P<{ comprimento?: number; cor?: number; detalhe?: number }>(p);
    const [x, y, z] = at(p);
    sofa(c.b, x, y, z, yawOf(p), q.comprimento, q.cor, q.detalhe);
  },
  mesa(c, p) {
    const q = P<{ largura: number; profundidade: number; altura?: number; cor?: number }>(p);
    const [x, y, z] = at(p);
    table(c.b, x, y, z, q.largura, q.profundidade, yawOf(p), q.altura, q.cor);
  },
  cadeira(c, p) {
    const q = P<{ cor?: number; assento?: number }>(p);
    const [x, y, z] = at(p);
    chair(c.b, x, y, z, yawOf(p), q.cor, q.assento);
  },
  vela(c, p) {
    const q = P<{ altura?: number; suporte?: boolean; cera?: number }>(p);
    const [x, y, z] = at(p);
    candle(c.b, c.s.c.glow, x, y, z, q.altura, q.suporte, q.cera);
  },
  cama(c, p) {
    const q = P<{ largura?: number; comprimento?: number; coberta?: number; madeira?: number }>(p);
    const [x, y, z] = at(p);
    bed(c.b, x, y, z, yawOf(p), q.largura, q.comprimento, q.coberta, q.madeira);
  },
  caixao(c, p) {
    const q = P<{ cor?: number; comprimento?: number }>(p);
    const [x, y, z] = at(p);
    coffin(c.b, x, y, z, yawOf(p), q.cor, q.comprimento);
  },
  bancoIgreja(c, p) {
    const q = P<{ comprimento?: number; cor?: number }>(p);
    const [x, , z] = at(p);
    pew(c.b, x, z, yawOf(p), q.comprimento, q.cor);
  },
  armadura(c, p) {
    const [x, y, z] = at(p);
    suitOfArmor(c.b, x, y, z, yawOf(p));
  },
  bauBrinquedos(c, p) {
    const [x, y, z] = at(p);
    toyChest(c.b, x, y, z, yawOf(p));
  },
  cavaloBalanco(c, p) {
    const [x, y, z] = at(p);
    rockingHorse(c.b, x, y, z, yawOf(p));
  },
  estante(c, p) {
    const q = P<{ largura: number; altura?: number; dosDoisLados?: boolean }>(p);
    const [x, , z] = at(p);
    bookshelf(c.b, x, z, q.largura, c.rand, yawOf(p), q.altura, q.dosDoisLados);
  },
  pocao(c, p) {
    const q = P<{ forma: 0 | 1 | 2; cor: number }>(p);
    const [x, y, z] = at(p);
    potion(c.b, c.s.c.glow, x, y, z, q.forma, q.cor, scaleOf(p));
  },

  /** The witch's shelves against the cabin's back wall, full of potions (seeded: some shelves have gaps). */
  estantePocoes(c, p) {
    const [sx, sy, sz] = at(p);
    const rand = c.rand;
    const shelf = new Place(c.b, sx, sy, sz, yawOf(p));
    for (const ex of [-1, 1]) shelf.box([ex * 1.0, 1.0, 0], [0.05, 2.0, 0.4], 'madeira', 0x3f2a1e);
    shelf.box([0, 1.0, -0.18], [2.0, 2.0, 0.03], 'madeira', 0x2e2018);
    for (const y of [0.05, 0.6, 1.15, 1.7]) shelf.box([0, y, 0], [2.0, 0.04, 0.4], 'madeira', 0x5a3a26);
    shelf.solid([0, 1.0, 0], [1.0, 1.0, 0.2]);
    for (const y of [0.07, 0.62, 1.17, 1.72]) {
      for (let k = 0; k < 6; k++) {
        if (rand() < 0.15) continue;
        const pt = shelf.at(-0.82 + k * 0.32 + (rand() - 0.5) * 0.08, y + 0.02, (rand() - 0.5) * 0.12);
        potion(c.b, c.s.c.glow, pt.x, pt.y, pt.z, Math.floor(rand() * 3) as 0 | 1 | 2, POTION_COLORS[Math.floor(rand() * POTION_COLORS.length)], 0.9 + rand() * 0.4);
      }
    }
  },

  /** The mayor's safe: a dial, a handle and gilt lettering. */
  cofre(c, p) {
    const [x, y, z] = at(p);
    const safe = new Place(c.b, x, y, z, yawOf(p));
    safe.round([0, 0.6, 0], [0.9, 1.2, 0.8], 0.04, 'metal', 0x3a4a3a);
    safe.cyl([0, 0.75, 0.41], 0.09, 0.03, 'metal', 0xc8c8c0, { rot: [Math.PI / 2, 0, 0], seg: 14, shadow: false });
    safe.box([0.22, 0.55, 0.42], [0.04, 0.22, 0.04], 'metal', 0xc8a040, undefined, false);
    safe.box([0, 1.05, 0.405], [0.6, 0.06, 0.01], 'pintura', 0xc8a040, undefined, false);
    safe.solid([0, 0.6, 0], [0.45, 0.6, 0.4], 'metal');
  },

  /** Vending machine: lit front with rows of cans, buttons, the coin slot and the tray. */
  maquinaRefrigerante(c, p) {
    const [x, y, z] = at(p);
    const vm = new Place(c.b, x, y, z, yawOf(p));
    vm.round([0, 1.0, 0], [1.2, 2.0, 0.8], 0.05, 'metal', 0xa02a2a);
    vm.box([-0.15, 1.25, 0.401], [0.8, 1.2, 0.02], 'pintura', 0x1a1a22);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) vm.cyl([-0.47 + k * 0.16, 0.8 + r * 0.28, 0.41], 0.045, 0.14, 'metal', [0xd8342a, 0x3a8ae8, 0xf2c230, 0x3aae6a, 0xf2f2f2][(r + k) % 5], { rot: [Math.PI / 2, 0, 0], seg: 8, shadow: false });
    for (let k = 0; k < 6; k++) vm.box([0.4, 1.6 - k * 0.12, 0.41], [0.12, 0.08, 0.02], 'pintura', 0xd8d8d0, undefined, false);
    vm.box([0.4, 0.8, 0.41], [0.08, 0.14, 0.02], 'metal', 0x2a2a2a, undefined, false);
    vm.box([-0.15, 0.32, 0.41], [0.6, 0.2, 0.02], 'pintura', 0x101014, undefined, false);
    // The glowing panel on top of the front (made along Z: the machine's own yaw is -90° at the village).
    const g = new THREE.BoxGeometry(0.02, 0.3, 1.0).rotateY(yawOf(p) + Math.PI / 2);
    const { x: gx, y: gy, z: gz } = vm.at(0, 1.9, 0.42);
    c.s.c.glow.add(g.translate(gx, gy, gz), 0xffe0a0);
  },

  // --- The garden's props ---
  caixoteJardim(c, p) {
    const [x, y, z] = at(p);
    gardenCrate(c.b, x, y, z, scaleOf(p), yawOf(p));
  },
  mesaBaixa(c, p) {
    const q = P<{ largura: number; profundidade: number; topo?: 'cha' | 'nada' }>(p);
    const [x, y, z] = at(p);
    lowTable(gardenCtx(c), x, y, z, q.largura, q.profundidade, q.topo);
  },
  vaso(c, p) {
    const q = P<{ altura?: number; cor?: number }>(p);
    const [x, y, z] = at(p);
    vase(c.b, x, y, z, q.altura, q.cor);
  },
  biombo(c, p) {
    const q = P<{ ao: 'x' | 'z'; paineis?: number; largura?: number; altura?: number }>(p);
    const [x, y, z] = at(p);
    foldingScreen(c.b, x, y, z, q.ao, q.paineis, q.largura, q.altura);
  },
  incensario(c, p) {
    const [x, y, z] = at(p);
    incenseBurner(c.b, x, y, z, scaleOf(p));
  },
  leaoPedra(c, p) {
    const [x, y, z] = at(p);
    stoneLion(c.b, x, z, yawOf(p), P<{ tipo: 'macho' | 'femea' }>(p).tipo, y);
  },
  bancoJardim(c, p) {
    const q = P<{ ao: 'x' | 'z'; comprimento?: number }>(p);
    const [x, y, z] = at(p);
    gardenBench(c.b, x, z, q.ao, q.comprimento, y);
  },
};
