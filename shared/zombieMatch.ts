// A zumbi match (co-op waves, shared/zombies.ts): the waves, every zombie and boss, the Mystery Coffin and the
// players' match state (money, carried items, down / dead). It runs on the server for online sessions
// (server/modes.ts, through Session) and in the browser for the solo game (client/zombies/local.ts), with the
// same rules: only the host differs (who applies damage to players, grants XP, hands out weapons).
//
// Zombies walk on the map's navigation mesh (the one the offline bots use, baked for the server: see
// tools/bake-navmesh.ts) with Detour's crowd: path following, steering and spacing between agents for the whole
// horde at once. Each one has a few states: rising from the ground, chasing the nearest standing player,
// winding up a swipe (hits if the player is still in reach when it lands), and its kind's special (a bloater
// bursts, a spitter spits from a distance, bosses have telegraphed moves). Everything is decided here, on the
// host's clock, and told to the players as events: the clients only draw and report their own shots.
//
// Zombies come out of the grave field outside the cemetery wall (a telegraph first: 'zfx' 'rise') and get in
// through its gaps. Players can barricade a gap (shared/barricades.ts): its polygons, baked apart with a flag of
// their own, are then excluded from the crowd's main query filter, so the horde paths around to the gaps still
// open. Bruisers and bosses use a second filter that ignores barricades: they walk up to the boards and tear them
// down, and so does everyone else when there's no open way left. A zombie at the boards switches back to the
// main filter, which holds it in front of them until the last board falls.
//
// Pets (shared/pets.ts, PF-29): a player can bring one, and it acts by itself when its ability is ready (the
// numbers in data/pets.json): the Amora holds a zombie by the shin, the Bruxinha traps one in a duck float, the cat
// lifts its owner when they go down (pausing while a teammate revives them: it never takes a revive's place), the
// weasel nails boards back, the otter's stone cancels a spit or a bloater's swelling and the iguana's tail lures the
// zombies around. No damage and no money; the zombies ignore pets (they aren't in the match).
import { Crowd, NavMeshQuery, type CrowdAgent, type NavMesh } from 'recast-navigation';
import type { Loadout } from './arsenal';
import type { BoxInfo, PetAct, ServerMsg, Vec3, ZBarricade, ZHazard, ZombiePlayer, ZombieSync, ZPhase, ZSummaryRow } from './protocol';
import {
  atGap,
  boardDamage,
  buildBarricade,
  emptyBarricade,
  gapFrame,
  gateFlag,
  hitBarricade,
  inGap,
  inReach,
  insideWall,
  isClosed,
  nailBoard,
  needsWork,
  smashesThrough,
  thornsAt,
  wallBetween,
} from './barricades';
import { tombUnder } from './tombs';
import { PET_ABILITIES, type PetId } from './pets';
import { treeUnder } from './trees';
import { onAltar } from './altar';
import {
  isBoss,
  itemOf,
  kindScale,
  killMoney,
  killXp,
  pickType,
  rollBox,
  rollFlaw,
  startItems,
  waveSpec,
  WAVES,
  withItem,
  Z_KINDS,
  ZF,
  zombieHit,
  zombieHp,
  zombieLoadout,
  ZOMBIE,
  type BossId,
  type KillHow,
  type WaveSpec,
  type ZFlaw,
  type ZItems,
  type ZKind,
  type ZNet,
  type ZombieMapData,
  type ZType,
} from './zombies';

/** What the match needs from where it runs. */
export interface ZombieHost {
  /** Milliseconds, monotonic (the server's clock; the game clock offline). */
  now(): number;
  rng(): number;
  /** An event for every player. */
  emit(msg: ServerMsg): void;
  /** A zombie (or the yard: the thorns, the altar, the crows, `kind`) hurts a standing player; if that takes them to 0, the host calls `lethal`. */
  hurt(id: number, amount: number, from: Vec3, kind?: ZHazard): void;
  /** Account XP (online only). */
  giveXp(id: number, xp: number): void;
  /** Other weapons in a player's hands. */
  setLoadout(id: number, lo: Loadout): void;
  /** A player down bled out: dead until the next break. */
  bleedOut(id: number): void;
  /** A player down is back up with `health`. */
  revive(id: number, health: number): void;
  /** A dead player may come back now (a break started), with the starting weapons. */
  allowRespawn(id: number): void;
  /** A new match: everyone comes back at once with the starting weapons. */
  newMatch(ids: number[]): void;
  /** Something for a player's zumbi stats (the server saves them; solo play has nowhere to). */
  stat?(id: number, s: ZStat): void;
  /** A player's health as a fraction of their max (0..1): the iguana drops her tail when it's low. */
  health?(id: number): number;
}

/** What counts toward a player's zumbi stats. */
export type ZStat =
  | { e: 'kill'; kind: ZKind; how: KillHow }
  | { e: 'down' }
  | { e: 'death' }
  | { e: 'revive' }
  | { e: 'wave' }
  | { e: 'coffin' }
  /** Zombies a bloater's burst took with it, credited to whoever killed the bloater. */
  | { e: 'chain'; kills: number }
  /** A barricade built or a board nailed back. */
  | { e: 'board' }
  /** The match ended; `dead`: the player was dead (not down) when it did. */
  | { e: 'end'; won: boolean; wave: number; dead: boolean };

/** A player as the host sees them each tick. */
export interface ZombieInput {
  id: number;
  feet: Vec3;
  /** Feet on the ground (the mayor's shockwave only hits grounded players: jumping dodges it). */
  grounded: boolean;
  /** Alive for the host (dead players wait for a respawn). */
  alive: boolean;
}

interface Part {
  id: number;
  name: string;
  money: number;
  earned: number;
  kills: number;
  headshots: number;
  downs: number;
  revives: number;
  xp: number;
  state: 'up' | 'down' | 'dead';
  downUntil: number;
  feet: Vec3;
  grounded: boolean;
  alive: boolean;
  items: ZItems;
  reviving: { target: number; since: number } | null;
  /** Money earned nailing boards since the last wave ended (capped by barricadas.reparoTetoOnda). */
  repairPaid: number;
  /** Bleeding from the thorns until then (0: not bleeding), the next bleed tick, the next thorn hit. */
  bleedUntil: number;
  bleedNext: number;
  thornNext: number;
  /** Joined during a wave and hasn't played yet: out (like the dead) until the break, and no end-of-match credit. */
  waiting: boolean;
  /** The vigil's extra XP below 1 point, carried to the next gain (a 3 XP kill with +10% must not round the bonus away). */
  xpCarry: number;
  /** On a tombstone since then (0: not on one), and when the next ghosts come. */
  tombSince: number;
  tombNext: number;
  /** The last time a ghost hit this player (at most one hit every fantasmas.golpeIntervaloSegundos). */
  ghostHitAt: number;
  /** On the altar since then (0: not on it). */
  altarSince: number;
  /** Profaned at the altar until then (0: not): the horde goes after them first. */
  profanedUntil: number;
  /** Up a tree since then (0: not up one). */
  treeSince: number;
  /** The crows peck them until then (0: no crows), and when they peck next. */
  crowsUntil: number;
  crowsNext: number;
  /** The pet along (null: none). */
  pet: PetState | null;
}

/** A player's pet in the match. */
interface PetState {
  id: PetId;
  /** When it can act again (ms; 0: now, or busy with no end set yet). */
  ready: number;
  /** The cat's lifts left this match. */
  charges: number;
  /** The cat lifting its owner, who's down: from `start` on, `done` ms of work so far; `paused` while a teammate revives them. */
  lift: { start: number; done: number; paused: boolean } | null;
  /** The weasel at barricade `gap`: the next board at `next`, `left` more this time. */
  nail: { gap: number; next: number; left: number } | null;
}

const freshPet = (id: PetId): PetState => ({ id, ready: 0, charges: id === 'gato' ? PET_ABILITIES.gato.cargas : 0, lift: null, nail: null });

/** A ghost from the haunted graves: flies after `target` through anything until `until`. */
interface Ghost {
  id: number;
  target: number;
  pos: Vec3;
  until: number;
  nextHit: number;
  /** Where around the target it circles (each ghost its own side and bob). */
  phase: number;
}

type Act = 'swipe' | 'fuse' | 'spit' | 'slam' | 'summon' | 'scream' | 'blink' | 'chargeWindup' | 'charge' | 'pound' | 'smash';

/** The crowd's query filters: around shut gaps (everyone, and anyone at the boards), or through them. */
const FILTER_AROUND = 0;
const FILTER_THROUGH = 1;

interface Zombie {
  id: number;
  kind: ZKind;
  hp: number;
  max: number;
  agent: CrowdAgent;
  pos: Vec3;
  yaw: number;
  speed: number;
  run: boolean;
  riseUntil: number;
  target: number | null;
  retargetAt: number;
  goal: Vec3 | null;
  repathAt: number;
  act: Act | null;
  actUntil: number;
  /** The act's own data: where a spit goes, a charge's line, players a charge already hit. */
  actTo: Vec3 | null;
  actFrom: Vec3 | null;
  actHit: Set<number>;
  cd: Partial<Record<Act | 'rage', number>>;
  nextAttack: number;
  damage: Map<number, number>;
  hidden: boolean;
  enraged: boolean;
  stuckAt: number;
  stuckPos: Vec3;
  /** Called by a boss: doesn't count toward the wave's zombies. */
  extra: boolean;
  dead: boolean;
  /** The crowd filter it walks with (FILTER_AROUND / FILTER_THROUGH). */
  filter: number;
  /** The gap whose boards it's tearing at (-1: none). */
  smash: number;
  /** A pet's doing (ms): held by the shin (or a jolt), in the duck float, dizzy from a stone, after the iguana's tail (at `lureAt`). */
  heldUntil: number;
  duckUntil: number;
  dazeUntil: number;
  lureUntil: number;
  lureAt: Vec3 | null;
}

interface Shockwave {
  center: Vec3;
  start: number;
  speed: number;
  radius: number;
  thick: number;
  damage: number;
  hit: Set<number>;
}

const RISE_MS = 1200;
const BOSS_RISE_MS = 2600;
/** How long before a zombie comes out its spot is shown (hands out of the ground, a glow, a groan). */
const RISE_TELL_MS = 900;
const RETARGET_MS = 500;
const HALF = { x: 2, y: 4, z: 2 };
const dist2 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const v3 = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z];
const pt = (p: Vec3) => ({ x: p[0], y: p[1], z: p[2] });
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Facing a direction, in the game's convention (yaw 0 looks down -Z). */
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
/** A copy of a player's items (the damaged ones' list included). */
const copyItems = (i: ZItems): ZItems => ({ ...i, ...(i.danificadas ? { danificadas: { ...i.danificadas } } : {}) });

export class ZombieMatch {
  phase: ZPhase = 'waiting';
  wave = 0;
  /** When the countdown, break or summary ends (0 during a wave). */
  until = 0;
  readonly parts = new Map<number, Part>();
  readonly zombies = new Map<number, Zombie>();
  private spec: WaveSpec = waveSpec(1, 1);
  private spawned = 0;
  private killed = 0;
  private nextSpawnAt = 0;
  private nextId = 1;
  private boss: Zombie | null = null;
  private startedAt = 0;
  /** The coffin, and the roll it's spinning toward (decided when paid, shown when it stops). */
  /** The chapel's totem: the Vigília Sem Trégua, on for the rest of the match once someone paid for it. */
  readonly totem = { on: false, by: null as number | null };
  /** The ghosts of the haunted graves (whoever stands on a tombstone calls them). */
  readonly ghosts = new Map<number, Ghost>();
  private ghostSeq = 0;
  private box: BoxInfo & { pending: string | null; pendingFlaw: ZFlaw | null } = { state: 'idle', by: null, item: null, flaw: null, until: 0, open: false, pending: null, pendingFlaw: null };
  private spits: { to: Vec3; at: number; damage: number; radius: number; from: Vec3 }[] = [];
  private waves: Shockwave[] = [];
  /** Zombies about to come out (their spot already shown), and when. */
  private rising: { at: Vec3; kind: ZType; run: boolean; time: number }[] = [];
  /** The barricades, in the map's gap order. */
  private readonly bars: ZBarricade[];
  /** Who's working on which barricade, and when the next board (or the frame) is done. */
  private readonly work = new Map<number, { gap: number; until: number }>();
  private crowd: Crowd;
  private query: NavMeshQuery;

