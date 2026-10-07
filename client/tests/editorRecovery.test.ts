// What the editor decides without a screen (client/editor/recovery.ts): the draft kept at every edit and when it's
// offered back (P40), saving anyway over a version saved meanwhile (P39), and what "Testar" opens (P41).
import { describe, expect, it } from 'bun:test';
import type { MapData } from '@shared/mapData';
import { asDraft, draftIsNewer, forceBase, recoveredBase, testGame, type Draft } from '../editor/recovery';
import rua from '@shared/data/mapas/rua.json';
import cemiterio from '@shared/data/mapas/cemiterio.json';

const RUA = rua as unknown as MapData;
const CEMITERIO = cemiterio as unknown as MapData;
const draft = (em: number, base: number | null = 3): Draft => ({ dados: RUA, em, base });

describe('rascunho automático (P40)', () => {
  it('lê o registro do rascunho, e um mapa guardado sem data como o mais velho possível', () => {
    expect(asDraft({ dados: RUA, em: 123, base: 2 })).toEqual({ dados: RUA, em: 123, base: 2 });
    expect(asDraft({ dados: RUA })).toEqual({ dados: RUA, em: 0, base: null });
    expect(asDraft(RUA)).toEqual({ dados: RUA, em: 0, base: null });
    expect(asDraft(null)).toBeNull();
    expect(asDraft('mapa')).toBeNull();
    expect(asDraft({ qualquer: 1 })).toBeNull();
  });

  it('só oferece o rascunho mais novo que a versão atual', () => {
    const saved = { atualizadoEm: '2026-10-06T12:00:00.000Z' };
    const at = Date.parse(saved.atualizadoEm);
    expect(draftIsNewer(draft(at + 1000), saved)).toBe(true);
    expect(draftIsNewer(draft(at - 1000), saved)).toBe(false);
    expect(draftIsNewer(draft(at), saved)).toBe(false);
    expect(draftIsNewer(null, saved)).toBe(false);
    // A new map (or the server unreachable): any draft.
    expect(draftIsNewer(draft(0), null)).toBe(true);
    expect(draftIsNewer(draft(5), { atualizadoEm: 'não é data' })).toBe(true);
  });

  it('o rascunho recuperado salva sobre a versão de onde veio (a mais nova dá 409)', () => {
    expect(recoveredBase(draft(1, 2), 5)).toBe(2);
    expect(recoveredBase(draft(1, null), 5)).toBe(5);
  });
});

describe('versão desatualizada (P39)', () => {
  it('"salvar como nova versão mesmo assim" reenvia com a versão atual como base', () => {
    const target = { id: 'abc', versao: 2, tipo: 'comunidade' as const };
    expect(forceBase(target, 4)).toEqual({ id: 'abc', versao: 4, tipo: 'comunidade' });
    // Without a version from the server, nothing changes.
    expect(forceBase(target, undefined).versao).toBe(2);
    expect(forceBase(target, 'x').versao).toBe(2);
    expect(forceBase(target, 0).versao).toBe(2);
    // The target given is left as it was.
    expect(target.versao).toBe(2);
  });
});

describe('Testar (P41)', () => {
  it('mapa exclusivo do zumbi abre a partida de zumbi; os outros, o treino', () => {
    expect(testGame(CEMITERIO)).toBe('zumbi');
    expect(testGame(RUA)).toBe('treino');
    expect(testGame({})).toBe('treino');
  });
});
