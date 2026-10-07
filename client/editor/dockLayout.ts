// The editor's dockable panels (PF-6 Revisions 01), without a screen: the layout as a tree of splits (side by
// side or one over the other, each child with its share of the room) whose leaves are stacks of tabs, as in
// Unity. A tab dragged onto a stack goes into it (center) or beside it (left, right, top, bottom); a stack left
// empty goes away and a split left with one child gives its place to it. The layout is kept in the browser as
// JSON; anything that doesn't read back as a layout with every panel exactly once falls back to the default. The
// Game tab (etapa 4: Play inside the editor) came after the first layouts were kept: one kept without it gets it
// beside the Scene, as Unity's.
export type PanelId = 'hierarchy' | 'scene' | 'game' | 'inspector' | 'project';
export const PANELS: readonly PanelId[] = ['hierarchy', 'scene', 'game', 'inspector', 'project'];
/** The panels of the layouts kept before the Game tab. */
const BEFORE_GAME: readonly PanelId[] = ['hierarchy', 'scene', 'inspector', 'project'];

export type DockNode = { t: 'split'; dir: 'row' | 'col'; sizes: number[]; kids: DockNode[] } | { t: 'tabs'; tabs: PanelId[]; active: number };

export type Zone = 'left' | 'right' | 'top' | 'bottom' | 'center';

/** What the layout is kept under in localStorage. */
export const LAYOUT_KEY = 'oc.editor.layout.v1';

/**
 * Unity's default: Hierarchy on the left, the Scene in the middle (the Game as a tab behind it), the Inspector on
 * the right, the Project below.
 */
export function defaultLayout(): DockNode {
  return {
    t: 'split',
    dir: 'row',
    sizes: [0.76, 0.24],
    kids: [
      {
        t: 'split',
        dir: 'col',
        sizes: [0.72, 0.28],
        kids: [
          { t: 'split', dir: 'row', sizes: [0.24, 0.76], kids: [tabs('hierarchy'), tabs('scene', 'game')] },
          tabs('project'),
        ],
      },
      tabs('inspector'),
    ],
  };
}

const tabs = (...ids: PanelId[]): DockNode => ({ t: 'tabs', tabs: ids, active: 0 });

/** Every panel in the layout, in order. */
export function panelsOf(n: DockNode): PanelId[] {
  return n.t === 'tabs' ? [...n.tabs] : n.kids.flatMap(panelsOf);
}

/** Whether `raw` is a layout (the right shape, every one of `panels` exactly once, sizes that add up). */
export function isLayout(raw: unknown, panels: readonly PanelId[] = PANELS): raw is DockNode {
  const ok = (n: unknown): boolean => {
    if (!n || typeof n !== 'object') return false;
    const o = n as Record<string, unknown>;
    if (o.t === 'tabs') return Array.isArray(o.tabs) && o.tabs.length > 0 && o.tabs.every((t) => panels.includes(t as PanelId)) && Number.isInteger(o.active) && (o.active as number) >= 0 && (o.active as number) < o.tabs.length;
    if (o.t !== 'split' || (o.dir !== 'row' && o.dir !== 'col') || !Array.isArray(o.kids) || !Array.isArray(o.sizes)) return false;
    if (o.kids.length < 2 || o.sizes.length !== o.kids.length) return false;
    if (!o.sizes.every((s) => typeof s === 'number' && Number.isFinite(s) && s > 0)) return false;
    return o.kids.every(ok);
  };
  if (!ok(raw)) return false;
  const ids = panelsOf(raw as DockNode);
  return ids.length === panels.length && panels.every((p) => ids.includes(p));
}

/** A layout kept before the Game tab, with it added behind the Scene (the tab shown stays the same). */
function withGame(n: DockNode): DockNode {
  if (n.t === 'tabs') return n.tabs.includes('scene') ? { t: 'tabs', tabs: [...n.tabs, 'game'], active: n.active } : n;
  return { ...n, kids: n.kids.map(withGame) };
}

/** The layout as kept. */
export const serialize = (n: DockNode) => JSON.stringify(n);

/** A kept layout, or the default when there's none or it doesn't read as one. */
export function deserialize(text: string | null | undefined): DockNode {
  if (!text) return defaultLayout();
  try {
    const raw = JSON.parse(text);
    if (isLayout(raw)) return normalize(raw);
    return isLayout(raw, BEFORE_GAME) ? normalize(withGame(raw)) : defaultLayout();
  } catch {
    return defaultLayout();
  }
}

/** Sizes as shares that add up to 1; splits with one child replaced by it; a split in a split of the same way merged. */
export function normalize(n: DockNode): DockNode {
  if (n.t === 'tabs') return { t: 'tabs', tabs: [...n.tabs], active: Math.min(Math.max(0, n.active), n.tabs.length - 1) };
  const kids: DockNode[] = [];
  const sizes: number[] = [];
  n.kids.forEach((k, i) => {
    const c = normalize(k);
    if (c.t === 'split' && c.dir === n.dir) {
      // A row in a row: its children take its share between them.
      c.kids.forEach((cc, j) => {
        kids.push(cc);
        sizes.push(n.sizes[i] * c.sizes[j]);
      });
    } else {
      kids.push(c);
      sizes.push(n.sizes[i]);
    }
  });
  if (kids.length === 1) return kids[0];
  const sum = sizes.reduce((a, b) => a + b, 0) || 1;
  return { t: 'split', dir: n.dir, sizes: sizes.map((s) => s / sum), kids };
}

