// The Project panel's thumbnails, kept in the browser (PF-6 Revisions 01, etapa 4). The editor draws each kind of
// piece once (client/editor/thumbRenderer.ts) and keeps the picture in IndexedDB (database "oc-editor", store
// "miniaturas"), under the asset's key ("peca:caixa", "glb:<sha256>", "marcador:spawnA") with a signature: a
// hash of what the picture shows (the catalog's entry for the kind, the params a new piece gets) and of the game's
// version and the drawing's format. A picture whose signature isn't the one the editor computes now is stale
// (the catalog or the game changed): it's drawn again. Without IndexedDB (a private window) the pictures last
// while the editor is open (the IndexedDB store is in client/editor/thumbs.ts: this file stays free of the DOM, the
// server's typecheck reaches it through the client's tests). client/tests/editorThumbs.test.ts runs it with a store
// in memory.

/** Bumped when the way thumbnails are drawn changes (light, camera, size): every picture is drawn again. */
export const THUMB_FORMAT = 1;

/** What the Project shows: a kind of piece of the catalog, a GLB model of the map, or a marker. */
export type ThumbAsset = { kind: 'peca'; tipo: string } | { kind: 'glb'; sha256: string } | { kind: 'marcador'; marker: string };

/** The asset's key in the cache. */
export function thumbKey(a: ThumbAsset): string {
  return a.kind === 'peca' ? `peca:${a.tipo}` : a.kind === 'glb' ? `glb:${a.sha256}` : `marcador:${a.marker}`;
}

/** FNV-1a (32 bits) of a text, in base 36: short and stable, for signatures (not for security). */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** JSON with the keys in order (the same entry always gives the same text). */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * A picture's signature: what it shows (`content`: the catalog's entry and the new piece's params, or the GLB's
 * hash), the game's version and the drawing's format.
 */
export function thumbSignature(content: unknown, version: string, format = THUMB_FORMAT): string {
  return `${format}.${hashText(version)}.${hashText(stableJson(content))}`;
}

/** A kept picture: its signature, the image (null: the asset draws nothing visible) and its box. */
export interface ThumbRecord {
  sig: string;
  blob: Blob | null;
  /**
   * The box of what the asset builds, from the point it's dropped at (min x y z, max x y z): the ghost shown while
   * dragging it over the Scene.
   */
  box?: [number, number, number, number, number, number];
  /** When it was drawn (ms since 1970). */
  em: number;
}

/** Where the pictures are kept (IndexedDB in the editor, a Map in the tests). */
export interface ThumbStore {
  get(key: string): Promise<ThumbRecord | null>;
  put(key: string, rec: ThumbRecord): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
}

/** The pictures by asset: a hit only when the kept signature is today's. */
export class ThumbCache {
  /** Reads and writes made (the tests count them). */
  reads = 0;
  writes = 0;

  constructor(private readonly store: ThumbStore) {}

  /** The kept picture, or null when there's none or it's stale (`sig`: the signature now). */
  async lookup(key: string, sig: string): Promise<ThumbRecord | null> {
    this.reads++;
    const rec = await this.store.get(key);
    return rec && rec.sig === sig ? rec : null;
  }

  /** Keeps a picture (over the stale one). */
  save(key: string, rec: ThumbRecord) {
    this.writes++;
    return this.store.put(key, rec);
  }

  /** Forgets the pictures of kinds the catalog no longer has (`live`: the keys that still exist). GLB pictures stay. */
  async prune(live: Set<string>): Promise<number> {
    let n = 0;
    for (const k of await this.store.keys()) {
      if (k.startsWith('glb:') || live.has(k)) continue;
      if (await this.store.delete(k)) n++;
    }
    return n;
  }
}

/** A store in memory (no IndexedDB, and the tests). */
export function memoryThumbStore(): ThumbStore & { map: Map<string, ThumbRecord> } {
  const map = new Map<string, ThumbRecord>();
  return {
    map,
    get: async (k) => map.get(k) ?? null,
    put: async (k, r) => (map.set(k, r), true),
    delete: async (k) => map.delete(k),
    keys: async () => [...map.keys()],
  };
}

/**
 * The game's version for the signatures: the commit the client was built from (vite.config.ts defines it), or
 * the package's version where there's no git.
 */
export function gameVersion(): string {
  return typeof __OC_BUILD__ === 'string' ? __OC_BUILD__ : 'dev';
}

declare const __OC_BUILD__: string | undefined;
