// The editor's Hierarchy panel (PF-6 Revisions 01), as in Unity: every piece of the map as a tree (groups with
// their children, in the map's order), then the markers. A click selects (Ctrl adds or takes out, Shift takes the
// run from the last one clicked), in step with the 3D view's selection; the arrow opens and closes a group; a
// double click or F2 renames; rows dragged onto a group go into it, onto the top or bottom edge of a row go
// before or after it (in its group), onto the empty space below go out of every group. The search shows the
// matching pieces as a flat list. "+" makes an empty group, or a group around the selection (Ctrl+G).
import type { MapData, Peca } from '@shared/mapData';
import { MAP_CATALOG } from '@shared/mapCatalog';
import { markerKeys } from './markers';
import { ancestorsOf, finder, isGroup, parentOf, type Slot } from './groups';
import { et, nameOf } from './strings';

export interface HierarchyActions {
  /** Pieces picked in the tree: the whole selection now (Ctrl and Shift already applied), `active` the one clicked. */
  select(ids: string[], active: string | null): void;
  marker(key: string): void;
  rename(id: string, nome: string | null): void;
  move(ids: string[], pai: string | null, slot: Slot): void;
  newGroup(): void;
  groupSelection(): void;
}

/** Lowercase without accents, for the search. */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A piece's name in the editor: its own, or its id. */
export const labelOf = (p: Peca) => p.nome ?? p.id;

export class Hierarchy {
  private open = new Set<string>();
  private query = '';
  private selected = new Set<string>();
  private marker: string | null = null;
  /** Where a Shift-click run starts. */
  private anchor: string | null = null;
  private list: HTMLElement;
  private search: HTMLInputElement;
  /** The rows shown, in order (for Shift-click runs). */
  private shown: string[] = [];
  private dragging: string[] = [];
  private markersOpen = false;

  constructor(
    el: HTMLElement,
    private readonly act: HierarchyActions,
    private readonly data: () => MapData,
  ) {
    el.classList.add('ed-hier');
    const bar = document.createElement('div');
    bar.className = 'ed-hier-bar';
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = '+';
    add.title = et('hierCreate');
    const menu = document.createElement('div');
    menu.className = 'ed-menu';
    menu.hidden = true;
    const item = (label: string, f: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = () => {
        menu.hidden = true;
        f();
      };
      menu.append(b);
    };
    item(et('hierNewGroup'), () => act.newGroup());
    item(et('hierGroupSel'), () => act.groupSelection());
    add.onclick = (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    };
    document.addEventListener('pointerdown', (e) => {
      if (!menu.contains(e.target as Node) && e.target !== add) menu.hidden = true;
    });
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.placeholder = et('hierSearch');
    this.search.oninput = () => {
      this.query = this.search.value;
      this.render();
    };
    bar.append(add, this.search, menu);
    this.list = document.createElement('div');
    this.list.className = 'ed-hier-list';
    this.list.tabIndex = 0;
    // Dropped on the empty space below the rows: out of every group, at the end.
    this.list.addEventListener('dragover', (e) => {
      if (!this.dragging.length || e.target !== this.list) return;
      e.preventDefault();
    });
    this.list.addEventListener('drop', (e) => {
      if (!this.dragging.length || e.target !== this.list) return;
      e.preventDefault();
      act.move(this.dragging, null, {});
      this.dragging = [];
    });
    this.list.addEventListener('keydown', (e) => {
      if (e.key === 'F2' && this.selected.size) {
        e.preventDefault();
        this.rename([...this.selected].pop()!);
      }
    });
    el.append(bar, this.list);
  }

