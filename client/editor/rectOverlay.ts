// The Rect tool on the Scene view (PF-6 Revisions 01, etapa 3): the rectangle and its handles drawn over the
// canvas (an SVG, projected every frame), dragged with the left button. The numbers are client/editor/rectTool.ts;
// the editor turns a drag into the edit. Anything but a plain left press (Alt to orbit, the middle button to pan,
// the wheel) goes on to the canvas underneath; a click inside it that doesn't move selects as a click would.
import * as THREE from 'three';
import { dragRect, handleLocalPoint, handlesOf, rectCorners, rectDelta, rectPlane, type RectDrag, type RectFrame, type RectHandle } from './rectTool';

const NS = 'http://www.w3.org/2000/svg';
const HANDLE = 9;

export class RectOverlay {
  private svg: SVGSVGElement;
  private poly: SVGPolygonElement;
  private handleEls: SVGRectElement[] = [];
  private frame: RectFrame | null = null;
  private live: RectDrag | null = null;
  private drag: { h: RectHandle; start: THREE.Vector3; moved: boolean; x: number; y: number; id: number } | null = null;
  private ray = new THREE.Raycaster();
  /** While dragging: the world move from the box to where it is now. */
  onPreview: (delta: THREE.Matrix4) => void = () => {};
  /** Let go after moving: the frame dragged and where it ended. */
  onCommit: (f: RectFrame, d: RectDrag) => void = () => {};
  /** The drag was given up (Esc): the preview goes. */
  onCancel: () => void = () => {};
  /** A click inside it that moved nothing (page px). */
  onClick: (x: number, y: number, e: PointerEvent) => void = () => {};

  constructor(
    host: HTMLElement,
    private readonly canvas: HTMLElement,
    private readonly camera: () => THREE.Camera,
    /** The snapping step now (null: free). */
    private readonly step: () => number | null,
  ) {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('ed-rect');
    this.poly = document.createElementNS(NS, 'polygon');
    this.poly.classList.add('ed-rect-body');
    this.svg.append(this.poly);
    host.append(this.svg);
    this.svg.style.display = 'none';
    const forward = (e: Event) => {
      // Not for the Rect tool: the canvas below gets it (the camera's drags and the wheel).
      const Ctor = e.constructor as new (type: string, init: Event) => Event;
      this.canvas.dispatchEvent(new Ctor(e.type, e));
    };
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      forward(e);
    }, { passive: false });
    this.svg.addEventListener('contextmenu', (e) => e.preventDefault());
    this.svg.addEventListener('pointerdown', (e) => {
      const target = e.target as Element;
      const h = target === this.poly ? { u: 0, v: 0 } : (this.handleEls.find((x) => x === target) as (SVGRectElement & { handle?: RectHandle }) | undefined)?.handle;
      if (!h || e.button !== 0 || e.altKey || !this.frame) return forward(e);
      e.preventDefault();
      const start = this.local(e.clientX, e.clientY);
      if (!start) return;
      this.svg.setPointerCapture(e.pointerId);
      this.drag = { h: h as RectHandle, start, moved: false, x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    this.svg.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || !this.frame) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
      d.moved = true;
      const now = this.local(e.clientX, e.clientY);
      if (!now) return;
      this.live = dragRect(this.frame, d.h, d.start, now, this.step());
      this.onPreview(rectDelta(this.frame, this.live.min, this.live.max, this.live.k));
    });
    const up = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      const f = this.frame;
      const live = this.live;
      this.live = null;
      if (!d.moved) {
        if (d.h.u === 0 && d.h.v === 0) this.onClick(e.clientX, e.clientY, e);
        return;
      }
      if (f && live) this.onCommit(f, live);
      else this.onCancel();
    };
    this.svg.addEventListener('pointerup', up);
    this.svg.addEventListener('pointercancel', up);
  }

  get dragging() {
    return !!this.drag?.moved;
  }

  /** Gives up the drag under way (Esc). */
  cancel() {
    if (!this.drag) return false;
    const moved = this.drag.moved;
    this.drag = null;
    this.live = null;
    if (moved) this.onCancel();
    return moved;
  }

  /** The rectangle on a box (null: hidden). */
  set(f: RectFrame | null) {
    if (this.drag) return;
    this.frame = f;
    for (const h of this.handleEls) h.remove();
    this.handleEls = [];
    if (!f) {
      this.svg.style.display = 'none';
      return;
    }
    for (const h of handlesOf(f.mode)) {
      const el = document.createElementNS(NS, 'rect') as SVGRectElement & { handle?: RectHandle };
      el.classList.add('ed-rect-handle');
      el.setAttribute('width', String(HANDLE));
      el.setAttribute('height', String(HANDLE));
      el.handle = h;
      this.handleEls.push(el);
      this.svg.append(el);
    }
    this.poly.classList.toggle('ed-rect-move', f.mode === 'move');
  }

  /** Where the pointer meets the rectangle's plane, in the box's own axes. */
  private local(x: number, y: number): THREE.Vector3 | null {
    const f = this.frame;
    if (!f) return null;
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera());
    const hit = this.ray.ray.intersectPlane(rectPlane(f), new THREE.Vector3());
    return hit ? hit.applyMatrix4(f.world.clone().invert()) : null;
  }

  /** Every frame: the rectangle where the camera sees it now. */
  update() {
    const f = this.frame;
    if (!f) return;
    const cam = this.camera();
    cam.updateMatrixWorld();
    const r = this.canvas.getBoundingClientRect();
    const host = this.svg.getBoundingClientRect();
    const min = this.live?.min ?? f.min;
    const max = this.live?.max ?? f.max;
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const toPx = (w: THREE.Vector3) => {
      const v = new THREE.Vector4(w.x, w.y, w.z, 1).applyMatrix4(vp);
      if (v.w <= 1e-6 || v.z + v.w < 0) return null;
      return { x: r.left - host.left + ((v.x / v.w + 1) / 2) * r.width, y: r.top - host.top + ((1 - v.y / v.w) / 2) * r.height };
    };
    const corners = rectCorners(f, min, max).map(toPx);
    if (corners.some((c) => !c)) {
      this.svg.style.display = 'none';
      return;
    }
    this.svg.style.display = '';
    this.poly.setAttribute('points', corners.map((c) => `${c!.x},${c!.y}`).join(' '));
    for (const el of this.handleEls as (SVGRectElement & { handle: RectHandle })[]) {
      const p = toPx(handleLocalPoint(f, el.handle, min, max).applyMatrix4(f.world));
      el.style.display = p ? '' : 'none';
      if (!p) continue;
      el.setAttribute('x', String(p.x - HANDLE / 2));
      el.setAttribute('y', String(p.y - HANDLE / 2));
    }
  }
}
