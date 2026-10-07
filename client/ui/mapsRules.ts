// What the Mapas tab and the home's map pickers decide without a screen (client/tests/mapsScreen.test.ts):
// which buttons a map's card shows to whom, the modes a map is played in, the list's address (tab, search,
// order, the staff's hidden maps), and the maps the home offers online (the official ones from /api/mapas plus
// the maps of the sessions open now). The server checks every action again: this only hides what it would
// refuse.
import type { MapaResumo, TipoMapa } from '@shared/mapData';
import { GAME_MODE_IDS, modeAllowsMap, type GameModeId } from '@shared/modes';
import { isEquipe, type Papel } from '@shared/roles';

/** A map as the pickers show it: its card (name, emoji and color from its current version) and its modes. */
export interface MapCard {
  id: string;
  tipo: TipoMapa;
  nome: string;
  cartao: { emoji: string; cor: string };
  exclusivo: 'zumbi' | null;
  /** The author's tag (null: an official map). */
  autor: string | null;
}

export type MapsTab = TipoMapa;
export type MapsOrder = 'jogados' | 'recentes';
export type MapsSearchBy = 'nome' | 'autor';

/** Who's looking: signed in or not, and their staff roles. */
export interface Viewer {
  signedIn: boolean;
  papeis: readonly Papel[];
}

/** The buttons a map's card shows. */
export interface MapActions {
  jogar: boolean;
  editar: boolean;
  duplicar: boolean;
  apagar: boolean;
  ocultar: boolean;
  desocultar: boolean;
  /** The saved versions, and going back to one. */
  versoes: boolean;
}

/**
 * What a viewer may do with a map: its author edits and deletes their community map; the staff (admin,
 * moderator) edits the official maps and hides, shows again or deletes any map; anyone signed in duplicates
 * what they can see (and plays it, unless it's hidden: a hidden map opens no session). Going back to a saved
 * version goes with editing.
 */
export function mapActions(m: Pick<MapaResumo, 'tipo' | 'meu' | 'oculto' | 'pode'>, v: Viewer): MapActions {
  const staff = v.signedIn && isEquipe(v);
  const editar = v.signedIn && m.pode.editar && (m.tipo === 'oficial' ? staff : m.meu);
  return {
    jogar: v.signedIn && !m.oculto,
    editar,
    duplicar: v.signedIn && m.pode.duplicar,
    apagar: v.signedIn && m.pode.apagar && (staff || (m.tipo === 'comunidade' && m.meu)),
    ocultar: staff && m.pode.ocultar && !m.oculto,
    desocultar: staff && m.pode.ocultar && !!m.oculto,
    versoes: editar,
  };
}

/** The Mapas tab's "Novo mapa": any signed-in account (community; the staff may save it as official). */
export const canCreateMap = (v: Viewer) => v.signedIn;

/** The modes a map is played in: a zumbi-only map in that mode alone, any other in every mode not made for maps of its own. */
export const playModes = (exclusivo: 'zumbi' | null | undefined): GameModeId[] => GAME_MODE_IDS.filter((g) => modeAllowsMap(g, exclusivo));

/** The mode "Jogar" uses: the one wanted, if the map is played in it; otherwise the map's first. */
export function playMode(exclusivo: 'zumbi' | null | undefined, wanted: GameModeId): GameModeId {
  const modes = playModes(exclusivo);
  return modes.includes(wanted) ? wanted : modes[0];
}

/** What the Mapas tab lists. */
export interface MapsQuery {
  tab: MapsTab;
  q: string;
  by: MapsSearchBy;
  order: MapsOrder;
  /** The staff's filter: hidden maps too (P34; ignored by the server for anyone else). */
  hidden: boolean;
  page: number;
}

/** GET /api/mapas for a query (`staff`: whether the hidden-maps filter applies). */
export function mapsUrl(q: MapsQuery, staff: boolean): string {
  const sp = new URLSearchParams({ tipo: q.tab, ordem: q.order });
  const text = q.q.trim();
  if (text) sp.set(q.by === 'autor' ? 'autor' : 'q', text);
  if (q.page > 0) sp.set('pagina', String(q.page));
  if (staff && q.hidden) sp.set('ocultos', '1');
  return `/api/mapas?${sp.toString()}`;
}

export const cardOf = (m: Pick<MapaResumo, 'id' | 'tipo' | 'nome' | 'cartao' | 'exclusivo' | 'autor'>): MapCard => ({ id: m.id, tipo: m.tipo, nome: m.nome, cartao: m.cartao, exclusivo: m.exclusivo, autor: m.autor });

/**
 * The maps the home offers online, in order: the official ones (the copies shipped with the game, each replaced
 * by the server's current version when the list came, then the ones the server has beyond them), then the maps
 * of the sessions open now that aren't among them (a community map someone is playing: its card from `known`,
 * or the session's map name until it comes).
 */
export function playableMaps(bundled: MapCard[], official: MapaResumo[] | null, sessions: { map: string; mapaNome: string }[], known: ReadonlyMap<string, MapCard>): MapCard[] {
  const fromServer = new Map((official ?? []).map((m) => [m.id, cardOf(m)]));
  // A shipped official map the server no longer lists (deleted or hidden) leaves the list once the list came.
  const out = bundled.filter((b) => !official || fromServer.has(b.id)).map((b) => fromServer.get(b.id) ?? b);
  for (const m of fromServer.values()) if (!out.some((c) => c.id === m.id)) out.push(m);
  for (const s of sessions) {
    if (out.some((c) => c.id === s.map)) continue;
    out.push(known.get(s.map) ?? { id: s.map, tipo: 'comunidade', nome: s.mapaNome, cartao: { emoji: '🗺️', cor: '#dddddd' }, exclusivo: null, autor: null });
  }
  return out;
}

/** Session maps whose card isn't known (not an official map, not asked yet): GET /api/mapas/:id once each. */
export const unknownSessionMaps = (cards: MapCard[], sessions: { map: string }[], asked: ReadonlySet<string>) =>
  [...new Set(sessions.map((s) => s.map))].filter((id) => !asked.has(id) && !cards.some((c) => c.id === id && c.tipo === 'oficial'));
