// What's selected in the editor (pieces, a marker or one end of a wall) and picking with the left button: a click
// casts a ray from the camera through the cursor against the pieces, the markers and the handles, the nearest
// wins; Ctrl (or Shift) held adds the piece to the selection or takes it out (Revisions 01: several pieces, as in
// Unity's Hierarchy); the last one picked is the active one (the gizmo holds it). Dragging from anywhere but the
// gizmo draws a box (etapa 3): the pieces that touch it are selected (Shift adds them, Ctrl toggles each; the
// numbers are client/editor/boxSelect.ts). Every selected piece shows a box around it (a group's around
// everything in it).
import * as THREE from 'three';
import { combineBox, rectToNdc, type NdcRect } from './boxSelect';

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
/** How far the pointer goes before a press is a drag (px). */
const DRAG = 5;

export class Selection {
  /** Everything selected, the active one last. Only pieces come several at a time. */
  items: Selected[] = [];
  private boxes: THREE.Box3Helper[] = [];
  private ray = new THREE.Raycaster();
  private down: { x: number; y: number; hot: boolean; add: boolean; boxing: boolean } | null = null;
  private band: HTMLDivElement;
  private off: (() => void)[] = [];
  /** The selection changed (by a click or by code). */
  onChange: (s: Selected | null) => void = () => {};
  /** The pieces whose drawing touches a box on the view (ids). */
  boxPick: (r: NdcRect) => string[] = () => [];

  constructor(
    private readonly scene: THREE.Scene,
    /** The camera drawn now (perspective or orthographic). */
    private readonly camera: () => THREE.Camera,
    private readonly canvas: HTMLElement,
    /** What can be picked, in priority order (handles before markers before pieces). */
    private readonly targets: () => THREE.Object3D[],
    /** Whether the pointer is on the gizmo (a click there is the gizmo's). */
    private readonly gizmoHot: () => boolean,
    /** The box around what's selected (null: nothing to show). */
    private readonly boundsOf: (s: Selected) => THREE.Box3 | null,
    /** A left press that isn't the selection's (Alt to orbit, the hand tool). */
    private readonly ignore: (e: PointerEvent) => boolean = () => false,
  ) {
    // The batched pieces' own meshes sit on a layer no camera draws (P46): the ray sees every layer.
    this.ray.layers.enableAll();
    this.band = document.createElement('div');
    this.band.className = 'ed-boxsel';
    this.band.hidden = true;
    canvas.parentElement?.append(this.band);
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || this.ignore(e)) return;
      this.down = { x: e.clientX, y: e.clientY, hot: this.gizmoHot(), add: e.ctrlKey || e.metaKey || e.shiftKey, boxing: false };
    };
    const onMove = (e: PointerEvent) => {
      const d = this.down;
      if (!d || d.hot) return;
      if (!d.boxing && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= DRAG) return;
      d.boxing = true;
      this.drawBand(d, e);
    };
    const onUp = (e: PointerEvent) => {
      const d = this.down;
      this.down = null;
      this.band.hidden = true;
      if (e.button !== 0 || !d || d.hot) return;
      if (d.boxing) {
        const r = rectToNdc(d, { x: e.clientX, y: e.clientY }, this.canvas.getBoundingClientRect());
        this.boxed(r, e.shiftKey ? 'add' : e.ctrlKey || e.metaKey ? 'toggle' : 'replace');
        return;
      }
      if (e.target !== this.canvas) return;
      this.clickAt(e.clientX, e.clientY, d.add);
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    this.off.push(
      () => canvas.removeEventListener('pointerdown', onDown),
      () => window.removeEventListener('pointermove', onMove),
      () => window.removeEventListener('pointerup', onUp),
    );
  }

  /** A box being drawn (Esc gives it up). */
  get boxing() {
    return !!this.down?.boxing;
  }

  /** Gives up the box being drawn. */
  cancelBox() {
    if (!this.down?.boxing) return false;
    this.down = null;
    this.band.hidden = true;
    return true;
  }

  private drawBand(d: { x: number; y: number }, e: PointerEvent) {
    const host = this.band.parentElement?.getBoundingClientRect();
    const c = this.canvas.getBoundingClientRect();
    if (!host) return;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const x0 = clamp(Math.min(d.x, e.clientX), c.left, c.right);
    const x1 = clamp(Math.max(d.x, e.clientX), c.left, c.right);
    const y0 = clamp(Math.min(d.y, e.clientY), c.top, c.bottom);
    const y1 = clamp(Math.max(d.y, e.clientY), c.top, c.bottom);
    Object.assign(this.band.style, { left: `${x0 - host.left}px`, top: `${y0 - host.top}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
    this.band.hidden = false;
  }

  /** The pieces in a box joined to the selection (replace, add or toggle). */
  private boxed(r: NdcRect, mode: 'replace' | 'add' | 'toggle') {
    const inBox = this.boxPick(r);
    const current = this.items.every((s) => s.kind === 'peca') ? this.pieceIds : [];
    const ids = combineBox(current, inBox, mode);
    const active = this.current?.kind === 'peca' && ids.includes(this.current.id) ? this.current : null;
    this.setMany(
      ids.map((id) => ({ kind: 'peca', id })),
      active,
    );
  }

  /** A click at a point of the page: picks what's there (`add`: Ctrl or Shift held). */
  clickAt(x: number, y: number, add: boolean) {
    const s = this.pick(x, y);
    if (add && s?.kind === 'peca') this.toggle(s);
    else if (!add || s) this.set(s);
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
    this.ray.setFromCamera(this.ndc(x, y), this.camera());
    for (const t of this.targets()) {
      // Markers and handles drawn since the last frame have no world matrix yet.
      t.updateMatrixWorld(true);
      const hits = this.ray.intersectObject(t, true).filter((h) => h.object.visible && !(h.object as THREE.Mesh & { isLine?: boolean }).isLine);
      const hit = hits.find((h) => selectedOf(h.object));
      if (hit) return selectedOf(hit.object);
    }
    return null;
  }

  /** Where the cursor's ray meets the map (or the ground plane), for dropping new pieces and pasting. */
  dropPoint(x: number, y: number, map: THREE.Object3D): THREE.Vector3 {
    const cam = this.camera();
    this.ray.setFromCamera(this.ndc(x, y), cam);
    // Measured from the camera (an orthographic ray starts behind it).
    const eye = cam.getWorldPosition(new THREE.Vector3());
    const hit = this.ray.intersectObject(map, true).find((h) => h.object.visible && !h.object.userData.ajuda);
    if (hit && hit.point.distanceTo(eye) < 150) return hit.point;
    const ground = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return ground && ground.distanceTo(eye) < 150 ? ground : this.ray.ray.closestPointToPoint(eye, new THREE.Vector3()).addScaledVector(this.ray.ray.direction, 12);
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
    this.band.remove();
  }
}
