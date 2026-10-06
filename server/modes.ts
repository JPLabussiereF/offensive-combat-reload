// The server side of each game mode (shared/modes.ts). A Session runs the rules every mode shares (movement,
// hits, damage, corpses, humiliation, pickups, chat) and asks its mode at a few hook points: the loadout a
// player joins with, extra player fields, whether damage counts right now, what a kill does, and a tick.
//
// Adding a mode: its rules in shared/modes.ts, a class here implementing SessionMode, and a case in createMode.
import type { KillKind, PlayerInfo, ServerMsg } from '@shared/protocol';
import { MODE_RULES, type GameModeId, type ModeRules } from '@shared/modes';
import type { Loadout } from '@shared/arsenal';
import type { ProgWeapon } from '@shared/progression';
import { afterDeath, afterKill, GUN_GAME, ladderLoadout, ladderStart, type LadderPos } from '@shared/gunGame';
import { loadoutOf } from './progress';
import type { SPlayer } from './session';

/** What a mode can do to its session. */
export interface ModeHost {
  readonly players: ReadonlyMap<number, SPlayer>;
  now(): number;
  /** To everyone in the session. */
  broadcast(msg: ServerMsg): void;
  /** Gives a player other weapons mid-match and tells everyone, the player included. */
  setLoadout(p: SPlayer, lo: Loadout): void;
  info(p: SPlayer): PlayerInfo;
  /** Account XP for something the mode rewards (a round won); the player hears about their progress. */
  giveAccountXp(p: SPlayer, xp: number): void;
  /** Takes a player out for a new round: dead with the respawn allowed now, no dance, grenades or boosts. */
  resetForRound(p: SPlayer): void;
}

export interface SessionMode {
  readonly id: GameModeId;
  readonly rules: ModeRules;
  /** The weapons a player joins with. */
  joinLoadout(p: SPlayer): Loadout;
  /** Fields of the player everyone sees on top of the shared ones (the ladder step). */
  info(p: SPlayer): Partial<PlayerInfo>;
  /** False while a round is over: no damage between players until the next one. */
  combatOpen(): boolean;
  onJoin(p: SPlayer): void;
  onLeave(p: SPlayer): void;
  /**
   * A player died (`attacker` null for falls, the dog, their own grenade; `weapon`: what got the kill). Runs
   * before the kill is announced, so the players in it carry the new state; returns what to send after it.
   */
  onKill(victim: SPlayer, attacker: SPlayer | null, kind: KillKind, weapon: ProgWeapon | null): ServerMsg[];
  tick(now: number): void;
}

export function createMode(id: GameModeId, host: ModeHost): SessionMode {
  switch (id) {
    case 'corrida-armada':
      return new GunGameMode(host);
    case 'mata-mata':
      return new DeathmatchMode();
  }
}

/**
 * Mata-mata: free-for-all with the account's Arsenal, resolved when the player joins and kept for the whole
 * stay in the session (the "match"): changes and upgrades unlocked meanwhile apply in the next session joined.
 */
class DeathmatchMode implements SessionMode {
  readonly id = 'mata-mata' as const;
  readonly rules = MODE_RULES['mata-mata'];
  joinLoadout = (p: SPlayer) => loadoutOf(p.conn.account);
  info = () => ({});
  combatOpen = () => true;
  onJoin() {}
  onLeave() {}
  onKill = () => [];
  tick() {}
}

/**
 * Corrida armada: everyone climbs the ladder of shared/gunGame.ts. The server keeps each player's step, hands
 * out the step's weapons (hits are validated with them), moves the killer up, the stabbed down, and ends the
 * round on the last step's lightsaber kill; GUN_GAME.restartSeconds later everyone starts over.
 */
class GunGameMode implements SessionMode {
  readonly id = 'corrida-armada' as const;
  readonly rules = MODE_RULES['corrida-armada'];
  private ladder = new Map<number, LadderPos>();
  /** Server time the next round starts (0: a round is being played). */
  private restartAt = 0;

  constructor(private host: ModeHost) {}

  private pos(p: SPlayer): LadderPos {
    let l = this.ladder.get(p.id);
    if (!l) this.ladder.set(p.id, (l = ladderStart()));
    return l;
  }

  joinLoadout(p: SPlayer) {
    // Late arrivals start at the bottom like everyone did.
    this.ladder.set(p.id, ladderStart());
    return ladderLoadout(0);
  }

  info(p: SPlayer) {
    const { step, kills } = this.pos(p);
    return { ladder: { step, kills } };
  }

  combatOpen() {
    return this.restartAt === 0;
  }

  onJoin() {}

  onLeave(p: SPlayer) {
    this.ladder.delete(p.id);
  }

  onKill(victim: SPlayer, attacker: SPlayer | null, kind: KillKind, weapon: ProgWeapon | null): ServerMsg[] {
    if (!this.combatOpen()) return [];
    const before = this.pos(victim);
    const down = afterDeath(before, kind);
    this.ladder.set(victim.id, down);
    if (down.step !== before.step) this.host.setLoadout(victim, ladderLoadout(down.step));
    if (!attacker || attacker === victim) return [];
    const from = this.pos(attacker);
    const { pos, event } = afterKill(from, kind, weapon);
    this.ladder.set(attacker.id, pos);
    if (event === 'advanced') this.host.setLoadout(attacker, ladderLoadout(pos.step));
    if (event !== 'won') return [];
    // The last kill of the ladder: the round is over.
    this.restartAt = this.host.now() + GUN_GAME.restartSeconds * 1000;
    this.host.giveAccountXp(attacker, GUN_GAME.winXp);
    return [{ t: 'roundEnd', mode: this.id, winner: attacker.id, name: attacker.name, restartAt: this.restartAt }];
  }

  tick(now: number) {
    if (!this.restartAt || now < this.restartAt) return;
    this.restartAt = 0;
    // Everyone back to the first step, scores at zero, and dead: the clients respawn right away.
    for (const p of this.host.players.values()) {
      this.ladder.set(p.id, ladderStart());
      p.kills = p.deaths = p.score = p.humiliations = 0;
      this.host.resetForRound(p);
      this.host.setLoadout(p, ladderLoadout(0));
    }
    this.host.broadcast({ t: 'roundStart', players: [...this.host.players.values()].map((p) => this.host.info(p)) });
  }
}
