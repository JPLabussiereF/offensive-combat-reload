// The sticker album (shared/achievements.ts, data/conquistas.json): the data is coherent, a number becomes a
// finish (common → gold, then repeats for counters), pages and the album count what's stuck in, and the
// numbers come out of the profile the API already sends.
import { describe, expect, it } from 'bun:test';
import { album, albumCount, albumProblems, FINISHES, PAGES, SOURCES, STICKERS, stickerState, sourcesFromProfile, tierOf, type Sources, type Sticker } from '@shared/achievements';
import type { ProfileResponse, ZombieTotals } from '@shared/account';
import { MAX_LEVELS, PROG_WEAPONS } from '@shared/progression';

const zero = Object.fromEntries(SOURCES.map((s) => [s, 0])) as Sources;
const counter: Sticker = { id: 'x', pagina: 'matar', icone: '·', tipo: 'contador', fonte: 'abates', metas: [10, 50, 200, 1000], nome: { pt: 'x', en: 'x' }, como: { pt: '{meta}', en: '{meta}' } };
const record: Sticker = { ...counter, id: 'y', tipo: 'recorde', fonte: 'nivel', metas: [5, 15, 30, 50] };

describe('dados do álbum', () => {
  it('ids únicos, páginas e fontes que existem, 4 metas crescentes, textos nas duas línguas', () => {
    expect(albumProblems()).toEqual([]);
    expect(FINISHES).toHaveLength(4);
  });

  it('toda página tem figurinhas, e toda fonte é usada por alguma figurinha', () => {
    for (const p of PAGES) expect(STICKERS.some((s) => s.pagina === p.id)).toBe(true);
    for (const src of SOURCES) expect(STICKERS.some((s) => s.fonte === src)).toBe(true);
  });
});

describe('do número ao acabamento', () => {
  it('cada meta alcançada é um acabamento a mais', () => {
    expect(tierOf(0, counter.metas)).toBe(0);
    expect(tierOf(9, counter.metas)).toBe(0);
    expect(tierOf(10, counter.metas)).toBe(1);
    expect(tierOf(199, counter.metas)).toBe(2);
    expect(tierOf(1000, counter.metas)).toBe(4);
  });

  it('contador: a próxima meta, e depois da dourada as repetidas', () => {
    const at = (n: number) => stickerState(counter, { ...zero, abates: n });
    expect(at(0)).toMatchObject({ tier: 0, repeats: 0, next: 10 });
    expect(at(60)).toMatchObject({ tier: 2, repeats: 0, next: 200 });
    expect(at(1000)).toMatchObject({ tier: 4, repeats: 1, next: 2000 });
    expect(at(3500)).toMatchObject({ tier: 4, repeats: 3, next: 4000 });
  });

  it('recorde: sem repetidas, e completa na última meta', () => {
    const at = (n: number) => stickerState(record, { ...zero, nivel: n });
    expect(at(14)).toMatchObject({ tier: 1, repeats: 0, next: 15 });
    expect(at(80)).toMatchObject({ tier: 4, repeats: 0, next: null });
  });

  it('número negativo ou quebrado não vira acabamento', () => {
    expect(stickerState(counter, { ...zero, abates: -5 })).toMatchObject({ progress: 0, tier: 0 });
    expect(stickerState(counter, { ...zero, abates: 9.9 })).toMatchObject({ progress: 9, tier: 0 });
  });

  it('a página e o álbum contam figurinhas coladas e acabamentos', () => {
    const states = album({ ...zero, abates: 300, cabeca: 25 });
    expect(albumCount(states, 'matar')).toMatchObject({ stuck: 2, finishes: 2 + 1 });
    const all = albumCount(states);
    expect(all.total).toBe(STICKERS.length);
    expect(all.finishesTotal).toBe(STICKERS.length * 4);
    expect(all.stuck).toBe(2);
  });
});

describe('do perfil para o álbum', () => {
  const zumbi: ZombieTotals = {
    partidas: 9, vitorias: 2, melhorOnda: 12, ondas: 40, abates: 700, cabeca: 0, passaro: 0, facadas: 0, granadas: 0,
    chefes: 9, coveiro: 6, noiva: 2, prefeito: 1, quedas: 11, reanimacoes: 3, mortes: 4, caixao: 30,
  };
  const armas = Object.fromEntries(PROG_WEAPONS.map((w, i) => [w, { xp: 0, nivel: i < 2 ? MAX_LEVELS[w] : 1 }]));
  const profile = {
    nivel: 16,
    armas,
    totais: { abates: 260, mortes: 300, cabeca: 30, passaro: 6, facadas: 12, pelasCostas: 5, granadas: 0, opressoes: 21, segundosJogados: 40_000, participacoes: 55, zumbi },
  } as unknown as ProfileResponse;

  it('cada fonte sai do campo certo; os chefes contam pelo menos caçado; armas no máximo pelo nível', () => {
    const src = sourcesFromProfile(profile);
    expect(src).toMatchObject({ nivel: 16, segundos: 40_000, entradas: 55, abates: 260, mortes: 300, opressoes: 21, zumbiAbates: 700, zumbiMelhorOnda: 12, zumbiCaixao: 30 });
    expect(src.zumbiCadaChefe).toBe(1);
    expect(src.armasNoMaximo).toBe(2);
  });

  it('o álbum de uma conta veterana já vem com figurinhas coladas', () => {
    const byId = Object.fromEntries(album(sourcesFromProfile(profile)).map((s) => [s.sticker.id, s]));
    expect(byId['endereco-fixo'].tier).toBe(2);
    expect(byId['ate-onde-der'].tier).toBe(4);
    expect(byId['caca-chefes'].tier).toBe(1);
    expect(byId['opressor'].tier).toBe(2);
    expect(byId['lancador'].tier).toBe(0);
  });
});
