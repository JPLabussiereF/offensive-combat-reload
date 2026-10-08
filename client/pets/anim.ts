// How a pet moves (PF-29), procedurally, from its rest pose every frame: the four-legged ones trot (diagonal pairs,
// faster with the speed), sit, breathe, wag and turn their head; the iguana sprawls and wiggles; the Bruxinha
// hovers on her broom and leans into the turns. On top, a gesture: the station's (the Amora tugs a rope toy, the
// Bruxinha throws a potion and a rubber duck pops out, the cat stretches and gets up, the otter juggles, the weasel
// gives three hammer blows, the iguana swings her tail), the abilities' in the zumbi mode (bite, spell, nudge,
// throw, hammer) and the Opressão's dance. Pure math on the bones: client/pets/actor.ts and the Galpão drive it.
import * as THREE from 'three';
import type { PetId } from '@shared/pets';
import type { PetModel } from './rig';

export type Gesture =
  /** The station's, one per pet. */
  | 'rope'
  | 'potion'
  | 'stretch'
  | 'juggle'
  | 'hammer'
  | 'tail'
  /** The zumbi abilities'. */
  | 'bite'
  | 'cast'
  | 'push'
  | 'throw'
  /** A hello: a head tilt and a wag (the overview's idle, the menu's hover). */
  | 'hello';

/** The gesture each pet makes on the doormat (the plan's: rope toy, potion and duck, stretch, juggling, three blows, tail). */
export const STATION_GESTURE: Record<PetId, Gesture> = { amora: 'rope', bruxinha: 'potion', gato: 'stretch', fuinha: 'hammer', lontra: 'juggle', iguana: 'tail' };

/** How long each gesture takes (s). The station's fit in the swap: on the mat by 0.8 s, done within 2 s. */
export const GESTURE_TIME: Record<Gesture, number> = { rope: 0.95, potion: 0.95, stretch: 0.95, juggle: 0.95, hammer: 0.95, tail: 0.9, bite: 0.7, cast: 0.8, push: 0.9, throw: 0.6, hello: 0.9 };

/** What the pet is doing this frame. */
export interface PetPose {
  /** Ground speed (m/s). */
  speed: number;
  /** 0..1: sitting. */
  sit: number;
  /** 0..1: up on the hind legs with the front paws on a table (the dog on the overview). */
  table: number;
  /** Head turn (rad, + to its left) and tilt. */
  lookYaw: number;
  lookPitch: number;
  gesture: Gesture | null;
  /** Seconds into the gesture. */
  gestureT: number;
  /** The owner's dancing (the Opressão): the pet dances along. */
  dance: boolean;
  /** The Bruxinha's broom height over the feet (m). */
  hover: number;
  /** 0..1: the iguana's tail is gone (Rabo de Isca), growing back as it falls to 0. */
  tailGone: number;
}

export const restPose = (): PetPose => ({ speed: 0, sit: 0, table: 0, lookYaw: 0, lookPitch: 0, gesture: null, gestureT: 0, dance: false, hover: 0, tailGone: 0 });

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** A bump 0 → 1 → 0 over [a, b] of t. */
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

/** How far each pet's stride goes (m per step cycle) and how big it is. */
const STRIDE: Record<PetId, number> = { amora: 0.55, bruxinha: 1, gato: 0.42, fuinha: 0.3, lontra: 0.36, iguana: 0.3 };

export class PetAnimator {
  private phase = 0;
  private t = 0;
  private quad: boolean;

  constructor(private m: PetModel) {
    this.quad = m.id !== 'bruxinha';
  }

  /** Poses the bones for this frame (`dt` seconds since the last). */
  update(dt: number, p: PetPose) {
    const m = this.m;
    this.t += dt;
    m.resetPose();
    for (const o of m.props.values()) o.visible = false;
    if (this.quad) this.quadruped(dt, p);
    else this.witch(p);
  }

