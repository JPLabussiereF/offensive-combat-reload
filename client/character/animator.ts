// Procedural third-person animation (there are no clips yet), in two layers on the canonical rig:
// - lower body: locomotion with planted feet. Each foot has a target on the ground (stance: it stays put
//   while the body moves over it; swing: it lifts and moves ahead), solved with two-bone IK, so the stride
//   matches the speed in any direction (forward, back, strafe, diagonals: an 8-way blend for free), the
//   crouch bends the knees with the feet on the ground, and the slide goes down on the knees. The lower
//   body turns in place only after the torso has twisted 60° (turn in place);
// - upper body: the view pitch spread over spine 30%, chest 40%, head 30% (aim offset, ±70°), the gun in
//   both hands by IK (right hand on the grip, left under the handguard, or cupping a pistol's grip) for hip
//   fire, ADS and sprint (PCD: in one hand, mirrored to the left when the right one is missing), and
//   short additive layers on top: recoil on every shot, reload, knife, grenade, hit reaction, landing.
// Also the unarmed idle and walk of the editor, the victory dance and the fall. Every "feel" number is in
// ANIM. The hitbox skeleton (entities/rig.ts) runs the same animator on the simulation tick, and the visible
// character takes its state (syncFrom) instead of keeping a clock of its own, so both play the same pose.
import * as THREE from 'three';
import { AssetRegistry, mirrorGrip } from './registry';
import { SOCKETS } from './rig';

/**
 * What the animator moves: bones by canonical name, the group the fall rotates, and the hands' grip. The
 * full Character is one; the hitbox skeleton (entities/rig.ts) is another, so hitboxes follow the same pose.
 */
export interface Posable {
  readonly bones: Record<string, THREE.Bone>;
  readonly body: THREE.Object3D;
  setGrip(left: number, right: number): void;
  /** Build of the body ('magro' | 'medio' | 'gordo'): a bigger belly and hips push the arms out. */
  readonly bodyBuild?: string;
  /** PCD: the arm or hand that is missing (one hand holds the rifle; see rifleArms). */
  readonly missing?: ArmsMissing;
}

/** PCD: which arm or hand is missing (a missing arm is a missing hand too). */
export interface ArmsMissing {
  armL: boolean;
  armR: boolean;
  handL: boolean;
  handR: boolean;
}

export interface AvatarPose {
  /** Horizontal speed (m/s); used as forward speed when `vel` is missing. */
  speed: number;
  /** Horizontal velocity in world space (drives the 8-way locomotion). */
  vel?: { x: number; z: number };
  /** View yaw (the root's rotation): turning the view twists the torso first (turn in place). */
  yaw?: number;
  crouch: boolean;
  slide?: boolean;
  sprint?: boolean;
  /** On the ground (false = jumping or falling). Default true. */
  grounded?: boolean;
  /** View pitch (radians): the torso, head and rifle follow it. */
  pitch: number;
  ads: boolean;
  reload: boolean;
  knife: boolean;
  /** Only the knife in hand, between swings too (corrida armada's lightsaber): no gun in the hands. */
  blade?: boolean;
  cook: boolean;
  /** Holding the secondary gun (the primary goes on the back). */
  secondary?: boolean;
  /** How the gun in hand is held (where the left hand goes). Default 'longa'. */
  hold?: GunHold;
}

/** A long gun's handguard, a compact gun's foregrip, or a pistol's grip for the left hand. */
export type GunHold = 'longa' | 'curta' | 'pistola';

/** A boss move being telegraphed (the zumbi mode's bosses). */
export type ZombieMove = 'slam' | 'summon' | 'scream' | 'blink' | 'charge' | 'pound';

/** What a zombie's body is doing (client/zombies): its gait and the arms' and torso's action. */
export interface ZombiePose {
  speed: number;
  vel?: { x: number; z: number };
  yaw?: number;
  /** Running gait (runners, joggers, a charging boss). */
  run: boolean;
  /** 0..1 through a swipe's windup (it lands at 1); null: not swiping. */
  attack: number | null;
  /** 0..1 through a bloater's swelling; null: not swelling. */
  fuse: number | null;
  /** 0..1 through a spitter's windup; null: not spitting. */
  spit: number | null;
  /** A boss move and how far into its telegraph (0..1). */
  special: { kind: ZombieMove; t: number } | null;
}

