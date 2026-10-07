// The Scene view's camera as in Unity (PF-6 Revisions 01, etapa 3; it replaces the free camera of the fase 3):
// - right button held: WASD and Q/E fly, the mouse looks around, Shift goes faster, the wheel changes the speed
//   (the pointer is locked only while the button is held, so the cursor stays free for the panels and the gizmo);
// - Alt + left drag: orbits around the pivot (the selection's middle, or the point ahead);
// - middle drag (and left drag with the hand tool, Q): pans;
// - the wheel: dollies toward what's under the cursor;
// - F, a double click in the Hierarchy and the orientation gizmo move it smoothly (frame, axis views);
// - perspective or orthographic (the orientation gizmo's middle).
// While the map is played inside the editor (etapa 4) it's off (`enabled`): no key, button or wheel moves it.
// The numbers are client/editor/cameraMath.ts; this is the mouse and the keys.
import * as THREE from 'three';
import { blend, cloneState, dolly, fly, frame, look, lookAt, orbit, orthoHalfHeight, pan, pivotOf, unitsPerPixel, axisView, type CameraState, type ViewAxis } from './cameraMath';
import { isTextField } from './shortcuts';

const LOOK = 0.0025;
const ORBIT = 0.006;
const BASE_SPEED = 12;
const FAST = 3.5;
const TWEEN = 0.25;

/** Whether the keyboard is busy with a text field (typing a name shouldn't fly the camera or fire shortcuts). */
export const typing = () => isTextField(document.activeElement as HTMLElement | null);

