// The zumbi mode's zombies on screen. The server (or the solo game's local match) decides everything; this
// draws them: positions come in snapshots (ZNet) and are drawn NET.interpDelayMs in the past, interpolated like
// remote players, with the same hitboxes as every character (entities/rig.ts, scaled for brutes and bosses) so
// shooting them works exactly like shooting a player. Their flags drive the pose (shamble or run, the swipe's
// windup, a bloater swelling, a spitter rearing back, a boss's telegraphed move); deaths, boss moves and spit
// come as events ('zdie', 'zfx'), drawn here with their telegraphs: a ring on the ground that fills up until
// the move lands, the charge's lane, the shockwave you must jump over, a glob of spit flying.
//
// Avatars and hitboxes are pooled per kind (building a character costs a few milliseconds): a dead zombie
// sinks into the ground and waits for the next one of its kind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { HitRegion } from '@shared/weapons';
import type { Vec3, ZFx } from '@shared/protocol';
import { isBoss, kindScale, Z_KINDS, ZF, ZOMBIE, type BossId, type ZKind, type ZNet } from '@shared/zombies';
import { bodyStats } from '@shared/appearance';
import { Avatar } from '../entities/avatar';
import { CharacterRig } from '../entities/rig';
import { isBehind } from '../entities/hitboxes';
import type { ZombieMove, ZombiePose } from '../character/animator';
import type { HitboxRegistry, Target } from '../gameplay/targets';
import type { Effects } from '../render/effects';
import type { Sfx } from '../audio/sfx';
import { t, type StringKey } from '../ui/strings';
import { addBossProps, zombieLook } from './looks';
import { toon } from '../render/materials';

const UP = new THREE.Vector3(0, 1, 0);
/** How deep a zombie starts when it comes out of the ground (m). */
const RISE_DEPTH = 1.7;
/** A dead zombie lies there this long, then sinks away (s). */
const LIE_TIME = 2.2;
const SINK_TIME = 0.9;

interface Snap {
  t: number;
  p: Vec3;
  yaw: number;
  f: number;
}

const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

/** One zombie on screen: something to shoot (Target) with its avatar and hitboxes. */
export class Zombie implements Target {
  id = 0;
  readonly position = new THREE.Vector3(0, -100, 0);
  yaw = 0;
  flags = 0;
  health = 100;
  /** Out of the pool and alive (not dying). */
  active = false;
  dying = false;
  dieT = 0;
  dieDir: 1 | -1 = 1;
  buffer: Snap[] = [];
  readonly avatar: Avatar;
  readonly rig: CharacterRig;
  readonly scale: number;
  private vel = { x: 0, z: 0 };
  speed = 0;
  private last = new THREE.Vector3();
  /** Seconds into the current swipe / swelling / spit windup (from the flags). */
  private attackT = 0;
  private fuseT = 0;
  private spitT = 0;
  /** A boss move being telegraphed (from 'zfx'): its kind and when it started and lands (match clock, ms). */
  special: { kind: ZombieMove; t0: number; t1: number } | null = null;
  /** How far out of the ground (0: under it, 1: up). */
  rise = 1;
  groanIn = 2 + Math.random() * 6;
  /** The Bruxinha's duck float around its belly (PF-29), made the first time it's caught. */
  private float: THREE.Group | null = null;
  private floatT = 0;
  /** When it was caught (to quack now and then, low). */
  quackIn = 0;

  constructor(
    readonly kind: ZKind,
    n: number,
    world: RAPIER.World,
    scene: THREE.Scene,
    registry: HitboxRegistry,
  ) {
    const { look, sex } = zombieLook(kind, n);
    this.scale = kindScale(kind);
    this.avatar = new Avatar(scene, look, sex);
    this.avatar.disarm();
    if (isBoss(kind)) addBossProps(kind, this.avatar);
    this.avatar.root.scale.setScalar(this.scale);
    this.rig = new CharacterRig(world, this, registry, bodyStats(look).missing, this.scale);
    this.avatar.followHitboxes(this.rig.animator);
    this.avatar.root.add(this.rig.debug);
    this.rig.follow(this.position, 0, false, { kind: 'idle', t: 0 }, 0);
  }

  get name() {
    return t((isBoss(this.kind) ? `zboss_${this.kind}` : `ztype_${this.kind}`) as StringKey);
  }

  get dead() {
    return !this.active || this.dying;
  }

