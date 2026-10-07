// The Mapas and Gerenciamento tabs without a screen: which buttons each card shows to whom (the author, the
// staff, anyone else), the modes a map is played in, the list's address (tab, search by name or author, order,
// the staff's hidden maps), the maps the home offers online (official ones from the server plus the sessions'
// maps), and an account's panel from the permissions the API returns (sanctions, edits, roles) with what the
// staff member typed checked before it's sent.
import { describe, expect, it } from 'bun:test';
import type { ContaGestao } from '@shared/account';
import type { MapaResumo } from '@shared/mapData';
import { canCreateMap, mapActions, mapsUrl, playableMaps, playMode, playModes, unknownSessionMaps, type MapCard, type MapsQuery, type Viewer } from '../ui/mapsRules';
import { accountControls, progressPatch, sanctionBody } from '../ui/managementRules';

const ADMIN: Viewer = { signedIn: true, papeis: ['admin'] };
const MOD: Viewer = { signedIn: true, papeis: ['moderador'] };
const USER: Viewer = { signedIn: true, papeis: [] };
const GUEST: Viewer = { signedIn: false, papeis: [] };

function resumo(o: Partial<MapaResumo> = {}): MapaResumo {
  return {
    id: 'abc',
    tipo: 'comunidade',
    nome: 'Praça',
    autor: 'Ana#0001',
    versao: 2,
    exclusivo: null,
    cartao: { emoji: '🌳', cor: '#aaccee' },
    jogadas: 3,
    copiaDe: null,
    criadoEm: '2026-10-01T00:00:00.000Z',
    atualizadoEm: '2026-10-02T00:00:00.000Z',
    oculto: null,
    pode: { editar: false, apagar: false, ocultar: false, duplicar: true },
    meu: false,
    ...o,
  };
}
/** What the server says each viewer may do (server/mapRoutes.ts summary). */
const asStaff = (o: Partial<MapaResumo> = {}) => resumo({ pode: { editar: true, apagar: true, ocultar: true, duplicar: true }, ...o });
const asAuthor = (o: Partial<MapaResumo> = {}) => resumo({ pode: { editar: true, apagar: true, ocultar: false, duplicar: true }, meu: true, ...o });

describe('Mapas: botões de cada cartão', () => {
  it('o dono edita, apaga e vê as versões do seu mapa da comunidade; não oculta', () => {
    expect(mapActions(asAuthor(), USER)).toEqual({ jogar: true, editar: true, duplicar: true, apagar: true, ocultar: false, desocultar: false, versoes: true });
  });

  it('outro jogador só joga e duplica', () => {
    expect(mapActions(resumo(), USER)).toEqual({ jogar: true, editar: false, duplicar: true, apagar: false, ocultar: false, desocultar: false, versoes: false });
    // Even if the server's flags said more, a player never edits an official map.
    expect(mapActions(resumo({ tipo: 'oficial', autor: null, pode: { editar: true, apagar: true, ocultar: false, duplicar: true } }), USER)).toMatchObject({ editar: false, apagar: false });
  });

  it('admin e moderador editam os oficiais, ocultam e apagam qualquer um, mas não editam o mapa da comunidade de outro', () => {
    for (const staff of [ADMIN, MOD]) {
      expect(mapActions(asStaff({ tipo: 'oficial', autor: null }), staff)).toEqual({ jogar: true, editar: true, duplicar: true, apagar: true, ocultar: true, desocultar: false, versoes: true });
      expect(mapActions(asStaff(), staff)).toEqual({ jogar: true, editar: false, duplicar: true, apagar: true, ocultar: true, desocultar: false, versoes: false });
      // Their own community map: edited too.
      expect(mapActions(asStaff({ meu: true }), staff).editar).toBe(true);
    }
  });

  it('mapa oculto: a equipe desoculta; ninguém joga nele', () => {
    const hidden = asStaff({ oculto: { em: '2026-10-03T00:00:00.000Z', motivo: 'nome ofensivo' } });
    expect(mapActions(hidden, MOD)).toMatchObject({ jogar: false, ocultar: false, desocultar: true });
    expect(mapActions(asAuthor({ oculto: hidden.oculto }), USER)).toMatchObject({ jogar: false, desocultar: false, editar: true });
  });

  it('sem conta: nada', () => {
    const none = { jogar: false, editar: false, duplicar: false, apagar: false, ocultar: false, desocultar: false, versoes: false };
    expect(mapActions(resumo({ pode: { editar: false, apagar: false, ocultar: false, duplicar: false } }), GUEST)).toEqual(none);
    expect(canCreateMap(GUEST)).toBe(false);
    expect(canCreateMap(USER)).toBe(true);
  });
});

