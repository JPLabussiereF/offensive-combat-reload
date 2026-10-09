// The object detail in effect (PF-35): Leve by default on phones and with software rendering, Normal elsewhere;
// the player's choice wins (client/core/objectDetail.ts).
import { describe, expect, it } from 'bun:test';
import { pickDetail } from '../core/objectDetail';

describe('detalhe dos objetos', () => {
  it('sem escolha: Leve no celular e com renderização por software, Normal nos demais', () => {
    expect(pickDetail(undefined, true, false)).toBe('leve');
    expect(pickDetail(undefined, false, true)).toBe('leve');
    expect(pickDetail(undefined, true, true)).toBe('leve');
    expect(pickDetail(undefined, false, false)).toBe('normal');
  });

  it('a escolha do jogador prevalece', () => {
    expect(pickDetail('normal', true, true)).toBe('normal');
    expect(pickDetail('leve', false, false)).toBe('leve');
  });

  it('valor salvo quebrado conta como sem escolha', () => {
    expect(pickDetail('alto', false, false)).toBe('normal');
    expect(pickDetail(3, true, false)).toBe('leve');
  });
});