/** Every "feel" parameter of the animation, in one place (tunable live with F6). */
export const ANIM = {
  /** Hips height standing, crouched, sliding on the knees (m). */
  hips: { stand: 0.925, crouch: 0.56, slide: 0.5, crouchBack: 0.07 },
  /**
   * Knee slide: the ankles behind the hips (the shins flat on the ground, the knees on it just ahead of the
   * hips, the left one a little further ahead), the feet stretched back on their tops, the hips' tilt (rad).
   */
  slide: { ankleL: [-0.13, 0.1, 0.25], ankleR: [0.13, 0.1, 0.3], foot: -2.9, hipTilt: -0.05 },
  /** Ankle height and stance width. */
  foot: { y: 0.08, x: 0.1 },
  /** Half stride (m) = min + perSpeed × speed, up to max. */
  stride: { min: 0.1, perSpeed: 0.105, max: 0.72 },
  /** Foot lift in the swing (m). */
  lift: { walk: 0.09, run: 0.17, crouch: 0.06 },
  /** Hips bob per step (m). */
  bob: 0.025,
  /** Torso lean (rad): running forward, crouched forward, sliding a little back. */
  lean: { run: -0.16, crouch: -0.3, slide: 0.12 },
  /** Aim offset: share of the pitch on spine, chest and head; limit. */
  pitch: { spine: 0.3, chest: 0.4, head: 0.3, limit: (70 * Math.PI) / 180 },
  /** The torso twists up to this much before the feet turn (rad), and the turn speed (rad/s). */
  turn: { limit: (60 * Math.PI) / 180, speed: 7 },
  /** Rifle (grip) in the chest bone's space: hip fire, aiming down the sights, sprinting. */
  rifle: {
    hip: { pos: [0.115, 0.09, -0.27], rot: [0, 0.06, 0] },
    ads: { pos: [0.035, 0.305, -0.29], rot: [0, 0, 0] },
    sprint: { pos: [0.06, 0.03, -0.24], rot: [-0.55, 0.75, 0.3] },
  },
  /**
   * One hand (PCD, no right hand): the rifle in the left hand by the grip, on the left of the chest (the
   * poses above mirrored); `reload`: resting against the body while the hand changes the magazine. Without
   * the left hand the rifle keeps the two-hand poses (the stump under the handguard) and rests on the right
   * to reload (`reload` mirrored).
   */
  rifleOneHand: {
    hip: { pos: [-0.115, 0.09, -0.27], rot: [0, -0.06, 0] },
    ads: { pos: [-0.035, 0.305, -0.29], rot: [0, 0, 0] },
    sprint: { pos: [-0.06, 0.03, -0.24], rot: [-0.55, -0.75, -0.3] },
    reload: { pos: [-0.07, -0.03, -0.22], rot: [-0.5, -0.25, -0.55] },
  },
  /** Where the left hand holds the gun, in its space: handguard, foregrip, cupping a pistol's grip. */
  leftGrip: {
    longa: [0, -0.03, -0.23] as [number, number, number],
    curta: [0, -0.05, -0.1] as [number, number, number],
    pistola: [-0.012, -0.05, 0.01] as [number, number, number],
  },
  recoil: { back: 0.04, up: 0.09, chest: 0.03, decay: 14 },
  hit: { angle: 0.22, decay: 11 },
  land: { depth: 0.09, decay: 7 },
  reload: { cycle: 1.6 },
  knife: { push: 0.22, swing: 0.42 },
  /** Grenade throw: seconds, and the fraction of it where the grenade leaves the hand. */
  throw: { time: 0.5, release: 0.45 },
  /** Smoothing rates (1/s). */
  rate: { crouch: 10, ads: 12, sprint: 8, gait: 6, air: 12 },
};

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const DOWN = new THREE.Vector3(0, -1, 0);
const Y = new THREE.Vector3(0, 1, 0);
const damp = (cur: number, target: number, rate: number, dt: number) => target + (cur - target) * Math.exp(-rate * dt);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Rifle in a hand: the hand → rifle transform (socket offset and the item's grip). In the left hand (no right
 * hand) the grip is mirrored, as Character.placeRigid puts it.
 */
export function rifleInHand(side: 'L' | 'R' = 'R'): THREE.Matrix4 {
  const item = AssetRegistry.get('rifle');
  const s = SOCKETS[side === 'L' ? 'hand_L' : 'hand_R'].pos;
  const gp = item?.grip?.position ?? [0, 0, 0];
  const gr = new THREE.Quaternion(...(item?.grip?.rotation ?? [0, 0, 0, 1]));
  const pos = new THREE.Vector3(side === 'L' ? -gp[0] : gp[0], gp[1], gp[2]);
  return new THREE.Matrix4()
    .makeTranslation(s[0], s[1], s[2])
    .multiply(new THREE.Matrix4().compose(pos, side === 'L' ? mirrorGrip(gr) : gr, new THREE.Vector3(1, 1, 1)));
}
/** rifleInHand inverted, per hand (built once). */
const handToRifleInv: Partial<Record<'L' | 'R', THREE.Matrix4>> = {};
const rifleToHand = (side: 'L' | 'R') => (handToRifleInv[side] ??= rifleInHand(side).invert());

// Scratch objects (the animator runs for many characters every frame).
const mA = new THREE.Matrix4();
const mB = new THREE.Matrix4();
const mC = new THREE.Matrix4();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const basisL = new THREE.Matrix4();
const basisW = new THREE.Matrix4();

/** Limbs for the IK: the bone chain, the limb's rest direction and its hinge axis (in bone space). */
interface Limb {
  upper: string;
  lower: string;
  end: string;
  axis: THREE.Vector3;
  hinge: THREE.Vector3;
}
const limb = (kind: 'arm' | 'leg', side: 'L' | 'R'): Limb => {
  const s = side === 'L' ? -1 : 1;
  return kind === 'arm'
    ? { upper: `upperArm_${side}`, lower: `forearm_${side}`, end: `hand_${side}`, axis: new THREE.Vector3(s, 0, 0), hinge: new THREE.Vector3(0, s, 0) }
    : { upper: `thigh_${side}`, lower: `shin_${side}`, end: `foot_${side}`, axis: new THREE.Vector3(0, -1, 0), hinge: new THREE.Vector3(-1, 0, 0) };
};
const LIMBS = { armL: limb('arm', 'L'), armR: limb('arm', 'R'), legL: limb('leg', 'L'), legR: limb('leg', 'R') };
const armOf = (side: 'L' | 'R') => (side === 'L' ? LIMBS.armL : LIMBS.armR);

export class CharacterAnimator {
  private rest = new Map<THREE.Bone, THREE.Quaternion>();
  private restPos = new Map<THREE.Bone, THREE.Vector3>();
  /** Rest rotation with the limb swung to hang straight down (arms from the T-pose). */
  private hang = new Map<THREE.Bone, THREE.Quaternion>();
  private hipsY: number;
  // Locomotion state.
  private phase = 0;
  private gait = 0;
  private legYaw = 0;
  private lastYaw: number | null = null;
  private turning = false;
  private crouchT = 0;
  private slideT = 0;
  private sprintT = 0;
  private adsT = 0;
  private airT = 0;
  private land = 0;
  // Additive layers.
  private recoil = 0;
  private hitX = 0;
  private hitZ = 0;
  private reloadT = 0;
  private knifeT = 0;
  /** Seconds into the current knife swing (null: not swinging). */
  private knifeSwing: number | null = null;
  /** Seconds since a grenade throw started (null: none). */
  private throwT: number | null = null;
  /** The grenade is in the hand (cooking, or a throw before the release). */
  grenadeInHand = false;
  /** One hand (PCD) with a grenade: the rifle goes on the back meanwhile (Avatar). */
  rifleAway = false;
  /**
   * One hand (PCD) reloading: the rifle rests against the body while its hand changes the magazine. The
   * rifle's transform in its hand socket's space then (Avatar moves the rifle there); null: on the grip.
   */
  rifleOffset: THREE.Matrix4 | null = null;
  private offsetM = new THREE.Matrix4();
  private time = 0;
  private lastIdleT: number | null = null;

