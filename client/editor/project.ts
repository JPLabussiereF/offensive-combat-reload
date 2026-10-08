// The editor's Project panel (PF-6 Revisions 01, etapa 4), Unity's asset browser: the catalog's categories as folders
// on the left (and "Modelos GLB", with the map's imported models and the import button, and the markers), a grid of
// thumbnails with the name below on the right, a search over every folder (names in pt and en, ids) and a slider for
// the thumbnails' size (kept in the browser with the folder). The thumbnails come from client/editor/thumbs.ts (a
// mark while one isn't ready). A thumbnail dragged onto the Scene or the Hierarchy makes the piece there (the editor
// handles the drop); a double click (or Enter) makes it in front of the camera. It replaces the palette's list.
import { MAP_CATALOG, type Categoria } from '@shared/mapCatalog';
import type { MapData } from '@shared/mapData';
import type { MarkerKind } from './markers';
import { atLimit } from './document';
import { thumbKey, type ThumbAsset } from './thumbCache';
import { ASSET_MIME } from './dropPiece';
import type { Thumbs } from './thumbs';
import { et, nameOf, type EditorKey } from './strings';

/** What a thumbnail stands for. */
export type ProjectItem = { kind: 'peca'; tipo: string } | { kind: 'glb'; file: string; sha256: string } | { kind: 'marcador'; marker: MarkerKind };


type Folder = Exclude<Categoria, 'importado' | 'organizacao'> | 'glb' | 'marcadores';

const FOLDERS: [Folder, EditorKey, string][] = [
  ['primitivas', 'catPrimitivas', '◼'],
  ['estrutura', 'catEstrutura', '🧱'],
  ['construcoes', 'catConstrucoes', '🏠'],
  ['natureza', 'catNatureza', '🌳'],
  ['moveis', 'catMoveis', '🪑'],
  ['veiculos', 'catVeiculos', '🚗'],
  ['objetos', 'catObjetos', '📦'],
  ['luzes', 'catLuzes', '💡'],
  ['ambiente', 'catAmbiente', '🌫️'],
  ['glb', 'imported', '🧊'],
  ['marcadores', 'markers', '📍'],
];

const MARKERS: [MarkerKind, EditorKey, string][] = [
  ['spawnA', 'mkSpawnA', '🟥'],
  ['spawnB', 'mkSpawnB', '🟦'],
  ['spawnFfa', 'mkSpawnFfa', '🟩'],
  ['boneco', 'mkBoneco', '🎯'],
  ['cereja', 'mkCereja', '🍒'],
  ['biscoito', 'mkBiscoito', '🍪'],
  ['rato', 'mkRato', '🐀'],
  ['peixe', 'mkPeixe', '🐟'],
  ['surgir', 'mkSurgir', '🧟'],
  ['barricada', 'mkBarricada', '🚧'],
];

/** Lowercase without accents, for the search. */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PREFS = 'oc.editor.projeto.v1';
export const TILE_MIN = 56;
export const TILE_MAX = 160;

export interface ProjectActions {
  /** Double click or Enter: in front of the camera. */
  add(item: ProjectItem): void;
  importGlb(): void;
  /** A thumbnail started or stopped being dragged (the editor shows the ghost and takes the drop). */
  dragStart(item: ProjectItem): void;
  dragEnd(): void;
}

/** The cache's asset for an item (markers have no drawn picture). */
export function assetOf(item: ProjectItem): ThumbAsset | null {
  return item.kind === 'peca' ? { kind: 'peca', tipo: item.tipo } : item.kind === 'glb' ? { kind: 'glb', sha256: item.sha256 } : null;
}

/** The key the thumbnails and the ghost go by. */
export const itemKey = (item: ProjectItem) => (item.kind === 'marcador' ? `marcador:${item.marker}` : thumbKey(assetOf(item)!));

export class ProjectPanel {
  private folder: Folder = 'primitivas';
  private query = '';
  private size = 88;
  private selected: string | null = null;
  private readOnly = false;
  private tree: HTMLElement;
  private grid: HTMLElement;
  private progress: HTMLElement;
  private items = new Map<string, ProjectItem>();

