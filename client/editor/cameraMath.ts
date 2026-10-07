// The Scene view's camera as numbers (PF-6 Revisions 01, etapa 3), without a screen: Unity's Scene camera is a
// place, a heading (yaw and pitch, the camera's YXZ order) and a distance to its pivot, the point it looks at
// (straight ahead, `distance` away). Flying moves the place and the pivot together; orbiting turns the place
// around a center; panning slides it across the view; the wheel dollies toward the cursor; framing puts a box
// in front at a distance that fits it; the orientation gizmo's axes look along one axis. client/editor/
// sceneCamera.ts drives it from the mouse and the keys (client/tests/editorCamera.test.ts runs it as is).
import * as THREE from 'three';

export interface CameraState {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  /** How far ahead the pivot is (the orbit's center and the zoom's scale). */
  distance: number;
}

/** Looking straight up or down at most (the top and bottom views). */
export const PITCH_LIMIT = Math.PI / 2;
export const MIN_DISTANCE = 0.3;
export const MAX_DISTANCE = 1500;

const Y = new THREE.Vector3(0, 1, 0);
const clampD = (d: number) => THREE.MathUtils.clamp(d, MIN_DISTANCE, MAX_DISTANCE);

/** Where the camera looks (unit). */
export function forwardOf(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

/** The screen's right in the world (unit, level). */
export function rightOf(yaw: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.cos(yaw), 0, -Math.sin(yaw));
}

/** The screen's up in the world (unit). */
export function upOf(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch));
}

export const cloneState = (s: CameraState): CameraState => ({ position: s.position.clone(), yaw: s.yaw, pitch: s.pitch, distance: s.distance });

/** The point the camera looks at, `distance` ahead. */
export function pivotOf(s: CameraState): THREE.Vector3 {
  return forwardOf(s.yaw, s.pitch).multiplyScalar(s.distance).add(s.position);
}

/** The camera looking at `target` from `from`. */
export function lookAt(from: THREE.Vector3, target: THREE.Vector3): CameraState {
  const d = target.clone().sub(from);
  return { position: from.clone(), yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)), distance: clampD(d.length()) };
}

/** The camera at `distance` from `pivot`, looking at it with this heading. */
export function aroundPivot(pivot: THREE.Vector3, yaw: number, pitch: number, distance: number): CameraState {
  const d = clampD(distance);
  return { position: forwardOf(yaw, pitch).multiplyScalar(-d).add(pivot), yaw, pitch, distance: d };
}

/** Mouse look while flying: the heading turns, the place stays (dragging right turns right). */
export function look(s: CameraState, dYaw: number, dPitch: number): CameraState {
  return { ...cloneState(s), yaw: s.yaw + dYaw, pitch: THREE.MathUtils.clamp(s.pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT) };
}

/**
 * Alt + left drag: the camera goes around `center` (the selection's middle, or its own pivot) by these turns,
 * its heading turning with it (what it looked at stays where it was on the screen, as in Unity).
 */
export function orbit(s: CameraState, center: THREE.Vector3, dYaw: number, dPitch: number): CameraState {
  const pitch = THREE.MathUtils.clamp(s.pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT);
  const dp = pitch - s.pitch;
  const offset = s.position.clone().sub(center);
  offset.applyAxisAngle(rightOf(s.yaw), dp).applyAxisAngle(Y, dYaw);
  return { position: offset.add(center), yaw: s.yaw + dYaw, pitch, distance: s.distance };
}

/** World units a pixel of the view covers at the pivot's depth (`height` px tall, vertical field `fov` degrees). */
export function unitsPerPixel(distance: number, fov: number, height: number): number {
  return (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, height);
}

/** Middle drag (or the hand tool): the view slides with the cursor, by pixels (screen y grows down). */
export function pan(s: CameraState, dx: number, dy: number, perPixel: number): CameraState {
  const move = rightOf(s.yaw).multiplyScalar(-dx * perPixel).add(upOf(s.yaw, s.pitch).multiplyScalar(dy * perPixel));
  return { ...cloneState(s), position: s.position.clone().add(move) };
}

/** Flying: a step along the view (forward, right, up: -1..1 each), `amount` metres. */
export function fly(s: CameraState, f: number, r: number, u: number, amount: number): CameraState {
  const v = forwardOf(s.yaw, s.pitch).multiplyScalar(f).add(rightOf(s.yaw).multiplyScalar(r)).add(new THREE.Vector3(0, u, 0));
  if (v.lengthSq() === 0) return cloneState(s);
  return { ...cloneState(s), position: s.position.clone().addScaledVector(v.normalize(), amount) };
}

