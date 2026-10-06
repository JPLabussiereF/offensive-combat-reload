// "Jardim do Dragão" pieces: the estate's sectors (each one a piece: the main house, the ring around it, the
// Bonsai Garden, the Lotus Lake, the Lantern Court, the Warriors' Court, the Bamboo Valley and the Ancestral
// Sanctuary, see jardim/kit.ts), the garden walls with their gates, and the oriental building blocks
// (oriental.ts and the kit) for the editor: pavilions, curved roofs, railings, columns, paper walls, moon
// gates, bridges, decks, open pavilions, ponds, rocks, pines, bonsai, bamboo, hedges, lanterns, the gong.
import { bamboo, Bell, bonsai, column, curvedRoof, Gong, moonGateWall, paperWall, pavilion, pine, railing, rock, stoneLantern, wallCap, type PavilionSpec, type Rect } from '../oriental';
import type { Opening } from '../mapBuilder';
import { archBridge, basin, bambooGrove, deck, gardenWall, hedge as gardenHedge, inscription, plaque, signBoard, ting, type Ctx, type Gate } from '../jardim/kit';
import { buildCasa, buildRing } from '../jardim/casa';
import { buildBonsai } from '../jardim/bonsai';
import { buildLago } from '../jardim/lago';
import { buildLanternas } from '../jardim/lanternas';
import { buildGuerreiros } from '../jardim/guerreiros';
import { buildBambu } from '../jardim/bambu';
import { buildSantuario } from '../jardim/santuario';
import { at, P, scaleOf, V, yawOf, type Adapter, type BuildCtx } from './types';

/** The garden kit's context for a piece: its builder, scene and randomness, the map's lanterns, glow and water. */
export function gardenCtx(c: BuildCtx): Ctx {
  // Getters: a shared system is only created when the piece uses it.
  return {
    b: c.b,
    scene: c.scene,
    rand: c.rand,
    get lanterns() {
      return c.s.c.lanterns;
    },
    props: c.props,
    sfx: c.sfx,
    get glow() {
      return c.s.c.gardenGlow;
    },
    animate: (f) => c.animate(f),
    get water() {
      return c.s.water;
    },
    get drops() {
      return c.s.drops;
    },
    holes: c.s.holes,
  };
}

const SECTORS: Record<string, (c: Ctx, out: BuildCtx['out']) => void> = {
  casa: (g, out) => {
    const { cherry, fruit } = buildCasa(g);
    out.pickups.push(cherry);
    out.fruit.push(fruit);
  },
  anel: (g) => buildRing(g),
  bonsai: (g) => buildBonsai(g),
  lago: (g) => buildLago(g),
  lanternas: (g, out) => {
    out.fruit.push(buildLanternas(g));
  },
  guerreiros: (g) => buildGuerreiros(g),
  bambu: (g) => buildBambu(g),
  santuario: (g) => buildSantuario(g),
};

type Side = 'n' | 's' | 'e' | 'w';

