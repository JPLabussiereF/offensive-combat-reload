// What the editor decides without a screen (client/tests/editorRecovery.test.ts):
// - P40: the draft kept in IndexedDB at every edit (client/net/maps.ts) and whether it's worth offering back when
//   the map opens (newer than the version saved on the server);
// - P39: saving again over a newer version (the 409's "atual" becomes the base);
// - P41: what "Testar" opens (a zumbi-only map: the zumbi match alone against the horde; any other: the range).
import type { MapData } from '@shared/mapData';
import type { GameModeId } from '@shared/modes';

/** The editor's draft of a map, as IndexedDB keeps it. */
export interface Draft {
  dados: MapData;
  /** When it was written (ms since 1970). */
  em: number;
  /** The saved version it was edited from (null: a map not saved yet). */
  base: number | null;
}

/**
 * A stored draft as the editor reads it: a record, or a bare map (written before drafts had a date: as old as
 * can be). Anything else: none.
 */
export function asDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.dados && typeof r.dados === 'object') return { dados: r.dados as MapData, em: typeof r.em === 'number' ? r.em : 0, base: typeof r.base === 'number' ? r.base : null };
  if ('formato' in r && Array.isArray(r.pecas)) return { dados: raw as MapData, em: 0, base: null };
  return null;
}

/**
 * Whether opening a map should offer its draft back: there is one, and it was written after the version the map
 * plays now became current (`atualizadoEm` of GET /api/mapas/:id). A new map (or one the server can't tell
 * about): any draft.
 */
export function draftIsNewer(d: Draft | null, current: { atualizadoEm: string } | null): boolean {
  if (!d) return false;
  if (!current) return true;
  const at = Date.parse(current.atualizadoEm);
  return Number.isFinite(at) ? d.em > at : true;
}

/**
 * The version a recovered draft saves over: the one it was edited from, so that a newer version saved meanwhile
 * gets the 409 (and the choice of P39) instead of being overwritten without anyone knowing.
 */
export const recoveredBase = (d: Draft, current: number | null): number | null => d.base ?? current;

/** P39 "Salvar como nova versão mesmo assim": the base becomes the current version the 409 named. */
export function forceBase<T extends { versao: number | null }>(target: T, atual: unknown): T {
  const v = Number(atual);
  return { ...target, versao: Number.isInteger(v) && v > 0 ? v : target.versao };
}

/** What "Testar" opens: the zumbi match (solo, against the horde) on a zumbi-only map, the training range on any other (P41). */
export function testGame(data: Pick<MapData, 'exclusivo'>): Extract<GameModeId, 'zumbi'> | 'treino' {
  return data.exclusivo === 'zumbi' ? 'zumbi' : 'treino';
}
