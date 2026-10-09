// The zumbi mode on the player's side: listens to the match (the server's online, the local one solo, through
// the same messages), keeps what the HUD shows (the wave, zombies left, the boss's health, our money and
// weapons, who's down, the gaps the horde is coming through), draws the zombies (view.ts), the Mystery Coffin
// (coffin.ts) and the barricades (barricades.ts), and turns E into the coffin's purchase, a revive or work on a
// barricade (held). It reports our hits on zombies; it never decides one: the match does.
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { BoxInfo, PlayerInfo, ServerMsg, Vec3, ZBarricade, ZombieSync, ZPhase } from '@shared/protocol';
import type { GunStats } from '@shared/arsenal';
import { critRegion, type HitRegion } from '@shared/weapons';
import { emptyBarricade, inGap, inReach, insideWall, needsWork } from '@shared/barricades';
import { gunDamageToZombie, isBoss, itemOf, startItems, waveSpec, WAVES, weaponMul, withItem, zombieHp, ZF, ZOMBIE, type BossId, type KillHow, type ZFlaw, type ZItems, type ZombieMapData } from '@shared/zombies';
import type { Hud } from '../ui/hud';
import type { Sfx } from '../audio/sfx';
import type { Effects } from '../render/effects';
import type { Physics } from '../world/physics';
import type { HitboxRegistry } from '../gameplay/targets';
import { t, type StringKey } from '../ui/strings';
import { ZombieView, Zombie } from './view';
import { Coffin } from './coffin';
import { Totem } from './totem';
import { GhostView } from './ghosts';
import { CrowView } from './crows';
import { BarricadeView } from './barricades';
import { flawText } from './ambience';
import type { ZombieLink } from './link';
import { PET_ABILITIES, petCooldown, type PetId } from '@shared/pets';
import { pawTex } from '../pets/manager';

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
  /** Where we look (yaw, the game's convention: 0 looks down -Z), for the HUD's arrows. */
  yaw(): number;
  nameOf(id: number): string;
  /** The key an action is on, for the coffin's hints (null: none, or no keyboard in use: a controller, a phone). */
  keyName(action: 'donate' | 'refuse'): string | null;
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
  /** Our pet along (PF-29): which, its name for us (null: the catalog's), its collar's color and its face. */
  pet: { id: PetId; name: string | null; color: string; face: Promise<string> } | null;
  /** The collar color of a player's pet (the paw over a teammate the cat is lifting), or null without one. */
  petColor(owner: number): number | null;
}

const HOW_LABEL: Record<KillHow, StringKey> = { gun: 'kill', head: 'headshot', groin: 'groin', knife: 'knife', grenade: 'kill', blast: 'zBlast' };
/** How close E reaches the coffin or a teammate who's down (m). */
const REACH = 2.2;

const fmtTime = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/** How far outside a gap zombies count as coming through it (the HUD's arrows), m. */
const GAP_WATCH = 10;

export class ZombieClient {
  readonly view: ZombieView;
  readonly coffin: Coffin;
  /** The chapel's totem (the no-break vigil), where the map has one. */
  readonly totem: Totem | null;
  /** The haunted graves' ghosts (drawn where the match says they are). */
  readonly ghosts: GhostView;
  /** The vigil is on (for the rest of the match). */
  totemOn = false;
  readonly barricades: BarricadeView;
  private readonly map: ZombieMapData;
  /** Every barricade as the match last said. */
  readonly bars: ZBarricade[];
  /** Who's working on which barricade (by gap), until when. */
  private work = new Map<number, { by: number; until: number }>();
  /** The gap we're holding E at. */
  private workTarget: number | null = null;
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
  /** Joined while a wave was on: in only at the break (it rides on diedInWave; this only changes the words). */
  private joinedInWave = false;
  private summary: Extract<ServerMsg, { t: 'zend' }> | null = null;
  private slowUntil = 0;
  private slowFactor = 1;
  /** Bleeding from the thorns until then (server ms). */
  private bleedUntil = 0;
  private heartbeatIn = 0;
  private markers = new Map<number, THREE.Sprite>();
  private markerTex: THREE.CanvasTexture | null = null;
  /** Players profaned at the altar, until when (server ms): the horde goes after them, a mark floats over them. */
  private marks = new Map<number, number>();
  private markSprites = new Map<number, THREE.Sprite>();
  private markTex: THREE.CanvasTexture | null = null;
  /** The dead trees' crows, around whoever they peck. */
  private crows: CrowView;
  private lastRender = 0;
  /** The cats lifting their owners (by owner): until when, and whether one waits for a teammate's revive. */
  private catLift = new Map<number, { until: number; paused: boolean }>();
  /** Our pet (the HUD's icon): when it's ready again, what it's doing until when, the cat's lifts, the last text. */
  private petReady = 0;
  private petUntil = 0;
  private petN: number | null = null;
  private petFlash: { text: string; until: number } | null = null;
  private petFace = '';
  private paws = new Map<number, THREE.Sprite>();

