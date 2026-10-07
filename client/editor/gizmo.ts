// The editor's gizmo: three's TransformControls on a stand-in handle placed where the selection sits. Arrows
// move, rings turn, cubes scale, snapping to a 0.5 m grid and 15° steps; holding Shift snaps nothing. It never
// edits the data itself: it tells where the handle went while dragging (to preview) and when it's let go (to
// commit an undoable edit).
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export const GRID = 0.5;
export const STEP = THREE.MathUtils.degToRad(15);

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface GizmoTarget {
  /** Where the handle starts (world). */
  world: THREE.Matrix4;
  /** What it may do: turning and scaling are off for what can't. */
  rotate: boolean;
  scale: boolean;
  /** Only along one axis of its own frame (a wall's end), else free in the world's axes. */
  axis?: 'x' | 'z' | 'y';
}

export class Gizmo {
  readonly controls: TransformControls;
  readonly handle = new THREE.Object3D();
  private target: GizmoTarget | null = null;
  private start = new THREE.Matrix4();
  private wanted: GizmoMode = 'translate';
  private shift = false;
  private off: (() => void)[] = [];
  /** While dragging: the handle's world matrix now and where it started. */
  onDrag: (world: THREE.Matrix4, start: THREE.Matrix4) => void = () => {};
  /** Let go: where it started and where it ended (equal: a click on the gizmo that moved nothing). */
  onEnd: (start: THREE.Matrix4, world: THREE.Matrix4) => void = () => {};

  constructor(camera: THREE.Camera, canvas: HTMLElement, scene: THREE.Scene) {
    this.handle.name = 'alca';
    scene.add(this.handle);
    this.controls = new TransformControls(camera, canvas);
    this.controls.setSize(0.9);
    const helper = this.controls.getHelper();
    helper.name = 'gizmo';
    scene.add(helper);
    this.snap(true);
    this.controls.addEventListener('mouseDown', () => {
      this.handle.updateMatrixWorld(true);
      this.start.copy(this.handle.matrixWorld);
    });
    this.controls.addEventListener('objectChange', () => {
      this.handle.updateMatrixWorld(true);
      this.onDrag(this.handle.matrixWorld.clone(), this.start.clone());
    });
    this.controls.addEventListener('mouseUp', () => {
      this.handle.updateMatrixWorld(true);
      this.onEnd(this.start.clone(), this.handle.matrixWorld.clone());
    });
    const key = (e: KeyboardEvent) => {
      const s = e.shiftKey;
      if (s === this.shift) return;
      this.shift = s;
      this.snap(!s);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    this.off.push(() => window.removeEventListener('keydown', key), () => window.removeEventListener('keyup', key));
  }

  /** Grid and 15° steps on or off (Shift held: off). */
  private snap(on: boolean) {
    this.controls.setTranslationSnap(on ? GRID : null);
    this.controls.setRotationSnap(on ? STEP : null);
    this.controls.setScaleSnap(on ? 0.1 : null);
  }

  /** Whether the pointer is over the gizmo (a click there is for it, not for picking). */
  hot() {
    return this.controls.axis !== null || this.controls.dragging;
  }

  get dragging() {
    return this.controls.dragging;
  }

  get mode() {
    return this.wanted;
  }

  setMode(m: GizmoMode) {
    this.wanted = m;
    this.apply();
  }

  /** Puts the handle on a target (null: hides the gizmo). */
  attach(t: GizmoTarget | null) {
    this.target = t;
    if (!t) {
      this.controls.detach();
      return;
    }
    t.world.decompose(this.handle.position, this.handle.quaternion, this.handle.scale);
    this.handle.updateMatrixWorld(true);
    this.controls.attach(this.handle);
    this.apply();
  }

  private apply() {
    const t = this.target;
    if (!t) return;
    const mode: GizmoMode = (this.wanted === 'rotate' && !t.rotate) || (this.wanted === 'scale' && !t.scale) ? 'translate' : this.wanted;
    this.controls.setMode(mode);
    // One axis of its own frame (a wall's end slides along the wall), or the world's.
    this.controls.setSpace(t.axis ? 'local' : 'world');
    this.controls.showX = !t.axis || t.axis === 'x';
    this.controls.showY = !t.axis || t.axis === 'y';
    this.controls.showZ = !t.axis || t.axis === 'z';
  }

  dispose() {
    for (const f of this.off) f();
    this.controls.detach();
    this.controls.getHelper().removeFromParent();
    this.controls.dispose();
    this.handle.removeFromParent();
  }
}
