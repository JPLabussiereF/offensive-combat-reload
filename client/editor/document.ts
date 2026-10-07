// The map being edited: its data (shared/mapData.ts), changed only through patches so every edit can be undone
// (client/editor/history.ts), and what each edit touched, so the scene rebuilds only the pieces that changed
// (client/editor/view.ts) and the rest (spawns, objects, the zumbi layout, the map's settings) is redrawn as
// markers. Pure: no scene here (client/tests/editorHistory.test.ts runs it as is).
import type { MapData, Peca } from '@shared/mapData';
import { MAP_CATALOG } from '@shared/mapCatalog';
import { History } from './history';

/** Everything in a map but its pieces. */
export type Rest = Omit<MapData, 'pecas'>;

/** One piece before and after an edit (null: it didn't exist), with its place in the list. */
export interface PiecePatch {
  id: string;
  before: { index: number; peca: Peca } | null;
  after: { index: number; peca: Peca } | null;
}

export interface Patch {
  pecas: PiecePatch[];
  resto?: { before: Rest; after: Rest };
}

/** What an applied patch touched. */
export interface Change {
  /** Pieces to rebuild (or take away, when they're gone). */
  ids: Set<string>;
  /** Spawns, objects, zumbi layout or settings changed. */
  resto: boolean;
}

export const clone = <T>(v: T): T => structuredClone(v);

const REST_KEYS = (d: MapData) => Object.keys(d).filter((k) => k !== 'pecas') as (keyof Rest)[];

export function restOf(d: MapData): Rest {
  const r: Record<string, unknown> = {};
  for (const k of REST_KEYS(d)) r[k] = clone(d[k]);
  return r as unknown as Rest;
}

/** Applies a patch to `data` in place (forwards, or backwards to undo it). */
export function applyPatch(data: MapData, p: Patch, dir: 'forward' | 'back'): Change {
  const ids = new Set<string>();
  const from = (x: PiecePatch) => (dir === 'forward' ? x.before : x.after);
  const to = (x: PiecePatch) => (dir === 'forward' ? x.after : x.before);
  // Out first, then in at their places in increasing order: the places are the final list's.
  const out = new Set(p.pecas.filter((x) => from(x)).map((x) => x.id));
  if (out.size) {
    const left = data.pecas.filter((q) => !out.has(q.id));
    data.pecas.length = 0;
    data.pecas.push(...left);
  }
  const ins = p.pecas.filter((x) => to(x)).sort((a, b) => to(a)!.index - to(b)!.index);
  for (const x of ins) data.pecas.splice(Math.min(to(x)!.index, data.pecas.length), 0, clone(to(x)!.peca));
  for (const x of p.pecas) ids.add(x.id);
  let resto = false;
  if (p.resto) {
    const target = dir === 'forward' ? p.resto.after : p.resto.before;
    const rec = data as unknown as Record<string, unknown>;
    for (const k of REST_KEYS(data)) if (!(k in target)) delete rec[k];
    for (const [k, v] of Object.entries(target)) rec[k] = clone(v);
    resto = true;
  }
  return { ids, resto };
}

/** The map in the editor: its data, its history and who's told of each change. */
export class EditorDocument {
  readonly history = new History();
  private listeners: ((c: Change) => void)[] = [];
  /** History size at the last save (or at opening): more means unsaved edits. */
  private savedAt = 0;
  private savedRedo = false;

  /** `data` stays the same object for good (the scene's loader reads its files through it). */
  constructor(readonly data: MapData) {}

  onChange(f: (c: Change) => void) {
    this.listeners.push(f);
  }

  private emit(c: Change) {
    for (const f of this.listeners) f(c);
  }

  piece(id: string): Peca | undefined {
    return this.data.pecas.find((p) => p.id === id);
  }

  indexOf(id: string) {
    return this.data.pecas.findIndex((p) => p.id === id);
  }

  /** Makes an edit (undoable). */
  commit(p: Patch) {
    if (!p.pecas.length && !p.resto) return;
    this.history.push(p);
    this.emit(applyPatch(this.data, p, 'forward'));
  }

  undo() {
    const p = this.history.undo();
    if (p) this.emit(applyPatch(this.data, p, 'back'));
    return !!p;
  }

