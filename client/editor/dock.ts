// The editor's dockable panels on the page (PF-6 Revisions 01): the layout of client/editor/dockLayout.ts drawn
// as nested flex boxes with a border to drag between neighbors, and stacks of tabs. A tab dragged (past a few
// pixels) shows where it would land on the stack under the pointer (its middle: into the stack; an edge: beside
// it) and lands there when let go; Esc gives up. Every change is kept in localStorage; "Restaurar layout padrão"
// goes back to Unity's. While a tab or a border is dragged, the host says so (`ed-docking`): the game's page laid
// over the Game tab (etapa 4) lets the pointer through then.
import { activate, deserialize, defaultLayout, dock, LAYOUT_KEY, nodeAt, resize, serialize, zoneAt, type DockNode, type PanelId, type Zone } from './dockLayout';

export interface DockPanel {
  title: string;
  el: HTMLElement;
}

function readLayout(): DockNode {
  try {
    return deserialize(localStorage.getItem(LAYOUT_KEY));
  } catch {
    return defaultLayout();
  }
}

function keepLayout(n: DockNode) {
  try {
    localStorage.setItem(LAYOUT_KEY, serialize(n));
  } catch {
    /* storage blocked: the layout lasts until the page reloads */
  }
}

export class DockView {
  layout: DockNode = readLayout();
  /** The layout changed (the scene's size may have). */
  onLayout: () => void = () => {};
  private drop = document.createElement('div');

  constructor(
    private readonly host: HTMLElement,
    private readonly panels: Record<PanelId, DockPanel>,
  ) {
    this.drop.className = 'ed-drop';
    this.render();
  }

  /** Back to Unity's layout. */
  restore() {
    this.set(defaultLayout());
  }

  /** Shows a panel (its tab comes to the front). */
  show(panel: PanelId) {
    this.set(activate(this.layout, panel));
  }

  private set(n: DockNode) {
    this.layout = n;
    keepLayout(n);
    this.render();
  }

  render() {
    // The panels' contents move into the new boxes (the 3D view's canvas keeps its context).
    this.host.replaceChildren(this.node(this.layout, []), this.drop);
    this.drop.hidden = true;
    this.onLayout();
  }

  private node(n: DockNode, path: number[]): HTMLElement {
    if (n.t === 'tabs') return this.stack(n);
    const box = document.createElement('div');
    box.className = `ed-split ed-split-${n.dir}`;
    const panes: HTMLElement[] = [];
    n.kids.forEach((k, i) => {
      if (i > 0) box.append(this.splitter(box, panes, n.dir, path, i - 1));
      const pane = document.createElement('div');
      pane.className = 'ed-pane';
      pane.style.flex = `${n.sizes[i]} 1 0`;
      pane.append(this.node(k, [...path, i]));
      panes.push(pane);
      box.append(pane);
    });
    return box;
  }

  /** The border between two neighbors: dragging it trades room between them. */
  private splitter(box: HTMLElement, panes: HTMLElement[], dir: 'row' | 'col', path: number[], i: number) {
    const bar = document.createElement('div');
    bar.className = `ed-splitter ed-splitter-${dir}`;
    bar.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      this.host.classList.add('ed-docking');
      const rect = box.getBoundingClientRect();
      const room = dir === 'row' ? rect.width : rect.height;
      let last = dir === 'row' ? e.clientX : e.clientY;
      const move = (ev: PointerEvent) => {
        const at = dir === 'row' ? ev.clientX : ev.clientY;
        const share = (at - last) / Math.max(1, room);
        last = at;
        this.layout = resize(this.layout, path, i, share);
        const split = nodeAt(this.layout, path);
        if (split?.t === 'split') panes.forEach((p, k) => (p.style.flex = `${split.sizes[k]} 1 0`));
        this.onLayout();
      };
      const up = () => {
        this.host.classList.remove('ed-docking');
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
        keepLayout(this.layout);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    };
    return bar;
  }

  private stack(n: Extract<DockNode, { t: 'tabs' }>): HTMLElement {
    const box = document.createElement('div');
    box.className = 'ed-stack';
    box.dataset.panels = n.tabs.join(' ');
    const head = document.createElement('div');
    head.className = 'ed-tabs';
    const body = document.createElement('div');
    body.className = 'ed-stack-body';
    n.tabs.forEach((id, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `ed-tab${i === n.active ? ' ed-tab-on' : ''}`;
      tab.textContent = this.panels[id].title;
      tab.dataset.panel = id;
      this.dragTab(tab, id);
      head.append(tab);
      const el = this.panels[id].el;
      el.hidden = i !== n.active;
      body.append(el);
    });
    box.append(head, body);
    return box;
  }

  /** A tab: a click shows it, a drag docks it somewhere else. */
  private dragTab(tab: HTMLElement, id: PanelId) {
    tab.onpointerdown = (e) => {
      if (e.button !== 0) return;
      const x0 = e.clientX;
      const y0 = e.clientY;
      let dragging = false;
      let target: { panel: PanelId; zone: Zone } | null = null;
      tab.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        dragging = true;
        tab.classList.add('ed-tab-drag');
        this.host.classList.add('ed-docking');
        target = this.hover(ev.clientX, ev.clientY);
      };
      const end = (ok: boolean) => {
        tab.removeEventListener('pointermove', move);
        tab.removeEventListener('pointerup', up);
        tab.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', esc, true);
        tab.classList.remove('ed-tab-drag');
        this.host.classList.remove('ed-docking');
        this.drop.hidden = true;
        if (!dragging) return this.show(id);
        if (ok && target) this.set(dock(this.layout, id, target.panel, target.zone));
      };
      const up = () => end(true);
      const cancel = () => end(false);
      const esc = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape') return;
        ev.stopPropagation();
        dragging = true;
        target = null;
        end(false);
      };
      tab.addEventListener('pointermove', move);
      tab.addEventListener('pointerup', up);
      tab.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', esc, true);
    };
  }

  /** Where a tab dragged to (x, y) would land, shown over that stack. */
  private hover(x: number, y: number): { panel: PanelId; zone: Zone } | null {
    const under = document.elementFromPoint(x, y)?.closest('.ed-stack') as HTMLElement | null;
    if (!under || !this.host.contains(under)) {
      this.drop.hidden = true;
      return null;
    }
    const r = under.getBoundingClientRect();
    const zone = zoneAt(x, y, r);
    const h = this.host.getBoundingClientRect();
    const box = { left: r.left - h.left, top: r.top - h.top, width: r.width, height: r.height };
    if (zone === 'left') box.width /= 2;
    if (zone === 'right') (box.left += r.width / 2), (box.width /= 2);
    if (zone === 'top') box.height /= 2;
    if (zone === 'bottom') (box.top += r.height / 2), (box.height /= 2);
    Object.assign(this.drop.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    this.drop.hidden = false;
    return { panel: under.dataset.panels!.split(' ')[0] as PanelId, zone };
  }
}

