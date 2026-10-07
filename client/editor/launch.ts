// How the page gets into the editor and out to a test of the map without losing it. The way in is the home's
// Mapas tab (Editar, Novo mapa: client/ui/maps.ts resolves the home with the editor's HomeChoice). Every way
// out is a page reload (the game builds one map per page); what has to cross it goes in sessionStorage (where
// to go next) and IndexedDB (the draft: client/net/maps.ts):
// - "Testar": the draft is kept, the page reloads into a test of it (the training range, or the zumbi match
//   alone against the horde on a zumbi-only map: P41);
// - leaving the test: the page reloads into the editor again, on the same draft;
// - "Abrir a versão atual" after a 409 (P39): the page reloads into the editor on the map's current version.
import type { MapData, TipoMapa } from '@shared/mapData';
import { DEFAULT_MAP } from '@shared/maps';
import type { HomeChoice } from '../ui/home';
import { fetchMe, fetchProfile } from '../net/api';
import { loadDraft } from '../net/maps';
import { testGame } from './recovery';

const KEY = 'oc.editor';

/** The map the editor has open on the server (null: a new one). */
export type EditorMap = { id: string; versao: number } | null;

/** What crosses the reload: go test the draft, come back to it in the editor, or open the map's current version. */
export interface Handoff {
  acao: 'testar' | 'voltar' | 'abrir';
  mapa: EditorMap;
  tipo: TipoMapa;
  /** The draft's key in IndexedDB. */
  chave: string;
}

export function handOff(h: Handoff) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    /* storage blocked: the reload just goes home */
  }
}

/** What the last page asked this one to do (read once). */
export function takeHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const h = raw ? (JSON.parse(raw) as Handoff) : null;
    return h && (h.acao === 'testar' || h.acao === 'voltar' || h.acao === 'abrir') && typeof h.chave === 'string' ? h : null;
  } catch {
    return null;
  }
}

/** The draft's key: the map's id, or "novo" for a map not saved yet. */
export const draftKey = (mapa: EditorMap) => mapa?.id ?? 'novo';

/** The editor's HomeChoice (the home's fields it doesn't use are filled in). */
export function editorChoice(mapa: EditorMap, rascunho?: Handoff): HomeChoice {
  return { mode: 'editor', mapa, ...(rascunho ? { rascunho: { chave: rascunho.chave, tipo: rascunho.tipo } } : {}), name: '', sex: 'm', account: null, map: mapa?.id ?? DEFAULT_MAP };
}

/**
 * The test of the draft (the player's name and look from their account, if signed in): the zumbi match alone
 * against the horde on a zumbi-only map, the training range on any other (P41).
 */
export async function testChoice(h: Handoff): Promise<{ choice: HomeChoice; data: MapData } | null> {
  const draft = await loadDraft(h.chave);
  if (!draft) return null;
  const data = draft.dados;
  const { me } = await fetchMe();
  const account = me ? await fetchProfile().catch(() => null) : null;
  const base = { name: me?.tag ?? 'Recruta', sex: account?.sexo ?? me?.sexo ?? 'm', account, map: h.mapa?.id ?? DEFAULT_MAP };
  const choice: HomeChoice = testGame(data) === 'zumbi' ? { ...base, mode: 'bots', game: 'zumbi', count: 0, skill: 'normal' } : { ...base, mode: 'offline', variant: 'range' };
  return { choice, data };
}