/** The layout without `panel` (its stack shrinks, an empty stack goes away). Null when it was the only one. */
function without(n: DockNode, panel: PanelId): DockNode | null {
  if (n.t === 'tabs') {
    const i = n.tabs.indexOf(panel);
    if (i < 0) return { ...n, tabs: [...n.tabs] };
    const left = n.tabs.filter((t) => t !== panel);
    if (!left.length) return null;
    const active = n.active > i ? n.active - 1 : Math.min(n.active, left.length - 1);
    return { t: 'tabs', tabs: left, active };
  }
  const kids: DockNode[] = [];
  const sizes: number[] = [];
  n.kids.forEach((k, i) => {
    const c = without(k, panel);
    if (c) {
      kids.push(c);
      sizes.push(n.sizes[i]);
    }
  });
  if (!kids.length) return null;
  return normalize({ t: 'split', dir: n.dir, sizes, kids });
}

/**
 * `panel` dragged onto the stack that holds `target` (another panel), into it or beside it. The layout as it was
 * when that can't be (onto itself alone in its stack, or an unknown panel).
 */
export function dock(layout: DockNode, panel: PanelId, target: PanelId, zone: Zone): DockNode {
  if (panel === target && zone === 'center') return layout;
  const stack = findStack(layout, target);
  if (!stack) return layout;
  if (panel === target && stack.tabs.length === 1) return layout;
  // Beside its own stack: the stack is the one of the tabs left in it.
  const anchor = panel === target ? stack.tabs.find((t) => t !== panel)! : target;
  const rest = without(layout, panel);
  if (!rest) return layout;
  const put = (n: DockNode): DockNode => {
    if (n.t === 'tabs') {
      if (!n.tabs.includes(anchor)) return n;
      if (zone === 'center') return { t: 'tabs', tabs: [...n.tabs, panel], active: n.tabs.length };
      const mine = tabs(panel);
      const dir = zone === 'left' || zone === 'right' ? 'row' : 'col';
      const first = zone === 'left' || zone === 'top';
      return { t: 'split', dir, sizes: [0.5, 0.5], kids: first ? [mine, n] : [n, mine] };
    }
    return { ...n, kids: n.kids.map(put) };
  };
  return normalize(put(rest));
}

/** The stack that holds a panel. */
export function findStack(n: DockNode, panel: PanelId): Extract<DockNode, { t: 'tabs' }> | null {
  if (n.t === 'tabs') return n.tabs.includes(panel) ? n : null;
  for (const k of n.kids) {
    const s = findStack(k, panel);
    if (s) return s;
  }
  return null;
}

/** The tab shown in a panel's stack becomes that panel. */
export function activate(layout: DockNode, panel: PanelId): DockNode {
  const go = (n: DockNode): DockNode => (n.t === 'tabs' ? (n.tabs.includes(panel) ? { ...n, tabs: [...n.tabs], active: n.tabs.indexOf(panel) } : n) : { ...n, kids: n.kids.map(go) });
  return go(layout);
}

/** The node at a path of child indexes. */
export function nodeAt(n: DockNode, path: number[]): DockNode | null {
  let at: DockNode = n;
  for (const i of path) {
    if (at.t !== 'split' || !at.kids[i]) return null;
    at = at.kids[i];
  }
  return at;
}

/** The border between children `i` and `i + 1` of the split at `path` moved by `share` of its room (each keeps at least `min`). */
export function resize(layout: DockNode, path: number[], i: number, share: number, min = 0.06): DockNode {
  const go = (n: DockNode, depth: number): DockNode => {
    if (n.t !== 'split') return n;
    if (depth < path.length) return { ...n, kids: n.kids.map((k, j) => (j === path[depth] ? go(k, depth + 1) : k)) };
    if (i < 0 || i >= n.sizes.length - 1) return n;
    const sizes = [...n.sizes];
    const pair = sizes[i] + sizes[i + 1];
    const a = Math.min(pair - min, Math.max(min, sizes[i] + share));
    sizes[i] = a;
    sizes[i + 1] = pair - a;
    return { ...n, sizes };
  };
  return go(layout, 0);
}

/** Which zone of a stack's box a point falls in: its edges (a quarter of each side) or the middle. */
export function zoneAt(x: number, y: number, box: { left: number; top: number; width: number; height: number }): Zone {
  const u = (x - box.left) / box.width;
  const v = (y - box.top) / box.height;
  const d = Math.min(u, 1 - u, v, 1 - v);
  if (d > 0.25) return 'center';
  if (d === u) return 'left';
  if (d === 1 - u) return 'right';
  return d === v ? 'top' : 'bottom';
}