  private quadruped(dt: number, p: PetPose) {
    const m = this.m;
    const id = m.id;
    const t = this.t;
    const body = m.bone('body');
    const head = m.bone('head');
    const tail = m.bone('tail');
    const tail2 = m.bones.get('tail2');
    const jaw = m.bones.get('jaw');
    const legs = ['fl', 'fr', 'bl', 'br'].map((n) => m.bone(n));
    const size = m.height;
    const g = clamp01(p.speed / (id === 'amora' ? 1.4 : 1.1));
    this.phase = (this.phase + (dt * p.speed) / STRIDE[id]) % 1;
    const s = Math.sin(this.phase * Math.PI * 2);
    const lizard = id === 'iguana';
    // Trot: the diagonal pairs swing together; the iguana sprawls (her legs swing back and forth flat).
    const amp = (lizard ? 0.6 : 0.65) * g;
    const swing = [s, -s, -s, s];
    legs.forEach((l, i) => {
      if (lizard) l.rotation.y = swing[i] * amp * (i < 2 ? 1 : -1);
      else l.rotation.x = swing[i] * amp;
    });
    // The body bobs with the steps, breathes when still; the iguana's wiggles side to side.
    body.position.y += Math.abs(s) * 0.025 * size * g + Math.sin(t * 2.2) * 0.004 * (1 - g);
    body.scale.y = 1 + Math.sin(t * 2.2) * 0.012 * (1 - g);
    if (lizard) body.rotation.y = s * 0.18 * g;
    // The head looks; panting and wagging a little when nothing else is going on.
    head.rotation.y = THREE.MathUtils.clamp(p.lookYaw, -0.9, 0.9);
    head.rotation.x = THREE.MathUtils.clamp(p.lookPitch, -0.5, 0.5);
    if (jaw) jaw.rotation.x = 0.06 + Math.max(0, Math.sin(t * 9)) * 0.08 * g;
    const wag = id === 'gato' ? 0.12 : id === 'amora' ? 0.3 : 0.25;
    tail.rotation.y = Math.sin(t * (2 + 6 * g)) * wag;
    if (tail2) tail2.rotation.y = Math.sin(t * (2 + 6 * g) - 0.8) * wag;
    if (id === 'gato') {
      // A cat's tail stands up and curls at the tip.
      tail.rotation.x = -0.35 + g * 0.5;
      if (tail2) tail2.rotation.x = -0.5;
    }
    // The iguana's tail: whatever's left of it after dropping it, growing back.
    if (lizard && p.tailGone > 0) {
      const k = 1 - p.tailGone * 0.85;
      tail.scale.setScalar(Math.max(0.15, k));
    }
    // Sitting: nose up around the hips, the hind legs folded under, the front legs straight.
    const sit = smooth(clamp01(p.sit));
    if (sit > 0 && !lizard) {
      const a = sit * (id === 'amora' ? 0.55 : id === 'gato' ? 0.75 : 0.5);
      body.rotation.x += a;
      body.position.y -= sit * size * (id === 'amora' ? 0.12 : 0.1);
      body.position.z += sit * m.length * 0.08;
      legs[0].rotation.x -= a;
      legs[1].rotation.x -= a;
      legs[2].rotation.x -= a - sit * 1.2;
      legs[3].rotation.x -= a - sit * 1.2;
      head.rotation.x -= a * 0.6;
    }
    // Up at the table: on the hind legs, the front paws forward on the top.
    const up = smooth(clamp01(p.table));
    if (up > 0) {
      const a = up * 1.05;
      body.rotation.x += a;
      body.position.y += up * 0.32;
      body.position.z += up * 0.16;
      legs[0].rotation.x += up * 0.35 - a + up * 1.3;
      legs[1].rotation.x += up * 0.35 - a + up * 1.3;
      legs[2].rotation.x -= a;
      legs[3].rotation.x -= a;
      head.rotation.x -= a * 0.85;
    }
    if (p.dance) this.dance(body, head, tail, legs);
    if (p.gesture) this.gesture(p.gesture, p.gestureT, { body, head, tail, tail2, jaw, legs });
  }

