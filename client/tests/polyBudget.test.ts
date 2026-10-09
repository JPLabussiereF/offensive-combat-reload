// What the game draws, held to the budgets of PF-35: every official map at both levels of object detail (the
// worst sample camera, the median one, the sun's shadow and the draw calls), the instances drawn at scale zero,
// the characters (200 random looks, a fixed seed: each level of detail at the 90th percentile and the ratios
// between them), the weapons in third person, the viewmodel, the combat effects and the whole frame. Every number
// is held two ways, each with 5% of slack (P12): to the plan's budget (ORCAMENTO) and to what was measured last
// (MEDIDO and the like: a regression lock; when a change lowers a number on purpose, write the new one here).
// Measured with tools/orcamento.ts (`bun tools/orcamento.ts` prints the same table). Community maps aren't held
// to these: only MAP_BUDGET (client/tests/budget.test.ts); the map editor only warns over the light budget.
// The colliders are the same at both levels (the light detail only draws less).
import { describe, expect, it } from 'bun:test';
import { buildMapa, DETALHES, medirArmas, medirEfeitos, medirMapa, medirPersonagens, quadroInteiro, type ArmasMedidas, type Detalhe, type EfeitosMedidos, type MapaMedido, type PersonagensMedidos } from '../../tools/orcamento';
import { compareSnapshots, OFFICIAL, summarize, type MapSnapshot, type OfficialMap } from '../../tools/snapshot-mapas';
import { loadClient } from '../../tools/headless';

const { DETAIL_BUDGET } = await loadClient('client/world/budget.ts');

/** The slack over a budget or a measured number before the test fails. */
const FOLGA = 1.05;

/** The plan's budgets (Normal / Leve). */
const ORCAMENTO = {
  /** client/world/budget.ts DETAIL_BUDGET (the editor warns with it too). */
  mapa: DETAIL_BUDGET as Record<Detalhe, { pior: number; mediana: number; sombra: number; chamadas: number }>,
  /** Characters at the 90th percentile: LOD0 / LOD1 / LOD2, and LOD1/LOD0, LOD2/LOD0. */
  personagem: { p90: [5_000, 3_200, 2_000], razao1: 0.65, razao2: 0.4 },
  arma3p: 800,
  viewmodel: 3_500,
  efeitos: { normal: { repouso: 0, pico: 15_000 }, leve: { repouso: 0, pico: 10_000 } },
  quadro: { normal: 700_000, leve: 400_000 },
};

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
    normal: { pior: 48_374, mediana: 21_470, sombra: 30_368, chamadas: 163, fantasmas: 0 },
    leve: { pior: 36_433, mediana: 18_032, sombra: 19_310, chamadas: 163, fantasmas: 0 },
  },
  jardim: {
    normal: { pior: 394_166, mediana: 281_490, sombra: 180_224, chamadas: 253, fantasmas: 0 },
    leve: { pior: 312_389, mediana: 227_489, sombra: 148_525, chamadas: 253, fantasmas: 0 },
  },
  halloween: {
    normal: { pior: 322_821, mediana: 188_296, sombra: 228_310, chamadas: 263, fantasmas: 0 },
    leve: { pior: 266_392, mediana: 154_352, sombra: 169_361, chamadas: 263, fantasmas: 0 },
  },
  cemiterio: {
    normal: { pior: 75_642, mediana: 47_872, sombra: 51_344, chamadas: 82, fantasmas: 0 },
    leve: { pior: 64_814, mediana: 42_652, sombra: 33_284, chamadas: 82, fantasmas: 0 },
  },
};

/** Characters: triangles of LOD0 / LOD1 / LOD2 at the 90th percentile of the looks, and each look's LOD1/LOD0 and LOD2/LOD0 at the 90th. */
const PERSONAGEM = { p90: [5_072, 2_976, 1_664], razao1: 0.622, razao2: 0.353 };
/** The heaviest gun in third person, and the heaviest first-person view (arms and gun). */
const ARMA_3P = 580;
const VIEWMODEL = 3_414;
/** Combat effects: drawn at rest, and with every pool full. */
const EFEITOS = { normal: { repouso: 0, pico: 11_776 }, leve: { repouso: 0, pico: 8_176 } };

