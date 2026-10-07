// The Project panel's thumbnails (PF-6 Revisions 01, etapa 4): for each asset, the picture kept in the browser
// when its signature is today's (client/editor/thumbCache.ts), or drawn (client/editor/thumbRenderer.ts) on the
// line of client/editor/thumbQueue.ts, a picture at a time in the page's spare moments, the folder on screen
// first, then every other kind in the background. A kind is drawn as a new piece of it comes: its example from the
// official maps (or the catalog's defaults), its seed fixed. The panel asks (`want`) and hears when one is ready.
import * as THREE from 'three';
import { MAP_CATALOG } from '@shared/mapCatalog';
import { MAP_FORMAT, type MapData, type Peca } from '@shared/mapData';
import { newPiece } from './create';
import { ThumbCache, gameVersion, memoryThumbStore, thumbKey, thumbSignature, type ThumbAsset, type ThumbRecord, type ThumbStore } from './thumbCache';
import { ThumbQueue, type Schedule } from './thumbQueue';
import { ThumbRenderer } from './thumbRenderer';

/** A map with nothing in it: new pieces' ids and server places are worked out against it. */
const EMPTY: MapData = {
  formato: MAP_FORMAT,
  nome: '',
  cartao: { emoji: '', cor: '#ffffff' },
  ambiente: { ceu: {}, celula: 40, killY: -20 },
  pecas: [],
  arquivos: [],
  spawns: { a: [], b: [], ffa: [] },
  bonecos: [],
  objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
};

export type ThumbState = 'pronta' | 'vazia' | 'falhou' | 'pendente';

/** The page's spare moment (requestIdleCallback where there is one). */
const idle: Schedule = (run) => {
  const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(run, { timeout: 400 });
  else setTimeout(run, 30);
};