  constructor(
    private host: ZombieHost,
    navMesh: NavMesh,
    private map: ZombieMapData,
  ) {
    this.crowd = new Crowd(navMesh, { maxAgents: 64, maxAgentRadius: 1 });
    this.query = new NavMeshQuery(navMesh);
    this.bars = map.barricadas.map(() => emptyBarricade());
    this.updateGates();
  }

  dispose() {
    this.crowd.destroy();
    this.query.destroy();
  }

  private get now() {
    return this.host.now();
  }

  // --- Players ---------------------------------------------------------------------------------------------

  /** `pet`: the pet the player brings (its PvE switch on), if any. */
  join(id: number, name: string, pet: PetId | null = null) {
    // During a wave nobody drops in: they wait, like the dead, and come in at the break.
    const waiting = this.phase === 'wave';
    this.parts.set(id, {
      id,
      name,
      money: ZOMBIE.dinheiroInicial,
      earned: 0,
      kills: 0,
      headshots: 0,
      downs: 0,
      revives: 0,
      xp: 0,
      state: waiting ? 'dead' : 'up',
      downUntil: 0,
      feet: [0, -50, 0],
      grounded: true,
      alive: false,
      items: startItems(),
      reviving: null,
      repairPaid: 0,
      bleedUntil: 0,
      bleedNext: 0,
      thornNext: 0,
      waiting,
      xpCarry: 0,
      tombSince: 0,
      tombNext: 0,
      ghostHitAt: 0,
      altarSince: 0,
      profanedUntil: 0,
      treeSince: 0,
      crowsUntil: 0,
      crowsNext: 0,
      pet: pet ? freshPet(pet) : null,
    });
    if (this.phase === 'waiting') this.countdown();
  }

  leave(id: number) {
    this.stopWork(id);
    const gone = this.parts.get(id);
    if (gone) this.clearPerch(gone);
    this.parts.delete(id);
    for (const p of this.parts.values()) if (p.reviving?.target === id) p.reviving = null;
    // Our own roll goes with us; a weapon we donated stays for the others.
    if (this.box.by === id && ((this.box.state === 'offer' && !this.box.open) || this.box.state === 'rolling')) this.setBox('idle', null, null, null, 0);
    if (!this.parts.size) this.reset();
  }

  /** The items a player starts with (the host gives them on joining). */
  loadoutOf(id: number): Loadout {
    return zombieLoadout(this.parts.get(id)?.items ?? startItems());
  }

  itemsOf(id: number): ZItems {
    return this.parts.get(id)?.items ?? startItems();
  }

  /** A player's match state, for the scoreboard. */
  info(id: number): ZombiePlayer | undefined {
    const p = this.parts.get(id);
    return p && { money: p.money, kills: p.kills, downs: p.downs, revives: p.revives, state: p.state, items: copyItems(p.items) };
  }

  sync(): ZombieSync {
    const { state, by, item, flaw, until, open } = this.box;
    return {
      phase: this.phase,
      wave: this.wave,
      until: this.until,
      total: this.spec.total,
      box: { state, by, item, flaw, until, ...(open ? { open } : {}) },
      down: [...this.parts.values()].filter((p) => p.state === 'down').map((p) => [p.id, p.downUntil]),
      bars: this.bars.map((b) => ({ ...b })),
      totem: this.totem.on,
      marks: [...this.parts.values()].filter((p) => p.profanedUntil).map((p) => [p.id, p.profanedUntil]),
      crows: [...this.parts.values()].filter((p) => p.crowsUntil).map((p) => p.id),
    };
  }

  /** A barricade as it is (a copy). */
  barricade(i: number): ZBarricade | undefined {
    const b = this.bars[i];
    return b && { ...b };
  }

  /**
   * A player's health reached 0. During a wave they go down (a teammate can revive them) and the host keeps
   * them alive: returns true. Otherwise (between waves) it's a plain death.
   */
  lethal(id: number): boolean {
    const p = this.parts.get(id);
    if (!p || p.state !== 'up' || this.phase !== 'wave') return false;
    p.state = 'down';
    p.downs++;
    this.host.stat?.(id, { e: 'down' });
    p.downUntil = this.now + ZOMBIE.jogador.caidoSegundos * 1000;
    p.reviving = null;
    for (const o of this.parts.values()) if (o.reviving?.target === id) o.reviving = null;
    this.host.emit({ t: 'zdown', id, until: p.downUntil });
    // The cat comes to lift them (a while after the fall, slower than a teammate): never through `reviving`.
    if (p.pet?.id === 'gato' && p.pet.charges > 0) {
      const G = PET_ABILITIES.gato;
      const start = this.now + G.espera * 1000;
      p.pet.lift = { start, done: 0, paused: false };
      this.emitPet(p, 'lift', start + G.segundos * 1000);
    }
    this.checkLoss();
    return true;
  }

  /**
   * Whether a player whose health runs out now would go down with their cat coming to lift them (the solo game has
   * no 'down' otherwise: alone, running out of health is the end).
   */
  petCanLift(id: number): boolean {
    const p = this.parts.get(id);
    return !!p && p.state === 'up' && this.phase === 'wave' && p.pet?.id === 'gato' && p.pet.charges > 0;
  }

  /** A player died (any cause: bled out, fell, the void). */
  died(id: number) {
    const p = this.parts.get(id);
    if (!p) return;
    p.state = 'dead';
    p.alive = false;
    p.reviving = null;
    this.host.stat?.(id, { e: 'death' });
    this.checkLoss();
  }

  /** Holding E over a teammate who's down: the revive completes after jogador.reanimarSegundos. */
  revive(by: number, target: number, on: boolean) {
    const r = this.parts.get(by);
    const t = this.parts.get(target);
    if (!r) return;
    if (!on) {
      if (r.reviving) this.host.emit({ t: 'zrevive', id: r.reviving.target, by, until: 0 });
      r.reviving = null;
      return;
    }
    if (!t || r.state !== 'up' || t.state !== 'down' || r.reviving?.target === target) return;
    if (dist2(r.feet, t.feet) > ZOMBIE.jogador.reanimarAlcance + 1 || Math.abs(r.feet[1] - t.feet[1]) > 2) return;
    if (r.reviving) this.host.emit({ t: 'zrevive', id: r.reviving.target, by, until: 0 });
    r.reviving = { target, since: this.now };
    this.host.emit({ t: 'zrevive', id: target, by, until: this.now + ZOMBIE.jogador.reanimarSegundos * 1000 });
  }

  // --- The Mystery Coffin ------------------------------------------------------------------------------------

  /**
   * E at the coffin: takes the weapon it's offering this player (or one a teammate donated), or pays and spins
   * it. The roll (the item, and whether it comes damaged) is made here when paid; everyone sees it when the
   * coffin stops.
   */
  useBox(id: number) {
    const p = this.parts.get(id);
    if (!p || p.state !== 'up' || this.phase === 'waiting' || this.phase === 'over') return;
    const [x, y, z] = this.map.caixa;
    if (Math.hypot(p.feet[0] - x, p.feet[2] - z) > ZOMBIE.caixa.alcance + 1 || Math.abs(p.feet[1] - y) > 2) return;
    if (this.box.state === 'offer' && this.box.open) {
      // Donated: anyone but the donor takes it.
      if (this.box.by !== id) this.takeBox(p);
      return;
    }
    if (this.box.state === 'offer' && this.box.by === id) return this.takeBox(p);
    if (this.box.state !== 'idle' || p.money < ZOMBIE.caixa.custo) return;
    p.money -= ZOMBIE.caixa.custo;
    this.host.stat?.(id, { e: 'coffin' });
    const rng = () => this.host.rng();
    const it = rollBox(rng, p.items);
    this.box.pending = it.id;
    this.box.pendingFlaw = rollFlaw(rng, it);
    this.setBox('rolling', id, null, null, this.now + ZOMBIE.caixa.girarSegundos * 1000, p.money);
  }

  private takeBox(p: Part) {
    const it = itemOf(this.box.item);
    if (!it) return;
    // The weapon in that slot is thrown away (damaged or not: there's no repair, only another roll).
    p.items = withItem(p.items, it, this.box.flaw);
    this.host.setLoadout(p.id, zombieLoadout(p.items));
    this.setBox('idle', null, null, null, 0);
  }

  /**
   * Z on the weapon the coffin is offering us: we don't want it, but it stays there (same item, same flaw) for
   * anyone else to take with E, for a while. It isn't handed to anyone, and we can't take it back.
   */
  donateBox(id: number) {
    const b = this.box;
    if (!this.parts.has(id) || b.state !== 'offer' || b.by !== id || b.open) return;
    this.setBox('offer', id, b.item, b.flaw, this.now + ZOMBIE.caixa.doacaoSegundos * 1000, undefined, true);
  }

  /** X on the weapon the coffin is offering us: turned down, it's gone and the coffin closes (free to spin again). */
  refuseBox(id: number) {
    const b = this.box;
    if (!this.parts.has(id) || b.state !== 'offer' || b.by !== id || b.open) return;
    this.setBox('idle', null, null, null, 0);
  }

  private setBox(state: BoxInfo['state'], by: number | null, item: string | null, flaw: ZFlaw | null, until: number, money?: number, open = false) {
    Object.assign(this.box, { state, by, item, flaw, until, open });
    this.host.emit({ t: 'zbox', state, by, item, flaw, until, ...(open ? { open } : {}), ...(money !== undefined ? { money } : {}) });
  }

  private tickBox(now: number) {
    const b = this.box;
    if (b.state === 'idle' || now < b.until) return;
    // Left on offer too long (ours, or a donated one nobody took): gone.
    if (b.state === 'rolling') this.setBox('offer', b.by, b.pending, b.pendingFlaw, now + ZOMBIE.caixa.ofertaSegundos * 1000);
    else this.setBox('idle', null, null, null, 0);
  }

  // --- Barricades ----------------------------------------------------------------------------------------------

  /**
   * Holding E at gap `i` (`on` false: let go): with no barricade there, building it (paid when done, every board
   * at once); otherwise nailing back the boards it lost, one at a time, for a small reward.
   */
  barricadeWork(by: number, i: number, on: boolean) {
    const p = this.parts.get(by);
    if (!p) return;
    const cur = this.work.get(by);
    const valid = Number.isInteger(i) && i >= 0 && i < this.bars.length;
    if (!on || !valid) return this.stopWork(by);
    if (cur?.gap === i) return;
    this.stopWork(by);
    if (p.state !== 'up' || this.phase === 'waiting' || this.phase === 'over') return;
    const b = this.bars[i];
    if (!inReach(this.map.barricadas[i], p.feet) || !needsWork(b)) return;
    if (!b.built && p.money < ZOMBIE.barricadas.custo) return;
    const until = this.now + (b.built ? ZOMBIE.barricadas.repararSegundos : ZOMBIE.barricadas.erguerSegundos) * 1000;
    this.work.set(by, { gap: i, until });
    this.host.emit({ t: 'zbarwork', i, by, until });
  }

