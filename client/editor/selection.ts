// What's selected in the editor (a piece, a marker or one end of a wall) and picking it with a click: a ray from
// the camera through the cursor against the pieces' groups, the markers and the handles, the nearest wins. The
// selected piece shows a box around it.
import * as THREE from 'three';

export type Selected =
  | { kind: 'peca'; id: string }
  /** A marker (client/editor/markers.ts): its key names what it stands for in the map's data. */
  | { kind: 'marcador'; key: string }
  /** A handle of the selected piece (client/editor/linearHandles.ts). */
  | { kind: 'ponta'; id: string; key: string };

export const sameSelection = (a: Selected | null, b: Selected | null) => JSON.stringify(a) === JSON.stringify(b);

/** What a scene object stands for, from its userData (or its parents'). */
export function selectedOf(o: THREE.Object3D | null): Selected | null {
  for (let x = o; x; x = x.parent) {
    const u = x.userData;
    if (typeof u.ponta === 'string' && typeof u.pontaDe === 'string') return { kind: 'ponta', id: u.pontaDe, key: u.ponta };
    if (typeof u.marcador === 'string') return { kind: 'marcador', key: u.marcador };
    if (typeof u.peca === 'string') return { kind: 'peca', id: u.peca };
  }
  return null;
}

export class Selection {
  current: Selected | null = null;
  private box = new THREE.BoxHelper(new THREE.Object3D(), 0xffd400);
  private ray = new THREE.Raycaster();
  private down: { x: number; y: number; hot: boolean } | null = null;
  private off: (() => void)[] = [];
  /** The selection changed (by a click or by code). */
  onChange: (s: Selected | null) => void = () => {};

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLElement,
    /** What can be picked, in priority order (handles before markers before pieces). */
    private readonly targets: () => THREE.Object3D[],
    /** Whether the pointer is on the gizmo (a click there is the gizmo's). */
    private readonly gizmoHot: () => boolean,
    private readonly groupOf: (s: Selected) => THREE.Object3D | undefined,
  ) {
    this.box.visible = false;
    (this.box.material as THREE.LineBasicMaterial).depthTest = false;
    this.box.renderOrder = 20;
    scene.add(this.box);
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) this.down = { x: e.clientX, y: e.clientY, hot: this.gizmoHot() };
    };
    const onUp = (e: PointerEvent) => {
      const d = this.down;
      this.down = null;
      if (e.button !== 0 || !d || d.hot || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      this.set(this.pick(e.clientX, e.clientY));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    this.off.push(() => canvas.removeEventListener('pointerdown', onDown), () => canvas.removeEventListener('pointerup', onUp));
  }

  /** What's under the cursor. */
  pick(x: number, y: number): Selected | null {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    for (const t of this.targets()) {
      const hits = this.ray.intersectObject(t, true).filter((h) => h.object.visible && !(h.object as THREE.Mesh & { isLine?: boolean }).isLine);
      const hit = hits.find((h) => selectedOf(h.object));
      if (hit) return selectedOf(hit.object);
    }
    return null;
  }

  /** Where the cursor's ray meets the map (or the ground plane), for dropping new pieces. */
  dropPoint(x: number, y: number, map: THREE.Object3D): THREE.Vector3 {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(map, true).find((h) => h.object.visible && !h.object.userData.ajuda);
    if (hit && hit.distance < 150) return hit.point;
    const ground = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return ground && ground.distanceTo(this.ray.ray.origin) < 150 ? ground : this.ray.ray.at(12, new THREE.Vector3());
  }

  set(s: Selected | null) {
    this.current = s;
    this.refresh();
    this.onChange(s);
  }

  /** Redraws the box (the piece was rebuilt or moved). */
  refresh() {
    const g = this.current ? this.groupOf(this.current) : undefined;
    this.box.visible = !!g;
    if (g) {
      this.box.setFromObject(g);
      this.box.update();
    }
  }

  dispose() {
    for (const f of this.off) f();
    this.box.removeFromParent();
  }
}