  /** The tree drawn again (the map changed). */
  render() {
    const d = this.data();
    const find = finder(d);
    const kids = new Map<string | null, Peca[]>();
    for (const p of d.pecas) {
      const pai = parentOf(p, find);
      (kids.get(pai) ?? kids.set(pai, []).get(pai)!).push(p);
    }
    const frag = document.createDocumentFragment();
    this.shown = [];
    const q = plain(this.query.trim());
    if (q) {
      for (const p of d.pecas) {
        const k = MAP_CATALOG[p.tipo];
        if (plain(`${labelOf(p)} ${p.id} ${k ? `${k.nome.pt} ${k.nome.en}` : p.tipo}`).includes(q)) frag.append(this.row(p, 0, kids));
      }
    } else {
      const walk = (pai: string | null, depth: number) => {
        for (const p of kids.get(pai) ?? []) {
          frag.append(this.row(p, depth, kids));
          if (isGroup(p) && this.open.has(p.id)) walk(p.id, depth + 1);
        }
      };
      walk(null, 0);
    }
    // The markers (spawns, dummies, objects, the zumbi layout): not pieces, they don't go in groups.
    const keys = markerKeys(d).filter((k) => !q || plain(k).includes(q));
    if (keys.length) {
      const head = document.createElement('div');
      head.className = 'ed-hrow ed-hmarkers';
      head.textContent = `${this.markersOpen || q ? '▾' : '▸'} ${et('markers')} (${keys.length})`;
      head.onclick = () => {
        this.markersOpen = !this.markersOpen;
        this.render();
      };
      frag.append(head);
      if (this.markersOpen || q)
        for (const key of keys) {
          const r = document.createElement('div');
          r.className = `ed-hrow ed-hmarker${key === this.marker ? ' ed-hsel' : ''}`;
          r.dataset.marker = key;
          r.style.paddingLeft = '22px';
          r.textContent = `◆ ${key}`;
          r.onclick = () => this.act.marker(key);
          frag.append(r);
        }
    }
    this.list.replaceChildren(frag);
  }