  constructor(private c: Posable) {
    for (const b of Object.values(c.bones)) {
      this.rest.set(b, b.quaternion.clone());
      this.restPos.set(b, b.position.clone());
    }
    for (const side of ['L', 'R']) {
      for (const name of [`upperArm_${side}`, `forearm_${side}`, `hand_${side}`]) {
        const b = c.bones[name];
        if (!b) continue;
        const child = b.children.find((x) => (x as THREE.Bone).isBone) as THREE.Bone | undefined;
        const dirLocal = (child ? child.position : b.position).clone().normalize();
        const restQ = this.rest.get(b)!;
        const dirParent = dirLocal.clone().applyQuaternion(restQ);
        const swing = name.startsWith('upperArm') ? new THREE.Quaternion().setFromUnitVectors(dirParent, DOWN) : new THREE.Quaternion();
        this.hang.set(b, swing.multiply(restQ));
      }
    }
    this.hipsY = c.bones.hips?.position.y ?? 0.95;
  }

  /**
   * Takes every time-driven value of `src` (stride phase, blends, turn in place, action timers, additive
   * layers). Posing right after with dt 0 and the same AvatarPose gives exactly its pose, on this body's
   * own proportions: the visible character plays the pose of its hitbox skeleton (entities/rig.ts) this way.
   */
  syncFrom(src: CharacterAnimator) {
    this.phase = src.phase;
    this.gait = src.gait;
    this.legYaw = src.legYaw;
    this.lastYaw = src.lastYaw;
    this.turning = src.turning;
    this.crouchT = src.crouchT;
    this.slideT = src.slideT;
    this.sprintT = src.sprintT;
    this.adsT = src.adsT;
    this.airT = src.airT;
    this.land = src.land;
    this.recoil = src.recoil;
    this.hitX = src.hitX;
    this.hitZ = src.hitZ;
    this.reloadT = src.reloadT;
    this.knifeT = src.knifeT;
    this.knifeSwing = src.knifeSwing;
    this.throwT = src.throwT;
    this.grenadeInHand = src.grenadeInHand;
    this.time = src.time;
    this.lastIdleT = src.lastIdleT;
  }

  // --- Events (additive layers) ------------------------------------------------------------------------

  /** A shot: the rifle kicks back and up, the chest a little. */
  fire() {
    this.recoil = 1;
  }

  /** A grenade throw: the left arm swings forward from the cooking pose (the grenade leaves at RELEASE). */
  throwGrenade() {
    this.throwT = 0;
  }

  /** A hit: the torso jerks along the bullet's path (`dir` in the character's space, facing -Z). */
  hitReact(dir: THREE.Vector3) {
    this.hitX = THREE.MathUtils.clamp(dir.z, -1, 1);
    this.hitZ = THREE.MathUtils.clamp(-dir.x, -1, 1);
  }

  // --- Helpers ---------------------------------------------------------------------------------------------

  private bone(name: string) {
    return this.c.bones[name];
  }

  /** Sets a bone to its rest rotation turned by an Euler (in the parent's frame). */
  private turn(name: string, x = 0, y = 0, z = 0, base: 'rest' | 'hang' = 'rest') {
    const b = this.bone(name);
    if (!b) return;
    const r = (base === 'hang' ? this.hang.get(b) : undefined) ?? this.rest.get(b)!;
    b.quaternion.copy(q.setFromEuler(e.set(x, y, z))).multiply(r);
  }

  /** Arm: angles for an arm hanging along -Y (x forward/up, z out to the side). */
  private arm(side: 'L' | 'R', x: number, y: number, z: number, elbow = 0) {
    this.turn(`upperArm_${side}`, x, y, z, 'hang');
    const fore = this.bone(`forearm_${side}`);
    if (fore) {
      const s = side === 'L' ? -1 : 1;
      fore.quaternion.copy(q.setFromEuler(e.set(0, s * elbow, 0))).multiply(this.hang.get(fore)!);
    }
    this.turn(`hand_${side}`, 0, 0, 0, 'hang');
  }

  /** PCD: the arm (or stump) of the missing hand hangs at the side, out of the way. */
  private hangArm(side: 'L' | 'R') {
    const out = 0.14 + this.spread;
    this.arm(side, 0.05, 0, side === 'L' ? -out : out, 0.15);
  }

  /** Leg by rotations (dance, fall): thigh forward (x), knee bend (back, positive). */
  private leg(side: 'L' | 'R', x: number, knee = 0, z = 0) {
    this.turn(`thigh_${side}`, x, 0, z);
    this.turn(`shin_${side}`, -knee);
    this.turn(`foot_${side}`, knee * 0.35 - x * 0.2);
  }

  private reset() {
    this.c.body.rotation.set(0, 0, 0);
    this.c.body.position.set(0, 0, 0);
    for (const [b, r] of this.rest) b.quaternion.copy(r);
    const hips = this.bone('hips');
    if (hips) hips.position.copy(this.restPos.get(hips)!);
  }

  private setHipsY(dy: number) {
    const hips = this.bone('hips');
    if (hips) hips.position.y = this.hipsY + dy;
  }

  /** A bone's transform in the body's space (forward kinematics from the current local transforms). */
  private fk(bone: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
    out.identity();
    const chain: THREE.Object3D[] = [];
    for (let b: THREE.Object3D | null = bone; b && b !== this.c.body; b = b.parent) chain.push(b);
    for (let i = chain.length - 1; i >= 0; i--) out.multiply(mC.compose(chain[i].position, chain[i].quaternion, chain[i].scale));
    return out;
  }