describe('Mapas: modos e lista', () => {
  it('mapa aberto joga mata-mata e corrida armada; exclusivo de zumbi só zumbi', () => {
    expect(playModes(null)).toEqual(['mata-mata', 'corrida-armada']);
    expect(playModes('zumbi')).toEqual(['zumbi']);
    expect(playMode('zumbi', 'mata-mata')).toBe('zumbi');
    expect(playMode(null, 'zumbi')).toBe('mata-mata');
    expect(playMode(null, 'corrida-armada')).toBe('corrida-armada');
  });

  it('busca por nome ou autor, ordem e o filtro de ocultos só para a equipe (P34)', () => {
    const q: MapsQuery = { tab: 'comunidade', q: '  praça ', by: 'nome', order: 'jogados', hidden: false, page: 0 };
    expect(mapsUrl(q, false)).toBe('/api/mapas?tipo=comunidade&ordem=jogados&q=pra%C3%A7a');
    expect(mapsUrl({ ...q, by: 'autor', q: 'Ana#0001', order: 'recentes' }, false)).toBe('/api/mapas?tipo=comunidade&ordem=recentes&autor=Ana%230001');
    expect(mapsUrl({ ...q, q: '', tab: 'oficial', page: 2 }, false)).toBe('/api/mapas?tipo=oficial&ordem=jogados&pagina=2');
    expect(mapsUrl({ ...q, q: '', hidden: true }, true)).toBe('/api/mapas?tipo=comunidade&ordem=jogados&ocultos=1');
    expect(mapsUrl({ ...q, q: '', hidden: true }, false)).toBe('/api/mapas?tipo=comunidade&ordem=jogados');
  });

  it('a tela inicial oferece os oficiais do servidor (cartão da versão atual) e os mapas das sessões abertas', () => {
    const bundled: MapCard[] = [
      { id: 'rua', tipo: 'oficial', nome: 'Rua', cartao: { emoji: '🏡', cor: '#cfe8ff' }, exclusivo: null, autor: null },
      { id: 'cemiterio', tipo: 'oficial', nome: 'Cemitério', cartao: { emoji: '⚰️', cor: '#c9f5b0' }, exclusivo: 'zumbi', autor: null },
    ];
    // No list from the server yet: the shipped copies.
    expect(playableMaps(bundled, null, [], new Map())).toEqual(bundled);
    const ruaV3 = resumo({ id: 'rua', tipo: 'oficial', nome: 'Rua dos Vizinhos', autor: null, cartao: { emoji: '🚗', cor: '#ffffff' } });
    const novoOficial = resumo({ id: 'porto', tipo: 'oficial', nome: 'Porto', autor: null });
    const sessions = [
      { map: 'rua', mapaNome: 'Rua dos Vizinhos' },
      { map: 'quintal', mapaNome: 'Quintal da Ana' },
      { map: 'quintal', mapaNome: 'Quintal da Ana' },
    ];
    const got = playableMaps(bundled, [ruaV3, novoOficial], sessions, new Map());
    // The cemetery is not on the server's list (hidden or deleted): it leaves; the edited street shows its new card.
    expect(got.map((c) => c.id)).toEqual(['rua', 'porto', 'quintal']);
    expect(got[0].cartao).toEqual({ emoji: '🚗', cor: '#ffffff' });
    expect(got[2]).toMatchObject({ tipo: 'comunidade', nome: 'Quintal da Ana' });
    // The community map's card is asked once; once known, it's used.
    expect(unknownSessionMaps(got, sessions, new Set())).toEqual(['quintal']);
    expect(unknownSessionMaps(got, sessions, new Set(['quintal']))).toEqual([]);
    const known = new Map([['quintal', { id: 'quintal', tipo: 'comunidade' as const, nome: 'Quintal', cartao: { emoji: '🌻', cor: '#ffee00' }, exclusivo: null, autor: 'Ana#0001' }]]);
    expect(playableMaps(bundled, [ruaV3], sessions, known)[1]).toMatchObject({ id: 'quintal', autor: 'Ana#0001', cartao: { emoji: '🌻' } });
  });
});

