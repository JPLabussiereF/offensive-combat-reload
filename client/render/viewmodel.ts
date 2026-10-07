// First-person arms + gun (the viewmodel), in their own scene and camera so they never clip into walls.
// The gun in hand comes with its upgrades (sight, magazine, silencer: weaponModels.ts), built once per look
// and kept, so switching guns costs nothing; switching plays a short draw. The arms are the character's own
// forearms and hands, faceted, in its skin and sleeve (viewmodelArms.ts), with PCD (a missing hand or arm is
// not drawn; the knife or the grenade goes to the other hand; without the right hand the gun is held by the
// left one, mirrored to the left of the screen, and with one hand it rests to reload and goes away for the
// knife and the grenade).
//
// Procedural layers on top of the hip / ADS / sprint pose, each a damped spring (springs.ts) with every
// number in VM_FEEL (tunable live with F6):
// - sway: the rifle lags behind the mouse;
// - bob: synced to the body's steps (its stride, one cycle per two steps), different walking, running and crouched;
// - recoil: a visual kick (back, up, a little sideways noise) separate from the aim recoil, settling in
//   ~0.2 s;
// - landing: the rifle sinks in proportion to the fall;
// - strafe tilt: 2–4° when moving sideways;
// - ADS: an ease-out blend, with sway and bob mostly gone while aiming.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { armGlove, armSleeve, bodyStats, type Appearance } from '@shared/appearance';
import type { GrenadeKind, KnifeId } from '@shared/progression';
import { gunStats } from '@shared/arsenal';
import type { Sex } from '@shared/protocol';
import { toonGradient } from './materials';
import { ANIM } from '../character/animator';
import { Spring } from './springs';
import { armMesh, placeArm } from './viewmodelArms';
import { stanceOffset } from './viewmodelStance';
import { grenadeModel } from '../weapons/grenades';
import { gunModelKey, gunParts, knifeModel, mineModel, type GunHold, type GunLookKey } from './weaponModels';

export interface ViewmodelState {
  ads: number; // 0..1
  sprint: number; // 0..1 (smoothed here)
  grounded: boolean;
  speed: number; // horizontal m/s
  strafe: number; // lateral velocity in camera space, m/s
  mouseDX: number;
  mouseDY: number;
  /** Reload progress 0..1, or null when not reloading. */
  reload: number | null;
  /** 0..1 while sliding (smoothed): the gun tilts and drops a little. */
  slide: number;
  /** Knife swing progress 0..1, or null. */
  melee: number | null;
  /** Grenade: seconds cooking in hand, and seconds since release (null when not happening). */
  grenadeCook: number | null;
  grenadeThrow: number | null;
  crouch: number;
}

type V3 = [number, number, number];

