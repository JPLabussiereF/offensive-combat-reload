// Sticker studio: the kit a subject builds its scene with (k.* in the domain files). One kit per subject, made by
// the core: a fresh scene (k.group), the page's shared renderer and physics world, lazy stand-ins for what the
// game's props expect (prop bus, a silent Sfx and silent sound adapters, Glow, Puffs, Debris, Effects, a map
// frame), the map builders, and helpers for avatars (lying bodies set down on their ground: k.lying, k.rest),
// zombies, weapons, effects and text at sticker scale.
// Math.random is seeded per sticker while build() runs, so everything random here (stars, confetti, the props' own
// dice) comes out the same on every run. Every helper adds what it makes to k.group unless it says otherwise.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DEFAULT_LOADOUT, slotStats, type Loadout } from '@shared/arsenal';
import { bodyStats, type Appearance } from '@shared/appearance';
import type { Sex } from '@shared/protocol';
import { isBoss, kindScale, type ZKind } from '@shared/zombies';
import { Sfx } from '../../../audio/sfx';
import type { AvatarPose, ZombiePose } from '../../../character/animator';
import { Avatar } from '../../../entities/avatar';
import { CONFETTI_COLORS, Effects } from '../../../render/effects';
import { PALETTE, toonGradient } from '../../../render/materials';
import { flashTexture } from '../../../render/viewmodel';
import { gunParts, holdOf, knifeModel, type GunLookKey } from '../../../render/weaponModels';
import type { MapFrame } from '../../../world/gameMap';
import { Debris, Glow, Puffs } from '../../../world/halloween';
import { WaterDrops } from '../../../world/hydrant';
import type { Ctx } from '../../../world/jardim/kit';
import { MapBuilder, worldUVs } from '../../../world/mapBuilder';
import { Lanterns, seeded } from '../../../world/oriental';
import type { Physics } from '../../../world/physics';
import { PropBus } from '../../../world/props';
import { surfaceMaterial, type SurfaceKey } from '../../../world/surfaces';
import { addBossProps, zombieLook } from '../../../zombies/looks';
import { sexOf } from './cast';
import { POSES, pp, type PosePack } from './poses';
import { unadd, vec, type StudioText } from './render';
import type { V3 } from './types';

/** The fixed time step of every stepped animation (pose, walk, zombie, effects, props). */
export const DT = 1 / 60;

/**
 * What a zombie's body does when the call leaves it out (CharacterAnimator.zombie). Two optional fields stay
 * out unless passed, as in AvatarPose (k.settle): `vel`, a world velocity { x, z } (m/s) for a gait in any
 * direction (default: forward at `speed`), turned into the body's frame with `yaw`; `yaw`, the view yaw (default:
 * the previous call's, 0 at first): a change between calls twists the torso against the planted feet.
 */
export const ZOMBIE_POSE: ZombiePose = {
  /** Walking speed (m/s); 0 stands. */
  speed: 0,
  /** Running gait (arms flailing). */
  run: false,
  /** 0..1 through a swipe's windup (both arms up, then down at 1); null: none. */
  attack: null,
  /** 0..1 through a bloater's swelling (arms out, shaking); null: none. */
  fuse: null,
  /** 0..1 through a spitter's windup (rears back, snaps forward after 0.8); null: none. */
  spit: null,
  /** A boss move and how far into it: slam, summon (crouch, reaching), scream, blink, charge, pound; null: none. */
  special: null,
};

/** Default tints of k.island's surfaces (the maps' own). */
const ISLAND_TINT: Partial<Record<SurfaceKey, number>> = {
  grama: PALETTE.grass,
  calcada: PALETTE.sidewalk,
  asfalto: PALETTE.asphalt,
  madeira: PALETTE.wood,
  concreto: PALETTE.concrete,
  piso: PALETTE.floor,
};

const STAR_YELLOW = 0xffe14d;
const INK = 0x1b1530;

/** A flat five-point star of radius 1 (the hit stars' shape). */
function starShape(): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

const vtx = new THREE.Vector3();

