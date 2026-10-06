// Map data from the server (PF-6): a saved version of a map never changes, so once downloaded it is kept in
// memory and in IndexedDB (database "oc-mapas") by "map@version" and never asked again. An online session says
// which version it plays (SessionInfo.versao); the game downloads it before building the map. Offline play
// (training, bots) builds the official maps shipped with the client instead (client/world/mapLoader.ts).
import type { MapData } from '@shared/mapData';
import { api } from './api';

const DB_NAME = 'oc-mapas';
const STORE = 'versoes';

const memory = new Map<string, Promise<MapData>>();

/** The IndexedDB database, or null where there is none (private windows, blocked storage). */
let opened: Promise<IDBDatabase | null> | null = null;
function database(): Promise<IDBDatabase | null> {
  opened ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opened;
}

async function stored(key: string): Promise<MapData | null> {
  const db = await database();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as MapData | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function store(key: string, data: MapData) {
  const db = await database();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, key);
  } catch {
    /* storage full or blocked: the memory copy is enough for this visit */
  }
}

/** A saved version of a map: from memory, from IndexedDB or from GET /api/mapas/:id/versoes/:v. */
export function fetchMapVersion(id: string, versao: number): Promise<MapData> {
  const key = `${id}@${versao}`;
  let p = memory.get(key);
  if (!p) {
    p = (async () => {
      const cached = await stored(key);
      if (cached) return cached;
      const data = await api<MapData>('GET', `/api/mapas/${encodeURIComponent(id)}/versoes/${versao}`);
      void store(key, data);
      return data;
    })();
    memory.set(key, p);
    // A failed download is tried again next time.
    p.catch(() => memory.delete(key));
  }
  return p;
}
