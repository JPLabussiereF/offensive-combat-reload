// The Galpão's rules (client/ui/galpao/galpaoRules.ts): the stations in menu order (Gerenciamento only for the
// staff), which tab each station holds, what each key does on the overview and at a station, and who gets the 3D
// home at all.
import { describe, expect, it } from 'bun:test';
import { galpaoWanted, hop, keyAction, lightScene, STATION_ORDER, stationOf, stationOrder, tabOf } from '../ui/galpao/galpaoRules';

describe('estações do galpão', () => {
  it('sete estações na ordem do menu; Gerenciamento só para a equipe', () => {
    expect(STATION_ORDER).toEqual(['play', 'maps', 'arsenal', 'album', 'profile', 'settings', 'admin']);
    expect(stationOrder(true)).toEqual([...STATION_ORDER]);
    expect(stationOrder(false)).not.toContain('admin');
    expect(stationOrder(false)).toHaveLength(6);
  });

  it('anterior e próxima dão a volta; fora de uma estação não há vizinha', () => {
    const o = stationOrder(false);
    expect(hop(o, 'play', -1)).toBe('settings');
    expect(hop(o, 'settings', 1)).toBe('play');
    expect(hop(o, 'arsenal', 1)).toBe('album');
    expect(hop(o, 'home', 1)).toBeNull();
    expect(hop(o, 'intro', -1)).toBeNull();
    // A moderator who lost the role at the admin booth: it's no longer in the order.
    expect(hop(o, 'admin', 1)).toBeNull();
  });

  it('cada estação mostra uma aba da tela inicial, e os formulários da conta abrem no armário do perfil', () => {
    expect(tabOf('admin')).toBe('management');
    expect(tabOf('arsenal')).toBe('arsenal');
    expect(stationOf('management')).toBe('admin');
    expect(stationOf('auth')).toBe('profile');
    for (const s of STATION_ORDER) expect(stationOf(tabOf(s))).toBe(s);
  });
});

describe('teclas do galpão', () => {
  const o = stationOrder(true);

  it('na visão geral: 1 a 7 vão às estações e Enter é a entrada rápida (só depois de chegar)', () => {
    expect(keyAction('1', 'home', true, o, false)).toEqual({ go: 'play' });
    expect(keyAction('7', 'home', true, o, false)).toEqual({ go: 'admin' });
    expect(keyAction('7', 'home', true, stationOrder(false), false)).toBeNull();
    expect(keyAction('Enter', 'home', true, o, false)).toEqual({ quickPlay: true });
    expect(keyAction('Enter', 'home', false, o, false)).toBeNull();
    expect(keyAction('Escape', 'home', true, o, false)).toBeNull();
    expect(keyAction('e', 'home', true, o, false)).toBeNull();
  });

  it('numa estação: Q/E e as setas trocam de estação, Esc volta (fechando antes a ficha da arma)', () => {
    expect(keyAction('q', 'maps', true, o, false)).toEqual({ hop: -1 });
    expect(keyAction('E', 'maps', false, o, false)).toEqual({ hop: 1 });
    expect(keyAction('ArrowLeft', 'album', true, o, false)).toEqual({ hop: -1 });
    expect(keyAction('Escape', 'maps', true, o, false)).toEqual({ go: 'home' });
    expect(keyAction('Escape', 'arsenal', true, o, true)).toEqual({ closeCard: true });
    expect(keyAction('Escape', 'arsenal', true, o, false)).toEqual({ go: 'home' });
    expect(keyAction('3', 'maps', true, o, false)).toBeNull();
  });

  it('nada durante o voo de abertura', () => {
    for (const k of ['1', 'Enter', 'Escape', 'q']) expect(keyAction(k, 'intro', false, o, false)).toBeNull();
  });
});

describe('quem recebe o galpão', () => {
  it('não num renderizador por software, nem com oc.galpao = off', () => {
    expect(galpaoWanted(false, null)).toBe(true);
    expect(galpaoWanted(true, null)).toBe(false);
    expect(galpaoWanted(false, 'off')).toBe(false);
  });

  it('a cena leve no toque e em janelas estreitas', () => {
    expect(lightScene(true, 1920)).toBe(true);
    expect(lightScene(false, 700)).toBe(true);
    expect(lightScene(false, 1280)).toBe(false);
  });
});
