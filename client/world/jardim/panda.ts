// The panda of the bamboo valley: sitting against the gardener's house (jardim/bambu.ts), legs out in
// front, chewing on a stalk of bamboo it holds in both paws. Now and then it lifts the stalk to its mouth and
// bites, its head nodding as it chews. One vertex-colored mesh for the body and two moving parts (the head,
// the arms with the bamboo); it collides as one box.
import * as THREE from 'three';
import { mergeColoredParts, toonGradient, type ColoredPart } from '../../render/materials';
import type { Ctx } from './kit';

const WHITE = 0xf2efe6;
const BLACK = 0x23222a;
const PAD = 0x4a4650;
const BAMBOO = 0x7cb342;
const NODE = 0x557a2b;
const LEAF = 0x5b9a35;

/** Ellipsoid part: center, radii, color, optional tilt. */
const blob = (pos: [number, number, number], r: [number, number, number], color: number, rot?: [number, number, number]): ColoredPart => ({ geo: new THREE.SphereGeometry(1, 14, 10), color, pos, scale: r, rot });

/** A panda sitting at (x, z) facing `yaw` (0 = +Z); `bamboo: false` leaves its paws empty (the sticker studio). */
export function panda(c: Ctx, x: number, z: number, yaw: number, { bamboo = true }: { bamboo?: boolean } = {}) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const build = (parts: ColoredPart[]) => {
    const geo = mergeColoredParts(parts);
    parts.forEach((p) => p.geo.dispose());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  };
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = yaw;

  // Body: a round white belly sitting on the ground, the black band over the shoulders, the hind legs
  // stretched out in front with their soles showing.
  const body = build([
    blob([0, 0.46, -0.04], [0.5, 0.48, 0.44], WHITE),
    blob([0, 0.86, -0.06], [0.42, 0.2, 0.36], BLACK),
    blob([0, 0.3, -0.12], [0.46, 0.3, 0.42], WHITE),
    ...[-1, 1].flatMap((s): ColoredPart[] => [
      blob([s * 0.3, 0.17, 0.2], [0.18, 0.17, 0.3], BLACK, [0.1, s * -0.25, 0]),
      blob([s * 0.38, 0.2, 0.47], [0.14, 0.15, 0.08], BLACK, [0, s * -0.3, 0]),
      blob([s * 0.385, 0.2, 0.52], [0.09, 0.1, 0.03], PAD, [0, s * -0.3, 0]),
    ]),
    // A stub of a tail behind.
    blob([0, 0.14, -0.48], [0.09, 0.08, 0.06], WHITE),
  ]);
  root.add(body);

  // Head: big and round (a cub's proportions), round black ears, droopy eye patches with the eyes closed in
  // two happy arcs, pink cheeks, a round muzzle with its nose and a little "w" of a mouth.
  const head = new THREE.Group();
  head.position.set(0, 1.12, 0.04);
  head.scale.setScalar(1.12);
  const arc = (pos: [number, number, number], r: number, color: number, rot: [number, number, number]): ColoredPart => ({ geo: new THREE.TorusGeometry(r, r * 0.24, 4, 10, Math.PI), color, pos, rot });
  head.add(
    build([
      blob([0, 0, 0], [0.31, 0.27, 0.27], WHITE),
      blob([0, -0.075, 0.2], [0.15, 0.1, 0.12], WHITE),
      blob([0, -0.03, 0.325], [0.042, 0.03, 0.028], BLACK),
      ...[-1, 1].flatMap((s): ColoredPart[] => [
        blob([s * 0.2, 0.2, -0.02], [0.1, 0.1, 0.06], BLACK),
        blob([s * 0.2, 0.2, 0.025], [0.05, 0.05, 0.02], PAD),
        // The patch leans out and down (a sleepy, gentle look), the closed eye drawn on it in white.
        blob([s * 0.12, 0.025, 0.205], [0.082, 0.07, 0.05], BLACK, [0, s * 0.25, s * -0.6]),
        arc([s * 0.122, 0.018, 0.258], 0.034, WHITE, [-0.15, s * 0.3, 0]),
        blob([s * 0.2, -0.085, 0.185], [0.05, 0.028, 0.02], 0xf2a2b6, [0, s * 0.6, 0]),
        arc([s * 0.021, -0.1, 0.322], 0.021, BLACK, [0, 0, Math.PI]),
      ]),
    ]),
  );
  root.add(head);

  // Arms, from the shoulders to the paws held in front of the chest, and the stalk of bamboo in them
  // (a few leaves at its tip: that's what it's after).
  const arms = new THREE.Group();
  arms.position.set(0, 0.86, 0.02);
  const stalk = (a: THREE.Vector3, b: THREE.Vector3, r: number): ColoredPart => {
    const d = b.clone().sub(a);
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    return { geo: new THREE.CylinderGeometry(r * 0.9, r, d.length(), 7), color: BAMBOO, pos: [m.x, m.y, m.z], rot: [e.x, e.y, e.z] };
  };
  // Held to one side, so the stalk reaches the corner of its mouth and the face shows.
  const bottom = new THREE.Vector3(0.13, -0.5, 0.5);
  const top = new THREE.Vector3(0.12, 0.62, 0.32);
  const along = (t: number) => bottom.clone().lerp(top, t);
  arms.add(
    build([
      ...[-1, 1].flatMap((s): ColoredPart[] => [
        blob([s * 0.24, -0.06, 0.18], [0.13, 0.13, 0.27], BLACK, [0.5, s * 0.45, 0]),
        blob([s * 0.07, -0.05, 0.4], [0.1, 0.09, 0.09], BLACK),
      ]),
      ...(bamboo
        ? [
            stalk(bottom, top, 0.035),
            ...[0.15, 0.42, 0.7].map((t): ColoredPart => {
              const p = along(t);
              return { geo: new THREE.CylinderGeometry(0.042, 0.042, 0.025, 7), color: NODE, pos: [p.x, p.y, p.z], rot: [-0.18, 0, 0] };
            }),
            ...[0.4, 2.2, 4.1].map((a, k): ColoredPart => {
              const p = along(1).add(new THREE.Vector3(Math.cos(a) * 0.08, -0.04 - k * 0.04, Math.sin(a) * 0.08));
              return { geo: new THREE.SphereGeometry(1, 6, 4), color: LEAF, pos: [p.x, p.y, p.z], scale: [0.03, 0.012, 0.13], rot: [0.5, a, 0.3] };
            }),
          ]
        : []),
    ]),
  );
  root.add(arms);
  c.scene.add(root);
  c.b.cuboidCollider(new THREE.Vector3(x, 0.65, z), new THREE.Vector3(0.55, 0.65, 0.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), 'wood');

  // Eating: a bite every few seconds (the stalk comes up to the mouth, the head leans into it), then a
  // while chewing with the stalk lowered.
  let t = Math.random() * 4;
  c.animate((dt) => {
    t += dt;
    const cycle = t % 4.5;
    const bite = cycle < 1.2 ? Math.sin((cycle / 1.2) * Math.PI) : 0;
    arms.rotation.x = -0.32 * bite + 0.04 * Math.sin(t * 0.8);
    const chewing = cycle >= 0.6 && cycle < 4;
    head.rotation.x = 0.18 * bite + (chewing ? 0.05 * Math.sin(t * 13) : 0);
    head.rotation.z = 0.06 * Math.sin(t * 0.7);
    head.position.y = 1.12 + (chewing ? 0.01 * Math.sin(t * 13) : 0);
  });
}
