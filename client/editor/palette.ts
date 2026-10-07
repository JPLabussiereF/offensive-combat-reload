// The editor's palette: every kind of piece of the catalog (shared/mapCatalog.ts) by category, with a search
// over the names (pt and en) and ids, the markers (spawns, dummies, collectibles, rats, koi, the zumbi layout)
// and the GLB import. Picking an entry asks the editor to drop one in front of the camera.
import { MAP_CATALOG, type Categoria } from '@shared/mapCatalog';
import type { MapData } from '@shared/mapData';
import type { MarkerKind } from './markers';
import { atLimit } from './document';
import { et, nameOf, type EditorKey } from './strings';

const CATEGORIES: [Categoria, EditorKey][] = [
  ['primitivas', 'catPrimitivas'],
  ['estrutura', 'catEstrutura'],
  ['construcoes', 'catConstrucoes'],
  ['natureza', 'catNatureza'],
  ['moveis', 'catMoveis'],
  ['veiculos', 'catVeiculos'],
  ['objetos', 'catObjetos'],
  ['luzes', 'catLuzes'],
  ['ambiente', 'catAmbiente'],
  ['importado', 'catImportado'],
];

const MARKERS: [MarkerKind, EditorKey][] = [
  ['spawnA', 'mkSpawnA'],
  ['spawnB', 'mkSpawnB'],
  ['spawnFfa', 'mkSpawnFfa'],
  ['boneco', 'mkBoneco'],
  ['cereja', 'mkCereja'],
  ['biscoito', 'mkBiscoito'],
  ['rato', 'mkRato'],
  ['peixe', 'mkPeixe'],
  ['surgir', 'mkSurgir'],
  ['barricada', 'mkBarricada'],
];

/** Lowercase without accents, for the search. */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface PaletteActions {
  piece(tipo: string): void;
  marker(kind: MarkerKind): void;
  importGlb(): void;
  /** A piece of a model already in the map's files. */
  glbPiece(file: string): void;
}

export class Palette {
  private query = '';
  private open = new Set<string>(['primitivas']);

  constructor(
    private readonly el: HTMLElement,
    private readonly act: PaletteActions,
    private readonly data: () => MapData,
  ) {
    this.render();
  }

  render() {
    const el = this.el;
    el.innerHTML = '';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = et('search');
    search.value = this.query;
    search.className = 'ed-search';
    search.oninput = () => {
      this.query = search.value;
      this.list(listEl);
    };
    const listEl = document.createElement('div');
    el.append(search, listEl);
    this.list(listEl);
  }

  /** The entries, by category (all open while searching). */
  private list(el: HTMLElement) {
    el.innerHTML = '';
    const q = plain(this.query.trim());
    const data = this.data();
    const kinds = Object.values(MAP_CATALOG);
    for (const [cat, label] of CATEGORIES) {
      const items = kinds.filter((k) => k.categoria === cat && (!q || plain(`${k.nome.pt} ${k.nome.en} ${k.id}`).includes(q)));
      if (!items.length) continue;
      const open = !!q || this.open.has(cat);
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'ed-cat';
      head.textContent = `${open ? '▾' : '▸'} ${et(label)} (${items.length})`;
      head.onclick = () => {
        if (this.open.has(cat)) this.open.delete(cat);
        else this.open.add(cat);
        this.list(el);
      };
      el.append(head);
      if (!open) continue;
      for (const k of items.sort((a, b) => nameOf(a.nome).localeCompare(nameOf(b.nome)))) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ed-entry';
        b.textContent = nameOf(k.nome);
        b.title = k.id;
        // The glb piece comes from an imported file (below), not from here.
        b.disabled = atLimit(data, k.id) || k.id === 'glb';
        if (atLimit(data, k.id)) b.title = et('limitReached', { nome: nameOf(k.nome) });
        b.onclick = () => this.act.piece(k.id);
        el.append(b);
      }
    }
    // The imported models, and the markers.
    if (!q || plain(`${et('imported')} glb`).includes(q)) {
      const head = document.createElement('div');
      head.className = 'ed-cat';
      head.textContent = et('imported');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-entry';
      b.textContent = et('importGlb');
      b.onclick = () => this.act.importGlb();
      el.append(head, b);
      // One more of a model the map already has.
      for (const f of data.arquivos) {
        const m = document.createElement('button');
        m.type = 'button';
        m.className = 'ed-entry';
        m.textContent = `▣ ${f.id}`;
        m.title = f.url;
        m.onclick = () => this.act.glbPiece(f.id);
        el.append(m);
      }
    }
    const marks = MARKERS.filter(([, l]) => !q || plain(et(l)).includes(q));
    if (marks.length) {
      const head = document.createElement('div');
      head.className = 'ed-cat';
      head.textContent = et('markers');
      el.append(head);
      for (const [kind, label] of marks) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ed-entry';
        b.textContent = et(label, { id: '' }).trim();
        b.disabled = (kind === 'surgir' || kind === 'barricada') && !data.zumbi;
        b.onclick = () => this.act.marker(kind);
        el.append(b);
      }
    }
  }
}
