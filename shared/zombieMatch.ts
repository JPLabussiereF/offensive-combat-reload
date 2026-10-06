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
import { Crowd, NavMeshQuery, type CrowdAgent, type NavMesh } from 'recast-navigation';
import type { Loadout } from './arsenal';
import type { BoxInfo, ServerMsg, Vec3, ZombiePlayer, ZombieSync, ZPhase, ZSummaryRow } from './protocol';
import {
  duckChance,
  isBoss,
  itemOf,
  itemSlot,
  kindScale,
  killMoney,
  killXp,
  pickType,
  rollBox,
  startItems,
  waveSpec,
  WAVES,
  Z_KINDS,
  ZF,
  zombieHit,
  zombieHp,
  zombieLoadout,
  ZOMBIE,
  type BossId,
  type KillHow,
  type WaveSpec,
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
  /** A zombie hurts a standing player; if that takes them to 0, the host calls `lethal`. */
  hurt(id: number, amount: number, from: Vec3): void;
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
}

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
}

type Act = 'swipe' | 'fuse' | 'spit' | 'slam' | 'summon' | 'scream' | 'blink' | 'chargeWindup' | 'charge' | 'pound';

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
const RETARGET_MS = 500;
const REPATH_MS = 900;
const HALF = { x: 2, y: 4, z: 2 };
const dist2 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const v3 = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z];
const pt = (p: Vec3) => ({ x: p[0], y: p[1], z: p[2] });
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Facing a direction, in the game's convention (yaw 0 looks down -Z). */
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

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
  private box: BoxInfo & { rolls: number; pending: string | null } = { spot: 0, state: 'idle', by: null, item: null, until: 0, rolls: 0, pending: null };
  private spits: { to: Vec3; at: number; damage: number; radius: number; from: Vec3 }[] = [];
  private waves: Shockwave[] = [];
  private crowd: Crowd;
  private query: NavMeshQuery;

  constructor(
    private host: ZombieHost,
    navMesh: NavMesh,
    private map: ZombieMapData,
  ) {
    this.crowd = new Crowd(navMesh, { maxAgents: 64, maxAgentRadius: 1 });
    this.query = new NavMeshQuery(navMesh);
    this.box.spot = Math.floor(host.rng() * map.caixa.length);
  }

  dispose() {
    this.crowd.destroy();
    this.query.destroy();
  }

  private get now() {
    return this.host.now();
  }

  // --- Players ---------------------------------------------------------------------------------------------

  join(id: number, name: string) {
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
      state: 'up',
      downUntil: 0,
      feet: [0, -50, 0],
      grounded: true,
      alive: false,
      items: startItems(),
      reviving: null,
    });
    if (this.phase === 'waiting') this.countdown();
  }

  leave(id: number) {
    this.parts.delete(id);
    for (const p of this.parts.values()) if (p.reviving?.target === id) p.reviving = null;
    if (this.box.by === id && (this.box.state === 'offer' || this.box.state === 'rolling')) this.setBox('idle', null, null, 0);
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
    return p && { money: p.money, kills: p.kills, downs: p.downs, revives: p.revives, state: p.state, items: { ...p.items } };
  }

  sync(): ZombieSync {
    const { spot, state, by, item, until } = this.box;
    return {
      phase: this.phase,
      wave: this.wave,
      until: this.until,
      total: this.spec.total,
      box: { spot, state, by, item, until },
      down: [...this.parts.values()].filter((p) => p.state === 'down').map((p) => [p.id, p.downUntil]),
    };
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
    p.downUntil = this.now + ZOMBIE.jogador.caidoSegundos * 1000;
    p.reviving = null;
    for (const o of this.parts.values()) if (o.reviving?.target === id) o.reviving = null;
    this.host.emit({ t: 'zdown', id, until: p.downUntil });
    this.checkLoss();
    return true;
  }

  /** A player died (any cause: bled out, fell, the void). */
  died(id: number) {
    const p = this.parts.get(id);
    if (!p) return;
    p.state = 'dead';
    p.alive = false;
    p.reviving = null;
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

  /** E at the coffin: takes the weapon it's offering this player, or pays and spins it. */
  useBox(id: number) {
    const p = this.parts.get(id);
    if (!p || p.state !== 'up' || this.phase === 'waiting' || this.phase === 'over') return;
    const [x, y, z] = this.map.caixa[this.box.spot];
    if (Math.hypot(p.feet[0] - x, p.feet[2] - z) > ZOMBIE.caixa.alcance + 1 || Math.abs(p.feet[1] - y) > 2) return;
    if (this.box.state === 'offer' && this.box.by === id) return this.takeBox(p);
    if (this.box.state !== 'idle' || p.money < ZOMBIE.caixa.custo) return;
    p.money -= ZOMBIE.caixa.custo;
    const rolls = this.box.rolls++;
    if (this.host.rng() < duckChance(rolls)) {
      // The rubber duck: the money back, a quack, and the coffin flies off somewhere else.
      p.money += ZOMBIE.caixa.custo;
      this.setBox('duck', id, null, this.now + ZOMBIE.caixa.patoSegundos * 1000, p.money);
      return;
    }
    this.box.pending = rollBox(() => this.host.rng(), p.items).id;
    this.setBox('rolling', id, null, this.now + ZOMBIE.caixa.girarSegundos * 1000, p.money);
  }

  private takeBox(p: Part) {
    const it = itemOf(this.box.item);
    if (!it) return;
    // The weapon in that slot is thrown away.
    p.items = { ...p.items, [itemSlot(it)]: it.id };
    this.host.setLoadout(p.id, zombieLoadout(p.items));
    this.setBox('idle', null, null, 0);
  }

  private setBox(state: BoxInfo['state'], by: number | null, item: string | null, until: number, money?: number) {
    Object.assign(this.box, { state, by, item, until });
    const { spot } = this.box;
    this.host.emit({ t: 'zbox', spot, state, by, item, until, ...(money !== undefined ? { money } : {}) });
  }

  private tickBox(now: number) {
    const b = this.box;
    if (b.state === 'idle' || now < b.until) return;
    if (b.state === 'rolling') this.setBox('offer', b.by, b.pending, now + ZOMBIE.caixa.ofertaSegundos * 1000);
    else if (b.state === 'offer') this.setBox('idle', null, null, 0);
    else if (b.state === 'duck') this.setBox('moving', null, null, now + ZOMBIE.caixa.mudarSegundos * 1000);
    else if (b.state === 'moving') {
      const n = this.map.caixa.length;
      b.spot = (b.spot + 1 + Math.floor(this.host.rng() * (n - 1))) % n;
      b.rolls = 0;
      this.setBox('idle', null, null, 0);
    }
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

  private pay(p: Part, amount: number) {
    p.money += amount;
    p.earned += amount;
  }

  private xp(p: Part, amount: number) {
    if (amount <= 0) return;
    p.xp += amount;
    this.host.giveXp(p.id, amount);
  }

  /** A bloater bursts: hurts players and zombies around it (a player's kill gets the chain's credit). */
  private burst(z: Zombie, credit: number | null) {
    const e = ZOMBIE.tipos.inchado.explosao!;
    const now = this.now;
    this.host.emit({ t: 'zfx', fx: 'boom', id: z.id, at: z.pos, r: e.raio, t0: now, t1: now });
    for (const p of this.parts.values()) {
      if (p.state !== 'up') continue;
      const d = Math.hypot(p.feet[0] - z.pos[0], p.feet[1] - z.pos[1], p.feet[2] - z.pos[2]);
      if (d <= e.raio) this.host.hurt(p.id, Math.round(e.dano * (1 - (0.6 * d) / e.raio)), z.pos);
    }
    for (const o of [...this.zombies.values()]) {
      if (o.dead || dist2(o.pos, z.pos) > e.raio || Math.abs(o.pos[1] - z.pos[1]) > 2.5) continue;
      this.damage(o.id, credit, e.danoZumbi, 'blast');
    }
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
        money.push([p.id, p.money]);
      }
      if (p.state === 'down') this.standUp(p, null);
    }
    if (money.length) this.host.emit({ t: 'zmoney', m: money, why: 'wave' });
    if (this.wave >= WAVES) return this.finish(true);
    this.phase = 'break';
    this.until = now + (this.spec.boss ? ZOMBIE.intervaloChefeSegundos : ZOMBIE.intervaloSegundos) * 1000;
    this.emitWave();
    for (const p of this.parts.values()) if (p.state === 'dead') this.respawnDead(p);
  }

  /** A dead player comes back for the break, with the starting weapons (the coffin's are lost) and their money. */
  private respawnDead(p: Part) {
    p.items = startItems();
    this.host.setLoadout(p.id, zombieLoadout(p.items));
    this.host.allowRespawn(p.id);
  }

  private standUp(p: Part, by: number | null) {
    p.state = 'up';
    p.downUntil = 0;
    this.host.revive(p.id, ZOMBIE.jogador.reanimarVida);
    const r = by !== null ? this.parts.get(by) : undefined;
    this.host.emit({ t: 'zup', id: p.id, by: r ? by : null, ...(r ? { money: r.money } : {}) });
  }

  private checkLoss() {
    if (this.phase !== 'wave' || !this.parts.size) return;
    if ([...this.parts.values()].some((p) => p.state === 'up')) return;
    this.finish(false);
  }

  private finish(won: boolean) {
    const now = this.now;
    if (won) for (const p of this.parts.values()) this.xp(p, ZOMBIE.xp.vitoria);
    this.phase = 'over';
    this.until = now + ZOMBIE.fimSegundos * 1000;
    this.clearZombies(true);
    if (this.box.state !== 'idle' && this.box.state !== 'moving') this.setBox('idle', null, null, 0);
    const players: ZSummaryRow[] = [...this.parts.values()].map((p) => ({ id: p.id, name: p.name, kills: p.kills, headshots: p.headshots, earned: p.earned, downs: p.downs, revives: p.revives, xp: p.xp }));
    this.host.emit({ t: 'zend', won, wave: this.wave, secs: Math.round((now - this.startedAt) / 1000), players, restartAt: this.until });
    this.emitWave();
  }

  /** A new match for whoever is there: fresh money and weapons, everyone back at once. */
  private restart() {
    for (const p of this.parts.values()) {
      Object.assign(p, { money: ZOMBIE.dinheiroInicial, earned: 0, kills: 0, headshots: 0, downs: 0, revives: 0, xp: 0, state: 'up', downUntil: 0, reviving: null, items: startItems() });
      this.host.setLoadout(p.id, zombieLoadout(p.items));
    }
    this.spec = waveSpec(1, this.parts.size);
    this.host.newMatch([...this.parts.keys()]);
    this.countdown();
  }

  /** Nobody left: back to waiting, no zombies. */
  private reset() {
    this.clearZombies(false);
    this.phase = 'waiting';
    this.wave = 0;
    this.until = 0;
    this.spits = [];
    this.waves = [];
    this.box.state = 'idle';
    this.box.by = this.box.item = this.box.pending = null;
    this.box.until = 0;
  }

  private clearZombies(announce: boolean) {
    for (const z of [...this.zombies.values()]) {
      z.dead = true;
      this.crowd.removeAgent(z.agent);
      if (announce) this.host.emit({ t: 'zdie', id: z.id, by: null, how: 'blast' });
    }
    this.zombies.clear();
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
      const r = this.query.findRandomPointAroundCircle(c.point, radius, { startRef: c.polyRef, halfExtents: HALF });
      if (r.success && Math.abs(r.randomPoint.y - c.point.y) < 1.5) return v3(r.randomPoint);
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

  private tickSpawns(now: number) {
    const s = this.spec;
    if (this.spawned >= s.total || now < this.nextSpawnAt || this.zombies.size >= s.maxAlive) return;
    this.nextSpawnAt = now + s.interval * 1000;
    const kind = pickType(s, () => this.host.rng());
    const run = kind === 'comum' && this.host.rng() < s.runFrac;
    this.spawn(kind, this.walkable(this.spawnPoint(), 1.5), false, run);
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
      if (i.alive && !p.alive && p.state === 'dead') p.state = 'up';
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
    this.tickZombies(dt, now);
    this.tickProjectiles(now);
    if (this.phase === 'wave' && this.spawned >= this.spec.total && this.zombies.size === 0) this.endWave();
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
      this.pay(p, ZOMBIE.dinheiro.reanimar);
      this.xp(p, ZOMBIE.xp.reanimar);
      this.standUp(t, p.id);
    }
  }

  private tickProjectiles(now: number) {
    this.spits = this.spits.filter((s) => {
      if (now < s.at) return true;
      for (const p of this.parts.values()) {
        if (p.state === 'up' && dist2(p.feet, s.to) <= s.radius && Math.abs(p.feet[1] - s.to[1]) < 2) this.host.hurt(p.id, s.damage, s.from);
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
        this.host.hurt(p.id, w.damage, w.center);
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

  /** Nearest standing player (height counts double: a floor away is far). */
  private nearest(z: Zombie, standing: Part[]): Part | null {
    let best: Part | null = null;
    let bestD = Infinity;
    for (const p of standing) {
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
    if (isBoss(z.kind) && this.bossMove(z, t, d, now, standing)) return;
    const type = isBoss(z.kind) ? null : ZOMBIE.tipos[z.kind as ZType];
    const reach = isBoss(z.kind) ? ZOMBIE.chefes[z.kind as BossId].alcance : type!.alcance;
    if (z.kind === 'inchado' && d <= reach && dy < 2) return this.startAct(z, 'fuse', now + type!.preparo * 1000);
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
    if (d <= reach && dy < 2 && now >= z.nextAttack && z.kind !== 'inchado') {
      z.yaw = yawTo(t.feet[0] - z.pos[0], t.feet[2] - z.pos[2]);
      const windup = isBoss(z.kind) ? ZOMBIE.chefes[z.kind as BossId].preparo : type!.preparo;
      return this.startAct(z, 'swipe', now + windup * 1000);
    }
    this.chase(z, t.feet, now);
  }

  private chase(z: Zombie, goal: Vec3, now: number) {
    if (z.goal && dist2(z.goal, goal) < 1 && now < z.repathAt) return;
    z.goal = [...goal];
    z.repathAt = now + REPATH_MS;
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
        if (t?.state === 'up' && dist2(z.pos, t.feet) <= reach + 0.6 && Math.abs(t.feet[1] - z.pos[1]) < 2.2) this.host.hurt(t.id, zombieHit(z.kind, wave), z.pos);
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
          if (dist2(p.feet, z.pos) <= s.raio && Math.abs(p.feet[1] - z.pos[1]) < 2.5) this.host.hurt(p.id, s.dano, z.pos);
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
          this.host.hurt(p.id, s.dano, z.pos);
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
      this.host.hurt(p.id, c.dano, z.pos);
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
    if (z.act || moved > 0.6 || !t || dist2(z.pos, t.feet) < 6) return;
    const to = this.walkable(this.spawnPoint(), 1.5);
    z.agent.teleport(pt(to));
    z.pos = to;
    z.riseUntil = now + RISE_MS;
    z.goal = null;
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
      if (o.act === 'swipe') f |= ZF.attack;
      if (o.act === 'fuse') f |= ZF.fuse;
      if (o.act === 'spit') f |= ZF.spit;
      if (o.act && ['slam', 'summon', 'scream', 'blink', 'chargeWindup', 'pound'].includes(o.act)) f |= ZF.special;
      if (o.hidden) f |= ZF.hidden;
      if (o.run || o.act === 'charge') f |= ZF.run;
      if (o.enraged) f |= ZF.enraged;
      z.push([o.id, Z_KINDS.indexOf(o.kind), r2(o.pos[0]), r2(o.pos[1]), r2(o.pos[2]), r2(o.yaw), f]);
    }
    const left = this.phase === 'wave' ? Math.max(0, this.spec.total - this.killed) + extras + (this.boss ? 1 : 0) : 0;
    return { t: 'zsnap', time: now, z, left, ...(this.boss ? { boss: [this.boss.id, Math.ceil(this.boss.hp), this.boss.max] as [number, number, number] } : {}) };
  }
}
