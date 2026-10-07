// Map data from the server (PF-6): a saved version of a map never changes, so once downloaded it is kept in
// memory and in IndexedDB (database "oc-mapas", store "versoes") by "map@version" and never asked again. An online
// session says which version it plays (SessionInfo.versao); the game downloads it before building the map.
// Offline play (training, bots) builds the official maps shipped with the client instead
// (client/world/mapLoader.ts).
//
// The map editor keeps its drafts in the same database (store "rascunhos", added in version 2 of it): "Testar"
// writes the map being edited there and the training range builds it.
import type { MapData } from '@shared/mapData';
import { api } from './api';

const DB_NAME = 'oc-mapas';
/** 1: the versions; 2: the editor's drafts too. */
const DB_VERSION = 2;
const STORE = 'versoes';
const DRAFTS = 'rascunhos';

const memory = new Map<string, Promise<MapData>>();

/** The IndexedDB database, or null where there is none (private windows, blocked storage). */
let opened: Promise<IDBDatabase | null> | null = null;
function database(): Promise<IDBDatabase | null> {
  opened ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      // From nothing, or from version 1 (whose downloaded versions stay): each store made once.
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opened;
}

async function read(store: string, key: string): Promise<MapData | null> {
  const db = await database();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as MapData | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Writes a value; true once it's stored (false: no database, or it's full or blocked). */
async function write(store: string, key: string, data: MapData): Promise<boolean> {
  const db = await database();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(data, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** A saved version of a map: from memory, from IndexedDB or from GET /api/mapas/:id/versoes/:v. */
export function fetchMapVersion(id: string, versao: number): Promise<MapData> {
  const key = `${id}@${versao}`;
  let p = memory.get(key);
  if (!p) {
    p = (async () => {
      const cached = await read(STORE, key);
      if (cached) return cached;
      const data = await api<MapData>('GET', `/api/mapas/${encodeURIComponent(id)}/versoes/${versao}`);
      // Storage full or blocked: the memory copy is enough for this visit.
      void write(STORE, key, data);
      return data;
    })();
    memory.set(key, p);
    // A failed download is tried again next time.
    p.catch(() => memory.delete(key));
  }
  return p;
}

/** Keeps the editor's draft of a map (`key`: the map's id, or "novo"). */
export const saveDraft = (key: string, data: MapData) => write(DRAFTS, key, data);

/** The editor's draft of a map, if one was kept. */
export const loadDraft = (key: string) => read(DRAFTS, key);