  get hidden() {
    return !!(this.flags & ZF.hidden);
  }

  refineRegion(point: THREE.Vector3, region: HitRegion): HitRegion {
    return this.rig.refineRegion(point, region);
  }

  isBehind(point: THREE.Vector3): boolean {
    return isBehind(point, this.position, this.yaw);
  }

  /** Out of the pool for zombie `id`. */
  take(id: number) {
    this.id = id;
    this.active = true;
    this.dying = false;
    this.dieT = 0;
    this.buffer.length = 0;
    this.special = null;
    this.flags = 0;
    this.attackT = this.fuseT = this.spitT = 0;
    this.rise = 0;
  }

  push(s: Snap) {
    this.buffer.push(s);
    while (this.buffer.length > 20) this.buffer.shift();
  }

  /** Where it is at match time `t` (interpolated), and its pose; moves the hitboxes there. */
  update(t: number, dt: number, now: number) {
    if (!this.active || this.dying || !this.buffer.length) {
      this.rig.follow(this.position, this.yaw, false, { kind: 'idle', t: 0 }, 0);
      return;
    }
    const b = this.buffer;
    let s: Snap;
    if (t <= b[0].t) s = b[0];
    else if (t >= b[b.length - 1].t) s = b[b.length - 1];
    else {
      let i = 0;
      while (i < b.length - 2 && b[i + 1].t < t) i++;
      const a = b[i];
      const c = b[i + 1];
      const k = (t - a.t) / Math.max(1, c.t - a.t);
      s = { t, p: [a.p[0] + (c.p[0] - a.p[0]) * k, a.p[1] + (c.p[1] - a.p[1]) * k, a.p[2] + (c.p[2] - a.p[2]) * k], yaw: lerpAngle(a.yaw, c.yaw, k), f: c.f };
    }
    this.last.copy(this.position);
    // The navmesh sits a few centimeters over the floor.
    this.position.set(s.p[0], s.p[1] - 0.08, s.p[2]);
    // Teleports (the bride's blink, a stuck zombie coming back out) don't walk across the map.
    const jump = this.last.distanceTo(this.position) > 3;
    if (dt > 0 && !jump) {
      const vx = (this.position.x - this.last.x) / dt;
      const vz = (this.position.z - this.last.z) / dt;
      this.vel.x = this.vel.x * 0.75 + vx * 0.25;
      this.vel.z = this.vel.z * 0.75 + vz * 0.25;
      this.speed = Math.hypot(this.vel.x, this.vel.z);
    }
    this.yaw = s.yaw;
    this.flags = s.f;
    const f = s.f;
    this.attackT = f & ZF.attack ? this.attackT + dt : 0;
    this.fuseT = f & ZF.fuse ? this.fuseT + dt : 0;
    this.spitT = f & ZF.spit ? this.spitT + dt : 0;
    this.rise = f & ZF.rising ? Math.min(1, this.rise + dt / ((isBoss(this.kind) ? 2.6 : 1.2) * 0.9)) : 1;
    if (this.special && now > this.special.t1 + 300) this.special = null;
    const feet = this.position.clone();
    feet.y -= (1 - this.rise) * RISE_DEPTH * this.scale;
    this.rig.follow(feet, this.yaw, !this.hidden, { kind: 'zombie', pose: this.pose(now) }, dt);
  }

  pose(now: number): ZombiePose {
    const k = this.kind;
    const t = isBoss(k) ? ZOMBIE.chefes[k as BossId] : ZOMBIE.tipos[k as Exclude<ZKind, BossId>];
    const sp = this.special;
    return {
      speed: this.speed,
      vel: this.vel,
      yaw: this.yaw,
      run: !!(this.flags & ZF.run),
      attack: this.flags & ZF.attack ? Math.min(1, this.attackT / Math.max(0.1, t.preparo)) : null,
      fuse: this.flags & ZF.fuse ? Math.min(1, this.fuseT / Math.max(0.1, t.preparo)) : null,
      spit: this.flags & ZF.spit ? Math.min(1, this.spitT / Math.max(0.1, ZOMBIE.tipos.cuspidor.cuspe?.preparo ?? 0.6)) : null,
      special: sp ? { kind: sp.kind, t: Math.min(1, Math.max(0, (now - sp.t0) / Math.max(1, sp.t1 - sp.t0))) } : null,
      stuck: this.flags & ZF.duck ? 'duck' : this.flags & ZF.held ? 'held' : null,
    };
  }