  private stopWork(by: number) {
    const w = this.work.get(by);
    if (!w) return;
    this.work.delete(by);
    this.host.emit({ t: 'zbarwork', i: w.gap, by, until: 0 });
  }

  /** Someone (a zombie, or a player) standing in the gap itself: it can't be shut on them. */
  private gapBusy(i: number): boolean {
    const g = this.map.barricadas[i];
    for (const z of this.zombies.values()) if (!z.dead && inGap(g, z.pos, 0.35)) return true;
    for (const p of this.parts.values()) if (p.state !== 'dead' && p.alive && inGap(g, p.feet, 0.3)) return true;
    return false;
  }

  private tickWork(now: number) {
    const B = ZOMBIE.barricadas;
    for (const [id, w] of [...this.work]) {
      const p = this.parts.get(id);
      const b = this.bars[w.gap];
      if (!p || p.state !== 'up' || !inReach(this.map.barricadas[w.gap], p.feet) || !needsWork(b) || this.phase === 'waiting' || this.phase === 'over') {
        this.stopWork(id);
        continue;
      }
      if (now < w.until) continue;
      // The gap shuts with this board: it waits until nobody stands in it.
      if (!isClosed(b) && this.gapBusy(w.gap)) continue;
      if (!b.built) {
        if (p.money < B.custo) {
          this.stopWork(id);
          continue;
        }
        p.money -= B.custo;
        buildBarricade(b);
        this.updateGates();
        this.emitBar(w.gap, 'build', { by: id, money: p.money });
        this.host.stat?.(id, { e: 'board' });
        this.stopWork(id);
        continue;
      }
      const wasClosed = isClosed(b);
      nailBoard(b);
      if (!wasClosed) this.updateGates();
      const award = Math.max(0, Math.min(B.reparoDinheiro, B.reparoTetoOnda - p.repairPaid));
      if (award > 0) {
        this.pay(p, award);
        p.repairPaid += award;
      }
      this.emitBar(w.gap, 'nail', { by: id, ...(award > 0 ? { award, money: p.money } : {}) });
      this.host.stat?.(id, { e: 'board' });
      if (!needsWork(b)) this.stopWork(id);
      else {
        w.until = now + B.repararSegundos * 1000;
        this.host.emit({ t: 'zbarwork', i: w.gap, by: id, until: w.until });
      }
    }
  }

  private emitBar(i: number, fx: 'build' | 'nail' | 'hit' | 'break' | 'reset', extra: { by?: number; award?: number; money?: number } = {}) {
    this.host.emit({ t: 'zbar', i, fx, ...this.bars[i], ...extra });
  }

  /** A blow (or a blast) on barricade `i`'s boards; the last board falling opens the gap again. */
  private hurtBarricade(i: number, amount: number) {
    const b = this.bars[i];
    if (!b || !isClosed(b) || amount <= 0) return;
    hitBarricade(b, amount);
    if (isClosed(b)) return this.emitBar(i, 'hit');
    this.updateGates();
    this.emitBar(i, 'break');
  }

  /** The shut gaps leave the crowd's main filter and the match's queries; the through filter keeps them all. */
  private updateGates() {
    let mask = 0;
    this.bars.forEach((b, i) => {
      if (isClosed(b)) mask |= gateFlag(i);
    });
    this.crowd.getFilter(FILTER_AROUND).excludeFlags = mask;
    this.crowd.getFilter(FILTER_THROUGH).excludeFlags = 0;
    this.query.defaultFilter.excludeFlags = mask;
    // Paths through a gap that just shut are replanned by the crowd itself; a gap that just opened may be the
    // shorter way now: everyone asks for a new path.
    for (const z of this.zombies.values()) z.goal = null;
  }

  /** Back to no barricades at all (a new match); `announce`: tell the players. */
  private resetBarricades(announce: boolean) {
    for (const id of [...this.work.keys()]) this.stopWork(id);
    this.bars.forEach((b, i) => {
      const had = b.built;
      Object.assign(b, emptyBarricade());
      if (had && announce) this.emitBar(i, 'reset');
    });
    this.updateGates();
  }

  // --- Damage to zombies -------------------------------------------------------------------------------------

  /** Whether a zombie can be hit right now (alive, not vanished or mid-charge), and where it is. */
  hittable(zid: number): Zombie | null {
    const z = this.zombies.get(zid);
    return z && !z.dead && !z.hidden ? z : null;
  }

  /** Damage dealt to a zombie by `by` (null: nothing a player did). Returns false if it couldn't take it. */
  damage(zid: number, by: number | null, amount: number, how: KillHow): boolean {
    const z = this.hittable(zid);
    if (!z || amount <= 0 || this.phase === 'over') return false;
    const dealt = Math.min(z.hp, amount);
    z.hp -= dealt;
    if (by !== null) z.damage.set(by, (z.damage.get(by) ?? 0) + dealt);
    if (z.kind === 'prefeito' && !z.enraged && z.hp <= z.max * (ZOMBIE.chefes.prefeito.furia?.vida ?? 0.5)) this.enrage(z);
    if (z.hp <= 0) this.kill(z, by, how);
    return true;
  }

  private kill(z: Zombie, by: number | null, how: KillHow) {
    z.dead = true;
    this.crowd.removeAgent(z.agent);
    this.zombies.delete(z.id);
    if (!z.extra && !isBoss(z.kind)) this.killed++;
    if (z === this.boss) this.boss = null;
    const killer = by !== null ? this.parts.get(by) : undefined;
    let award: number | undefined;
    if (killer) {
      award = killMoney(z.kind, how);
      this.pay(killer, award);
      killer.kills++;
      if (how === 'head') killer.headshots++;
      this.host.stat?.(killer.id, { e: 'kill', kind: z.kind, how });
      this.xp(killer, killXp(z.kind));
    }
    this.host.emit({ t: 'zdie', id: z.id, by: killer ? by : null, how, ...(killer ? { award, money: killer.money } : {}) });
    if (killer) {
      // Assists: everyone else who did a good share of its health.
      const assists: [number, number][] = [];
      for (const [pid, dmg] of z.damage) {
        const a = this.parts.get(pid);
        if (!a || pid === by || dmg < z.max * ZOMBIE.dinheiro.assistenciaMinima) continue;
        this.pay(a, ZOMBIE.dinheiro.assistencia);
        assists.push([pid, a.money]);
      }
      if (assists.length) this.host.emit({ t: 'zmoney', m: assists, why: 'assist' });
    }
    if (isBoss(z.kind)) {
      // A boss pays the whole team.
      const b = ZOMBIE.chefes[z.kind];
      const team: [number, number][] = [];
      for (const p of this.parts.values()) {
        if (p.state === 'dead') continue;
        this.pay(p, b.dinheiroTime);
        this.xp(p, b.xpTime);
        team.push([p.id, p.money]);
      }
      if (team.length) this.host.emit({ t: 'zmoney', m: team, why: 'boss' });
    }
    if (z.kind === 'inchado') this.burst(z, killer ? by : null);
  }

  /** Money for a player (the vigil, once on, adds its share). */
  private pay(p: Part, amount: number) {
    if (this.totem.on) amount = Math.round(amount * ZOMBIE.totem.dinheiro);
    p.money += amount;
    p.earned += amount;
  }

  /** Account XP for a player (the vigil, once on, adds its share; fractions carry over to the next gain). */
  private xp(p: Part, amount: number) {
    if (amount <= 0) return;
    if (this.totem.on) {
      const extra = amount * (ZOMBIE.totem.xp - 1) + p.xpCarry;
      p.xpCarry = extra - Math.floor(extra);
      amount += Math.floor(extra);
    }
    p.xp += amount;
    this.host.giveXp(p.id, amount);
  }

  /**
   * E at the chapel's totem: pays and turns on the Vigília Sem Trégua for the rest of the match (no break between
   * waves; more money and XP). It can't be turned off; a new match starts without it.
   */
  useTotem(id: number) {
    const p = this.parts.get(id);
    const at = this.map.totem;
    if (!p || !at || p.state !== 'up' || this.totem.on || this.phase === 'waiting' || this.phase === 'over') return;
    if (Math.hypot(p.feet[0] - at[0], p.feet[2] - at[2]) > ZOMBIE.totem.alcance + 1 || Math.abs(p.feet[1] - at[1]) > 2) return;
    if (p.money < ZOMBIE.totem.custo) return;
    p.money -= ZOMBIE.totem.custo;
    Object.assign(this.totem, { on: true, by: id });
    this.host.emit({ t: 'ztotem', on: true, by: id, money: p.money });
    // During a break the next wave comes now: the vigil leaves no time to get ready.
    if (this.phase === 'break') this.until = Math.min(this.until, this.now + ZOMBIE.totem.intervaloSegundos * 1000);
  }

  /** A bloater bursts: hurts players and zombies around it (a player's kill gets the chain's credit). */
  private burst(z: Zombie, credit: number | null) {
    const e = ZOMBIE.tipos.inchado.explosao!;
    const now = this.now;
    this.host.emit({ t: 'zfx', fx: 'boom', id: z.id, at: z.pos, r: e.raio, t0: now, t1: now });
    for (const p of this.parts.values()) {
      if (p.state !== 'up') continue;
      const d = Math.hypot(p.feet[0] - z.pos[0], p.feet[1] - z.pos[1], p.feet[2] - z.pos[2]);
      if (d <= e.raio) this.zHurt(p, Math.round(e.dano * (1 - (0.6 * d) / e.raio)), z.pos);
    }
    let chain = 0;
    for (const o of [...this.zombies.values()]) {
      if (o.dead || dist2(o.pos, z.pos) > e.raio || Math.abs(o.pos[1] - z.pos[1]) > 2.5) continue;
      this.damage(o.id, credit, e.danoZumbi, 'blast');
      if (o.dead) chain++;
    }
    if (credit !== null && chain) this.host.stat?.(credit, { e: 'chain', kills: chain });
    // The blast blows boards off the barricades it reaches.
    this.map.barricadas.forEach((g, i) => {
      if (dist2(g.centro, z.pos) <= e.raio + g.largura / 2 && Math.abs(g.centro[1] - z.pos[1]) < 2.5) this.hurtBarricade(i, ZOMBIE.barricadas.dano.explosao);
    });
  }

  // --- Match flow ----------------------------------------------------------------------------------------------

  private countdown() {
    this.phase = 'countdown';
    this.wave = 0;
    this.startedAt = this.now;
    this.until = this.now + ZOMBIE.inicioSegundos * 1000;
    this.emitWave();
  }

  private emitWave() {
    this.host.emit({ t: 'zwave', phase: this.phase, wave: this.wave, until: this.until, total: this.spec.total, ...(this.spec.boss && this.phase === 'wave' ? { boss: this.spec.boss } : {}) });
  }

  private startWave(n: number) {
    this.phase = 'wave';
    this.wave = n;
    this.until = 0;
    this.spec = waveSpec(n, this.parts.size);
    this.spawned = 0;
    this.killed = 0;
    this.nextSpawnAt = this.now + 1500;
    this.emitWave();
    if (this.spec.boss) this.spawnBoss(this.spec.boss);
  }