  constructor(
    readonly link: ZombieLink,
    private game: ZombieGame,
    /** The map's zumbi layout (its data's `zumbi`). */
    map: ZombieMapData,
    sync?: ZombieSync,
  ) {
    this.map = map;
    this.view = new ZombieView(game.world, game.scene, game.registry, game.sfx, game.effects, { ear: () => game.feet() });
    this.coffin = new Coffin(game.scene, game.physics, this.map.caixa, game.sfx);
    this.totem = this.map.totem ? new Totem(game.scene, this.map.totem) : null;
    this.ghosts = new GhostView(game.scene);
    this.crows = new CrowView(game.scene, game.sfx);
    this.barricades = new BarricadeView(game.scene, game.physics, this.map.barricadas, game.sfx, game.effects);
    this.bars = this.map.barricadas.map(() => emptyBarricade());
    if (sync) this.applySync(sync);
    // Online, a wave already on: we wait for the break like the dead (the server refuses our respawn till then).
    if (link.online && sync?.phase === 'wave') this.diedInWave = this.joinedInWave = true;
    if (game.pet) {
      this.petN = game.pet.id === 'gato' ? PET_ABILITIES.gato.cargas : null;
      void game.pet.face.then((url) => (this.petFace = url));
    }
    this.listen();
  }

  /** Online, out until the break (bled out, or joined during a wave): the game shows a teammate's view (spectate.ts). */
  get outOfWave() {
    return this.link.online && this.diedInWave && !this.game.alive();
  }

  /** Joined during a wave and still waiting for the break (the game shows the wait instead of spawning us). */
  get waitingToJoin() {
    return this.joinedInWave && this.diedInWave;
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
    this.totemOn = !!s.totem;
    this.marks = new Map(s.marks ?? []);
    for (const id of s.crows ?? []) this.crows.set(id, true);
    this.totem?.set(this.totemOn);
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
    // The barricades as they are (joining mid-wave: whatever was built and what's left of it).
    (s.bars ?? []).forEach((b, i) => this.setBar(i, b));
  }

  private setBar(i: number, b: ZBarricade, fx?: Extract<ServerMsg, { t: 'zbar' }>['fx']) {
    if (!this.bars[i]) return;
    this.bars[i] = { built: b.built, boards: b.boards, hp: b.hp };
    this.barricades.set(i, this.bars[i], fx);
  }

