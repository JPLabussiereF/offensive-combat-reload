// How the page gets into the editor and out to a test of the map without losing it. Every way out is a page
// reload (the game builds one map per page); what has to cross it goes in sessionStorage (where to go next) and
// IndexedDB (the draft: client/net/maps.ts):
// - "Testar": the draft is kept, the page reloads into the training range on it;
// - leaving the test: the page reloads into the editor again, on the same draft.
import type { MapData, TipoMapa } from '@shared/mapData';
import { DEFAULT_MAP } from '@shared/maps';
import type { HomeChoice } from '../ui/home';
import { fetchMe, fetchProfile } from '../net/api';
import { loadDraft } from '../net/maps';

const KEY = 'oc.editor';

/** The map the editor has open on the server (null: a new one). */
export type EditorMap = { id: string; versao: number } | null;

/** What crosses the reload: go test the draft, or come back to it in the editor. */
export interface Handoff {
  acao: 'testar' | 'voltar';
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
    return h && (h.acao === 'testar' || h.acao === 'voltar') && typeof h.chave === 'string' ? h : null;
  } catch {
    return null;
  }
}

/** The draft's key: the map's id, or "novo" for a map not saved yet. */
export const draftKey = (mapa: EditorMap) => mapa?.id ?? 'novo';

/**
 * PROVISÓRIO (fase 4 da PF-6: trocar pelo botão Editar e Novo mapa da tela Mapas). Só em desenvolvimento:
 * "?editor" abre o editor num mapa novo e "?editor=<id>" no mapa <id> (a versão atual; sem servidor, um oficial
 * vem do pacote do cliente). O parâmetro sai do endereço, para que sair do editor volte à tela inicial.
 */
export function devEditorChoice(): EditorMap | 'novo' | null {
  const sp = new URLSearchParams(location.search);
  if (!sp.has('editor')) return null;
  const id = sp.get('editor');
  sp.delete('editor');
  const q = sp.toString();
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
  return id ? { id, versao: 0 } : 'novo';
}

/** The editor's HomeChoice (the home's fields it doesn't use are filled in). */
export function editorChoice(mapa: EditorMap, rascunho?: Handoff): HomeChoice {
  return { mode: 'editor', mapa, ...(rascunho ? { rascunho: { chave: rascunho.chave, tipo: rascunho.tipo } } : {}), name: '', sex: 'm', account: null, map: mapa?.id ?? DEFAULT_MAP };
}

/** The training range on the draft being tested (the player's name and look from their account, if signed in). */
export async function testChoice(h: Handoff): Promise<{ choice: HomeChoice; data: MapData } | null> {
  const data = await loadDraft(h.chave);
  if (!data) return null;
  const { me } = await fetchMe();
  const account = me ? await fetchProfile().catch(() => null) : null;
  return { choice: { mode: 'offline', variant: 'range', name: me?.tag ?? 'Recruta', sex: account?.sexo ?? me?.sexo ?? 'm', account, map: h.mapa?.id ?? DEFAULT_MAP }, data };
}