  private endWave() {
    const now = this.now;
    // Everyone still in it is rewarded; those down get up, the dead come back for the break.
    const money: [number, number][] = [];
    for (const p of this.parts.values()) {
      if (p.state !== 'dead') {
        this.pay(p, ZOMBIE.dinheiro.onda);
        this.xp(p, ZOMBIE.xp.onda);
        this.host.stat?.(p.id, { e: 'wave' });
        money.push([p.id, p.money]);
      }
      if (p.state === 'down') this.standUp(p, null);
      // A new cap on the money for nailing boards: for the break and the next wave.
      p.repairPaid = 0;
    }
    if (money.length) this.host.emit({ t: 'zmoney', m: money, why: 'wave' });
    if (this.wave >= WAVES) return this.finish(true);
    this.phase = 'break';
    // The vigil (the chapel's totem) leaves no time to get ready.
    this.until = now + (this.totem.on ? ZOMBIE.totem.intervaloSegundos : this.spec.boss ? ZOMBIE.intervaloChefeSegundos : ZOMBIE.intervaloSegundos) * 1000;
    this.emitWave();
    for (const p of this.parts.values()) if (p.state === 'dead') this.respawnDead(p);
  }

  /** A dead player comes back for the break, with the starting weapons (the coffin's are lost) and their money. */
  private respawnDead(p: Part) {
    p.items = startItems();
    this.host.setLoadout(p.id, zombieLoadout(p.items));
    this.host.allowRespawn(p.id);
  }

  private standUp(p: Part, by: number | null, health = ZOMBIE.jogador.reanimarVida) {
    p.state = 'up';
    p.downUntil = 0;
    if (p.pet) p.pet.lift = null;
    this.host.revive(p.id, health);
    const r = by !== null ? this.parts.get(by) : undefined;
    this.host.emit({ t: 'zup', id: p.id, by: r ? by : null, ...(r ? { money: r.money } : {}) });
  }

  private checkLoss() {
    if (this.phase !== 'wave' || !this.parts.size) return;
    // Down with the cat coming to lift them isn't over yet.
    if ([...this.parts.values()].some((p) => p.state === 'up' || (p.state === 'down' && !!p.pet?.lift))) return;
    this.finish(false);
  }

  private finish(won: boolean) {
    const now = this.now;
    // Whoever is still waiting to come in (joined during this wave) never played it: no victory, no match.
    if (won) for (const p of this.parts.values()) if (!p.waiting) this.xp(p, ZOMBIE.xp.vitoria);
    for (const p of this.parts.values()) {
      if (p.waiting) continue;
      // Lost with nobody left to revive them: whoever is still down never gets up, so it's a death.
      if (!won && p.state === 'down') this.host.stat?.(p.id, { e: 'death' });
      this.host.stat?.(p.id, { e: 'end', won, wave: this.wave, dead: p.state === 'dead' });
    }
    for (const p of this.parts.values()) this.clearPerch(p);
    this.phase = 'over';
    this.until = now + ZOMBIE.fimSegundos * 1000;
    this.clearZombies(true);
    for (const id of [...this.work.keys()]) this.stopWork(id);
    if (this.box.state !== 'idle') this.setBox('idle', null, null, null, 0);
    const players: ZSummaryRow[] = [...this.parts.values()].map((p) => ({ id: p.id, name: p.name, kills: p.kills, headshots: p.headshots, earned: p.earned, downs: p.downs, revives: p.revives, xp: p.xp }));
    this.host.emit({ t: 'zend', won, wave: this.wave, secs: Math.round((now - this.startedAt) / 1000), players, restartAt: this.until });
    this.emitWave();
  }

  /** A new match for whoever is there: fresh money and weapons, no barricades, everyone back at once. */
  private restart() {
    for (const p of this.parts.values()) {
      Object.assign(p, { money: ZOMBIE.dinheiroInicial, earned: 0, kills: 0, headshots: 0, downs: 0, revives: 0, xp: 0, state: 'up', downUntil: 0, reviving: null, items: startItems(), repairPaid: 0, bleedUntil: 0, bleedNext: 0, thornNext: 0, waiting: false, xpCarry: 0, tombSince: 0, tombNext: 0, ghostHitAt: 0, altarSince: 0, profanedUntil: 0, treeSince: 0, crowsUntil: 0, crowsNext: 0 });
      // A new match: the pet is ready again, the cat with all its lifts.
      if (p.pet) p.pet = freshPet(p.pet.id);
      this.host.setLoadout(p.id, zombieLoadout(p.items));
    }
    this.resetBarricades(true);
    this.offTotem(true);
    this.ghosts.clear();
    this.spec = waveSpec(1, this.parts.size);
    this.host.newMatch([...this.parts.keys()]);
    this.countdown();
  }

  /** A new match starts without the vigil. */
  private offTotem(announce: boolean) {
    if (!this.totem.on) return;
    Object.assign(this.totem, { on: false, by: null });
    if (announce) this.host.emit({ t: 'ztotem', on: false, by: null });
  }

  /** Nobody left: back to waiting, no zombies, no barricades. */
  private reset() {
    this.clearZombies(false);
    this.resetBarricades(false);
    this.phase = 'waiting';
    this.wave = 0;
    this.until = 0;
    this.spits = [];
    this.waves = [];
    this.offTotem(false);
    this.ghosts.clear();
    Object.assign(this.box, { state: 'idle', by: null, item: null, flaw: null, until: 0, open: false, pending: null, pendingFlaw: null });
  }

  private clearZombies(announce: boolean) {
    for (const z of [...this.zombies.values()]) {
      z.dead = true;
      this.crowd.removeAgent(z.agent);
      if (announce) this.host.emit({ t: 'zdie', id: z.id, by: null, how: 'blast' });
    }
    this.zombies.clear();
    this.rising = [];
    this.boss = null;
    this.spits = [];
    this.waves = [];
  }

  // --- Spawning ------------------------------------------------------------------------------------------------

  private standing(): Part[] {
    return [...this.parts.values()].filter((p) => p.state === 'up' && p.alive);
  }

  /** A spawn point away from everyone (at least 14 m) but not too far, so the zombie arrives soon. */
  private spawnPoint(): Vec3 {
    const players = this.standing();
    const scored = this.map.surgir.map((s) => ({ s, d: players.length ? Math.min(...players.map((p) => Math.hypot(p.feet[0] - s[0], (p.feet[1] - s[1]) * 2, p.feet[2] - s[2]))) : 30 }));
    const far = scored.filter((c) => c.d >= 14).sort((a, b) => a.d - b.d);
    const pool = far.length ? far.slice(0, 6) : scored.sort((a, b) => b.d - a.d).slice(0, 3);
    return pool[Math.floor(this.host.rng() * pool.length)].s;
  }

  /** A walkable point near `p` (within `radius`), or the closest walkable point to it. */
  private walkable(p: Vec3, radius = 0): Vec3 {
    const c = this.query.findClosestPoint(pt(p), { halfExtents: HALF });
    if (!c.success || !c.polyRef) return p;
    if (radius > 0) {
      // (Detour picks a polygon touching the circle, then a point anywhere in it: a big one reaches far past it.)
      const r = this.query.findRandomPointAroundCircle(c.point, radius, { startRef: c.polyRef, halfExtents: HALF });
      if (r.success && Math.abs(r.randomPoint.y - c.point.y) < 1.5 && Math.hypot(r.randomPoint.x - c.point.x, r.randomPoint.z - c.point.z) <= radius * 1.5) return v3(r.randomPoint);
    }
    return v3(c.point);
  }

  private spawn(kind: ZKind, at: Vec3, extra = false, run = false): Zombie | null {
    const scale = kindScale(kind);
    const speedRange = isBoss(kind) ? null : run ? ZOMBIE.tipos[kind as ZType].correr : ZOMBIE.tipos[kind as ZType].andar;
    const speed = isBoss(kind) ? ZOMBIE.chefes[kind].andar : speedRange![0] + this.host.rng() * (speedRange![1] - speedRange![0]);
    const agent = this.crowd.addAgent(pt(at), {
      radius: 0.35 * Math.min(scale, 1.5),
      height: 1.8 * scale,
      maxSpeed: speed,
      maxAcceleration: isBoss(kind) ? 10 : 14,
      collisionQueryRange: 3,
      pathOptimizationRange: 14,
      separationWeight: 1.6,
    });
    // A full crowd (it never should be: the wave caps how many walk at once) takes no one else.
    if (agent.agentIndex < 0) return null;
    const now = this.now;
    const hp = zombieHp(kind, this.spec, this.parts.size);
    const z: Zombie = {
      id: this.nextId++,
      kind,
      hp,
      max: hp,
      agent,
      pos: [...at],
      yaw: this.host.rng() * Math.PI * 2,
      speed,
      run: run || kind === 'corredor',
      riseUntil: now + (isBoss(kind) ? BOSS_RISE_MS : RISE_MS),
      target: null,
      retargetAt: 0,
      goal: null,
      repathAt: 0,
      act: null,
      actUntil: 0,
      actTo: null,
      actFrom: null,
      actHit: new Set(),
      cd: {},
      nextAttack: 0,
      damage: new Map(),
      hidden: false,
      enraged: false,
      stuckAt: now + 8000,
      stuckPos: [...at],
      extra,
      dead: false,
      filter: FILTER_AROUND,
      smash: -1,
      heldUntil: 0,
      duckUntil: 0,
      dazeUntil: 0,
      lureUntil: 0,
      lureAt: null,
    };
    // The first boss moves come a little after it rises.
    if (kind === 'coveiro') z.cd.summon = now + (ZOMBIE.chefes.coveiro.invocar?.primeira ?? 6) * 1000;
    if (isBoss(kind)) for (const a of ['slam', 'scream', 'blink', 'chargeWindup', 'pound'] as const) z.cd[a] ??= now + BOSS_RISE_MS + 3000;
    this.zombies.set(z.id, z);
    return z;
  }

  private spawnBoss(b: BossId) {
    const at = this.walkable(this.map.chefe[b]);
    const z = this.spawn(b, at);
    if (!z) return;
    this.boss = z;
    const now = this.now;
    this.host.emit({ t: 'zfx', fx: 'intro', id: z.id, at, t0: now, t1: now + BOSS_RISE_MS });
  }

  /**
   * The wave's zombies, one every `interval` while there's room: its spot is shown first (the 'rise' telegraph:
   * hands out of the ground, a glow and a groan on the clients) and it comes out RISE_TELL_MS later.
   */
  private tickSpawns(now: number) {
    this.rising = this.rising.filter((r) => {
      if (now < r.time) return true;
      // A full crowd (it never should be: the wave caps how many walk at once): tried again later.
      if (!this.spawn(r.kind, r.at, false, r.run)) this.spawned--;
      return false;
    });
    const s = this.spec;
    if (this.spawned >= s.total || now < this.nextSpawnAt || this.zombies.size + this.rising.length >= s.maxAlive) return;
    this.nextSpawnAt = now + s.interval * 1000;
    const kind = pickType(s, () => this.host.rng());
    const run = kind === 'comum' && this.host.rng() < s.runFrac;
    const spot = this.spawnPoint();
    let at = this.walkable(spot, 1.5);
    // Always outside the wall (a random point can land in a big polygon reaching past the circle).
    if (insideWall(this.map, at)) at = this.walkable(spot);
    this.rising.push({ at, kind, run, time: now + RISE_TELL_MS });
    this.host.emit({ t: 'zfx', fx: 'rise', at, t0: now, t1: now + RISE_TELL_MS });
    this.spawned++;
  }

  // --- Tick --------------------------------------------------------------------------------------------------

