// Maps a session, the training range or a bots match can be played on. The client builds the map from its
// id; the server only carries the id with each session so everyone in it loads the same one.
export const MAPS = {
  rua: { nome: 'Rua dos Vizinhos' },
  jardim: { nome: 'Jardim do Dragão' },
  halloween: { nome: 'Vila Assombrada' },
} as const;

export type MapId = keyof typeof MAPS;

export const MAP_IDS = Object.keys(MAPS) as MapId[];

export const DEFAULT_MAP: MapId = 'rua';

/** What a collectible does: the cherry (CHERRY, extra max health for a while) or the biscuit (BISCUIT, full health). */
export type PickupKind = 'cereja' | 'biscoito';

/**
 * Collectibles of each map (feet position): the server needs them to validate a pickup, the client builds
 * their look. Ids follow the prop id format (lowercase letters).
 */
export const PICKUPS: Record<MapId, { id: string; kind: PickupKind; p: [number, number, number] }[]> = {
  rua: [],
  jardim: [{ id: 'cereja', kind: 'cereja', p: [0, 0.36, 2.1] }],
  halloween: [{ id: 'biscoito', kind: 'biscoito', p: [-44.4, 0, 9] }],
};

/** Where each map's witch stands (feet), whose potions (POTION) can be drunk near her; null: no witch. */
export const WITCHES: Record<MapId, [number, number, number] | null> = {
  rua: null,
  jardim: null,
  halloween: [-41.2, 0, -46],
};

/** The giant rats of each map (RAT): where each stands (feet). The server checks the killer is near it. */
export const RATS: Record<MapId, { id: string; p: [number, number, number] }[]> = {
  rua: [],
  jardim: [],
  halloween: [{ id: 'rato', p: [7.5, -4, 47.5] }],
};

/**
 * The fish of each map (KOI): each swims a loop (`loop`: center x, z and radius; an ellipse 0.7 as deep
 * along Z) at depth `y`, in a pond named by `pond`. The server tracks which are alive and checks shooters
 * against the loop; the client builds the fish.
 */
export const FISH: Record<MapId, { id: string; pond: string; loop: [number, number, number]; y: number }[]> = {
  rua: [],
  jardim: [
    ...([[-12, -40.6, 1.2], [-8, -35.6, 1.4], [-11.5, -35.4, 1.0], [-7, -41, 0.9]] as const).map((loop, i) => ({ id: `koi:${i}`, pond: 'bonsai', loop: [...loop] as [number, number, number], y: -0.38 })),
    ...([[25.5, -33, 2.0], [39.5, -22, 2.2], [27, -12.5, 2.4], [38.5, -36, 1.6], [30.5, -31, 1.4]] as const).map((loop, i) => ({ id: `koi:${4 + i}`, pond: 'lago', loop: [...loop] as [number, number, number], y: -0.4 })),
  ],
  halloween: [],
};

export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && Object.hasOwn(MAPS, v);