/** Every "feel" number of the first-person view. Tunable live (F6); copy the result back here. */
export const VM_FEEL = {
  /** Rifle (grip) in camera space: hip fire, sprint; ADS comes from the sight's height. */
  pose: {
    hip: [0.15, -0.15, -0.4] as V3,
    sprint: [0.1, -0.2, -0.34] as V3,
    /** Sprint rotation (x, y, z rad). */
    sprintRot: [-0.35, 0.75, 0.25] as V3,
    adsZ: -0.36,
  },
  /** ADS blend: ease-out (exponent; 3 = cubic). */
  ads: { ease: 3 },
  /** Sway: rifle lag behind the mouse. */
  sway: { perPixel: 0.0009, max: 0.05, pos: 0.5, rot: 1.5, settle: 0.22, bounce: 0.25, adsKeep: 0.2 },
  /**
   * Bob: amplitude (x, y m; pitch, roll rad), multipliers by state, how far the rifle trails the step (rad
   * of the cycle). The stride is the body's (ANIM.stride), so the rifle moves at the pace of the feet.
   */
  bob: { x: 0.009, y: 0.01, pitch: 0.008, roll: 0.012, run: 1.5, crouch: 0.6, adsKeep: 0.15, follow: 6, lag: 0.35 },
  /** Visual recoil (peaks per shot), settling time and the most it piles up to. */
  recoil: { back: 0.028, up: 0.045, side: 0.012, settle: 0.2, maxBack: 0.07, maxUp: 0.14, adsKeep: 0.5 },
  /** Landing: sink (m) = base + perMeter × fall height, up to max. */
  landing: { base: 0.015, perMeter: 0.008, max: 0.07, settle: 0.35, bounce: 0.2 },
  /** Strafe tilt: roll (rad) at full strafe speed. */
  tilt: { max: 0.06, atSpeed: 5, settle: 0.25, adsKeep: 0.3 },
  /**
   * Arms (gun space): wrist, elbow, roll around the forearm, how closed the hand is. The left hand holds a
   * long gun's handguard (or the SMG's foregrip) and cups a pistol's grip.
   */
  arms: {
    right: { wrist: [0.035, -0.085, 0.12] as V3, elbow: [0.12, -0.24, 0.38] as V3, roll: -1.45, grip: 0.92 },
    left: { wrist: [-0.045, -0.088, -0.13] as V3, elbow: [-0.21, -0.28, 0.13] as V3, roll: 2.55, grip: 0.42 },
    pistolLeft: { wrist: [-0.03, -0.1, 0.07] as V3, elbow: [-0.2, -0.3, 0.3] as V3, roll: 2.3, grip: 0.75 },
  },
  /** One hand (PCD) reloading: how much further the resting gun tilts (rad) and drops (m). */
  oneHandReload: { tilt: 0.2, drop: 0.05 },
  /** Drawing a gun: how far below it starts (m) and its tilt (rad). */
  draw: { drop: 0.22, tilt: 0.9 },
  /** Only a blade in hand (corrida armada's lightsaber): where the knife's fist rests between swings. */
  blade: { pos: [0.2, -0.24, -0.42] as V3, rot: [1.0, -0.4, -0.1] as V3 },
};

const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);

/** A gun's model as the viewmodel keeps it (built once per look). */
interface GunKit {
  group: THREE.Group;
  mag: THREE.Mesh;
  magY: number;
  sightY: number;
  /** ADS distance of this gun (null: VM_FEEL.pose.adsZ). */
  adsZ: number | null;
  scoped: boolean;
  muzzle: THREE.Vector3;
  hold: GunHold;
}

/** Peak displacement → impulse for a critically damped spring (peak = v / (ω·e)). */
const impulseFor = (s: Spring, peak: number) => peak * Math.sqrt(s.stiffness) * Math.E;

export class Viewmodel {
  readonly root = new THREE.Group();
  private gun = new THREE.Group();
  /** The gun in hand, and every gun look built so far. */
  private kit!: GunKit;
  private kits = new Map<string, GunKit>();
  /** How the arms are posed (rebuilt when it changes). */
  private hold: GunHold = 'longa';
  private knife = new THREE.Group();
  /** Mirrors the knife to the left hand when the right one is missing. */
  private knifeSide = new THREE.Group();
  private grenadeSide = new THREE.Group();
  private arms = new THREE.Group();
  private knifeArm = new THREE.Group();
  private grenadeHandArm = new THREE.Group();
  private skin = '#e8bfa0';
  private sex: Sex = 'm';
  /** Long sleeve color over the forearms (null = bare forearms). */
  private sleeve: string | null = null;
  /** Gloves on the hands (catalog id and colors), or none. */
  private glove: ReturnType<typeof armGlove> = null;
  private missing = { armL: false, armR: false, handL: false, handR: false };
  /** Mirrors the gun to the left hand when the right one is missing (the ADS pose stays centered: x = 0). */
  private gunSide = new THREE.Group();
  /** The arm on the grip (with one hand it leaves the grip to change the magazine), and its wrist there. */
  private gripArm: THREE.Object3D | null = null;
  private gripWrist = new THREE.Vector3();
  private knifeItem: THREE.Object3D | null = null;
  private grenadeArm = new THREE.Group();
  private grenadeInHand: THREE.Object3D = new THREE.Group();
  private ads = new THREE.Vector3(0, -0.057, VM_FEEL.pose.adsZ);
  /** The gun in hand has a magnified scope (the game swaps to the scope overlay when fully aimed). */
  scoped = false;
  /** Seconds left of the draw after a switch, and its length. */
  private drawT = 0;
  private drawLen = 1;
  private flashGroup = new THREE.Group();
  private flashT = 0;
  private sprintT = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private swayX = Spring.settling(0.22, 0.25);
  private swayY = Spring.settling(0.22, 0.25);
  private tiltS = Spring.settling(0.25);
  private kickBack = Spring.settling(0.2);
  private kickUp = Spring.settling(0.2);
  private kickSide = Spring.settling(0.2);
  private land = Spring.settling(0.35, 0.2);
  /** 0..1: how far the rifle is lowered for a melee swing (smoothed so it comes back only afterwards). */
  private meleeDuck = 0;
  private tmp = new THREE.Vector3();
  private tmpMag = new THREE.Vector3();

