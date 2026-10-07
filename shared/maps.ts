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

/**
 * The map gags (props) the server checks on the official maps, where each is (its center): the ones album
 * stickers count. A player's hit on one is taken only on its map, from someone alive within PROP_RANGE of it;
 * every other prop (pumpkins, lamp posts, lanterns...) stays a cosmetic relay. The pieces are in the official
 * maps' data (shared/data/mapas/*.json, built by client/world/catalog/); keep both in step. A community map
 * (a copy of an official one too) has none: its checked props are refused, not relayed.
 */
export const PROPS: Record<OfficialMapId, { id: string; p: [number, number, number] }[]> = {
  rua: [{ id: 'caminhao', p: [1, 1.5, 0] }],
  jardim: [
    { id: 'dragao', p: [39, 2.8, -14] },
    { id: 'gongo', p: [-34.5, 2, -40.6] },
    { id: 'tambor:0', p: [-26.6, 1.85, -6.4] },
    { id: 'tambor:1', p: [-3.1, 1.15, 24.1] },
    { id: 'tambor:2', p: [41.6, 0.9, 22.4] },
    { id: 'tambor:3', p: [42.8, 0.9, 21.2] },
    // The market's chime, from dó (0) to sol (4): x = 27.95 + 1.025 × i (client/world/jardim/lanternas.ts).
    ...[0, 1, 2, 3, 4].map((i) => ({ id: `carrilhao:${i}`, p: [27.95 + 1.025 * i, 2.2, 43.9] as [number, number, number] })),
  ],
  halloween: [
    { id: 'sinocapela', p: [-14.5, 10.1, -29.5] },
    { id: 'buzina', p: [30, 1, -47] },
    { id: 'fantasma', p: [5, 0.5, -20.4] },
    { id: 'caldeirao', p: [-40, 0.8, -46] },
    // The shooting gallery's seven targets (client/world/halloween.ts).
    ...([[31.4, 1.0, 15.0], [32.5, 1.9, 14.7], [33.3, 1.25, 15.9], [34.6, 2.05, 15.2], [35.4, 0.95, 14.8], [36.5, 1.6, 16.2], [37.4, 1.15, 15.4]] as const).map((p, i) => ({ id: `alvo:${i}`, p: [...p] as [number, number, number] })),
  ],
  cemiterio: [],
};

/** The checked props of a map (none on a community map). */
export const checkedPropsOf = (map: MapId) => (isOfficialMap(map) ? PROPS[map] : []);

/** How far (m) a player can be from a checked prop to have hit it (a shot across most of a map). */
export const PROP_RANGE = 80;

/** Every checked prop id, of any map: one of these sent from another map is refused, not relayed. */
export const CHECKED_PROPS: ReadonlySet<string> = new Set(Object.values(PROPS).flatMap((list) => list.map((s) => s.id)));