  /**
   * The duck float (PF-29): a yellow ring around the belly, above the groin (the hitbox stays where it is: a shot
   * there counts as always), with a rubber duck's head at the front. Only the float bobs.
   */
  private renderFloat(dt: number, scene: THREE.Scene) {
    const on = !!(this.flags & ZF.duck) && this.active && !this.dying && !this.hidden;
    if (!on) {
      if (this.float) this.float.visible = false;
      return;
    }
    if (!this.float) {
      const g = new THREE.Group();
      const yellow = toon(0xf2c230);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.11, 8, 18), yellow);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), yellow);
      head.position.set(0, 0.16, -0.38);
      g.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), toon(0xf07a1e));
      beak.rotation.x = -Math.PI / 2;
      beak.position.set(0, 0.15, -0.52);
      g.add(beak);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), toon(0x1a1414));
        eye.position.set(s * 0.06, 0.2, -0.48);
        g.add(eye);
      }
      scene.add(g);
      this.float = g;
    }
    this.floatT += dt;
    const g = this.float;
    g.visible = true;
    g.scale.setScalar(this.scale);
    g.position.copy(this.position).setY(this.position.y + 1.05 * this.scale + Math.sin(this.floatT * 3.2) * 0.04);
    g.rotation.set(Math.sin(this.floatT * 2.1) * 0.08, this.yaw, Math.sin(this.floatT * 2.7) * 0.08);
  }

  render(dt: number, now: number) {
    const a = this.avatar;
    if (!this.active) {
      a.visible = false;
      return;
    }
    if (this.dying) {
      this.dieT += dt;
      a.visible = this.dieT < LIE_TIME + SINK_TIME;
      a.root.position.copy(this.position);
      a.root.position.y -= Math.max(0, this.dieT - LIE_TIME) / SINK_TIME * 1.2 * this.scale;
      a.die(this.dieT, this.dieDir);
      if (!a.visible) this.active = false;
      return;
    }
    a.visible = this.buffer.length > 0 && !this.hidden;
    this.renderFloat(dt, a.root.parent as THREE.Scene);
    if (!a.visible) return;
    a.root.position.copy(this.position);
    a.root.position.y -= (1 - this.rise) * RISE_DEPTH * this.scale;
    a.root.rotation.y = this.yaw;
    // A bloater swells before it bursts.
    const swell = this.flags & ZF.fuse ? 1 + 0.18 * Math.min(1, this.fuseT) + Math.sin(now * 0.05) * 0.02 : 1;
    a.root.scale.setScalar(this.scale * swell);
    a.zombie(dt, this.pose(now));
  }

  die() {
    this.dying = true;
    this.dieT = 0;
    this.dieDir = Math.random() < 0.5 ? 1 : -1;
    this.rig.follow(this.position, this.yaw, false, { kind: 'idle', t: 0 }, 0);
  }

  setDebug(v: boolean) {
    this.rig.setDebug(v);
  }

  dispose(scene: THREE.Scene) {
    if (this.float) scene.remove(this.float);
    this.rig.dispose();
    scene.remove(this.avatar.root);
    this.avatar.dispose();
  }
}

/** A telegraph on the ground: a ring that fills up until the move lands, the charge's lane, a shockwave. */
interface Mark {
  mesh: THREE.Mesh;
  t0: number;
  t1: number;
  /** Gone after this (match clock, ms). */
  end: number;
  kind: 'ring' | 'lane' | 'wave' | 'glob' | 'rise';
  r?: number;
  from?: THREE.Vector3;
  to?: THREE.Vector3;
  speed?: number;
  fill?: THREE.Mesh;
  /** A rising zombie's hands, clawing out of the ground. */
  hands?: THREE.Group;
}

const FX_COLOR: Partial<Record<ZFx, number>> = { slam: 0xff3b2f, scream: 0xb06bff, pound: 0xff8a1e, summon: 0x7dff6a, charge: 0xff3b2f, intro: 0x7dff6a, rise: 0x7dff6a };

