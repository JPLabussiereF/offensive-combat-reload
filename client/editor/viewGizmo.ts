// The orientation gizmo in the Scene view's corner (PF-6 Revisions 01, etapa 3), as Unity's: the world's axes as
// the camera sees them (X red, Y green, Z blue; the opposite ends grey), drawn over the canvas. Clicking an axis
// looks from that side (Y: from above, the top view; Z: the front; X: the side); clicking the middle, or the label
// below it, switches perspective and orthographic.
import * as THREE from 'three';
import { forwardOf, rightOf, upOf, type ViewAxis } from './cameraMath';

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 84;
const R = 28;

const AXES: { axis: ViewAxis; dir: THREE.Vector3; color: string; label: string }[] = [
  { axis: 'x', dir: new THREE.Vector3(1, 0, 0), color: '#e8534a', label: 'X' },
  { axis: 'y', dir: new THREE.Vector3(0, 1, 0), color: '#8fd14f', label: 'Y' },
  { axis: 'z', dir: new THREE.Vector3(0, 0, 1), color: '#4a8ff0', label: 'Z' },
  { axis: '-x', dir: new THREE.Vector3(-1, 0, 0), color: '#9aa3ad', label: '' },
  { axis: '-y', dir: new THREE.Vector3(0, -1, 0), color: '#9aa3ad', label: '' },
  { axis: '-z', dir: new THREE.Vector3(0, 0, -1), color: '#9aa3ad', label: '' },
];

export class ViewGizmo {
  private svg: SVGSVGElement;
  private parts = new Map<ViewAxis, { line: SVGLineElement; dot: SVGCircleElement; text: SVGTextElement | null }>();
  private label: HTMLButtonElement;
  private shown = '';
  /** An axis clicked: look from that side. */
  onAxis: (axis: ViewAxis) => void = () => {};
  /** The middle (or the label) clicked: perspective ⇄ orthographic. */
  onToggle: () => void = () => {};

  constructor(host: HTMLElement, private readonly names: { persp: string; ortho: string; tip: string }) {
    const box = document.createElement('div');
    box.className = 'ed-viewgizmo';
    box.title = names.tip;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('width', String(SIZE));
    this.svg.setAttribute('height', String(SIZE));
    this.svg.setAttribute('viewBox', `${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`);
    const middle = document.createElementNS(NS, 'rect');
    middle.setAttribute('x', '-7');
    middle.setAttribute('y', '-7');
    middle.setAttribute('width', '14');
    middle.setAttribute('height', '14');
    middle.setAttribute('rx', '2');
    middle.classList.add('ed-vg-middle');
    middle.addEventListener('click', () => this.onToggle());
    for (const a of AXES) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('stroke', a.color);
      line.setAttribute('stroke-width', a.label ? '3' : '2');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', a.label ? '8' : '6');
      dot.setAttribute('fill', a.color);
      dot.classList.add('ed-vg-axis');
      dot.addEventListener('click', () => this.onAxis(a.axis));
      let text: SVGTextElement | null = null;
      if (a.label) {
        text = document.createElementNS(NS, 'text');
        text.textContent = a.label;
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.classList.add('ed-vg-text');
      }
      this.parts.set(a.axis, { line, dot, text });
    }
    this.svg.append(middle);
    this.label = document.createElement('button');
    this.label.type = 'button';
    this.label.className = 'ed-vg-label';
    this.label.onclick = () => this.onToggle();
    box.append(this.svg, this.label);
    host.append(box);
  }

  /** Draws the axes for the camera's heading (only when it changed). */
  update(yaw: number, pitch: number, ortho: boolean) {
    const key = `${yaw.toFixed(4)} ${pitch.toFixed(4)} ${ortho}`;
    if (key === this.shown) return;
    this.shown = key;
    this.label.textContent = ortho ? this.names.ortho : this.names.persp;
    const right = rightOf(yaw);
    const up = upOf(yaw, pitch);
    const fwd = forwardOf(yaw, pitch);
    // Farthest first: what points away from the camera is drawn under what points toward it.
    const order = AXES.map((a) => ({ a, x: a.dir.dot(right) * R, y: -a.dir.dot(up) * R, depth: a.dir.dot(fwd) })).sort((p, q) => q.depth - p.depth);
    const middle = this.svg.querySelector('.ed-vg-middle')!;
    for (const { a, x, y } of order) {
      const p = this.parts.get(a.axis)!;
      p.line.setAttribute('x1', '0');
      p.line.setAttribute('y1', '0');
      p.line.setAttribute('x2', String(x * 0.75));
      p.line.setAttribute('y2', String(y * 0.75));
      p.dot.setAttribute('cx', String(x));
      p.dot.setAttribute('cy', String(y));
      this.svg.append(p.line, p.dot);
      if (p.text) {
        p.text.setAttribute('x', String(x));
        p.text.setAttribute('y', String(y));
        this.svg.append(p.text);
      }
    }
    // The middle stays clickable on top (an axis seen end-on sits under it: looking along it already).
    this.svg.append(middle);
  }
}