export const garden: Record<string, Adapter> = {
  /** A whole sector of the estate, as laid out in its jardim/ file (seeded: rocks, trees and bamboo). */
  setor(c, p) {
    const build = SECTORS[P<{ setor: string }>(p).setor];
    if (!build) throw new Error(`setor desconhecido "${String(p.params.setor)}"`);
    build(gardenCtx(c), c.out);
  },

  muroJardim(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; de: number; ate: number; portoes: Gate[]; altura?: number; espessura?: number }>(p);
    gardenWall(gardenCtx(c), q.eixo, q.fixo, q.de, q.ate, q.portoes, q.altura, q.espessura);
  },

  tampaMuro(c, p) {
    const q = P<{ x0: number; z0: number; x1: number; z1: number; topo: number }>(p);
    wallCap(c.b, q.x0, q.z0, q.x1, q.z1, q.topo);
  },

  corrimao(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; de: number; ate: number; y: number; altura?: number; cor?: number; colide?: boolean }>(p);
    const o: { h?: number; tint?: number; collide?: boolean } = {};
    if (q.altura !== undefined) o.h = q.altura;
    if (q.cor !== undefined) o.tint = q.cor;
    if (q.colide !== undefined) o.collide = q.colide;
    railing(c.b, q.eixo, q.fixo, q.de, q.ate, q.y, o);
  },

  coluna(c, p) {
    const q = P<{ topo: number; raio?: number }>(p);
    const [x, y, z] = at(p);
    column(c.b, x, z, y, q.topo, q.raio);
  },

  paredePapel(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; de: number; ate: number; altura: number; y0: number; portas: number[]; larguraPorta?: number }>(p);
    paperWall(c.b, q.eixo, q.fixo, q.de, q.ate, q.altura, q.y0, q.portas, q.larguraPorta);
  },

  muroLua(c, p) {
    const q = P<{ eixo: 'x' | 'z'; fixo: number; de: number; ate: number; espessura: number; altura: number; centro: number; raio: number; vaos: Opening[] }>(p);
    moonGateWall(c.b, q.eixo, q.fixo, q.de, q.ate, q.espessura, q.altura, q.centro, q.raio, q.vaos);
  },

  telhadoCurvo(c, p) {
    const q = P<{ externo: Rect; topo: Rect; beiral: number; cume: number; curva?: number; cor?: number; corBaixo?: number; colide?: boolean; cumeeiras?: boolean; espessura?: number }>(p);
    curvedRoof(c.b, { outer: q.externo, top: q.topo, eaveY: q.beiral, topY: q.cume, curl: q.curva, tint: q.cor, underTint: q.corBaixo, collide: q.colide, ridges: q.cumeeiras, thickness: q.espessura });
  },

  /** A multi-story pavilion (oriental.ts PavilionSpec); `lanternas`: hang a lantern from every eave corner, this far down. */
  pavilhao(c, p) {
    const q = P<{ spec: PavilionSpec; lanternas?: number }>(p);
    const pav = pavilion(c.b, q.spec);
    if (q.lanternas) for (const h of pav.hooks) c.s.c.lanterns.hang(h, q.lanternas);
  },

  ponteArco(c, p) {
    const q = P<{ eixo: 'x' | 'z'; de: number; ate: number; atravessa: number; largura: number; pico: number; y0?: number; cor?: number; superficie?: string }>(p);
    archBridge(gardenCtx(c), q.eixo, q.de, q.ate, q.atravessa, q.largura, q.pico, q.y0, q.cor, q.superficie as never);
  },

  deck(c, p) {
    const q = P<{ area: Rect; y: number; postesAte?: number; cor?: number }>(p);
    deck(gardenCtx(c), q.area, q.y, q.postesAte, q.cor);
  },

  ting(c, p) {
    const q = P<{ metade: number; base?: number; altura?: number; degraus?: Side[]; corrimao?: boolean; corTelhado?: number; lanternas?: number }>(p);
    const [x, y, z] = at(p);
    const hooks = ting(gardenCtx(c), x, z, q.metade, { y0: y, base: q.base, h: q.altura, steps: q.degraus, rails: q.corrimao, roofTint: q.corTelhado });
    if (q.lanternas) for (const h of hooks) c.s.c.lanterns.hang(h, q.lanternas);
  },

  tanque(c, p) {
    const q = P<{ area: Rect; fundo: number; bordas?: Side[]; agua?: number; cor?: number }>(p);
    basin(gardenCtx(c), q.area, q.fundo, { coping: q.bordas, waterY: q.agua, floor: q.cor });
    c.s.holes.push(q.area);
  },

  rocha(c, p) {
    const q = P<{ tamanho: [number, number, number]; cor?: number; colide?: boolean }>(p);
    const [x, y, z] = at(p);
    rock(c.b, x, y, z, q.tamanho[0], q.tamanho[1], q.tamanho[2], c.rand, q.cor, q.colide);
  },

  pinheiro(c, p) {
    const q = P<{ verdes?: number[]; tronco?: number; colide?: boolean }>(p);
    const [x, y, z] = at(p);
    pine(c.b, x, y, z, scaleOf(p), c.rand, { greens: q.verdes, trunk: q.tronco, collide: q.colide });
  },

  bonsai(c, p) {
    const [x, y, z] = at(p);
    bonsai(c.b, x, y, z, scaleOf(p), c.rand, P<{ corVaso?: number }>(p).corVaso);
  },

  bambu(c, p) {
    const q = P<{ quantidade: number; espalhamento: number }>(p);
    const [x, , z] = at(p);
    bamboo(c.b, x, z, q.quantidade, q.espalhamento, c.rand);
  },

  bosqueBambu(c, p) {
    const q = P<{ area: Rect; densidade?: number }>(p);
    bambooGrove(gardenCtx(c), q.area, q.densidade);
  },

  sebeJardim(c, p) {
    const q = P<{ x0: number; z0: number; x1: number; z1: number; altura?: number }>(p);
    gardenHedge(c.b, q.x0, q.z0, q.x1, q.z1, q.altura);
  },

  lanternaPedra(c, p) {
    const [x, y, z] = at(p);
    stoneLantern(c.b, x, z, y, c.s.c.gardenGlow);
  },

  /** A red paper lantern hanging `queda` metres below its hook at `p` (swings when shot: "lanterna:N"). */
  lanternaPapel(c, p) {
    c.s.c.lanterns.hang(V(...at(p)), P<{ queda?: number }>(p).queda);
  },

  gongo(c, p) {
    const [x, y, z] = at(p);
    const gong = new Gong(c.scene, c.b, x, y, z, c.props, () => c.sfx.at({ x, y: y + 2, z }, 'loud', (s) => s.gong()));
    c.animate((dt) => gong.update(dt));
  },

  /** A bronze bell hanging from a beam at `p` (its top), rung by shots (`prop` its id). */
  sinoOriental(c, p) {
    const size = P<{ tamanho: number }>(p).tamanho;
    const [x, top, z] = at(p);
    const bell = new Bell(c.scene, c.b, x, top, z, size, c.props, p.prop ?? 'sino:0', () => c.sfx.at({ x, y: top - 0.7, z }, 'normal', (s) => s.bell(size)));
    c.animate((dt) => bell.update(dt));
  },

  placaJardim(c, p) {
    const q = P<{ linhas: string[]; fundo: string; texto: string; altura: number }>(p);
    const [x, , z] = at(p);
    signBoard(gardenCtx(c), q.linhas, x, z, yawOf(p), q.fundo, q.texto, q.altura);
  },

  placaNome(c, p) {
    const q = P<{ texto: string; largura: number; altura: number; fundo?: string; letra?: string }>(p);
    const [x, y, z] = at(p);
    plaque(c.scene, q.texto, x, y, z, yawOf(p), q.largura, q.altura, q.fundo, q.letra);
  },

  inscricao(c, p) {
    const q = P<{ colunas: string[]; largura: number; altura: number }>(p);
    const [x, y, z] = at(p);
    inscription(c.scene, q.colunas, x, y, z, yawOf(p), q.largura, q.altura);
  },
};
