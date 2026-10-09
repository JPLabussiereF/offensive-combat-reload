// The Play tab's rules (PF-32, client/ui/playRules.ts): the old map filter becomes one map or "Qualquer mapa", the
// online choice in a one-map mode and for a map that left the list, the sessions and players of a map, the map the
// orange button plays, and what the orange button says.
import { beforeAll, describe, expect, it } from 'bun:test';
import type { GameModeId } from '@shared/modes';
import { ctaText, effectiveOnlineMap, migrateOnlineMap, playersOn, quickTarget, say, sessionsFor, type SessionLike } from '../ui/playRules';
import { setLang } from '../ui/strings';

const PVP = ['rua', 'jardim', 'halloween'];
/** The maps offered online: the four official ones (the cemetery only for zumbi) and a community map with a session. */
const CARDS = [
  { id: 'rua', exclusivo: null },
  { id: 'jardim', exclusivo: null },
  { id: 'halloween', exclusivo: null },
  { id: 'cemiterio', exclusivo: 'zumbi' as GameModeId },
  { id: 'meu_mapa', exclusivo: null },
];
const s = (map: string, mode: GameModeId, players: number, max = 10): SessionLike => ({ map, mode, players, max });

describe('migração do filtro antigo (oc.bots)', () => {
  it('com um só mapa marcado pelo fora, esse vira o mapa escolhido', () => {
    expect(migrateOnlineMap({ fora: ['jardim', 'halloween'] }, PVP)).toBe('rua');
  });
  it('com vários ou nenhum marcado, vira Qualquer mapa', () => {
    expect(migrateOnlineMap({ fora: [] }, PVP)).toBeNull();
    expect(migrateOnlineMap({ fora: ['rua'] }, PVP)).toBeNull();
    expect(migrateOnlineMap({ fora: ['rua', 'jardim', 'halloween'] }, PVP)).toBeNull();
    expect(migrateOnlineMap({}, PVP)).toBeNull();
  });
  it('o filtro mais antigo (os marcados) também migra', () => {
    expect(migrateOnlineMap({ filtro: ['jardim'] }, PVP)).toBe('jardim');
    expect(migrateOnlineMap({ filtro: ['jardim', 'rua'] }, PVP)).toBeNull();
  });
  it('mapas que não são abertos e itens que não são texto no fora não contam', () => {
    expect(migrateOnlineMap({ fora: ['jardim', 'halloween', 'cemiterio', 7] }, PVP)).toBe('rua');
  });
  it('quem já tem onlineMap salvo fica com ele (um mapa ou Qualquer mapa)', () => {
    expect(migrateOnlineMap({ onlineMap: 'halloween', fora: ['jardim', 'halloween'] }, PVP)).toBe('halloween');
    expect(migrateOnlineMap({ onlineMap: null, fora: ['jardim', 'halloween'] }, PVP)).toBeNull();
    expect(migrateOnlineMap({ onlineMap: 'meu_mapa' }, PVP)).toBe('meu_mapa');
  });
});

describe('mapa efetivo do Online', () => {
  it('zumbi força o Cemitério, o único mapa do modo, com qualquer escolha', () => {
    expect(effectiveOnlineMap('rua', CARDS, 'zumbi')).toBe('cemiterio');
    expect(effectiveOnlineMap(null, CARDS, 'zumbi')).toBe('cemiterio');
  });
  it('o mapa escolhido vale enquanto é oferecido no tipo', () => {
    expect(effectiveOnlineMap('jardim', CARDS, 'mata-mata')).toBe('jardim');
    expect(effectiveOnlineMap('meu_mapa', CARDS, 'corrida-armada')).toBe('meu_mapa');
    expect(effectiveOnlineMap(null, CARDS, 'mata-mata')).toBeNull();
  });
  it('um mapa da comunidade que sumiu da lista vira Qualquer mapa (e volta se reaparecer)', () => {
    const semEle = CARDS.filter((c) => c.id !== 'meu_mapa');
    expect(effectiveOnlineMap('meu_mapa', semEle, 'mata-mata')).toBeNull();
    expect(effectiveOnlineMap('meu_mapa', CARDS, 'mata-mata')).toBe('meu_mapa');
  });
  it('o Cemitério nunca vale fora do zumbi', () => {
    expect(effectiveOnlineMap('cemiterio', CARDS, 'mata-mata')).toBeNull();
  });
});

