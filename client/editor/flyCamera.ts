// The editor's free camera: WASD moves, Q and E go down and up, dragging with the right button looks around
// (the pointer is locked only while the button is held, so the cursor stays free for the panels and the gizmo),
// Shift goes faster and the wheel changes the speed.
import * as THREE from 'three';

const LOOK = 0.0025;
const BASE_SPEED = 12;
const FAST = 3.5;

/** Whether the keyboard is busy with a form field (typing a name shouldn't fly the camera). */
export const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export class FlyCamera {
  private keys = new Set<string>();
  private looking = false;
  private speed = BASE_SPEED;
  yaw = 0;
  pitch = -0.35;
  private off: (() => void)[] = [];

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLElement,
  ) {
    camera.rotation.order = 'YXZ';
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, f: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, f, opts);
      this.off.push(() => t.removeEventListener(type, f, opts));
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (typing() || e.ctrlKey || e.metaKey) return;
      this.keys.add(e.code);
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    on(canvas, 'pointerdown', (e: PointerEvent) => {
      if (e.button !== 2) return;
      this.looking = true;
      canvas.requestPointerLock?.();
    });
    on(window, 'pointerup', (e: PointerEvent) => {
      if (e.button !== 2 || !this.looking) return;
      this.looking = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    });
    on(window, 'mousemove', (e: MouseEvent) => {
      if (!this.looking) return;
      this.yaw -= e.movementX * LOOK;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * LOOK, -1.55, 1.55);
    });
    on(
      canvas,
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        this.speed = THREE.MathUtils.clamp(this.speed * (e.deltaY > 0 ? 0.85 : 1.18), 2, 120);
      },
      { passive: false },
    );
  }

  /** Looks at `target` from `from`. */
  place(from: THREE.Vector3, target: THREE.Vector3) {
    this.camera.position.copy(from);
    const d = target.clone().sub(from);
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.apply();
  }

  /** Brings the camera to look at a box from a distance that fits it. */
  frame(box: THREE.Box3) {
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(2, box.getSize(new THREE.Vector3()).length() / 2);
    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(r * 1.6);
    this.place(c.clone().add(back).add(new THREE.Vector3(0, r * 0.8, 0)), c);
  }

  update(dt: number) {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const u = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (f || s || u) {
      const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? FAST : 1;
      const fwd = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const v = fwd.multiplyScalar(f).add(right.multiplyScalar(s)).add(new THREE.Vector3(0, u, 0));
      if (v.lengthSq() > 0) this.camera.position.addScaledVector(v.normalize(), this.speed * fast * dt);
    }
    this.apply();
  }

  private apply() {
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  dispose() {
    for (const f of this.off) f();
  }
}
