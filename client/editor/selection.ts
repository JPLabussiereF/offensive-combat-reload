// What's selected in the editor (pieces, a marker or one end of a wall) and picking with a click: a ray from the
// camera through the cursor against the pieces, the markers and the handles, the nearest wins. Ctrl (or Shift)
// held adds the piece to the selection or takes it out (Revisions 01: several pieces, as in Unity's Hierarchy);
// the last one picked is the active one (the gizmo holds it). Every selected piece shows a box around it (a
// group's around everything in it).
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

/** The most boxes drawn at once (a big selection shows the first ones). */
const MAX_BOXES = 64;

export class Selection {
  /** Everything selected, the active one last. Only pieces come several at a time. */
  items: Selected[] = [];
  private boxes: THREE.Box3Helper[] = [];
  private ray = new THREE.Raycaster();
  private down: { x: number; y: number; hot: boolean; add: boolean } | null = null;
  private off: (() => void)[] = [];
  /** The selection changed (by a click or by code). */
  onChange: (s: Selected | null) => void = () => {};

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLElement,
    /** What can be picked, in priority order (handles before markers before pieces). */
    private readonly targets: () => THREE.Object3D[],
    /** Whether the pointer is on the gizmo (a click there is the gizmo's). */
    private readonly gizmoHot: () => boolean,
    /** The box around what's selected (null: nothing to show). */
    private readonly boundsOf: (s: Selected) => THREE.Box3 | null,
  ) {
    // The batched pieces' own meshes sit on a layer no camera draws (P46): the ray sees every layer.
    this.ray.layers.enableAll();
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) this.down = { x: e.clientX, y: e.clientY, hot: this.gizmoHot(), add: e.ctrlKey || e.metaKey || e.shiftKey };
    };
    const onUp = (e: PointerEvent) => {
      const d = this.down;
      this.down = null;
      if (e.button !== 0 || !d || d.hot || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      const s = this.pick(e.clientX, e.clientY);
      if (d.add && s?.kind === 'peca') this.toggle(s);
      else if (!d.add || s) this.set(s);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    this.off.push(() => canvas.removeEventListener('pointerdown', onDown), () => canvas.removeEventListener('pointerup', onUp));
  }

  /** The active one (the last picked), or null. */
  get current(): Selected | null {
    return this.items[this.items.length - 1] ?? null;
  }

  /** The selected pieces' ids, the active one last. */
  get pieceIds(): string[] {
    return this.items.filter((s) => s.kind === 'peca').map((s) => (s as { id: string }).id);
  }

  private ndc(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  /** What's under the cursor. */
  pick(x: number, y: number): Selected | null {
    this.ray.setFromCamera(this.ndc(x, y), this.camera);
    for (const t of this.targets()) {
      // Markers and handles drawn since the last frame have no world matrix yet.
      t.updateMatrixWorld(true);
      const hits = this.ray.intersectObject(t, true).filter((h) => h.object.visible && !(h.object as THREE.Mesh & { isLine?: boolean }).isLine);
      const hit = hits.find((h) => selectedOf(h.object));
      if (hit) return selectedOf(hit.object);
    }
    return null;
  }

  /** Where the cursor's ray meets the map (or the ground plane), for dropping new pieces. */
  dropPoint(x: number, y: number, map: THREE.Object3D): THREE.Vector3 {
    this.ray.setFromCamera(this.ndc(x, y), this.camera);
    const hit = this.ray.intersectObject(map, true).find((h) => h.object.visible && !h.object.userData.ajuda);
    if (hit && hit.distance < 150) return hit.point;
    const ground = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return ground && ground.distanceTo(this.ray.ray.origin) < 150 ? ground : this.ray.ray.at(12, new THREE.Vector3());
  }

  /** One thing selected (null: nothing). */
  set(s: Selected | null) {
    this.items = s ? [s] : [];
    this.changed();
  }

  /** Several pieces selected, `active` (one of them) last. */
  setMany(list: Selected[], active?: Selected | null) {
    const unique = list.filter((s, i) => list.findIndex((x) => sameSelection(x, s)) === i);
    if (active) {
      const i = unique.findIndex((x) => sameSelection(x, active));
      if (i >= 0) unique.push(...unique.splice(i, 1));
    }
    this.items = unique;
    this.changed();
  }

  /** A piece added to the selection, or taken out of it (a marker or a handle replaces it). */
  toggle(s: Selected) {
    if (s.kind !== 'peca' || this.items.some((x) => x.kind !== 'peca')) return this.set(s);
    const i = this.items.findIndex((x) => sameSelection(x, s));
    if (i >= 0) this.items.splice(i, 1);
    else this.items.push(s);
    this.changed();
  }

  has(s: Selected) {
    return this.items.some((x) => sameSelection(x, s));
  }

  private changed() {
    this.refresh();
    this.onChange(this.current);
  }

  /** Redraws the boxes (pieces were rebuilt or moved). */
  refresh() {
    let n = 0;
    for (const s of this.items) {
      if (n >= MAX_BOXES) break;
      const box = this.boundsOf(s);
      if (!box || box.isEmpty()) continue;
      let h = this.boxes[n];
      if (!h) {
        h = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0xffd400));
        (h.material as THREE.LineBasicMaterial).depthTest = false;
        h.renderOrder = 20;
        this.scene.add(h);
        this.boxes.push(h);
      }
      h.box.copy(box);
      // The active one in full yellow, the others paler.
      (h.material as THREE.LineBasicMaterial).color.set(sameSelection(s, this.current) ? 0xffd400 : 0xb39a3a);
      h.visible = true;
      n++;
    }
    for (let i = n; i < this.boxes.length; i++) this.boxes[i].visible = false;
  }

  dispose() {
    for (const f of this.off) f();
    for (const h of this.boxes) h.removeFromParent();
  }
}
