// The server side of each game mode (shared/modes.ts). A Session runs the rules every mode shares (movement,
// hits, damage, corpses, humiliation, pickups, chat) and asks its mode at a few hook points: the loadout a
// player joins with, extra player fields, whether damage counts right now, what a kill does, and a tick.
// Modes with enemies of their own (zumbi) also get the messages the Session doesn't know, the blasts, the
// moment a player's health runs out, and a snapshot of their own after the players'.
//
// Adding a mode: its rules in shared/modes.ts, a class here implementing SessionMode, and a case in createMode.
import { FLAG, NET, type ClientMsg, type KillKind, type PlayerInfo, type ServerMsg, type Vec3 } from '@shared/protocol';
import { MODE_RULES, type GameModeId, type ModeRules } from '@shared/modes';
import { loadoutKnife, type GunStats, type Loadout } from '@shared/arsenal';
import type { WeaponId } from '@shared/progression';
import type { MapId } from '@shared/maps';
import { explosionDamage, HIT_REGIONS, minPenetrationKeep, type GrenadeLevel, type HitRegion } from '@shared/weapons';
import { afterDeath, afterKill, GUN_GAME, ladderLoadout, ladderStart, type LadderPos } from '@shared/gunGame';
import { grenadeDamageToZombie, gunDamageToZombie, isBoss, kindScale, knifeDamageToZombie, startItems, weaponMul, ZOMBIE, zombieLoadout, type ZKind } from '@shared/zombies';
import { ZombieMatch, type ZombieHost } from '@shared/zombieMatch';
import { addZombieStat, loadoutOf, stickerAdd } from './progress';
import { loadNavmesh } from './navmesh';
import { EYE, LAG_SLACK, type SPlayer } from './session';

/** What a mode can do to its session. */
export interface ModeHost {
  readonly players: ReadonlyMap<number, SPlayer>;
  /** The session's map. */
  readonly map: MapId;
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
  /** Damage from the mode's enemies (no attacker player): the shared rules, the mode's onLethal included. */
  damage(p: SPlayer, amount: number, kind: KillKind, from: Vec3): void;
  /** A death the mode decides (zumbi: bled out), announced like any other. */
  kill(p: SPlayer, kind: KillKind): void;
  /** The gun a hit says it came from, if the player could have fired it (see Session.firedGun). */
  firedGun(p: SPlayer, w: unknown, now: number): GunStats | null;
  /** The shared fire-rate check (counts every hit the player lands); records the hit when it passes. */
  fireRate(p: SPlayer, gun: GunStats, now: number): boolean;
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
  onKill(victim: SPlayer, attacker: SPlayer | null, kind: KillKind, weapon: WeaponId | null): ServerMsg[];
  tick(now: number): void;
  /** Messages the Session doesn't handle itself (zumbi: shots at zombies, the coffin, revives). */
  handle?(p: SPlayer, msg: ClientMsg, now: number): void;
  /** A player's grenade went off: what it reached of the mode's enemies (already checked: a real grenade, on time). */
  blast?(p: SPlayer, at: Vec3, reached: { z: number; dist: number }[], blast: GrenadeLevel): void;
  /** A player's health hit 0: true when the mode takes over instead of a death (zumbi: down until revived). */
  onLethal?(p: SPlayer, kind: KillKind): boolean;
  /** Extra fields of 'joined' (zumbi: the match as it is). */
  joinState?(): Partial<Extract<ServerMsg, { t: 'joined' }>>;
  /** Sent to everyone right after each players' snapshot (zumbi: the zombies). */
  snapshot?(): ServerMsg | null;
  dispose?(): void;
}

