// The Dragon Garden's own pieces (the helpers of client/world/jardim): the Dragon Cherry with its collectible,
// the Dragon Bonsai, bonsai on pedestals, the lake's lantern posts and dragon fountain, the market's stalls,
// baskets and cart, the chime bells, the warriors' weapon racks, training dummies and armor, the crypt's tombs,
// the sanctuary's bells, drums and stele, painted scrolls, decorative dragons, the panda, lilies, reeds,
// stepping stones, strings of lanterns, small lamps and the house's gateways.
import * as THREE from 'three';
import { dragonGeometry, dragonMaterial, type DragonColors, type Rect } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import { doorLeaves, gateway, lamp, lanternString, lilies, painting, reeds, steppingPath, struck, type Gate } from '../jardim/kit';
import { gardenBookshelf, inkLandscape } from '../jardim/casa';
import { dragonBonsai, pedestal } from '../jardim/bonsai';
import { dragonFountain, lanternPost } from '../jardim/lago';
import { basket, bianzhong, cart, stall } from '../jardim/lanternas';
import { armorStand, dummy, weaponRack } from '../jardim/guerreiros';
import { bellFrame, bigDrum, hangingBell, planterPine, portrait, stele, tomb } from '../jardim/santuario';
import { dragonCherryTree } from '../jardim/cerejeira';
import { CherryPickup } from '../jardim/cereja';
import { panda } from '../jardim/panda';
import { ORIENTAL as C } from '../oriental';
import { gardenCtx } from './garden';
import { at, P, V, yawOf, type Adapter } from './types';

type Vec3 = [number, number, number];

/** The decorative dragons' colors. */
const DRAGONS: Record<string, DragonColors> = {
  dourado: { body: 0xe7b847, bodyDark: 0xb98a2a, belly: 0xf7e7b0, spikes: 0xc0352b, horns: 0xf7e7b0 },
  carmesim: { body: 0xd33a2c, bodyDark: 0xa82a20, belly: 0xf2d98a, spikes: 0xe7b847, horns: 0xf2d98a },
  jade: { body: 0x2fae7a, bodyDark: 0x23895f, belly: 0xf2d98a, spikes: 0xe7b847, horns: 0xf2d98a },
};

