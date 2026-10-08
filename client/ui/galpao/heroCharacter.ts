// The player's own character at the Galpão's hero table (in place of the design's clay mannequin): built from the
// account's look like in a match, without weapons, and posed once by hand on the canonical rig: the spine and
// chest lean over the table and each arm reaches its hand onto the top (two-bone IK on the arm bones). Each frame
// only the head moves, half toward the camera and half toward the table.
import * as THREE from 'three';
import type { Appearance } from '@shared/appearance';
import type { Sex } from '@shared/protocol';
import { Character } from '../../character/character';
import { appearanceToConfig } from '../../entities/avatar';
import type { GalpaoHero } from './scene';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Where it stands and where the hands go, in the scene's hero space (the table's top is at y 0.92 and spans
// z 0.1 to 1.1; the camera looks from +z). The rig faces -Z, so the root turns half a circle.
const STAND = V(-0.35, 0, -0.1);
/** The wrists, a little above the top so the palms rest on it. */
const WRIST = { R: V(-0.66, 0.975, 0.36), L: V(-0.02, 0.975, 0.33) };
/** Forward lean, split between the spine and the chest. */
const LEAN = 0.62;
/** Where the eyes go when not on the camera (the map sheet). */
const TABLE_FOCUS = V(-0.2, 0.92, 0.6);
/** The head turns at most this far from the neck's straight line. */
const HEAD_MAX = 0.7;

const _q = new THREE.Quaternion();
const _p = new THREE.Quaternion();
const _a = V();
const _b = V();

/** Turns `bone` (the smallest turn) so that the point `tip` of its own space points at `target` (world). */
function aim(bone: THREE.Object3D, tip: THREE.Vector3, target: THREE.Vector3) {
  bone.updateWorldMatrix(true, false);
  const pos = bone.getWorldPosition(_a);
  const wq = bone.getWorldQuaternion(_q);
  const cur = tip.clone().normalize().applyQuaternion(wq);
  const want = _b.copy(target).sub(pos).normalize();
  const nwq = new THREE.Quaternion().setFromUnitVectors(cur, want).multiply(wq);
  bone.parent!.getWorldQuaternion(_p);
  bone.quaternion.copy(_p.invert().multiply(nwq));
  bone.updateWorldMatrix(false, true);
}

/** The elbow (or knee) between `a` and `t` for segment lengths `l1` and `l2`, bent toward `pole`. */
function elbow(a: THREE.Vector3, t: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const d = t.clone().sub(a);
  const L = THREE.MathUtils.clamp(d.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const dir = d.normalize();
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = pole.clone().sub(a);
  p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
  return a.clone().addScaledVector(dir, x).addScaledVector(p, h);
}

/** The character leaning on the table, ready for the scene (`Galpao.setHero`). */
export function heroCharacter(look: Appearance, sex: Sex): GalpaoHero {
  const config = appearanceToConfig(look, sex);
  // Hands on the table: no rifle in them nor on the back.
  delete config.items.weapon_R;
  delete config.items.weapon_back;
  const c = new Character(config);
  c.bake();
  const root = c.root;
  root.position.copy(STAND);
  root.rotation.y = Math.PI;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // The bounds are the rest pose's; the lean would cut the head at the frame's edge.
      o.frustumCulled = false;
    }
  });
  const B = c.bones;
  B.spine.rotation.x = -LEAN * 0.45;
  B.chest.rotation.x = -LEAN * 0.55;
  root.updateMatrixWorld(true);
  for (const side of ['L', 'R'] as const) {
    const upper = B[`upperArm_${side}`];
    const fore = B[`forearm_${side}`];
    const hand = B[`hand_${side}`];
    if (!upper || !fore || !hand) continue;
    const s = upper.getWorldPosition(V());
    const t = WRIST[side];
    // Elbows out to the side and back, like leaning on the forearms' heels. Its left is the scene's +x.
    const out = side === 'L' ? 1 : -1;
    const e = elbow(s, t, fore.position.length(), hand.position.length(), s.clone().add(V(out * 0.5, -0.1, -0.45)));
    aim(upper, fore.position, e);
    aim(fore, hand.position, t);
    // The hand flat on the top, fingers forward.
    aim(hand, hand.position, t.clone().add(V(out * 0.02, -0.03, 0.1)));
  }
  const head = B.head;
  const neckQ = new THREE.Quaternion();
  const headLook = new THREE.Quaternion();
  const want = V();
  const fwd = V();
  return {
    object: root,
    update(dt, camera, time) {
      if (!head?.parent) return;
      head.updateWorldMatrix(true, false);
      const pos = head.getWorldPosition(_a);
      want.copy(camera.position).sub(pos).normalize();
      _b.copy(TABLE_FOCUS).sub(pos).normalize();
      want.lerp(_b, 0.45).normalize();
      want.y += Math.sin(time * 0.6) * 0.015;
      head.parent.getWorldQuaternion(neckQ);
      fwd.set(0, 0, -1).applyQuaternion(neckQ);
      // The turn in the neck's space, no wider than HEAD_MAX.
      const turn = new THREE.Quaternion().setFromUnitVectors(fwd, want.normalize());
      const angle = fwd.angleTo(want);
      if (angle > HEAD_MAX) turn.slerp(new THREE.Quaternion(), 1 - HEAD_MAX / angle);
      headLook.copy(neckQ).invert().multiply(turn).multiply(neckQ);
      head.quaternion.slerp(headLook, 1 - Math.exp(-dt * 2.5));
    },
    dispose() {
      c.dispose();
    },
  };
}