export function createMode(id: GameModeId, host: ModeHost): SessionMode {
  switch (id) {
    case 'corrida-armada':
      return new GunGameMode(host);
    case 'mata-mata':
      return new DeathmatchMode();
    case 'zumbi':
      return new ZombieMode(host);
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

  onKill(victim: SPlayer, attacker: SPlayer | null, kind: KillKind, weapon: WeaponId | null): ServerMsg[] {
    if (!this.combatOpen()) return [];
    const before = this.pos(victim);
    const down = afterDeath(before, kind);
    this.ladder.set(victim.id, down);
    if (down.step !== before.step) this.host.setLoadout(victim, ladderLoadout(down.step));
    if (!attacker || attacker === victim) return [];
    // A kill taken away with the knife (album: Esfaqueador).
    if (down.step < before.step || down.kills < before.kills) stickerAdd(attacker.conn.account, 'esfaqueador');
    const from = this.pos(attacker);
    const { pos, event } = afterKill(from, kind, weapon);
    this.ladder.set(attacker.id, pos);
    if (event === 'advanced') this.host.setLoadout(attacker, ladderLoadout(pos.step));
    if (event !== 'won') return [];
    // The last kill of the ladder: the round is over.
    this.restartAt = this.host.now() + GUN_GAME.restartSeconds * 1000;
    this.host.giveAccountXp(attacker, GUN_GAME.winXp);
    stickerAdd(attacker.conn.account, 'corredor');
    if (attacker.deaths === 0) stickerAdd(attacker.conn.account, 'volta-olimpica');
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

/**
 * Zumbi: co-op waves against zombies simulated here, on the server (shared/zombieMatch.ts over the map's baked
 * navmesh). The session's players are the match's: their shots at zombies are checked like shots at players
 * (the gun they could have fired, its fire rate, the distance to the zombie's position here, with the lag
 * slack, and the damage of the weapon the match says they carry: its rarity, less for a damaged one), and the
 * money, the coffin's random rolls (damaged or not), the barricades and the XP are all decided here. Players
 * can't hurt each other; health running out during a wave puts them down until a teammate revives them or they
 * bleed out.
 */
class ZombieMode implements SessionMode {
  readonly id = 'zumbi' as const;
  readonly rules = MODE_RULES.zumbi;
  /** Null until the navmesh is loaded (the first session of the process waits for Recast to start). */
  private match: ZombieMatch | null = null;
  private disposed = false;

  constructor(private host: ModeHost) {
    const data = ZOMBIE.mapas[host.map];
    if (!data) {
      console.error(`[zumbi] o mapa ${host.map} não tem dados do modo zumbi`);
      return;
    }
    loadNavmesh(host.map)
      .then((nav) => {
        if (this.disposed) return;
        this.match = new ZombieMatch(this.zombieHost(), nav, data);
        // Whoever came in while it loaded.
        for (const p of host.players.values()) this.match.join(p.id, p.name);
      })
      .catch((err) => console.error('[zumbi] malha de navegação:', (err as Error).message));
  }

  private player(id: number) {
    return this.host.players.get(id);
  }

  private zombieHost(): ZombieHost {
    const host = this.host;
    return {
      now: () => host.now(),
      rng: Math.random,
      emit: (m) => host.broadcast(m),
      hurt: (id, amount, from) => {
        const p = this.player(id);
        if (p) host.damage(p, amount, 'zombie', from);
      },
      giveXp: (id, xp) => {
        const p = this.player(id);
        if (p) host.giveAccountXp(p, xp);
      },
      stat: (id, s) => {
        const p = this.player(id);
        if (p) addZombieStat(p.conn.account, s);
      },
      setLoadout: (id, lo) => {
        const p = this.player(id);
        if (p) host.setLoadout(p, lo);
      },
      bleedOut: (id) => {
        const p = this.player(id);
        if (!p) return;
        p.downed = false;
        host.kill(p, 'zombie');
      },
      revive: (id, health) => {
        const p = this.player(id);
        if (!p) return;
        p.downed = false;
        p.health = Math.max(1, Math.round(p.body.maxHealth * health));
        p.lastDamageAt = host.now();
      },
      allowRespawn: (id) => {
        const p = this.player(id);
        if (p && !p.alive) p.deadAt = host.now() - NET.respawnDelay * 1000;
      },
      newMatch: (ids) => {
        for (const id of ids) {
          const p = this.player(id);
          if (!p) continue;
          p.kills = p.deaths = p.score = p.humiliations = 0;
          host.resetForRound(p);
        }
        host.broadcast({ t: 'roundStart', players: [...host.players.values()].map((p) => host.info(p)) });
      },
    };
  }

  joinLoadout() {
    return zombieLoadout(startItems());
  }

  info(p: SPlayer): Partial<PlayerInfo> {
    const z = this.match?.info(p.id);
    const part = this.match?.parts.get(p.id);
    return z ? { zumbi: z, kills: z.kills, score: part?.earned ?? 0 } : {};
  }

  combatOpen() {
    return false;
  }

  onJoin(p: SPlayer) {
    this.match?.join(p.id, p.name);
  }

  onLeave(p: SPlayer) {
    this.match?.leave(p.id);
  }

  onKill(victim: SPlayer): ServerMsg[] {
    const m = this.match;
    if (!m) return [];
    // Dead during a wave: back only for the next break (the match allows it then).
    if (m.phase === 'wave') victim.deadAt = Number.MAX_SAFE_INTEGER / 2;
    m.died(victim.id);
    return [];
  }

  onLethal(p: SPlayer, kind: KillKind): boolean {
    // Falling out of the world is a death, never a fall to the ground.
    if (kind === 'void' || !this.match?.lethal(p.id)) return false;
    p.downed = true;
    p.health = 0;
    return true;
  }

  tick() {
    this.match?.tick(
      1 / NET.tickRate,
      [...this.host.players.values()].map((p) => ({ id: p.id, feet: p.state.p, grounded: !!(p.state.f & FLAG.grounded), alive: p.alive })),
    );
  }

  snapshot(): ServerMsg | null {
    const m = this.match;
    if (!m || (m.phase !== 'wave' && m.zombies.size === 0)) return null;
    return m.snapshot();
  }

  joinState() {
    return this.match ? { zumbi: this.match.sync() } : {};
  }

  dispose() {
    this.disposed = true;
    this.match?.dispose();
    this.match = null;
  }

  handle(p: SPlayer, msg: ClientMsg, now: number) {
    const m = this.match;
    if (!m) return;
    switch (msg.t) {
      case 'zhit':
        return this.onHit(m, p, msg.z, msg.region, msg.dist, msg.w, msg.keep, now);
      case 'zstab':
        return this.onStab(m, p, msg.z, now);
      case 'box':
        return m.useBox(p.id);
      case 'revive':
        if (typeof msg.id === 'number') m.revive(p.id, msg.id, !!msg.on);
        return;
      case 'barricade':
        // The match checks the rest: the gap exists, the player is up and in reach, the money for a new one.
        if (typeof msg.i === 'number') m.barricadeWork(p.id, msg.i, !!msg.on);
        return;
    }
  }

  /** Where a zombie's body is, for the distance checks (its chest, by its size). */
  private chest(z: { pos: Vec3; kind: ZKind }): Vec3 {
    return [z.pos[0], z.pos[1] + 1.1 * kindScale(z.kind), z.pos[2]];
  }

  private onHit(m: ZombieMatch, p: SPlayer, zid: unknown, region: unknown, dist: unknown, w: unknown, keep: unknown, now: number) {
    const z = typeof zid === 'number' ? m.hittable(zid) : null;
    if (!z || !p.alive || p.downed || typeof dist !== 'number' || !Number.isFinite(dist)) return;
    if (!(HIT_REGIONS as readonly unknown[]).includes(region)) return;
    const gun = this.host.firedGun(p, w, now);
    if (!gun) return;
    const eye: Vec3 = [p.state.p[0], p.state.p[1] + EYE, p.state.p[2]];
    const c = this.chest(z);
    const serverDist = Math.hypot(eye[0] - c[0], eye[1] - c[1], eye[2] - c[2]);
    // Zombies move between the shot and this check, and the big ones are big: a little more slack for them.
    const scale = kindScale(z.kind);
    if (serverDist > gun.alcanceMaximo || Math.abs(serverDist - dist) > LAG_SLACK + serverDist * 0.1 + scale) return;
    if (!this.host.fireRate(p, gun, now)) return;
    const k = typeof keep === 'number' && Number.isFinite(keep) ? Math.min(1, Math.max(minPenetrationKeep(gun), keep)) : 1;
    const crit = p.potion?.kind === 'critico' && p.potion.until > now;
    const r = region as HitRegion;
    const dmg = gunDamageToZombie(gun, Math.min(dist, gun.alcanceMaximo), crit && r !== 'virilha' ? 'cabeca' : r, k, weaponMul(m.itemsOf(p.id), gun.arma), isBoss(z.kind));
    m.damage(z.id, p.id, dmg, r === 'cabeca' ? 'head' : r === 'virilha' ? 'groin' : 'gun');
  }

  private onStab(m: ZombieMatch, p: SPlayer, zid: unknown, now: number) {
    const z = typeof zid === 'number' ? m.hittable(zid) : null;
    if (!z || !p.alive || p.downed) return;
    const knife = loadoutKnife(p.loadout);
    if (now - p.lastStab < knife.intervalo * 1000 * 0.75) return;
    const d = Math.hypot(p.state.p[0] - z.pos[0], p.state.p[2] - z.pos[2]);
    if (d > knife.alcanceInvestida + 1.5 + 0.4 * kindScale(z.kind)) return;
    p.lastStab = now;
    m.damage(z.id, p.id, knifeDamageToZombie(weaponMul(m.itemsOf(p.id), 'faca')), 'knife');
  }

  blast(p: SPlayer, at: Vec3, reached: { z: number; dist: number }[], blast: GrenadeLevel) {
    const m = this.match;
    if (!m) return;
    const seen = new Set<number>();
    for (const h of reached.slice(0, 64)) {
      const z = typeof h?.z === 'number' ? m.hittable(h.z) : null;
      if (!z || seen.has(z.id) || typeof h.dist !== 'number' || !Number.isFinite(h.dist)) continue;
      seen.add(z.id);
      const c = this.chest(z);
      const serverDist = Math.hypot(at[0] - c[0], at[1] - c[1], at[2] - c[2]);
      if (serverDist > blast.raioDano + 3 || Math.abs(serverDist - h.dist) > 3) continue;
      const dmg = grenadeDamageToZombie(explosionDamage(blast, Math.max(0, h.dist)), m.wave);
      if (dmg > 0) m.damage(z.id, p.id, dmg, 'grenade');
    }
  }
}
