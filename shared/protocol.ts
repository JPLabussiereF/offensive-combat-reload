// Network protocol shared by client and server (section 14). JSON over WebSocket for this first online
// version; the message shapes are kept small so a binary encoding can replace JSON later without changing
// the game code.
import type { HitRegion } from './weapons';
import { HUMILIATION, type PotionKind } from './constants';
import type { ArsenalChoice, GunId, ProgWeapon, WeaponId } from './progression';
import type { Loadout } from './arsenal';
import type { Appearance } from './appearance';
import type { MapId } from './maps';
import type { GameModeId } from './modes';
import type { LadderPos } from './gunGame';
import type { BossId, KillHow, ZFlaw, ZItems, ZNet } from './zombies';

export const NET = {
  /** Server simulation/broadcast rate. */
  tickRate: 20,
  /** Client state upload rate. */
  stateRate: 20,
  /** Remote players are drawn this far in the past, interpolating between two snapshots. */
  interpDelayMs: 100,
  maxPlayers: 10,
  nameMax: 16,
  sessionNameMax: 24,
  /** Longest chat message (characters). */
  chatMax: 120,
  /** Chat flood limit: a burst of this many messages, then one every chatEveryMs. */
  chatBurst: 4,
  chatEveryMs: 1500,
  /** Free-for-all respawn delay (long enough to watch your own humiliation). */
  respawnDelay: 5,
  corpseWindow: HUMILIATION.window,
  port: 8787,
  path: '/ws',
} as const;

export type Vec3 = [number, number, number];

/** Bit flags describing what a player is doing, for remote animation. */
export const FLAG = {
  crouch: 1,
  sprint: 2,
  ads: 4,
  reload: 8,
  dance: 16,
  cook: 32,
  grounded: 64,
  knife: 128,
  slide: 256,
  /** Holding the secondary gun (the primary is on the back). */
  secondary: 512,
} as const;

export interface NetState {
  /** Feet position. */
  p: Vec3;
  yaw: number;
  pitch: number;
  f: number;
}

/**
 * A session: open while someone plays in it (sessions open on demand and close when empty). It plays one saved
 * version of its map: the client downloads that version's data (GET /api/mapas/:map/versoes/:versao).
 */
export interface SessionInfo {
  id: string;
  name: string;
  map: MapId;
  /** The map's version this session plays (it keeps it to the end, even when the map is saved again). */
  versao: number;
  /** The map's name in that version. */
  mapaNome: string;
  /** The game mode it plays (shared/modes.ts). */
  mode: GameModeId;
  players: number;
  max: number;
}

/** Character body chosen on the home screen: masculino / feminino. */
export type Sex = 'm' | 'f';
export const asSex = (v: unknown): Sex => (v === 'f' ? 'f' : 'm');

export interface PlayerInfo {
  id: number;
  /** Name#1234 of the player's account. */
  name: string;
  /** Account level (shown on the scoreboard). */
  nivel: number;
  sex: Sex;
  /** Weapons in hand and their upgrades (models in their hands, names in the kill feed). */
  lo?: Loadout;
  /** How the character looks (sent when the player appears: 'joined' and 'playerJoined'). */
  ap?: Appearance;
  kills: number;
  deaths: number;
  score: number;
  humiliations: number;
  alive: boolean;
  ping: number;
  /** Corrida armada: the player's step on the weapon ladder and the kills made on it. */
  ladder?: LadderPos;
  /** Zumbi: the match's money, zombie kills, times downed and revives given, whether they're standing, what they carry. */
  zumbi?: ZombiePlayer;
  /** The album sticker the player shows (its id and the targets it reached) and the title they wear (a page id). */
  fig?: [id: string, nivel: number];
  tit?: string;
}

/** A player in a zumbi match. */
export interface ZombiePlayer {
  money: number;
  kills: number;
  downs: number;
  revives: number;
  state: 'up' | 'down' | 'dead';
  items: ZItems;
}