  /**
   * Two-bone IK: the end of `l` reaches `target` (body space), bending toward `pole`; the end bone takes
   * `endRot` (body space) if given. Limbs at rest point along `axis` and bend around `hinge` (bone space).
   */
  private ik(l: Limb, target: THREE.Vector3, pole: THREE.Vector3, endRot?: THREE.Quaternion) {
    const upper = this.bone(l.upper);
    const lower = this.bone(l.lower);
    const end = this.bone(l.end);
    if (!upper || !lower || !end) return;
    const parentM = this.fk(upper.parent!, mA);
    const shoulder = vA.copy(upper.position).applyMatrix4(parentM);
    const parentQ = qA.setFromRotationMatrix(parentM);
    const l1 = lower.position.length();
    const l2 = end.position.length();
    const toT = vB.subVectors(target, shoulder);
    const d = THREE.MathUtils.clamp(toT.length(), 1e-3, (l1 + l2) * 0.999);
    const dir = toT.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const perp = vC.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (perp.lengthSq() < 1e-8) perp.set(0, 0, -1).addScaledVector(dir, dir.z);
    perp.normalize();
    const elbow = new THREE.Vector3().copy(shoulder).addScaledVector(dir, a).addScaledVector(perp, h);
    const reach = new THREE.Vector3().copy(shoulder).addScaledVector(dir, d);
    const dirU = new THREE.Vector3().subVectors(elbow, shoulder).normalize();
    const dirL = new THREE.Vector3().subVectors(reach, elbow).normalize();
    const hinge = new THREE.Vector3().crossVectors(dirU, dirL);
    if (hinge.lengthSq() < 1e-8) hinge.crossVectors(perp, dir);
    hinge.normalize();
    // World (body space) rotation of each segment: its rest axis onto its direction, its hinge onto the
    // bending plane's normal.
    const rot = (dirW: THREE.Vector3, out: THREE.Quaternion) => {
      basisL.makeBasis(l.axis, l.hinge, new THREE.Vector3().crossVectors(l.axis, l.hinge));
      basisW.makeBasis(dirW, hinge, new THREE.Vector3().crossVectors(dirW, hinge));
      return out.setFromRotationMatrix(basisW.multiply(basisL.transpose()));
    };
    const rU = rot(dirU, qB);
    const rL = rot(dirL, qC);
    upper.quaternion.copy(parentQ).invert().multiply(rU);
    lower.quaternion.copy(rU).invert().multiply(rL);
    if (endRot) end.quaternion.copy(rL).invert().multiply(endRot);
    else end.quaternion.identity();
  }

  // --- Lower body: locomotion -------------------------------------------------------------------------------