  private row(p: Peca, depth: number, kids: Map<string | null, Peca[]>): HTMLElement {
    this.shown.push(p.id);
    const r = document.createElement('div');
    r.className = `ed-hrow${this.selected.has(p.id) ? ' ed-hsel' : ''}${isGroup(p) ? ' ed-hgroup' : ''}`;
    r.dataset.id = p.id;
    r.draggable = true;
    r.style.paddingLeft = `${4 + depth * 14}px`;
    const arrow = document.createElement('span');
    arrow.className = 'ed-harrow';
    const n = kids.get(p.id)?.length ?? 0;
    if (isGroup(p)) {
      arrow.textContent = n ? (this.open.has(p.id) ? '▾' : '▸') : '·';
      arrow.onclick = (e) => {
        e.stopPropagation();
        if (this.open.has(p.id)) this.open.delete(p.id);
        else this.open.add(p.id);
        this.render();
      };
    }
    const name = document.createElement('span');
    name.className = 'ed-hname';
    name.textContent = `${isGroup(p) ? '▣ ' : ''}${labelOf(p)}`;
    const k = MAP_CATALOG[p.tipo];
    const kind = document.createElement('span');
    kind.className = 'ed-hkind';
    kind.textContent = isGroup(p) ? `${n}` : k ? nameOf(k.nome) : p.tipo;
    r.append(arrow, name, kind);
    r.title = p.id;
    r.onclick = (e) => this.click(p.id, e);
    r.ondblclick = (e) => {
      e.preventDefault();
      this.rename(p.id);
    };
    r.ondragstart = (e) => {
      this.dragging = this.selected.has(p.id) ? [...this.selected] : [p.id];
      e.dataTransfer?.setData('text/plain', p.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    };
    r.ondragend = () => {
      this.dragging = [];
      this.clearMarks();
    };
    r.ondragover = (e) => {
      if (!this.dragging.length) return;
      e.preventDefault();
      this.clearMarks();
      r.classList.add(`ed-hdrop-${this.where(r, e, p)}`);
    };
    r.ondragleave = () => r.classList.remove('ed-hdrop-before', 'ed-hdrop-after', 'ed-hdrop-into');
    r.ondrop = (e) => {
      if (!this.dragging.length) return;
      e.preventDefault();
      e.stopPropagation();
      const where = this.where(r, e, p);
      const ids = this.dragging;
      this.dragging = [];
      this.clearMarks();
      if (ids.includes(p.id)) return;
      if (where === 'into') {
        this.open.add(p.id);
        this.act.move(ids, p.id, {});
      } else this.act.move(ids, parentOf(p, finder(this.data())), where === 'before' ? { before: p.id } : { after: p.id });
    };
    return r;
  }

  /** Where a row dragged over this one would go: before, after, or into it (a group's middle). */
  private where(r: HTMLElement, e: DragEvent, p: Peca): 'before' | 'after' | 'into' {
    const box = r.getBoundingClientRect();
    const v = (e.clientY - box.top) / box.height;
    if (isGroup(p)) return v < 0.25 ? 'before' : v > 0.75 ? 'after' : 'into';
    return v < 0.5 ? 'before' : 'after';
  }

  private clearMarks() {
    for (const x of this.list.querySelectorAll('.ed-hdrop-before, .ed-hdrop-after, .ed-hdrop-into')) x.classList.remove('ed-hdrop-before', 'ed-hdrop-after', 'ed-hdrop-into');
  }

  private click(id: string, e: MouseEvent) {
    let ids: string[];
    if (e.shiftKey && this.anchor && this.shown.includes(this.anchor)) {
      const a = this.shown.indexOf(this.anchor);
      const b = this.shown.indexOf(id);
      ids = this.shown.slice(Math.min(a, b), Math.max(a, b) + 1);
      if (e.ctrlKey || e.metaKey) ids = [...new Set([...this.selected, ...ids])];
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(this.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      ids = [...next];
      this.anchor = id;
    } else {
      ids = [id];
      this.anchor = id;
    }
    this.act.select(ids, ids.includes(id) ? id : (ids[ids.length - 1] ?? null));
  }

  /**
   * The selection shown (from the 3D view or the tree): rows marked, the groups holding the active piece opened
   * and its row scrolled into view.
   */
  setSelection(ids: string[], marker: string | null) {
    this.selected = new Set(ids);
    this.marker = marker;
    const active = ids[ids.length - 1];
    let opened = false;
    if (active) {
      for (const g of ancestorsOf(this.data(), active))
        if (!this.open.has(g)) {
          this.open.add(g);
          opened = true;
        }
      if (!this.anchor || !this.selected.has(this.anchor)) this.anchor = active;
    }
    if (marker && !this.markersOpen) {
      this.markersOpen = true;
      opened = true;
    }
    if (opened) this.render();
    else
      for (const r of this.list.children as HTMLCollectionOf<HTMLElement>) {
        const on = r.dataset.id ? this.selected.has(r.dataset.id) : r.dataset.marker === marker && !!marker;
        r.classList.toggle('ed-hsel', on);
      }
    const row = active ? (this.list.querySelector(`[data-id="${CSS.escape(active)}"]`) as HTMLElement | null) : marker ? (this.list.querySelector(`[data-marker="${CSS.escape(marker)}"]`) as HTMLElement | null) : null;
    row?.scrollIntoView({ block: 'nearest' });
  }

  /** Opens a group's row (a new group shows its children). */
  expand(id: string) {
    this.open.add(id);
  }

  /** Renames a piece in its row: Enter keeps, Esc gives up, empty goes back to its id. */
  rename(id: string) {
    const r = this.list.querySelector(`[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    const p = this.data().pecas.find((x) => x.id === id);
    if (!r || !p) return;
    const name = r.querySelector('.ed-hname') as HTMLElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 60;
    input.className = 'ed-hrename';
    input.value = labelOf(p);
    name.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (keep && v !== labelOf(p)) this.act.rename(id, v && v !== id ? v : null);
      else this.render();
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    };
    input.onblur = () => finish(true);
    input.onclick = (e) => e.stopPropagation();
  }
}