/** A rotten hand, fingers up (palm, four fingers, a thumb), resting on y = 0. */
function handGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(0.1, 0.12, 0.045).translate(0, 0.06, 0)];
  for (let i = 0; i < 4; i++) parts.push(new THREE.BoxGeometry(0.02, 0.085 - Math.abs(i - 1.5) * 0.012, 0.022).rotateZ((i - 1.5) * 0.12).translate(-0.036 + i * 0.024, 0.155, 0));
  parts.push(new THREE.BoxGeometry(0.022, 0.06, 0.022).rotateZ(0.9).translate(-0.065, 0.085, 0));
  const out = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return out;
}

export interface ZombieViewHooks {
  /** The listener's position, for which zombies groan (the nearest few). */
  ear(): THREE.Vector3;
}

/** Every zombie of the match on screen, and the telegraphs of their moves. */
export class ZombieView {
  private pools = new Map<ZKind, Zombie[]>();
  readonly active = new Map<number, Zombie>();
  private marks: Mark[] = [];
  private ringGeo = new THREE.RingGeometry(0.92, 1, 48);
  private discGeo = new THREE.CircleGeometry(1, 40);
  private laneGeo = new THREE.PlaneGeometry(1, 1);
  private globGeo = new THREE.SphereGeometry(0.16, 8, 6);
  private handGeo: THREE.BufferGeometry | null = null;
  private shaftGeo = new THREE.CylinderGeometry(0.28, 0.55, 3.2, 12, 1, true);
  private handMat: THREE.Material | null = null;
  private created = 0;
  /** The boss's id while there's one (its bar is the HUD's). */
  bossId: number | null = null;

  constructor(
    private world: RAPIER.World,
    private scene: THREE.Scene,
    private registry: HitboxRegistry,
    private sfx: Sfx,
    private effects: Effects,
    private hooks: ZombieViewHooks,
  ) {}

  /** Builds avatars ahead of time (on the loading screen), so the first waves don't hitch. */
  prewarm() {
    const counts: Partial<Record<ZKind, number>> = { comum: 12, corredor: 3, inchado: 2, brutamontes: 2, cuspidor: 2, coveiro: 1, noiva: 1, prefeito: 1 };
    for (const [kind, n] of Object.entries(counts) as [ZKind, number][]) {
      const pool = this.pool(kind);
      while (pool.length < n) pool.push(this.make(kind));
    }
  }

  private pool(kind: ZKind) {
    let p = this.pools.get(kind);
    if (!p) this.pools.set(kind, (p = []));
    return p;
  }

  private make(kind: ZKind) {
    return new Zombie(kind, this.created++, this.world, this.scene, this.registry);
  }

  private acquire(id: number, kind: ZKind): Zombie {
    const pool = this.pool(kind);
    const z = pool.find((x) => !x.active) ?? (pool.push(this.make(kind)), pool[pool.length - 1]);
    z.take(id);
    this.active.set(id, z);
    return z;
  }

  /** A snapshot of every zombie (match clock `time`, ms). Zombies missing from it are gone. */
  snapshot(time: number, list: ZNet[], boss?: number) {
    const seen = new Set<number>();
    for (const [id, k, x, y, z, yaw, f] of list) {
      const kind = Z_KINDS[k];
      if (!kind) continue;
      seen.add(id);
      const zz = this.active.get(id) ?? this.acquire(id, kind);
      if (zz.dying) continue;
      if (zz.buffer.length === 0 && f & ZF.rising) this.riseFx(new THREE.Vector3(x, y, z), kind);
      zz.push({ t: time, p: [x, y, z], yaw, f });
    }
    for (const [id, z] of this.active) if (!seen.has(id) && !z.dying) this.kill(id);
    this.bossId = boss ?? null;
  }

  /** A zombie died: it falls, lies there and sinks into the ground. */
  kill(id: number, loud = true) {
    const z = this.active.get(id);
    if (!z || z.dying) return;
    z.die();
    // Out of the live ones; its avatar is drawn (lying, then sinking) until it's back in the pool.
    this.active.delete(id);
    const at = z.position.clone().setY(z.position.y + 1 * z.scale);
    if (loud) {
      this.effects.burst('debris', at, UP, 10, 0x6f8a3a);
      this.sfx.at(at, 'normal', (s) => s.zombieDeath(isBoss(z.kind) ? 0.55 : 1));
    }
  }

  get(id: number) {
    return this.active.get(id);
  }

  /** What can be shot, stabbed or blown up right now. */
  targets(): Zombie[] {
    return [...this.active.values()].filter((z) => !z.dying && !z.hidden && z.buffer.length > 0);
  }

