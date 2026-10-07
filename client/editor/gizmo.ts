// The editor's gizmo: three's TransformControls on a stand-in handle placed where the selection sits. Arrows
// move, rings turn, cubes scale. Revisions 01 (etapa 3) makes it Unity's: free by default, snapping (0.5 m and
// 15°, or the steps chosen) while Ctrl is held or always with the grid button (setSnap); its axes the active
// piece's (Local) or the world's (Global, setSpace); held on the active piece (Pivot) or in the middle of the
// selection (Center: the editor places the handle, client/editor/tools.ts). It never edits the data itself: it
// tells where the handle went while dragging (to preview) and when it's let go (to commit an undoable edit).
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { SnapSteps } from './tools';

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface GizmoTarget {
  /** Where the handle starts (world). */
  world: THREE.Matrix4;
  /** What it may do: turning and scaling are off for what can't. */
  rotate: boolean;
  scale: boolean;
  /** Only along one axis of its own frame (a wall's end), else free in the chosen axes. */
  axis?: 'x' | 'z' | 'y';
}

export class Gizmo {
  readonly controls: TransformControls;
  readonly handle = new THREE.Object3D();
  private target: GizmoTarget | null = null;
  private start = new THREE.Matrix4();
  private wanted: GizmoMode = 'translate';
  private space: 'local' | 'world' = 'world';
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
    this.setSnap({ move: null, turn: null, scale: null });
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
  }

  /** The steps it snaps to (null: free); taken at once, even in the middle of a drag. */
  setSnap(s: SnapSteps) {
    this.controls.setTranslationSnap(s.move);
    this.controls.setRotationSnap(s.turn);
    this.controls.setScaleSnap(s.scale);
  }

  /** Local (the handle's axes) or Global (the world's). */
  setSpace(space: 'local' | 'world') {
    this.space = space;
    this.apply();
  }

  /** The camera it's drawn and picked with (perspective or orthographic). */
  setCamera(camera: THREE.Camera) {
    this.controls.camera = camera;
  }

  /** Off while the camera has the left button (Alt held to orbit). */
  setEnabled(on: boolean) {
    if (this.controls.dragging) return;
    this.controls.enabled = on;
  }

  /** Whether the pointer is over the gizmo (a click there is for it, not for picking). */
  hot() {
    return this.controls.enabled && (this.controls.axis !== null || this.controls.dragging);
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
    // One axis of its own frame (a wall's end slides along the wall), or the axes chosen.
    this.controls.setSpace(t.axis ? 'local' : this.space);
    this.controls.showX = !t.axis || t.axis === 'x';
    this.controls.showY = !t.axis || t.axis === 'y';
    this.controls.showZ = !t.axis || t.axis === 'z';
  }

  dispose() {
    this.controls.detach();
    this.controls.getHelper().removeFromParent();
    this.controls.dispose();
    this.handle.removeFromParent();
  }
}