  constructor(vmScene: THREE.Scene) {
    // Muzzle flash: two crossed additive quads.
    const flashMat = new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const quad = new THREE.PlaneGeometry(0.16, 0.16);
    const a = new THREE.Mesh(quad, flashMat);
    const b = new THREE.Mesh(quad, flashMat);
    b.rotation.y = Math.PI / 2;
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), flashMat);
    this.flashGroup.add(a, b, c);
    this.flashGroup.visible = false;
    this.gun.add(this.flashGroup);

    // Knife (or its rubber chicken / lightsaber form) in the right fist, shown only during a melee swing.
    this.knife.add(this.knifeArm);
    this.setKnife('faca');
    this.knife.visible = false;

    // Left arm holding a grenade (or a mine, or two grenades), shown while cooking/throwing.
    this.grenadeArm.add(this.grenadeHandArm);
    this.setGrenadeKind('granada');
    this.grenadeArm.visible = false;

    this.setGun(gunStats('rifle'));
    this.knifeSide.add(this.knife);
    this.grenadeSide.add(this.grenadeArm);
    this.gunSide.add(this.gun);
    this.root.add(this.gunSide, this.knifeSide, this.grenadeSide);
    vmScene.add(this.root);
  }

  /** The character's arms: skin, sleeve, and which hand or arm is missing (PCD). */
  setBody(look: Appearance, sex: Sex = this.sex) {
    const m = bodyStats(look).missing;
    this.missing = { armL: m.armL, armR: m.armR, handL: m.handL, handR: m.handR };
    this.skin = look.pele;
    this.sex = sex;
    const sleeve = armSleeve(look);
    this.sleeve = sleeve?.long ? sleeve.color : null;
    this.glove = armGlove(look);
    // No right hand: the knife is swung with the left one. No left hand: the grenade goes in the right.
    // (A mirrored group: its children keep their animation, on the other side.)
    this.knifeSide.scale.x = m.handR ? -1 : 1;
    this.grenadeSide.scale.x = m.handL ? -1 : 1;
    // No right hand: the left one holds the gun by the grip, the whole gun mirrored to the left.
    this.gunSide.scale.x = m.handR ? -1 : 1;
    this.buildArms();
  }

  /** The gun is in the left hand, mirrored (no right hand). */
  private get mirrored() {
    return this.missing.handR;
  }

  /** Only one hand (PCD): it reloads with the gun resting and puts the gun away for the knife or a grenade. */
  private get oneHand() {
    return this.missing.handL || this.missing.handR;
  }

  /** Rebuilds the arms on the gun (PCD: a missing hand leaves the forearm, a missing arm leaves nothing). */
  private buildArms() {
    for (const g of [this.arms, this.knifeArm, this.grenadeHandArm]) {
      for (const child of [...g.children]) {
        g.remove(child);
        ((child as THREE.Mesh).material as THREE.Material)?.dispose();
      }
    }
    const A = VM_FEEL.arms;
    const opts = (grip: number, hand: boolean) => ({ sleeve: this.sleeve, skin: this.skin, grip, hand, glove: this.glove });
    // Mirrored (no right hand), the arm on the grip is the left hand and the right one hangs out of view.
    this.gripArm = null;
    if (this.mirrored || !this.missing.armR) {
      const r = armMesh(this.sex, 1, opts(A.right.grip, this.mirrored || !this.missing.handR));
      placeArm(r, v3(A.right.elbow), v3(A.right.wrist), A.right.roll);
      this.arms.add(r);
      this.gripArm = r;
      this.gripWrist.copy(r.position);
    }
    if (!this.mirrored && !this.missing.armL) {
      const L = this.hold === 'pistola' ? A.pistolLeft : A.left;
      const l = armMesh(this.sex, -1, opts(L.grip, !this.missing.handL));
      placeArm(l, v3(L.elbow), v3(L.wrist), L.roll);
      this.arms.add(l);
    }
    // The knife's fist and the grenade's open hand (their groups are mirrored when that hand is missing).
    const k = armMesh(this.sex, 1, opts(1, true));
    placeArm(k, new THREE.Vector3(0.03, -0.06, 0.32), new THREE.Vector3(0, -0.01, 0.07), -1.5);
    this.knifeArm.add(k);
    const g = armMesh(this.sex, -1, opts(0.45, true));
    placeArm(g, new THREE.Vector3(-0.03, -0.14, 0.3), new THREE.Vector3(0, -0.05, 0.06), Math.PI);
    this.grenadeHandArm.add(g);
  }

  /** Puts a gun in the hands as its upgrades make it (sight, magazine, silencer), with the matching ADS pose. */
  setGun(g: GunLookKey) {
    const key = gunModelKey(g);
    let kit = this.kits.get(key);
    if (!kit) {
      const parts = gunParts(g);
      const group = new THREE.Group();
      for (const m of parts.meshes) group.add(m);
      group.add(parts.mag);
      for (const gl of parts.glow) group.add(gl);
      bakeStaticParts(group, [parts.mag, ...parts.glow]);
      kit = { group, mag: parts.mag, magY: parts.magY, sightY: parts.sightY, adsZ: parts.adsZ ?? null, scoped: parts.scoped, muzzle: parts.muzzle, hold: parts.hold };
      this.kits.set(key, kit);
    }
    if (kit === this.kit) return;
    if (this.kit) this.gun.remove(this.kit.group);
    this.kit = kit;
    this.gun.add(kit.group);
    if (!this.flashGroup.parent) this.gun.add(this.flashGroup);
    if (!this.arms.parent) this.gun.add(this.arms);
    this.flashGroup.position.copy(kit.muzzle);
    this.ads.set(0, -kit.sightY, kit.adsZ ?? VM_FEEL.pose.adsZ);
    this.scoped = kit.scoped;
    // The support hand moves between a handguard and a pistol's grip.
    const rebuild = (kit.hold === 'pistola') !== (this.hold === 'pistola') || !this.arms.children.length;
    this.hold = kit.hold;
    if (rebuild) this.buildArms();
  }

  /** A switch: the gun now in hand comes up from below over `seconds`. */
  draw(seconds: number) {
    this.drawLen = Math.max(0.05, seconds);
    this.drawT = this.drawLen;
  }

  /** Swaps what the melee hand swings (the kitchen knife, or a bigger one: the spoon, the chicken, the saber…). */
  setKnife(form: KnifeId) {
    if (this.knifeItem) {
      this.knife.remove(this.knifeItem);
      this.knifeItem.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.knifeItem = knifeModel(form);
    if (form !== 'faca') this.knifeItem.scale.setScalar(1.2);
    this.knife.add(this.knifeItem);
    this.swingKeys = form === 'faca' ? Viewmodel.KNIFE_KEYS : Viewmodel.SWING_KEYS;
  }

  /**
   * Only the knife in hand (corrida armada's lightsaber, a blade-only loadout): no gun, and the knife stays up
   * between swings instead of coming out only for one.
   */
  setBladeOnly(on: boolean) {
    this.bladeOnly = on;
    this.gun.visible = !on;
  }
  private bladeOnly = false;

  /** What the left hand holds for G: a grenade, a land mine or two grenades. */
  setGrenadeKind(kind: GrenadeKind) {
    this.grenadeArm.remove(this.grenadeInHand);
    let item: THREE.Object3D;
    if (kind === 'mina') {
      item = mineModel().group;
      item.scale.setScalar(0.42);
      item.rotation.x = 0.9;
      item.position.set(0, 0.02, -0.03);
    } else if (kind === 'dupla') {
      item = new THREE.Group();
      for (const x of [-0.035, 0.035]) {
        const g = grenadeModel();
        g.position.x = x;
        item.add(g);
      }
      item.scale.setScalar(0.7);
      item.position.set(0, 0.03, -0.02);
    } else {
      item = grenadeModel();
      item.scale.setScalar(0.7);
      item.position.set(0, 0.03, -0.02);
    }
    this.grenadeInHand = item;
    this.grenadeArm.add(item);
  }

  /**
   * A shot: visual kick back, up and a little sideways (the aim recoil is the weapon's, apart). `mul` is the gun's
   * on-screen kick (`coiceVisual`: the revolver, the garrucha and the hand cannon jump more).
   */
  kick(mul = 1) {
    const R = VM_FEEL.recoil;
    if (this.kickBack.value < R.maxBack * mul) this.kickBack.impulse(impulseFor(this.kickBack, R.back * mul));
    if (this.kickUp.value < R.maxUp * mul) this.kickUp.impulse(impulseFor(this.kickUp, R.up * mul));
    this.kickSide.impulse(impulseFor(this.kickSide, (Math.random() * 2 - 1) * R.side * mul));
  }

  flash() {
    this.flashT = 0.045;
    this.flashGroup.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.5;
    this.flashGroup.scale.set(s, s, s * 1.4);
  }

  /** Landed after falling `fallHeight` meters: the rifle sinks in proportion and springs back. */
  landed(fallHeight: number) {
    const L = VM_FEEL.landing;
    this.land.impulse(-impulseFor(this.land, Math.min(L.max, L.base + fallHeight * L.perMeter)));
  }

  // Keyframes: wind up to the right, stab forward-left at the impact moment (~30%), then retract.
  private static readonly KNIFE_KEYS: [t: number, pos: [number, number, number], rot: [number, number, number]][] = [
    [0, [0.32, -0.34, -0.2], [0.6, 0.5, -0.9]],
    [0.12, [0.26, -0.12, -0.26], [0.25, 0.55, -1.2]],
    [0.3, [-0.02, -0.08, -0.52], [-0.05, -0.25, 0.35]],
    [0.55, [-0.06, -0.12, -0.46], [-0.1, -0.35, 0.5]],
    [1, [0.3, -0.62, -0.2], [0.5, 0.2, -0.3]],
  ];

  // Everything that isn't a blade (the rubber chicken, the lightsaber) is swung in an arc from the upper right
  // across to the left, so you see it side-on when it connects.
  private static readonly SWING_KEYS: [t: number, pos: [number, number, number], rot: [number, number, number]][] = [
    [0, [0.34, -0.3, -0.3], [1.1, -0.6, 0]],
    [0.14, [0.3, -0.1, -0.36], [1.25, -0.95, 0.1]],
    [0.32, [-0.02, -0.1, -0.42], [0.15, 0.95, 0.3]],
    [0.55, [-0.12, -0.16, -0.4], [-0.1, 1.15, 0.4]],
    [1, [0.3, -0.62, -0.2], [0.5, 0.2, -0.3]],
  ];
  private swingKeys = Viewmodel.KNIFE_KEYS;

  private poseKnife(p: number) {
    const keys = this.swingKeys;
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
    const [t0, p0, r0] = keys[i];
    const [t1, p1, r1] = keys[i + 1];
    const f = THREE.MathUtils.smoothstep(p, t0, t1);
    this.knife.position.set(p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, p0[2] + (p1[2] - p0[2]) * f);
    this.knife.rotation.set(r0[0] + (r1[0] - r0[0]) * f, r0[1] + (r1[1] - r0[1]) * f, r0[2] + (r1[2] - r0[2]) * f);
  }

  /** The sight's center in main-camera space (fully aimed: on the view's axis, x = y = 0, mirrored or not). */
  sightCameraSpace(out: THREE.Vector3): THREE.Vector3 {
    this.gun.updateWorldMatrix(true, false);
    return out.set(0, this.kit.sightY, 0).applyMatrix4(this.gun.matrixWorld);
  }

  /** Muzzle position in main-camera space, for tracers and the muzzle light. */
  muzzleCameraSpace(out: THREE.Vector3): THREE.Vector3 {
    this.gun.updateWorldMatrix(true, false);
    return out.copy(this.kit.muzzle).applyMatrix4(this.gun.matrixWorld);
  }

  /** Re-applies the tuning (springs and arms) after VM_FEEL changed (the F6 panel). */
  retune() {
    const F = VM_FEEL;
    this.swayX.tune(F.sway.settle, F.sway.bounce);
    this.swayY.tune(F.sway.settle, F.sway.bounce);
    this.tiltS.tune(F.tilt.settle);
    for (const s of [this.kickBack, this.kickUp, this.kickSide]) s.tune(F.recoil.settle);
    this.land.tune(F.landing.settle, F.landing.bounce);
    this.ads.z = this.kit.adsZ ?? F.pose.adsZ;
    this.buildArms();
  }

  update(dt: number, s: ViewmodelState) {
    const F = VM_FEEL;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    this.sprintT += ((s.sprint > 0.5 ? 1 : 0) - this.sprintT) * k(10);

    // Base pose: hip -> ADS (ease-out) -> sprint.
    const ads = 1 - Math.pow(1 - THREE.MathUtils.clamp(s.ads, 0, 1), F.ads.ease);
    const pos = this.tmp.copy(v3(F.pose.hip)).lerp(this.ads, ads).lerp(v3(F.pose.sprint), this.sprintT);
    let rx = this.sprintT * F.pose.sprintRot[0];
    let ry = this.sprintT * F.pose.sprintRot[1];
    let rz = this.sprintT * F.pose.sprintRot[2];

    // Bob: one cycle per two steps, the phase driven by the distance walked over the body's own stride (the
    // same as the third-person animator: longer steps when faster), so it keeps the pace of the feet instead
    // of shaking. A figure eight: sideways once per cycle, a smooth dip (and a slight nod) at each foot strike,
    // trailing the step a little as the rifle's weight follows the body.
    const moving = s.grounded && s.speed > 0.5;
    const stateAmp = moving ? Math.min(1.3, s.speed / 5.5) * (1 + (F.bob.run - 1) * this.sprintT) * (1 + (F.bob.crouch - 1) * s.crouch) : 0;
    this.bobAmp += (stateAmp - this.bobAmp) * k(F.bob.follow);
    const half = THREE.MathUtils.clamp(ANIM.stride.min + ANIM.stride.perSpeed * s.speed, ANIM.stride.min, ANIM.stride.max) * (1 - 0.35 * s.crouch);
    this.bobPhase = (this.bobPhase + ((s.speed * dt) / (4 * half)) * Math.PI * 2) % (Math.PI * 2);
    const bob = this.bobAmp * (1 - ads * (1 - F.bob.adsKeep));
    const ph = this.bobPhase - F.bob.lag;
    const side = Math.sin(ph);
    const dip = Math.cos(ph) ** 2; // 1 at each foot strike, 0 mid-stride; smooth, no cusp
    pos.x += side * F.bob.x * bob;
    pos.y -= dip * F.bob.y * bob;
    rx -= dip * F.bob.pitch * bob;
    rz += side * F.bob.roll * bob;

    // Sway: the rifle lags behind the mouse (a springy follow).
    const sway = 1 - ads * (1 - F.sway.adsKeep);
    this.swayX.target = THREE.MathUtils.clamp(-s.mouseDX * F.sway.perPixel, -F.sway.max, F.sway.max);
    this.swayY.target = THREE.MathUtils.clamp(s.mouseDY * F.sway.perPixel, -F.sway.max, F.sway.max);
    // (A mirrored gun takes back the mirror on what follows the view's side: the sway and the strafe tilt.)
    const ms = this.mirrored ? -1 : 1;
    const sx = this.swayX.update(dt) * ms;
    const sy = this.swayY.update(dt);
    pos.x += sx * F.sway.pos * sway;
    pos.y += sy * F.sway.pos * sway;
    ry += sx * F.sway.rot * sway;
    rx += sy * F.sway.rot * sway;

    // Strafe tilt (2–4°).
    this.tiltS.target = -THREE.MathUtils.clamp(s.strafe / F.tilt.atSpeed, -1, 1) * F.tilt.max * (1 - ads * (1 - F.tilt.adsKeep));
    rz += this.tiltS.update(dt) * ms;

    // Reload: tilt the gun, drop the mag out of frame and bring it back.
    if (s.reload !== null) {
      const r = s.reload;
      const tiltIn = THREE.MathUtils.smoothstep(r, 0, 0.15) * (1 - THREE.MathUtils.smoothstep(r, 0.85, 1));
      rx += tiltIn * 0.35;
      rz += tiltIn * 0.55;
      pos.y -= tiltIn * 0.03;
      const out = THREE.MathUtils.smoothstep(r, 0.12, 0.3) * (1 - THREE.MathUtils.smoothstep(r, 0.45, 0.62));
      this.kit.mag.position.y = this.kit.magY - out * 0.35;
      // One hand: the gun rests against the body (lower, turned further) while that hand leaves the grip,
      // takes the magazine down out of view and brings the new one.
      if (this.oneHand && this.gripArm) {
        rx += tiltIn * F.oneHandReload.tilt;
        pos.y -= tiltIn * F.oneHandReload.drop;
        const toMag = THREE.MathUtils.smoothstep(r, 0.04, 0.12) * (1 - THREE.MathUtils.smoothstep(r, 0.62, 0.78));
        const mag = this.kit.mag.position;
        this.gripArm.position.copy(this.gripWrist).lerp(this.tmpMag.set(mag.x, mag.y - 0.05, mag.z), toMag);
      }
    } else {
      this.kit.mag.position.y = this.kit.magY;
      this.gripArm?.position.copy(this.gripWrist);
    }

    // Draw after a switch: the gun comes up from below, tilted, easing in.
    if (this.drawT > 0) {
      this.drawT = Math.max(0, this.drawT - dt);
      const down = 1 - THREE.MathUtils.smoothstep(1 - this.drawT / this.drawLen, 0, 1);
      pos.y -= down * F.draw.drop;
      pos.x += down * 0.04;
      rx -= down * F.draw.tilt;
    }

    // Slide (gun rolls inward and sits a bit lower), crouch and landing (a spring): none while fully aimed, so
    // the sight stays where the shot goes.
    const stance = stanceOffset(s.ads, s.crouch, s.slide, this.land.update(dt));
    pos.x += stance.x;
    pos.y += stance.y;
    rz += stance.rz;

    // Recoil (visual kick), a spring.
    const kick = 1 - ads * (1 - F.recoil.adsKeep);
    pos.z += this.kickBack.update(dt) * kick;
    rx += this.kickUp.update(dt) * kick;
    ry += this.kickSide.update(dt) * kick;

    // Knife swing: the rifle ducks out of view quickly, stays down for the whole swing and is only drawn
    // back up once the knife is gone.
    const meleeOn = s.melee !== null;
    this.meleeDuck += ((meleeOn ? 1 : 0) - this.meleeDuck) * k(meleeOn ? 24 : 11);
    if (this.meleeDuck > 0.001) {
      const duck = THREE.MathUtils.smoothstep(this.meleeDuck, 0, 1);
      pos.y -= duck * 0.22;
      pos.x += duck * 0.06;
      rx -= duck * 0.7;
      rz -= duck * 0.4;
    }
    if (meleeOn) this.poseKnife(s.melee!);
    else if (this.bladeOnly) {
      // Held up in view, moving with the bob, sway and landing like a gun would.
      const hip = F.pose.hip;
      const [bx, by, bz] = F.blade.pos;
      const [ax, ay, az] = F.blade.rot;
      this.knife.position.set(bx + pos.x - hip[0], by + pos.y - hip[1], bz + pos.z - hip[2]);
      this.knife.rotation.set(ax + rx, ay + ry, az + rz);
    }
    this.knife.visible = meleeOn || this.bladeOnly;

    // Grenade: the rifle ducks while the left hand holds the grenade up, then a quick overhand throw.
    const cooking = s.grenadeCook !== null;
    const throwing = s.grenadeThrow !== null && s.grenadeThrow < 0.4;
    let nadeDuck = 0;
    if (cooking || throwing) {
      const inT = cooking ? Math.min(1, s.grenadeCook! / 0.15) : 1;
      const outT = throwing ? THREE.MathUtils.smoothstep(s.grenadeThrow!, 0.15, 0.4) : 0;
      const duck = inT * (1 - outT);
      nadeDuck = duck;
      pos.y -= duck * 0.15;
      pos.x += duck * 0.05;
      rx -= duck * 0.55;
      const arm = this.grenadeArm;
      if (cooking) {
        // Raised and slightly trembling: it's live.
        const tremble = Math.sin(s.grenadeCook! * 60) * 0.002 * Math.min(1, s.grenadeCook!);
        arm.position.set(-0.16 + tremble, -0.4 + inT * 0.22, -0.5);
        arm.rotation.set(0.25, 0.2, 0.15);
        this.grenadeInHand.visible = true;
      } else {
        const kk = Math.min(1, s.grenadeThrow! / 0.12);
        arm.position.set(-0.16 + kk * 0.06, -0.18 + kk * 0.06 - outT * 0.3, -0.5 - kk * 0.25);
        arm.rotation.set(0.25 - kk * 0.9, 0.2, 0.15);
        this.grenadeInHand.visible = s.grenadeThrow! < 0.05; // released
      }
      arm.visible = true;
    } else {
      this.grenadeArm.visible = false;
    }
    // One hand: it holds the knife or the grenade, so the gun goes away (on the back) meanwhile.
    const away = this.oneHand ? Math.max(this.meleeDuck, nadeDuck) : 0;
    pos.y -= away * 0.25;
    this.gunSide.visible = away < 0.7;

    this.gun.position.copy(pos);
    this.gun.rotation.set(rx, ry, rz);

    this.flashT -= dt;
    this.flashGroup.visible = this.flashT > 0;
  }
}

/**
 * Merges every rigid child mesh of `group` (except `keep`) into one vertex-colored mesh: the rifle and arms
 * are ~18 boxes that never move relative to each other, so they cost one draw call instead of eighteen.
 */
function bakeStaticParts(group: THREE.Group, keep: THREE.Object3D[]) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts: THREE.BufferGeometry[] = [];
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || keep.includes(child)) continue;
    const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    g.deleteAttribute('uv');
    const c = ((mesh.material as THREE.MeshToonMaterial).color ?? new THREE.Color(1, 1, 1)).clone();
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
    group.remove(child);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (merged) group.add(new THREE.Mesh(merged, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })));
}

/** The muzzle flash's star (also the sticker studio's, client/dev/studio). */
export function flashTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.translate(32, 32);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.3, 'rgba(255,210,90,0.9)');
  grd.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grd;
  g.beginPath();
  const spikes = 7;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 30 : 11;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