/** Where a zumbi match is: no one there yet, the countdown to the first wave, a wave, the break after it, over. */
export type ZPhase = 'waiting' | 'countdown' | 'wave' | 'break' | 'over';

/** The Mystery Coffin (always on its spot): waiting, spinning (`by` paid), offering `item` to `by` until `until`. */
export type BoxState = 'idle' | 'rolling' | 'offer';

export interface BoxInfo {
  state: BoxState;
  by: number | null;
  item: string | null;
  /** The offered item is a damaged copy, and how (null: intact, or nothing offered). */
  flaw: ZFlaw | null;
  /** Server time the current state ends (0: it doesn't). */
  until: number;
}

/**
 * A barricade in a gap of the cemetery wall (indexed like ZombieMapData.barricadas): whether its frame was
 * built, how many boards stand and the health of the top one. Any board left closes the gap.
 */
export interface ZBarricade {
  built: boolean;
  boards: number;
  hp: number;
}

/** A zumbi match as it is right now (sent when joining). */
export interface ZombieSync {
  phase: ZPhase;
  wave: number;
  /** Server time the countdown, break or summary ends (0 during a wave). */
  until: number;
  /** Zombies of the wave (for "N left"). */
  total: number;
  box: BoxInfo;
  /** Players down, and when each bleeds out (server time). */
  down: [id: number, until: number][];
  /** Every barricade, in the map's order. */
  bars: ZBarricade[];
  /** The chapel's totem is on (the no-break vigil, for the rest of the match). */
  totem?: boolean;
}

/**
 * A boss move or a zombie effect, for the telegraphs everyone sees (the server applies the damage at t1).
 * 'rise': a zombie is about to come out of the ground at `at` (it appears at t1).
 */
export type ZFx = 'slam' | 'summon' | 'scream' | 'blink' | 'charge' | 'pound' | 'spit' | 'boom' | 'intro' | 'rise';

/** One line of the end-of-match summary. */
export interface ZSummaryRow {
  id: number;
  name: string;
  kills: number;
  headshots: number;
  earned: number;
  downs: number;
  revives: number;
  xp: number;
}

/** `zombie`: bled out after going down in the zumbi mode. */
export type KillKind = 'gun' | 'head' | 'groin' | 'knife' | 'grenade' | 'fall' | 'void' | 'explosion' | 'dog' | 'zombie' | 'thorns';
export type AwardLabel = 'kill' | 'headshot' | 'groin' | 'knife' | 'backstab' | 'longShot' | 'humiliation';
export interface Award {
  label: AwardLabel;
  value: number;
}

export interface CorpseInfo {
  id: number;
  victim: number;
  name: string;
  sex: Sex;
  /** The body looks like the player did. */
  ap?: Appearance;
  p: Vec3;
  yaw: number;
  /** Server time (ms) when the humiliation window closes. */
  until: number;
}

