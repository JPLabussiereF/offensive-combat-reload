// The Galpão's rules as pure data (no DOM, no WebGL): the stations in menu order, which home tab each one shows,
// what a key does where, and whether this browser gets the 3D home at all. client/ui/galpao/galpao.ts drives the
// scene with them; client/tests/galpaoRules.test.ts checks them.

/** The seven stations of the warehouse, each a prop holding one of the home's tabs. */
export type StationId = 'play' | 'maps' | 'arsenal' | 'album' | 'profile' | 'settings' | 'admin';
/** Where the camera is: a station, the overview with the menu ('home') or the opening flight ('intro'). */
export type CamStation = StationId | 'home' | 'intro';
/** The home's tabs (client/ui/home.ts). */
export type HomeTab = 'play' | 'maps' | 'arsenal' | 'album' | 'profile' | 'settings' | 'management' | 'auth';

/** Menu order: the number keys 1 to 7 and Q / E follow it. */
export const STATION_ORDER: readonly StationId[] = ['play', 'maps', 'arsenal', 'album', 'profile', 'settings', 'admin'];

/** The stations a player sees: Gerenciamento only for the staff (the server checks every request again). */
export const stationOrder = (staff: boolean): StationId[] => STATION_ORDER.filter((s) => s !== 'admin' || staff);

/** The station `d` steps away in the menu's order, wrapping around (null away from a station). */
export function hop(order: readonly StationId[], from: CamStation, d: number): StationId | null {
  const i = order.indexOf(from as StationId);
  return i < 0 ? null : order[(i + d + order.length * Math.abs(d)) % order.length];
}

/** The tab a station shows (Gerenciamento is the `management` tab). */
export const tabOf = (s: StationId): HomeTab => (s === 'admin' ? 'management' : s);

/** The station a tab lives on: the name and character forms (`auth`) open on the profile's locker. */
export const stationOf = (tab: HomeTab): StationId => (tab === 'management' ? 'admin' : tab === 'auth' ? 'profile' : tab);

export type KeyAction = { go: StationId | 'home' } | { hop: -1 | 1 } | { quickPlay: true } | { closeCard: true };

/**
 * What a key does: on the overview 1-7 fly to a station and Enter is the quick join; at a station Q / E (or the
 * arrows) move to the previous / next one and Esc goes back (first closing the Arsenal's weapon card). Nothing
 * during the opening flight.
 */
export function keyAction(key: string, at: CamStation, arrived: boolean, order: readonly StationId[], cardOpen: boolean): KeyAction | null {
  if (at === 'intro') return null;
  if (key === 'Escape') {
    if (at === 'arsenal' && cardOpen) return { closeCard: true };
    return at === 'home' ? null : { go: 'home' };
  }
  if (at === 'home') {
    if (!arrived) return null;
    const n = Number.parseInt(key, 10);
    if (n >= 1 && n <= order.length) return { go: order[n - 1] };
    return key === 'Enter' ? { quickPlay: true } : null;
  }
  if (key === 'q' || key === 'Q' || key === 'ArrowLeft') return { hop: -1 };
  if (key === 'e' || key === 'E' || key === 'ArrowRight') return { hop: 1 };
  return null;
}

/**
 * Whether the home is the 3D warehouse: not on a CPU renderer (it would crawl; the classic tabbed home stays),
 * and not when the player turned it off (`oc.galpao` = 'off' in localStorage).
 */
export const galpaoWanted = (software: boolean, pref: string | null): boolean => !software && pref !== 'off';

/** The lighter build (smaller textures, no MSAA, lower pixel ratio) on touch screens and small windows. */
export const lightScene = (coarsePointer: boolean, width: number): boolean => coarsePointer || width < 760;
