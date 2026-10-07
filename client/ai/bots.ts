// Offline matches against bots: owns the bots, resolves their shots and knives, applies every damage between
// combatants (bots and the local player) with the same rules as the server, keeps the score, the corpses and
// the respawns. The local player is just another Combatant here. The game mode is the server's too: mata-mata,
// or corrida armada with the same ladder (shared/gunGame.ts), its weapons, demotions, winner and new rounds.
import * as THREE from 'three';
import { HUMILIATION, SCORE } from '@shared/constants';
import { computeDamage, LETHAL_DAMAGE, type HitRegion } from '@shared/weapons';
import type { KnifeId, WeaponId } from '@shared/progression';
import { knifePassive, type Loadout } from '@shared/arsenal';
import type { GameModeId } from '@shared/modes';
import { afterDeath, afterKill, GUN_GAME, ladderLoadout, ladderStart, type LadderPos } from '@shared/gunGame';
import type { Award, KillKind, PlayerInfo, Sex } from '@shared/protocol';
import { Bot, BOT_SKILLS, type BotSkillName, type BotWorld, type Combatant } from './bot';
import type { NavMap } from './navmesh';
import { Corpse, groundBelow } from '../gameplay/corpse';
import { pickSafeSpawn } from '../gameplay/spawnPicker';
import type { HitboxRegistry } from '../gameplay/targets';
import { applySpread, offsetDir, traceShot } from '../weapons/hitscan';
import { findMeleeTarget, meleeTargets } from '../weapons/melee';
import type { Pellet } from '../weapons/weapon';
import type { Effects } from '../render/effects';
import type { Sfx } from '../audio/sfx';
import type { Physics, SurfaceMaterial } from '../world/physics';
import type { SpawnPoint } from '../world/blockoutMap';

const RESPAWN = 5;
/** Spawn protection (section 6): invulnerable and ignored for 2 s, cancelled by your own first shot. */
const SPAWN_PROTECTION = 2;
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

const BOT_NAMES: [string, Sex][] = [
  ['Bot Clebinho', 'm'], ['Sgt. Parafuso', 'm'], ['Cabo Chip', 'm'], ['Dona Bateria', 'f'], ['Tenente Wi-Fi', 'f'], ['Soldado Bug', 'm'],
  ['Capitão Lag', 'm'], ['Recruta 404', 'm'], ['Major Pixel', 'f'], ['Robô Zé', 'm'], ['Vovó Turbo', 'f'], ['Sargenta Selfie', 'f'],
];

export interface HitInfo {
  kind: KillKind;
  /** The weapon that dealt it (named in the kill feed). */
  w?: WeaponId;
  region?: HitRegion;
  dist?: number;
  behind?: boolean;
  /** A stab: the knife swung (its passive may change the kill's points). */
  knife?: KnifeId;
}

export interface BotHooks {
  /** Damage to the local player; returns the health left (the game applies it and handles death). */
  damagePlayer(amount: number, attacker: Combatant, from: THREE.Vector3): number;
  /** `weapon`: what got the kill (null for falls, the dog, your own grenade). */
  kill(victim: Combatant, killer: Combatant | null, kind: KillKind, awards: Award[], corpse: Corpse, weapon: WeaponId | null): void;
  tauntStarted(dancer: Combatant, corpse: Corpse): void;
  humiliation(dancer: Combatant, corpse: Corpse, awards: Award[]): void;
  /** Corrida armada: the local player's ladder weapons changed (into our hands, full magazines). */
  playerLoadout(lo: Loadout): void;
  /** Corrida armada: `winner` got the last kill; the next round starts at `restartAt` (manager time). */
  roundEnd(winner: Combatant, restartAt: number): void;
  /** A new round: the bots are back at spawn points; the local player comes back too. */
  roundStart(): void;
}

