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
// v2 adds the `meta` store used for the durable layout backup. Bumping the
// version triggers onupgradeneeded, which creates the store; the existing
// `photos` store (and every photo in it) is left completely untouched.
const DB_VERSION = 2;
const STORE = "photos";
// Key/value store mirroring the board layout so it shares the photos' own
// durability — see putMeta/getMeta and the backup logic in store.tsx.
const META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

/** Error thrown from `putPhoto` when the underlying failure is a quota miss. */
export class StorageQuotaError extends Error {
  constructor(cause?: unknown) {
    super("Storage quota exceeded");
    this.name = "StorageQuotaError";
    (this as { cause?: unknown }).cause = cause;
  }
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      // Out-of-line keys (we pass the key explicitly in putMeta) — the meta
      // store holds a handful of small named records, not keyed objects.
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error("IndexedDB open blocked by another tab"));
  });
  // If opening fails, clear the cache so the next call can retry rather than
  // re-using a permanently-rejected promise.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  store: string = STORE,
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function isQuotaDOMError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number };
  return e.name === "QuotaExceededError" || e.code === 22;
}

export async function putPhoto(record: PhotoRecord): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    let req: IDBRequest;
    try {
      req = tx(db, "readwrite").put(record);
    } catch (err) {
      reject(isQuotaDOMError(err) ? new StorageQuotaError(err) : err);
      return;
    }
    req.onsuccess = () => resolve();
    req.onerror = () => {
      const err = req.error;
      reject(isQuotaDOMError(err) ? new StorageQuotaError(err) : err);
    };
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

/**
 * Returns the set of photo IDs that exist in IndexedDB, or `null` if the
 * store could not be read reliably (DB open blocked, transient error, the
 * iOS-Safari "empty on first access" quirk, etc.).
 *
 * The distinction matters: callers reconcile board layout against this set
 * by dropping references to photos that are gone. An empty Set means
 * "definitively no photos"; `null` means "don't know" — and a `null` must
 * never be treated as "everything is missing", or a transient read blip
 * would wipe every board. See store.tsx.
 */
export async function existingPhotoIds(): Promise<Set<string> | null> {
  try {
    const db = await openDB();
    return await new Promise<Set<string> | null>((resolve, reject) => {
      const req = tx(db, "readonly").getAllKeys();
      req.onsuccess = () =>
        resolve(new Set((req.result as IDBValidKey[]).map(String)));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/**
 * Store a small named record in the `meta` key/value store. Used for the
 * durable layout backup, which lives in IndexedDB alongside the photo bytes
 * so it survives a localStorage wipe (the layout's only other home).
 */
export async function putMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    let req: IDBRequest;
    try {
      req = tx(db, "readwrite", META).put(value, key);
    } catch (err) {
      reject(isQuotaDOMError(err) ? new StorageQuotaError(err) : err);
      return;
    }
    req.onsuccess = () => resolve();
    req.onerror = () => {
      const err = req.error;
      reject(isQuotaDOMError(err) ? new StorageQuotaError(err) : err);
    };
  });
}

/** Read a named record from the `meta` store; `null` on miss or any error. */
export async function getMeta<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise<T | null>((resolve, reject) => {
      const req = tx(db, "readonly", META).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
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
