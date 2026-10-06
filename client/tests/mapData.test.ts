// The map data format (shared/mapData.ts) and the piece catalog (shared/mapCatalog.ts): the official maps pass
// validateMapData, broken maps are refused with a reason, every kind of piece has its adapter in the client,
// the pieces of the witch, the rat and the biscuit cabinet match the objects the server tracks, and the home's
// table of the official maps (names, the mode each is made for) matches their data.
import { describe, expect, it } from 'bun:test';
import { MAP_BUDGET, MAP_FORMAT, validateMapData, type MapData } from '@shared/mapData';
import { checkParam, checkPieceParams, MAP_CATALOG, SUPERFICIES } from '@shared/mapCatalog';
import { OFFICIAL_MAPS, type OfficialMapId } from '@shared/maps';
import { ZOMBIE } from '@shared/zombies';
import rua from '@shared/data/mapas/rua.json';
import jardim from '@shared/data/mapas/jardim.json';
import halloween from '@shared/data/mapas/halloween.json';
import cemiterio from '@shared/data/mapas/cemiterio.json';
import { installCanvasStandIn, loadClient } from '../../tools/headless';

const OFFICIAL: Record<OfficialMapId, MapData> = { rua, jardim, halloween, cemiterio } as unknown as Record<OfficialMapId, MapData>;
const copy = (m: MapData): MapData => structuredClone(m);
const errorsOf = (raw: unknown) => validateMapData(raw).erros;