/** How the wheel scales the distance: a notch (deltaY 100) is about 16%. */
export const wheelFactor = (deltaY: number) => Math.exp(deltaY * 0.0015);

/** The direction through a point of the view (ndc: -1..1, y up) for a perspective camera. */
export function rayThrough(s: CameraState, ndc: { x: number; y: number }, fov: number, aspect: number): THREE.Vector3 {
  const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  return forwardOf(s.yaw, s.pitch)
    .add(rightOf(s.yaw).multiplyScalar(ndc.x * t * aspect))
    .add(upOf(s.yaw, s.pitch).multiplyScalar(ndc.y * t))
    .normalize();
}

/**
 * The wheel: closer to (or farther from) what's under the cursor. In perspective the camera moves along the
 * cursor's ray as much as the pivot's depth changes; in orthographic the view's size changes and slides so the
 * point under the cursor stays put.
 */
export function dolly(s: CameraState, ndc: { x: number; y: number }, deltaY: number, o: { fov: number; aspect: number; ortho: boolean }): CameraState {
  const d1 = clampD(s.distance * wheelFactor(deltaY));
  const out = cloneState(s);
  out.distance = d1;
  if (o.ortho) {
    const t = Math.tan(THREE.MathUtils.degToRad(o.fov) / 2);
    const k = 1 - d1 / s.distance;
    out.position
      .addScaledVector(rightOf(s.yaw), ndc.x * s.distance * t * o.aspect * k)
      .addScaledVector(upOf(s.yaw, s.pitch), ndc.y * s.distance * t * k)
      // The camera keeps its distance to the pivot: it moves along the view as the size changes.
      .addScaledVector(forwardOf(s.yaw, s.pitch), s.distance - d1);
    return out;
  }
  const ray = rayThrough(s, ndc, o.fov, o.aspect);
  const along = Math.max(0.25, ray.dot(forwardOf(s.yaw, s.pitch)));
  out.position.addScaledVector(ray, (s.distance - d1) / along);
  return out;
}

/** F (and a double click in the Hierarchy): the box in front, at a distance that fits it, same heading. */
export function frame(s: CameraState, box: THREE.Box3, fov: number, aspect: number): CameraState {
  if (box.isEmpty()) return cloneState(s);
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
  const half = THREE.MathUtils.degToRad(fov) / 2;
  const fit = Math.min(half, Math.atan(Math.tan(half) * aspect));
  return aroundPivot(c, s.yaw, s.pitch, r / Math.sin(fit));
}

/** An axis of the orientation gizmo: the camera looks from that side toward the pivot. */
export type ViewAxis = 'x' | '-x' | 'y' | '-y' | 'z' | '-z';

/** The heading that looks from `axis`'s side (y: from above, the top view). */
export function axisHeading(axis: ViewAxis): { yaw: number; pitch: number } {
  switch (axis) {
    case 'x':
      return { yaw: Math.PI / 2, pitch: 0 };
    case '-x':
      return { yaw: -Math.PI / 2, pitch: 0 };
    case 'y':
      return { yaw: 0, pitch: -PITCH_LIMIT };
    case '-y':
      return { yaw: 0, pitch: PITCH_LIMIT };
    case 'z':
      return { yaw: 0, pitch: 0 };
    case '-z':
      return { yaw: Math.PI, pitch: 0 };
  }
}

/** The view along an axis, around the same pivot and at the same distance. */
export function axisView(s: CameraState, axis: ViewAxis): CameraState {
  const h = axisHeading(axis);
  return aroundPivot(pivotOf(s), h.yaw, h.pitch, s.distance);
}

/** Between two views (t: 0..1), around their pivots, turning the short way. */
export function blend(a: CameraState, b: CameraState, t: number): CameraState {
  const pa = pivotOf(a);
  const pb = pivotOf(b);
  let dy = (b.yaw - a.yaw) % (Math.PI * 2);
  if (dy > Math.PI) dy -= Math.PI * 2;
  if (dy < -Math.PI) dy += Math.PI * 2;
  return aroundPivot(pa.lerp(pb, t), a.yaw + dy * t, THREE.MathUtils.lerp(a.pitch, b.pitch, t), THREE.MathUtils.lerp(a.distance, b.distance, t));
}

/** The orthographic view's half height that matches the perspective one at the pivot. */
export const orthoHalfHeight = (distance: number, fov: number) => distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