const cap = (n: number) => Math.ceil(n * FOLGA);
/** Within the budget and within the last measure, each with the slack (a ratio's slack is 0.01). */
function held(name: string, got: number, budget: number, measured: number, ratio = false) {
  const ok = ratio ? got <= budget + 0.01 && got <= measured + 0.01 : got <= cap(budget) && got <= cap(measured);
  expect([name, got, { orcamento: budget, medido: measured }, ok]).toEqual([name, got, { orcamento: budget, medido: measured }, true]);
}

describe('orçamento de polígonos (PF-35)', () => {
  const mapas: MapaMedido[] = [];
  let personagens: PersonagensMedidos | null = null;
  let armas: ArmasMedidas | null = null;
  const efeitos: Partial<Record<Detalhe, EfeitosMedidos>> = {};

  for (const slug of OFFICIAL) {
    for (const detalhe of DETALHES) {
      it(`${slug} (${detalhe}): pior câmera, mediana, sombra, chamadas e fantasmas`, async () => {
        const m = await medirMapa(slug, detalhe);
        mapas.push(m);
        const b = ORCAMENTO.mapa[detalhe];
        const e = MEDIDO[slug][detalhe];
        held('pior câmera', m.piorCamera.triangulos, b.pior, e.pior);
        held('mediana', m.mediana.triangulos, b.mediana, e.mediana);
        held('sombra', m.sombra.triangulos, b.sombra, e.sombra);
        held('chamadas', m.chamadas, b.chamadas, e.chamadas);
        expect(m.fantasmas.triangulos).toBe(0);
      }, 60_000);
    }
    it(`${slug}: os mesmos colisores nos dois níveis de detalhe`, async () => {
      const normal = summarize(slug, await buildMapa(slug, 'normal'));
      const leve = summarize(slug, await buildMapa(slug, 'leve'));
      const only = (s: MapSnapshot) => ({ ...s, lotes: [], cena: [], stats: { ...s.stats, meshes: 0, triangles: 0, pieces: 0 } });
      expect(compareSnapshots(only(normal), only(leve))).toEqual([]);
    }, 60_000);
  }

  it('personagens: p90 de cada nível de detalhe e as razões entre níveis', async () => {
    const p = (personagens = await medirPersonagens());
    p.lod.forEach((l, k) => held(`LOD${k}`, l.p90, ORCAMENTO.personagem.p90[k], PERSONAGEM.p90[k]));
    held('LOD1/LOD0', p.razao.lod1.p90, ORCAMENTO.personagem.razao1, PERSONAGEM.razao1, true);
    held('LOD2/LOD0', p.razao.lod2.p90, ORCAMENTO.personagem.razao2, PERSONAGEM.razao2, true);
  }, 120_000);

  it('armas em 3ª pessoa e viewmodel', async () => {
    const a = (armas = await medirArmas());
    for (const g of a.terceiraPessoa) held(`3ª pessoa: ${g.arma}`, g.triangulos, ORCAMENTO.arma3p, ARMA_3P);
    for (const f of a.facas) held(`3ª pessoa: ${f.faca}`, f.triangulos, ORCAMENTO.arma3p, ARMA_3P);
    for (const v of a.viewmodel) held(`viewmodel: ${v.arma}`, v.triangulos, ORCAMENTO.viewmodel, VIEWMODEL);
  }, 60_000);

  for (const detalhe of DETALHES) {
    it(`efeitos (${detalhe}): nada em repouso, e o pico`, async () => {
      const fx = (efeitos[detalhe] = await medirEfeitos(detalhe));
      expect(fx.repouso).toBe(0);
      held('pico', fx.pico, ORCAMENTO.efeitos[detalhe].pico, EFEITOS[detalhe].pico);
    });
  }

  it('quadro inteiro de cada mapa (mapa, personagens, armas, viewmodel e efeitos)', async () => {
    // What the tests above measured (or, run alone, measured here).
    personagens ??= await medirPersonagens();
    armas ??= await medirArmas();
    for (const d of DETALHES) efeitos[d] ??= await medirEfeitos(d);
    for (const slug of OFFICIAL) for (const d of DETALHES) if (!mapas.some((m) => m.mapa === slug && m.detalhe === d)) mapas.push(await medirMapa(slug, d));
    for (const m of mapas) {
      const q = quadroInteiro(m, personagens, armas, efeitos[m.detalhe]!);
      expect([m.mapa, m.detalhe, q, q <= cap(ORCAMENTO.quadro[m.detalhe])]).toEqual([m.mapa, m.detalhe, q, true]);
    }
  }, 180_000);
});
