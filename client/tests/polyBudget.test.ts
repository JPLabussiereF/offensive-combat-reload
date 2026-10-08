// What the game draws, held to its numbers (PF-35): every official map at both levels of object detail (the
// worst sample camera, the median one and the sun's shadow, each within 5% of what was measured), the instances
// drawn at scale zero, the characters (200 random looks, a fixed seed), the weapons in third person, the
// viewmodel and the combat effects. Measured with tools/orcamento.ts (`bun tools/orcamento.ts` prints the same
// table); when a change lowers a number on purpose, write the new one here. Community maps aren't held to these:
// only MAP_BUDGET (client/tests/budget.test.ts).
import { describe, expect, it } from 'bun:test';
import { DETALHES, medirArmas, medirEfeitos, medirMapa, medirPersonagens, type Detalhe } from '../../tools/orcamento';
import { OFFICIAL, type OfficialMap } from '../../tools/snapshot-mapas';

/** The slack over a measured number before the test fails. */
const FOLGA = 1.05;

interface MapNumbers {
  pior: number;
  mediana: number;
  sombra: number;
  chamadas: number;
  fantasmas: number;
}

/** Measured (triangles; chamadas = the worst camera's draw calls plus the shadow's). */
const MEDIDO: Record<OfficialMap, Record<Detalhe, MapNumbers>> = {
  rua: {
    normal: { pior: 68_326, mediana: 32_768, sombra: 40_144, chamadas: 163, fantasmas: 0 },
    leve: { pior: 68_326, mediana: 32_768, sombra: 40_144, chamadas: 163, fantasmas: 0 },
  },
  jardim: {
    normal: { pior: 480_000, mediana: 363_984, sombra: 180_224, chamadas: 302, fantasmas: 0 },
    leve: { pior: 480_000, mediana: 363_984, sombra: 180_224, chamadas: 302, fantasmas: 0 },
  },
  halloween: {
    normal: { pior: 377_201, mediana: 213_730, sombra: 257_002, chamadas: 263, fantasmas: 0 },
    leve: { pior: 377_201, mediana: 213_730, sombra: 257_002, chamadas: 263, fantasmas: 0 },
  },
  cemiterio: {
    normal: { pior: 82_178, mediana: 51_603, sombra: 51_344, chamadas: 82, fantasmas: 0 },
    leve: { pior: 82_178, mediana: 51_603, sombra: 51_344, chamadas: 82, fantasmas: 0 },
  },
};

/** Characters: triangles of LOD0 / LOD1 / LOD2 at the 90th percentile of the looks, and each look's LOD1/LOD0 and LOD2/LOD0 at the 90th. */
const PERSONAGEM = { p90: [5_072, 3_612, 2_409], razao1: 0.769, razao2: 0.523 };
/** The heaviest gun in third person, and the heaviest first-person view (arms and gun). */
const ARMA_3P = 2_786;
const VIEWMODEL = 3_414;
/** Combat effects: drawn at rest, and with every pool full. */
const EFEITOS = { repouso: 0, pico: 11_776 };

const within = (measured: number, expected: number) => measured <= Math.ceil(expected * FOLGA);

describe('orçamento de polígonos (PF-35)', () => {
  for (const slug of OFFICIAL) {
    for (const detalhe of DETALHES) {
      it(`${slug} (${detalhe}): pior câmera, mediana, sombra e chamadas dentro de 5% do medido; fantasmas`, async () => {
        const m = await medirMapa(slug, detalhe);
        const e = MEDIDO[slug][detalhe];
        const got = { pior: m.piorCamera.triangulos, mediana: m.mediana.triangulos, sombra: m.sombra.triangulos, chamadas: m.chamadas, fantasmas: m.fantasmas.triangulos };
        for (const k of ['pior', 'mediana', 'sombra', 'chamadas'] as const) expect([k, got[k], within(got[k], e[k])]).toEqual([k, got[k], true]);
        expect(got.fantasmas).toBeLessThanOrEqual(e.fantasmas);
      }, 60_000);
    }
  }

  it('personagens: p90 de cada nível de detalhe e as razões entre níveis', async () => {
    const p = await medirPersonagens();
    p.lod.forEach((l, k) => expect([`LOD${k}`, l.p90, within(l.p90, PERSONAGEM.p90[k])]).toEqual([`LOD${k}`, l.p90, true]));
    expect(p.razao.lod1.p90).toBeLessThanOrEqual(PERSONAGEM.razao1 + 0.01);
    expect(p.razao.lod2.p90).toBeLessThanOrEqual(PERSONAGEM.razao2 + 0.01);
  }, 120_000);

  it('armas em 3ª pessoa e viewmodel', async () => {
    const a = await medirArmas();
    for (const g of a.terceiraPessoa) expect([g.arma, g.triangulos <= ARMA_3P]).toEqual([g.arma, true]);
    for (const v of a.viewmodel) expect([v.arma, v.triangulos <= VIEWMODEL]).toEqual([v.arma, true]);
  }, 60_000);

  it('efeitos: em repouso e no pico', async () => {
    const fx = await medirEfeitos();
    expect(fx.repouso).toBeLessThanOrEqual(EFEITOS.repouso);
    expect(fx.pico).toBeLessThanOrEqual(EFEITOS.pico);
  });
});