  /** One step of the match (`dt` seconds), with the players as the host has them now. */
  tick(dt: number, players: ZombieInput[]) {
    const now = this.now;
    for (const i of players) {
      const p = this.parts.get(i.id);
      if (!p) continue;
      p.feet = i.feet;
      p.grounded = i.grounded;
      // Came back (a respawn between waves).
      if (i.alive && !p.alive && p.state === 'dead') {
        p.state = 'up';
        p.waiting = false;
      }
      p.alive = i.alive;
    }
    this.tickBox(now);
    switch (this.phase) {
      case 'countdown':
        if (now >= this.until) this.startWave(1);
        break;
      case 'break':
        if (now >= this.until) this.startWave(this.wave + 1);
        break;
      case 'over':
        if (now >= this.until) this.restart();
        return;
      case 'waiting':
        return;
      case 'wave':
        this.tickSpawns(now);
        break;
    }
    this.tickRevives(now);
    this.tickThorns(now);
    this.tickGhosts(dt, now);
    this.tickPerches(now);
    this.tickWork(now);
    this.tickPets(dt, now);
    this.tickZombies(dt, now);
    this.tickProjectiles(now);
    if (this.phase === 'wave' && this.spawned >= this.spec.total && this.zombies.size === 0 && this.rising.length === 0) this.endWave();
  }

  /**
   * The thorns: up on the wall's bars or the hedge, a hit every espinhos.intervaloSegundos while there, and
   * bleeding for espinhos.sangraSegundos (touching again renews it, doesn't stack). Only standing players
   * bleed: going down or dying stops it.
   */
  /**
   * The haunted graves. Standing on a tombstone calls fantasmas.porVez ghosts, and as many again every
   * fantasmas.intervaloSegundos up there. Each flies after that player (through walls) until its time is up or the
   * player goes down, and hits on reaching them. They never die: a knife swing or a grenade scares them away.
   */
  private tickGhosts(dt: number, now: number) {
    const F = ZOMBIE.fantasmas;
    const tombs = this.map.lapides ?? [];
    for (const p of this.parts.values()) {
      const tomb = p.state === 'up' && p.alive && p.grounded && tombs.length ? tombUnder(tombs, p.feet) : null;
      if (!tomb) {
        p.tombSince = p.tombNext = 0;
        continue;
      }
      // A while up there, not a touch: then they come, and more for as long as the player stays.
      if (!p.tombSince) p.tombSince = now;
      if (now - p.tombSince < F.esperaSegundos * 1000 || now < p.tombNext) continue;
      p.tombNext = now + F.intervaloSegundos * 1000;
      this.raiseGhosts(p, now);
    }
    for (const g of [...this.ghosts.values()]) {
      const t = this.parts.get(g.target);
      if (!t || t.state !== 'up' || !t.alive || now >= g.until) {
        this.ghosts.delete(g.id);
        continue;
      }
      // Toward a point around the target's chest, each ghost circling on its own side.
      g.phase += dt * 1.4;
      const aim: Vec3 = [t.feet[0] + Math.cos(g.phase) * 0.8, t.feet[1] + 1.2 + Math.sin(g.phase * 1.7) * 0.25, t.feet[2] + Math.sin(g.phase) * 0.8];
      const d: Vec3 = [aim[0] - g.pos[0], aim[1] - g.pos[1], aim[2] - g.pos[2]];
      const len = Math.hypot(d[0], d[1], d[2]);
      // A dive from the sky, then the chase at a pace a sprint outruns.
      const step = Math.min(len, (len > 10 ? F.mergulho : F.velocidade) * dt);
      if (len > 1e-6) for (let i = 0; i < 3; i++) g.pos[i] += (d[i] / len) * step;
      const reach = Math.hypot(g.pos[0] - t.feet[0], g.pos[1] - (t.feet[1] + 1.1), g.pos[2] - t.feet[2]);
      if (reach > F.alcance || now < g.nextHit || now - t.ghostHitAt < F.golpeIntervaloSegundos * 1000) continue;
      g.nextHit = now + F.recargaSegundos * 1000;
      t.ghostHitAt = now;
      this.host.hurt(t.id, F.dano, [g.pos[0], g.pos[1], g.pos[2]]);
    }
  }