  update(renderTime: number, dt: number, now: number) {
    for (const z of this.active.values()) z.update(renderTime, dt, now);
  }

  render(dt: number, now: number) {
    for (const pool of this.pools.values()) for (const z of pool) if (z.active) z.render(dt, now);
    this.groans(dt);
    this.renderMarks(now);
  }

  /** Every few seconds a zombie groans; only the nearest few, or it would be a wall of noise. */
  private groans(dt: number) {
    const ear = this.hooks.ear();
    // In the duck float: a low quack now and then (about every 1.5 s).
    for (const z of this.active.values()) {
      if (!(z.flags & ZF.duck) || z.dying) continue;
      z.quackIn -= dt;
      if (z.quackIn > 0) continue;
      z.quackIn = 1.4 + Math.random() * 0.3;
      this.sfx.at(z.position.clone().setY(z.position.y + 1), 'step', (s) => s.quack());
    }
    const near = [...this.active.values()].filter((z) => !z.dying).sort((a, b) => a.position.distanceToSquared(ear) - b.position.distanceToSquared(ear)).slice(0, 6);
    for (const z of near) {
      z.groanIn -= dt;
      if (z.groanIn > 0) continue;
      z.groanIn = 3 + Math.random() * 6;
      const pitch = isBoss(z.kind) ? 0.5 : z.kind === 'brutamontes' ? 0.7 : z.kind === 'corredor' ? 1.25 : z.kind === 'cuspidor' ? 1.15 : 0.85 + Math.random() * 0.3;
      this.sfx.at(z.position.clone().setY(z.position.y + 1.6 * z.scale), 'normal', (s) => s.zombieGroan(pitch));
    }
  }

  private riseFx(at: THREE.Vector3, kind: ZKind) {
    this.effects.burst('debris', at.clone().setY(at.y + 0.1), UP, isBoss(kind) ? 40 : 12, 0x4a3a2a);
    this.sfx.at(at, 'normal', (s) => s.zombieRise());
  }

  // --- Telegraphs and effects ------------------------------------------------------------------------------