// --- Client → server --------------------------------------------------------------------------------
export type ClientMsg =
  /** Identity comes from the ticket the connection was opened with; name and body come from the account. */
  | { t: 'hello' }
  | { t: 'list' }
  /**
   * Plays a map in a mode: joins a session of the map's current version with room, or opens one. Refused
   * ('error') when the map isn't there (hidden, deleted) or the mode isn't played on it.
   */
  | { t: 'play'; map: MapId; mode: GameModeId }
  /**
   * Opens a new session with a name. A map that isn't there, or where the mode isn't played, falls back to the
   * mode's first official map; an unknown mode to mata-mata.
   */
  | { t: 'create'; name: string; map?: MapId; mode?: GameModeId }
  | { t: 'join'; session: string }
  | { t: 'leave' }
  | { t: 'state'; s: NetState }
  | { t: 'shot'; o: Vec3; e: Vec3 }
  /**
   * w: the gun that fired (one of the loadout's, held now or switched from a moment ago). keep: damage fraction
   * left after the bullet went through wood/glass (absent = clean hit).
   */
  | { t: 'hit'; target: number; region: HitRegion; dist: number; w: GunId; keep?: number }
  | { t: 'swing' }
  | { t: 'stab'; target: number; behind: boolean }
  /** impact: explodes on its first contact instead of by fuse (fuse is then the flight time limit). */
  | { t: 'grenade'; id: number; p: Vec3; v: Vec3; fuse: number; impact?: boolean; mine?: boolean; duck?: boolean }
  /**
   * The Arsenal choice (secondary, optional upgrades on); the server drops upgrades the account hasn't unlocked.
   * Sent from the lobby, before joining: modes with a locked loadout (all the online ones) ignore it mid-match.
   */
  | { t: 'loadout'; lo: ArsenalChoice }
  /** `zs`: zombies the blast reached (zumbi), with the distance from the blast to each one. */
  | { t: 'boom'; id: number; p: Vec3; hits: { target: number; dist: number }[]; zs?: { z: number; dist: number }[] }
  | { t: 'selfDamage'; amount: number; cause: 'fall' | 'void' | 'dog' }
  | { t: 'taunt'; corpse: number }
  | { t: 'tauntEnd'; corpse: number; done: boolean }
  | { t: 'respawn'; p: Vec3; yaw: number }
  /** An environmental gag was triggered (e.g. "hidrante:1"); relayed so everyone sees it. */
  | { t: 'prop'; id: string }
  /** Feet on a collectible of the map (its data's objetos): the server checks it's there and close, then applies it. */
  | { t: 'pickup'; id: string }
  /** Shot or stabbed one of the map's fish (objetos.peixes): the server checks it's alive and the shooter is near. */
  | { t: 'fish'; id: string }
  /** Brought down one of the map's giant rats (objetos.ratos): the server checks it's alive and the killer is near. */
  | { t: 'rat'; id: string }
  /** Drinks the witch's potion (objetos.bruxa): the server checks the player is near her and draws the effect. */
  | { t: 'potion' }
  /** A line in the session's chat (sanitized and rate-limited by the server). */
  | { t: 'chat'; text: string }
  /** `rtt` = the client's last measured round trip (ms), shown on the scoreboard. */
  | { t: 'ping'; c: number; rtt?: number }
  /** Zumbi: one of our bullets hit zombie `z` (same checks as 'hit', against the zombie's server position). */
  | { t: 'zhit'; z: number; region: HitRegion; dist: number; w: GunId; keep?: number }
  /** Zumbi: our knife hit zombie `z`. */
  | { t: 'zstab'; z: number }
  /** Zumbi: E at the Mystery Coffin: pays and spins it, or takes the weapon it's offering us. */
  | { t: 'box' }
  /** Zumbi: E at the chapel's totem: pays and turns on the no-break vigil for the rest of the match. */
  | { t: 'totem' }
  /** Zumbi: holding E over a teammate who's down (`on` false: let go). */
  | { t: 'revive'; id: number; on: boolean }
  /** Zumbi: holding E at gap `i` of the wall: building its barricade (paid) or nailing boards back (`on` false: let go). */
  | { t: 'barricade'; i: number; on: boolean };

/** A fish of the map: dead until `ready` (server time; 0 = alive), golden when it's (back) there. */
export interface FishState {
  id: string;
  ready: number;
  golden: boolean;
}

