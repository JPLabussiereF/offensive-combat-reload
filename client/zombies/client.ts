// The zumbi mode on the player's side: listens to the match (the server's online, the local one solo, through
// the same messages), keeps what the HUD shows (the wave, zombies left, the boss's health, our money and
// weapons, who's down), draws the zombies (view.ts) and the Mystery Coffin (coffin.ts), and turns E into the
// coffin's purchase or a revive. It reports our hits on zombies; it never decides one: the match does.
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PlayerInfo, ServerMsg, Vec3, ZombieSync, ZPhase } from '@shared/protocol';
import type { GunStats } from '@shared/arsenal';
import type { HitRegion } from '@shared/weapons';
import type { MapId } from '@shared/maps';
import { itemOf, itemSlot, startItems, waveSpec, WAVES, ZF, ZOMBIE, type BossId, type KillHow, type ZItems } from '@shared/zombies';
import type { Hud } from '../ui/hud';
import type { Sfx } from '../audio/sfx';
import type { Effects } from '../render/effects';
import type { Physics } from '../world/physics';
import type { HitboxRegistry } from '../gameplay/targets';
import { t, type StringKey } from '../ui/strings';
import { ZombieView, Zombie } from './view';
import { Coffin } from './coffin';
import type { ZombieLink } from './link';

/** How the zombie side talks to its match (link.ts): the server's connection online, the local match solo. */
export type { ZombieLink };

/** What the zombie side needs from the game (client/main.ts). */
export interface ZombieGame {
  me: number;
  hud: Hud;
  sfx: Sfx;
  effects: Effects;
  physics: Physics;
  scene: THREE.Scene;
  registry: HitboxRegistry;
  world: RAPIER.World;
  /** Our feet (and whether we're alive, not dead). */
  feet(): THREE.Vector3;
  alive(): boolean;
  nameOf(id: number): string;
  /** Teammates (online): where each one is. */
  teammates(): { id: number; position: THREE.Vector3; alive: boolean }[];
  /** Full ammo and grenades (a wave cleared). */
  refill(): void;
  /** Back at a spawn point now (the break after dying, a new match). */
  respawn(): void;
  /** A zombie move threw us (m/s). */
  push(v: Vec3): void;
  shake(amount: number): void;
  /** A teammate is down / back up: their avatar lies down or gets up. */
  setDowned(id: number, down: boolean): void;
  killFeedback(at: THREE.Vector3, head: boolean): void;
}

const HOW_LABEL: Record<KillHow, StringKey> = { gun: 'kill', head: 'headshot', groin: 'groin', knife: 'knife', grenade: 'kill', blast: 'zBlast' };
/** How close E reaches the coffin or a teammate who's down (m). */
const REACH = 2.2;