  redo() {
    const p = this.history.redo();
    if (p) this.emit(applyPatch(this.data, p, 'forward'));
    return !!p;
  }

  markSaved() {
    this.savedAt = this.history.size;
    this.savedRedo = this.history.canRedo;
  }

  get dirty() {
    return this.history.size !== this.savedAt || this.history.canRedo !== this.savedRedo;
  }

  // --- Edits ---------------------------------------------------------------------------------------------

  /** A piece replaced by a new version of it (same id), plus the rest when it changes with it. */
  editPiece(next: Peca, rest?: (r: Rest) => void) {
    const i = this.indexOf(next.id);
    if (i < 0) return;
    const p: Patch = { pecas: [{ id: next.id, before: { index: i, peca: clone(this.data.pecas[i]) }, after: { index: i, peca: clone(next) } }] };
    if (rest) p.resto = this.restPatch(rest);
    this.commit(p);
  }

  /** New pieces at the end (or at `index`), plus the rest when it changes with them. */
  addPieces(pecas: Peca[], rest?: (r: Rest) => void, index = this.data.pecas.length) {
    const p: Patch = { pecas: pecas.map((peca, k) => ({ id: peca.id, before: null, after: { index: index + k, peca: clone(peca) } })) };
    if (rest) p.resto = this.restPatch(rest);
    this.commit(p);
  }

  removePieces(ids: string[], rest?: (r: Rest) => void) {
    const p: Patch = { pecas: [] };
    for (const id of ids) {
      const i = this.indexOf(id);
      if (i >= 0) p.pecas.push({ id, before: { index: i, peca: clone(this.data.pecas[i]) }, after: null });
    }
    if (rest) p.resto = this.restPatch(rest);
    this.commit(p);
  }

  /** Spawns, objects, the zumbi layout or the map's settings, changed by `f` on a copy. */
  editRest(f: (r: Rest) => void) {
    this.commit({ pecas: [], resto: this.restPatch(f) });
  }

  private restPatch(f: (r: Rest) => void) {
    const before = restOf(this.data);
    const after = restOf(this.data);
    f(after);
    return { before, after };
  }
}

// --- Ids ----------------------------------------------------------------------------------------------------

/** A free piece id from its kind: "parede", "parede-2", "parede-3"... */
export function newPieceId(data: MapData, tipo: string, taken: Set<string> = new Set()): string {
  const used = new Set([...data.pecas.map((p) => p.id), ...taken]);
  const base = tipo.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30) || 'peca';
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * The PropBus id of a new gag of a kind (Peca.prop): "hidrante:N" kinds take the next free N; kinds with one
 * plain id take it when it's free. Null: none left.
 */
export function newPropId(data: MapData, tipo: string, template?: string): string | null {
  const t = MAP_CATALOG[tipo];
  if (!t?.prop) return null;
  const used = new Set(data.pecas.map((p) => p.prop).filter(Boolean));
  const numbered = template ? template.includes(':') : t.limite === undefined;
  if (!numbered) return used.has(t.prop) ? null : t.prop;
  // Past every piece sharing the prefix: gags left without an explicit id are numbered by their order.
  const sharing = data.pecas.filter((p) => MAP_CATALOG[p.tipo]?.prop === t.prop).length;
  for (let n = sharing; n < 1000; n++) if (!used.has(`${t.prop}:${n}`)) return `${t.prop}:${n}`;
  return null;
}

/** A free id among the map's objects (collectibles, rats: lowercase letters, then a number). */
export function newObjectId(data: MapData, base: string): string {
  const used = new Set([...data.objetos.coletaveis.map((c) => c.id), ...data.objetos.ratos.map((r) => r.id), ...data.objetos.peixes.map((f) => f.id)]);
  const b = base.replace(/[^a-z]/g, '').slice(0, 16) || 'objeto';
  if (!used.has(b)) return b;
  for (let n = 2; n < 1000; n++) if (!used.has(`${b}:${n}`)) return `${b}:${n}`;
  return b;
}

/** How many pieces of a kind the map has, against the catalog's per-map limit. */
export const atLimit = (data: MapData, tipo: string) => {
  const lim = MAP_CATALOG[tipo]?.limite;
  return lim !== undefined && data.pecas.filter((p) => p.tipo === tipo).length >= lim;
};