  /** Updates the locomotion state and poses the hips, legs and feet. Returns the torso lean. */
  private lowerBody(dt: number, s: AvatarPose): number {
    const A = ANIM;
    // The view turning twists the lower body back (its feet are planted), until the turn catches up.
    const yaw = s.yaw ?? this.lastYaw ?? 0;
    if (this.lastYaw !== null) this.legYaw = wrap(this.legYaw - wrap(yaw - this.lastYaw));
    this.lastYaw = yaw;
    // Velocity in the character's space (facing -Z).
    let vx = 0;
    let vz = -s.speed;
    if (s.vel) {
      const c = Math.cos(-yaw);
      const sn = Math.sin(-yaw);
      vx = s.vel.x * c + s.vel.z * sn;
      vz = -s.vel.x * sn + s.vel.z * c;
    }
    const speed = Math.hypot(vx, vz);
    const grounded = s.grounded ?? true;
    this.crouchT = damp(this.crouchT, s.crouch && !s.slide ? 1 : 0, A.rate.crouch, dt);
    this.slideT = damp(this.slideT, s.slide ? 1 : 0, A.rate.crouch, dt);
    this.sprintT = damp(this.sprintT, s.sprint ? 1 : 0, A.rate.sprint, dt);
    const wasAir = this.airT > 0.5;
    this.airT = damp(this.airT, grounded ? 0 : 1, A.rate.air, dt);
    // No time passing (a synced pose, syncFrom) lands nothing new.
    if (wasAir && grounded && dt > 0) this.land = 1;
    this.land = damp(this.land, 0, A.land.decay, dt);
    const moving = speed > 0.35 && grounded && this.slideT < 0.5;
    this.gait = damp(this.gait, moving ? 1 : 0, A.rate.gait, dt);
    // Turn in place: the feet follow when moving, or when the torso can't twist any further.
    if (moving) this.legYaw = damp(this.legYaw, 0, 10, dt);
    else {
      if (Math.abs(this.legYaw) > A.turn.limit) this.turning = true;
      if (this.turning) {
        const step = Math.min(Math.abs(this.legYaw), A.turn.speed * dt);
        this.legYaw -= Math.sign(this.legYaw) * step;
        if (Math.abs(this.legYaw) < 0.05) this.turning = false;
      }
    }
    // Stride: half a stride per foot, so a cycle (two steps) covers 4 half strides at this speed.
    const half = THREE.MathUtils.clamp(A.stride.min + A.stride.perSpeed * speed, A.stride.min, A.stride.max) * (1 - 0.35 * this.crouchT);
    const rate = moving ? speed / (4 * half) : this.turning ? 2.2 : this.gait > 0.05 ? 1.2 : 0;
    this.phase = (this.phase + rate * dt) % 1;
    const stepW = Math.max(this.gait, this.turning ? 0.6 : 0);
    const run = THREE.MathUtils.clamp((speed - 3) / 3, 0, 1);
    const lift = THREE.MathUtils.lerp(THREE.MathUtils.lerp(A.lift.walk, A.lift.run, run), A.lift.crouch, this.crouchT);
    const mx = speed > 0.01 ? vx / speed : 0;
    const mz = speed > 0.01 ? vz / speed : -1;

    // Hips: height (crouch, knee slide, bob, landing), sitting back when crouched, yaw of the lower body.
    const bob = A.bob * Math.abs(Math.cos(this.phase * Math.PI * 2)) * this.gait;
    let hy = THREE.MathUtils.lerp(A.hips.stand, A.hips.crouch, this.crouchT) - bob - 0.03 * run * this.gait - A.land.depth * this.land;
    hy = THREE.MathUtils.lerp(hy, A.hips.slide, this.slideT);
    const hips = this.bone('hips');
    if (hips) {
      hips.position.set(0, hy, A.hips.crouchBack * this.crouchT);
      hips.quaternion.setFromEuler(e.set(-0.18 * this.crouchT + A.slide.hipTilt * this.slideT, this.legYaw, 0.04 * Math.sin(this.phase * Math.PI * 2) * this.gait));
    }

    // Feet: planted (stance) or stepping (swing), in the lower body's frame, then IK.
    const legQ = qA.setFromAxisAngle(Y, this.legYaw).clone();
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? -1 : 1;
      const ph = (this.phase + (side === 'L' ? 0.5 : 0)) % 1;
      let off: number;
      let up: number;
      if (ph < 0.5) {
        off = half - 2 * half * (ph / 0.5);
        up = 0;
      } else {
        const u = (ph - 0.5) / 0.5;
        off = -half + 2 * half * smooth(u);
        up = lift * Math.sin(Math.PI * u);
      }
      // Crouched stance: one foot ahead, one behind.
      const stanceZ = this.crouchT * (side === 'L' ? -0.12 : 0.14);
      const target = new THREE.Vector3(sx * A.foot.x, A.foot.y, stanceZ);
      target.x += mx * off * this.gait;
      target.z += mz * off * this.gait;
      target.y += up * stepW + 0.26 * this.airT * (side === 'L' ? 1 : 0.7);
      // Knee slide: the ankles go behind, so the knees (bending forward, toward the pole) land on the ground.
      target.lerp(vA.fromArray(side === 'L' ? A.slide.ankleL : A.slide.ankleR), this.slideT);
      target.applyQuaternion(legQ);
      const pole = new THREE.Vector3(sx * 0.15, 0, -1).applyQuaternion(legQ);
      // The foot stays flat (its toe lifts a little in the swing); in the knee slide it lies on its top,
      // stretched back along the shin.
      const footQ = legQ.clone().multiply(q.setFromEuler(e.set(ph >= 0.5 ? 0.25 * Math.sin(Math.PI * ((ph - 0.5) / 0.5)) * stepW : 0, 0, 0)));
      if (this.slideT > 0.001) footQ.slerp(qB.setFromEuler(e.set(A.slide.foot, 0, 0)).premultiply(legQ), this.slideT);
      this.ik(side === 'L' ? LIMBS.legL : LIMBS.legR, target, pole, footQ);
    }
    // Torso lean: forward running and crouched, a little back in the knee slide; the walk twists the spine a little.
    return A.lean.run * run * this.gait * (0.5 + 0.5 * this.sprintT) + A.lean.crouch * this.crouchT + A.lean.slide * this.slideT;
  }

  /** Spine, chest and head: lean, twist back toward the view (turn in place), aim pitch, hit reaction. */
  private torso(dt: number, pitch: number, lean: number, breathe = 0) {
    const A = ANIM;
    const p = THREE.MathUtils.clamp(pitch, -A.pitch.limit, A.pitch.limit);
    this.recoil = damp(this.recoil, 0, A.recoil.decay, dt);
    this.hitX = damp(this.hitX, 0, A.hit.decay, dt);
    this.hitZ = damp(this.hitZ, 0, A.hit.decay, dt);
    const twist = -this.legYaw;
    const sway = 0.06 * Math.sin(this.phase * Math.PI * 2) * this.gait;
    const hx = this.hitX * A.hit.angle;
    const hz = this.hitZ * A.hit.angle;
    // The hips are tilted when crouched and in the knee slide: the spine takes the rest of the lean.
    const hipTilt = -0.18 * this.crouchT + ANIM.slide.hipTilt * this.slideT;
    this.turn('spine', p * A.pitch.spine + (lean - hipTilt) * 0.5 + hx * 0.6, twist * 0.5 + sway, hz * 0.6);
    this.turn('chest', p * A.pitch.chest + (lean - hipTilt) * 0.5 + hx * 0.4 + breathe - A.recoil.chest * this.recoil, twist * 0.5 - sway * 0.5, hz * 0.4);
    // The head keeps the eyes on the view: it takes back the lean.
    this.turn('head', p * A.pitch.head - lean, 0, 0);
    return p;
  }

  /**
   * Knife swing (the rifle is slung on the back meanwhile): the right hand winds up beside the head and
   * slashes across and forward, the left arm guards in front of the chest. Positions in the chest's space.
   * PCD: without the right hand the left one swings (mirrored); with one hand the other arm hangs.
   */
  private knifeArms(dt: number, hold = false) {
    const miss = this.c.missing;
    const side: 'L' | 'R' = miss?.handR ? 'L' : 'R';
    const sx = side === 'R' ? 1 : -1;
    // Holding it between swings (a blade-only loadout): the guard pose, where every swing starts.
    this.knifeSwing = hold ? null : (this.knifeSwing ?? 0) + dt;
    const u = hold ? 0 : Math.min(1, this.knifeSwing! / ANIM.knife.swing);
    const guard = new THREE.Vector3(0.16, 0.06, -0.3);
    const up = new THREE.Vector3(0.26, 0.3, -0.08);
    const hit = new THREE.Vector3(-0.14, -0.02, -0.5);
    const end = new THREE.Vector3(-0.08, 0.02, -0.4);
    const k = (a: number, b: number) => smooth(THREE.MathUtils.clamp((u - a) / (b - a), 0, 1));
    const swing = guard.clone().lerp(up, k(0, 0.35)).lerp(hit, k(0.35, 0.6)).lerp(end, k(0.6, 1));
    swing.x *= sx;
    const chest = this.fk(this.bone('chest')!, new THREE.Matrix4());
    this.ik(armOf(side), swing.applyMatrix4(chest), new THREE.Vector3(0.6 * sx, -0.7, 0.4));
    if (miss?.handL || miss?.handR) this.hangArm(side === 'R' ? 'L' : 'R');
    else this.ik(LIMBS.armL, new THREE.Vector3(-0.12, 0.04, -0.3).applyMatrix4(chest), new THREE.Vector3(-0.7, -0.6, 0.2));
    this.c.setGrip(side === 'R' ? 0.8 : 1, side === 'R' ? 1 : 0.8);
  }

  /**
   * Both hands on the rifle (IK): hip fire, ADS or sprint; recoil, reload, knife and grenade on top. PCD with
   * one hand: it holds the rifle by the grip (the left one, in the mirrored poses of ANIM.rifleOneHand, when
   * the right is missing; the right arm hangs), or the left stump stays under the handguard; it reloads with
   * the rifle resting against the body, and throws a grenade with the rifle on the back (rifleAway).
   */
  private rifleArms(dt: number, s: AvatarPose, pitch: number, lean: number) {
    const A = ANIM;
    const miss = this.c.missing;
    const oneHand = !!(miss?.handL || miss?.handR);
    // The hand on the grip, and the side its poses are on (+1 right, -1 left).
    const gripSide: 'L' | 'R' = miss?.handR ? 'L' : 'R';
    const gs = gripSide === 'L' ? -1 : 1;
    this.adsT = damp(this.adsT, s.ads && !s.sprint ? 1 : 0, A.rate.ads, dt);
    this.reloadT = s.reload ? this.reloadT + dt : 0;
    this.knifeT = s.knife ? Math.min(1, this.knifeT + dt * 6) : damp(this.knifeT, 0, 10, dt);
    const lerp3 = (a: readonly number[], b: readonly number[], k: number) => a.map((x, i) => x + (b[i] - x) * k);
    const P = gripSide === 'L' ? A.rifleOneHand : A.rifle;
    let pos = lerp3(P.hip.pos, P.ads.pos, this.adsT);
    let rot = lerp3(P.hip.rot, P.ads.rot, this.adsT);
    const sprint = this.sprintT * (1 - this.adsT);
    pos = lerp3(pos, P.sprint.pos, sprint);
    rot = lerp3(rot, P.sprint.rot, sprint);
    // One hand reloading: the rifle goes to rest against the body (on the hand's side) and comes back.
    const u = (this.reloadT % A.reload.cycle) / A.reload.cycle;
    const oneReload = oneHand && s.reload;
    if (oneReload) {
      const R = A.rifleOneHand.reload;
      const k = u < 0.15 ? smooth(u / 0.15) : u < 0.85 ? 1 : 1 - smooth((u - 0.85) / 0.15);
      pos = lerp3(pos, [-gs * R.pos[0], R.pos[1], R.pos[2]], k);
      rot = lerp3(rot, [R.rot[0], -gs * R.rot[1], -gs * R.rot[2]], k);
    }
    // The chest carries 70% of the pitch and the torso's lean; the rifle takes back the lean and adds the
    // head's share, so it points along the view.
    const rest = pitch * A.pitch.head - lean;
    const rifle = this.fk(this.bone('chest')!, new THREE.Matrix4()).multiply(
      mB.compose(
        new THREE.Vector3(pos[0], pos[1], pos[2] + A.recoil.back * this.recoil - A.knife.push * this.knifeT),
        qA.setFromEuler(e.set(rot[0] + rest + A.recoil.up * this.recoil - 0.35 * this.knifeT, rot[1], rot[2])),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    // The grip hand: where the grip puts the rifle. One hand reloading: grip → magazine → pouch → magazine →
    // grip, while the rifle rests.
    const hand = new THREE.Matrix4().multiplyMatrices(rifle, rifleToHand(gripSide));
    const grip = new THREE.Vector3().setFromMatrixPosition(hand);
    const gripQ = new THREE.Quaternion().setFromRotationMatrix(hand);
    if (oneReload) {
      const mag = new THREE.Vector3(0, -0.08, -0.1).applyMatrix4(rifle);
      const pouch = new THREE.Vector3(gs * (0.16 + this.spread * 0.4), 0.95, -0.1);
      const k = u < 0.15 ? 0 : u < 0.3 ? smooth((u - 0.15) / 0.15) : u < 0.7 ? 1 : u < 0.85 ? 1 - smooth((u - 0.7) / 0.15) : 0;
      const out = u > 0.3 && u < 0.7 ? Math.sin(((u - 0.3) / 0.4) * Math.PI) : 0;
      grip.lerp(mag, k).lerp(pouch, out);
    }
    // Left hand (or the left stump): under the handguard, palm up; with both hands, to the magazine and the
    // pouch while reloading.
    const rifleQ = new THREE.Quaternion().setFromRotationMatrix(rifle);
    let left = new THREE.Vector3(...A.leftGrip[s.hold ?? 'longa']).applyMatrix4(rifle);
    const leftQ = rifleQ.clone().multiply(q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
    if (s.reload && !oneHand) {
      const mag = new THREE.Vector3(0, -0.08, -0.1).applyMatrix4(rifle);
      const pouch = new THREE.Vector3(-0.16 - this.spread * 0.4, 0.95, -0.1);
      // grip → magazine → pouch → magazine → grip.
      const k = u < 0.2 ? smooth(u / 0.2) : u < 0.8 ? 1 : 1 - smooth((u - 0.8) / 0.2);
      const out = u > 0.25 && u < 0.75 ? Math.sin(((u - 0.25) / 0.5) * Math.PI) : 0;
      left = left.lerp(mag, k).lerp(pouch, out);
    }
    // The grenade's hand: the left one, or the only one there is (on the right: `ts` -1 mirrors it). Up and
    // back holding the grenade while cooking.
    const ts = oneHand ? -gs : 1;
    let nade = oneHand ? grip : left;
    let nadeQ = oneHand ? gripQ : leftQ;
    const cookPos = new THREE.Vector3(-0.26 * ts, 1.62 - 0.37 * this.crouchT, 0.12);
    if (s.cook) {
      nade = cookPos.clone();
      nadeQ = q.setFromEuler(e.set(-0.6, 0, 0)).clone();
    }
    // Throw: from the cooking pose, over the shoulder and forward (release at RELEASE), then back down to
    // where that hand holds the rifle.
    if (this.throwT !== null) {
      this.throwT += dt;
      const T = A.throw;
      const tu = this.throwT / T.time;
      if (tu >= 1) this.throwT = null;
      else {
        const release = new THREE.Vector3(-0.14 * ts, 1.52 - 0.37 * this.crouchT, -0.5);
        const k1 = smooth(THREE.MathUtils.clamp(tu / T.release, 0, 1));
        const k2 = smooth(THREE.MathUtils.clamp((tu - T.release) / (1 - T.release), 0, 1));
        nade = cookPos.clone().lerp(release, k1).lerp(nade, k2);
        nadeQ = q.setFromEuler(e.set(-0.6 + 1.4 * k1, 0, 0)).clone().slerp(nadeQ, k2);
      }
    }
    this.grenadeInHand = s.cook || (this.throwT !== null && this.throwT < A.throw.time * A.throw.release);
    // The support elbow points out and down (not in front of the chest, where a vest or the chest itself
    // would swallow the upper arm); more on a gordo body.
    const leftPole = new THREE.Vector3(-0.9 - this.spread * 2, -0.5, 0.12);
    if (!oneHand) {
      this.ik(LIMBS.armR, grip, new THREE.Vector3(0.7, -0.6, 0.35), gripQ);
      this.ik(LIMBS.armL, nade, leftPole, nadeQ);
      return;
    }
    // One hand: it holds the rifle, or the grenade with the rifle on the back; the other arm hangs, or the
    // left stump stays under the handguard.
    this.rifleAway = s.cook || this.throwT !== null;
    const pole = this.rifleAway ? new THREE.Vector3(ts * leftPole.x, leftPole.y, leftPole.z) : new THREE.Vector3(0.7 * gs, -0.6, 0.35);
    this.ik(armOf(gripSide), this.rifleAway ? nade : grip, pole, this.rifleAway ? nadeQ : gripQ);
    if (gripSide === 'L' || this.rifleAway) this.hangArm(gripSide === 'L' ? 'R' : 'L');
    else this.ik(LIMBS.armL, left, leftPole, leftQ);
    // While its hand is off the grip the rifle stays where it rests: its transform in the hand socket's space.
    if (oneReload) {
      const s0 = SOCKETS[gripSide === 'L' ? 'hand_L' : 'hand_R'].pos;
      const handInv = this.fk(this.bone(`hand_${gripSide}`)!, mA).invert();
      this.rifleOffset = this.offsetM.makeTranslation(-s0[0], -s0[1], -s0[2]).multiply(handInv).multiply(rifle);
    }
  }

  /** How far the arms spread for the body's build (radians): hanging hands clear a gordo belly and hips. */
  private get spread() {
    return this.c.bodyBuild === 'gordo' ? 0.24 : this.c.bodyBuild === 'magro' ? -0.02 : 0.03;
  }

  /** Unarmed arms swinging against the legs (the editor's walk), or hanging relaxed. */
  private looseArms(speed: number) {
    const swing = Math.sin(this.phase * Math.PI * 2) * Math.min(0.7, 0.15 + speed * 0.08) * this.gait;
    const run = speed > 5 ? 1 : 0;
    const out = 0.14 + this.spread;
    this.arm('L', swing, 0, -out, 0.15 + run * 1.1 + 0.2 * this.gait);
    this.arm('R', -swing, 0, out, 0.15 + run * 1.1 + 0.2 * this.gait);
  }

  // --- Public poses -------------------------------------------------------------------------------------------

  /** Standing, arms relaxed (`t` in seconds: breathing). */
  idle(t = 0) {
    const dt = this.lastIdleT === null ? 0 : THREE.MathUtils.clamp(t - this.lastIdleT, 0, 0.1);
    this.lastIdleT = t;
    this.reset();
    this.c.setGrip(0, 0);
    const lean = this.lowerBody(dt, { speed: 0, crouch: false, pitch: 0, ads: false, reload: false, knife: false, cook: false, yaw: this.lastYaw ?? 0 });
    this.torso(dt, 0, lean, Math.sin(t * 2) * 0.012);
    this.looseArms(0);
  }

  /** Unarmed walk / run (editor preview). */
  walk(dt: number, speed: number) {
    this.reset();
    this.c.setGrip(speed > 5 ? 0.6 : 0, speed > 5 ? 0.6 : 0);
    const lean = this.lowerBody(dt, { speed, sprint: speed > 5, crouch: false, pitch: 0, ads: false, reload: false, knife: false, cook: false, yaw: this.lastYaw ?? 0 });
    this.torso(dt, 0, lean);
    this.looseArms(speed);
  }

  /** In game, armed: locomotion, aim offset and the rifle in both hands, with the action layers on top. */
  pose(dt: number, s: AvatarPose) {
    this.reset();
    this.time += dt;
    this.rifleAway = false;
    this.rifleOffset = null;
    this.c.setGrip(s.reload ? 0.4 : 0.8, 0.9);
    const lean = this.lowerBody(dt, s);
    const p = this.torso(dt, s.pitch, lean, Math.sin(this.time * 2) * 0.008 * (1 - this.gait));
    if (s.knife || s.blade) {
      this.knifeArms(dt, !s.knife);
      this.grenadeInHand = false;
    } else {
      this.knifeSwing = null;
      this.rifleArms(dt, s, p, lean);
    }
  }

  /**
   * A zombie (the zumbi mode): the same planted-feet locomotion, hunched over with the head lolling and the arms
   * reaching ahead (flailing when it runs), plus what it's winding up: a swipe (both arms up, then down), a
   * bloater swelling (arms out, shaking), a spitter rearing back, or a boss's telegraphed move.
   */
  zombie(dt: number, s: ZombiePose) {
    this.reset();
    this.time += dt;
    this.c.setGrip(0.25, 0.25);
    const move = s.special?.kind;
    const lean = this.lowerBody(dt, { speed: s.speed, vel: s.vel, yaw: s.yaw, crouch: move === 'summon', sprint: s.run, pitch: 0, ads: false, reload: false, knife: false, cook: false });
    const t = this.time;
    const k = s.special?.t ?? 0;
    const twist = -this.legYaw;
    // `hunch` and `headX` count forward as positive (a stoop, the head dropping); the bones turn the other way
    // (positive x tilts them back, as the aim pitch looks up), so they're flipped below. The legs' `lean` is in
    // the bones' sense (running: negative, forward).
    let hunch = (s.run ? 0.42 : 0.24) - lean * 0.3;
    let headX = -0.2 + Math.sin(t * 1.3) * 0.08;
    let headZ = 0.22 + Math.sin(t * 0.9) * 0.1;
    if (move === 'charge') hunch = 0.65;
    if (move === 'scream') {
      hunch = -0.25 * smooth(k);
      headX = -0.55 * smooth(k);
      headZ = 0;
    }
    if (s.spit !== null) {
      // Rears back, then snaps forward as it lets go.
      const back = s.spit < 0.8 ? smooth(s.spit / 0.8) : 1 - smooth((s.spit - 0.8) / 0.2);
      hunch -= 0.45 * back;
      headX -= 0.5 * back;
    }
    this.turn('spine', -hunch * 0.55, twist * 0.5 + Math.sin(t * 0.8) * 0.05, Math.sin(t * 1.1) * 0.04);
    this.turn('chest', -hunch * 0.45, twist * 0.5, 0);
    this.turn('head', -headX, Math.sin(t * 0.7) * 0.15, headZ);
    // Arms: reaching ahead by default, swaying; flailing when running.
    const sway = (o: number) => Math.sin(t * 2.2 + o) * 0.08;
    const run = s.run ? Math.sin(this.phase * Math.PI * 2) * 0.7 * this.gait : 0;
    // Stooped, the shoulders tip forward with the chest: the arms rise as much to keep reaching straight ahead.
    let left: [number, number, number, number] = [1.35 + hunch + sway(0) + run, 0, -0.12, 0.25];
    let right: [number, number, number, number] = [1.25 + hunch + sway(1) - run, 0, 0.12, 0.3];
    if (s.attack !== null) {
      // Up over the head through the windup, then down hard as it lands.
      const a = s.attack;
      const x = a < 0.75 ? 1.3 + 1.4 * smooth(a / 0.75) : 2.7 - 2.1 * smooth((a - 0.75) / 0.25);
      left = [x, 0, -0.2, 0.4];
      right = [x, 0, 0.2, 0.4];
    } else if (s.fuse !== null) {
      const shake = Math.sin(t * 45) * 0.12 * s.fuse;
      left = [0.4 + shake, 0, -1.3 - shake, 0.2];
      right = [0.4 - shake, 0, 1.3 + shake, 0.2];
    } else if (move === 'slam' || move === 'pound') {
      const up = smooth(Math.min(1, k / 0.85));
      left = [1.3 + 1.7 * up, 0, -0.15, 0.3];
      right = [1.3 + 1.7 * up, 0, 0.15, 0.3];
    } else if (move === 'scream') {
      left = [0.3, 0, -1.6 * smooth(k), 0.15];
      right = [0.3, 0, 1.6 * smooth(k), 0.15];
    } else if (move === 'summon') {
      left = [0.9, 0, -0.35, 0.6 + Math.sin(t * 9) * 0.2];
      right = [0.9, 0, 0.35, 0.6 + Math.sin(t * 9 + 1) * 0.2];
    } else if (move === 'charge') {
      left = [-0.7, 0, -0.3, 0.4];
      right = [-0.7, 0, 0.3, 0.4];
    } else if (move === 'blink') {
      left = [1.9, 0, -0.9, 1.4];
      right = [1.9, 0, 0.9, 1.4];
    }
    this.arm('L', ...left);
    this.arm('R', ...right);
  }

  /** "Dancinha da Vitória": raise the roof, spin, then disco pointing. `t` in seconds, 150 bpm. */
  dance(t: number) {
    this.reset();
    this.c.setGrip(0.5, 0.5);
    const b = t / 0.4;
    const bounce = Math.abs(Math.sin(b * Math.PI));
    this.setHipsY(-0.06 + bounce * 0.1);
    const hipZ = Math.sin(b * Math.PI) * 0.14;
    this.turn('hips', 0, 0, hipZ);
    this.leg('L', Math.sin(b * Math.PI) * 0.35, 0.25 * bounce);
    this.leg('R', -Math.sin(b * Math.PI) * 0.35, 0.25 * (1 - bounce));
    this.turn('spine', 0, 0, -hipZ * 1.4);
    this.turn('head', Math.sin(b * Math.PI * 2) * 0.15, 0, Math.sin(b * Math.PI) * 0.2);
    if (t < 1.6) {
      const pump = Math.sin(b * Math.PI * 2) * 0.25;
      this.arm('L', 0, 0, -2.7 - pump, 0.3);
      this.arm('R', 0, 0, 2.7 + pump, 0.3);
    } else if (t < 2.4) {
      const s = (t - 1.6) / 0.8;
      this.turn('hips', 0, THREE.MathUtils.smootherstep(s, 0, 1) * Math.PI * 2, 0);
      this.arm('L', 0, 0, -1.5);
      this.arm('R', 0, 0, 1.5);
    } else {
      const up = Math.floor(b) % 2 === 0;
      this.arm('R', 0, 0, up ? 2.6 : 0.6, 0.1);
      this.arm('L', 0, 0, up ? -0.6 : -2.6, 0.1);
    }
  }

  /** Stiff cartoon fall onto the back (`dir` 1) or face (-1), `t` seconds after death. */
  die(t: number, dir: 1 | -1 = 1) {
    this.reset();
    this.c.setGrip(0.3, 0.3);
    this.arm('L', 0, 0, -0.5, 0.3);
    this.arm('R', 0, 0, 0.5, 0.3);
    this.leg('L', 0.1, 0.2);
    this.leg('R', -0.05, 0.1);
    const k = Math.min(1, t / 0.45);
    const after = t - 0.45;
    const bounce = k < 1 ? k * k : 1 + Math.sin(after * 18) * Math.exp(-after * 7) * 0.06;
    // Fall around the feet: positive X rotation tips the top toward +Z (backward for a -Z facing body).
    this.c.body.rotation.x = dir * bounce * (Math.PI / 2 - 0.08);
  }
}

