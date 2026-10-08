// The Galpão's rules as pure data (no DOM, no WebGL): the stations in menu order, which home tab each one shows,
// what a key does where, and whether this browser gets the 3D home at all. client/ui/galpao/galpao.ts drives the
// scene with them; client/tests/galpaoRules.test.ts checks them.

/**
 * The stations of the warehouse, each a prop holding one of the home's tabs. 07 · PETS (PF-29) is the front door
 * with its yard: the pets "live outside", one comes in at a time.
 */
export type StationId = 'play' | 'maps' | 'arsenal' | 'album' | 'profile' | 'settings' | 'pets' | 'admin';
/** Where the camera is: a station, the overview with the menu ('home') or the opening flight ('intro'). */
export type CamStation = StationId | 'home' | 'intro';
/** The home's tabs (client/ui/home.ts). */
export type HomeTab = 'play' | 'maps' | 'arsenal' | 'album' | 'profile' | 'settings' | 'pets' | 'management' | 'auth';

/** Menu order: the number keys and Q / E follow it (1 to 6 as before the pets; 7 the pets, 8 Gerenciamento). */
export const STATION_ORDER: readonly StationId[] = ['play', 'maps', 'arsenal', 'album', 'profile', 'settings', 'pets', 'admin'];

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

export type V3 = [number, number, number];

/**
 * Where the pet taken along shows on the overview (PF-29, the PF-36 review), by the window's size and the pet's
 * size: a small pet (and the Bruxinha) sits on the hero table's top, by the magazine on a computer and at its left
 * end on a phone lying down (the menu covers the right there); a dog stands behind the table with its front paws
 * on the top. In portrait, none (the menu takes the screen). The scene still checks the projected box against the
 * menu and keeps 0.25 m from the character.
 */
export function petSpot(width: number, height: number, porte: 'pequeno' | 'cachorro'): { at: V3; pose: 'sit' | 'table' } | null {
  if (width < height) return null;
  if (porte === 'cachorro') return { at: [0.42, 0, -0.05], pose: 'table' };
  const compact = width < 1000 || height < 600;
  return { at: compact ? [-0.9, 0.92, 0.45] : [0.22, 0.92, 0.3], pose: 'sit' };
}

/**
 * How long a flight between two stations lasts (s), by how far the camera turns (degrees): a second up to 60°,
 * then a little longer for a wider turn (1.2 s at 120°, 1.4 s at 180°), so a big turn never whips. With reduced
 * motion there's no flight: a cut through a short dip to black (0.2 s).
 */
export function flightDuration(angleDeg: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.2;
  const a = Math.min(180, Math.max(0, angleDeg));
  return 1 + Math.max(0, a - 60) / 300;
}