/** The lowest world height of the visible meshes under `root` (skinned vertices where the bones put them), or null. */
function lowestPoint(root: THREE.Object3D): number | null {
  // updateMatrixWorld, not updateWorldMatrix(true, true): only the former refreshes a SkinnedMesh's
  // bindMatrixInverse, and a stale one measures a scaled or moved avatar's skinned vertices at the wrong height
  // (a 1.8x Mayor read 0.7 m too low and floated).
  root.updateWorldMatrix(true, false);
  root.updateMatrixWorld(true);
  let low = Infinity;
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const mesh = o as THREE.Mesh;
    // Instanced pieces (parked particles) and sprites (text) don't stand on anything.
    if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const pos = mesh.geometry.getAttribute('position');
      if (pos && mats.some((m) => m.visible)) for (let i = 0; i < pos.count; i++) low = Math.min(low, mesh.getVertexPosition(i, vtx).applyMatrix4(mesh.matrixWorld).y);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return low === Infinity ? null : low;
}

export class Kit {
  /** The subject's scene: everything in it is rendered, then freed after the subject. */
  readonly group = new THREE.Scene();
  /** Texts the core grows for the card (k.bubble, k.label). Core-internal. */
  readonly texts: StudioText[] = [];
  /** For map callbacks that take one: the local player's feet far away (no proximity gag fires), a listener. */
  readonly mapFrame: MapFrame = { feet: new THREE.Vector3(0, -1000, 0), listener: new THREE.Vector3(0, 1.6, -6), launch() {}, time: 0 };
  readonly poses = POSES;

  private loadouts = new WeakMap<Avatar, Loadout>();
  private animations: ((dt: number, frame: MapFrame) => void)[] = [];
  private _builder: MapBuilder | null = null;
  private _props: PropBus | null = null;
  private _sfx: Sfx | null = null;
  private _glow: Glow | null = null;
  private _puffs: Puffs | null = null;
  private _debris: Debris | null = null;
  private _effects: Effects | null = null;
  private jardim: { ctx: Ctx; lanterns: boolean } | null = null;

  constructor(
    /** The sticker's id. */
    readonly id: string,
    /** The page's one renderer (gltfLoader(k.renderer), loadTextureOverrides). */
    readonly renderer: THREE.WebGLRenderer,
    /** The page's one physics world: colliders pile up from subject to subject, it never steps. */
    readonly physics: Physics,
  ) {}

  // --- Stand-ins for what the game's props expect (made on first use) --------------------------------------------

  /** The real prop bus: register() stores the gags, k.props.remote(id) sets one off. */
  get props(): PropBus {
    return (this._props ??= new PropBus());
  }
  /** The game's Sfx, never unlocked: every sound is a no-op and chained calls (hiss().setVolume) work. */
  get sfx(): Sfx {
    return (this._sfx ??= new Sfx());
  }
  /**
   * Silent stand-ins for the props that take a narrow sound adapter instead of Sfx (halloween.ts: GraveGhost
   * { moan, talk }, Cauldron { bubble, quack }, the rats { squeak, hurt, death }, Witch { cackle, scold }):
   * pass k.mute where the map passes its adapter object. Another prop's adapter: write its no-ops inline.
   */
  readonly mute = { moan() {}, talk() {}, bubble() {}, quack() {}, squeak() {}, hurt() {}, death() {}, cackle() {}, scold() {} };
  /** Unlit vertex-colored pieces (halloween.ts Glow): merged into k.group by k.finish(). */
  get glow(): Glow {
    return (this._glow ??= new Glow());
  }
  /** Rising puffs (flames, steam, the ghost's poof); step them with k.puffs.update(dt). */
  get puffs(): Puffs {
    return (this._puffs ??= new Puffs(this.group));
  }
  /** Smashed-prop chunks; step them with k.debris.update(dt). */
  get debris(): Debris {
    return (this._debris ??= new Debris(this.group));
  }
  /** The combat effects (explosion, bursts); step them with k.effects.update(dt). */
  get effects(): Effects {
    return (this._effects ??= new Effects(this.group));
  }