  /**
   * fantasmas.porVez ghosts after `p`, coming down from the sky: high above and spread around them, never next to
   * them (up to fantasmas.maximo in the match).
   */
  private raiseGhosts(p: Part, now: number) {
    const F = ZOMBIE.fantasmas;
    const n = Math.min(F.porVez, F.maximo - this.ghosts.size);
    if (n <= 0) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.host.rng() * 0.5;
      const r = F.ceuRaio * (0.6 + this.host.rng() * 0.4);
      const id = ++this.ghostSeq;
      const pos: Vec3 = [p.feet[0] + Math.cos(a) * r, p.feet[1] + F.ceuAltura * (0.85 + this.host.rng() * 0.3), p.feet[2] + Math.sin(a) * r];
      this.ghosts.set(id, { id, target: p.id, pos, until: now + F.duracaoSegundos * 1000, nextHit: now, phase: a });
    }
    this.host.emit({ t: 'zghost', fx: 'rise', n, at: [p.feet[0], p.feet[1] + F.ceuAltura, p.feet[2]], target: p.id });
  }

  /**
   * The chapel's altar and the trees: high ground the horde can't reach. A while up there (esperaSegundos) and
   * the place punishes. The altar throws the player off, hurts them and marks them for the horde (profane); a
   * tree's crows peck them every corvos.intervaloSegundos while they stay, and corvos.depoisSegundos after.
   */
  private tickPerches(now: number) {
    const S = ZOMBIE.sacrilegio;
    const C = ZOMBIE.corvos;
    const altar = this.map.altar;
    const trees = this.map.arvores ?? [];
    for (const p of this.parts.values()) {
      const up = p.state === 'up' && p.alive;
      if (up && p.grounded && altar && onAltar(altar, p.feet)) {
        if (!p.altarSince) p.altarSince = now;
        else if (now - p.altarSince >= S.esperaSegundos * 1000) {
          p.altarSince = 0;
          this.profane(p, now);
        }
      } else p.altarSince = 0;
      if (p.profanedUntil && (!up || now >= p.profanedUntil)) {
        p.profanedUntil = 0;
        this.host.emit({ t: 'zprofane', id: p.id, until: 0 });
      }
      const onTree = up && p.grounded && trees.length > 0 && !!treeUnder(trees, p.feet);
      if (!onTree) p.treeSince = 0;
      else if (!p.treeSince) p.treeSince = now;
      // Up there long enough: the crows come (or stay), and keep at it a while after the player comes down.
      if (onTree && now - p.treeSince >= C.esperaSegundos * 1000) {
        if (!p.crowsUntil) {
          p.crowsNext = now;
          this.host.emit({ t: 'zcrows', id: p.id, on: true });
        }
        p.crowsUntil = now + C.depoisSegundos * 1000;
      }
      if (!p.crowsUntil) continue;
      if (!up || now >= p.crowsUntil) {
        p.crowsUntil = 0;
        this.host.emit({ t: 'zcrows', id: p.id, on: false });
      } else if (now >= p.crowsNext) {
        p.crowsNext = now + C.intervaloSegundos * 1000;
        this.host.hurt(p.id, C.dano, [p.feet[0], p.feet[1] + 2, p.feet[2]], 'crows');
      }
    }
  }

  /** The sacrilege: thrown off the altar (away from its middle), hurt, and every zombie goes after them for a while. */
  private profane(p: Part, now: number) {
    const S = ZOMBIE.sacrilegio;
    const a = this.map.altar!;
    let dx = p.feet[0] - a.c[0];
    let dz = p.feet[2] - a.c[2];
    const len = Math.hypot(dx, dz);
    // Right over the middle: out toward the nave (the altar's front, +Z in its own frame).
    if (len < 0.05) [dx, dz] = [Math.sin(a.yaw), Math.cos(a.yaw)];
    else [dx, dz] = [dx / len, dz / len];
    p.profanedUntil = now + S.profanadoSegundos * 1000;
    // Every zombie picks its target again now: the profaned one first.
    for (const z of this.zombies.values()) z.retargetAt = 0;
    this.host.emit({ t: 'zhitfx', id: p.id, fx: 'sacrilege', v: [r2(dx * S.empurrao), 5, r2(dz * S.empurrao)] });
    this.host.emit({ t: 'zprofane', id: p.id, until: p.profanedUntil });
    this.host.hurt(p.id, S.dano, [a.c[0], a.c[1] + a.h[1] + 0.5, a.c[2]], 'sacrilege');
  }

  /** Off the altar's mark and the crows (leaving, the match over): everyone is told they're gone. */
  private clearPerch(p: Part) {
    if (p.profanedUntil) this.host.emit({ t: 'zprofane', id: p.id, until: 0 });
    if (p.crowsUntil) this.host.emit({ t: 'zcrows', id: p.id, on: false });
    p.altarSince = p.profanedUntil = p.treeSince = p.crowsUntil = 0;
  }

  /** Ghosts within `radius` of `at` are scared away (a grenade's blast, a knife swing). */
  scareGhosts(at: Vec3, radius: number) {
    let n = 0;
    for (const g of [...this.ghosts.values()]) {
      if (Math.hypot(g.pos[0] - at[0], g.pos[1] - at[1], g.pos[2] - at[2]) > radius) continue;
      this.ghosts.delete(g.id);
      n++;
    }
    if (n) this.host.emit({ t: 'zghost', fx: 'scare', n, at });
  }

  /** A player swung their knife: the ghosts around them are scared away. */
  knifeScare(id: number) {
    const p = this.parts.get(id);
    if (!p || p.state !== 'up' || !p.alive || !this.ghosts.size) return;
    this.scareGhosts([p.feet[0], p.feet[1] + 1.1, p.feet[2]], ZOMBIE.fantasmas.sustoFaca);
  }

  private tickThorns(now: number) {
    const t = ZOMBIE.espinhos;
    for (const p of this.parts.values()) {
      if (p.state !== 'up' || !p.alive) {
        if (p.bleedUntil) {
          p.bleedUntil = 0;
          this.host.emit({ t: 'zbleed', id: p.id, until: 0 });
        }
        continue;
      }
      if (thornsAt(this.map, p.feet) && now >= p.thornNext) {
        p.thornNext = now + t.intervaloSegundos * 1000;
        if (!p.bleedUntil) p.bleedNext = now + t.sangraTiqueSegundos * 1000;
        p.bleedUntil = now + t.sangraSegundos * 1000;
        this.host.emit({ t: 'zbleed', id: p.id, until: p.bleedUntil });
        this.host.hurt(p.id, t.dano, p.feet, 'thorns');
        if (p.state !== 'up') continue;
      }
      if (p.bleedUntil && now >= p.bleedNext) {
        if (now > p.bleedUntil) {
          p.bleedUntil = 0;
          continue;
        }
        p.bleedNext += t.sangraTiqueSegundos * 1000;
        this.host.hurt(p.id, t.sangraDano, p.feet, 'thorns');
      }
    }
  }

  private tickRevives(now: number) {
    for (const p of this.parts.values()) {
      if (p.state === 'down' && now >= p.downUntil) {
        p.state = 'dead';
        p.alive = false;
        this.host.bleedOut(p.id);
        this.checkLoss();
        continue;
      }
      const r = p.reviving;
      if (!r) continue;
      const t = this.parts.get(r.target);
      if (!t || t.state !== 'down' || p.state !== 'up' || dist2(p.feet, t.feet) > ZOMBIE.jogador.reanimarAlcance + 1.5) {
        p.reviving = null;
        this.host.emit({ t: 'zrevive', id: r.target, by: p.id, until: 0 });
        continue;
      }
      if (now - r.since < ZOMBIE.jogador.reanimarSegundos * 1000) continue;
      p.reviving = null;
      p.revives++;
      this.host.stat?.(p.id, { e: 'revive' });
      this.pay(p, ZOMBIE.dinheiro.reanimar);
      this.xp(p, ZOMBIE.xp.reanimar);
      this.standUp(t, p.id);
    }
  }

  private tickProjectiles(now: number) {
    this.spits = this.spits.filter((s) => {
      if (now < s.at) return true;
      for (const p of this.parts.values()) {
        if (p.state === 'up' && dist2(p.feet, s.to) <= s.radius && Math.abs(p.feet[1] - s.to[1]) < 2) this.zHurt(p, s.damage, s.from);
      }
      return false;
    });
    this.waves = this.waves.filter((w) => {
      if (now < w.start) return true;
      const radius = ((now - w.start) / 1000) * w.speed;
      for (const p of this.parts.values()) {
        if (p.state !== 'up' || w.hit.has(p.id)) continue;
        const d = dist2(p.feet, w.center);
        if (Math.abs(d - radius) > w.thick || Math.abs(p.feet[1] - w.center[1]) > 2) continue;
        // Jumping over the shockwave dodges it.
        if (!p.grounded) continue;
        w.hit.add(p.id);
        this.zHurt(p, w.damage, w.center);
        const k = d > 0.1 ? 4 / d : 0;
        this.host.emit({ t: 'zhitfx', id: p.id, fx: 'pound', v: [r2((p.feet[0] - w.center[0]) * k), 5, r2((p.feet[2] - w.center[2]) * k)] });
      }
      return radius < w.radius + w.thick;
    });
  }

  private tickZombies(dt: number, now: number) {
    const standing = this.standing();
    for (const z of this.zombies.values()) {
      if (z.dead) continue;
      if (now < z.riseUntil) continue;
      // A pet's doing: held (a move already started still lands), in the duck float or dizzy (both cancel the move
      // when they start): it stands there. After the iguana's tail: it goes for the tail and nothing else.
      if (this.petStopped(z, now)) {
        z.stuckAt = now + 8000;
        if (z.act) this.tickAct(z, now, standing);
        else this.standStill(z);
        continue;
      }
      if (z.lureUntil > now && z.lureAt) {
        z.stuckAt = now + 8000;
        if (z.act) this.tickAct(z, now, standing);
        else this.chase(z, z.lureAt, now);
        continue;
      }
      if (z.lureAt) {
        // The tail's time is up: back to its own target.
        z.lureAt = null;
        z.goal = null;
        z.retargetAt = 0;
      }
      if (z.act) this.tickAct(z, now, standing);
      else this.think(z, now, standing);
    }
    this.crowd.update(dt);
    for (const z of [...this.zombies.values()]) {
      if (z.dead) continue;
      if (z.act !== 'charge') z.pos = v3(z.agent.position());
      const v = z.agent.velocity();
      if (!z.act && Math.hypot(v.x, v.z) > 0.3) z.yaw = yawTo(v.x, v.z);
      this.checkStuck(z, now);
    }
  }

  /**
   * Nearest standing player (height counts double: a floor away is far). Someone profaned at the altar comes
   * first: while there is one, only the profaned are targets.
   */
  private nearest(z: Zombie, standing: Part[]): Part | null {
    let best: Part | null = null;
    let bestD = Infinity;
    const marked = standing.filter((p) => p.profanedUntil > this.now);
    for (const p of marked.length ? marked : standing) {
      const d = Math.hypot(p.feet[0] - z.pos[0], (p.feet[1] - z.pos[1]) * 2, p.feet[2] - z.pos[2]);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private think(z: Zombie, now: number, standing: Part[]) {
    if (now >= z.retargetAt) {
      z.retargetAt = now + RETARGET_MS;
      z.target = this.nearest(z, standing)?.id ?? null;
    }
    const t = z.target !== null ? this.parts.get(z.target) : undefined;
    if (!t || t.state !== 'up') {
      z.target = null;
      if (z.goal) z.agent.resetMoveTarget();
      z.goal = null;
      return;
    }
    const d = dist2(z.pos, t.feet);
    const dy = Math.abs(t.feet[1] - z.pos[1]);
    // The way to its target: around the shut gaps, or through one, tearing the boards down (the bruiser and the
    // bosses always; everyone else only when no gap is left open).
    const cross = insideWall(this.map, z.pos) !== insideWall(this.map, t.feet);
    // The bars (or the boards) in between: no swipe through them, it goes around (or tears the boards down).
    const walled = cross && this.walled(z.pos, t.feet);
    const through = cross && (smashesThrough(z.kind) || this.bars.every(isClosed));
    const gap = through ? this.blockingGap(z) : -1;
    if (gap !== z.smash) this.atBoards(z, gap, t);
    this.setFilter(z, through && gap < 0 ? FILTER_THROUGH : FILTER_AROUND);
    if (isBoss(z.kind) && this.bossMove(z, t, d, now, standing)) return;
    const type = isBoss(z.kind) ? null : ZOMBIE.tipos[z.kind as ZType];
    const reach = isBoss(z.kind) ? ZOMBIE.chefes[z.kind as BossId].alcance : type!.alcance;
    if (z.kind === 'inchado' && d <= reach && dy < 2 && !walled) return this.startAct(z, 'fuse', now + type!.preparo * 1000);
    if (z.kind === 'cuspidor') {
      const s = type!.cuspe!;
      if (d >= s.minimo && d <= s.alcance && dy < 3 && now >= (z.cd.spit ?? 0) && this.clearLine(z.pos, t.feet)) {
        z.actTo = [...t.feet];
        return this.startAct(z, 'spit', now + s.preparo * 1000);
      }
      // Keeps its distance while it can see its target.
      if (d < s.alcance * 0.8 && d > s.minimo && this.clearLine(z.pos, t.feet)) {
        if (z.goal) z.agent.resetMoveTarget();
        z.goal = null;
        z.yaw = yawTo(t.feet[0] - z.pos[0], t.feet[2] - z.pos[2]);
        return;
      }
    }
    if (d <= reach && dy < 2 && now >= z.nextAttack && z.kind !== 'inchado' && !walled) {
      z.yaw = yawTo(t.feet[0] - z.pos[0], t.feet[2] - z.pos[2]);
      const windup = isBoss(z.kind) ? ZOMBIE.chefes[z.kind as BossId].preparo : type!.preparo;
      return this.startAct(z, 'swipe', now + windup * 1000);
    }
    if (gap >= 0) return this.smashBoards(z, gap, now);
    this.chase(z, t.feet, now);
  }

  /** The wall stands between `a` and `b` (off the open gaps): a swipe can't reach through. */
  private walled(a: Vec3, b: Vec3): boolean {
    return wallBetween(this.map, a, b, (i) => !isClosed(this.bars[i]));
  }

  /** The shut gap a zombie stands at, in its way (its target is on the other side of the wall); -1: none. */
  private blockingGap(z: Zombie): number {
    return this.map.barricadas.findIndex((g, i) => isClosed(this.bars[i]) && atGap(g, z.pos));
  }

  /**
   * A zombie arrives at the boards of gap `gap` (or leaves them: -1). Arriving, it stops dead in front of them,
   * on its own side, and its filter (set right after) holds it there: the shut gap is off its map now.
   */
  private atBoards(z: Zombie, gap: number, t: Part) {
    z.smash = gap;
    z.goal = null;
    z.repathAt = 0;
    if (gap < 0) return;
    const g = this.map.barricadas[gap];
    const f = gapFrame(g, z.pos);
    const side = Math.abs(f.across) > 0.05 ? Math.sign(f.across) : -Math.sign(gapFrame(g, t.feet).across) || 1;
    const across = side * Math.max(Math.abs(f.across), 0.95);
    const [cx, , cz] = g.centro;
    const hold = this.walkable(g.eixo === 'x' ? [cx + f.along, z.pos[1], cz + across] : [cx + across, z.pos[1], cz + f.along]);
    z.agent.teleport(pt(hold));
    z.pos = hold;
  }

  private setFilter(z: Zombie, filter: number) {
    if (z.filter === filter) return;
    z.filter = filter;
    z.agent.updateParameters({ queryFilterType: filter });
    z.goal = null;
    z.repathAt = 0;
  }

  /** At the boards: a blow every so often (a bloater bursts on them). */
  private smashBoards(z: Zombie, gap: number, now: number) {
    const g = this.map.barricadas[gap];
    z.yaw = yawTo(g.centro[0] - z.pos[0], g.centro[2] - z.pos[2]);
    if (z.goal) z.agent.resetMoveTarget();
    z.goal = null;
    if (z.kind === 'inchado') return this.startAct(z, 'fuse', now + ZOMBIE.tipos.inchado.preparo * 1000);
    if (now < z.nextAttack) return;
    const windup = isBoss(z.kind) ? ZOMBIE.chefes[z.kind as BossId].preparo : ZOMBIE.tipos[z.kind as ZType].preparo;
    this.startAct(z, 'smash', now + windup * 1000);
  }

  /**
   * Walks toward `goal`. A new path is asked for only when the goal moved enough for its distance, and not too
   * often: every request restarts a search in the crowd's shared path queue (a few hundred steps for a long way
   * round the wall, a hundred steps per tick for everyone), so a horde re-asking every second would never get its
   * full paths and would only follow the quick partial ones (straight at the wall, by the shut gap nearest its
   * target). A far zombie keeps its path; a close one follows every step of its target.
   */
  private chase(z: Zombie, goal: Vec3, now: number) {
    const d = dist2(z.pos, goal);
    if (z.goal) {
      const moved = dist2(z.goal, goal);
      if (moved < Math.max(1, d * 0.3) && (now < z.repathAt || moved < 0.5)) return;
    }
    z.goal = [...goal];
    z.repathAt = now + (d < 6 ? 400 : d < 15 ? 1500 : 4000);
    const c = this.query.findClosestPoint(pt(goal), { halfExtents: HALF });
    if (c.success && c.polyRef) z.agent.requestMoveTarget(c.point);
  }

  private startAct(z: Zombie, act: Act, until: number) {
    z.act = act;
    z.actUntil = until;
    if (z.goal) z.agent.resetMoveTarget();
    z.goal = null;
    if (act !== 'charge') z.agent.requestMoveVelocity({ x: 0, y: 0, z: 0 });
  }

  private endAct(z: Zombie) {
    z.act = null;
    z.actTo = z.actFrom = null;
    z.actHit.clear();
    z.repathAt = 0;
  }

  /** Whether the walkable area is open in a straight line between two points (a stand-in for line of sight). */
  private clearLine(a: Vec3, b: Vec3): boolean {
    const s = this.query.findClosestPoint(pt(a), { halfExtents: HALF });
    if (!s.success || !s.polyRef) return false;
    const r = this.query.raycast(s.polyRef, s.point, pt(b));
    return r.success && r.t >= 0.999;
  }

  /** How far the walkable area goes from `a` toward `b` (0..1 of the way). */
  private lineReach(a: Vec3, b: Vec3): number {
    const s = this.query.findClosestPoint(pt(a), { halfExtents: HALF });
    if (!s.success || !s.polyRef) return 0;
    const r = this.query.raycast(s.polyRef, s.point, pt(b));
    return r.success ? Math.min(1, r.t) : 0;
  }

  private tickAct(z: Zombie, now: number, standing: Part[]) {
    const t = z.target !== null ? this.parts.get(z.target) : undefined;
    if (z.act === 'charge') return this.tickCharge(z, now);
    if ((z.act === 'swipe' || z.act === 'spit') && t?.state === 'up') z.yaw = yawTo(t.feet[0] - z.pos[0], t.feet[2] - z.pos[2]);
    if (now < z.actUntil) return;
    const act = z.act!;
    const wave = this.wave;
    switch (act) {
      case 'swipe': {
        const reach = isBoss(z.kind) ? ZOMBIE.chefes[z.kind as BossId].alcance : ZOMBIE.tipos[z.kind as ZType].alcance;
        // Still in reach when it lands, and nothing of the wall in between (the target may have stepped behind the bars).
        if (t?.state === 'up' && dist2(z.pos, t.feet) <= reach + 0.6 && Math.abs(t.feet[1] - z.pos[1]) < 2.2 && !this.walled(z.pos, t.feet)) this.zHurt(t, zombieHit(z.kind, wave), z.pos);
        z.nextAttack = now + (isBoss(z.kind) ? ZOMBIE.chefes[z.kind as BossId].recarga : ZOMBIE.tipos[z.kind as ZType].recarga) * 1000;
        break;
      }
      case 'smash': {
        // A blow on the boards (if they're still there and so is the zombie).
        if (z.smash >= 0 && atGap(this.map.barricadas[z.smash], z.pos)) this.hurtBarricade(z.smash, boardDamage(z.kind));
        z.nextAttack = now + (isBoss(z.kind) ? ZOMBIE.chefes[z.kind as BossId].recarga : ZOMBIE.tipos[z.kind as ZType].recarga) * 1000;
        break;
      }
      case 'fuse':
        // The bloater bursts by itself: nobody gets the credit.
        this.endAct(z);
        this.damage(z.id, null, z.hp + 1, 'blast');
        return;
      case 'spit': {
        const s = ZOMBIE.tipos.cuspidor.cuspe!;
        const from: Vec3 = [z.pos[0], z.pos[1] + 1.5, z.pos[2]];
        const to = z.actTo ?? (t ? t.feet : z.pos);
        const at = now + (dist2(from, to) / s.velocidade) * 1000;
        this.spits.push({ to, at, damage: s.dano, radius: s.raio, from: z.pos });
        this.host.emit({ t: 'zfx', fx: 'spit', id: z.id, at: from, to, t0: now, t1: at });
        z.cd.spit = now + s.recarga * 1000;
        break;
      }
      case 'slam': {
        const s = ZOMBIE.chefes.coveiro.pancada!;
        for (const p of standing) {
          if (dist2(p.feet, z.pos) <= s.raio && Math.abs(p.feet[1] - z.pos[1]) < 2.5) this.zHurt(p, s.dano, z.pos);
        }
        z.cd.slam = now + s.recarga * 1000 * this.cdMul(z);
        break;
      }
      case 'summon': {
        const s = ZOMBIE.chefes.coveiro.invocar!;
        for (let i = 0; i < s.zumbis && this.roomForExtras(); i++) this.spawn('comum', this.walkable(z.pos, 6), true, this.host.rng() < 0.4);
        z.cd.summon = now + s.recarga * 1000 * this.cdMul(z);
        break;
      }
      case 'scream': {
        const s = ZOMBIE.chefes.noiva.grito!;
        const hit: number[] = [];
        for (const p of standing) {
          if (Math.hypot(p.feet[0] - z.pos[0], p.feet[1] - z.pos[1], p.feet[2] - z.pos[2]) > s.raio) continue;
          hit.push(p.id);
          this.zHurt(p, s.dano, z.pos);
          this.host.emit({ t: 'zhitfx', id: p.id, fx: 'scream', slow: s.lentidao, until: now + s.duracao * 1000 });
        }
        z.cd.scream = now + s.recarga * 1000;
        break;
      }
      case 'blink': {
        // Back out of thin air, behind her target, and straight into a swipe.
        const to = z.actTo ?? z.pos;
        z.agent.teleport(pt(to));
        z.pos = [...to];
        z.hidden = false;
        z.cd.blink = now + ZOMBIE.chefes.noiva.sumir!.recarga * 1000;
        this.endAct(z);
        if (t?.state === 'up') {
          z.yaw = yawTo(t.feet[0] - z.pos[0], t.feet[2] - z.pos[2]);
          this.startAct(z, 'swipe', now + 400);
        }
        return;
      }
      case 'chargeWindup': {
        z.act = 'charge';
        z.hidden = false;
        z.actHit.clear();
        return;
      }
      case 'pound': {
        const s = ZOMBIE.chefes.prefeito.tremor!;
        this.waves.push({ center: [...z.pos], start: now, speed: s.velocidade, radius: s.raio, thick: s.espessura, damage: s.dano, hit: new Set() });
        z.cd.pound = now + s.recarga * 1000 * this.cdMul(z);
        break;
      }
    }
    this.endAct(z);
  }

  /** Bosses only call more zombies while the horde isn't too big (each one is drawn and simulated). */
  private roomForExtras() {
    return this.zombies.size < this.spec.maxAlive + 8;
  }

  /** Cooldowns get shorter once the mayor is angry. */
  private cdMul(z: Zombie) {
    return z.enraged ? (ZOMBIE.chefes.prefeito.furia?.recargas ?? 1) : 1;
  }

  private enrage(z: Zombie) {
    const f = ZOMBIE.chefes.prefeito.furia!;
    z.enraged = true;
    z.speed *= f.velocidade;
    z.agent.updateParameters({ maxSpeed: z.speed });
    z.cd.rage = this.now + 2000;
  }

  /** A boss's special moves; true when one started (or the boss is busy with its own thing). */
  private bossMove(z: Zombie, t: Part, d: number, now: number, standing: Part[]): boolean {
    const B = ZOMBIE.chefes;
    switch (z.kind) {
      case 'coveiro': {
        const s = B.coveiro;
        if (now >= (z.cd.summon ?? 0) && s.invocar) {
          this.telegraph(z, 'summon', now, s.invocar.preparo, 6);
          return true;
        }
        if (s.pancada && d <= s.pancada.distancia && now >= (z.cd.slam ?? 0)) {
          this.telegraph(z, 'slam', now, s.pancada.preparo, s.pancada.raio);
          return true;
        }
        return false;
      }
      case 'noiva': {
        const s = B.noiva;
        if (s.grito && now >= (z.cd.scream ?? 0) && standing.some((p) => dist2(p.feet, z.pos) <= s.grito!.raio * 0.85)) {
          this.telegraph(z, 'scream', now, s.grito.preparo, s.grito.raio);
          return true;
        }
        if (s.sumir && now >= (z.cd.blink ?? 0) && (d >= s.sumir.distancia || this.host.rng() < 0.02)) {
          // Where she comes back: a few meters past her target, on the far side from where she was.
          const k = d > 0.1 ? 3 / d : 0;
          z.actTo = this.walkable([t.feet[0] + (t.feet[0] - z.pos[0]) * k, t.feet[1], t.feet[2] + (t.feet[2] - z.pos[2]) * k]);
          z.hidden = true;
          this.startAct(z, 'blink', now + s.sumir.preparo * 1000);
          this.host.emit({ t: 'zfx', fx: 'blink', id: z.id, at: z.pos, to: z.actTo, t0: now, t1: z.actUntil });
          return true;
        }
        return false;
      }
      case 'prefeito': {
        const s = B.prefeito;
        if (z.enraged && s.furia && now >= (z.cd.rage ?? 0)) {
          // Angry: calls runners now and then (not a telegraphed move: he keeps walking).
          for (let i = 0; i < s.furia.corredores && this.roomForExtras(); i++) this.spawn('corredor', this.walkable(z.pos, 7), true);
          z.cd.rage = now + s.furia.intervalo * 1000;
        }
        if (s.tremor && now >= (z.cd.pound ?? 0) && standing.some((p) => dist2(p.feet, z.pos) <= s.tremor!.raio * 0.8)) {
          this.telegraph(z, 'pound', now, s.tremor.preparo, s.tremor.raio);
          return true;
        }
        const c = s.investida;
        if (c && now >= (z.cd.chargeWindup ?? 0) && d >= c.minimo && d <= c.maximo + 4 && Math.abs(t.feet[1] - z.pos[1]) < 1.5) {
          const len = Math.min(c.maximo, d + 3);
          const dir: Vec3 = [(t.feet[0] - z.pos[0]) / d, 0, (t.feet[2] - z.pos[2]) / d];
          const far: Vec3 = [z.pos[0] + dir[0] * len, z.pos[1], z.pos[2] + dir[2] * len];
          // Stops short of walls (the walkable area's edge along the line).
          const k = Math.max(0, this.lineReach(z.pos, far) * len - 0.6);
          if (k < c.minimo) return false;
          z.actFrom = [...z.pos];
          z.actTo = [z.pos[0] + dir[0] * k, z.pos[1], z.pos[2] + dir[2] * k];
          z.yaw = yawTo(dir[0], dir[2]);
          this.startAct(z, 'chargeWindup', now + c.preparo * 1000);
          this.host.emit({ t: 'zfx', fx: 'charge', id: z.id, at: z.actFrom, to: z.actTo, r: c.largura, t0: now, t1: z.actUntil });
          z.cd.chargeWindup = now + c.recarga * 1000 * this.cdMul(z);
          return true;
        }
        return false;
      }
    }
    return false;
  }

  /** A telegraphed boss move: everyone sees it coming (`r`: its reach) until it lands at t1. */
  private telegraph(z: Zombie, act: Act, now: number, windup: number, r: number) {
    this.startAct(z, act, now + windup * 1000);
    this.host.emit({ t: 'zfx', fx: act as 'slam' | 'summon' | 'scream' | 'pound', id: z.id, at: z.pos, r, t0: now, t1: z.actUntil });
  }

  /** The mayor's charge: along its line at full speed, hitting (and throwing) everyone in the way once. */
  private tickCharge(z: Zombie, now: number) {
    const c = ZOMBIE.chefes.prefeito.investida!;
    const to = z.actTo!;
    const dx = to[0] - z.pos[0];
    const dz = to[2] - z.pos[2];
    const left = Math.hypot(dx, dz);
    const step = (c.velocidade * (z.enraged ? ZOMBIE.chefes.prefeito.furia?.velocidade ?? 1 : 1)) / 20;
    const k = left > step ? step / left : 1;
    const next = this.walkable([z.pos[0] + dx * k, z.pos[1], z.pos[2] + dz * k]);
    z.pos = next;
    z.agent.teleport(pt(next));
    for (const p of this.parts.values()) {
      if (p.state !== 'up' || z.actHit.has(p.id) || dist2(p.feet, z.pos) > c.largura || Math.abs(p.feet[1] - z.pos[1]) > 2) continue;
      z.actHit.add(p.id);
      this.zHurt(p, c.dano, z.pos);
      const len = Math.max(0.01, Math.hypot(dx, dz));
      this.host.emit({ t: 'zhitfx', id: p.id, fx: 'charge', v: [r2((dx / len) * c.empurrao), 6, r2((dz / len) * c.empurrao)] });
    }
    if (k >= 1 || left < 0.2 || now - (z.actUntil ?? now) > 4000) {
      this.endAct(z);
      z.nextAttack = now + 800;
    }
  }

  /** A zombie that hasn't really moved in a while, far from its target, comes back out near the players. */
  private checkStuck(z: Zombie, now: number) {
    if (now < z.stuckAt) return;
    z.stuckAt = now + 8000;
    const moved = dist2(z.pos, z.stuckPos);
    z.stuckPos = [...z.pos];
    const t = z.target !== null ? this.parts.get(z.target) : undefined;
    // Waiting at the boards isn't being stuck.
    if (z.act || z.smash >= 0 || moved > 0.6 || !t || dist2(z.pos, t.feet) < 6) return;
    const to = this.walkable(this.spawnPoint(), 1.5);
    z.agent.teleport(pt(to));
    z.pos = to;
    z.riseUntil = now + RISE_MS;
    z.goal = null;
  }

  // --- Pets ----------------------------------------------------------------------------------------------------

  /** A zombie a pet is keeping in place right now (held, in the duck float, dizzy). */
  private petStopped(z: Zombie, now: number) {
    return z.heldUntil > now || z.duckUntil > now || z.dazeUntil > now;
  }

  /** Stops walking where it is. */
  private standStill(z: Zombie) {
    if (z.goal) z.agent.resetMoveTarget();
    z.goal = null;
    z.agent.requestMoveVelocity({ x: 0, y: 0, z: 0 });
  }

  /** A zombie's blow (or blast, spit, shockwave) reached `p`: hurt, and the iguana may drop her tail. */
  private zHurt(p: Part, amount: number, from: Vec3) {
    this.host.hurt(p.id, amount, from);
    this.petTail(p);
  }

  /** Zombies a pet can act on: out of the ground, seen (not mid-blink), not already held or in a float. */
  private petTargets(now: number): Zombie[] {
    return [...this.zombies.values()].filter((z) => !z.dead && !z.hidden && now >= z.riseUntil && z.heldUntil <= now && z.duckUntil <= now);
  }

  /** The zombies within `range` of `p` (and about their floor), nearest first. */
  private near(p: Part, list: Zombie[], range: number): Zombie[] {
    return list
      .map((z) => ({ z, d: dist2(z.pos, p.feet) }))
      .filter((o) => o.d <= range && Math.abs(o.z.pos[1] - p.feet[1]) < 2.5)
      .sort((a, b) => a.d - b.d)
      .map((o) => o.z);
  }

  private emitPet(p: Part, act: PetAct, until: number, extra: { z?: number; i?: number; at?: Vec3 } = {}) {
    const pet = p.pet!;
    this.host.emit({ t: 'zpet', id: p.id, act, ...extra, until, ready: pet.ready, ...(pet.id === 'gato' ? { n: pet.charges } : {}) });
  }

  private tickPets(dt: number, now: number) {
    for (const p of this.parts.values()) {
      const pet = p.pet;
      if (!pet) continue;
      if (pet.id === 'gato') this.tickCat(p, pet, dt, now);
      else if (pet.id === 'fuinha') this.tickWeasel(p, pet, now);
      else if (pet.id !== 'iguana' && p.state === 'up' && p.alive && now >= pet.ready && this.phase === 'wave') {
        if (pet.id === 'amora') this.petHold(p, pet, now);
        else if (pet.id === 'bruxinha') this.petDuck(p, pet, now);
        else if (pet.id === 'lontra') this.petStone(p, pet, now);
      }
    }
  }

  /** Segura, Amora!: the zombie nearest her owner, held by the shin; a bruiser or a boss only takes a jolt. */
  private petHold(p: Part, pet: PetState, now: number) {
    const A = PET_ABILITIES.amora;
    const z = this.near(p, this.petTargets(now), A.alcance)[0];
    if (!z) return;
    const jolt = isBoss(z.kind) || z.kind === 'brutamontes';
    z.heldUntil = now + (jolt ? A.tranco : A.segura) * 1000;
    pet.ready = now + A.recarga * 1000;
    this.emitPet(p, jolt ? 'nudge' : 'hold', z.heldUntil, { z: z.id });
  }

  /** Feitiço do Pato: the most dangerous zombie near the owner (a variant before a plain one; bosses are immune) in a duck float. */
  private petDuck(p: Part, pet: PetState, now: number) {
    const B = PET_ABILITIES.bruxinha;
    const list = this.near(p, this.petTargets(now).filter((z) => !isBoss(z.kind)), B.alcance);
    const z = list.find((o) => o.kind !== 'comum') ?? list[0];
    if (!z) return;
    // It stops whatever it was winding up.
    if (z.act) this.endAct(z);
    this.standStill(z);
    z.duckUntil = now + B.duracao * 1000;
    pet.ready = now + B.recarga * 1000;
    this.emitPet(p, 'duck', z.duckUntil, { z: z.id });
  }

  /** Pedrada: a spitter winding up its spit or a bloater swelling near the owner: the move is cancelled, the zombie dizzy. */
  private petStone(p: Part, pet: PetState, now: number) {
    const L = PET_ABILITIES.lontra;
    const busy = [...this.zombies.values()].filter((z) => !z.dead && (z.act === 'spit' || z.act === 'fuse'));
    const z = this.near(p, busy, L.alcance)[0];
    if (!z) return;
    this.endAct(z);
    this.standStill(z);
    // A spitter starts its wait for the next spit over.
    if (z.kind === 'cuspidor') z.cd.spit = now + (ZOMBIE.tipos.cuspidor.cuspe?.recarga ?? 3) * 1000;
    z.dazeUntil = now + L.tonto * 1000;
    pet.ready = now + L.recarga * 1000;
    this.emitPet(p, 'stone', z.dazeUntil, { z: z.id });
  }

  /** Rabo de Isca: a blow left the owner low: the tail drops where they are, and the zombies around go after it. */
  private petTail(p: Part) {
    const pet = p.pet;
    const now = this.now;
    if (pet?.id !== 'iguana' || p.state !== 'up' || now < pet.ready || this.phase !== 'wave' || !this.host.health) return;
    const I = PET_ABILITIES.iguana;
    const h = this.host.health(p.id);
    if (!(h > 0 && h <= I.vida)) return;
    const at: Vec3 = [p.feet[0], p.feet[1], p.feet[2]];
    const lured = [...this.zombies.values()].filter((z) => !z.dead && !isBoss(z.kind) && now >= z.riseUntil && dist2(z.pos, at) <= I.raio && Math.abs(z.pos[1] - at[1]) < 2.5);
    if (!lured.length) return;
    const until = now + I.duracao * 1000;
    for (const z of lured) {
      z.lureUntil = until;
      z.lureAt = at;
      z.goal = null;
      // A swipe on its way stops: it turns to the tail.
      if (z.act === 'swipe' || z.act === 'smash') this.endAct(z);
    }
    pet.ready = now + I.recarga * 1000;
    this.emitPet(p, 'tail', until, { at });
  }

  /**
   * Sétima Vida: its owner down, the cat starts lifting them a while after the fall and gets them up after
   * gato.segundos of work; a teammate reviving them comes first (the cat waits, and goes on if they let go). The
   * cat never takes a revive's place: the teammate still sees the revive prompt and the down player their revive.
   */
  private tickCat(p: Part, pet: PetState, dt: number, now: number) {
    const L = pet.lift;
    if (!L) return;
    if (p.state !== 'down') {
      pet.lift = null;
      return;
    }
    if (now < L.start) return;
    const G = PET_ABILITIES.gato;
    const human = [...this.parts.values()].some((o) => o.reviving?.target === p.id);
    if (human) {
      if (!L.paused) {
        L.paused = true;
        this.emitPet(p, 'yield', 0);
      }
      return;
    }
    if (L.paused) {
      L.paused = false;
      this.emitPet(p, 'lift', now + Math.max(0, G.segundos * 1000 - L.done));
    }
    L.done += dt * 1000;
    if (L.done < G.segundos * 1000) return;
    pet.charges--;
    pet.lift = null;
    this.emitPet(p, 'up', now);
    this.standUp(p, null, G.vida);
  }

  /** Mão na Massa: board by board, slowly, on the most damaged barricade near the owner (never building one: that's paid). */
  private tickWeasel(p: Part, pet: PetState, now: number) {
    const F = PET_ABILITIES.fuinha;
    const working = p.state === 'up' && p.alive && this.phase !== 'waiting' && this.phase !== 'over';
    const w = pet.nail;
    if (w) {
      const b = this.bars[w.gap];
      const g = this.map.barricadas[w.gap];
      if (!working || !b?.built || !needsWork(b) || dist2(p.feet, g.centro) > F.alcance + 2) return this.weaselDone(p, pet, now);
      if (now < w.next) return;
      // The board that shuts the gap waits until nobody stands in it, as a player's does.
      if (!isClosed(b) && this.gapBusy(w.gap)) return;
      const wasClosed = isClosed(b);
      nailBoard(b);
      if (!wasClosed) this.updateGates();
      this.emitBar(w.gap, 'nail');
      w.left--;
      if (w.left <= 0 || !needsWork(b)) return this.weaselDone(p, pet, now);
      w.next = now + F.tabuaSegundos * 1000;
      this.emitPet(p, 'nail', w.next, { i: w.gap });
      return;
    }
    if (!working || now < pet.ready) return;
    let best = -1;
    let worst = Infinity;
    this.map.barricadas.forEach((g, i) => {
      const b = this.bars[i];
      if (!b.built || !needsWork(b) || dist2(p.feet, g.centro) > F.alcance || Math.abs(g.centro[1] - p.feet[1]) > 2.5) return;
      // The most damaged: the fewest boards, then the weakest top one.
      const score = b.boards * 1e4 + b.hp;
      if (score < worst) {
        worst = score;
        best = i;
      }
    });
    if (best < 0) return;
    pet.nail = { gap: best, next: now + F.tabuaSegundos * 1000, left: F.tabuas };
    pet.ready = 0;
    this.emitPet(p, 'nail', pet.nail.next, { i: best });
  }

  private weaselDone(p: Part, pet: PetState, now: number) {
    const gap = pet.nail?.gap;
    pet.nail = null;
    pet.ready = now + PET_ABILITIES.fuinha.recarga * 1000;
    this.emitPet(p, 'nail', now, gap !== undefined ? { i: gap } : {});
  }

  // --- Snapshot ------------------------------------------------------------------------------------------------

  /** Every zombie for the network (or the local view offline). */
  snapshot(): Extract<ServerMsg, { t: 'zsnap' }> {
    const now = this.now;
    const z: ZNet[] = [];
    let extras = 0;
    for (const o of this.zombies.values()) {
      if (o.extra) extras++;
      let f = 0;
      if (now < o.riseUntil) f |= ZF.rising;
      if (o.act === 'swipe' || o.act === 'smash') f |= ZF.attack;
      if (o.act === 'fuse') f |= ZF.fuse;
      if (o.act === 'spit') f |= ZF.spit;
      if (o.act && ['slam', 'summon', 'scream', 'blink', 'chargeWindup', 'pound'].includes(o.act)) f |= ZF.special;
      if (o.hidden) f |= ZF.hidden;
      if (o.run || o.act === 'charge') f |= ZF.run;
      if (o.enraged) f |= ZF.enraged;
      if (o.heldUntil > now) f |= ZF.held;
      if (o.duckUntil > now) f |= ZF.duck;
      z.push([o.id, Z_KINDS.indexOf(o.kind), r2(o.pos[0]), r2(o.pos[1]), r2(o.pos[2]), r2(o.yaw), f]);
    }
    const left = this.phase === 'wave' ? Math.max(0, this.spec.total - this.killed) + extras + (this.boss ? 1 : 0) : 0;
    const g = [...this.ghosts.values()].map((o) => [o.id, r2(o.pos[0]), r2(o.pos[1]), r2(o.pos[2])] as [number, number, number, number]);
    return { t: 'zsnap', time: now, z, left, ...(this.boss ? { boss: [this.boss.id, Math.ceil(this.boss.hp), this.boss.max] as [number, number, number] } : {}), ...(g.length ? { g } : {}) };
  }
}
