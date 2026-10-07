// Sticker studio: poses past what the game's animator plays. k.pp(av) reaches the animator's own posing
// helpers (turn, arm, leg, hips, reset), which are private in CharacterAnimator (client/character/animator.ts):
// the one cast that reaches them lives here, so a rename breaks one place. The core's presets: ouch (doubled
// over, hands at the groin), flail (losing balance, windmilling) and panic (hands on the cheeks). Every
// animator call (pose, walk, idle, dance, die, zombie) resets all bones first, so these go after the last one.
//
// Signs (bone space, from the T-pose rest): spine, chest and head +x tip back / look up, -x bow / look down;
// y turns left-right, z tilts. Arms hang along -Y: x > 0 swings forward and up, z > 0 raises the right arm
// sideways (z < 0 the left), `elbow` bends. Legs: x > 0 swings the thigh forward, `knee` bends the shin back,
// z moves the foot sideways (+z toward the character's right, which is world +X before the root turns).
import * as THREE from 'three';
import type { BoneName } from '../../../character/rig';
import type { Avatar } from '../../../entities/avatar';

/** The animator's private helpers, as animator.ts declares them. */
interface AnimatorTools {
  turn(name: string, x?: number, y?: number, z?: number, base?: 'rest' | 'hang'): void;
  arm(side: 'L' | 'R', x: number, y: number, z: number, elbow?: number): void;
  leg(side: 'L' | 'R', x: number, knee?: number, z?: number): void;
  setHipsY(dy: number): void;
  reset(): void;
}

export interface PosePack {
  /** A bone at its rest rotation turned by an Euler (x, y, z) in its parent's frame. */
  turn(bone: BoneName, x?: number, y?: number, z?: number): void;
  /** An arm by angles (see the signs above). */
  arm(side: 'L' | 'R', x: number, y: number, z: number, elbow?: number): void;
  /** A leg by angles: thigh forward `x`, `knee` bend, sideways `z`. */
  leg(side: 'L' | 'R', x: number, knee?: number, z?: number): void;
  /** The hips this far from their standing height (m, body space). */
  hipsY(dy: number): void;
  /** Every bone back to the T-pose rest, the body straight. */
  reset(): void;
  /** How closed each hand is (0 open … 1 fist). */
  grip(left: number, right: number): void;
  /** Moves the hips up or down so the lower foot stands on the ground again (after bending the legs). */
  plant(): void;
  /** The group die() rotates (fall about the feet: rotation.x). */
  readonly body: THREE.Object3D;
  readonly bones: Record<string, THREE.Bone>;
}

/** Ankle height on the ground (animator.ts ANIM.foot.y). */
const ANKLE_Y = 0.08;
const v = new THREE.Vector3();

export function pp(av: Avatar): PosePack {
  // The one cast into CharacterAnimator's private helpers.
  const a = (av as unknown as { animator: AnimatorTools }).animator;
  for (const name of ['turn', 'arm', 'leg', 'setHipsY', 'reset'] as const)
    if (typeof a?.[name] !== 'function') throw new Error(`k.pp: o CharacterAnimator não tem mais ${name}() (client/character/animator.ts mudou)`);
  const c = av.character;
  return {
    turn: (bone, x = 0, y = 0, z = 0) => a.turn(bone, x, y, z),
    arm: (side, x, y, z, elbow = 0) => a.arm(side, x, y, z, elbow),
    leg: (side, x, knee = 0, z = 0) => a.leg(side, x, knee, z),
    hipsY: (dy) => a.setHipsY(dy),
    reset: () => a.reset(),
    grip: (left, right) => c.setGrip(left, right),
    plant() {
      c.root.updateMatrixWorld(true);
      const low = Math.min(...(['foot_L', 'foot_R'] as const).map((f) => c.body.worldToLocal(c.bones[f].getWorldPosition(v)).y));
      c.bones.hips.position.y += ANKLE_Y - low;
    },
    body: c.body,
    bones: c.bones,
  };
}

/** Pose presets shared by several domains (starting values from the plan, tuned in the studio). */
export const POSES = {
  /** Doubled over at the hips, knees knocked, both hands cupping the groin, face up in pain (no-passaro, voto-nulo). */
  ouch(av: Avatar) {
    const p = pp(av);
    p.reset();
    // Bow at the hips (the thighs turn with them: give it back to the thighs), then down the back.
    p.turn('hips', -0.4);
    p.leg('L', 0.75, 0.75, 0.16);
    p.leg('R', 0.75, 0.75, -0.16);
    p.turn('spine', -0.35);
    p.turn('chest', -0.2);
    p.turn('neck', 0.35);
    p.turn('head', 0.35);
    p.arm('L', 0.15, 0, 0.55, 0.55);
    p.arm('R', 0.15, 0, -0.55, 0.55);
    p.grip(0.75, 0.75);
    p.plant();
  },
  /** Losing balance: one arm up and back, the other forward and down, one knee up (falls, pushes, blasts). */
  flail(av: Avatar) {
    const p = pp(av);
    p.reset();
    p.leg('L', -0.15, 0.25, -0.05);
    p.leg('R', 0.95, 1.25, 0.1);
    p.turn('hips', 0, 0.15, -0.08);
    p.turn('spine', 0.25, 0.15, 0.1);
    p.turn('chest', 0.15, 0.1, 0);
    p.turn('head', 0.3, -0.2, 0.15);
    p.arm('R', -0.5, 0, 2.5, 0.35);
    p.arm('L', 1.0, 0, -0.75, 0.3);
    p.grip(0.15, 0.15);
    p.plant();
  },
  /** Frozen in panic: hands on the cheeks, elbows in, knees knocked, head down (tiro-no-pe). */
  panic(av: Avatar) {
    const p = pp(av);
    p.reset();
    p.leg('L', 0.2, 0.45, 0.17);
    p.leg('R', 0.2, 0.45, -0.17);
    p.turn('spine', -0.12);
    p.turn('chest', -0.05);
    p.turn('head', -0.4);
    p.arm('L', 0.35, 0.6, 0.35, 2.3);
    p.arm('R', 0.35, -0.6, -0.35, 2.3);
    p.grip(0.25, 0.25);
    p.plant();
  },
};
