// One game session. The server owns health, damage, kills, score, respawns and corpses; clients report their
// movement and what their shots hit, and every report is sanity-checked here with the same shared rules the
// client uses (each weapon's stats with the upgrades in hand, score table). What differs between game modes
// (where the weapons come from, ladders, rounds) is the session's mode (server/modes.ts).
//
// Every player is a signed-in account: kills, humiliations and time alive feed the account's progress
// (server/progress.ts), which app.ts writes to the database.
//
// Not yet (next netcode step, section 14): server-side movement simulation, rewinding hitboxes for lag
// compensation, and interest culling. Movement is trusted; hits are validated against server positions
// with a lag tolerance.
import type { ServerWebSocket } from 'bun';
import { BISCUIT, CHERRY, HEALTH, HUMILIATION, KOI, POTION, RAT, SCORE, type PotionKind } from '@shared/constants';
import { clampExplosionDamage, computeDamage, critRegion, explosionDamage, HIT_REGIONS, LETHAL_DAMAGE, minPenetrationKeep, type GrenadeLevel, type HitRegion } from '@shared/weapons';
import { ACCOUNT_XP } from '@shared/accountLevel';
import { bodyStats } from '@shared/appearance';
import { CHECKED_PROPS, FISH, PICKUPS, PROP_RANGE, PROPS, RATS, WITCHES, type MapId, type PickupKind } from '@shared/maps';
import { isGun, weaponOfKill, type GunId, type WeaponId } from '@shared/progression';
import { DEFAULT_LOADOUT, grenadeStats, loadoutKnife, slotStats, type GunSlot, type Loadout } from '@shared/arsenal';
import type { GameModeId } from '@shared/modes';
import { accountLevelOf, addAccountXp, addTime, addWeaponXp, equip, loadoutOf, progressMsg, stickerAdd, stickerMax, stickerUps, type LevelUp, type LiveAccount } from './progress';
import { createMode, type SessionMode } from './modes';
import { FLAG, NET, sanitizeChat, type Award, type ClientMsg, type CorpseInfo, type KillKind, type NetState, type PlayerInfo, type ServerMsg, type Sex, type SessionInfo, type Vec3 } from '@shared/protocol';

/** Eye and chest height: the same for every body (height is only a look). */
export const EYE = 1.6;
const CHEST = 1.1;
/** Extra meters allowed between what the client saw and the server's latest positions (latency). */
export const LAG_SLACK = 4;
/** After a weapon switch, hits from the gun put away still count for this long (shots already in flight, latency). */
const SWITCH_GRACE_MS = 1000;

export interface Conn {
  ws: ServerWebSocket<unknown>;
  id: number;
  name: string;
  sex: Sex;
  session: Session | null;
  /** The signed-in account behind this connection (from the WebSocket ticket). */
  account: LiveAccount;
  send(msg: ServerMsg): void;
}

export interface SPlayer {
  conn: Conn;
  id: number;
  name: string;
  sex: Sex;
  /** Guns and upgrades in effect (from the mode: the account's Arsenal or a ladder step): damage, fire rate and reach follow them. */
  loadout: Loadout;
  /** The loadout before the mode last changed it, and when (shots already in flight still count). */
  loadoutBefore: Loadout;
  loadoutAt: number;
  /** The gun slot in hand (from the state flags), the one before it and when it changed. */
  held: GunSlot;
  heldBefore: GunSlot;
  heldAt: number;
  /** What the character's look does in the game: height (eye, hitboxes) and max health. */
  body: ReturnType<typeof bodyStats>;
  state: NetState;
  alive: boolean;
  health: number;
  lastDamageAt: number;
  deadAt: number;
  kills: number;
  deaths: number;
  score: number;
  humiliations: number;
  ping: number;
  hitTimes: number[];
  lastStab: number;
  lastShotRelay: number;
  lastProp: number;
  /** Chat token bucket (NET.chatBurst, one back every NET.chatEveryMs). */
  chatTokens: number;
  chatAt: number;
  /** Live grenades and mines, with the blast they had when thrown (upgrades can't grow it afterwards). */
  grenades: Map<number, { thrownAt: number; fuse: number; impact: boolean; mine: boolean; origin: Vec3; speed: number; blast: GrenadeLevel; inHand: boolean }>;
  /** The dance going on: on which corpse, since when, and how much of the corpse's window was left then. */
  dance: { corpse: number; since: number; left: number } | null;
  /** Server time when the cherry's extra health runs out (0: none). */
  boostUntil: number;
  /** Carries a giant rat's humanity: extra max health until death. */
  humanity: boolean;
  /**
   * Down but not dead (zumbi: health at 0, waiting for a teammate's revive): can't be hurt, doesn't heal,
   * can't hit anything. The mode decides when it ends.
   */
  downed: boolean;
  /** The witch's potion being felt (until: server time) and when the next one can be drunk. */
  potion: { kind: PotionKind; until: number } | null;
  potionReady: number;
  // For the sticker album (shared/achievements.ts):
  /** Kills since the last death, kills in a row at most COMBO_MS apart, and when the last one was. */
  streak: number;
  combo: number;
  lastKillAt: number;
  /** Who killed this player last and who last danced on their body (null: nobody, or it was paid back). */
  lastKiller: number | null;
  lastOppressor: number | null;
  /** When the biscuit was last eaten, and whether health was low (30 or less) right before. */
  biscuitAt: number;
  biscuitLow: boolean;
  /** The checked map gags this player hit lately (the album's sequences) and when the truck last counted. */
  propLog: { id: string; at: number }[];
  truckAt: number;
  /** The last player who hurt this one and when (null: none since the last death): a push off the map. */
  lastHitBy: number | null;
  lastHitAt: number;
}

/** Sticker album: the longest gap between two kills of a combo, and how long after the biscuit a kill counts. */
const COMBO_MS = 4000;
const SCOOBY_MS = 10_000;
const SCOOBY_HEALTH = 30;
/** Sticker album: a killing spree worth breaking, and how many kills ahead in the match make a Goliath. */
const SPREE = 5;
const GOLIATH_KILLS = 10;
/** Sticker album: deaths with nobody to blame. */
/** Sticker album: how soon after a hit a fall still counts as a push, a kill with this little health left, a laggy death. */
const PUSH_MS = 5000;
/** Sticker album: how long the map gags a player hit are kept for the sequences (the longest is 30 s). */
const PROP_MEMORY_MS = 30_000;
const LOW_HEALTH = 10;
const LAG_MS = 250;
const SELF_DEATH_STICKERS: Partial<Record<KillKind, string>> = { fall: 'gravidade', void: 'fora-do-mapa', dog: 'amora-mandou-lembrancas', explosion: 'tiro-no-pe' };

