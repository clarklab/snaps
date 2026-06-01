/**
 * IndexedDB blob store.
 *
 * This is the web equivalent of "reference the local file at full quality":
 * the browser sandbox won't let us point at a filesystem path, so instead we
 * keep the *original, untouched* file bytes (`full`) on the device in
 * IndexedDB. Nothing is re-encoded and nothing leaves the device. A small
 * downscaled `thumb` is kept alongside purely for fast grid rendering.
 */

export interface PhotoRecord {
  id: string;
  full: Blob; // original bytes, never re-encoded
  thumb: Blob; // small display copy
  type: string; // original mime type
  width: number;
  height: number;
  addedAt: number;
}

const DB_NAME = "snaps-quest";
const DB_VERSION = 1;
const STORE = "photos";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function putPhoto(record: PhotoRecord): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, "readwrite").put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").get(id);
    req.onsuccess = () => resolve(req.result as PhotoRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Estimated on-device storage used, for the Settings screen. */
export async function estimateUsage(): Promise<number | null> {
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate();
    return usage ?? null;
  }
  return null;
}