  // --- Builders --------------------------------------------------------------------------------------------------

  /** The subject's MapBuilder on k.group (the same one every call). Nothing shows until k.finish(). */
  builder(): MapBuilder {
    return (this._builder ??= new MapBuilder(this.physics, this.group));
  }

  /**
   * The Dragon Garden's Ctx (jardim/kit.ts) over the kit's stand-ins, as dragonGarden.ts builds it: the
   * builder, the prop bus, the lanterns, the glowing cores, the water and its drops, animate() into k.tick().
   */
  jardimCtx(): Ctx {
    if (!this.jardim) {
      const ctx: Ctx = {
        b: this.builder(),
        scene: this.group,
        rand: seeded(8128),
        lanterns: new Lanterns(),
        props: this.props,
        sfx: this.sfx,
        glow: [],
        animate: (f) => this.animate(f),
        water: new THREE.MeshToonMaterial({ color: 0x3fa49c, transparent: true, opacity: 0.72, gradientMap: toonGradient(), depthWrite: false }),
        drops: new WaterDrops(this.group),
        holes: [],
      };
      this.jardim = { ctx, lanterns: false };
      this.animate((dt) => ctx.drops.update(dt));
    }
    return this.jardim.ctx;
  }

  /**
   * Finishes what the builders hold, in the maps' order: the garden's glowing cores (one unlit mesh, as
   * dragonGarden.ts does) and its lanterns (once: hang them all before the first finish), the Glow, then the
   * MapBuilder's batches. Optional: the core runs it after build() too; call it yourself to move the finished
   * meshes before returning. Safe to call again: only what was added since gets finished.
   */
  finish() {
    const j = this.jardim;
    if (j) {
      const c = j.ctx;
      if (c.glow.length) {
        this.group.add(new THREE.Mesh(mergeGeometries(c.glow, false)!, new THREE.MeshBasicMaterial({ color: 0xffe6a0 })));
        c.glow.forEach((g) => g.dispose());
        c.glow.length = 0;
      }
      if (!j.lanterns && c.lanterns.count) {
        j.lanterns = true;
        c.lanterns.finish(this.group, c.b, c.props, () => {});
        this.animate((dt) => c.lanterns.update(dt));
      }
    }
    this._glow?.finish(this.group);
    this._builder?.finish();
  }