  /** The Opressão's dance: hops in place, the head bopping, the tail going wild. */
  private dance(body: THREE.Bone, head: THREE.Bone, tail: THREE.Bone, legs: THREE.Bone[]) {
    const t = this.t;
    const b = (t / 0.4) % 1;
    body.position.y += Math.abs(Math.sin(b * Math.PI)) * 0.06 * this.m.height;
    body.rotation.z = Math.sin(b * Math.PI * 2) * 0.12;
    head.rotation.z = Math.sin(b * Math.PI * 2 + 1) * 0.25;
    tail.rotation.y = Math.sin(t * 18) * 0.5;
    legs[0].rotation.x += Math.sin(b * Math.PI * 2) * 0.4;
    legs[1].rotation.x -= Math.sin(b * Math.PI * 2) * 0.4;
  }

  private gesture(gs: string, time: number, b: { body: THREE.Bone; head: THREE.Bone; tail: THREE.Bone; tail2?: THREE.Bone; jaw?: THREE.Bone; legs: THREE.Bone[] }) {
    const m = this.m;
    const T = GESTURE_TIME[gs as Gesture] ?? 1;
    const k = clamp01(time / T);
    const t = this.t;
    switch (gs) {
      case 'rope': {
        // Tugging a rope toy: braced back, the head shaking it, the tail going.
        const rope = m.props.get('rope');
        if (rope) rope.visible = true;
        const on = bump(k, 0, 1);
        b.body.position.z += on * 0.06;
        b.body.rotation.x -= on * 0.12;
        b.head.rotation.y += Math.sin(t * 16) * 0.45 * on;
        b.head.rotation.x += 0.2 * on;
        if (b.jaw) b.jaw.rotation.x = 0.25;
        b.tail.rotation.y = Math.sin(t * 20) * 0.5;
        break;
      }
      case 'bite': {
        // Down at a zombie's shin: lunges, the jaw snapping, shaking it.
        const on = bump(k, 0, 1);
        b.body.rotation.x -= 0.25 * on;
        b.body.position.z -= 0.08 * on;
        b.head.rotation.x += 0.45 * on;
        b.head.rotation.y += Math.sin(t * 22) * 0.3 * on;
        if (b.jaw) b.jaw.rotation.x = k < 0.4 ? 0.6 : 0.08;
        break;
      }
      case 'stretch': {
        // A play bow (front down, rear up), then up tall.
        const bow = bump(k, 0, 0.7);
        const rise = smooth(clamp01((k - 0.55) / 0.45));
        b.body.rotation.x -= bow * 0.4 - rise * 0.25;
        b.legs[0].rotation.x += bow * 0.9 - rise * 0.25;
        b.legs[1].rotation.x += bow * 0.9 - rise * 0.25;
        b.legs[2].rotation.x -= rise * 0.25;
        b.legs[3].rotation.x -= rise * 0.25;
        b.head.rotation.x += bow * 0.3 - rise * 0.2;
        b.tail.rotation.x -= bow * 0.5;
        if (b.jaw) b.jaw.rotation.x = bow * 0.4;
        break;
      }
      case 'push': {
        // Nudging its owner up: leaning in, the head pushing again and again.
        const on = bump(k, 0, 1);
        b.body.rotation.x -= 0.2 * on;
        b.head.rotation.x += (0.3 + Math.sin(t * 12) * 0.25) * on;
        break;
      }
      case 'juggle':
      case 'throw':
      case 'hammer': {
        // Up on the hind legs: juggling three stones, throwing one, or three blows of a hammer.
        const up = gs === 'throw' ? bump(k, 0, 1) : smooth(clamp01(k / 0.2)) * (1 - smooth(clamp01((k - 0.85) / 0.15)));
        const a = up * 1.15;
        b.body.rotation.x += a;
        b.body.position.y += up * m.height * 0.25;
        b.body.position.z += up * m.length * 0.18;
        b.legs[2].rotation.x -= a;
        b.legs[3].rotation.x -= a;
        b.legs[0].rotation.x += -a + up * 1.4;
        b.legs[1].rotation.x += -a + up * 1.4;
        b.head.rotation.x -= a * 0.8;
        if (gs === 'hammer') {
          const hammer = m.props.get('hammer');
          if (hammer) hammer.visible = true;
          // Three blows: the right paw up and down.
          const beat = (k * 3) % 1;
          b.legs[1].rotation.x += Math.sin(beat * Math.PI) * 1.0 - 0.3;
        } else if (gs === 'juggle') {
          const stones = m.props.get('stones');
          if (stones) {
            stones.visible = true;
            stones.children.forEach((c, i) => {
              c.visible = true;
              // In front of her chest (the trunk stands up: its -Y faces forward, its -Z points up), arcing up.
              const ph = (t * 2.2 + i / 3) % 1;
              c.position.set(Math.cos(ph * Math.PI * 2) * 0.05, -0.13, -0.2 - Math.abs(Math.sin(ph * Math.PI)) * 0.14);
            });
          }
          b.legs[0].rotation.x += Math.sin(t * 14) * 0.25;
          b.legs[1].rotation.x -= Math.sin(t * 14) * 0.25;
        } else {
          const stones = m.props.get('stones');
          if (stones && k < 0.5) {
            stones.visible = true;
            stones.children.forEach((c, i) => {
              c.visible = i === 1;
            });
          }
          b.legs[1].rotation.x += k < 0.5 ? -0.8 * k * 2 : 1.4 * bump(k, 0.4, 1);
        }
        break;
      }
      case 'tail': {
        // The iguana swings her tail around, slowly then quick.
        const on = bump(k, 0, 1);
        b.tail.rotation.y += Math.sin(t * 10) * 0.7 * on;
        if (b.tail2) b.tail2.rotation.y += Math.sin(t * 10 - 1) * 0.7 * on;
        const tail3 = m.bones.get('tail3');
        if (tail3) tail3.rotation.y += Math.sin(t * 10 - 2) * 0.8 * on;
        b.head.rotation.y += Math.sin(t * 3) * 0.2 * on;
        break;
      }
      case 'hello': {
        const on = bump(k, 0, 1);
        b.head.rotation.z += 0.28 * on;
        b.tail.rotation.y += Math.sin(t * 16) * 0.4 * on;
        break;
      }
    }
  }

