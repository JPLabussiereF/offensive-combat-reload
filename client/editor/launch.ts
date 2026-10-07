// How the page gets into the editor. The way in is the home's Mapas tab (Editar, Novo mapa: client/ui/maps.ts
// resolves the home with the editor's HomeChoice). Playing the map no longer leaves the page (Play inside the
// editor, Revisions 01 etapa 4: client/editor/playHost.ts); the only reload left inside the editor is "Abrir a
// versão atual" after a 409 (P39), which crosses it in sessionStorage ("oc.editor") and opens the editor again on
// the map's current version. Handoffs written by the old "Testar" (a page open before the update) are still read:
// both "testar" and "voltar" open the editor on the draft they name (the draft is in IndexedDB, client/net/maps.ts).
import type { TipoMapa } from '@shared/mapData';
import { DEFAULT_MAP } from '@shared/maps';
import type { HomeChoice } from '../ui/home';

const KEY = 'oc.editor';

/** The map the editor has open on the server (null: a new one). */
export type EditorMap = { id: string; versao: number } | null;

/**
 * What crosses the reload: open the map's current version ("abrir"); "testar" and "voltar" came from the old
 * Testar (open the editor on their draft).
 */
export interface Handoff {
  acao: 'abrir' | 'testar' | 'voltar';
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

/** The HomeChoice a handoff opens: the editor on the current version ("abrir"), or on an old test's draft. */
export function handoffChoice(h: Handoff): HomeChoice {
  return h.acao === 'abrir' ? editorChoice(h.mapa) : editorChoice(h.mapa, h);
}