/** A small valid map to break in each test. */
function tiny(): MapData {
  return {
    formato: MAP_FORMAT,
    nome: 'Teste',
    cartao: { emoji: '🧪', cor: '#aabbcc' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas: [
      { id: 'chao', tipo: 'caixa', p: [0, -0.5, 0], params: { tamanho: [20, 1, 20], superficie: 'grama' } },
      { id: 'carro', tipo: 'carro', p: [2, 0, 3], yaw: 0.5, params: { cor: 0xd8342a } },
    ],
    arquivos: [],
    spawns: { a: [{ p: [0, 0.2, 0], yaw: 0 }], b: [{ p: [5, 0.2, 0], yaw: 0 }], ffa: [{ p: [0, 0.2, 5], yaw: 0 }] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
  };
}

describe('formato dos mapas', () => {
  it('versão 1 e o orçamento de 400 chamadas e 750 mil triângulos', () => {
    expect(MAP_FORMAT).toBe(1);
    expect(MAP_BUDGET).toEqual({ drawCalls: 400, triangulos: 750_000 });
  });

  it('os 4 mapas oficiais são válidos', () => {
    for (const [id, m] of Object.entries(OFFICIAL)) expect([id, validateMapData(m).erros]).toEqual([id, []]);
  });

  it('um mapa mínimo é válido', () => {
    expect(validateMapData(tiny())).toEqual({ ok: true, erros: [] });
  });

  it('recusa o que não é mapa', () => {
    expect(validateMapData(null).ok).toBe(false);
    expect(validateMapData([]).ok).toBe(false);
    expect(validateMapData('mapa').ok).toBe(false);
  });

  it('recusa formato, nome, cartão e ambiente inválidos', () => {
    const m = tiny();
    m.formato = 2;
    expect(errorsOf(m).join()).toContain('formato');
    const n = tiny();
    n.nome = '';
    expect(errorsOf(n).join()).toContain('nome');
    const c = tiny();
    c.cartao.cor = 'azul';
    expect(errorsOf(c).join()).toContain('cartao');
    const a = tiny();
    a.ambiente.celula = 1;
    a.ambiente.killY = Number.NaN;
    expect(errorsOf(a).join()).toContain('celula');
    expect(errorsOf(a).join()).toContain('killY');
    const s = tiny();
    s.ambiente.sons = [{ som: 'passaro', primeiro: 4, intervalo: [9, 3] }];
    expect(errorsOf(s).join()).toContain('sons');
    const k = tiny();
    k.ambiente.ceu = { cupula: { tipo: 'lua' } as never };
    expect(errorsOf(k).join()).toContain('cupula');
  });

  it('recusa peças de tipo desconhecido, ids repetidos e parâmetros fora do esquema', () => {
    const t = tiny();
    t.pecas.push({ id: 'x', tipo: 'disco-voador', params: {} });
    expect(errorsOf(t).join()).toContain('tipo: desconhecido');
    const d = tiny();
    d.pecas[1].id = 'chao';
    expect(errorsOf(d).join()).toContain('repetido');
    const p = tiny();
    p.pecas[0].params = { tamanho: [20, 1], superficie: 'grama' };
    expect(errorsOf(p).join()).toContain('tamanho');
    const s = tiny();
    s.pecas[0].params = { tamanho: [20, 1, 20], superficie: 'lava' };
    expect(errorsOf(s).join()).toContain('superfície desconhecida');
    const u = tiny();
    u.pecas[1].params = { cor: 0xd8342a, turbo: true };
    expect(errorsOf(u).join()).toContain('turbo: campo desconhecido');
    const r = tiny();
    r.pecas[1].params = {};
    expect(errorsOf(r).join()).toContain('cor: obrigatório');
    const e = tiny();
    e.pecas[1].escala = -1;
    expect(errorsOf(e).join()).toContain('escala');
  });

  it('confere os ids do PropBus: formato do servidor e sem repetir', () => {
    const m = tiny();
    m.pecas.push({ id: 'h1', tipo: 'hidrante', p: [1, 0.15, 1], params: {}, prop: 'Hidrante 1' });
    expect(errorsOf(m).join()).toContain('prop');
    const n = tiny();
    n.pecas.push({ id: 'h1', tipo: 'hidrante', p: [1, 0.15, 1], params: {}, prop: 'hidrante:0' }, { id: 'h2', tipo: 'hidrante', p: [2, 0.15, 1], params: {}, prop: 'hidrante:0' });
    expect(errorsOf(n).join()).toContain('repetido "hidrante:0"');
  });

  it('respeita o limite por mapa (uma bruxa) e a posição da bruxa nos objetos', () => {
    const m = tiny();
    m.objetos.bruxa = [1, 0, 1];
    m.pecas.push({ id: 'b1', tipo: 'bruxa', p: [1, 0, 1], params: {} }, { id: 'b2', tipo: 'bruxa', p: [3, 0, 1], params: {} });
    expect(errorsOf(m).join()).toContain('no máximo 1 de "bruxa"');
    const n = tiny();
    n.pecas.push({ id: 'b1', tipo: 'bruxa', p: [1, 0, 1], params: {} });
    expect(errorsOf(n).join()).toContain('objetos.bruxa');
  });

  it('liga coletáveis, ratos e arquivos aos objetos e arquivos do mapa', () => {
    const m = tiny();
    m.pecas.push({ id: 'a', tipo: 'armarioBiscoito', p: [0, 0, 0], params: { som: [0, 1, 0] }, coletavel: 'biscoito' });
    expect(errorsOf(m).join()).toContain('coletavel');
    m.objetos.coletaveis.push({ id: 'biscoito', tipo: 'biscoito', p: [1, 0, 0] });
    expect(errorsOf(m)).toEqual([]);
    const r = tiny();
    r.pecas.push({ id: 'r', tipo: 'ratoGigante', p: [0, 0, 0], params: { id: 'rato' } });
    expect(errorsOf(r).join()).toContain('objetos.ratos');
    const g = tiny();
    g.pecas.push({ id: 'g', tipo: 'glb', p: [0, 0, 0], params: { arquivo: 'casinha' } });
    expect(errorsOf(g).join()).toContain('arquivos');
    g.arquivos.push({ id: 'casinha', url: '/models/casinha_cachorro.glb' });
    expect(errorsOf(g)).toEqual([]);
  });

  it('exige spawns e confere os bonecos', () => {
    const m = tiny();
    m.spawns.a = [];
    expect(errorsOf(m).join()).toContain('spawns.a');
    const b = tiny();
    b.bonecos = [{ p: [0, 0, 0], yaw: 0, patrulha: { eixo: 'y' as never, amplitude: 1, velocidade: 1 } }];
    expect(errorsOf(b).join()).toContain('patrulha');
  });

  it('um mapa exclusivo do zumbi precisa dos dados de zumbi, e eles são conferidos', () => {
    const m = copy(OFFICIAL.cemiterio);
    delete m.zumbi;
    expect(errorsOf(m).join()).toContain('zumbi: obrigatório');
    const n = copy(OFFICIAL.cemiterio);
    n.zumbi!.surgir[0] = [0, 0, 0];
    expect(errorsOf(n).join()).toContain('dentro do muro');
    const o = copy(OFFICIAL.cemiterio);
    (o.zumbi as unknown as Record<string, unknown>).dentro = 'muro';
    expect(errorsOf(o).join()).toContain('zumbi');
  });
});

describe('esquema das peças', () => {
  it('cada tipo tem nome em pt e en, categoria e parâmetros', () => {
    for (const t of Object.values(MAP_CATALOG)) {
      expect(t.nome.pt.length).toBeGreaterThan(0);
      expect(t.nome.en.length).toBeGreaterThan(0);
      expect(['livre', 'linear', 'fixa']).toContain(t.transformacao);
      expect(typeof t.params).toBe('object');
    }
  });

  it('confere números, faixas, opções, listas e objetos', () => {
    expect(checkParam({ tipo: 'numero', min: 0, max: 1 }, 2, 'x')).toEqual(['x: fora da faixa [0, 1]']);
    expect(checkParam({ tipo: 'inteiro' }, 1.5, 'x')).toEqual(['x: deve ser inteiro']);
    expect(checkParam({ tipo: 'cor' }, 0x1000000, 'x')).toEqual(['x: cor 0xRRGGBB']);
    expect(checkParam({ tipo: 'opcao', opcoes: ['a', 'b'] }, 'c', 'x')).toEqual(['x: deve ser a | b']);
    expect(checkParam({ tipo: 'lista', item: { tipo: 'vec2' }, max: 1 }, [[1, 2], [3, 4]], 'x')).toEqual(['x: no máximo 1 itens']);
    expect(checkParam({ tipo: 'numero', opcional: true }, undefined, 'x')).toEqual([]);
    expect(checkPieceParams('carro', { cor: 0xff0000 })).toEqual([]);
    expect(checkPieceParams('nada', {})).toEqual(['params: tipo de peça desconhecido "nada"']);
  });

  it('as superfícies são as da biblioteca do cliente e cada tipo tem seu adaptador', async () => {
    const restore = installCanvasStandIn();
    try {
      const { SURFACES } = await loadClient('client/world/surfaces.ts');
      const { CATALOG } = await loadClient('client/world/catalog/index.ts');
      expect([...SUPERFICIES].sort() as string[]).toEqual(Object.keys(SURFACES).sort());
      expect(Object.keys(CATALOG).sort()).toEqual(Object.keys(MAP_CATALOG).sort());
    } finally {
      restore();
    }
  });
});

describe('mapas oficiais', () => {
  it('nome e exclusividade iguais aos da tabela dos seletores da tela inicial (OFFICIAL_INFO)', async () => {
    const restore = installCanvasStandIn();
    try {
      const { OFFICIAL_INFO } = await loadClient('client/world/mapLoader.ts');
      expect(Object.keys(OFFICIAL_INFO)).toEqual([...OFFICIAL_MAPS]);
      for (const id of OFFICIAL_MAPS) expect({ id, nome: OFFICIAL[id].nome, exclusivo: OFFICIAL[id].exclusivo }).toEqual({ id, nome: OFFICIAL_INFO[id].nome, exclusivo: OFFICIAL_INFO[id].exclusivo });
    } finally {
      restore();
    }
  });

  it('as peças da bruxa, do rato e do armário batem com os objetos', () => {
    const h = OFFICIAL.halloween;
    expect(h.pecas.find((p) => p.tipo === 'bruxa')?.p).toEqual(h.objetos.bruxa!);
    for (const r of h.objetos.ratos) expect(h.pecas.find((p) => p.tipo === 'ratoGigante' && p.params.id === r.id)?.p).toEqual(r.p);
    expect(h.pecas.filter((p) => p.coletavel).map((p) => p.coletavel)).toEqual(h.objetos.coletaveis.map((k) => k.id));
    expect(OFFICIAL.jardim.pecas.filter((p) => p.tipo === 'peixes')).toHaveLength(1);
  });

  it('os dados de zumbi do Cemitério são os do modo', () => {
    expect(OFFICIAL.cemiterio.zumbi).toEqual(ZOMBIE.mapas.cemiterio);
  });
});