  /** The Bruxinha on her broom: hovering, bobbing, leaning into the motion; her gestures. */
  private witch(p: PetPose) {
    const m = this.m;
    const t = this.t;
    const body = m.bone('body');
    const head = m.bone('head');
    const armL = m.bone('armL');
    const armR = m.bone('armR');
    body.position.y += p.hover + Math.sin(t * 2.2) * 0.025;
    body.rotation.x = -Math.min(0.25, p.speed * 0.06);
    body.rotation.z = Math.sin(t * 1.3) * 0.05;
    head.rotation.y = THREE.MathUtils.clamp(p.lookYaw, -0.8, 0.8);
    head.rotation.x = THREE.MathUtils.clamp(p.lookPitch, -0.4, 0.4) + Math.sin(t * 1.7) * 0.04;
    armL.rotation.x = 0.3;
    armR.rotation.x = 0.3;
    if (p.dance) {
      body.rotation.y = (t * 6) % (Math.PI * 2);
      armL.rotation.z = 1.2 + Math.sin(t * 12) * 0.4;
      armR.rotation.z = -1.2 - Math.sin(t * 12) * 0.4;
    }
    const g = p.gesture;
    if (!g) return;
    const k = clamp01(p.gestureT / GESTURE_TIME[g]);
    if (g === 'potion' || g === 'cast') {
      // Up goes the arm with the flask (or the wand hand), a flick, and a rubber duck pops out in front.
      const potion = m.props.get('potion');
      if (potion && g === 'potion') potion.visible = k < 0.55;
      armR.rotation.x = 0.3 - bump(k, 0, 0.55) * 1.8 + bump(k, 0.45, 0.8) * 0.9;
      armR.rotation.z = -bump(k, 0, 0.7) * 0.5;
      head.rotation.x -= bump(k, 0.4, 1) * 0.2;
      const duck = m.props.get('duck');
      if (duck && k > 0.5) {
        duck.visible = true;
        const s = smooth(clamp01((k - 0.5) / 0.25));
        duck.position.set(0, -0.1 + s * 0.05, -0.32);
        duck.scale.setScalar(Math.max(0.01, s * (1 + bump(k, 0.75, 1) * 0.15)));
      }
    } else if (g === 'hello') {
      head.rotation.z += bump(k, 0, 1) * 0.3;
      armL.rotation.z = bump(k, 0, 1) * 1.4;
    }
  }
}