export const gardenPieces: Record<string, Adapter> = {
  /**
   * The Dragon Cherry in its raised bed (own seed: Peca.semente), with the lanterns on its limbs and the cherries
   * in its blossom; the piece's collectible lies under it and falls back from the nearest crown.
   */
  cerejeiraDragao(c, p) {
    const [x, , z] = at(p);
    const tree = dragonCherryTree(gardenCtx(c), x, z, p.semente ?? 5150);
    c.out.fruit.push(tree.fruit);
    const spot = p.coletavel ? c.data.objetos.coletaveis.find((k) => k.id === p.coletavel) : undefined;
    if (!spot) return;
    const feet = new THREE.Vector3(...spot.p);
    const above = tree.crowns.reduce((best, k) => (Math.hypot(k.p.x - feet.x, k.p.z - feet.z) < Math.hypot(best.p.x - feet.x, best.p.z - feet.z) ? k : best));
    const cherry = new CherryPickup(c.scene, spot.id, feet, above.p.clone().setY(above.p.y - above.r * 0.5));
    c.animate((dt) => cherry.update(dt));
    c.out.pickups.push(cherry);
  },

  /** Bookshelf full of colored spines on both faces (seeded), ``comprimento`` long along ``ao``, 2.2 m tall. */
  estanteJardim(c, p) {
    const q = P<{ ao: 'x' | 'z'; comprimento: number }>(p);
    const [x, , z] = at(p);
    gardenBookshelf(gardenCtx(c), x, z, q.ao, q.comprimento);
  },

  /** A painted scroll on a wall: the ink landscape, or one of the three ancestor portraits. */
  quadro(c, p) {
    const q = P<{ estilo: 'paisagem' | 'ancestral'; largura: number; altura: number; indice?: number }>(p);
    const [x, y, z] = at(p);
    const paint = q.estilo === 'paisagem' ? inkLandscape : (g: CanvasRenderingContext2D, w: number, h: number) => portrait(g, w, h, q.indice ?? 0);
    painting(c.scene, x, y, z, yawOf(p), q.largura, q.altura, paint);
  },

  /** A dragon along a path (a ridge ornament, a relief on a wall): one mesh, or two mirrored ones at ``p``. */
  dragaoDecorativo(c, p) {
    const q = P<{ caminho: Vec3[]; raio: number; cores: string; espelho?: boolean; sombra?: boolean }>(p);
    const geo = dragonGeometry(q.caminho.map((v) => V(...v)), q.raio, DRAGONS[q.cores] ?? DRAGONS.dourado).geo;
    const mat = dragonMaterial();
    for (const sx of q.espelho ? [-1, 1] : [1]) {
      const d = new THREE.Mesh(geo, mat);
      if (p.p) d.position.set(...p.p);
      if (q.espelho) d.scale.set(sx, 1, 1);
      if (q.sombra !== undefined) d.castShadow = q.sombra;
      c.scene.add(d);
    }
  },

  /** Bonsai in a glazed pot on a stone pedestal (seeded: the tree and the pot's color); ``p`` is the ground under it. */
  pedestalBonsai(c, p) {
    const [x, y, z] = at(p);
    pedestal(gardenCtx(c), x, z, y);
  },

  /** The Dragon Bonsai: a giant pot and a pine trained into a dragon's coils (seeded), two lanterns in it. */
  bonsaiDragao(c, p) {
    const [x, , z] = at(p);
    dragonBonsai(gardenCtx(c), x, z);
  },

  /** Lacquered post with an arm and a lantern hanging from it (``braco``: where the arm reaches). */
  postoLanterna(c, p) {
    const [x, , z] = at(p);
    const [ax, az] = P<{ braco: [number, number] }>(p).braco;
    lanternPost(gardenCtx(c), x, z, ax, az);
  },

  /** The jade dragon fountain on its islet: spits water, roars fire when shot ("dragao"). */
  fonteDragao(c, p) {
    const [x, , z] = at(p);
    dragonFountain(gardenCtx(c), x, z);
  },

  /** Bianzhong: five bronze bells on a frame from ``de`` to ``ate`` along X at z (p), dó to sol ("carrilhao:N"). */
  sinosBianzhong(c, p) {
    const q = P<{ de: number; ate: number }>(p);
    const [, , z] = at(p);
    bianzhong(gardenCtx(c), q.de, q.ate, z);
  },

  /** Market stall: counter, posts and a cloth canopy, goods on the counter (seeded). With ``frutas``, fruit that can be cut. */
  barracaMercado(c, p) {
    const q = P<{ pano: number; mercadorias: number[]; frutas: boolean }>(p);
    const [x, , z] = at(p);
    stall(gardenCtx(c), x, z, q.pano, q.mercadorias, q.frutas ? c.s.c.market : null);
  },

  cesto(c, p) {
    const [x, , z] = at(p);
    basket(gardenCtx(c), x, z);
  },

  /** Hand cart with two wheels, along Z, crates on it. */
  carrinho(c, p) {
    const [x, , z] = at(p);
    cart(gardenCtx(c), x, z);
  },

  suporteArmas(c, p) {
    const q = P<{ ao: 'x' | 'z'; comprimento?: number }>(p);
    const [x, , z] = at(p);
    weaponRack(gardenCtx(c), x, z, q.ao, q.comprimento);
  },

  bonecoTreino(c, p) {
    const [x, , z] = at(p);
    dummy(gardenCtx(c), x, z);
  },

  armaduraLaqueada(c, p) {
    const [x, , z] = at(p);
    armorStand(gardenCtx(c), x, z);
  },

  tumulo(c, p) {
    const [x, , z] = at(p);
    tomb(gardenCtx(c), x, z, P<{ ao: 'x' | 'z' }>(p).ao);
  },

  /** Bronze bell in a wooden frame standing on ``p`` (``prop``: "sino:N"). */
  sinoPortico(c, p) {
    const [x, y, z] = at(p);
    bellFrame(gardenCtx(c), x, y, z, propIndex(p.prop, 0));
  },

  /** A great bell hung from a beam whose top is at ``p`` ("sino:2"). */
  sinoSuspenso(c, p) {
    const [x, top, z] = at(p);
    hangingBell(gardenCtx(c), x, top, z);
  },

  /** Big drum on a stand at ``p``: booms when shot ("tambor:0"). */
  tamborGrande(c, p) {
    const [x, y, z] = at(p);
    bigDrum(gardenCtx(c), x, y, z);
  },

  /** The war drum on its stand (centre of the drum at x, z): booms when shot ("tambor:N"). */
  tamborGuerra(c, p) {
    const [x, , z] = at(p);
    c.b.span(x - 0.8, 0, z - 0.5, x + 0.8, 0.5, z + 0.5, 'madeira', { tint: C.lacquerDark });
    const drum = new THREE.CylinderGeometry(0.62, 0.62, 0.7, 16).rotateX(Math.PI / 2).translate(x, 1.15, z);
    c.b.addGeometry(drum, surfaceMaterial('pintura'), C.lacquer);
    drum.dispose();
    const hit = struck(gardenCtx(c), p.prop ?? 'tambor:1', { x, y: 1.15, z }, 'loud', (s) => s.drum(0.8));
    c.b.cuboidCollider(new THREE.Vector3(x, 1.1, z), new THREE.Vector3(0.6, 0.6, 0.35), new THREE.Quaternion(), 'wood', hit);
  },

  /** A standing drum (the music room's): its head faces up, it sounds when shot ("tambor:N"). */
  tamborBanco(c, p) {
    const [x, , z] = at(p);
    const hit = struck(gardenCtx(c), p.prop ?? 'tambor:2', { x, y: 0.9, z }, 'normal', (s) => s.drum(0.55));
    c.b.cylinder(x, 0, z, 0.45, 0.9, 'pintura', { tint: C.lacquer, segments: 14, onShot: hit });
    c.b.cylinder(x, 0.9, z, 0.46, 0.04, 'pintura', { tint: 0xf2e6c8, segments: 14, collide: false });
  },

  /** Memorial stele on its base, inscribed on both faces. */
  estela(c, p) {
    const [x, , z] = at(p);
    stele(gardenCtx(c), x, z);
  },

  /** A pine in a stone planter on the terrace (seeded). */
  pinheiroVaso(c, p) {
    const [x, , z] = at(p);
    planterPine(gardenCtx(c), x, z);
  },

  /** The panda sitting against a wall, eating bamboo. */
  panda(c, p) {
    const [x, , z] = at(p);
    panda(gardenCtx(c), x, z, yawOf(p));
  },

  /** Small glowing lamp (crypt niches): a stone box with a lit core. */
  lampiao(c, p) {
    const [x, y, z] = at(p);
    lamp(gardenCtx(c), x, y, z);
  },

  /** Lily pads, some with a lotus flower, scattered over ``area`` (seeded). */
  lirios(c, p) {
    const q = P<{ area: Rect; n: number; y?: number }>(p);
    lilies(gardenCtx(c), q.area, q.n, q.y);
  },

  /** Reeds standing in the water around ``p`` (seeded; ``p.y`` is their foot). */
  juncos(c, p) {
    const q = P<{ n: number; espalhamento: number }>(p);
    const [x, y, z] = at(p);
    reeds(gardenCtx(c), x, z, q.n, q.espalhamento, y);
  },

  /** Round stepping stones along a polyline (seeded). */
  caminhoPedras(c, p) {
    const q = P<{ pontos: [number, number][]; espacamento?: number; y?: number }>(p);
    steppingPath(gardenCtx(c), q.pontos, q.espacamento, q.y);
  },

  /** A string of ``n`` lanterns sagging between two hooks. */
  varalLanternas(c, p) {
    const q = P<{ de: Vec3; ate: Vec3; n: number }>(p);
    lanternString(gardenCtx(c), V(...q.de), V(...q.ate), q.n);
  },

  /** A roofless gateway in a building's wall: lacquered columns, a lintel and the name boards. */
  portalJardim(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; portao: Gate; largura: number; altura: number; alturaMuro: number; espessura: number }>(p);
    gateway(gardenCtx(c), q.eixo, q.fixo, q.portao, q.largura, q.altura, q.alturaMuro, q.espessura);
  },

  /** Two lacquered door leaves swung open against one face of a wall (``lado``: which face). */
  folhasPorta(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; centro: number; largura: number; altura: number; espessura: number; lado?: 1 | -1 }>(p);
    doorLeaves(gardenCtx(c), q.eixo, q.fixo, q.centro, q.largura, q.altura, q.espessura, q.lado);
  },
};

/** The N of a "name:N" PropBus id. */
function propIndex(prop: string | undefined, fallback: number) {
  const n = prop ? Number(prop.split(':')[1]) : NaN;
  return Number.isInteger(n) ? n : fallback;
}