export interface BotOptions {
  physics: Physics;
  scene: THREE.Scene;
  registry: HitboxRegistry;
  nav: NavMap;
  spawns: SpawnPoint[];
  effects: Effects;
  sfx: Sfx;
  /** Local player as a combatant (id 0). */
  player: Combatant;
  count: number;
  skill: BotSkillName;
  /** What the match plays (shared/modes.ts). */
  game: GameModeId;
  hooks: BotHooks;
}

export class BotManager {
  readonly bots: Bot[] = [];
  readonly corpses = new Map<number, Corpse>();
  private scores = new Map<number, PlayerInfo>();
  private nextCorpse = 1;
  private time = 0;
  private protectedUntil = new Map<number, number>();
  private world: BotWorld;
  /** Corrida armada: every combatant's step on the ladder; null in the other modes. */
  private ladder: Map<number, LadderPos> | null;
  /** Corrida armada: when the next round starts (0: a round is being played). */
  private restartAt = 0;

  constructor(private o: BotOptions) {
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < o.count; i++) {
      const [name, sex] = names[i % names.length];
      const bot = new Bot(i + 1, name, sex, BOT_SKILLS[o.skill], o.physics.world, o.scene, o.registry);
      bot.onShoot = (spread, pellets) => this.fire(bot, spread, pellets);
      this.bots.push(bot);
    }
    this.ladder = o.game === 'corrida-armada' ? new Map() : null;
    this.score(o.player);
    for (const b of this.bots) this.score(b);
    // Corrida armada: everyone on the first step (the game gives the local player its weapons too).
    if (this.ladder) for (const c of this.combatants()) this.ladder.set(c.id, ladderStart());
    for (const b of this.bots) if (this.ladder) b.arm(ladderLoadout(0));
    const self = this;
    this.world = {
      get time() {
        return self.time;
      },
      physics: o.physics,
      nav: o.nav,
      combatants: () => this.combatants().filter((c) => !this.isProtected(c)),
      corpses: () => this.corpses.values(),
      fire: (bot, spread, pellets) => this.fire(bot, spread, pellets),
      stab: (bot, target) => this.stab(bot, target),
      tauntStarted: (bot, corpse) => o.hooks.tauntStarted(bot, corpse),
      tauntFinished: (bot, corpse) => this.finishTaunt(bot, corpse),
    };
    // Everyone starts spread over the map.
    for (const b of this.bots) {
      b.spawn(this.pickSpawn(b));
      this.protect(b);
    }
  }

  combatants(): Combatant[] {
    return [this.o.player, ...this.bots];
  }

  private score(c: Combatant): PlayerInfo {
    let s = this.scores.get(c.id);
    if (!s) {
      s = { id: c.id, name: c.name, nivel: 0, sex: c.sex, kills: 0, deaths: 0, score: 0, humiliations: 0, alive: !c.dead, ping: 0 };
      this.scores.set(c.id, s);
    }
    return s;
  }

  standings(): PlayerInfo[] {
    for (const c of this.combatants()) {
      const s = this.score(c);
      s.alive = !c.dead;
      s.name = c.name;
      const l = this.ladder?.get(c.id);
      if (l) s.ladder = { ...l };
    }
    return [...this.scores.values()];
  }

  /** Corrida armada: a combatant's step (undefined in the other modes). */
  ladderOf(id: number): LadderPos | undefined {
    return this.ladder?.get(id);
  }

  /** False between rounds (corrida armada): nobody hurts anybody until the next one starts. */
  get combatOpen() {
    return this.restartAt === 0;
  }

  /** Section 6 spawn choice (see gameplay/spawnPicker.ts), against every other living combatant. */
  pickSpawn(forWho: Combatant): SpawnPoint {
    const threats = this.combatants()
      .filter((c) => c !== forWho && !c.dead)
      .map((c) => ({ feet: c.position, eye: c.eye(new THREE.Vector3()) }));
    return pickSafeSpawn(this.o.spawns, threats, this.o.physics);
  }

  protect(c: Combatant) {
    this.protectedUntil.set(c.id, this.time + SPAWN_PROTECTION);
  }

  isProtected(c: Combatant): boolean {
    return (this.protectedUntil.get(c.id) ?? -1) > this.time;
  }

  /** Firing cancels your own spawn protection. */
  unprotect(c: Combatant) {
    this.protectedUntil.delete(c.id);
  }

  // --- Combat -------------------------------------------------------------------------------------------

  /** Applies damage between combatants with the server's rules (awards, kills, corpses). */
  hit(victim: Combatant, attacker: Combatant, amount: number, info: HitInfo): { dealt: number; killed: boolean } {
    if (victim.dead || amount <= 0 || (victim !== attacker && (this.isProtected(victim) || !this.combatOpen))) return { dealt: 0, killed: false };
    let left: number;
    let dealt: number;
    if (victim === this.o.player) {
      const before = victim.health;
      left = this.o.hooks.damagePlayer(amount, attacker, attacker.position);
      dealt = before - left;
    } else {
      const bot = victim as Bot;
      if (attacker !== bot) bot.hitReact(attacker.position);
      dealt = Math.min(bot.health, amount);
      bot.health -= dealt;
      bot.lastDamageAt = this.time;
      bot.lastAttacker = attacker;
      bot.lastAttackedAt = this.time;
      left = bot.health;
    }
    if (left > 0) return { dealt, killed: false };
    this.kill(victim, attacker, info);
    return { dealt, killed: true };
  }

  /** `killer` null or the victim itself = suicide / environment. */
  kill(victim: Combatant, killer: Combatant | null, info: HitInfo) {
    const vs = this.score(victim);
    vs.deaths++;
    const awards: Award[] = [];
    if (killer && killer !== victim) {
      awards.push({ label: 'kill', value: SCORE.kill });
      if (info.kind === 'head') awards.push({ label: 'headshot', value: SCORE.headshot });
      if (info.kind === 'groin') awards.push({ label: 'groin', value: SCORE.groin });
      if (info.kind === 'knife') awards.push({ label: 'knife', value: SCORE.knife });
      // The frozen fish's passive: more for a stab in the back.
      const passive = info.kind === 'knife' && info.knife ? knifePassive(info.knife, this.o.game) : null;
      if (info.kind === 'knife' && info.behind) awards.push({ label: 'backstab', value: passive?.id === 'tapaGelado' ? passive.costas : SCORE.backstab });
      if (info.dist && info.dist > SCORE.longShotDistance) awards.push({ label: 'longShot', value: SCORE.longShot });
      const ks = this.score(killer);
      ks.kills++;
      ks.score += awards.reduce((s, a) => s + a.value, 0);
      if (killer instanceof Bot) {
        killer.notifyKill(this.time);
        if (passive) killer.knifeKill(passive, this.time);
      }
    }
    const p = victim.position;
    const yaw = victim instanceof Bot ? victim.yaw : (victim as Combatant & { yaw?: number }).yaw ?? 0;
    const corpse = new Corpse(
      { id: this.nextCorpse++, victim: victim.id, name: victim.name, sex: victim.sex, ap: victim.look, p: [p.x, p.y, p.z], yaw, until: this.time + HUMILIATION.window },
      this.o.player.id,
      this.o.scene,
      groundBelow(this.o.physics.world, [p.x, p.y, p.z]),
      {
        now: () => this.time,
        // The local player dancing: points when the dance completes.
        finish: (c) => this.finishTaunt(this.o.player, c),
      },
    );
    this.corpses.set(corpse.info.id, corpse);
    if (victim instanceof Bot) victim.die(this.time);
    const by = killer && killer !== victim ? killer : null;
    const weapon = !by ? null : (info.w ?? (info.kind === 'knife' ? 'faca' : info.kind === 'grenade' ? 'granada' : 'rifle'));
    const won = this.climb(victim, by, info.kind, weapon);
    this.o.hooks.kill(victim, by, info.kind, awards, corpse, weapon);
    if (won && by) this.o.hooks.roundEnd(by, this.restartAt);
  }

  /** Corrida armada's rules for a kill (the server's, see server/modes.ts); true when it won the round. */
  private climb(victim: Combatant, killer: Combatant | null, kind: KillKind, weapon: WeaponId | null): boolean {
    if (!this.ladder || !this.combatOpen) return false;
    const before = this.ladder.get(victim.id) ?? ladderStart();
    const down = afterDeath(before, kind);
    this.ladder.set(victim.id, down);
    if (down.step !== before.step) this.arm(victim, down.step);
    if (!killer) return false;
    const { pos, event } = afterKill(this.ladder.get(killer.id) ?? ladderStart(), kind, weapon);
    this.ladder.set(killer.id, pos);
    if (event === 'advanced') this.arm(killer, pos.step);
    if (event !== 'won') return false;
    this.restartAt = this.time + GUN_GAME.restartSeconds;
    return true;
  }

  /** A ladder step's weapons in someone's hands: a bot takes them, the local player through the game. */
  private arm(c: Combatant, step: number) {
    if (c instanceof Bot) c.arm(ladderLoadout(step));
    else this.o.hooks.playerLoadout(ladderLoadout(step));
  }

  /** Corrida armada: everyone back on the first step, scores at zero, the bots at spawn points. */
  private newRound() {
    this.restartAt = 0;
    for (const c of this.combatants()) {
      this.ladder?.set(c.id, ladderStart());
      Object.assign(this.score(c), { kills: 0, deaths: 0, score: 0, humiliations: 0 });
      this.arm(c, 0);
    }
    for (const b of this.bots) {
      if (!b.dead) b.die(this.time);
      b.spawn(this.pickSpawn(b));
      this.protect(b);
    }
    this.o.hooks.roundStart();
  }

  private finishTaunt(dancer: Combatant, corpse: Corpse) {
    corpse.markHumiliated();
    const s = this.score(dancer);
    s.humiliations++;
    s.score += SCORE.humiliation;
    this.o.hooks.humiliation(dancer, corpse, [{ label: 'humiliation', value: SCORE.humiliation }]);
  }

  /** A bot's shot: one ray, or one per pellet of a scattergun (each pellet that lands is a hit of its own). */
  private fire(bot: Bot, spread: number, pellets: Pellet[] | null) {
    this.unprotect(bot);
    const eye = bot.eye(new THREE.Vector3());
    const p = bot.pitch + bot.weapon.recoilPitch * DEG;
    const y = bot.yaw - bot.weapon.recoilYaw * DEG;
    const aim = new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    const center = applySpread(aim, spread, new THREE.Vector3());
    const gun = bot.weapon.data;
    const muzzle = bot.muzzle(new THREE.Vector3());
    bot.fired();
    this.o.sfx.at(muzzle, gun.silenciador ? 'step' : 'gun', (s) => s.gunshot(1, gun.silenciador ? 'silenciado' : bot.gun));
    const tracer = Math.random() < 0.5;
    let heard = false;
    const impact = (at: THREE.Vector3, material: SurfaceMaterial) => {
      if (heard) return;
      heard = true;
      this.o.sfx.at(at, 'normal', (s) => s.impact(material));
    };
    for (const dir of pellets ? pellets.map((q) => offsetDir(center, q.theta, q.phi, new THREE.Vector3())) : [center]) {
      const { hit, through, keep, end } = traceShot(this.o.physics, this.o.registry, eye, dir, gun.alcanceMaximo, bot.rig.body, gun.penetracao);
      if (tracer) this.o.effects.tracer(muzzle, end);
      for (const p of through) {
        this.o.effects.decal(p.point, p.normal);
        this.o.effects.decal(p.exit, p.exitNormal);
        this.o.effects.burst('debris', p.exit, dir, 3, 0x9a6a3a);
        impact(p.point, p.surface.material);
        p.surface.onShot?.(p.point);
      }
      if (!hit) continue;
      if (hit.target) {
        const victim = hit.target.entity as Combatant;
        if (!('id' in victim)) continue; // dummies aren't in bot matches
        const region = victim.refineRegion(hit.point, hit.target.region);
        const kind: KillKind = region === 'cabeca' ? 'head' : region === 'virilha' ? 'groin' : 'gun';
        this.o.effects.burst(region === 'cabeca' || region === 'virilha' ? 'star' : 'confetti', hit.point, dir.clone().negate(), 6);
        this.hit(victim, bot, computeDamage(gun, hit.distance, region, keep), { kind, region, dist: hit.distance, w: bot.gun });
      } else {
        this.o.effects.decal(hit.point, hit.normal);
        this.o.effects.burst('debris', hit.point, hit.normal, 3, 0x9a8f80);
        const surface = hit.surface;
        if (surface) impact(hit.point, surface.material);
        hit.surface?.onShot?.(hit.point);
      }
    }
  }

  /**
   * A bot's swing at its impact moment, with the player's rule for a swing without a lunge: it lands if the
   * target is still within reach + 0.4 m, inside the knife's cone and in sight; otherwise only the swing is heard.
   */
  private stab(bot: Bot, target: Combatant) {
    const eye = bot.eye(new THREE.Vector3());
    const k = bot.knife;
    // The kitchen knife is only heard nearby (its passive, in every mode).
    this.o.sfx.at(eye, k.passiva.id === 'discreta' ? 'step' : 'normal', (s) => s.meleeSwing(k.forma));
    // The lightsaber's sweep hits everyone in reach and in front, the others only the one swung at.
    const sweep = knifePassive(k.forma, this.o.game)?.id === 'vuuum';
    const reach = k.alcance + 0.4;
    const victims = sweep
      ? meleeTargets(this.o.physics, this.world.combatants().filter((c) => c !== bot), eye, bot.yaw, reach, k.anguloGraus).map((f) => f.target as Combatant)
      : !target.dead && findMeleeTarget(this.o.physics, [target], eye, bot.yaw, reach, k.anguloGraus)
        ? [target]
        : [];
    if (!victims.length) return;
    this.o.sfx.at(eye, 'normal', (s) => s.knifeHit());
    for (const v of victims) {
      this.o.effects.burst('star', v.position.clone().setY(v.position.y + 1.1), UP, 10);
      this.hit(v, bot, LETHAL_DAMAGE, { kind: 'knife', behind: v.isBehind(eye), w: 'faca', knife: k.forma });
    }
  }

  // --- Tick ---------------------------------------------------------------------------------------------

  fixedUpdate(dt: number, time: number) {
    this.time = time;
    if (this.restartAt && time >= this.restartAt) this.newRound();
    for (const b of this.bots) {
      if (b.dead) {
        if (time - b.deathAt >= RESPAWN) {
          b.spawn(this.pickSpawn(b));
          this.protect(b);
        }
        continue;
      }
      // Same regeneration rule as players.
      if (b.health < b.bodyStats.maxHealth && time - b.lastDamageAt > 4) b.health = Math.min(b.bodyStats.maxHealth, b.health + 25 * dt);
      b.fixedUpdate(dt, this.world);
      if (b.position.y < -20) this.kill(b, null, { kind: 'void' });
    }
  }

  render(alpha: number, dt: number) {
    const blink = Math.floor(performance.now() / 90) % 2 === 0;
    for (const b of this.bots) {
      b.render(alpha, dt);
      // Spawn-protected bots blink.
      if (!b.dead && this.isProtected(b)) b.setBlink(blink);
      else b.setBlink(true);
    }
    for (const [id, c] of this.corpses) {
      c.render(dt);
      if (c.gone) {
        c.dispose();
        this.corpses.delete(id);
      }
    }
  }

  setDebug(v: boolean) {
    for (const b of this.bots) b.setDebug(v);
  }
}
