// Where the character editor's card pictures are kept (PF-33): an IndexedDB database of their own, "oc-personagem"
// (store "miniaturas"), not the map editor's "oc-editor" (its prune deletes every key it doesn't know). A record is
// the picture (WebP) and its signature (client/ui/customize/rules.ts `cardSignature`: the drawing's format and the
// game's version); a stale one is drawn again and written over. Everything is read in one go when the editor opens.
// Without IndexedDB (a private window, blocked storage) nothing is kept: the pictures last while the page is open.

export interface CardRecord {
  sig: string;
  /** The picture (null: the piece draws nothing to see). */
  blob: Blob | null;
  /** When it was drawn (ms since 1970). */
  em: number;
}

const DB_NAME = 'oc-personagem';
const DB_VERSION = 1;
const STORE = 'miniaturas';

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

/** Every kept picture, by key (one transaction). Empty without IndexedDB. */
export async function readAllCards(): Promise<Map<string, CardRecord>> {
  const out = new Map<string, CardRecord>();
  const d = await db();
  if (!d) return out;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        out.set(String(c.key), c.value as CardRecord);
        c.continue();
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = tx.onabort = () => resolve(out);
    } catch {
      resolve(out);
    }
  });
}

/** Keeps a picture (over the stale one). False without IndexedDB or on a failure. */
export async function writeCard(key: string, rec: CardRecord): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