export class Thumbs {
  private cache = new ThumbCache(idbThumbStore());
  private queue: ThumbQueue<string>;
  private shots: ThumbRenderer;
  private assets = new Map<string, ThumbAsset>();
  private sigs = new Map<string, string>();
  private urls = new Map<string, string>();
  private boxes = new Map<string, number[]>();
  private empty = new Set<string>();
  /** Looked up in the cache already (a miss went to the queue). */
  private looked = new Map<string, Promise<void>>();
  private missed = new Set<string>();
  private disposed = false;
  /** Pictures read from the cache and drawn now (the status line, the checks). */
  fromCache = 0;
  drawn = 0;
  /** A picture is ready (or known to be empty or failed). */
  onReady: (key: string) => void = () => {};

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly templates: Promise<Map<string, Peca> | null>,
    /** The map's GLB files (an imported model's picture builds from its file). */
    private readonly files: () => MapData['arquivos'],
  ) {
    this.shots = new ThumbRenderer(renderer);
    this.queue = new ThumbQueue((k) => this.draw(k), idle);
    this.queue.onDone = (k, ok) => {
      if (!ok) console.warn(`[editor] miniatura de ${k} não foi desenhada`);
      this.onReady(k);
    };
  }

  /** The picture's URL (null: not ready, or nothing to show). */
  url(key: string) {
    return this.urls.get(key) ?? null;
  }

  /** What the asset builds, from its drop point (the ghost while dragging it). */
  box(key: string) {
    return this.boxes.get(key);
  }

  state(key: string): ThumbState {
    if (this.urls.has(key)) return 'pronta';
    if (this.empty.has(key)) return 'vazia';
    if (this.queue.failed.has(key)) return 'falhou';
    return 'pendente';
  }

  /** How many are still to be drawn (waiting on the line, or being drawn). */
  get pending() {
    return this.queue.pending + (this.queue.running ? 1 : 0);
  }

  /** Asks for pictures: `priority` 1 for the folder on screen, 0 for the background. */
  want(assets: ThumbAsset[], priority = 1) {
    if (this.disposed) return;
    for (const a of assets) {
      const key = thumbKey(a);
      this.assets.set(key, a);
      if (this.urls.has(key) || this.empty.has(key) || this.queue.done.has(key)) continue;
      if (!this.looked.has(key)) this.looked.set(key, this.lookup(key, a, priority));
      else if (this.missed.has(key)) this.queue.request(key, priority);
    }
  }

  /** Another folder took the screen: what was asked for the old one waits like the rest. */
  lower() {
    this.queue.lower(0);
  }

  /** Holds the drawing (Play) or lets it go on. */
  hold(on: boolean) {
    this.queue.hold(on);
  }

  /** The kinds the catalog has now (the cache forgets the others). */
  prune(live: Set<string>) {
    return this.cache.prune(live);
  }

  /** The new piece a kind's picture shows (its seed fixed, so the picture doesn't change from one visit to the next). */
  private async sample(tipo: string) {
    const tpl = (await this.templates)?.get(tipo);
    return newPiece(EMPTY, tipo, [0, 0, 0], tpl, () => 0);
  }

  private async signature(a: ThumbAsset): Promise<string> {
    if (a.kind === 'glb') return thumbSignature({ glb: a.sha256 }, gameVersion());
    if (a.kind === 'marcador') return thumbSignature({ marcador: a.marker }, gameVersion());
    const made = await this.sample(a.tipo);
    const p = made?.peca;
    return thumbSignature({ entry: MAP_CATALOG[a.tipo] ?? null, peca: p ? { params: p.params, yaw: p.yaw, escala: p.escala, semente: p.semente } : null }, gameVersion());
  }

  private async lookup(key: string, a: ThumbAsset, priority: number) {
    const sig = await this.signature(a);
    this.sigs.set(key, sig);
    const rec = await this.cache.lookup(key, sig).catch(() => null);
    if (this.disposed) return;
    if (rec) {
      this.fromCache++;
      this.adopt(key, rec);
      this.onReady(key);
      return;
    }
    this.missed.add(key);
    this.queue.request(key, priority);
  }

  private async draw(key: string) {
    const a = this.assets.get(key);
    const sig = this.sigs.get(key);
    if (!a || !sig || this.disposed) return;
    let shot;
    if (a.kind === 'peca') {
      const made = await this.sample(a.tipo);
      if (!made) throw new Error(`tipo ${a.tipo}`);
      shot = await this.shots.shoot(made.peca, [], made.byPose ? 'base' : 'p', made.rest);
    } else if (a.kind === 'glb') {
      const file = this.files().find((f) => (f.sha256 ?? f.url) === a.sha256);
      if (!file) throw new Error(`arquivo ${a.sha256}`);
      shot = await this.shots.shoot({ id: 'modelo', tipo: 'glb', p: [0, 0, 0], params: { arquivo: file.id } }, [file], 'p');
    } else return;
    const rec: ThumbRecord = { sig, blob: shot.blob, em: Date.now(), ...(shot.box ? { box: shot.box } : {}) };
    if (this.disposed) return;
    this.drawn++;
    this.adopt(key, rec);
    await this.cache.save(key, rec).catch(() => false);
  }

  private adopt(key: string, rec: ThumbRecord) {
    if (rec.box) this.boxes.set(key, rec.box);
    if (rec.blob) this.urls.set(key, URL.createObjectURL(rec.blob));
    else this.empty.add(key);
  }

  dispose() {
    this.disposed = true;
    this.queue.clear();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.shots.dispose();
  }
}

const DB_NAME = 'oc-editor';
const DB_VERSION = 1;
const STORE = 'miniaturas';

/** The pictures in IndexedDB; a store in memory where there's none (private windows, blocked storage). */
export function idbThumbStore(): ThumbStore {
  const fallback = memoryThumbStore();
  let opened: Promise<IDBDatabase | null> | null = null;
  const db = () =>
    (opened ??= new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest, empty: T, done: (r: unknown) => T): Promise<T> => {
    const d = await db();
    if (!d) return empty;
    return new Promise((resolve) => {
      try {
        const tx = d.transaction(STORE, mode);
        const req = f(tx.objectStore(STORE));
        let out = empty;
        req.onsuccess = () => (out = done(req.result));
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => resolve(empty);
        tx.onabort = () => resolve(empty);
      } catch {
        resolve(empty);
      }
    });
  };
  return {
    get: async (k) => ((await db()) ? run<ThumbRecord | null>('readonly', (s) => s.get(k), null, (r) => (r as ThumbRecord | undefined) ?? null) : fallback.get(k)),
    put: async (k, r) => ((await db()) ? run('readwrite', (s) => s.put(r, k), false, () => true) : fallback.put(k, r)),
    delete: async (k) => ((await db()) ? run('readwrite', (s) => s.delete(k), false, () => true) : fallback.delete(k)),
    keys: async () => ((await db()) ? run<string[]>('readonly', (s) => s.getAllKeys(), [], (r) => (r as IDBValidKey[]).map(String)) : fallback.keys()),
  };
}
