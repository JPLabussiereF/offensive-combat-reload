// Maps a session, the training range or a bots match can be played on. Since PF-6 a map is data
// (shared/mapData.ts): the official ones ship as shared/data/mapas/<id>.json (the client builds them offline
// from there), and every map, official or the community's, lives on the server with its saved versions
// (server/maps.ts). A session carries its map's id and version; the client downloads that version's data
// (GET /api/mapas/:id/versoes/:v) before building it. Where the collectibles, the witch, the rats and the fish
// are, and the zumbi layout, come from the map's data (`objetos`, `zumbi`).
//
// A map can be made for one mode only (`exclusivo` in its data): the zumbi mode's walled cemetery is played in
// that mode and nowhere else, and that mode is played only on maps made for it (modeAllowsMap in
// shared/modes.ts).

/** A map's id: one of OFFICIAL_MAPS, or a community map's (lowercase letters, digits, "_" and "-"). */
export type MapId = string;

/** The official maps, in the order the pickers show them. */
export const OFFICIAL_MAPS = ['rua', 'jardim', 'halloween', 'cemiterio'] as const;
export type OfficialMapId = (typeof OFFICIAL_MAPS)[number];

export const DEFAULT_MAP: MapId = 'rua';

/** Whether a value has the shape of a map id (whether that map exists is the server's to say). */
export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && /^[a-z0-9_-]{1,40}$/.test(v);

export const isOfficialMap = (v: unknown): v is OfficialMapId => OFFICIAL_MAPS.includes(v as OfficialMapId);

/** What a collectible does: the cherry (CHERRY, extra max health for a while) or the biscuit (BISCUIT, full health). */
export type PickupKind = 'cereja' | 'biscoito';