  /**
   * A ground island under a scene (a lying body, a grave): an oval slab (or a box) of a map surface with the
   * map's tint, `w` by `d` meters, its top at `center`'s height. A mesh of its own (shown at once; hide or move it
   * per shot like any object).
   */
  island(surface: SurfaceKey, w: number, d: number, center: V3 = [0, 0, 0], o: { tint?: THREE.ColorRepresentation; thick?: number; shape?: 'oval' | 'box' } = {}): THREE.Mesh {
    const c = vec(center);
    const thick = o.thick ?? 0.2;
    const geo = o.shape === 'box' ? new THREE.BoxGeometry(w, thick, d) : new THREE.CylinderGeometry(0.5, 0.5, thick, 48).scale(w, 1, d);
    geo.translate(c.x, c.y - thick / 2, c.z);
    // As the MapBuilder does it: UVs in world meters for the surface's texture, the tint as vertex color.
    worldUVs(geo);
    const rgb = new THREE.Color(o.tint ?? ISLAND_TINT[surface] ?? 0xffffff).toArray();
    const n = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => rgb[i % 3]), 3));
    const mesh = new THREE.Mesh(geo, surfaceMaterial(surface));
    mesh.name = 'estudio:ilha';
    this.group.add(mesh);
    return mesh;
  }

  /** Registers a per-frame callback (map props' update, the garden's animate) that k.tick() runs. */
  animate(f: (dt: number, frame: MapFrame) => void) {
    this.animations.push(f);
  }

  /** Runs the registered callbacks `n` frames at DT, with k.mapFrame. */
  tick(n = 1) {
    for (let i = 0; i < n; i++) for (const f of this.animations) f(DT, this.mapFrame);
  }

  /** Runs each function `n` times with DT: k.step(45, (dt) => fire.update(dt), (dt) => k.puffs.update(dt)). */
  step(n: number, ...fns: ((dt: number) => void)[]) {
    for (let i = 0; i < n; i++) for (const f of fns) f(DT);
  }

  // --- People ----------------------------------------------------------------------------------------------------

  /**
   * A character (not baked: its pieces own their materials, so tweaking one is safe). Shown, standing idle at
   * the origin facing -Z. Its body is the look's sex (cast.ts sexOf: RIVAL is a woman) unless `sex` says
   * otherwise; a look that doesn't say (a copy made with { ...look } or structuredClone, a look from outside the
   * cast) needs `sex`, or it throws. Unarmed unless `armed` (then the loadout's guns, DEFAULT_LOADOUT by default:
   * the rifle in the hands and on the back, the pistol, the knife and the grenade waiting in the hands).
   */
  avatar(look: Appearance, sex?: Sex, o: { armed?: boolean; loadout?: Loadout } = {}): Avatar {
    const body = sex ?? sexOf(look);
    if (!body)
      throw new Error(
        "k.avatar: este visual não diz o sexo (uma cópia com { ...visual } ou structuredClone perde a marca): passe o sexo, k.avatar(visual, 'f'), ou faça a cópia com tweak, dress, strip, mood ou withSex (core/cast.ts)",
      );
    const av = new Avatar(this.group, look, body, { bake: false });
    av.visible = true;
    if (o.loadout) av.setLoadout(o.loadout);
    if (!o.armed) av.disarm();
    this.loadouts.set(av, o.loadout ?? DEFAULT_LOADOUT);
    return av;
  }

  /**
   * `n` frames (default 40) of the armed pose at DT with every AvatarPose field filled: speed 0 (standing),
   * crouch false, slide false, sprint false, grounded true, pitch 0 (rad, + looks up), ads false, reload false,
   * knife false (true: the swing advances a frame per call: n 9 winds up by the head, 15 slashes, 26 follows
   * through), blade false (the knife held in guard), cook false (grenade up by the head), secondary false (the
   * pistol), hold: how the gun in hand is held (from the loadout). Two fields stay out unless passed: `vel`, a
   * world velocity { x, z } (m/s) for the 8-way gait (strafe, backpedal; default: forward at `speed`), turned
   * into the body's frame with `yaw`, so pass yaw: av.root.rotation.y with it; `yaw`, the view yaw (default: the
   * previous call's, 0 at first): a change between calls twists the torso against the planted feet (turn in
   * place), so keep it the same across calls unless that is the point.
   */
  settle(av: Avatar, fields: Partial<AvatarPose> = {}, n = 40) {
    const lo = this.loadouts.get(av) ?? DEFAULT_LOADOUT;
    const gun = fields.secondary ? lo.secundaria : lo.primaria;
    const pose: AvatarPose = {
      speed: 0,
      crouch: false,
      slide: false,
      sprint: false,
      grounded: true,
      pitch: 0,
      ads: false,
      reload: false,
      knife: false,
      blade: false,
      cook: false,
      secondary: false,
      hold: gun ? holdOf(gun) : 'longa',
      ...fields,
    };
    for (let i = 0; i < n; i++) av.pose(DT, pose);
  }

  /** A dead body (die at 1.5 s): on its back (`dir` 1, the top toward the avatar's +Z) or face down (-1). */
  corpse(av: Avatar, dir: 1 | -1 = 1) {
    av.die(1.5, dir);
  }

  /**
   * Lays `av` dead with its body centered on `center`, lying on the ground at center's height: on its back
   * (`dir` 1) or face down (-1), the head toward the world direction `head` (an angle like a root yaw:
   * (sin, 0, cos); default π/2, world +X, which is screen left for a camera on -Z). Sets the root's yaw and
   * position for either dir, levels die()'s plank (it stops 0.08 rad short of flat, the head up) and sets the
   * body down with k.rest (its lowest point `sink`, 0.02 m, into the ground: die() pivots at the feet, which
   * otherwise leaves it about 0.2 m under). The last animator call for `av`: limb tweaks (k.pp) go after it,
   * then k.rest(av, y) again if one went below the ground.
   */
  lying(av: Avatar, dir: 1 | -1, center: V3, head = Math.PI / 2, o: { sink?: number } = {}) {
    const c = vec(center);
    av.root.position.set(0, 0, 0);
    // die() lays the body along the avatar's +Z on its back, along -Z face down: turn so it ends toward `head`.
    av.root.rotation.set(0, dir === 1 ? head : head + Math.PI, 0);
    av.die(1.5, dir);
    av.character.body.rotation.x = (dir * Math.PI) / 2;
    av.root.updateMatrixWorld(true);
    const top = av.character.bones.head.getWorldPosition(new THREE.Vector3());
    const axis = new THREE.Vector3(top.x, 0, top.z).normalize();
    // From the feet (the root) to the top of the head: the head bone plus about a head above it.
    const length = Math.hypot(top.x, top.z) + 0.24 * av.root.scale.x * av.character.body.scale.x;
    av.root.position.set(c.x - axis.x * (length / 2), 0, c.z - axis.z * (length / 2));
    this.rest(av, c.y, o.sink);
  }

  /**
   * Sets an avatar (its root) or an object down so its lowest visible point is `sink` meters (0.02) below `y`:
   * resting on the ground there, slightly into it so it touches. Measures the posed mesh (skinned vertices as
   * the bones bend them), so call it after the last animator call and the pose tweaks.
   */
  rest(target: Avatar | THREE.Object3D, y = 0, sink = 0.02) {
    const obj = target instanceof Avatar ? target.root : target;
    const low = lowestPoint(obj);
    if (low === null) return;
    const p = obj.getWorldPosition(new THREE.Vector3());
    p.y += y - sink - low;
    obj.position.copy(obj.parent ? obj.parent.worldToLocal(p) : p);
    obj.updateMatrixWorld(true);
  }

  /** Hides the rifle slung on the back (after the last animator call: pose() shows it again). */
  hideBack(av: Avatar) {
    for (const o of av.character.objectsOf('weapon_back')) o.visible = false;
  }

  /**
   * Turns an avatar or an object toward a point (sets its yaw): its -Z, where avatars face, unless `front` says
   * '+z', where map props face (k.face(prop, camera, { front: '+z' }) shows a prop's front to the camera).
   */
  face(av: Avatar | THREE.Object3D, target: V3, o: { front?: '-z' | '+z' } = {}) {
    const root = av instanceof Avatar ? av.root : av;
    const t = vec(target);
    const dx = t.x - root.position.x;
    const dz = t.z - root.position.z;
    root.rotation.y = o.front === '+z' ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
  }

  /** The animator's posing helpers for custom poses (poses.ts): after the last animator call. */
  pp(av: Avatar): PosePack {
    return pp(av);
  }

  /**
   * A zombie of the zumbi mode as the game builds it (zombies/view.ts): its look (zombieLook, `n` picks the
   * plain neighbor), disarmed, the boss props, kindScale × `swell` (the bloater swells 1.18 in game), then
   * `steps` frames (default 45) of CharacterAnimator.zombie at DT with every ZombiePose field filled (ZOMBIE_POSE).
   * Pass steps 0 to keep the idle pose (e.g. before die()).
   */
  zombie(kind: ZKind, n = 0, pose: Partial<ZombiePose> | null = null, o: { steps?: number; swell?: number } = {}): Avatar {
    const { look, sex } = zombieLook(kind, n);
    const av = new Avatar(this.group, look, sex, { bake: false });
    av.visible = true;
    av.disarm();
    if (isBoss(kind)) addBossProps(kind, av);
    av.root.scale.setScalar(kindScale(kind) * (o.swell ?? 1));
    const p: ZombiePose = { ...ZOMBIE_POSE, ...pose };
    for (let i = 0; i < (o.steps ?? 45); i++) av.zombie(DT, p);
    return av;
  }

  // --- Weapons ---------------------------------------------------------------------------------------------------

  /**
   * A gun as its upgrades make it (gunStats('rifle', [...])), in one Group with its glowing sight parts (heldGun
   * drops those): origin at the receiver, barrel along -Z, muzzle in userData.muzzle.
   */
  gun(stats: GunLookKey): THREE.Group {
    const parts = gunParts(stats);
    const g = new THREE.Group();
    for (const m of parts.meshes) g.add(m);
    g.add(parts.mag);
    for (const gl of parts.glow) g.add(gl);
    g.userData.muzzle = parts.muzzle.clone();
    this.group.add(g);
    return g;
  }

  /**
   * A muzzle flash (the game's star, normal-blended) at the muzzle of the gun in an avatar's hands (after its
   * last pose call; it follows later bone edits) or of a k.gun(). `size` in meters (default 0.32, about twice the
   * first-person flash): a star turned to the camera plus two quads along the barrel.
   */
  muzzleFlash(target: Avatar | THREE.Object3D, o: { size?: number } = {}): THREE.Group {
    let holder: THREE.Object3D;
    let muzzle: THREE.Vector3;
    if (target instanceof Avatar) {
      const secondary = target['holdingSecondary'];
      const held = (secondary ? target['secondary'] : target['primary'])[0];
      if (!held) throw new Error('k.muzzleFlash: o avatar não tem arma na mão (k.avatar(..., { armed: true }) e k.settle antes)');
      const stats = slotStats(this.loadouts.get(target) ?? DEFAULT_LOADOUT, secondary ? 'secundaria' : 'primaria');
      if (!stats) throw new Error('k.muzzleFlash: o slot da arma na mão está vazio no loadout');
      holder = held;
      muzzle = gunParts(stats).muzzle;
    } else {
      if (!target.userData.muzzle) throw new Error('k.muzzleFlash: passe um avatar armado ou um k.gun()');
      holder = target;
      muzzle = target.userData.muzzle as THREE.Vector3;
    }
    const size = o.size ?? 0.32;
    const mat = new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const flash = new THREE.Group();
    flash.name = 'estudio:clarao';
    flash.position.copy(muzzle).z -= size * 0.35;
    const star = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    star.userData.facecam = true;
    star.userData.roll = Math.random() * Math.PI;
    const along = new THREE.PlaneGeometry(size * 1.3, size * 0.65);
    const side = new THREE.Mesh(along, mat);
    side.rotation.y = Math.PI / 2;
    const top = new THREE.Mesh(along, mat);
    top.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    flash.add(side, top, star);
    holder.add(flash);
    return flash;
  }

  /**
   * The knock-off lightsaber with its pink blade in the avatar's knife hand (the held knife model shows only the
   * hilt in third person). After the last animator call. The sheath is additive in game: the core renders it
   * normal-blended.
   */
  saber(av: Avatar): THREE.Group {
    av['knife']?.removeFromParent();
    const m = bodyStats(av.look).missing;
    const hand = m.handR || m.armR ? 'hand_L' : 'hand_R';
    const s = knifeModel('sabre');
    s.position.set(hand === 'hand_R' ? 0.01 : -0.01, 0, 0);
    av.character.sockets[hand].add(s);
    return s;
  }

  /** Pulls a grenadeModel()'s pin: its ring (the TorusGeometry) up and off. Returns the ring. */
  pinPulled(grenade: THREE.Object3D): THREE.Mesh {
    const rings: THREE.Mesh[] = [];
    grenade.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry.type === 'TorusGeometry') rings.push(m);
    });
    const ring = rings[0];
    if (!ring) throw new Error('k.pinPulled: o modelo não tem o anel do pino (TorusGeometry, client/weapons/grenades.ts)');
    ring.position.set(-0.085, 0.17, 0.02);
    ring.rotation.set(0.5, 0.4, 0.9);
    return ring;
  }

  // --- Effects ---------------------------------------------------------------------------------------------------

  /** The world position of an object (a bone, a socket), plus a world offset. */
  at(obj: THREE.Object3D, offset: V3 = [0, 0, 0]): THREE.Vector3 {
    obj.updateWorldMatrix(true, false);
    return obj.getWorldPosition(new THREE.Vector3()).add(vec(offset));
  }

  /**
   * A burst of flat five-point hit stars (the game's star yellow, ink-rimmed so they read on gold) around
   * `at`: `count` (10) stars of `size` (0.18 m, twice the game's chips) between 35% and 100% of `spread`
   * (0.3 m) from it, leaning toward `dir` (up). They face the camera. Keep `at` off the face it hits.
   */
  stars(at: V3, o: { count?: number; spread?: number; size?: number; dir?: V3; color?: THREE.ColorRepresentation } = {}): THREE.Group {
    const center = vec(at);
    const dir = vec(o.dir ?? [0, 1, 0]).normalize();
    const spread = o.spread ?? 0.3;
    const size = o.size ?? 0.18;
    const geo = new THREE.ShapeGeometry(starShape());
    const fill = new THREE.MeshBasicMaterial({ color: o.color ?? STAR_YELLOW, side: THREE.DoubleSide });
    const rim = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide });
    const g = new THREE.Group();
    g.name = 'estudio:estrelas';
    for (let i = 0; i < (o.count ?? 10); i++) {
      const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().addScaledVector(dir, 0.9).normalize();
      const s = size * (0.7 + Math.random() * 0.5);
      const star = new THREE.Group();
      star.position.copy(center).addScaledVector(d, spread * (0.35 + Math.random() * 0.65));
      star.userData.facecam = true;
      star.userData.roll = Math.random() * Math.PI * 2;
      const body = new THREE.Mesh(geo, fill);
      body.scale.setScalar(s);
      const back = new THREE.Mesh(geo, rim);
      back.scale.setScalar(s * 1.28);
      back.position.z = -0.006;
      star.add(back, body);
      g.add(star);
    }
    this.group.add(g);
    return g;
  }

  /**
   * Confetti (the game's CONFETTI_COLORS) scattered around `at`: `count` (24) flat chips of `size` (0.14 m, twice
   * the game's) within `spread` (0.5 m), more above than below, facing the camera at seeded angles.
   */
  confetti(at: V3, o: { count?: number; spread?: number; size?: number } = {}): THREE.Group {
    const center = vec(at);
    const spread = o.spread ?? 0.5;
    const size = o.size ?? 0.14;
    const geo = new THREE.PlaneGeometry(size, size * 0.55);
    const mats = CONFETTI_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    const g = new THREE.Group();
    g.name = 'estudio:confete';
    for (let i = 0; i < (o.count ?? 24); i++) {
      const chip = new THREE.Mesh(geo, mats[(Math.random() * mats.length) | 0]);
      chip.position.set(center.x + (Math.random() * 2 - 1) * spread, center.y + (Math.random() * 1.3 - 0.3) * spread, center.z + (Math.random() * 2 - 1) * spread);
      chip.scale.x = 0.35 + Math.random() * 0.65;
      chip.userData.facecam = true;
      chip.userData.roll = Math.random() * Math.PI * 2;
      g.add(chip);
    }
    this.group.add(g);
    return g;
  }

  /**
   * A comic speech bubble in the game's style (halloween.ts SpeechBubble: cream, ink outline, Lilita One) but cut
   * tight around the words so they read on a card: its tail's tip at `pos`, `height` meters tall (0.6) until the
   * core grows it so the letters are `capPx` (60) pixels tall on the card render (0: leave it). '\n' breaks lines.
   * Hide it in the mini with Shot.hide. A prop's own bubble (ghost['bubble']) keeps room for three lines and
   * stays tiny on a card: hide its sprite and put a k.bubble with the same words in its place.
   */
  bubble(text: string, pos: V3, o: { height?: number; capPx?: number } = {}): THREE.Sprite {
    const lines = text.split('\n');
    const px = 110;
    const font = `400 ${px}px "Lilita One", system-ui, sans-serif`;
    const measure = document.createElement('canvas').getContext('2d')!;
    measure.font = font;
    const textW = Math.max(...lines.map((l) => measure.measureText(l).width));
    // The game's bubble, proportionally: outline, padding, corner, tail.
    const line = px * 0.1;
    const padX = px * 0.42;
    const padY = px * 0.28;
    const lineH = px * 1.02;
    const tail = px * 0.42;
    const half = px * 0.24;
    const boxW = textW + padX * 2;
    const boxH = lines.length * lineH + padY * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(boxW + line);
    c.height = Math.ceil(boxH + tail + line);
    const g = c.getContext('2d')!;
    const x0 = line / 2;
    const y0 = line / 2;
    const cx = c.width / 2;
    const bottom = y0 + boxH;
    g.fillStyle = '#fffdf6';
    g.strokeStyle = '#1b1530';
    g.lineWidth = line;
    g.lineJoin = 'round';
    g.beginPath();
    g.roundRect(x0, y0, boxW, boxH, px * 0.38);
    g.moveTo(cx - half, bottom);
    g.lineTo(cx - half * 0.15, bottom + tail);
    g.lineTo(cx + half, bottom);
    g.fill();
    g.stroke();
    // The box's outline across the tail's root goes under the fill, as in the game's bubble.
    g.fillRect(cx - half + line * 0.8, bottom - line, (half - line * 0.8) * 2, line * 1.7);
    g.fillStyle = '#1b1530';
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, cx, y0 + padY + lineH * (i + 0.5) + px * 0.05));
    const m = g.measureText('H');
    const sprite = this.textSprite(c, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, o.height ?? 0.6, o.capPx ?? 60, text);
    sprite.center.set(0.5, 0);
    sprite.position.copy(vec(pos));
    return sprite;
  }

  /**
   * A line of text facing the camera, centered on `pos`: Lilita One (or Nunito 900), filled and ink-stroked like
   * the OPRIMIDO! stamp, `height` meters tall (0.5), tilted `tilt` rad, grown by the core to `capPx` (60).
   */
  label(text: string, pos: V3, o: { font?: 'lilita' | 'nunito'; fill?: string; stroke?: string; height?: number; tilt?: number; capPx?: number } = {}): THREE.Sprite {
    const px = 120;
    const font = o.font === 'nunito' ? `900 ${px}px Nunito, system-ui, sans-serif` : `400 ${px}px "Lilita One", system-ui, sans-serif`;
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    g.font = font;
    const pad = px * 0.25;
    c.width = Math.ceil(g.measureText(text).width + pad * 2);
    c.height = Math.ceil(px * 1.5);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = px * 0.16;
    g.strokeStyle = o.stroke ?? '#1b1530';
    g.fillStyle = o.fill ?? '#ffd23f';
    g.strokeText(text, c.width / 2, c.height / 2);
    g.fillText(text, c.width / 2, c.height / 2);
    const m = g.measureText('H');
    const sprite = this.textSprite(c, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, o.height ?? 0.5, o.capPx ?? 60, text);
    sprite.material.rotation = o.tilt ?? 0;
    sprite.position.copy(vec(pos));
    return sprite;
  }

  /** A canvas as a camera-facing sprite `height` meters tall, registered for the core's text sizing. */
  private textSprite(c: HTMLCanvasElement, capCanvas: number, height: number, minPx: number, label: string): THREE.Sprite {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set((height * c.width) / c.height, height, 1);
    sprite.renderOrder = 5;
    this.group.add(sprite);
    const s = new THREE.Vector3();
    this.texts.push({ obj: sprite, cap: () => (capCanvas / c.height) * sprite.getWorldScale(s).y, minPx, label });
    return sprite;
  }

  /** Swaps the additive materials under `obj` for normal-blended clones now (the core does it before every render). */
  unadd<T extends THREE.Object3D>(obj: T): T {
    return unadd(obj);
  }
}