describe('Gerenciamento: painel da conta', () => {
  const conta = (p: ContaGestao['permissoes'], o: Partial<ContaGestao> = {}): ContaGestao => ({
    id: '00000000-0000-0000-0000-000000000001',
    tag: 'Alvo#0001',
    nivel: 3,
    papeis: [],
    banida: false,
    silenciada: false,
    status: 'active',
    criadaEm: '2026-10-01T00:00:00.000Z',
    nome: 'Alvo',
    sexo: 'm',
    aparencia: {} as ContaGestao['aparencia'],
    xp: 500,
    armas: { rifle: { xp: 10, nivel: 1 }, pistola: { xp: 0, nivel: 1 }, smg: { xp: 0, nivel: 1 }, faca: { xp: 0, nivel: 1 }, granada: { xp: 0, nivel: 1 } },
    sancoes: [],
    permissoes: p,
    ...o,
  });

  it('moderador diante de um jogador: tudo, e promove só a moderador', () => {
    const c = accountControls(conta({ editar: true, punir: true, conceder: ['moderador'], remover: [] }, { banida: true }));
    expect(c).toEqual({ editar: true, punir: true, retirarBanimento: true, retirarSilencio: false, promover: ['moderador'], rebaixar: [] });
  });

  it('moderador diante de um admin: nenhum botão', () => {
    const c = accountControls(conta({ editar: false, punir: false, conceder: [], remover: [] }, { papeis: ['admin'], banida: true, silenciada: true }));
    expect(c).toEqual({ editar: false, punir: false, retirarBanimento: false, retirarSilencio: false, promover: [], rebaixar: [] });
  });

  it('a própria conta: edita, mas não se pune', () => {
    const c = accountControls(conta({ editar: true, punir: false, conceder: [], remover: ['admin'] }, { papeis: ['admin'], silenciada: true }));
    expect(c).toMatchObject({ editar: true, punir: false, retirarSilencio: false, rebaixar: ['admin'] });
  });

  it('sanção pede motivo e uma duração da lista', () => {
    expect(sanctionBody('banimento', '  spam ', '7d')).toEqual({ ok: true, body: { tipo: 'banimento', motivo: 'spam', duracao: '7d' } });
    expect(sanctionBody('silencio', 'xingou', 'permanente')).toMatchObject({ ok: true });
    expect(sanctionBody('banimento', '   ', '7d')).toEqual({ ok: false, erro: 'motivo' });
    expect(sanctionBody('banimento', 'spam', '3 semanas')).toEqual({ ok: false, erro: 'duracao' });
  });

  it('progresso: só o que mudou, e números inteiros de 0 ao limite', () => {
    const c = conta({ editar: true, punir: true, conceder: [], remover: [] });
    expect(progressPatch(c, '500', { rifle: '10', pistola: '0' })).toEqual({});
    expect(progressPatch(c, '900', { rifle: '10', smg: '250' })).toEqual({ xp: 900, armas: { smg: 250 } });
    expect(progressPatch(c, '-1', {})).toBeNull();
    expect(progressPatch(c, '500', { faca: '1.5' })).toBeNull();
    expect(progressPatch(c, '2000000000', {})).toBeNull();
  });
});