  private gapName(i: number) {
    const g = this.map.barricadas[i];
    return g ? t(`zgap_${g.id}` as StringKey) : '';
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
      this.ghosts.snapshot(m.g);
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
        this.diedInWave = this.joinedInWave = false;
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
    L.on('zbleed', (m) => {
      if (m.id !== this.me) return;
      // A new cut: the first time a banner says why (the bars and the hedge look climbable).
      if (m.until && !this.bleedLeft()) g.hud.notice(t('zThorns'));
      this.bleedUntil = m.until;
    });
    L.on('zhitfx', (m) => {
      if (m.id !== this.me) return;
      if (m.v) g.push(m.v);
      if (m.slow && m.until) {
        this.slowFactor = m.slow;
        this.slowUntil = m.until;
      }
      g.shake(m.fx === 'charge' ? 0.9 : m.fx === 'sacrilege' ? 0.8 : 0.5);
    });
    L.on('zprofane', (m) => {
      if (!m.until) {
        this.marks.delete(m.id);
        return;
      }
      this.marks.set(m.id, m.until);
      // The bell tolls and the candles flare: everyone sees and hears who profaned the altar.
      const a = this.map.altar;
      const at = a ? new THREE.Vector3(a.c[0], a.c[1] + a.h[1] + 0.3, a.c[2]) : this.map.totem ? new THREE.Vector3(...this.map.totem) : null;
      if (at) {
        g.effects.burst('star', at, new THREE.Vector3(0, 1, 0), 26, 0xffd27a);
        g.effects.burst('spark', at, new THREE.Vector3(0, 1, 0), 18, 0xff5a3a);
        g.sfx.at(at, 'normal', (s) => s.bell(0.7));
      }
      const s = ZOMBIE.sacrilegio.profanadoSegundos;
      if (m.id === this.me) {
        g.hud.showBanner(t('zProfaneYou'), 'flaw');
        g.hud.notice(t('zProfaneHint', { s }));
      } else g.hud.notice(t('zProfaned', { name: g.nameOf(m.id), s }));
    });
    L.on('zcrows', (m) => {
      this.crows.set(m.id, m.on);
      if (m.id !== this.me) return;
      g.hud.setCrows(m.on);
      if (!m.on) return;
      g.hud.showBanner(t('zCrowsYou'), 'bird');
      g.hud.notice(t('zCrowsHint', { s: ZOMBIE.corvos.depoisSegundos }));
    });
    L.on('zghost', (m) => {
      const at = new THREE.Vector3(...m.at);
      if (m.fx === 'scare') {
        g.effects.burst('debris', at.setY(at.y + 0.2), new THREE.Vector3(0, 1, 0), 14, 0xf1f4ff);
        return;
      }
      g.sfx.ghostMoan();
      if (m.target !== this.me) return;
      g.hud.showBanner(t('zGhostsYou'), 'bird');
      g.hud.notice(t('zGhostsHint', { s: ZOMBIE.fantasmas.duracaoSegundos }));
    });
    L.on('ztotem', (m) => {
      this.totemOn = m.on;
      this.totem?.set(m.on);
      if (m.by === this.me && m.money !== undefined) this.money = m.money;
      if (m.on) g.hud.showBanner(t('zTotemOn', { name: m.by === this.me ? t('you') : g.nameOf(m.by ?? -1) }), 'level');
    });
    L.on('zbox', (m) => {
      this.coffin.set(m, L.now());
      if (m.by === this.me && m.money !== undefined) this.money = m.money;
      // Donated: the weapon stays for anyone else to take.
      const it = m.state === 'offer' && m.open ? itemOf(m.item) : undefined;
      if (it) {
        const names = { item: t(`zitem_${it.id}` as StringKey), rarity: t(`rar_${it.raridade}` as StringKey) };
        g.hud.notice(m.by === this.me ? t('zBoxYouDonated', names) : t('zBoxDonatedNotice', { ...names, name: g.nameOf(m.by ?? -1) }));
      }
      // Our roll came out damaged: said loud, before we decide to take it.
      if (m.state === 'offer' && m.by === this.me && m.flaw && !m.open) {
        g.hud.showBanner(t('zBoxDamagedOffer', { flaw: t(`zFlaw_${m.flaw}` as StringKey) }), 'flaw');
      }
    });
    L.on('zbar', (m) => {
      const before = this.bars[m.i];
      this.setBar(m.i, m, m.fx);
      if (m.by === this.me && m.money !== undefined) {
        const gain = m.money - this.money;
        this.money = m.money;
        if (m.fx === 'nail' && gain > 0) {
          g.hud.cash(gain, t('zBarNail'));
          g.sfx.cashRegister();
        }
      }
      if (m.fx === 'build' && m.by !== undefined && m.by !== this.me) g.hud.notice(t('zBarBuilt', { name: g.nameOf(m.by), gap: this.gapName(m.i) }));
      if (m.fx === 'break' && before?.built) g.hud.notice(t('zBarBroken', { gap: this.gapName(m.i) }));
    });
    L.on('zbarwork', (m) => {
      if (m.until > 0) this.work.set(m.i, { by: m.by, until: m.until });
      else if (this.work.get(m.i)?.by === m.by) this.work.delete(m.i);
      // The match stopped our work (done, or no longer possible): holding E again starts it over if there's more to do.
      if (m.until === 0 && m.by === this.me && this.workTarget === m.i) this.workTarget = null;
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
      // The coffin's weapon reached our hands (the game puts it there): say which, and whether it's damaged.
      const { item, flaw } = this.lastOffer;
      const it = itemOf(item);
      this.lastOffer = null;
      if (!it) return;
      this.items = withItem(this.items, it, flaw);
      const names = { item: t(`zitem_${it.id}` as StringKey), rarity: t(`rar_${it.raridade}` as StringKey) };
      if (flaw) {
        g.hud.showBanner(t('zBoxGotDamaged', names), 'flaw');
        g.hud.notice(`${t('zDamaged')}: ${flawText(flaw)}`);
      } else g.hud.showBanner(t('zBoxGot', names), 'level');
    });
    L.on('zpet', (m) => {
      // A cat lifting its owner (everyone: the paw over the cross; its owner: the line on the down card).
      if (m.act === 'lift') this.catLift.set(m.id, { until: m.until, paused: false });
      else if (m.act === 'yield') {
        const c = this.catLift.get(m.id);
        if (c) c.paused = true;
      } else if (m.act === 'up') this.catLift.delete(m.id);
      if (m.id !== this.me) return;
      this.petReady = m.ready;
      this.petUntil = m.act === 'yield' || m.act === 'up' ? 0 : m.until;
      if (m.n !== undefined) this.petN = m.n;
      // The word by the pet's face: 1.5 s; on a phone, where it pops up beside the small chip, ~1.2 s.
      const brief = typeof document !== 'undefined' && document.documentElement.classList.contains('mobile');
      this.petFlash = { text: t(`petAct_${m.act}` as StringKey), until: L.now() + (brief ? 1200 : 1500) };
    });
    L.on('zup', (m) => {
      this.down.delete(m.id);
      this.revives.delete(m.id);
      this.catLift.delete(m.id);
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

  /** The item the coffin offered us last, and its flaw (named when it reaches our hands). */
  private lastOffer: { item: string; flaw: ZFlaw | null } | null = null;

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
    this.catLift.clear();
    // A new match: the pet is ready, the cat with all its lifts.
    this.petReady = this.petUntil = 0;
    this.petN = this.game.pet?.id === 'gato' ? PET_ABILITIES.gato.cargas : null;
    this.diedInWave = false;
    this.reviveTarget = null;
    this.workTarget = null;
    this.work.clear();
    this.money = ZOMBIE.dinheiroInicial;
    this.items = startItems();
    this.view.clear();
    // No barricades in a new match (the match says so too: 'zbar' 'reset').
    this.bars.forEach((_, i) => this.setBar(i, emptyBarricade(), 'reset'));
    for (const id of [...this.markers.keys()]) this.game.setDowned(id, false);
    this.marks.clear();
    this.crows.clear();
    this.game.hud.setCrows(false);
  }

  // --- Combat: what we hit, the match decides ---------------------------------------------------------------

  isZombie(target: unknown): target is Zombie {
    return target instanceof Zombie;
  }

  /** Reports a hit; returns the damage the match should deal (the same formula), for the floating number. */
  shot(z: Zombie, region: HitRegion, dist: number, gun: GunStats, keep: number, crit: boolean): number {
    this.link.send({ t: 'zhit', z: z.id, region, dist: +dist.toFixed(2), w: gun.arma, ...(keep < 1 ? { keep: +keep.toFixed(3) } : {}) });
    return gunDamageToZombie(gun, Math.min(dist, gun.alcanceMaximo), critRegion(region, crit), keep, weaponMul(this.items, gun.arma), isBoss(z.kind));
  }

  /** The most a zombie can still lose: a boss's health reaches us, a common zombie's doesn't (taken as full). */
  healthOf(z: Zombie): number {
    if (isBoss(z.kind) && this.boss?.id === z.id) return this.boss.hp;
    const players = this.game.teammates().length + 1;
    return zombieHp(z.kind, waveSpec(Math.max(1, this.wave), players), players);
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

  // --- E: the coffin, revives and barricades ---------------------------------------------------------------------

  /** Our knife swung: with ghosts close by, the match is told (it scares the ones in reach). */
  knifeSwing() {
    if (this.ghosts.count && this.ghosts.near(this.game.feet().clone().setY(this.game.feet().y + 1.1), ZOMBIE.fantasmas.sustoFaca + 0.5)) this.link.send({ t: 'zscare' });
  }

  private nearTotem(): boolean {
    if (!this.totem) return false;
    const f = this.game.feet();
    const c = this.totem.position;
    return Math.hypot(f.x - c.x, f.z - c.z) < ZOMBIE.totem.alcance && Math.abs(f.y - c.y) < 1.6;
  }

  /** At the totem: what E does there (light the vigil, for its price), or that it already burns. */
  private totemPrompt(): { text: string; frac: number } {
    const cost = ZOMBIE.totem.custo;
    if (this.totemOn) return { text: t('zTotemLit'), frac: 1 };
    return this.money >= cost ? { text: t('zTotemBuy', { cost }), frac: 0 } : { text: t('zTotemPoor', { cost, money: this.money }), frac: Math.min(1, this.money / cost) };
  }

  private nearCoffin(): boolean {
    const f = this.game.feet();
    const c = this.coffin.position;
    return Math.hypot(f.x - c.x, f.z - c.z) < REACH && Math.abs(f.y - c.y) < 1.6;
  }

  private feetVec(): Vec3 {
    const f = this.game.feet();
    return [f.x, f.y, f.z];
  }

  /** The nearest gap in reach whose barricade we could work on (build or nail), or null. */
  private nearGap(): number | null {
    const f = this.feetVec();
    let best: number | null = null;
    let bestD = Infinity;
    this.map.barricadas.forEach((g, i) => {
      if (!inReach(g, f) || !needsWork(this.bars[i])) return;
      const other = this.work.get(i);
      if (other && other.by !== this.me) return;
      const d = Math.hypot(f[0] - g.centro[0], f[2] - g.centro[2]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** Someone standing in the gap itself, which can't shut on them (what the match checks too). */
  private gapBusy(i: number): boolean {
    const g = this.map.barricadas[i];
    if (this.view.targets().some((z) => inGap(g, [z.position.x, z.position.y, z.position.z], 0.35))) return true;
    if (inGap(g, this.feetVec(), 0.3)) return true;
    return this.game.teammates().some((p) => p.alive && inGap(g, [p.position.x, p.position.y, p.position.z], 0.3));
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

  /**
   * E pressed: the coffin's purchase (or taking its weapon: ours, or one a teammate donated) when we're at it.
   * True when E was ours (the coffin, or a teammate down or a barricade, which are held: see hold).
   */
  press(): boolean {
    if (this.downed || !this.game.alive()) return this.downed;
    if (this.nearDowned() !== null) return true;
    if (this.nearTotem() && !this.totemOn) {
      this.link.send({ t: 'totem' });
      return true;
    }
    if (this.nearCoffin()) {
      const st = this.coffin.state;
      if (this.canTake(st) && st.item) this.lastOffer = { item: st.item, flaw: st.flaw };
      this.link.send({ t: 'box' });
      return true;
    }
    return this.nearGap() !== null;
  }

  /** Whether E takes the weapon the coffin is offering: our own roll, or one donated by someone else. */
  private canTake(st: BoxInfo): boolean {
    return st.state === 'offer' && (st.open ? st.by !== this.me : st.by === this.me);
  }

  /** The weapon the coffin is offering us, still ours to decide on (donate or turn down), while we're at it. */
  private ownOffer(): boolean {
    const st = this.coffin.state;
    return !this.downed && this.game.alive() && this.nearCoffin() && st.state === 'offer' && st.by === this.me && !st.open;
  }

  /** Donating only makes sense with someone else in the match to take it. */
  private canDonate(): boolean {
    return this.game.teammates().length > 0;
  }

  /** Z: the weapon the coffin offers us stays there for anyone else to take. True when Z was ours. */
  donate(): boolean {
    if (!this.ownOffer() || !this.canDonate()) return false;
    this.link.send({ t: 'boxDonate' });
    return true;
  }

  /** X: the weapon the coffin offers us is turned down (the coffin closes, free to spin again). True when X was ours. */
  refuse(): boolean {
    if (!this.ownOffer()) return false;
    this.link.send({ t: 'boxRefuse' });
    return true;
  }

  /**
   * E held (every tick): reviving the teammate down next to us, or else working on the barricade in reach
   * (building it if we can pay, nailing boards back); let go or walk away and it stops.
   */
  hold(held: boolean) {
    const can = held && this.game.alive() && !this.downed;
    const revive = can ? this.nearDowned() : null;
    if (revive !== this.reviveTarget) {
      if (this.reviveTarget !== null) this.link.send({ t: 'revive', id: this.reviveTarget, on: false });
      this.reviveTarget = revive;
      if (revive !== null) this.link.send({ t: 'revive', id: revive, on: true });
    }
    let gap = can && revive === null && !this.nearCoffin() ? this.nearGap() : null;
    // A new barricade needs the money for it.
    if (gap !== null && !this.bars[gap].built && this.money < ZOMBIE.barricadas.custo) gap = null;
    if (gap === this.workTarget) return;
    if (this.workTarget !== null) this.link.send({ t: 'barricade', i: this.workTarget, on: false });
    this.workTarget = gap;
    if (gap !== null) this.link.send({ t: 'barricade', i: gap, on: true });
  }

  /** Hands busy with E (reviving, nailing boards): no shooting meanwhile. */
  get busyHands() {
    return this.reviveTarget !== null || this.workTarget !== null;
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
    if (this.nearTotem()) return this.totemPrompt();
    if (this.nearCoffin()) return this.coffinPrompt(now);
    return this.barricadePrompt(now);
  }

  private coffinPrompt(now: number): { text: string; frac: number } | null {
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
        const frac = left / ((st.open ? ZOMBIE.caixa.doacaoSegundos : ZOMBIE.caixa.ofertaSegundos) * 1000);
        const name = this.game.nameOf(st.by ?? -1);
        if (!it || (st.by !== this.me && !st.open)) return { text: t('zBoxOther', { name }), frac };
        const names = { item: t(`zitem_${it.id}` as StringKey), rarity: t(`rar_${it.raridade}` as StringKey) };
        if (st.open && st.by === this.me) return { text: t('zBoxYouDonated', names), frac };
        const take = st.flaw ? t('zBoxTakeDamaged', { ...names, flaw: t(`zFlaw_${st.flaw}` as StringKey) }) : t('zBoxTake', names);
        if (st.open) return { text: t('zBoxTakeDonated', { take, name }), frac };
        // Ours: E takes it, Z leaves it for the others, X turns it down (the keys shown only on a keyboard).
        const donate = this.canDonate() ? this.game.keyName('donate') : null;
        const refuse = this.game.keyName('refuse');
        const hints = [donate && t('zBoxDonateKey', { key: donate }), refuse && t('zBoxRefuseKey', { key: refuse })].filter(Boolean);
        return { text: [take, ...hints].join(' · '), frac };
      }
    }
  }

  /** At a gap: what holding E does there (build it, for its price; nail boards back), and its progress. */
  private barricadePrompt(now: number): { text: string; frac: number } | null {
    const i = this.workTarget ?? this.nearGap();
    if (i === null) return null;
    const b = this.bars[i];
    const B = ZOMBIE.barricadas;
    const w = this.work.get(i);
    const mine = w?.by === this.me ? w : null;
    const total = (b.built ? B.repararSegundos : B.erguerSegundos) * 1000;
    const frac = mine ? Math.min(1, 1 - Math.max(0, mine.until - now) / total) : 0;
    // Shutting the gap waits for it to be clear.
    if (b.boards === 0 && this.gapBusy(i)) return { text: t('zBarBlocked'), frac };
    if (!b.built) {
      if (mine) return { text: t('zBarBuilding'), frac };
      if (this.money < B.custo) return { text: t('zBarPoor', { cost: B.custo, money: this.money }), frac: Math.min(1, this.money / B.custo) };
      return { text: t('zBarBuild', { gap: this.gapName(i), cost: B.custo }), frac: 0 };
    }
    const n = { n: b.boards, max: B.tabuas };
    return { text: t(mine ? 'zBarRepairing' : 'zBarRepair', n), frac };
  }

  /**
   * The gaps the horde is coming through right now: zombies outside the wall near a gap (or rising there), as
   * arrows around the crosshair pointing to each gap (`level`: how many, 1..3).
   */
  private entrances(): { angle: number; level: number; label: string }[] {
    const f = this.game.feet();
    const yaw = this.game.yaw();
    const out: { angle: number; level: number; label: string }[] = [];
    const zs = this.view.targets().map((z): Vec3 => [z.position.x, z.position.y, z.position.z]);
    this.map.barricadas.forEach((g, i) => {
      let n = 0;
      for (const p of zs) if (!insideWall(this.map, p) && Math.hypot(p[0] - g.centro[0], p[2] - g.centro[2]) < GAP_WATCH) n++;
      if (!n) return;
      const dx = g.centro[0] - f.x;
      const dz = g.centro[2] - f.z;
      const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
      const side = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
      out.push({ angle: Math.atan2(side, fwd), level: n >= 6 ? 3 : n >= 3 ? 2 : 1, label: this.bars[i].boards > 0 ? '▦' : String(n) });
    });
    return out;
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

  /** Seconds left profaned at the altar (0: not), for the buff panel. */
  profanedLeft(): number {
    return Math.max(0, ((this.marks.get(this.me) ?? 0) - this.link.now()) / 1000);
  }

  /** The crows are pecking us, for the buff panel. */
  get crowsOnMe(): boolean {
    return this.crows.has(this.me);
  }

  /** Seconds left bleeding from the thorns (0: none), for the buff panel. */
  bleedLeft(): number {
    return Math.max(0, (this.bleedUntil - this.link.now()) / 1000);
  }

  // --- Per frame ---------------------------------------------------------------------------------------------

  update(dt: number) {
    const now = this.link.now();
    this.view.update(this.link.renderTime(), dt, now);
    this.coffin.update(dt, now);
    this.totem?.update(dt);
    this.ghosts.update(dt);
    this.barricades.update(dt);
    this.view.render(dt, now);
    this.renderMarkers();
    this.renderMarks(now);
    this.crows.update(dt, (id) => {
      if (id === this.me) return this.game.alive() ? this.game.feet() : null;
      const p = this.game.teammates().find((o) => o.id === id);
      return p?.alive ? p.position : null;
    }, this.me);
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
    g.hud.setEntrances(this.phase === 'wave' && g.alive() && !this.downed ? this.entrances() : []);
    if (this.summary) g.hud.setZombieSummaryNext(t('zSumNext', { s: Math.max(0, Math.ceil((this.summary.restartAt - now) / 1000)) }));
    this.renderPet(now);
    // Down: the bleed-out countdown (and a heartbeat), or who's coming to help (a teammate first, then the cat).
    if (this.downed) {
      const r = this.revives.get(this.me);
      const cat = this.catLift.get(this.me);
      const left = Math.max(0, Math.ceil(((this.down.get(this.me) ?? now) - now) / 1000));
      const catLeft = cat ? Math.max(0, Math.ceil((cat.until - now) / 1000)) : 0;
      const catLine = () => (g.pet?.name ? t('zCatLiftingNamed', { name: g.pet.name, s: catLeft }) : t('zCatLifting', { s: catLeft }));
      g.hud.setDeathText(r ? t('zBeingRevived', { name: g.nameOf(r.by) }) : cat && !cat.paused ? catLine() : t('zDownSub', { s: left }));
      this.heartbeatIn -= 1 / 15;
      if (this.heartbeatIn <= 0) {
        this.heartbeatIn = 1.1;
        g.sfx.heartbeat();
      }
    } else if (this.diedInWave && !g.alive()) g.hud.setDeathText(t(this.joinedInWave ? 'zJoinWait' : 'zDeadWait'));
  }

  /** Our pet's icon on the HUD (PF-29): the ring fills up toward ready, pulses while it acts, blinks with a word. */
  private renderPet(now: number) {
    const pet = this.game.pet;
    if (!pet) return this.game.hud.setPet(null);
    const cd = petCooldown(pet.id) * 1000;
    const acting = this.petUntil > now;
    const frac = pet.id === 'gato' ? (this.petN === 0 ? 0 : 1) : acting ? 1 : this.petReady > now && cd > 0 ? 1 - (this.petReady - now) / cd : 1;
    const flash = this.petFlash && now < this.petFlash.until ? this.petFlash.text : null;
    this.game.hud.setPet({ face: this.petFace, color: pet.color, frac, acting, n: pet.id === 'gato' ? this.petN : null, flash, label: pet.name ?? '' });
  }

  /** A red cross over every teammate who's down, seen through walls (with a paw over it while their cat lifts them). */
  private renderMarkers() {
    const seen = new Set<number>();
    const pawed = new Set<number>();
    for (const p of this.game.teammates()) {
      // Their avatar lies down while they're down (teammates who joined after it happened too).
      this.game.setDowned(p.id, this.down.has(p.id));
      if (!this.down.has(p.id)) continue;
      seen.add(p.id);
      const cat = this.catLift.get(p.id);
      const color = cat && !cat.paused ? this.game.petColor(p.id) : null;
      if (color !== null) {
        pawed.add(p.id);
        let paw = this.paws.get(p.id);
        if (!paw) {
          paw = new THREE.Sprite(new THREE.SpriteMaterial({ map: pawTex(), color, depthTest: false, depthWrite: false, transparent: true }));
          paw.scale.set(0.4, 0.4, 1);
          paw.renderOrder = 11;
          this.game.scene.add(paw);
          this.paws.set(p.id, paw);
        }
        paw.position.copy(p.position).setY(p.position.y + 1.68 + Math.sin(performance.now() / 200) * 0.05);
      }
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
    for (const [id, s] of this.paws) {
      if (pawed.has(id)) continue;
      this.game.scene.remove(s);
      s.material.dispose();
      this.paws.delete(id);
    }
  }

  /** A mark over every teammate profaned at the altar (the horde's target), seen through walls, while it lasts. */
  private renderMarks(now: number) {
    const seen = new Set<number>();
    for (const p of this.game.teammates()) {
      const until = this.marks.get(p.id);
      if (!until || until <= now || !p.alive) continue;
      seen.add(p.id);
      let s = this.markSprites.get(p.id);
      if (!s) {
        this.markTex ??= profaneTexture();
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markTex, depthTest: false, depthWrite: false, transparent: true }));
        s.scale.set(0.55, 0.55, 1);
        s.renderOrder = 10;
        this.game.scene.add(s);
        this.markSprites.set(p.id, s);
      }
      s.position.copy(p.position).setY(p.position.y + 2.45 + Math.sin(performance.now() / 180) * 0.05);
    }
    for (const [id, s] of this.markSprites) {
      if (seen.has(id)) continue;
      this.game.scene.remove(s);
      this.markSprites.delete(id);
    }
  }

  setDebug(v: boolean) {
    this.view.setDebug(v);
  }
}

/** The profaned mark: a skull on a dark red disc (64 px). */
function profaneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(120, 10, 24, 0.85)';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '38px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('\u2620', 32, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The downed marker: a red cross on a dark disc, on a `size` px canvas. The game's is 64 px; the sticker studio
 * (client/dev/studio) paints it bigger for the album, the same drawing scaled up.
 */
export function crossTexture(size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  // Drawn on the 64 px grid (identity at the game's size).
  g.scale(size / 64, size / 64);
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
