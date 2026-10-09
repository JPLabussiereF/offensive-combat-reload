// The Play tab's rules without a screen (PF-32; client/tests/playRules.test.ts): which map the online choice
// stands for, the sessions and players of a map, the map the orange button (and the warehouse's quick join) sends
// in 'play', the old map filter turned into the one map chosen, and what the orange button says. client/ui/home.ts
// draws the tab with them.
import { modeAllowsMap, type GameModeId } from '@shared/modes';
import { t, type StringKey } from './strings';

/** Where the player plays: online, against bots, or the training range. */
export type PlayWhere = 'online' | 'bots' | 'treino';

/** The fields of a session these rules read (shared/protocol.ts SessionInfo). */
export interface SessionLike {
  map: string;
  mode: GameModeId;
  players: number;
  max: number;
}

/** A map offered online: its id, and the one mode it is made for (null: every mode that has no maps of its own). */
export interface MapLike {
  id: string;
  exclusivo: GameModeId | null;
}

/**
 * The map the online choice stands for in game mode `game`: the mode's only map (zumbi and its cemetery), else the
 * chosen map if it is offered now (`maps`: the maps offered online), else null ("Qualquer mapa"). A chosen map that
 * left the list (a community map nobody plays anymore) is not forgotten: it comes back chosen when it returns.
 */
export function effectiveOnlineMap(pick: string | null, maps: readonly MapLike[], game: GameModeId): string | null {
  const offered = maps.filter((c) => modeAllowsMap(game, c.exclusivo));
  if (offered.length === 1) return offered[0].id;
  return pick !== null && offered.some((c) => c.id === pick) ? pick : null;
}

/** The sessions of a game mode on a map (null: on every map), in the server's order. */
export const sessionsFor = <S extends SessionLike>(sessions: readonly S[], game: GameModeId, map: string | null): S[] =>
  sessions.filter((s) => s.mode === game && (map === null || s.map === map));

/** How many people play a game mode on a map now (null: on every map). */
export const playersOn = (sessions: readonly SessionLike[], game: GameModeId, map: string | null): number =>
  sessionsFor(sessions, game, map).reduce((n, s) => n + s.players, 0);

/**
 * The map the online button plays ('play' {map, mode}; the server picks or opens the room on it): the chosen map;
 * with "Qualquer mapa", the map of the fullest session of the mode that isn't full, else one of the official maps
 * of the mode at random (`officialIds`). Null only when there is nothing to play.
 */
export function quickTarget(sessions: readonly SessionLike[], game: GameModeId, map: string | null, officialIds: readonly string[], rnd: () => number = Math.random): string | null {
  if (map !== null) return map;
  const best = sessionsFor(sessions, game, null)
    .filter((s) => s.players < s.max)
    .sort((a, b) => b.players - a.players)[0];
  if (best) return best.map;
  return officialIds.length ? officialIds[Math.min(officialIds.length - 1, Math.floor(rnd() * officialIds.length))] : null;
}

/**
 * The online map kept in `oc.bots` (null: "Qualquer mapa"). Saved before PF-32, the online maps were a filter: the
 * maps taken out of it (`fora`), or before that the ticked ones (`filtro`). If exactly one open map was left ticked,
 * that map is the choice; with several or none, "Qualquer mapa".
 */
export function migrateOnlineMap(saved: Record<string, unknown>, pvpMaps: readonly string[]): string | null {
  if (typeof saved.onlineMap === 'string' || saved.onlineMap === null) return saved.onlineMap as string | null;
  const strs = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null);
  const fora = strs(saved.fora);
  const filtro = strs(saved.filtro);
  const ticked = fora ? pvpMaps.filter((m) => !fora.includes(m)) : filtro ? pvpMaps.filter((m) => filtro.includes(m)) : [...pvpMaps];
  return ticked.length === 1 ? ticked[0] : null;
}

/** A text to show: a key of strings.ts and its parameters (a parameter may be a text of its own). */
export interface Txt {
  key: StringKey;
  params?: Record<string, string | number | Txt>;
  upper?: boolean;
}

/** The text of a Txt, in the current language. */
export function say(x: Txt): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(x.params ?? {})) params[k] = typeof v === 'object' ? say(v) : v;
  const s = t(x.key, params);
  return x.upper ? s.toUpperCase() : s;
}

/**
 * What the orange button is about to do. Names come already in the player's language (`mode`: the match type's,
 * `map`: the map's, or "qualquer mapa"). Online, `players` is how many play there now (null: the list hasn't come).
 */
export type CtaState =
  | { where: 'online'; mode: string; map: string; players: number | null }
  | { where: 'bots'; mode: string; map: string; solo: boolean; count: number; skill: string }
  | { where: 'treino'; map: string };

/**
 * The orange button's title and line, describing the result without promising what the server doesn't do (it
 * puts the player in the first room with space on the map, not the fullest): "Mata-mata · Rua dos Vizinhos ·
 * 9 jogando", "· abre uma sessão nova", "Mata-mata · Rua dos Vizinhos · Normal", "Bonecos parados · Rua dos Vizinhos".
 */
export function ctaText(s: CtaState): { title: Txt; detail: Txt } {
  if (s.where === 'online') {
    const detail: Txt =
      s.players === null
        ? { key: 'gpCtaLine', params: { mode: s.mode, map: s.map } }
        : { key: 'playCtaOnline', params: { mode: s.mode, map: s.map, players: s.players > 0 ? { key: 'playPlayers', params: { n: s.players } } : { key: 'playCtaNew' } } };
    return { title: { key: 'playOnline' }, detail };
  }
  if (s.where === 'bots') {
    if (s.solo) return { title: { key: 'zSolo' }, detail: { key: 'gpCtaLine', params: { mode: s.mode, map: s.map } } };
    return { title: { key: 'versusBots', params: { n: s.count } }, detail: { key: 'playCtaBots', params: { mode: s.mode, map: s.map, skill: s.skill } } };
  }
  return { title: { key: 'modeRange', upper: true }, detail: { key: 'gpCtaLine', params: { mode: { key: 'gpRangeTargets' }, map: s.map } } };
}