interface Corpse extends CorpseInfo {
  createdAt: number;
  humiliated: boolean;
  claimedBy: number | null;
  /** Who made it (null: a fall, the dog, their own grenade); the album's stickers ask. */
  killer: number | null;
}

/** How far (m) the server lets a pickup be from the player's last reported feet (latency). */
const PICKUP_SLACK = 1.5;

const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const eye = (p: SPlayer): Vec3 => [p.state.p[0], p.state.p[1] + EYE, p.state.p[2]];
const chest = (p: SPlayer): Vec3 => [p.state.p[0], p.state.p[1] + CHEST, p.state.p[2]];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite);

export class Session {
  readonly players = new Map<number, SPlayer>();
  private corpses = new Map<number, Corpse>();
  private nextCorpse = 1;
  /** The map's collectibles: where they are and when each is there again (0: now). */
  private pickups = new Map<string, { kind: PickupKind; p: Vec3; ready: number }>();
  /** The map's fish: their loop (x, z, radius), when each is back (0: alive) and whether it's golden. */
  private fish = new Map<string, { loop: [number, number, number]; ready: number; golden: boolean }>();
  /** The map's giant rats: where each stands and when it's back (0: alive). */
  private rats = new Map<string, { p: Vec3; ready: number }>();
  private timer: Timer;
  private scoreTimer = 0;
  /** Bun pub/sub topic every player of this session is subscribed to. */
  private readonly topic: string;
  /** What this session plays: mata-mata, corrida armada... */
  readonly mode: SessionMode;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly map: MapId,
    modeId: GameModeId,
    readonly permanent: boolean,
    private now: () => number,
    private onChange: () => void,
    /** server.publish: sends to every socket subscribed to the topic. */
    private publish: (topic: string, data: string) => void,
  ) {
    this.topic = `sessao:${id}`;
    this.mode = createMode(modeId, {
      players: this.players,
      now: () => this.now(),
      broadcast: (msg) => this.broadcast(msg),
      setLoadout: (p, lo) => this.setLoadout(p, lo),
      info: (p) => this.playerInfo(p),
      giveAccountXp: (p, xp) => this.progress(p, [addAccountXp(p.conn.account, xp)]),
      resetForRound: (p) => this.resetForRound(p),
      map,
      damage: (p, amount, kind, from) => this.damage(p, null, amount, kind, from, [], null),
      kill: (p, kind) => {
        if (p.alive) this.kill(p, null, kind, [], null);
      },
      firedGun: (p, w, now) => this.firedGun(p, w, now),
      fireRate: (p, gun, now) => this.fireRate(p, gun, now),
    });
    for (const k of PICKUPS[map] ?? []) this.pickups.set(k.id, { kind: k.kind, p: k.p, ready: 0 });
    for (const r of RATS[map] ?? []) this.rats.set(r.id, { p: r.p, ready: 0 });
    for (const f of FISH[map] ?? []) this.fish.set(f.id, { loop: f.loop, ready: 0, golden: false });
    this.timer = setInterval(() => this.tick(), 1000 / NET.tickRate);
  }

  get info(): SessionInfo {
    return { id: this.id, name: this.name, map: this.map, mode: this.mode.id, players: this.players.size, max: NET.maxPlayers, permanent: this.permanent };
  }

  get full() {
    return this.players.size >= NET.maxPlayers;
  }

  dispose() {
    clearInterval(this.timer);
    this.mode.dispose?.();
  }

  /** `withLook`: include the appearance (only when a player appears, it doesn't change mid-session). */
  private playerInfo(p: SPlayer, withLook = false): PlayerInfo {
    return {
      id: p.id,
      name: p.name,
      nivel: accountLevelOf(p.conn.account),
      sex: p.sex,
      lo: p.loadout,
      ...(withLook ? { ap: p.conn.account.profile.appearance } : {}),
      kills: p.kills,
      deaths: p.deaths,
      score: p.score,
      humiliations: p.humiliations,
      alive: p.alive,
      ping: p.ping,
      ...this.showcase(p.conn.account),
      ...this.mode.info(p),
    };
  }

  /** The album sticker and title a player chose to show: the sticker with the finish it has right now. */
  private showcase(a: LiveAccount): Pick<PlayerInfo, 'fig' | 'tit'> {
    const { sticker, title } = a.profile.showcase ?? { sticker: null, title: null };
    const tier = sticker ? (a.stickerTiers[sticker] ?? 0) : 0;
    return { ...(sticker && tier ? { fig: [sticker, tier] as [string, number] } : {}), ...(title ? { tit: title } : {}) };
  }

  /** To everyone in the session, serialized once; `except` is the player whose action caused it. */
  private broadcast(msg: ServerMsg, except?: number) {
    const data = JSON.stringify(msg);
    // ws.publish reaches every subscriber but the socket itself. A closed socket was already unsubscribed.
    const sender = except === undefined ? undefined : this.players.get(except)?.conn.ws;
    if (sender?.readyState === WebSocket.OPEN) sender.publish(this.topic, data);
    else this.publish(this.topic, data);
  }

  // --- Membership -------------------------------------------------------------------------------------

  join(conn: Conn) {
    // Unique display names inside the session.
    let name = conn.name;
    const taken = new Set([...this.players.values()].map((p) => p.name));
    for (let n = 2; taken.has(name); n++) name = `${conn.name.slice(0, NET.nameMax - 4)} (${n})`;
    const p: SPlayer = {
      conn,
      id: conn.id,
      name,
      sex: conn.sex,
      // The mode's, right below (it needs the player).
      loadout: DEFAULT_LOADOUT,
      loadoutBefore: DEFAULT_LOADOUT,
      loadoutAt: 0,
      held: 'primaria',
      heldBefore: 'primaria',
      heldAt: 0,
      body: bodyStats(conn.account.profile.appearance),
      state: { p: [0, -50, 0], yaw: 0, pitch: 0, f: 0 },
      // Joins dead: the client picks a spawn and sends 'respawn' right away.
      alive: false,
      health: 0,
      lastDamageAt: 0,
      deadAt: this.now() - NET.respawnDelay * 1000,
      kills: 0,
      deaths: 0,
      score: 0,
      humiliations: 0,
      ping: 0,
      hitTimes: [],
      lastStab: 0,
      lastShotRelay: 0,
      lastProp: 0,
      chatTokens: NET.chatBurst,
      chatAt: this.now(),
      grenades: new Map(),
      dance: null,
      boostUntil: 0,
      humanity: false,
      downed: false,
      potion: null,
      potionReady: 0,
      streak: 0,
      combo: 0,
      lastKillAt: 0,
      lastKiller: null,
      lastOppressor: null,
      biscuitAt: 0,
      biscuitLow: false,
      lastHitBy: null,
      lastHitAt: 0,
      propLog: [],
      truckAt: -Infinity,
    };
    // Fixed for the match in modes with a locked loadout (mata-mata: the account's Arsenal as it is now).
    p.loadout = p.loadoutBefore = this.mode.joinLoadout(p);
    this.players.set(p.id, p);
    this.mode.onJoin(p);
    conn.session = this;
    conn.ws.subscribe(this.topic);
    conn.send({
      t: 'joined',
      session: this.info,
      you: p.id,
      players: [...this.players.values()].map((x) => this.playerInfo(x, true)),
      corpses: [...this.corpses.values()].filter((c) => !c.humiliated).map(({ id, victim, name: n, sex, ap, p: pos, yaw, until }) => ({ id, victim, name: n, sex, ap, p: pos, yaw, until })),
      time: this.now(),
      pickups: [...this.pickups].filter(([, k]) => k.ready > this.now()).map(([id, k]) => ({ id, ready: k.ready })),
      fish: [...this.fish].filter(([, f]) => f.ready > this.now() || f.golden).map(([id, f]) => ({ id, ready: f.ready > this.now() ? f.ready : 0, golden: f.golden })),
      rats: [...this.rats].filter(([, r]) => r.ready > this.now()).map(([id, r]) => ({ id, ready: r.ready })),
      ...this.mode.joinState?.(),
    });
    this.broadcast({ t: 'playerJoined', player: this.playerInfo(p, true) }, p.id);
    this.onChange();
  }

  leave(conn: Conn) {
    const p = this.players.get(conn.id);
    if (!p) return;
    this.players.delete(conn.id);
    this.mode.onLeave(p);
    conn.session = null;
    conn.ws.unsubscribe(this.topic);
    for (const c of this.corpses.values()) if (c.claimedBy === p.id) c.claimedBy = null;
    this.broadcast({ t: 'playerLeft', id: p.id });
    this.onChange();
  }

  // --- Messages ---------------------------------------------------------------------------------------

  handle(conn: Conn, msg: ClientMsg) {
    const p = this.players.get(conn.id);
    if (!p) return;
    const now = this.now();
    switch (msg.t) {
      case 'state': {
        const s = msg.s;
        if (!s || !vec(s.p) || !finite(s.yaw) || !finite(s.pitch) || !finite(s.f)) return;
        if (!p.alive) return;
        p.state = { p: s.p, yaw: s.yaw, pitch: Math.max(-1.6, Math.min(1.6, s.pitch)), f: s.f | 0 };
        const held: GunSlot = p.state.f & FLAG.secondary && p.loadout.secundaria ? 'secundaria' : 'primaria';
        if (held !== p.held) {
          p.heldBefore = p.held;
          p.held = held;
          p.heldAt = now;
        }
        return;
      }
      case 'ping':
        if (finite(msg.rtt)) p.ping = Math.round(Math.min(9999, Math.max(0, msg.rtt)));
        if (finite(msg.c)) conn.send({ t: 'pong', c: msg.c, s: now });
        return;
      case 'shot': {
        // Cosmetic relay (tracer + sound for others), rate-limited to the fire rate of the gun in hand.
        const gun = this.gunOf(p, p.held);
        if (!p.alive || !gun || !vec(msg.o) || !vec(msg.e) || now - p.lastShotRelay < (60000 / gun.cadencia) * 0.7) return;
        p.lastShotRelay = now;
        this.broadcast({ t: 'shot', id: p.id, o: msg.o, e: msg.e }, p.id);
        return;
      }
      case 'prop': {
        // Ids look like "hidrante:1", limited to a few per second per player. Most are a cosmetic relay; the
        // ones the album counts (PROPS) are checked: on this map, alive, within reach.
        if (typeof msg.id !== 'string' || !/^[a-z]{1,16}(:\d{1,3})?$/.test(msg.id) || now - p.lastProp < 150) return;
        if (CHECKED_PROPS.has(msg.id)) {
          const spot = PROPS[this.map].find((s) => s.id === msg.id);
          if (!spot || !p.alive || dist3(p.state.p, spot.p) > PROP_RANGE) return;
          this.albumProp(p, msg.id, now);
        }
        p.lastProp = now;
        this.broadcast({ t: 'prop', id: msg.id, by: p.id }, p.id);
        return;
      }
      case 'swing':
        if (p.alive) this.broadcast({ t: 'swing', id: p.id }, p.id);
        return;
      case 'pickup':
        return this.onPickup(p, msg.id, now);
      case 'fish':
        return this.onFish(p, msg.id, now);
      case 'rat':
        return this.onRat(p, msg.id, now);
      case 'potion':
        return this.onPotion(p, now);
      case 'chat': {
        const text = sanitizeChat(msg.text);
        if (!text) return;
        if (Date.now() < p.conn.account.chatMutedUntil) return conn.send({ t: 'chatRefused', reason: 'muted' });
        p.chatTokens = Math.min(NET.chatBurst, p.chatTokens + (now - p.chatAt) / NET.chatEveryMs);
        p.chatAt = now;
        if (p.chatTokens < 1) return conn.send({ t: 'chatRefused', reason: 'slow' });
        p.chatTokens--;
        // The sender too: everyone sees the same, sanitized line.
        this.broadcast({ t: 'chat', id: p.id, name: p.name, text });
        return;
      }
      case 'hit':
        return this.onHit(p, msg.target, msg.region, msg.dist, msg.w, msg.keep, now);
      case 'stab':
        return this.onStab(p, msg.target, !!msg.behind, now);
      case 'grenade': {
        if (!this.mode.rules.grenades || !p.alive || !finite(msg.id) || !vec(msg.p) || !vec(msg.v) || !finite(msg.fuse)) return;
        // Land mines (a grenade upgrade) stay until they go off or their owner respawns.
        const grenade = grenadeStats(p.loadout.ativas.granada);
        const mine = !!msg.mine && grenade.tipo === 'mina';
        const live = [...p.grenades.values()];
        if (p.grenades.has(msg.id) || (mine ? live.filter((g) => g.mine).length >= 3 : live.filter((g) => !g.mine).length >= 4)) return;
        const impact = !mine && !!msg.impact && grenade.impacto;
        const fuse = mine ? 0 : Math.max(0, Math.min(impact ? grenade.tempoMaximoVoo : grenade.pavio, msg.fuse));
        const speed = Math.hypot(msg.v[0], msg.v[1], msg.v[2]);
        // Cooked too long, it goes off in the hand: no fuse left, never thrown (an album sticker asks).
        const inHand = !mine && !impact && fuse === 0 && speed === 0;
        p.grenades.set(msg.id, { thrownAt: now, fuse, impact, mine, origin: msg.p, speed, blast: grenade.explosao, inHand });
        // A duck (the witch's potion) is only how it looks and sounds.
        this.broadcast({ t: 'grenade', owner: p.id, id: msg.id, p: msg.p, v: msg.v, fuse, impact, ...(mine ? { mine } : {}), ...(!mine && msg.duck === true ? { duck: true } : {}) }, p.id);
        return;
      }
      case 'boom':
        return this.onBoom(p, msg, now);
      case 'loadout':
        // Locked for the match (the Arsenal is chosen before it, in the lobby): refused, and the player hears
        // the choice the server kept. Otherwise the new weapons go into the player's hands at once.
        if (!this.mode.rules.lockedLoadout && this.mode.rules.weapons === 'arsenal') {
          equip(p.conn.account, msg.lo);
          this.setLoadout(p, loadoutOf(p.conn.account));
        }
        p.conn.send(progressMsg(p.conn.account));
        return;
      case 'selfDamage': {
        if (!p.alive || !finite(msg.amount) || msg.amount <= 0) return;
        const cause: KillKind = msg.cause === 'void' ? 'void' : msg.cause === 'dog' ? 'dog' : 'fall';
        this.damage(p, null, Math.min(LETHAL_DAMAGE, msg.amount), cause, null, [], null);
        return;
      }
      case 'taunt':
        return this.onTaunt(p, msg.corpse, now);
      case 'tauntEnd':
        return this.onTauntEnd(p, msg.corpse, !!msg.done, now);
      case 'respawn': {
        if (p.alive || !vec(msg.p) || !finite(msg.yaw)) return;
        if (now - p.deadAt < NET.respawnDelay * 1000 - 250) return;
        p.alive = true;
        p.downed = false;
        p.boostUntil = 0;
        p.health = p.body.maxHealth;
        p.lastDamageAt = 0;
        p.dance = null;
        p.state = { p: msg.p, yaw: msg.yaw, pitch: 0, f: 0 };
        // Every life starts with the primary in hand.
        p.held = p.heldBefore = 'primaria';
        // Mines last only for the life they were planted in (clients drop them on 'spawned' too).
        for (const [id, g] of p.grenades) if (g.mine) p.grenades.delete(id);
        this.broadcast({ t: 'spawned', id: p.id, p: msg.p, yaw: msg.yaw });
        return;
      }
      default:
        // The mode's own messages (zumbi: shots at zombies, the coffin, revives).
        this.mode.handle?.(p, msg, now);
    }
  }

  /** Max health right now: the body's, plus the cherry's while it lasts and a rat's humanity. */
  private maxHealth(p: SPlayer, now = this.now()) {
    return p.body.maxHealth + (p.boostUntil > now ? CHERRY.extraHealth : 0) + (p.humanity ? RAT.extraHealth : 0);
  }

  private onPickup(p: SPlayer, id: unknown, now: number) {
    const k = typeof id === 'string' ? this.pickups.get(id) : undefined;
    if (!k || !p.alive || now < k.ready) return;
    const [x, y, z] = p.state.p;
    const radius = k.kind === 'biscoito' ? BISCUIT.radius : CHERRY.radius;
    if (Math.hypot(x - k.p[0], z - k.p[2]) > radius + PICKUP_SLACK || Math.abs(y - k.p[1]) > 2) return;
    if (k.kind === 'biscoito') {
      k.ready = now + BISCUIT.respawn * 1000;
      p.biscuitAt = now;
      p.biscuitLow = p.health <= SCOOBY_HEALTH;
      p.health = this.maxHealth(p, now);
      this.broadcast({ t: 'pickup', id: id as string, by: p.id, ready: k.ready, until: 0 });
      return;
    }
    k.ready = now + CHERRY.respawn * 1000;
    p.boostUntil = now + CHERRY.duration * 1000;
    p.health = Math.min(this.maxHealth(p, now), p.health + CHERRY.extraHealth);
    this.broadcast({ t: 'pickup', id: id as string, by: p.id, ready: k.ready, until: p.boostUntil });
  }

  /** The witch's potion: near her and not too soon after the last one; the effect is drawn here. */
  private onPotion(p: SPlayer, now: number) {
    const witch = WITCHES[this.map];
    if (!witch || !p.alive || now < p.potionReady) return;
    if (Math.hypot(p.state.p[0] - witch[0], p.state.p[2] - witch[2]) > POTION.radius + PICKUP_SLACK || Math.abs(p.state.p[1] - witch[1]) > 2) return;
    const kind = POTION.kinds[Math.floor(Math.random() * POTION.kinds.length)];
    const until = kind === 'pato' ? 0 : now + POTION.duration * 1000;
    p.potionReady = now + POTION.cooldown * 1000;
    p.potion = kind === 'pato' ? null : { kind, until };
    stickerAdd(p.conn.account, `provador-da-bruxa:${kind}`);
    this.broadcast({ t: 'potion', by: p.id, kind, until });
  }

  /** A giant rat brought down: alive and near the killer. Its humanity raises their max health until they die. */
  private onRat(p: SPlayer, id: unknown, now: number) {
    const r = typeof id === 'string' ? this.rats.get(id) : undefined;
    if (!r || !p.alive || now < r.ready) return;
    if (dist3(p.state.p, r.p) > RAT.range) return;
    r.ready = now + RAT.respawn * 1000;
    if (!p.humanity) {
      p.humanity = true;
      p.health = Math.min(this.maxHealth(p, now), p.health + RAT.extraHealth);
    }
    this.broadcast({ t: 'rat', id: id as string, by: p.id, ready: r.ready });
  }

  /**
   * A fish shot or stabbed: alive and within range of the shooter's last position. It gives account XP and
   * comes back after a while, maybe golden; a golden one also sharpens the killer's aim (on their client).
   */
  private onFish(p: SPlayer, id: unknown, now: number) {
    const f = typeof id === 'string' ? this.fish.get(id) : undefined;
    if (!f || !p.alive || now < f.ready) return;
    if (Math.hypot(p.state.p[0] - f.loop[0], p.state.p[2] - f.loop[1]) > KOI.range + f.loop[2]) return;
    const prize = f.golden ? 'dourada' : 'koi';
    const [min, max] = KOI.respawn;
    f.ready = now + Math.round((min + Math.random() * (max - min)) * 1000);
    f.golden = Math.random() < KOI.goldenChance;
    stickerAdd(p.conn.account, 'pescador');
    if (prize === 'dourada') stickerAdd(p.conn.account, 'peixe-de-ouro');
    this.progress(p, [addAccountXp(p.conn.account, prize === 'dourada' ? KOI.goldenXp : KOI.xp)]);
    const until = prize === 'dourada' ? now + KOI.goldenDuration * 1000 : undefined;
    this.broadcast({ t: 'fish', id: id as string, by: p.id, prize, ready: f.ready, golden: f.golden, ...(until ? { until } : {}) });
  }

  /** The gun a player has in a slot, with its upgrades (null: empty slot, or a melee-only loadout). */
  private gunOf(p: SPlayer, slot: GunSlot, lo = p.loadout) {
    return lo.soFaca ? null : slotStats(lo, slot);
  }

  /**
   * The gun a hit says it came from, if the player could have fired it: the one in hand, the one just put away
   * (shots fired right before a switch arrive after it), or the one the mode just took away (a ladder step).
   */
  private firedGun(p: SPlayer, w: unknown, now: number) {
    if (!isGun(w)) return null;
    const options: [GunSlot, Loadout, boolean][] = [
      [p.held, p.loadout, true],
      [p.heldBefore, p.loadout, now - p.heldAt < SWITCH_GRACE_MS],
      [p.held, p.loadoutBefore, now - p.loadoutAt < SWITCH_GRACE_MS],
    ];
    for (const [slot, lo, ok] of options) {
      const gun = ok ? this.gunOf(p, slot, lo) : null;
      if (gun?.arma === w) return gun;
    }
    return null;
  }

  /**
   * Fire-rate check: no more confirmed hits per second than the gun can fire (+ slack for jitter), whatever
   * they hit (players and the mode's enemies). Records the hit when it passes.
   */
  private fireRate(p: SPlayer, gun: { cadencia: number }, now: number): boolean {
    p.hitTimes = p.hitTimes.filter((t) => now - t < 1000);
    if (p.hitTimes.length >= Math.ceil(gun.cadencia / 60) + 2) return false;
    p.hitTimes.push(now);
    return true;
  }

  private onHit(p: SPlayer, targetId: number, region: HitRegion, reportedDist: number, w: GunId, reportedKeep: number | undefined, now: number) {
    const target = this.players.get(targetId);
    if (!target || target === p || !p.alive || p.downed || !target.alive || !finite(reportedDist)) return;
    if (!(HIT_REGIONS as readonly string[]).includes(region)) return;
    const gun = this.firedGun(p, w, now);
    if (!gun) return;
    // Distance check against the server's view of both players.
    const serverDist = dist3(eye(p), chest(target));
    if (serverDist > gun.alcanceMaximo || Math.abs(serverDist - reportedDist) > LAG_SLACK + serverDist * 0.1) return;
    if (!this.fireRate(p, gun, now)) return;
    const dist = Math.min(reportedDist, gun.alcanceMaximo);
    const kind: KillKind = region === 'cabeca' ? 'head' : region === 'virilha' ? 'groin' : 'gun';
    const awards: Award[] = [];
    if (kind === 'head') awards.push({ label: 'headshot', value: SCORE.headshot });
    if (kind === 'groin') awards.push({ label: 'groin', value: SCORE.groin });
    if (dist > SCORE.longShotDistance) awards.push({ label: 'longShot', value: SCORE.longShot });
    // Went through wood/glass: never less than the weapon allows, never more than a clean hit.
    const keep = finite(reportedKeep) ? Math.min(1, Math.max(minPenetrationKeep(gun), reportedKeep!)) : 1;
    // The critical potion: every bullet does a head's damage (the hit still counts where it landed), except a
    // groin hit, which stays an instant kill.
    const crit = p.potion?.kind === 'critico' && p.potion.until > now;
    this.damage(target, p, computeDamage(gun, dist, critRegion(region, crit), keep), kind, eye(p), awards, gun.arma);
  }

  private onStab(p: SPlayer, targetId: number, behind: boolean, now: number) {
    const target = this.players.get(targetId);
    if (!target || target === p || !p.alive || p.downed || !target.alive) return;
    const knife = loadoutKnife(p.loadout);
    if (now - p.lastStab < knife.intervalo * 1000 * 0.75) return;
    const d = Math.hypot(p.state.p[0] - target.state.p[0], p.state.p[2] - target.state.p[2]);
    if (d > knife.alcanceInvestida + 1.5) return;
    p.lastStab = now;
    const awards: Award[] = [{ label: 'knife', value: SCORE.knife }];
    if (behind) awards.push({ label: 'backstab', value: SCORE.backstab });
    this.damage(target, p, knife.letal ? LETHAL_DAMAGE : 55, 'knife', eye(p), awards, 'faca');
  }

  private onBoom(p: SPlayer, msg: Extract<ClientMsg, { t: 'boom' }>, now: number) {
    const g = p.grenades.get(msg.id);
    if (!g || !vec(msg.p) || !Array.isArray(msg.hits)) return;
    const t = (now - g.thrownAt) / 1000;
    if (g.mine) {
      if (dist3(g.origin, msg.p) > 1.5) return; // mines don't move
    } else if (g.impact) {
      // Impact grenades go off whenever they touch something: the blast must be somewhere the throw
      // could have reached by now (speed, gravity, latency slack), within the flight time limit.
      const reach = g.speed * t + 4.9 * t * t + 3;
      if (t > g.fuse + 1 || dist3(g.origin, msg.p) > reach) return;
    } else if (t < g.fuse - 0.5) return; // can't explode much earlier than its fuse allows
    p.grenades.delete(msg.id);
    this.broadcast({ t: 'boom', owner: p.id, id: msg.id, p: msg.p }, p.id);
    // The mode's enemies the blast reached (zumbi), checked with the same tolerance as players.
    if (Array.isArray(msg.zs)) this.mode.blast?.(p, msg.p, msg.zs, g.blast);
    const seen = new Set<number>();
    let kills = 0;
    let self = false;
    for (const h of msg.hits.slice(0, NET.maxPlayers)) {
      const target = this.players.get(h?.target);
      if (!target || !target.alive || seen.has(target.id) || !finite(h.dist)) continue;
      seen.add(target.id);
      const serverDist = dist3(msg.p, chest(target));
      if (serverDist > g.blast.raioDano + 3 || Math.abs(serverDist - h.dist) > 3) continue;
      // A non-lethal blast protects other players only: your own grenade can kill you.
      const raw = explosionDamage(g.blast, h.dist);
      const dmg = target === p ? raw : clampExplosionDamage(g.blast, raw, target.health);
      if (dmg > 0) this.damage(target, target === p ? null : p, dmg, target === p ? 'explosion' : 'grenade', msg.p, [], target === p ? null : 'granada');
      if (!target.alive) {
        if (target === p) self = true;
        else kills++;
      }
    }
    // Sticker album: several with one grenade, the one that went off in the hand, taking them with you.
    if (kills) {
      stickerMax(p.conn.account, 'strike', kills);
      if (g.inHand) stickerAdd(p.conn.account, 'abraco-de-urso');
      if (self) stickerAdd(p.conn.account, 'kamikaze');
    }
  }

  private onTaunt(p: SPlayer, corpseId: number, now: number) {
    // Teammates don't dance on each other (co-op modes).
    if (this.mode.rules.coop) return;
    const c = this.corpses.get(corpseId);
    if (!c || !p.alive || p.dance || c.humiliated || c.claimedBy !== null || now > c.until || c.victim === p.id) return;
    if (Math.hypot(p.state.p[0] - c.p[0], p.state.p[2] - c.p[2]) > HUMILIATION.radius + 1.5) return;
    c.claimedBy = p.id;
    p.dance = { corpse: c.id, since: now, left: c.until - now };
    this.broadcast({ t: 'taunt', id: p.id, corpse: c.id });
  }

  private onTauntEnd(p: SPlayer, corpseId: number, done: boolean, now: number) {
    const c = this.corpses.get(corpseId);
    if (!p.dance || p.dance.corpse !== corpseId || !c) return;
    const completed = done && now - p.dance.since >= HUMILIATION.duration * 1000 - 400;
    const left = p.dance.left;
    p.dance = null;
    c.claimedBy = null;
    const awards: Award[] = [];
    if (completed) {
      c.humiliated = true;
      p.humiliations++;
      p.score += SCORE.humiliation;
      awards.push({ label: 'humiliation', value: SCORE.humiliation });
      const d = p.conn.account.delta;
      d.humiliations++;
      d.score += SCORE.humiliation;
      this.progress(p, [addAccountXp(p.conn.account, ACCOUNT_XP.perHumiliation)]);
      this.albumHumiliation(p, c, left);
    } else {
      c.until = Math.max(c.until, now + 1500);
    }
    this.broadcast({ t: 'tauntEnd', id: p.id, corpse: c.id, done: completed, awards, players: [this.playerInfo(p)] });
  }

  // --- Rules ------------------------------------------------------------------------------------------

  /** `weapon`: what dealt it (it gets the kill's points); null for falls, the dog, your own grenade. */
  private damage(target: SPlayer, attacker: SPlayer | null, amount: number, kind: KillKind, from: Vec3 | null, bonus: Award[], weapon: WeaponId | null) {
    if (!target.alive || target.downed || amount <= 0) return;
    // Between rounds nobody hurts anybody (falls and the map still do).
    if (attacker && attacker !== target && !this.mode.combatOpen()) return;
    const dealt = Math.min(target.health, amount);
    target.health -= dealt;
    target.lastDamageAt = this.now();
    if (attacker && attacker !== target) {
      target.lastHitBy = attacker.id;
      target.lastHitAt = target.lastDamageAt;
    }
    this.broadcast({ t: 'damage', target: target.id, attacker: attacker?.id ?? null, amount: dealt, health: target.health, from });
    if (target.health > 0) return;
    // The mode may take over instead of a death (zumbi: down, waiting for a revive).
    if (this.mode.onLethal?.(target, kind)) return;
    this.kill(target, attacker, kind, bonus, weapon);
  }

  private kill(victim: SPlayer, attacker: SPlayer | null, kind: KillKind, bonus: Award[], weapon: WeaponId | null) {
    const now = this.now();
    victim.alive = false;
    victim.downed = false;
    victim.health = 0;
    victim.boostUntil = 0;
    victim.humanity = false;
    victim.potion = null;
    victim.potionReady = 0;
    victim.deaths++;
    victim.deadAt = now;
    victim.grenades.clear();
    const dancing = !!victim.dance;
    const spree = victim.streak;
    victim.streak = victim.combo = 0;
    // Only death ends a dance (damage doesn't): the corpse is released without points.
    if (victim.dance) this.onTauntEnd(victim, victim.dance.corpse, false, now);
    const awards: Award[] = [];
    // A co-op death isn't another player's kill: the account's kill/death stats don't change.
    if (!this.mode.rules.coop) victim.conn.account.delta.deaths++;
    // Sticker album: dying on your own (a fall, the void, the dog, your own grenade).
    const own = attacker && attacker !== victim ? null : SELF_DEATH_STICKERS[kind];
    if (own) stickerAdd(victim.conn.account, own);
    // ...and whoever hit them a moment before gets the credit for the push (not for their own grenade).
    const pusher = victim.lastHitBy !== null && (kind === 'fall' || kind === 'void' || kind === 'dog') && now - victim.lastHitAt <= PUSH_MS ? this.players.get(victim.lastHitBy) : undefined;
    if (pusher && pusher !== victim) stickerAdd(pusher.conn.account, 'empurraozinho');
    victim.lastHitBy = null;
    if (victim.ping > LAG_MS) stickerAdd(victim.conn.account, 'rip-lag');
    if (attacker && attacker !== victim) {
      awards.push({ label: 'kill', value: SCORE.kill }, ...bonus);
      const points = awards.reduce((s, a) => s + a.value, 0);
      attacker.kills++;
      attacker.score += points;
      // Progress: the kill's points go to the weapon that made it; the account gets its own XP.
      const acct = attacker.conn.account;
      const d = acct.delta;
      d.kills++;
      d.score += points;
      if (kind === 'head') d.headshots++;
      if (kind === 'groin') d.groinKills++;
      if (kind === 'knife') d.knifeKills++;
      if (kind === 'grenade') d.grenadeKills++;
      if (awards.some((a) => a.label === 'backstab')) d.backstabs++;
      // Weapon points only where players fight with their own Arsenal (not with a mode's ladder).
      const w = this.mode.rules.weaponXp ? weaponOfKill(kind, isGun(weapon) ? weapon : null) : null;
      this.progress(attacker, [w ? addWeaponXp(acct, w, points) : null, addAccountXp(acct, ACCOUNT_XP.perKill)]);
      this.albumKill(attacker, victim, spree, dancing, now);
      victim.lastKiller = attacker.id;
    }
    // The mode's rules for the kill (ladder steps, the end of the round), before the players are announced.
    const after = this.mode.onKill(victim, attacker && attacker !== victim ? attacker : null, kind, weapon);
    const corpse: Corpse = {
      id: this.nextCorpse++,
      victim: victim.id,
      name: victim.name,
      sex: victim.sex,
      ap: victim.conn.account.profile.appearance,
      p: victim.state.p,
      yaw: victim.state.yaw,
      until: now + NET.corpseWindow * 1000,
      createdAt: now,
      humiliated: false,
      claimedBy: null,
      killer: attacker && attacker !== victim ? attacker.id : null,
    };
    this.corpses.set(corpse.id, corpse);
    const players = [this.playerInfo(victim), ...(attacker && attacker !== victim ? [this.playerInfo(attacker)] : [])];
    const { id, victim: v, name, sex, ap, p, yaw, until } = corpse;
    this.broadcast({ t: 'kill', victim: victim.id, attacker: attacker?.id ?? null, kind, ...(weapon && attacker && attacker !== victim ? { arma: weapon } : {}), awards, corpse: { id, victim: v, name, sex, ap, p, yaw, until }, players });
    for (const m of after) this.broadcast(m);
  }

  /** The sticker album's counters for a player's kill of another (`spree`: the victim's kills before dying). */
  private albumKill(a: SPlayer, victim: SPlayer, spree: number, dancing: boolean, now: number) {
    const acct = a.conn.account;
    a.streak++;
    a.combo = now - a.lastKillAt <= COMBO_MS ? a.combo + 1 : 1;
    a.lastKillAt = now;
    stickerMax(acct, 'embalado', a.streak);
    stickerMax(acct, 'combo', a.combo);
    if (a.lastKiller === victim.id) {
      stickerAdd(acct, 'vinganca');
      a.lastKiller = null;
    }
    if (spree >= SPREE) stickerAdd(acct, 'estraga-sequencia');
    if (dancing) stickerAdd(acct, 'estraga-prazer');
    if (a.alive && a.health <= LOW_HEALTH) stickerAdd(acct, 'com-um-pe-na-cova');
    if (a.humanity) stickerAdd(acct, 'humanidade-restaurada');
    if (a.boostUntil > now) stickerAdd(acct, 'cereja-do-bolo');
    if (a.potion?.kind === 'bebado' && a.potion.until > now) stickerAdd(acct, 'saude-hic');
    // The biscuit saved them: counts once per biscuit.
    if (a.biscuitLow && now - a.biscuitAt <= SCOOBY_MS) {
      stickerAdd(acct, 'scooby-dooby-doo');
      a.biscuitLow = false;
    }
  }

  /** The sticker album's counters for a dance completed on corpse `c` (`left`: the window it started with). */
  private albumHumiliation(p: SPlayer, c: Corpse, left: number) {
    const acct = p.conn.account;
    const victim = this.players.get(c.victim);
    if (victim) {
      stickerAdd(victim.conn.account, 'oprimido');
      if (victim.kills - p.kills >= GOLIATH_KILLS) stickerAdd(acct, 'davi-contra-golias');
    }
    if (p.lastOppressor === c.victim) {
      stickerAdd(acct, 'troco');
      p.lastOppressor = null;
    }
    if (victim) victim.lastOppressor = p.id;
    if (c.killer === null) stickerAdd(acct, 'chutando-cachorro-morto');
    else if (c.killer !== p.id) stickerAdd(acct, 'oportunista');
    if (left <= 1000) stickerAdd(acct, 'no-ultimo-segundo');
    stickerAdd(acct, `pe-de-valsa:${this.map}`);
  }

  /**
   * The sticker album's map gags: a checked prop this player hit (`recent`: their last ones, for the sequences:
   * the chime's scale, the drums and the gong, the bell and the horn that lose patience, the shooting gallery).
   */
  private albumProp(p: SPlayer, id: string, now: number) {
    const acct = p.conn.account;
    const recent = (p.propLog = [...p.propLog.filter((e) => now - e.at < PROP_MEMORY_MS), { id, at: now }]);
    const within = (ms: number, test: (id: string) => boolean) => recent.filter((e) => now - e.at <= ms && test(e.id));
    const forget = (test: (id: string) => boolean) => (p.propLog = recent.filter((e) => !test(e.id)));
    if (id === 'caminhao') {
      // The jingle plays at most every 4 s (client/world/blockoutMap.ts): one count per jingle.
      if (now - p.truckAt >= 4000) {
        p.truckAt = now;
        stickerAdd(acct, 'sorveteiro-fantasma');
      }
    } else if (id === 'dragao') stickerAdd(acct, 'proibido-acordar');
    else if (id === 'fantasma') stickerAdd(acct, 'mudou-pro-mausoleu');
    else if (id === 'caldeirao') stickerAdd(acct, 'patinhos-em-fila');
    else if (id.startsWith('carrilhao:')) {
      // Dó, ré, mi, fá, sol: the last five chime notes in order, within 6 s.
      const last = recent.filter((e) => e.id.startsWith('carrilhao:')).slice(-5);
      if (last.length === 5 && now - last[0].at <= 6000 && last.every((e, i) => e.id === `carrilhao:${i}`)) {
        stickerAdd(acct, 'maestro');
        forget((x) => x.startsWith('carrilhao:'));
      }
    } else if (id.startsWith('tambor:') || id === 'gongo') {
      // The four drums and the gong, within 30 s.
      const band = new Set(within(30_000, (x) => x.startsWith('tambor:') || x === 'gongo').map((e) => e.id));
      if (band.size === 5) {
        stickerAdd(acct, 'banda-marcial');
        forget((x) => x.startsWith('tambor:') || x === 'gongo');
      }
    } else if (id === 'sinocapela') {
      // The chapel bell: 5 rings within 8 s and it says "EU JÁ OUVI." (client/world/hauntedTown.ts).
      if (within(8000, (x) => x === id).length >= 5) {
        stickerAdd(acct, 'eu-ja-ouvi');
        forget((x) => x === id);
      }
    } else if (id === 'buzina') {
      // The horn: 6 honks within 6 s and the neighbour yells "CHEGA.".
      if (within(6000, (x) => x === id).length >= 6) {
        stickerAdd(acct, 'chega');
        forget((x) => x === id);
      }
    } else if (id.startsWith('alvo:')) {
      // The shooting gallery: all seven targets before the first stands back up (5 s).
      if (new Set(within(5000, (x) => x.startsWith('alvo:')).map((e) => e.id)).size === 7) {
        stickerAdd(acct, 'mosca-no-alvo');
        forget((x) => x.startsWith('alvo:'));
      }
    }
  }

  private tick() {
    const now = this.now();
    const dt = 1 / NET.tickRate;
    this.mode.tick(now);
    for (const p of this.players.values()) {
      // The cherry wore off: back to the body's max (the extra health goes with it).
      if (p.boostUntil && now >= p.boostUntil) {
        p.boostUntil = 0;
        p.health = Math.min(p.health, p.body.maxHealth);
      }
      const max = this.maxHealth(p, now);
      if (p.alive && !p.downed && p.health < max && now - p.lastDamageAt > HEALTH.regenDelay * 1000) {
        p.health = Math.min(max, p.health + HEALTH.regenPerSecond * dt);
      }
      const xpBefore = p.conn.account.profile.xp;
      const up = addTime(p.conn.account, dt, p.alive);
      if (p.conn.account.profile.xp !== xpBefore) this.progress(p, [up]);
    }
    for (const c of this.corpses.values()) {
      if (c.claimedBy === null && now > c.until + 2000) this.corpses.delete(c.id);
    }
    if (this.players.size === 0) return;
    this.broadcast({
      t: 'snap',
      time: now,
      players: [...this.players.values()].map((p) => ({ id: p.id, s: p.state, h: Math.ceil(p.health), alive: p.alive })),
    });
    // The mode's own moving things (zumbi: the zombies), at the same rate.
    const extra = this.mode.snapshot?.();
    if (extra) this.broadcast(extra);
    this.scoreTimer += dt;
    if (this.scoreTimer >= 1) {
      this.scoreTimer = 0;
      this.broadcast({ t: 'scores', players: [...this.players.values()].map((p) => this.playerInfo(p)) });
      // Album stickers that went up (from anything: kills, dances, the zumbi stats, time played), to their owner.
      for (const p of this.players.values()) for (const up of stickerUps(p.conn.account)) p.conn.send({ t: 'figurinha', ...up });
    }
  }

  /**
   * Tells the player their new progress. An upgrade unlocked by a level up goes into their hands at once only
   * in a mode without a locked loadout (none online today); otherwise it waits for the next match.
   */
  private progress(p: SPlayer, ups: (LevelUp | null)[]) {
    const levelUps = ups.filter((u): u is LevelUp => !!u);
    const rules = this.mode.rules;
    if (levelUps.length && !rules.lockedLoadout && rules.weapons === 'arsenal') {
      const lo = loadoutOf(p.conn.account);
      if (JSON.stringify(lo) !== JSON.stringify(p.loadout)) this.setLoadout(p, lo);
    }
    if (!levelUps.length) p.conn.send(progressMsg(p.conn.account));
    for (const up of levelUps) p.conn.send(progressMsg(p.conn.account, up));
  }

  /** Other weapons in a player's hands mid-match, told to everyone (the player too: these are the ones validated). */
  private setLoadout(p: SPlayer, lo: Loadout) {
    p.loadoutBefore = p.loadout;
    p.loadoutAt = this.now();
    p.loadout = lo;
    if (!lo.secundaria && p.held === 'secundaria') p.held = 'primaria';
    this.broadcast({ t: 'playerLoadout', id: p.id, lo });
  }

  /** Out of the round that ended: dead with the respawn allowed at once, nothing carried over from the last life. */
  private resetForRound(p: SPlayer) {
    const now = this.now();
    if (p.dance) this.onTauntEnd(p, p.dance.corpse, false, now);
    p.alive = false;
    p.downed = false;
    p.health = 0;
    p.deadAt = now - NET.respawnDelay * 1000;
    p.boostUntil = 0;
    p.humanity = false;
    p.potion = null;
    p.potionReady = 0;
    p.grenades.clear();
    p.streak = p.combo = 0;
  }
}