  constructor(
    private readonly el: HTMLElement,
    private readonly act: ProjectActions,
    private readonly data: () => MapData,
    private readonly thumbs: Thumbs,
  ) {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as { pasta?: string; tamanho?: number };
      if (FOLDERS.some(([f]) => f === p.pasta)) this.folder = p.pasta as Folder;
      if (typeof p.tamanho === 'number' && p.tamanho >= TILE_MIN && p.tamanho <= TILE_MAX) this.size = p.tamanho;
    } catch {
      /* nothing kept */
    }
    el.classList.add('ed-proj');
    const bar = document.createElement('div');
    bar.className = 'ed-proj-bar';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = et('search');
    search.className = 'ed-search';
    search.oninput = () => {
      this.query = search.value;
      this.render();
    };
    this.progress = document.createElement('span');
    this.progress.className = 'ed-proj-progress';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(TILE_MIN);
    slider.max = String(TILE_MAX);
    slider.step = '8';
    slider.value = String(this.size);
    slider.title = et('thumbSize');
    slider.className = 'ed-proj-size';
    slider.oninput = () => {
      this.size = Number(slider.value);
      this.grid.style.setProperty('--tile', `${this.size}px`);
      this.keep();
    };
    bar.append(search, this.progress, slider);
    const main = document.createElement('div');
    main.className = 'ed-proj-main';
    this.tree = document.createElement('div');
    this.tree.className = 'ed-proj-tree';
    this.grid = document.createElement('div');
    this.grid.className = 'ed-proj-grid';
    this.grid.style.setProperty('--tile', `${this.size}px`);
    main.append(this.tree, this.grid);
    el.append(bar, main);
    thumbs.onReady = (key) => this.ready(key);
    this.render();
    // Every kind in the background, after the folder on screen.
    thumbs.want(
      Object.values(MAP_CATALOG)
        .filter((k) => FOLDERS.some(([f]) => f === k.categoria))
        .map((k) => ({ kind: 'peca', tipo: k.id })),
      0,
    );
  }

  /** While the map is played: nothing is dropped or added (the thumbnails still show). */
  setReadOnly(on: boolean) {
    this.readOnly = on;
    this.el.classList.toggle('ed-readonly', on);
    this.render();
  }

  private keep() {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ pasta: this.folder, tamanho: this.size }));
    } catch {
      /* private window */
    }
  }

  /** The panel drawn again (the map changed: limits, imported models). */
  render() {
    this.renderTree();
    this.renderGrid();
  }

  /** The items of a folder (all of them, while searching). */
  private list(folder: Folder | null): { item: ProjectItem; name: string; glyph: string; off: string | null }[] {
    const d = this.data();
    const q = plain(this.query.trim());
    const out: { item: ProjectItem; name: string; glyph: string; off: string | null }[] = [];
    const match = (...s: string[]) => !q || plain(s.join(' ')).includes(q);
    for (const [f, , glyph] of FOLDERS) {
      if (folder && f !== folder) continue;
      if (f === 'glb') {
        for (const file of d.arquivos) if (match(file.id, 'glb')) out.push({ item: { kind: 'glb', file: file.id, sha256: file.sha256 ?? file.url }, name: file.id, glyph, off: null });
        continue;
      }
      if (f === 'marcadores') {
        for (const [kind, label, g] of MARKERS) {
          const name = et(label, { id: '' }).trim();
          if (!match(name, kind)) continue;
          const off = (kind === 'surgir' || kind === 'barricada') && !d.zumbi ? et('markerNeedsZombie') : null;
          out.push({ item: { kind: 'marcador', marker: kind }, name, glyph: g, off });
        }
        continue;
      }
      const kinds = Object.values(MAP_CATALOG)
        .filter((k) => k.categoria === f && match(...Object.values(k.nome), k.id))
        .sort((a, b) => nameOf(a.nome).localeCompare(nameOf(b.nome)));
      for (const k of kinds) out.push({ item: { kind: 'peca', tipo: k.id }, name: nameOf(k.nome), glyph, off: atLimit(d, k.id) ? et('limitReached', { nome: nameOf(k.nome) }) : null });
    }
    return out;
  }

  private renderTree() {
    const frag = document.createDocumentFragment();
    const searching = !!this.query.trim();
    for (const [f, label, glyph] of FOLDERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ed-folder${!searching && f === this.folder ? ' ed-folder-on' : ''}`;
      const n = this.list(f).length;
      b.textContent = `${glyph} ${et(label)}`;
      const count = document.createElement('span');
      count.className = 'ed-folder-n';
      count.textContent = String(n);
      b.append(count);
      b.onclick = () => {
        this.folder = f;
        this.keep();
        this.thumbs.lower();
        this.render();
      };
      frag.append(b);
    }
    this.tree.replaceChildren(frag);
  }

  private renderGrid() {
    const searching = !!this.query.trim();
    const entries = this.list(searching ? null : this.folder);
    this.items.clear();
    const frag = document.createDocumentFragment();
    const want: ThumbAsset[] = [];
    for (const e of entries) {
      const key = itemKey(e.item);
      this.items.set(key, e.item);
      frag.append(this.tile(key, e));
      const a = assetOf(e.item);
      if (a) want.push(a);
    }
    if (!searching && this.folder === 'glb') {
      const imp = document.createElement('button');
      imp.type = 'button';
      imp.className = 'ed-tile ed-tile-import';
      imp.disabled = this.readOnly;
      imp.innerHTML = `<span class="ed-thumb"><span class="ed-thumb-glyph">＋</span></span><span class="ed-tile-name"></span>`;
      (imp.querySelector('.ed-tile-name') as HTMLElement).textContent = et('importGlb');
      imp.onclick = () => this.act.importGlb();
      frag.append(imp);
    }
    if (!entries.length && (searching || this.folder !== 'glb')) {
      const none = document.createElement('div');
      none.className = 'ed-proj-empty';
      none.textContent = et('projectEmpty');
      frag.append(none);
    }
    this.grid.replaceChildren(frag);
    this.thumbs.want(want, 1);
    this.showProgress();
  }

  private tile(key: string, e: { item: ProjectItem; name: string; glyph: string; off: string | null }) {
    const t = document.createElement('div');
    t.className = `ed-tile${e.off || this.readOnly ? ' ed-tile-off' : ''}${key === this.selected ? ' ed-tile-on' : ''}`;
    t.dataset.key = key;
    t.tabIndex = 0;
    t.title = e.off ?? (e.item.kind === 'peca' ? `${e.name} (${e.item.tipo})` : e.name);
    const pic = document.createElement('span');
    pic.className = 'ed-thumb';
    this.paint(pic, key, e.glyph, e.item.kind === 'marcador');
    const name = document.createElement('span');
    name.className = 'ed-tile-name';
    name.textContent = e.name;
    t.append(pic, name);
    const usable = () => !e.off && !this.readOnly;
    t.draggable = usable();
    t.onclick = () => this.select(key);
    t.ondblclick = () => {
      if (usable()) this.act.add(e.item);
    };
    t.onkeydown = (ev) => {
      if (ev.key === 'Enter' && usable()) {
        ev.preventDefault();
        this.act.add(e.item);
      }
    };
    t.ondragstart = (ev) => {
      if (!usable() || !ev.dataTransfer) return ev.preventDefault();
      this.select(key);
      ev.dataTransfer.setData(ASSET_MIME, key);
      ev.dataTransfer.effectAllowed = 'copy';
      const img = pic.querySelector('img');
      if (img?.complete) ev.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
      this.act.dragStart(e.item);
    };
    t.ondragend = () => this.act.dragEnd();
    return t;
  }

  /** A thumbnail's picture: the image, the kind's mark (nothing to draw, or a marker) or the wait. */
  private paint(pic: HTMLElement, key: string, glyph: string, marker: boolean) {
    const url = marker ? null : this.thumbs.url(key);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      pic.replaceChildren(img);
      return;
    }
    const state = marker ? 'vazia' : this.thumbs.state(key);
    const g = document.createElement('span');
    g.className = state === 'pendente' ? 'ed-thumb-wait' : 'ed-thumb-glyph';
    g.textContent = state === 'pendente' ? '' : glyph;
    pic.replaceChildren(g);
  }

  private select(key: string) {
    this.selected = key;
    for (const t of this.grid.querySelectorAll<HTMLElement>('.ed-tile')) t.classList.toggle('ed-tile-on', t.dataset.key === key);
  }

  /** A picture came: its tile shows it. */
  private ready(key: string) {
    const t = this.grid.querySelector<HTMLElement>(`.ed-tile[data-key="${CSS.escape(key)}"]`);
    if (t) {
      const item = this.items.get(key);
      const folder = item?.kind === 'peca' ? MAP_CATALOG[item.tipo]?.categoria : 'glb';
      const glyph = FOLDERS.find(([f]) => f === folder)?.[2] ?? '◼';
      this.paint(t.querySelector('.ed-thumb') as HTMLElement, key, glyph, false);
    }
    this.showProgress();
  }

  private showProgress() {
    const n = this.thumbs.pending;
    this.progress.textContent = n ? et('thumbsDrawing', { n }) : '';
  }
}
