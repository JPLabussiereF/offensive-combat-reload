// Game modes: the rules a session (online) or a bots match (offline) plays. A mode only says what differs from
// the rules every mode shares (movement, damage, corpses, humiliation, pickups): where the weapons come from,
// whether the loadout can change mid-match, grenades, whether kills feed the weapon progression, and whether
// matches end with a winner. The server's side of each mode lives in server/modes.ts; the client reads these
// rules to lock the Arsenal, hide the grenades, show the ladder, etc.
//
// Adding a mode: an id here with its rules, its server side in server/modes.ts (createMode), its strings
// (gameMode_<id>, gameModeDesc_<id>) and, if it hands out weapons, a module like shared/gunGame.ts.
export type GameModeId = 'mata-mata' | 'corrida-armada' | 'zumbi';
export const GAME_MODE_IDS: GameModeId[] = ['mata-mata', 'corrida-armada', 'zumbi'];
export const DEFAULT_GAME_MODE: GameModeId = 'mata-mata';
export const isGameModeId = (v: unknown): v is GameModeId => GAME_MODE_IDS.includes(v as GameModeId);

export interface ModeRules {
  /** Where the weapons come from: the account's Arsenal (choice + unlocked upgrades) or the mode (fixed stats). */
  weapons: 'arsenal' | 'mode';
  /**
   * The loadout is fixed when the player enters the match: no Arsenal changes and no newly unlocked upgrades
   * until the next one (online: the next session joined). The server refuses changes meanwhile.
   */
  lockedLoadout: boolean;
  /** G throws grenades (or plants mines). */
  grenades: boolean;
  /** Kills give the weapon that made them its points (account XP is earned online in every mode). */
  weaponXp: boolean;
  /** Matches end with a winner and a new round starts. */
  rounds: boolean;
  /** Playable offline (against bots; zumbi: alone against the zombies). */
  bots: boolean;
  /**
   * Everyone plays together against the mode's enemies (zumbi): no damage between players, no humiliation,
   * and the account's kill/death stats don't count (the enemies aren't players).
   */
  coop?: boolean;
  /**
   * Played only on maps made for it (their data's `exclusivo` names the mode): zumbi needs a map with its wall,
   * gaps and coffin. Without it, a mode is played on every open map (none made for a single mode).
   */
  ownMaps?: boolean;
  /**
   * What the players' pets do (shared/pets.ts): only follow their owner as a look ('cosmetic', the PvP modes: no
   * sound, a short leash, gone when the owner can't be seen) or help with their ability ('ability', the zumbi mode).
   */
  pets: 'cosmetic' | 'ability';
}

export const MODE_RULES: Record<GameModeId, ModeRules> = {
  // Free-for-all: the Arsenal chosen before the match, locked while it lasts.
  'mata-mata': { weapons: 'arsenal', lockedLoadout: true, grenades: true, weaponXp: true, rounds: false, bots: true, pets: 'cosmetic' },
  // Gun game: everyone climbs the same ladder of weapons (shared/gunGame.ts); a lightsaber kill wins the round.
  'corrida-armada': { weapons: 'mode', lockedLoadout: true, grenades: false, weaponXp: false, rounds: true, bots: true, pets: 'cosmetic' },
  // Zombie waves (shared/zombies.ts): co-op survival in its own walled cemetery (a map no other mode plays);
  // weapons come from the mystery coffin, bought with the match's money; zombie kills give account XP only (the
  // weapons aren't the player's Arsenal).
  // Pets help here with their abilities (shared/zombieMatch.ts); everywhere else they're a look.
  zumbi: { weapons: 'mode', lockedLoadout: true, grenades: true, weaponXp: false, rounds: true, bots: true, coop: true, ownMaps: true, pets: 'ability' },
};

/**
 * Whether mode `m` can be played on a map made for `exclusivo` (its data's field; absent or null: an open map).
 * A map made for a mode is played in that mode only, and a mode with maps of its own only on those.
 */
export const modeAllowsMap = (m: GameModeId, exclusivo: GameModeId | null | undefined): boolean => (exclusivo ? exclusivo === m : !MODE_RULES[m].ownMaps);
