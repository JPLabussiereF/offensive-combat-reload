// The Galpão's rules (client/ui/galpao/galpaoRules.ts): the stations in menu order (Gerenciamento only for the
// staff), which tab each station holds, what each key does on the overview and at a station, and who gets the 3D
// home at all.
import { describe, expect, it } from 'bun:test';
import { compactGalpao, flightDuration, galpaoWanted, hop, keyAction, lightScene, petSpot, STATION_ORDER, stationOf, stationOrder, tabOf } from '../ui/galpao/galpaoRules';

describe('estações do galpão', () => {
  it('oito estações na ordem do menu: os pets antes do Gerenciamento, que é só da equipe', () => {
    expect(STATION_ORDER).toEqual(['play', 'maps', 'arsenal', 'album', 'profile', 'settings', 'pets', 'admin']);
    expect(stationOrder(true)).toEqual([...STATION_ORDER]);
    expect(stationOrder(false)).not.toContain('admin');
    expect(stationOrder(false)).toHaveLength(7);
    // The numbers on the menu: 1 to 6 as before, the pets 07, Gerenciamento 08.
    expect(STATION_ORDER.indexOf('pets') + 1).toBe(7);
    expect(STATION_ORDER.indexOf('admin') + 1).toBe(8);
  });

  it('anterior e próxima dão a volta; fora de uma estação não há vizinha', () => {
    const o = stationOrder(false);
    expect(hop(o, 'play', -1)).toBe('pets');
    expect(hop(o, 'settings', 1)).toBe('pets');
    expect(hop(o, 'pets', 1)).toBe('play');
    expect(hop(o, 'arsenal', 1)).toBe('album');
    expect(hop(o, 'home', 1)).toBeNull();
    expect(hop(o, 'intro', -1)).toBeNull();
    // A moderator who lost the role at the admin booth: it's no longer in the order.
    expect(hop(o, 'admin', 1)).toBeNull();
  });

  it('cada estação mostra uma aba da tela inicial, e os formulários da conta abrem no armário do perfil', () => {
    expect(tabOf('admin')).toBe('management');
    expect(tabOf('arsenal')).toBe('arsenal');
    expect(tabOf('pets')).toBe('pets');
    expect(stationOf('management')).toBe('admin');
    expect(stationOf('auth')).toBe('profile');
    for (const s of STATION_ORDER) expect(stationOf(tabOf(s))).toBe(s);
  });
});

describe('teclas do galpão', () => {
  const o = stationOrder(true);

  it('na visão geral: 1 a 8 vão às estações (7 os pets, 8 o Gerenciamento) e Enter é a entrada rápida (só depois de chegar)', () => {
    expect(keyAction('1', 'home', true, o, false)).toEqual({ go: 'play' });
    expect(keyAction('6', 'home', true, o, false)).toEqual({ go: 'settings' });
    expect(keyAction('7', 'home', true, o, false)).toEqual({ go: 'pets' });
    expect(keyAction('8', 'home', true, o, false)).toEqual({ go: 'admin' });
    expect(keyAction('7', 'home', true, stationOrder(false), false)).toEqual({ go: 'pets' });
    expect(keyAction('8', 'home', true, stationOrder(false), false)).toBeNull();
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
    expect(keyAction('Escape', 'pets', true, o, false)).toEqual({ go: 'home' });
    expect(keyAction('e', 'pets', true, o, false)).toEqual({ hop: 1 });
    expect(keyAction('3', 'maps', true, o, false)).toBeNull();
  });

  it('nada durante o voo de abertura', () => {
    for (const k of ['1', 'Enter', 'Escape', 'q']) expect(keyAction(k, 'intro', false, o, false)).toBeNull();
  });
});

describe('o pet na visão geral e o voo entre as estações', () => {
  it('pequeno no tampo da mesa (no celular deitado, na ponta esquerda); cachorro em pé atrás dela; nada no retrato', () => {
    expect(petSpot(1600, 900, 'pequeno')).toEqual({ at: [0.22, 0.92, 0.3], pose: 'sit' });
    expect(petSpot(1920, 1080, 'pequeno')!.at).toEqual([0.22, 0.92, 0.3]);
    expect(petSpot(844, 390, 'pequeno')).toEqual({ at: [-0.9, 0.92, 0.45], pose: 'sit' });
    expect(petSpot(1600, 900, 'cachorro')).toEqual({ at: [0.57, 0, -0.05], pose: 'table' });
    // On a phone lying down the menu covers the right: the dog at the table's left end, like the small ones.
    expect(petSpot(844, 390, 'cachorro')).toEqual({ at: [-1.0, 0, -0.05], pose: 'table' });
    expect(petSpot(390, 844, 'pequeno')).toBeNull();
    expect(petSpot(390, 844, 'cachorro')).toBeNull();
  });

  it('o layout pequeno (sem etiquetas sob os ganchos, a fileira de rostos na ficha): celular deitado, retrato e janela pequena', () => {
    expect(compactGalpao(844, 390)).toBe(true);
    expect(compactGalpao(390, 844)).toBe(true);
    expect(compactGalpao(1000, 540)).toBe(true);
    expect(compactGalpao(1366, 768)).toBe(false);
    expect(compactGalpao(1600, 900)).toBe(false);
  });

  it('a duração do voo cresce com o giro: 1 s até 60°, 1,2 s a 120°, 1,4 s a 180°; movimento reduzido corta em 0,2 s', () => {
    expect(flightDuration(30, false)).toBe(1);
    expect(flightDuration(60, false)).toBe(1);
    expect(flightDuration(120, false)).toBeCloseTo(1.2, 5);
    expect(flightDuration(180, false)).toBeCloseTo(1.4, 5);
    expect(flightDuration(270, false)).toBeCloseTo(1.4, 5);
    expect(flightDuration(150, true)).toBe(0.2);
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
