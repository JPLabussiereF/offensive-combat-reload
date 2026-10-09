// The character editor's cards and height wall without a screen (PF-33, client/ui/customize/rules.ts and lineup.ts):
// a card's picture is the piece in its catalog colors, the same for every look (kept in the browser by item and body,
// signed by the drawing's format and the game's version only); the worn piece in other colors and the PCD cards are
// drawn for the look (kept in memory); the wall's heights come from EFFECTS.
import { describe, expect, it } from 'bun:test';
import { defaultAppearance, EFFECTS, HEIGHTS, randomAppearance, wear, type Appearance } from '@shared/appearance';
import { catalogItem } from '@shared/catalog';
import { RIG_HEIGHT } from '../character/rig';
import { lineupHtml } from '../ui/customize/lineup';
import { CARD_FORMAT, cardSignature, catalogColors, heightMeters, metersText, shotOf } from '../ui/customize/rules';

const clone = (a: Appearance): Appearance => JSON.parse(JSON.stringify(a));

describe('cartões do editor de personagem', () => {
  it('o cartão de uma peça não depende do visual: mesma chave e mesma assinatura para qualquer personagem', () => {
    const looks = [defaultAppearance('m'), randomAppearance('m', () => 0.3), randomAppearance('m', () => 0.8)];
    const keys = new Set(looks.map((a) => shotOf({ item: 'polo' }, a, 'm')!.key));
    expect([...keys]).toEqual(['item:polo:m']);
    const shot = shotOf({ item: 'polo' }, looks[1], 'm')!;
    expect(shot.persist).toBe(true);
    expect(shot.colors).toEqual(catalogColors('polo'));
    // The signature is the drawing's format and the game's version: no look in it.
    expect(cardSignature('abc')).toBe(cardSignature('abc'));
    expect(cardSignature('abc')).not.toBe(cardSignature('def'));
    expect(cardSignature('abc', CARD_FORMAT + 1)).not.toBe(cardSignature('abc'));
    // The other body has its own pictures.
    expect(shotOf({ item: 'polo' }, looks[0], 'f')!.key).toBe('item:polo:f');
  });

  it('a peça vestida nas cores do catálogo usa a figura guardada; em outras cores, uma só dela, em memória', () => {
    const a = defaultAppearance('m');
    wear(a, 'tronco', 'polo', 'm');
    a.itens.tronco!.cores = [...catalogColors('polo')];
    expect(shotOf({ item: 'polo' }, a, 'm')).toMatchObject({ key: 'item:polo:m', persist: true });
    a.itens.tronco!.cores[0] = '#123456';
    const worn = shotOf({ item: 'polo' }, a, 'm')!;
    expect(worn.persist).toBe(false);
    expect(worn.key).toContain('#123456');
    expect(worn.colors[0]).toBe('#123456');
    // Another piece of the same look stays the catalog's.
    expect(shotOf({ item: 'regata' }, a, 'm')!.key).toBe('item:regata:m');
  });

  it('cabelo e barba vestidos seguem a cor do cabelo; os outros, a cor padrão (P13)', () => {
    const a = defaultAppearance('m');
    a.cabelo = { id: 'topete', cor: '#b3282d' };
    a.barba = 'bigode';
    expect(shotOf({ item: 'topete' }, a, 'm')).toMatchObject({ persist: false, colors: ['#b3282d'] });
    expect(shotOf({ item: 'bigode' }, a, 'm')).toMatchObject({ persist: false, colors: ['#b3282d'] });
    expect(shotOf({ item: 'curto' }, a, 'm')).toMatchObject({ key: 'item:curto:m', persist: true, colors: catalogColors('curto') });
    expect(catalogItem('curto')!.category).toBe('cabelo');
  });

  it('Nenhum e Descalço são ícones; os traços do rosto vão na cabeça de argila, iguais para todos', () => {
    expect(shotOf({ icon: 'nenhum' }, defaultAppearance('m'), 'm')).toBeNull();
    expect(shotOf({ icon: 'descalco' }, defaultAppearance('m'), 'm')).toBeNull();
    const face = shotOf({ face: 'nariz', value: 'aquilino' }, randomAppearance('f', () => 0.5), 'f')!;
    expect(face).toMatchObject({ key: 'rosto:nariz.aquilino:f', persist: true });
    expect(shotOf({ face: 'nariz', value: 'aquilino' }, defaultAppearance('f'), 'f')!.key).toBe(face.key);
  });

  it('Modo PCD: o personagem do jogador, refeito só quando o visual (sem o PCD) muda', () => {
    const a = defaultAppearance('m');
    const pic = { pcd: { braco: 'maoDir' as const, perna: '' as const } };
    const key = shotOf(pic, a, 'm')!.key;
    expect(shotOf(pic, a, 'm')!.persist).toBe(false);
    // Choosing a loss doesn't change the look the cards are drawn from.
    const withLoss = clone(a);
    withLoss.pcd = { braco: 'bracoEsq', perna: 'pernaDir' };
    expect(shotOf(pic, withLoss, 'm')!.key).toBe(key);
    // Another color does.
    const other = clone(a);
    other.itens.tronco!.cores[0] = '#5e1f2a';
    expect(shotOf(pic, other, 'm')!.key).not.toBe(key);
    expect(shotOf({ pcd: { braco: '', perna: '' } }, a, 'm')!.key).not.toBe(key);
  });
});

describe('parede de altura e biotipo', () => {
  it('as alturas são 1,73 / 1,80 / 1,87 m, calculadas de EFFECTS.heightScale × 1,80 m', () => {
    expect(HEIGHTS.map((h) => metersText(heightMeters(h)))).toEqual(['1,73 m', '1,80 m', '1,87 m']);
    expect(metersText(heightMeters('alto'), 'en')).toBe('1.87 m');
    for (const h of HEIGHTS) expect(heightMeters(h)).toBeCloseTo(RIG_HEIGHT * EFFECTS.heightScale[h], 10);
  });

  it('a parede mostra as três alturas, destaca a escolhida e tem um botão por silhueta', () => {
    const html = lineupHtml('height', 'alto', 'alto', { name: (v) => v, lang: 'pt' });
    for (const m of ['1,73 m', '1,80 m', '1,87 m']) expect(html).toContain(m);
    expect(html.match(/class="cz-fig on"/g)).toHaveLength(1);
    expect(html).toContain('ALTO · 1,87 m');
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toContain('data-v="alto" aria-pressed="true"');
    expect(html).toContain('data-v="pequeno" aria-pressed="false"');
    // The ruler is cut: from 1,40 m.
    expect(html).toContain('>1,40<');
    // The build wall: the three builds at the player's height.
    const build = lineupHtml('build', 'gordo', 'pequeno', { name: (v) => v, lang: 'pt' });
    expect(build).toContain('GORDO · 1,73 m');
    expect(build.match(/<button/g)).toHaveLength(3);
  });
});
