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
const STORE = "photos";
// Key/value store mirroring the board layout so it shares the photos' own
// durability — see putMeta/getMeta and the backup logic in store.tsx.
const META = "meta";
// Sidecar database used for meta records when the main DB predates the
// `meta` store — see openMetaSource for why we never upgrade the main DB.
const META_DB_NAME = "snaps-quest-meta";

// There is deliberately NO version constant and no versioned open at runtime.
// Photo reads must never depend on a version upgrade succeeding:
//   - a versioned open can sit blocked forever behind any other tab or
//     installed-PWA window running an older build (those builds hold their
//     connection open with no versionchange handler), and
//   - a stale service-worker bundle can request a *lower* version than the
//     on-disk database, which makes the open throw VersionError outright.
// Both failure modes used to make every read fail — the grid rendered its
// placeholders forever while the photos sat intact on disk. A versionless
// open always succeeds at whatever version exists. If you ever need a schema
// change, add a sidecar database (like META_DB_NAME) instead of bumping the
// main DB's version.

let dbPromise: Promise<IDBDatabase> | null = null;
let metaDbPromise: Promise<IDBDatabase> | null = null;

/** Error thrown from `putPhoto` when the underlying failure is a quota miss. */
export class StorageQuotaError extends Error {
  constructor(cause?: unknown) {
    super("Storage quota exceeded");
    this.name = "StorageQuotaError";
    (this as { cause?: unknown }).cause = cause;
  }
}

function invalidateMain(): void {
  dbPromise = null;
}

function invalidateMetaDb(): void {
  metaDbPromise = null;
}

function openRaw(
  name: string,
  version: number | undefined,
  upgrade: (db: IDBDatabase) => void,
  invalidate: () => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req =
      version === undefined
        ? indexedDB.open(name)
        : indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => {
      const db = req.result;
      // If any other context requests a version upgrade, get out of its way:
      // close immediately and drop the cached connection so our next
      // operation reopens at the new version. Older builds lacked this
      // handler, which is exactly how they deadlocked newer tabs.
      db.onversionchange = () => {
        db.close();
        invalidate();
      };
      // The browser can close the connection behind our back (storage
      // pressure, backing-store failure). Drop the cache so we reopen lazily.
      db.onclose = () => invalidate();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    // No onblocked handler on purpose: "blocked" is a wait state, not a
    // failure, and the versionless opens used at runtime can never block.
  });
}

function createMainStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE)) {
    db.createObjectStore(STORE, { keyPath: "id" });
  }
  // Out-of-line keys (we pass the key explicitly in putMeta) — the meta
  // store holds a handful of small named records, not keyed objects.
  if (!db.objectStoreNames.contains(META)) {
    db.createObjectStore(META);
  }
}

// Wedged-queue self-heal. Even a versionless open can be queued behind a
// *pending* blocked upgrade request left over from a pre-fix page in this
// same browser session (Chromium keeps such requests in the connection queue
// even after their document is destroyed). The only thing that drains the
// queue is the blocking old-build window closing its connection — so if our
// open hasn't settled after a few seconds, we ask the service worker to
// reload every other window (they're either stale builds, which is exactly
// what we want gone, or fresh builds that reopen instantly). The pending
// open then resolves by itself and queued photo reads complete; nothing is
// ever lost. Verified end-to-end in Chromium. Once per page load.
const WEDGE_TIMEOUT_MS = 3000;
let wedgeRecoveryAttempted = false;

function watchForWedge(promise: Promise<IDBDatabase>): void {
  if (wedgeRecoveryAttempted) return;
  let settled = false;
  const mark = () => {
    settled = true;
  };
  promise.then(mark, mark);
  setTimeout(() => {
    if (settled || wedgeRecoveryAttempted) return;
    wedgeRecoveryAttempted = true;
    try {
      navigator.serviceWorker?.controller?.postMessage({
        type: "snaps:refresh-stale-clients",
      });
    } catch {
      /* best-effort */
    }
    try {
      // Let the app surface guidance (App.tsx) in case the reload nudge
      // isn't enough (e.g. the blocker is a window the SW doesn't control).
      window.dispatchEvent(new CustomEvent("snaps:db-wedged"));
    } catch {
      /* non-window context */
    }
  }, WEDGE_TIMEOUT_MS);
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const promise = (async () => {
    // Versionless: succeeds at whatever version is on disk. Fresh installs
    // run the upgrade callback (version 0 → 1) and get both stores.
    let db = await openRaw(DB_NAME, undefined, createMainStores, invalidateMain);
    if (!db.objectStoreNames.contains(STORE)) {
      // A half-created DB missing the photos store. Repair with a minimal
      // one-step bump — the only versioned open left, and it can only run
      // when there are no stored photos to put at risk.
      const next = db.version + 1;
      db.close();
      db = await openRaw(DB_NAME, next, createMainStores, invalidateMain);
    }
    return db;
  })();
  dbPromise = promise;
  // If opening fails, clear the cache so the next call can retry rather than
  // re-using a permanently-rejected promise.
  promise.catch(() => {
    if (dbPromise === promise) dbPromise = null;
  });
  watchForWedge(promise);
  return promise;
}