// --- Server → client --------------------------------------------------------------------------------
export type ServerMsg =
  | { t: 'welcome'; id: number; name: string; sessions: SessionInfo[] }
  | { t: 'sessions'; list: SessionInfo[] }
  /**
   * `session` says the map and its version (download its data before building it). `pickups`: the map's
   * collectibles still growing back (server time when each is ready again). `fish`: the
   * fish that aren't a plain live koi (dead until `ready`, and/or golden once back). `rats`: the giant rats
   * still dead (back at `ready`).
   */
  | { t: 'joined'; session: SessionInfo; you: number; players: PlayerInfo[]; corpses: CorpseInfo[]; time: number; pickups?: { id: string; ready: number }[]; fish?: FishState[]; rats?: { id: string; ready: number }[]; zumbi?: ZombieSync }
  | { t: 'error'; message: string }
  | { t: 'playerJoined'; player: PlayerInfo }
  | { t: 'playerLeft'; id: number }
  | { t: 'snap'; time: number; players: { id: number; s: NetState; h: number; alive: boolean }[] }
  | { t: 'shot'; id: number; o: Vec3; e: Vec3 }
  | { t: 'swing'; id: number }
  | { t: 'damage'; target: number; attacker: number | null; amount: number; health: number; from: Vec3 | null }
  /** arma: the weapon that got the kill (and its points), when it was one. */
  | { t: 'kill'; victim: number; attacker: number | null; kind: KillKind; /** The gun of a shot (an old rifle too), 'faca' for a stab, 'granada'. */ arma?: WeaponId; awards: Award[]; corpse: CorpseInfo; players: PlayerInfo[] }
  | { t: 'spawned'; id: number; p: Vec3; yaw: number }
  | { t: 'grenade'; owner: number; id: number; p: Vec3; v: Vec3; fuse: number; impact?: boolean; mine?: boolean; duck?: boolean }
  | { t: 'boom'; owner: number; id: number; p: Vec3 }
  | { t: 'taunt'; id: number; corpse: number }
  | { t: 'tauntEnd'; id: number; corpse: number; done: boolean; awards: Award[]; players: PlayerInfo[] }
  | { t: 'scores'; players: PlayerInfo[] }
  /**
   * A player's loadout changed mid-match (corrida armada: another step of the ladder). To everyone, the player
   * too: their weapons in hand are the ones the server validates.
   */
  | { t: 'playerLoadout'; id: number; lo: Loadout }
  /** The round is over (corrida armada: `winner` got the last kill); the next one starts at `restartAt` (server time). */
  | { t: 'roundEnd'; mode: GameModeId; winner: number | null; name: string; restartAt: number }
  /** A new round: everyone is dead and respawns now, with the scores back to zero. */
  | { t: 'roundStart'; players: PlayerInfo[] }
  | { t: 'prop'; id: string; by: number }
  /** `by` took a collectible: it's gone until `ready` (server time); a cherry's boost lasts until `until` (0 for the others). */
  | { t: 'pickup'; id: string; by: number; ready: number; until: number }
  /**
   * `by` killed a fish (`prize`: what it was). It's back at `ready` (server time), golden or not; a golden
   * carp's aim boost lasts until `until` (or `by`'s death).
   */
  | ({ t: 'fish'; by: number; prize: 'koi' | 'dourada'; until?: number } & FishState)
  /** `by` brought down a giant rat and got its humanity; the rat is back at `ready` (server time). */
  | { t: 'rat'; id: string; by: number; ready: number }
  /** `by` drank the witch's potion: `kind` (POTION) until `until` (server time; 0 for the duck: until death). */
  | { t: 'potion'; by: number; kind: PotionKind; until: number }
  /** A chat line, to everyone in the session (the sender too: what they see is what the server accepted). */
  | { t: 'chat'; id: number; name: string; text: string }
  /** The player's chat line was dropped: their account is muted, or they're sending too fast. */
  | { t: 'chatRefused'; reason: 'muted' | 'slow' }
  | { t: 'pong'; c: number; s: number }
  /** Zumbi: every zombie, 20 times a second; `left` of the wave; the boss's id, health and max health while there's one. */
  | { t: 'zsnap'; time: number; z: ZNet[]; left: number; boss?: [id: number, hp: number, max: number] }
  /** Zumbi: the match moved on (a countdown, a wave, a break, the end); `boss` on a boss wave. */
  | { t: 'zwave'; phase: ZPhase; wave: number; until: number; total: number; boss?: BossId }
  /** Zumbi: a zombie died (`by` null: not by a player); the killer's `award` and new `money`. */
  | { t: 'zdie'; id: number; by: number | null; how: KillHow; award?: number; money?: number }
  /** Zumbi: a boss move or a zombie effect (telegraph from t0, effect at t1, server times); `hit`: the players it got. */
  | { t: 'zfx'; fx: ZFx; id?: number; at: Vec3; to?: Vec3; r?: number; t0: number; t1: number; hit?: number[] }
  /** Zumbi: something a zombie move did to a player: a push (`v`, m/s) and/or a slow (`slow`: speed factor until `until`). */
  | { t: 'zhitfx'; id: number; fx: ZFx; v?: Vec3; slow?: number; until?: number }
  /** Zumbi: the Mystery Coffin changed; `money`: the buyer's after paying. */
  | ({ t: 'zbox'; money?: number } & BoxInfo)
  /**
   * Zumbi: barricade `i` changed: built ('build', `money` the builder's after paying), a board nailed back
   * ('nail', `award` and `money` the repairer's), a blow on the boards ('hit'), the last board gone ('break'), or
   * taken down for a new match ('reset').
   */
  | ({ t: 'zbar'; i: number; fx: 'build' | 'nail' | 'hit' | 'break' | 'reset'; by?: number; award?: number; money?: number } & ZBarricade)
  /** Zumbi: `by` is working on barricade `i` (the next board, or the frame, at `until`; 0: stopped). */
  | { t: 'zbarwork'; i: number; by: number; until: number }
  /** Zumbi: players' money changed (assists, the wave bonus, a boss's reward). */
  | { t: 'zmoney'; m: [id: number, money: number][]; why: 'assist' | 'wave' | 'boss' }
  /** The chapel's totem: `by` turned on the no-break vigil (`money`: theirs after paying); off at a new match (`by` null). */
  | { t: 'ztotem'; on: boolean; by: number | null; money?: number }
  /** A player climbed the thorns (the wall's bars, the hedge) and bleeds until `until` (server ms; 0: stopped). */
  | { t: 'zbleed'; id: number; until: number }
  /** Zumbi: a player went down; they bleed out at `until` unless someone revives them. */
  | { t: 'zdown'; id: number; until: number }
  /** Zumbi: `by` is reviving `id` (done at `until`; 0: they let go). */
  | { t: 'zrevive'; id: number; by: number; until: number }
  /** Zumbi: a player is back up (`by` null: the wave ended); `money`: the reviver's. */
  | { t: 'zup'; id: number; by: number | null; money?: number }
  /** Zumbi: the match is over (won: the last wave survived); a new one starts at `restartAt`. */
  | { t: 'zend'; won: boolean; wave: number; secs: number; players: ZSummaryRow[]; restartAt: number }
  /** The account's progress changed (points only come from the server online); `escolha` is the Arsenal choice it kept. */
  | { t: 'progresso'; armas: Record<ProgWeapon, { xp: number; nivel: number }>; escolha: ArsenalChoice; conta: { xp: number; nivel: number }; subiu?: { tipo: ProgWeapon | 'conta'; nivel: number } }
  /** A sticker of the album went up to finish `nivel` (1 common .. 4 gold); only to its owner. */
  | { t: 'figurinha'; id: string; nivel: number };

/** WebSocket close codes sent by the server. */
export const CLOSE = {
  /** Session revoked: logout, password reset, ban or account deletion. */
  revoked: 4001,
  /** The same account connected somewhere else. */
  replaced: 4002,
} as const;

export function sanitizeName(raw: unknown, max: number): string {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return s;
}

/**
 * A chat line as everyone will see it: no control characters, no bidirectional overrides (they could flip a
 * line to fake another player's name), single spaces, NET.chatMax characters. Shown with textContent, never
 * as HTML, so "<3" stays.
 */
export function sanitizeChat(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw
    .slice(0, NET.chatMax * 4)
    // Line breaks and tabs first, so they become spaces instead of gluing words together.
    .replace(/\s+/g, ' ')
    // Zero-width joiners stay: emoji sequences (👨‍👩‍👧) are made with them.
    .replace(/[\u0000-\u001f\u007f-\u009f​‎‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  // By code points, so an emoji at the end isn't cut in half.
  return Array.from(s).slice(0, NET.chatMax).join('').trim();
}