describe('sessões e jogadores por mapa', () => {
  const list = [s('rua', 'mata-mata', 7), s('jardim', 'mata-mata', 2), s('rua', 'corrida-armada', 4), s('rua', 'mata-mata', 10)];
  it('a lista mostra só as do tipo e do mapa escolhido, na ordem do servidor', () => {
    expect(sessionsFor(list, 'mata-mata', 'rua')).toEqual([list[0], list[3]]);
    expect(sessionsFor(list, 'mata-mata', null)).toEqual([list[0], list[1], list[3]]);
    expect(sessionsFor(list, 'zumbi', null)).toEqual([]);
  });
  it('N jogando soma os jogadores das sessões do mapa e do tipo (Qualquer mapa: o tipo inteiro)', () => {
    expect(playersOn(list, 'mata-mata', 'rua')).toBe(17);
    expect(playersOn(list, 'mata-mata', 'halloween')).toBe(0);
    expect(playersOn(list, 'mata-mata', null)).toBe(19);
    expect(playersOn(list, 'corrida-armada', null)).toBe(4);
  });
});

describe('mapa que o botão laranja manda no play', () => {
  const officials = ['rua', 'jardim', 'halloween'];
  it('com um mapa escolhido, é ele (mesmo vazio)', () => {
    expect(quickTarget([s('rua', 'mata-mata', 9)], 'mata-mata', 'halloween', officials, () => 0)).toBe('halloween');
  });
  it('com Qualquer mapa, o mapa da sessão mais cheia e não lotada do tipo', () => {
    const list = [s('rua', 'mata-mata', 10), s('jardim', 'mata-mata', 3), s('halloween', 'mata-mata', 6), s('meu_mapa', 'corrida-armada', 9)];
    expect(quickTarget(list, 'mata-mata', null, officials, () => 0)).toBe('halloween');
    expect(quickTarget(list, 'corrida-armada', null, officials, () => 0)).toBe('meu_mapa');
  });
  it('com Qualquer mapa e ninguém jogando (ou tudo lotado), um oficial do tipo ao acaso', () => {
    expect(quickTarget([], 'mata-mata', null, officials, () => 0)).toBe('rua');
    expect(quickTarget([], 'mata-mata', null, officials, () => 0.99)).toBe('halloween');
    expect(quickTarget([s('rua', 'mata-mata', 10)], 'mata-mata', null, officials, () => 0.5)).toBe('jardim');
    expect(quickTarget([], 'mata-mata', null, [], () => 0)).toBeNull();
  });
});

describe('textos do botão laranja', () => {
  beforeAll(() => setLang('pt-BR'));
  const text = (x: ReturnType<typeof ctaText>) => [say(x.title), say(x.detail)];
  it('Online com mapa: quantos jogam, ou que abre uma sessão nova', () => {
    expect(text(ctaText({ where: 'online', mode: 'Mata-mata', map: 'Rua dos Vizinhos', players: 9 }))).toEqual(['JOGAR ONLINE', 'Mata-mata · Rua dos Vizinhos · 9 jogando']);
    expect(text(ctaText({ where: 'online', mode: 'Mata-mata', map: 'Jardim do Dragão', players: 0 }))).toEqual(['JOGAR ONLINE', 'Mata-mata · Jardim do Dragão · abre uma sessão nova']);
    expect(text(ctaText({ where: 'online', mode: 'Mata-mata', map: 'qualquer mapa', players: 11 }))[1]).toBe('Mata-mata · qualquer mapa · 11 jogando');
  });
  it('Online antes da lista chegar: sem a contagem', () => {
    expect(text(ctaText({ where: 'online', mode: 'Mata-mata', map: 'Rua dos Vizinhos', players: null }))[1]).toBe('Mata-mata · Rua dos Vizinhos');
  });
  it('Contra bots: N bots e a dificuldade; zumbi solo encara a horda', () => {
    expect(text(ctaText({ where: 'bots', mode: 'Mata-mata', map: 'Rua dos Vizinhos', solo: false, count: 7, skill: 'Normal' }))).toEqual(['CONTRA 7 BOTS', 'Mata-mata · Rua dos Vizinhos · Normal']);
    expect(text(ctaText({ where: 'bots', mode: 'Zumbi', map: 'Cemitério da Capela', solo: true, count: 7, skill: 'Normal' }))).toEqual(['ENCARAR A HORDA SOZINHO', 'Zumbi · Cemitério da Capela']);
  });
  it('Campo de tiro: bonecos parados no mapa escolhido', () => {
    expect(text(ctaText({ where: 'treino', map: 'Rua dos Vizinhos' }))).toEqual(['CAMPO DE TIRO', 'Bonecos parados · Rua dos Vizinhos']);
  });
  it('nenhum texto promete a sessão "mais cheia"', () => {
    const all = [
      ctaText({ where: 'online', mode: 'Mata-mata', map: 'qualquer mapa', players: 3 }),
      ctaText({ where: 'online', mode: 'Mata-mata', map: 'qualquer mapa', players: 0 }),
    ].flatMap(text);
    expect(all.some((x) => /mais cheia/i.test(x))).toBe(false);
  });
});