function openMetaSidecar(): Promise<IDBDatabase> {
  if (metaDbPromise) return metaDbPromise;
  const promise = openRaw(
    META_DB_NAME,
    undefined,
    (db) => {
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    },
    invalidateMetaDb,
  );
  metaDbPromise = promise;
  promise.catch(() => {
    if (metaDbPromise === promise) metaDbPromise = null;
  });
  return promise;
}

/**
 * Where meta records live: the main DB's `meta` store when it exists
 * (databases created with both stores), otherwise the sidecar DB. Upgrading
 * an older photos-only main DB in place would need a versioned open, which an
 * old tab can block indefinitely — and every photo read issued after it would
 * queue behind the stalled upgrade. The sidecar keeps the photos DB
 * permanently upgrade-free; meta is tiny and best-effort either way.
 */
async function openMetaSource(): Promise<{ db: IDBDatabase; sidecar: boolean }> {
  const db = await openDB();
  if (db.objectStoreNames.contains(META)) return { db, sidecar: false };
  return { db: await openMetaSidecar(), sidecar: true };
}

function requestToPromise<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/** db.transaction() throws InvalidStateError once a connection has closed. */
function isClosedConnection(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { name?: string }).name === "InvalidStateError"
  );
}

/**
 * Run one operation against the photos store. If the cached connection was
 * closed under us (another tab triggered our versionchange handler, or the
 * browser closed it), reopen once and retry — the failure is about the
 * connection, never about the data.
 */
async function photoOp<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const db = await openDB();
    try {
      const store = db.transaction(STORE, mode).objectStore(STORE);
      return await requestToPromise<T>(op(store));
    } catch (err) {
      if (attempt === 0 && isClosedConnection(err)) {
        invalidateMain();
        continue;
      }
      throw err;
    }
  }
}

/** Same closed-connection retry, against whichever DB currently holds meta. */
async function metaOp<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
): Promise<{ result: T; sidecar: boolean }> {
  for (let attempt = 0; ; attempt++) {
    const { db, sidecar } = await openMetaSource();
    try {
      const store = db.transaction(META, mode).objectStore(META);
      return { result: await requestToPromise<T>(op(store)), sidecar };
    } catch (err) {
      if (attempt === 0 && isClosedConnection(err)) {
        if (sidecar) invalidateMetaDb();
        else invalidateMain();
        continue;
      }
      throw err;
    }
  }
}

function isQuotaDOMError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number };
  return e.name === "QuotaExceededError" || e.code === 22;
}

export async function putPhoto(record: PhotoRecord): Promise<void> {
  try {
    await photoOp<unknown>("readwrite", (s) => s.put(record));
  } catch (err) {
    throw isQuotaDOMError(err) ? new StorageQuotaError(err) : err;
  }
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  return photoOp<PhotoRecord | undefined>("readonly", (s) => s.get(id));
}

/**
 * Returns the set of photo IDs that exist in IndexedDB, or `null` if the
 * store could not be read reliably (DB open failure, transient error, the
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
    const keys = await photoOp<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    return new Set(keys.map(String));
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
  try {
    await metaOp<unknown>("readwrite", (s) => s.put(value, key));
  } catch (err) {
    throw isQuotaDOMError(err) ? new StorageQuotaError(err) : err;
  }
}

/** True if the meta sidecar DB already exists on disk (never creates it). */
async function sidecarDbExists(): Promise<boolean> {
  if (metaDbPromise) return true;
  try {
    const dbs = await indexedDB.databases?.();
    return !!dbs && dbs.some((d) => d.name === META_DB_NAME);
  } catch {
    return false;
  }
}

/** Read a named record from the `meta` store; `null` on miss or any error. */
export async function getMeta<T>(key: string): Promise<T | null> {
  try {
    const { result, sidecar } = await metaOp<T | undefined>("readonly", (s) =>
      s.get(key),
    );
    if (result !== undefined) return result;
    // Miss in the main DB's meta store: a backup may still be sitting in the
    // sidecar from before the main DB gained its own store (e.g. an old
    // build upgraded it in place later). Only read the sidecar if it already
    // exists so a routine miss doesn't create an empty DB for every user.
    if (!sidecar && (await sidecarDbExists())) {
      const db = await openMetaSidecar();
      const fallback = await requestToPromise<T | undefined>(
        db.transaction(META, "readonly").objectStore(META).get(key),
      );
      return fallback ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  await photoOp<unknown>("readwrite", (s) => s.delete(id));
}

/** Estimated on-device storage used, for the Settings screen. */
export async function estimateUsage(): Promise<number | null> {
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate();
    return usage ?? null;
  }
  return null;
}