export class SceneCamera {
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 1000);
  state: CameraState = { position: new THREE.Vector3(), yaw: 0, pitch: -0.35, distance: 15 };
  orthographic = false;
  private keys = new Set<string>();
  private looking = false;
  private dragging: 'orbit' | 'pan' | null = null;
  private dragCenter = new THREE.Vector3();
  private last = { x: 0, y: 0 };
  private speed = BASE_SPEED;
  private tween: { from: CameraState; to: CameraState; t: number } | null = null;
  private off: (() => void)[] = [];
  private on = true;
  /** The orbit's center: the selection's middle (null: the pivot ahead). */
  orbitCenter: () => THREE.Vector3 | null = () => null;
  /** The hand tool (Q) is on: the left button pans. */
  hand: () => boolean = () => false;
  /** Perspective and orthographic switched (the gizmo and the picking follow the camera drawn). */
  onProjection: (camera: THREE.Camera) => void = () => {};

  constructor(
    readonly persp: THREE.PerspectiveCamera,
    private readonly canvas: HTMLElement,
  ) {
    persp.rotation.order = 'YXZ';
    this.ortho.rotation.order = 'YXZ';
    const on = (t: EventTarget, type: string, f: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, f, opts);
      this.off.push(() => t.removeEventListener(type, f, opts));
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (!this.on) return;
      if (e.key === 'Alt') e.preventDefault(); // Alt alone would take the keyboard to the browser's menu.
      if (typing() || e.ctrlKey || e.metaKey) return;
      this.keys.add(e.code);
    });
    on(window, 'keyup', (e: KeyboardEvent) => {
      if (e.key === 'Alt') e.preventDefault();
      this.keys.delete(e.code);
    });
    on(window, 'blur', () => {
      this.keys.clear();
      this.stopLooking();
      this.dragging = null;
    });
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    // The middle button's autoscroll stays off over the view.
    on(canvas, 'mousedown', (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    });
    on(canvas, 'pointerdown', (e: PointerEvent) => {
      if (!this.on) return;
      if (e.button === 2) {
        this.tween = null;
        this.looking = true;
        // After this press's other listeners (the gizmo captures the pointer, which a pending lock forbids).
        setTimeout(() => {
          if (!this.looking) return;
          const lock = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
          lock?.catch?.(() => {}); // Refused (no focus, headless): looking still works from the mouse's moves.
        }, 0);
        return;
      }
      const orbiting = e.button === 0 && e.altKey;
      const panning = e.button === 1 || (e.button === 0 && !e.altKey && this.hand());
      if (!orbiting && !panning) return;
      e.preventDefault();
      this.tween = null;
      this.dragging = orbiting ? 'orbit' : 'pan';
      this.dragCenter = (orbiting && this.orbitCenter()) || pivotOf(this.state);
      this.last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
    });
    on(canvas, 'pointermove', (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      if (this.dragging === 'orbit') this.state = orbit(this.state, this.dragCenter, -dx * ORBIT, -dy * ORBIT);
      else this.state = pan(this.state, dx, dy, unitsPerPixel(this.state.distance, this.persp.fov, canvas.clientHeight));
    });
    const endDrag = (e: PointerEvent) => {
      if (e.button === 2) this.stopLooking();
      if (this.dragging && (e.button === 0 || e.button === 1)) this.dragging = null;
    };
    on(window, 'pointerup', endDrag);
    on(canvas, 'pointercancel', () => (this.dragging = null));
    on(window, 'mousemove', (e: MouseEvent) => {
      if (!this.looking) return;
      this.state = look(this.state, -e.movementX * LOOK, -e.movementY * LOOK);
    });
    on(
      canvas,
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        if (!this.on) return;
        if (this.looking) {
          this.speed = THREE.MathUtils.clamp(this.speed * (e.deltaY > 0 ? 0.85 : 1.18), 1, 200);
          return;
        }
        this.tween = null;
        const r = canvas.getBoundingClientRect();
        const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        this.state = dolly(this.state, ndc, dy, { fov: this.persp.fov, aspect: this.persp.aspect, ortho: this.orthographic });
      },
      { passive: false },
    );
  }

  private stopLooking() {
    if (!this.looking) return;
    this.looking = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Whether it listens to the mouse and the keys (off while the map is played). */
  get enabled() {
    return this.on;
  }

  set enabled(v: boolean) {
    if (v === this.on) return;
    this.on = v;
    if (v) return;
    this.keys.clear();
    this.stopLooking();
    this.dragging = null;
    this.tween = null;
  }

  /** Back to a view kept before (Stop puts the editor back where it was): at once, in its projection. */
  restore(state: CameraState, orthographic: boolean) {
    this.tween = null;
    this.state = cloneState(state);
    if (orthographic !== this.orthographic) this.toggleProjection();
    else this.apply();
  }

  /** The right button is held (WASD and Q/E are the camera's). */
  get flying() {
    return this.looking;
  }

  /** The camera drawn now. */
  get active(): THREE.Camera {
    return this.orthographic ? this.ortho : this.persp;
  }

  /** Looks at `target` from `from` (at once). */
  place(from: THREE.Vector3, target: THREE.Vector3) {
    this.tween = null;
    this.state = lookAt(from, target);
    this.apply();
  }

  /** Goes smoothly to another view. */
  goTo(to: CameraState) {
    this.tween = { from: cloneState(this.state), to, t: 0 };
  }

  /** Brings the box in front, at a distance that fits it (F). */
  frame(box: THREE.Box3) {
    if (box.isEmpty()) return;
    this.goTo(frame(this.state, box, this.persp.fov, this.persp.aspect));
  }

  /** Looks from one axis' side (the orientation gizmo). */
  view(axis: ViewAxis) {
    this.goTo(axisView(this.state, axis));
  }

  /** Perspective ⇄ orthographic (the same size at the pivot). */
  toggleProjection() {
    this.orthographic = !this.orthographic;
    this.apply();
    this.onProjection(this.active);
  }

  update(dt: number) {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / TWEEN);
      const e = 1 - (1 - tw.t) ** 3;
      this.state = tw.t >= 1 ? cloneState(tw.to) : blend(tw.from, tw.to, e);
      if (tw.t >= 1) this.tween = null;
    }
    if (this.looking) {
      const k = this.keys;
      const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      const u = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
      const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? FAST : 1;
      if (f || s || u) this.state = fly(this.state, f, s, u, this.speed * fast * dt);
    }
    this.apply();
  }

  /** Both cameras where the state says (the orthographic one as big as the perspective one at the pivot). */
  private apply() {
    const { position, yaw, pitch, distance } = this.state;
    this.persp.position.copy(position);
    this.persp.rotation.set(pitch, yaw, 0);
    this.persp.updateMatrixWorld();
    if (!this.orthographic) return;
    const o = this.ortho;
    o.position.copy(position);
    o.rotation.set(pitch, yaw, 0);
    const h = orthoHalfHeight(distance, this.persp.fov);
    const w = h * this.persp.aspect;
    if (o.top !== h || o.right !== w) {
      o.left = -w;
      o.right = w;
      o.top = h;
      o.bottom = -h;
      o.updateProjectionMatrix();
    }
    o.updateMatrixWorld();
  }

  /** The point the camera orbits and zooms about. */
  get pivot() {
    return pivotOf(this.state);
  }

  dispose() {
    for (const f of this.off) f();
  }
}