const fmtTime = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export class ZombieClient {
  readonly view: ZombieView;
  readonly coffin: Coffin;
  phase: ZPhase = 'waiting';
  wave = 0;
  private until = 0;
  private left = 0;
  private boss: { id: number; hp: number; max: number; kind: BossId | null } | null = null;
  private bossKind: BossId | null = null;
  money = ZOMBIE.dinheiroInicial;
  items: ZItems = startItems();
  /** Players down, and when each bleeds out (match clock). */
  readonly down = new Map<number, number>();
  /** Who's reviving whom right now (one revive per reviver), until when. */
  private revives = new Map<number, { by: number; until: number }>();
  /** The teammate we're holding E over. */
  private reviveTarget: number | null = null;
  /** Died during a wave: back only at the break. */
  private diedInWave = false;
  private summary: Extract<ServerMsg, { t: 'zend' }> | null = null;
  private slowUntil = 0;
  private slowFactor = 1;
  private heartbeatIn = 0;
  private markers = new Map<number, THREE.Sprite>();
  private markerTex: THREE.CanvasTexture | null = null;
  private lastRender = 0;

  constructor(
    readonly link: ZombieLink,
    private game: ZombieGame,
    map: MapId,
    sync?: ZombieSync,
  ) {
    const data = ZOMBIE.mapas[map];
    this.view = new ZombieView(game.world, game.scene, game.registry, game.sfx, game.effects, { ear: () => game.feet() });
    this.coffin = new Coffin(game.scene, game.physics, data?.caixa ?? [], game.sfx);
    if (sync) this.applySync(sync);
    this.listen();
  }

  private get me() {
    return this.game.me;
  }

  get downed() {
    return this.down.has(this.me);
  }

  /** A boss wave is on (the fog turns red). */
  get bossWave() {
    return this.phase === 'wave' && this.bossKind !== null;
  }

  private applySync(s: ZombieSync) {
    this.phase = s.phase;
    this.wave = s.wave;
    this.until = s.until;
    // Joining mid-wave: the boss of the wave, if it has one (the fog, the bar's name).
    this.bossKind = s.phase === 'wave' ? waveSpec(s.wave, 1).boss : null;
    this.coffin.set(s.box, this.link.now());
    for (const [id, until] of s.down) {
      this.down.set(id, until);
      this.game.setDowned(id, true);
    }
  }

  /** The players' match state (money, weapons) from the scoreboard updates. */
  syncInfo(players: Iterable<PlayerInfo>) {
    for (const p of players) {
      if (p.id !== this.me || !p.zumbi) continue;
      this.money = p.zumbi.money;
      this.items = p.zumbi.items;
    }
  }

  private listen() {
    const L = this.link;
    const g = this.game;
    L.on('zsnap', (m) => {
      this.view.snapshot(m.time, m.z, m.boss?.[0]);
      this.left = m.left;
      this.boss = m.boss ? { id: m.boss[0], hp: m.boss[1], max: m.boss[2], kind: this.bossKind } : null;
    });
    L.on('zwave', (m) => {
      const was = this.phase;
      this.phase = m.phase;
      this.wave = m.wave;
      this.until = m.until;
      if (m.phase === 'wave') {
        this.bossKind = m.boss ?? null;
        const title = m.wave >= WAVES ? t('zLastWave') : t('zWaveBanner', { n: m.wave });
        g.hud.showBanner(m.boss ? `${title} · ${t(`zbossIntro_${m.boss}` as StringKey)}` : title, m.boss ? 'bird' : 'level');
        g.sfx.waveStart(!!m.boss);
      } else if (m.phase === 'break') {
        g.hud.showBanner(t('zBreakBanner', { n: m.wave }), 'level');
        g.sfx.waveEnd();
        g.refill();
      } else if (m.phase === 'countdown' && was === 'over') {
        this.summary = null;
        g.hud.showZombieSummary(null);
      }
      // Dead since the wave: back now (with the starting weapons, the server already sent them).
      if (m.phase !== 'wave' && this.diedInWave && m.phase !== 'over') {
        this.diedInWave = false;
        if (!g.alive()) g.respawn();
      }
    });
    L.on('zdie', (m) => {
      const z = this.view.get(m.id);
      const at = z ? z.position.clone().setY(z.position.y + 1.1 * z.scale) : null;
      this.view.kill(m.id);
      if (m.by !== this.me) return;
      if (m.money !== undefined) this.money = m.money;
      if (m.award) {
        g.hud.cash(m.award, t(HOW_LABEL[m.how]));
        g.sfx.cashRegister();
      }
      if (at) g.killFeedback(at, m.how === 'head' || m.how === 'groin');
      if (z && this.boss?.id === m.id) g.hud.showBanner(t('zBossDown', { boss: z.name }), 'taunt');
    });
    L.on('zfx', (m) => {
      const now = L.now();
      this.view.fx(m, now);
      const f = g.feet();
      if (m.fx === 'pound' && Math.hypot(f.x - m.at[0], f.z - m.at[2]) < (m.r ?? 15)) g.hud.showBanner(t('zJump'), 'bird');
      if (m.fx === 'boom' && Math.hypot(f.x - m.at[0], f.z - m.at[2]) < 12) g.shake(0.5);
    });
    L.on('zhitfx', (m) => {
      if (m.id !== this.me) return;
      if (m.v) g.push(m.v);
      if (m.slow && m.until) {
        this.slowFactor = m.slow;
        this.slowUntil = m.until;
      }
      g.shake(m.fx === 'charge' ? 0.9 : 0.5);
    });
    L.on('zbox', (m) => {
      this.coffin.set(m, L.now());
      if (m.by === this.me && m.money !== undefined) this.money = m.money;
      if (m.state === 'duck' && m.by === this.me) g.hud.notice(t('zBoxRefund'));
      if (m.state === 'moving') g.hud.notice(t('zBoxMoved'));
    });
    L.on('zmoney', (m) => {
      for (const [id, money] of m.m) {
        if (id !== this.me) continue;
        const gain = money - this.money;
        this.money = money;
        if (gain > 0) {
          g.hud.cash(gain, t(m.why === 'wave' ? 'zWaveBonus' : m.why === 'boss' ? 'zBossReward' : 'zAssist'));
          g.sfx.cashRegister();
        }
      }
    });
    L.on('zdown', (m) => {
      this.down.set(m.id, m.until);
      g.setDowned(m.id, true);
      if (m.id === this.me) {
        g.hud.showDeath(t('zDownTitle'));
        g.sfx.sadTrombone();
      } else g.hud.notice(t('zTeammateDown', { name: g.nameOf(m.id) }));
    });
    L.on('zrevive', (m) => {
      if (m.until > 0) this.revives.set(m.id, { by: m.by, until: m.until });
      else if (this.revives.get(m.id)?.by === m.by) this.revives.delete(m.id);
      if (m.until === 0 && m.by === this.me && this.reviveTarget === m.id) this.reviveTarget = null;
    });
    L.on('playerLoadout', (m) => {
      if (m.id !== this.me || !this.lastOffer) return;
      // The coffin's weapon reached our hands (the game puts it there): say which.
      const it = itemOf(this.lastOffer);
      this.lastOffer = null;
      if (it) this.items = { ...this.items, [itemSlot(it)]: it.id };
      if (it) g.hud.showBanner(t('zBoxGot', { item: t(`zitem_${it.id}` as StringKey), rarity: t(`rar_${it.raridade}` as StringKey) }), 'level');
    });
    L.on('zup', (m) => {
      this.down.delete(m.id);
      this.revives.delete(m.id);
      g.setDowned(m.id, false);
      if (m.id === this.me) {
        g.hud.showDeath(null);
        g.sfx.reviveDone();
      }
      if (m.by === this.me) {
        this.reviveTarget = null;
        if (m.money !== undefined) {
          g.hud.cash(m.money - this.money, t('zRevive'));
          this.money = m.money;
          g.sfx.cashRegister();
        }
      }
      if (m.by !== null && m.by !== this.me) g.hud.notice(t('zRevived', { name: g.nameOf(m.by), who: m.id === this.me ? t('you') : g.nameOf(m.id) }));
    });
    L.on('zend', (m) => {
      this.summary = m;
      this.down.clear();
      this.revives.clear();
      for (const id of [...this.markers.keys()]) g.setDowned(id, false);
      g.hud.showDeath(null);
      if (m.won) {
        g.sfx.airHorn();
        g.sfx.applause(2.5);
      } else g.sfx.sadTrombone();
      this.renderSummary();
    });
    L.on('kill', (m) => {
      this.down.delete(m.victim);
      g.setDowned(m.victim, false);
      if (m.victim === this.me && this.phase === 'wave') this.diedInWave = true;
      if (m.victim !== this.me && m.kind === 'zombie') g.hud.notice(t('zBledOut', { name: g.nameOf(m.victim) }));
    });
  }

  /** The item the coffin offered us last (named when it reaches our hands). */
  private lastOffer: string | null = null;

  private renderSummary() {
    const s = this.summary;
    if (!s) return this.game.hud.showZombieSummary(null);
    const rows = [...s.players]
      .sort((a, b) => b.kills - a.kills)
      .map((p) => ({
        me: p.id === this.me,
        cells: [p.name, String(p.kills), String(p.headshots), `$${p.earned}`, String(p.downs), String(p.revives), this.link.online ? `+${p.xp}` : '—'],
      }));
    this.game.hud.showZombieSummary({
      title: t(s.won ? 'zWon' : 'zLost'),
      sub: t('zSumSub', { wave: s.wave, total: WAVES, time: fmtTime(s.secs) }),
      won: s.won,
      head: [t('player'), t('zColKills'), t('zColHead'), t('zColEarned'), t('zColDowns'), t('zColRevives'), t('zColXp')],
      rows,
      next: t('zSumNext', { s: Math.max(0, Math.ceil((s.restartAt - this.link.now()) / 1000)) }),
    });
  }

  /** A new match: everyone back, nothing carried over. */
  reset() {
    this.summary = null;
    this.game.hud.showZombieSummary(null);
    this.down.clear();
    this.revives.clear();
    this.diedInWave = false;
    this.reviveTarget = null;
    this.money = ZOMBIE.dinheiroInicial;
    this.items = startItems();
    this.view.clear();
    for (const id of [...this.markers.keys()]) this.game.setDowned(id, false);
  }

  // --- Combat: what we hit, the match decides ---------------------------------------------------------------

  isZombie(target: unknown): target is Zombie {
    return target instanceof Zombie;
  }

  shot(z: Zombie, region: HitRegion, dist: number, gun: GunStats, keep: number) {
    this.link.send({ t: 'zhit', z: z.id, region, dist: +dist.toFixed(2), w: gun.arma, ...(keep < 1 ? { keep: +keep.toFixed(3) } : {}) });
  }

  stab(z: Zombie) {
    this.link.send({ t: 'zstab', z: z.id });
  }

  /** What a blast reached: each zombie with a clear line to it (`dist` gives the distance, or null if walled off). */
  blast(dist: (samples: THREE.Vector3[]) => number | null, radius: number): { z: number; dist: number }[] {
    const out: { z: number; dist: number }[] = [];
    for (const z of this.view.targets()) {
      const p = z.position;
      const s = z.scale;
      const d = dist([new THREE.Vector3(p.x, p.y + 0.3 * s, p.z), new THREE.Vector3(p.x, p.y + 1.1 * s, p.z), new THREE.Vector3(p.x, p.y + 1.6 * s, p.z)]);
      if (d !== null && d <= radius + 0.5 * s) out.push({ z: z.id, dist: +d.toFixed(2) });
    }
    return out;
  }

  // --- E: the coffin and revives -----------------------------------------------------------------------------

  private nearCoffin(): boolean {
    const f = this.game.feet();
    const c = this.coffin.position;
    const st = this.coffin.state;
    return st.spot >= 0 && st.state !== 'moving' && Math.hypot(f.x - c.x, f.z - c.z) < REACH && Math.abs(f.y - c.y) < 1.6;
  }

  /** The nearest teammate who's down within reach (and nobody else reviving them), or null. */
  private nearDowned(): number | null {
    const f = this.game.feet();
    let best: number | null = null;
    let bestD = REACH;
    for (const p of this.game.teammates()) {
      if (!this.down.has(p.id)) continue;
      const r = this.revives.get(p.id);
      if (r && r.by !== this.me) continue;
      const d = Math.hypot(p.position.x - f.x, p.position.z - f.z);
      if (d < bestD && Math.abs(p.position.y - f.y) < 1.6) {
        bestD = d;
        best = p.id;
      }
    }
    return best;
  }

  /** E pressed: the coffin's purchase (or taking its weapon) when we're at it. True when it was used. */
  press(): boolean {
    if (this.downed || !this.game.alive()) return this.downed;
    if (this.nearDowned() !== null) return true;
    if (!this.nearCoffin()) return false;
    const st = this.coffin.state;
    if (st.state === 'offer' && st.by === this.me) this.lastOffer = st.item;
    this.link.send({ t: 'box' });
    return true;
  }

  /** E held (every tick): reviving the teammate down next to us; let go or walk away and it stops. */
  hold(held: boolean) {
    const target = held && this.game.alive() && !this.downed ? this.nearDowned() : null;
    if (target === this.reviveTarget) return;
    if (this.reviveTarget !== null) this.link.send({ t: 'revive', id: this.reviveTarget, on: false });
    this.reviveTarget = target;
    if (target !== null) this.link.send({ t: 'revive', id: target, on: true });
  }

  /** Busy reviving (no shooting meanwhile). */
  get reviving() {
    return this.reviveTarget !== null;
  }

  /** The context prompt: [E] text and a bar (0..1), or null. */
  prompt(): { text: string; frac: number } | null {
    if (this.downed || !this.game.alive() || this.phase === 'over') return null;
    const now = this.link.now();
    if (this.reviveTarget !== null) {
      const r = this.revives.get(this.reviveTarget);
      const total = ZOMBIE.jogador.reanimarSegundos * 1000;
      return { text: t('zReviving', { name: this.game.nameOf(this.reviveTarget) }), frac: r ? 1 - Math.max(0, r.until - now) / total : 0 };
    }
    const d = this.nearDowned();
    if (d !== null) return { text: t('zRevivePrompt', { name: this.game.nameOf(d) }), frac: 1 - Math.max(0, (this.down.get(d) ?? now) - now) / (ZOMBIE.jogador.caidoSegundos * 1000) };
    if (!this.nearCoffin()) return null;
    const st = this.coffin.state;
    const cost = ZOMBIE.caixa.custo;
    const left = st.until ? Math.max(0, st.until - now) : 0;
    switch (st.state) {
      case 'idle':
        return { text: this.money >= cost ? t('zBoxBuy', { cost }) : t('zBoxPoor', { cost, money: this.money }), frac: Math.min(1, this.money / cost) };
      case 'rolling':
        return { text: t('zBoxSpinning'), frac: 1 - left / (ZOMBIE.caixa.girarSegundos * 1000) };
      case 'offer': {
        const it = itemOf(st.item);
        if (st.by !== this.me || !it) return { text: t('zBoxOther', { name: this.game.nameOf(st.by ?? -1) }), frac: left / (ZOMBIE.caixa.ofertaSegundos * 1000) };
        return { text: t('zBoxTake', { item: t(`zitem_${it.id}` as StringKey), rarity: t(`rar_${it.raridade}` as StringKey) }), frac: left / (ZOMBIE.caixa.ofertaSegundos * 1000) };
      }
      case 'duck':
        return { text: t('zBoxDuck'), frac: 0 };
      default:
        return null;
    }
  }

  // --- Rules the game asks about -----------------------------------------------------------------------------

  /** Whether we may come back now (after dying during a wave: only at the break; never during the summary). */
  canRespawn(): boolean {
    return !this.diedInWave && this.phase !== 'over';
  }

  /** Movement while the bride's scream lasts. */
  speedMul(): number {
    return this.link.now() < this.slowUntil ? this.slowFactor : 1;
  }

  /** Seconds left of the scream's slow (0: none), for the buff panel. */
  slowLeft(): number {
    return Math.max(0, (this.slowUntil - this.link.now()) / 1000);
  }

  // --- Per frame ---------------------------------------------------------------------------------------------

  update(dt: number) {
    const now = this.link.now();
    this.view.update(this.link.renderTime(), dt, now);
    this.coffin.update(dt, now);
    this.view.render(dt, now);
    this.renderMarkers();
    // The HUD, a few times a second is enough.
    this.lastRender += dt;
    if (this.lastRender < 1 / 15) return;
    this.lastRender = 0;
    this.renderHud(now);
  }

  private renderHud(now: number) {
    const g = this.game;
    const secs = Math.max(0, Math.ceil((this.until - now) / 1000));
    let title = '';
    let sub = '';
    switch (this.phase) {
      case 'waiting':
        title = t('zWaiting');
        break;
      case 'countdown':
        title = t('zCountdown');
        sub = t('zCountdownSub', { s: secs });
        break;
      case 'wave':
        title = t('zWave', { n: this.wave, total: WAVES });
        sub = this.left === 1 ? t('zLeftOne') : t('zLeft', { n: this.left });
        break;
      case 'break':
        title = t('zBreak');
        sub = t('zBreakSub', { s: secs });
        break;
      case 'over':
        title = t('zOver');
        break;
    }
    const b = this.boss;
    const bz = b ? this.view.get(b.id) : undefined;
    g.hud.setZombie({
      title,
      sub,
      bossWave: this.phase === 'wave' && !!this.bossKind,
      boss: b && b.max > 0 ? { name: bz?.name ?? t(`zboss_${this.bossKind ?? 'coveiro'}` as StringKey), frac: b.hp / b.max, enraged: !!(bz && bz.flags & ZF.enraged) } : null,
    });
    g.hud.setMoney(this.money);
    if (this.summary) g.hud.setZombieSummaryNext(t('zSumNext', { s: Math.max(0, Math.ceil((this.summary.restartAt - now) / 1000)) }));
    // Down: the bleed-out countdown (and a heartbeat), or who's coming to help.
    if (this.downed) {
      const r = this.revives.get(this.me);
      const left = Math.max(0, Math.ceil(((this.down.get(this.me) ?? now) - now) / 1000));
      g.hud.setDeathText(r ? t('zBeingRevived', { name: g.nameOf(r.by) }) : t('zDownSub', { s: left }));
      this.heartbeatIn -= 1 / 15;
      if (this.heartbeatIn <= 0) {
        this.heartbeatIn = 1.1;
        g.sfx.heartbeat();
      }
    } else if (this.diedInWave && !g.alive()) g.hud.setDeathText(t('zDeadWait'));
  }

  /** A red cross over every teammate who's down, seen through walls. */
  private renderMarkers() {
    const seen = new Set<number>();
    for (const p of this.game.teammates()) {
      // Their avatar lies down while they're down (teammates who joined after it happened too).
      this.game.setDowned(p.id, this.down.has(p.id));
      if (!this.down.has(p.id)) continue;
      seen.add(p.id);
      let s = this.markers.get(p.id);
      if (!s) {
        this.markerTex ??= crossTexture();
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTex, depthTest: false, depthWrite: false, transparent: true }));
        s.scale.set(0.6, 0.6, 1);
        s.renderOrder = 10;
        this.game.scene.add(s);
        this.markers.set(p.id, s);
      }
      s.position.copy(p.position).setY(p.position.y + 1.2 + Math.sin(performance.now() / 250) * 0.06);
    }
    for (const [id, s] of this.markers) {
      if (seen.has(id)) continue;
      this.game.scene.remove(s);
      this.markers.delete(id);
    }
  }

  setDebug(v: boolean) {
    this.view.setDebug(v);
  }
}

function crossTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff4a3d';
  g.fillRect(26, 12, 12, 40);
  g.fillRect(12, 26, 40, 12);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
