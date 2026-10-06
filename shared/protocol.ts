// Network protocol shared by client and server (section 14). JSON over WebSocket for this first online
// version; the message shapes are kept small so a binary encoding can replace JSON later without changing
// the game code.
import type { HitRegion } from './weapons';
import { HUMILIATION, type PotionKind } from './constants';
import type { ArsenalChoice, GunId, ProgWeapon } from './progression';
import type { Loadout } from './arsenal';
import type { Appearance } from './appearance';
import type { MapId } from './maps';
import type { GameModeId } from './modes';
import type { LadderPos } from './gunGame';

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

export interface SessionInfo {
  id: string;
  name: string;
  map: MapId;
  /** The game mode it plays (shared/modes.ts). */
  mode: GameModeId;
  players: number;
  max: number;
  permanent: boolean;
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
}

export type KillKind = 'gun' | 'head' | 'groin' | 'knife' | 'grenade' | 'fall' | 'void' | 'explosion' | 'dog';
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
  /** An unknown map falls back to the default one, an unknown mode to mata-mata. */
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
  | { t: 'boom'; id: number; p: Vec3; hits: { target: number; dist: number }[] }
  | { t: 'selfDamage'; amount: number; cause: 'fall' | 'void' | 'dog' }
  | { t: 'taunt'; corpse: number }
  | { t: 'tauntEnd'; corpse: number; done: boolean }
  | { t: 'respawn'; p: Vec3; yaw: number }
  /** An environmental gag was triggered (e.g. "hidrante:1"); relayed so everyone sees it. */
  | { t: 'prop'; id: string }
  /** Feet on a collectible of the map (PICKUPS): the server checks it's there and close, then applies it. */
  | { t: 'pickup'; id: string }
  /** Shot or stabbed one of the map's fish (FISH): the server checks it's alive and the shooter is near. */
  | { t: 'fish'; id: string }
  /** Brought down one of the map's giant rats (RATS): the server checks it's alive and the killer is near. */
  | { t: 'rat'; id: string }
  /** Drinks the witch's potion (WITCHES): the server checks the player is near her and draws the effect. */
  | { t: 'potion' }
  /** A line in the session's chat (sanitized and rate-limited by the server). */
  | { t: 'chat'; text: string }
  /** `rtt` = the client's last measured round trip (ms), shown on the scoreboard. */
  | { t: 'ping'; c: number; rtt?: number };

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
   * `pickups`: the map's collectibles still growing back (server time when each is ready again). `fish`: the
   * fish that aren't a plain live koi (dead until `ready`, and/or golden once back). `rats`: the giant rats
   * still dead (back at `ready`).
   */
  | { t: 'joined'; session: SessionInfo; you: number; players: PlayerInfo[]; corpses: CorpseInfo[]; time: number; pickups?: { id: string; ready: number }[]; fish?: FishState[]; rats?: { id: string; ready: number }[] }
  | { t: 'error'; message: string }
  | { t: 'playerJoined'; player: PlayerInfo }
  | { t: 'playerLeft'; id: number }
  | { t: 'snap'; time: number; players: { id: number; s: NetState; h: number; alive: boolean }[] }
  | { t: 'shot'; id: number; o: Vec3; e: Vec3 }
  | { t: 'swing'; id: number }
  | { t: 'damage'; target: number; attacker: number | null; amount: number; health: number; from: Vec3 | null }
  /** arma: the weapon that got the kill (and its points), when it was one. */
  | { t: 'kill'; victim: number; attacker: number | null; kind: KillKind; arma?: ProgWeapon; awards: Award[]; corpse: CorpseInfo; players: PlayerInfo[] }
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
  /** The account's progress changed (points only come from the server online); `escolha` is the Arsenal choice it kept. */
  | { t: 'progresso'; armas: Record<ProgWeapon, { xp: number; nivel: number }>; escolha: ArsenalChoice; conta: { xp: number; nivel: number }; subiu?: { tipo: ProgWeapon | 'conta'; nivel: number } };

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