  /** Two hands for a 'rise' telegraph (the geometry and material shared by all). */
  private handPair(): THREE.Group {
    this.handGeo ??= handGeometry();
    this.handMat ??= toon(0x7d8c5a);
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(this.handGeo, this.handMat);
      h.position.set(sx * 0.22, 0, (Math.random() - 0.5) * 0.15);
      h.rotation.set((Math.random() - 0.5) * 0.4, sx * 0.3, sx * 0.25);
      h.scale.setScalar(1.6);
      g.add(h);
    }
    g.position.y = -0.4;
    return g;
  }

  private flatMesh(geo: THREE.BufferGeometry, color: number, opacity: number) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 3;
    this.scene.add(m);
    return m;
  }

  /** A boss move or a zombie effect (match clock times, ms). */
  fx(msg: { fx: ZFx; id?: number; at: Vec3; to?: Vec3; r?: number; t0: number; t1: number }, now: number) {
    const at = new THREE.Vector3(...msg.at);
    const z = msg.id !== undefined ? this.active.get(msg.id) : undefined;
    const color = FX_COLOR[msg.fx] ?? 0xffffff;
    switch (msg.fx) {
      case 'slam':
      case 'scream':
      case 'pound':
      case 'summon': {
        if (z) z.special = { kind: msg.fx, t0: msg.t0, t1: msg.t1 };
        const r = msg.r ?? 4;
        const ring = this.flatMesh(this.ringGeo, color, 0.8);
        const fill = this.flatMesh(this.discGeo, color, 0.25);
        ring.position.copy(at).setY(at.y + 0.06);
        fill.position.copy(at).setY(at.y + 0.05);
        ring.scale.setScalar(r);
        this.marks.push({ mesh: ring, fill, t0: msg.t0, t1: msg.t1, end: msg.t1, kind: 'ring', r });
        const big = msg.fx === 'scream' ? 'bossScream' : msg.fx === 'summon' ? 'bossSummon' : 'bossWindup';
        this.sfx.at(at.clone().setY(at.y + 2), 'boom', (s) => s[big]());
        if (msg.fx === 'pound') {
          // The shockwave rolls out when he lands: jump over it.
          const wave = this.flatMesh(this.ringGeo, 0xffb347, 0.9);
          wave.position.copy(at).setY(at.y + 0.08);
          wave.visible = false;
          const tremor = ZOMBIE.chefes.prefeito.tremor!;
          this.marks.push({ mesh: wave, t0: msg.t1, t1: msg.t1, end: msg.t1 + (tremor.raio / tremor.velocidade) * 1000, kind: 'wave', r: tremor.raio, speed: tremor.velocidade });
        }
        break;
      }
      case 'charge': {
        if (z) z.special = { kind: 'charge', t0: msg.t0, t1: msg.t1 };
        const to = new THREE.Vector3(...(msg.to ?? msg.at));
        const lane = this.flatMesh(this.laneGeo, color, 0.35);
        const mid = at.clone().add(to).multiplyScalar(0.5);
        lane.position.copy(mid).setY(Math.max(at.y, to.y) + 0.06);
        const len = Math.max(0.5, Math.hypot(to.x - at.x, to.z - at.z));
        lane.scale.set((msg.r ?? 1.6) * 2, len, 1);
        lane.rotation.set(-Math.PI / 2, 0, Math.atan2(to.x - at.x, to.z - at.z));
        const speed = ZOMBIE.chefes.prefeito.investida?.velocidade ?? 13;
        this.marks.push({ mesh: lane, t0: msg.t0, t1: msg.t1, end: msg.t1 + (len / speed) * 1000 + 200, kind: 'lane' });
        this.sfx.at(at.clone().setY(at.y + 2), 'boom', (s) => s.bossRoar(0.6));
        break;
      }
      case 'blink': {
        if (z) z.special = { kind: 'blink', t0: msg.t0, t1: msg.t1 };
        this.effects.burst('confetti', at.clone().setY(at.y + 1.2), UP, 26, 0x8a5cff);
        this.sfx.at(at, 'normal', (s) => s.bossBlink());
        if (msg.to) {
          const to = new THREE.Vector3(...msg.to);
          setTimeout(() => {
            this.effects.burst('confetti', to.clone().setY(to.y + 1.2), UP, 26, 0x8a5cff);
            this.sfx.at(to, 'normal', (s) => s.bossBlink());
          }, Math.max(0, msg.t1 - now));
        }
        break;
      }
      case 'spit': {
        const glob = new THREE.Mesh(this.globGeo, new THREE.MeshBasicMaterial({ color: 0x9cff3a }));
        this.scene.add(glob);
        glob.position.copy(at);
        this.marks.push({ mesh: glob, t0: msg.t0, t1: msg.t1, end: msg.t1, kind: 'glob', from: at, to: new THREE.Vector3(...(msg.to ?? msg.at)) });
        this.sfx.at(at, 'normal', (s) => s.zombieSpit());
        break;
      }
      case 'boom': {
        this.effects.explosion(at.clone().setY(at.y + 0.6), null, msg.r ?? 3.5);
        this.effects.burst('confetti', at.clone().setY(at.y + 0.8), UP, 40, 0x9cff3a);
        this.sfx.at(at, 'boom', (s) => s.bloaterPop());
        break;
      }
      case 'rise': {
        // A zombie is about to come out here: a green glow on the ground, two hands clawing out of it, the
        // earth cracking and a groan heard across the yard. It appears at t1.
        const disc = this.flatMesh(this.discGeo, color, 0.0);
        disc.position.copy(at).setY(at.y + 0.04);
        disc.scale.setScalar(0.95);
        (disc.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
        const hands = this.handPair();
        hands.position.copy(at);
        hands.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(hands);
        // A pale green shaft of light over the spot: seen over walls and graves, from anywhere in the yard.
        const shaft = new THREE.Mesh(this.shaftGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        shaft.position.copy(at).setY(at.y + 1.6);
        shaft.renderOrder = 3;
        this.scene.add(shaft);
        this.marks.push({ mesh: disc, fill: shaft, hands, t0: msg.t0, t1: msg.t1, end: msg.t1 + 900, kind: 'rise' });
        this.effects.burst('debris', at.clone().setY(at.y + 0.1), UP, 8, 0x4a3a2a);
        this.sfx.at(at, 'normal', (s) => s.zombieRise());
        this.sfx.at(at.clone().setY(at.y + 1), 'loud', (s) => s.zombieGroan(0.8 + Math.random() * 0.2));
        break;
      }
      case 'intro': {
        const ring = this.flatMesh(this.ringGeo, color, 0.7);
        ring.position.copy(at).setY(at.y + 0.06);
        ring.scale.setScalar(4);
        this.marks.push({ mesh: ring, t0: msg.t0, t1: msg.t1, end: msg.t1, kind: 'ring', r: 4 });
        this.effects.burst('debris', at.clone().setY(at.y + 0.2), UP, 60, 0x4a3a2a);
        this.sfx.at(at.clone().setY(at.y + 2), 'boom', (s) => s.bossRoar(0.5));
        break;
      }
    }
  }

  private renderMarks(now: number) {
    this.marks = this.marks.filter((m) => {
      const done = now >= m.end;
      const mat = m.mesh.material as THREE.MeshBasicMaterial;
      if (m.kind === 'ring') {
        const k = Math.min(1, Math.max(0, (now - m.t0) / Math.max(1, m.t1 - m.t0)));
        if (m.fill) m.fill.scale.setScalar(Math.max(0.01, (m.r ?? 1) * k));
        mat.opacity = 0.45 + 0.4 * Math.abs(Math.sin(now * 0.012));
        if (done) {
          // It landed: a burst where it was.
          const p = m.mesh.position;
          this.effects.burst('debris', p.clone().setY(p.y + 0.1), UP, 18, 0x5a4a3a);
        }
      } else if (m.kind === 'lane') {
        mat.opacity = now < m.t1 ? 0.25 + 0.3 * Math.abs(Math.sin(now * 0.015)) : 0.15;
      } else if (m.kind === 'wave') {
        const radius = ((now - m.t0) / 1000) * (m.speed ?? 9);
        m.mesh.visible = now >= m.t0 && radius > 0.1;
        m.mesh.scale.setScalar(Math.max(0.1, radius));
        mat.opacity = 0.9 * (1 - radius / Math.max(1, m.r ?? 15));
      } else if (m.kind === 'rise' && m.hands) {
        // The glow swells and pulses until the zombie is out, then fades; the hands claw out, then sink as the
        // body comes up.
        const k = Math.min(1, Math.max(0, (now - m.t0) / Math.max(1, m.t1 - m.t0)));
        const after = Math.max(0, (now - m.t1) / Math.max(1, m.end - m.t1));
        mat.opacity = (0.25 + 0.3 * Math.abs(Math.sin(now * 0.01))) * Math.min(1, k * 3) * (1 - after);
        if (m.fill) (m.fill.material as THREE.MeshBasicMaterial).opacity = 0.22 * Math.min(1, k * 2.5) * (1 - after);
        const base = m.mesh.position.y - 0.04;
        const out = Math.min(1, k / 0.45);
        m.hands.position.y = base - 0.4 + out * 0.5 - after * 0.6;
        m.hands.children.forEach((h, i) => (h.rotation.z = (i ? 0.25 : -0.25) + Math.sin(now * 0.02 + i * 2) * 0.35 * out));
        m.hands.visible = after < 1;
      } else if (m.kind === 'glob' && m.from && m.to) {
        const k = Math.min(1, Math.max(0, (now - m.t0) / Math.max(1, m.t1 - m.t0)));
        m.mesh.position.lerpVectors(m.from, m.to, k);
        m.mesh.position.y += Math.sin(k * Math.PI) * 2.2;
        if (done) {
          this.effects.decal(m.to.clone().setY(m.to.y + 0.02), UP, 1.6);
          this.effects.burst('confetti', m.to.clone().setY(m.to.y + 0.2), UP, 14, 0x9cff3a);
          this.sfx.at(m.to, 'normal', (s) => s.zombieSplat());
        }
      }
      if (!done) return true;
      this.scene.remove(m.mesh);
      mat.dispose();
      if (m.fill) {
        this.scene.remove(m.fill);
        (m.fill.material as THREE.Material).dispose();
      }
      if (m.hands) this.scene.remove(m.hands);
      return false;
    });
  }

  /** Everything gone (a new match, leaving). */
  clear() {
    for (const z of this.active.values()) z.active = false;
    this.active.clear();
    for (const m of this.marks) {
      this.scene.remove(m.mesh);
      if (m.fill) this.scene.remove(m.fill);
      if (m.hands) this.scene.remove(m.hands);
    }
    this.marks = [];
    this.bossId = null;
  }

  setDebug(v: boolean) {
    for (const pool of this.pools.values()) for (const z of pool) z.setDebug(v);
  }
}
