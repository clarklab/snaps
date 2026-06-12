import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "../components/Toast";
import { COLORS, SLOTS_PER_BOARD } from "../colors";
import {
  deletePhoto,
  existingPhotoIds,
  getMeta,
  getPhoto,
  putMeta,
  putPhoto,
  resetConnections,
  StorageQuotaError,
  verifyPhoto,
  type PhotoHealth,
  type PhotoRecord,
} from "../lib/db";
import { processImage } from "../lib/image";
import { type Crop, isIdentityCrop } from "../lib/crop";
import {
  buildBackupZip,
  MANIFEST_NAME,
  readBackupZip,
  type BackupManifest,
  type BackupPhotoEntry,
} from "../lib/backupFile";
import { ensurePersistentStorage } from "../lib/persistence";
import {
  safeGet,
  safeRemove,
  safeSet,
  setStorageErrorHandler,
} from "../lib/safeStorage";
import { boardKeySuffix, DEFAULT_BOARD_ID, DEMO_BOARD_ID } from "./boards";

/** colorId -> array of SLOTS_PER_BOARD photo ids (or null). */
type Boards = Record<string, (string | null)[]>;

/** photoId -> non-destructive grid crop transform. */
type Crops = Record<string, Crop>;

// Base storage keys. These are the player's first board's keys VERBATIM —
// multi-board support derives other boards' keys by suffixing the board id
// (see boardKeySuffix), so existing data is never moved or rewritten and a
// rolled-back build still reads it in place.
const STORAGE_KEY = "snaps.boards.v1";
const SAMPLE_KEY = "snaps.sampleIds.v1";
const CROP_KEY = "snaps.crops.v1";

// Durable layout backup, kept in IndexedDB (the `meta` store) alongside the
// photo bytes. localStorage is the primary home for the layout, but it can
// be cleared independently of IndexedDB (Safari "clear history", storage
// pressure, a stray site-data reset) — when that happens this backup lets us
// silently rebuild which photo sat in which slot. Bump the version if the
// snapshot shape ever changes incompatibly. Like the localStorage keys, this
// is the first board's key verbatim; other boards suffix their id onto it.
const BACKUP_META_KEY = "layout.v1";
const BACKUP_VERSION = 1;

interface LayoutBackup {
  v: number;
  savedAt: number;
  boards: Boards;
  crops: Crops;
  sampleIds: string[];
}

function emptyBoards(): Boards {
  const b: Boards = {};
  for (const c of COLORS) b[c.id] = Array(SLOTS_PER_BOARD).fill(null);
  return b;
}

function loadBoards(storageKey: string): Boards {
  const base = emptyBoards();
  try {
    const raw = safeGet(storageKey);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Boards;
    for (const c of COLORS) {
      const arr = Array.isArray(parsed[c.id]) ? parsed[c.id] : [];
      for (let i = 0; i < SLOTS_PER_BOARD; i++) {
        base[c.id][i] = typeof arr[i] === "string" ? arr[i] : null;
      }
    }
  } catch {
    /* fall back to empty */
  }
  return base;
}

function loadSampleIds(sampleKey: string): string[] {
  try {
    const raw = safeGet(sampleKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function loadCrops(cropKey: string): Crops {
  try {
    const raw = safeGet(cropKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Crops = {};
    for (const [id, c] of Object.entries(parsed as Record<string, unknown>)) {
      const v = c as Partial<Crop> | null;
      if (
        v &&
        typeof v.scale === "number" &&
        typeof v.x === "number" &&
        typeof v.y === "number"
      ) {
        out[id] = { scale: v.scale, x: v.x, y: v.y };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Rebuild boards / crops / sample ids from a layout backup, keeping only the
 * photos that still physically exist in IndexedDB (`presentIds`). Anything
 * referenced by the backup but no longer on the device is silently dropped,
 * so a restore can never resurrect a dangling slot. Returns the sanitized
 * state plus the count of slots actually refilled.
 */
function sanitizeBackup(
  backup: LayoutBackup,
  presentIds: Set<string>,
): { boards: Boards; crops: Crops; sampleIds: string[]; filled: number } {
  const boards = emptyBoards();
  let filled = 0;
  const src =
    backup.boards && typeof backup.boards === "object" ? backup.boards : {};
  for (const c of COLORS) {
    const arr = Array.isArray(src[c.id]) ? src[c.id] : [];
    for (let i = 0; i < SLOTS_PER_BOARD; i++) {
      const v = arr[i];
      if (typeof v === "string" && presentIds.has(v)) {
        boards[c.id][i] = v;
        filled++;
      }
    }
  }
  const crops: Crops = {};
  if (backup.crops && typeof backup.crops === "object") {
    for (const [id, c] of Object.entries(backup.crops)) {
      const cv = c as Partial<Crop> | null;
      if (
        cv &&
        typeof cv.scale === "number" &&
        typeof cv.x === "number" &&
        typeof cv.y === "number" &&
        presentIds.has(id)
      ) {
        crops[id] = { scale: cv.scale, x: cv.x, y: cv.y };
      }
    }
  }
  const sampleIds = Array.isArray(backup.sampleIds)
    ? backup.sampleIds.filter(
        (x) => typeof x === "string" && presentIds.has(x),
      )
    : [];
  return { boards, crops, sampleIds, filled };
}

/** Total filled slots across every color grid. */
function countFilled(boards: Boards): number {
  return COLORS.reduce(
    (n, c) => n + (boards[c.id]?.filter(Boolean).length ?? 0),
    0,
  );
}

/** Every distinct photo id currently placed in any slot. */
function placedIds(boards: Boards): string[] {
  const out = new Set<string>();
  for (const c of COLORS) {
    for (const id of boards[c.id] ?? []) if (id) out.add(id);
  }
  return [...out];
}

/** Byte-level health check for a batch of photo ids. */
async function verifyPhotos(ids: string[]): Promise<Map<string, PhotoHealth>> {
  const out = new Map<string, PhotoHealth>();
  await Promise.all(
    ids.map(async (id) => {
      out.set(id, await verifyPhoto(id));
    }),
  );
  return out;
}

/**
 * Rebuild a photo's display thumb from its intact original. This is the
 * recovery path for "thumb-broken" health: the browser lost the thumb's
 * backing bytes but the full-quality original still reads fine.
 */
async function repairThumb(id: string): Promise<boolean> {
  try {
    const rec = await getPhoto(id);
    if (!rec) return false;
    const processed = await processImage(rec.full);
    await putPhoto({
      ...rec,
      thumb: processed.thumb,
      type: processed.type,
      width: processed.width,
      height: processed.height,
    });
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Outcome of a manual resync, for the caller's messaging. */
export interface ResyncResult {
  /** Photos verified readable (including any repaired). */
  found: number;
  /** Thumbs rebuilt from intact originals. */
  repaired: number;
  /** Photos confirmed gone twice over; their slots were cleared. */
  lost: number;
  /** Photos whose state couldn't be determined (storage unreadable). */
  unknown: number;
}

/**
 * Whether any persisted board layout references this photo. Used by the
 * post-add janitor below. Errors count as "yes" — when storage can't be
 * read we must never conclude a photo is orphaned.
 */
function storedLayoutsContain(photoId: string): boolean {
  try {
    const needle = `"${photoId}"`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key !== STORAGE_KEY && !key.startsWith(`${STORAGE_KEY}.`)) continue;
      const raw = localStorage.getItem(key);
      if (raw && raw.includes(needle)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Read-only peek at any board's slot layout straight from localStorage, for
 * the boards list UI (mini previews + photo counts). Inactive boards have no
 * live store; this never writes.
 */
export function peekBoardLayout(
  boardId: string,
): Record<string, (string | null)[]> {
  return loadBoards(STORAGE_KEY + boardKeySuffix(boardId));
}

/**
 * Delete the demo board's contents: its photos from IndexedDB, its layout /
 * crop / sample keys from localStorage, and its durable layout backup.
 *
 * This is deliberately HARD-WIRED to the demo board — it takes no board id,
 * so no code path can ever aim it at a user's board. Callers must make sure
 * the demo board isn't the live (mounted) store when this runs, and remove
 * it from the registry afterwards (useBoards().removeDemoBoard).
 */
export async function clearDemoBoardData(): Promise<void> {
  const suffix = boardKeySuffix(DEMO_BOARD_ID);
  const layout = loadBoards(STORAGE_KEY + suffix);
  const ids = new Set<string>();
  for (const slots of Object.values(layout)) {
    for (const id of slots) if (id) ids.add(id);
  }
  await Promise.all(
    [...ids].map((id) => deletePhoto(id).catch(() => {})),
  );
  safeRemove(STORAGE_KEY + suffix);
  safeRemove(SAMPLE_KEY + suffix);
  safeRemove(CROP_KEY + suffix);
  // Neutralize the durable backup too. (Even a stale one would be harmless:
  // restores only re-attach photos that still exist in IndexedDB, and these
  // were just deleted — but don't leave it lying around.)
  const empty: LayoutBackup = {
    v: BACKUP_VERSION,
    savedAt: Date.now(),
    boards: emptyBoards(),
    crops: {},
    sampleIds: [],
  };
  await putMeta(BACKUP_META_KEY + suffix, empty).catch(() => {});
}

/** File extension for a photo's original MIME type, for backup archives. */
function extForType(type: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return map[type] ?? "img";
}

function isValidCrop(c: unknown): c is Crop {
  const v = c as Partial<Crop> | null;
  return (
    !!v &&
    typeof v.scale === "number" &&
    typeof v.x === "number" &&
    typeof v.y === "number"
  );
}

/**
 * Emitted (as store state) when an addPhoto placement fills the last empty
 * slot of a color grid. This is the ONLY trigger for completion celebrations,
 * and it deliberately fires from the genuine "a photo was just placed" path:
 * hydration restores, backup imports, replacements in already-full grids and
 * sample/tour seeding never produce one, so a celebration can never pop just
 * because existing data finished loading.
 */
export interface CompletionEvent {
  /** Monotonic per-mount id so consumers can tell consecutive events apart. */
  seq: number;
  /** The color grid this placement completed. */
  colorId: string;
  /** How many color grids are complete after this placement. */
  completedColors: number;
  /** True when this placement finished the entire board (every color full). */
  overallComplete: boolean;
}

interface StoreValue {
  boards: Boards;
  filledCount: (colorId: string) => number;
  isComplete: (colorId: string) => boolean;
  completedColors: number;
  totalFilled: number;
  totalSlots: number;
  /** Latest color-completion event — see CompletionEvent. */
  completion: CompletionEvent | null;
  addPhoto: (
    colorId: string,
    slot: number,
    file: Blob,
    opts?: { sample?: boolean }
  ) => Promise<string>;
  removePhoto: (colorId: string, slot: number) => Promise<void>;
  /** Swap the contents of two slots in a board. Either slot may be empty. */
  movePhoto: (colorId: string, fromSlot: number, toSlot: number) => void;
  clearBoard: (colorId: string) => Promise<void>;
  /** Per-photo non-destructive grid crop (undefined = default cover framing). */
  crops: Crops;
  /** Set or clear (pass null) a photo's grid crop. Never touches photo bytes. */
  setCrop: (photoId: string, crop: Crop | null) => void;
  /** Whether any currently-placed photo came from the sample set. */
  hasSamples: boolean;
  /** Number of placed photos that came from the sample set. */
  sampleCount: number;
  /** Removes every sample photo, leaving the player's own photos intact. */
  clearSamples: () => Promise<void>;
  /**
   * True when slots reference photos that verifiably won't render (confirmed
   * by re-checked byte reads) — the "counts are up but the grid is blank"
   * state. Drives the Resync banner on the home grid.
   */
  needsResync: boolean;
  /** True while a manual resync is running. */
  resyncing: boolean;
  /**
   * Manual recovery: reopen storage fresh, deep-verify every placed photo,
   * rebuild broken thumbs from intact originals, and only with this explicit
   * user action clear slots whose photos are confirmed gone (double-checked
   * clean reads). Never clears anything when storage merely failed to read.
   */
  resyncPhotos: () => Promise<ResyncResult | null>;
  /**
   * Cache-buster for photo renders. Bumped when stored bytes changed under
   * an id (thumb repair) or when previously-failing reads may now succeed —
   * key Thumbnails with it so they re-fetch.
   */
  photoEpoch: number;
  /**
   * Package this board — original photo bytes, layout, crops — into a
   * downloadable ZIP. `skipped` counts placed photos whose bytes couldn't
   * be read (they're left out rather than failing the whole backup).
   */
  exportBoardData: (
    boardName: string,
  ) => Promise<{ blob: Blob; filename: string; photoCount: number; skipped: number }>;
  /**
   * Replace this board's contents with a backup archive produced by
   * exportBoardData. Throws BackupFileError for files that aren't Snaps
   * backups and StorageQuotaError when the device is full; on any failure
   * the board is left exactly as it was.
   */
  importBoardData: (file: Blob) => Promise<{ placed: number }>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({
  boardId = DEFAULT_BOARD_ID,
  children,
}: {
  /**
   * Which board this store reads and writes. The provider must be remounted
   * (keyed) when the board changes — every storage key below derives from
   * this id once, at mount, and the whole hydration pass runs against it.
   */
  boardId?: string;
  children: ReactNode;
}) {
  const toast = useToast();
  // Per-board storage keys. The default board's suffix is empty, leaving the
  // original keys untouched for everyone's existing data.
  const suffix = boardKeySuffix(boardId);
  const storageKey = STORAGE_KEY + suffix;
  const sampleKey = SAMPLE_KEY + suffix;
  const cropKey = CROP_KEY + suffix;
  const backupMetaKey = BACKUP_META_KEY + suffix;
  const [boards, setBoards] = useState<Boards>(() => loadBoards(storageKey));
  const [sampleIds, setSampleIds] = useState<string[]>(() =>
    loadSampleIds(sampleKey),
  );
  const [crops, setCrops] = useState<Crops>(() => loadCrops(cropKey));

  // Hydration gate: flips true once the mount-time restore/reconcile pass has
  // run. The durable backup must not be written before this, or the empty
  // board briefly present after a wiped localStorage could clobber a good
  // backup before we get the chance to restore from it.
  const [hydrated, setHydrated] = useState(false);
  const [completion, setCompletion] = useState<CompletionEvent | null>(null);
  const completionSeqRef = useRef(0);
  const [needsResync, setNeedsResync] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [photoEpoch, setPhotoEpoch] = useState(0);
  const resyncingRef = useRef(false);
  // Whether the photo store read cleanly this session. When false we refuse
  // to overwrite the backup with an *empty* layout (the emptiness can't be
  // trusted); a non-empty layout is always safe to back up.
  const storeReadOkRef = useRef(false);

  // Keep a ref so async seeders read the latest sample set without re-binding.
  const sampleRef = useRef(sampleIds);
  sampleRef.current = sampleIds;
  // Mirror of `boards` for the post-add janitor (read inside timeouts).
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  // Mirror of `crops` for the backup exporter (read inside async work).
  const cropsRef = useRef(crops);
  cropsRef.current = crops;

  // Whether this provider is still the live store. Once the board switches
  // away (keyed remount) every pending setState here is silently dropped —
  // so an addPhoto that crosses the unmount would write bytes that no
  // layout will ever reference. addPhoto checks this and compensates.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Surface localStorage write failures (Safari private mode, quota) once.
  const storageToastShown = useRef(false);
  useEffect(() => {
    setStorageErrorHandler((_, op) => {
      if (op !== "set" || storageToastShown.current) return;
      storageToastShown.current = true;
      toast.push({
        title: "Storage is read-only",
        detail:
          "Your browser is blocking saves (often private/incognito mode). Boards won't persist.",
        tone: "warn",
        timeout: 6000,
      });
    });
    return () => setStorageErrorHandler(null);
  }, [toast]);

  useEffect(() => {
    safeSet(storageKey, JSON.stringify(boards));
  }, [storageKey, boards]);

  useEffect(() => {
    safeSet(sampleKey, JSON.stringify(sampleIds));
  }, [sampleKey, sampleIds]);

  useEffect(() => {
    safeSet(cropKey, JSON.stringify(crops));
  }, [cropKey, crops]);

  // Mount-time hydration. Two jobs, once:
  //   1. Self-heal — if localStorage came up empty but the durable backup in
  //      IndexedDB still points at photos that physically exist, restore the
  //      layout silently.
  //   2. Reconcile — otherwise drop board references to photos that are
  //      genuinely gone (partial wipe, eviction, manual db edits).
  useEffect(() => {
    let cancelled = false;
    // Read once for its initial localStorage-loaded value.
    const localCount = countFilled(boards);

    (async () => {
      const [ids, backup] = await Promise.all([
        existingPhotoIds(),
        getMeta<LayoutBackup>(backupMetaKey),
      ]);
      if (cancelled) return;

      // A clean read (even a genuinely empty one) means a currently-empty
      // layout is real and safe to mirror into the backup.
      storeReadOkRef.current = ids !== null;

      // 1. Self-heal. Guarded on a reliable id read so we only ever re-attach
      //    photos we've confirmed are still on the device.
      if (localCount === 0 && ids && backup) {
        const restored = sanitizeBackup(backup, ids);
        if (restored.filled > 0) {
          setBoards(restored.boards);
          setCrops(restored.crops);
          setSampleIds(restored.sampleIds);
          setHydrated(true);
          return;
        }
      }

      // 2. Reconcile — drop references to photos that are genuinely gone.
      //    Two guards make this safe against silent mass loss:
      //      - ids === null: the read failed/was blocked → don't touch boards.
      //      - the store reports *zero* photos while localStorage still claims
      //        some: almost certainly a spurious-empty read (iOS Safari is
      //        known to return an empty result right after launch), not a real
      //        wipe → also skip. A genuine total eviction just leaves dangling
      //        refs that self-correct on a later clean read, which is harmless
      //        and infinitely preferable to nuking everyone's layout.
      //    Partial mismatches (some present, some gone) still reconcile.
      const spuriousEmpty = ids !== null && ids.size === 0 && localCount > 0;
      if (ids && !spuriousEmpty) {
        let dropped = 0;
        setBoards((prev) => {
          const next: Boards = {};
          for (const c of COLORS) {
            next[c.id] = (prev[c.id] ?? Array(SLOTS_PER_BOARD).fill(null)).map(
              (id) => {
                if (id && !ids.has(id)) {
                  dropped++;
                  return null;
                }
                return id;
              },
            );
          }
          return dropped > 0 ? next : prev;
        });
        if (dropped > 0) {
          setSampleIds((s) => s.filter((x) => ids.has(x)));
          setCrops((prev) => {
            const next: Crops = {};
            for (const [id, c] of Object.entries(prev)) {
              if (ids.has(id)) next[id] = c;
            }
            return Object.keys(next).length === Object.keys(prev).length
              ? prev
              : next;
          });
          toast.push({
            title: `Recovered ${dropped} missing photo${dropped === 1 ? "" : "s"}`,
            detail: "Some slots were empty in storage and have been cleared.",
            tone: "info",
          });
        }
      }

      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
    // Runs once on mount. `boards` is read only for its initial value, and
    // `backupMetaKey` is fixed for this mount (the provider is remounted per
    // board); the stable `toast` is the sole dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  // Durable layout backup → IndexedDB, alongside the photo bytes. Debounced so
  // a burst of edits coalesces into a single write. Gated on `hydrated` so we
  // never persist the transient empty board that exists before the restore
  // pass; and we refuse to overwrite a saved backup with an empty layout
  // unless the photo store read cleanly this session (so a blocked read can't
  // erase a good backup). Failures are swallowed — this is a best-effort
  // secondary copy; localStorage remains the primary, synchronous store.
  useEffect(() => {
    if (!hydrated) return;
    if (countFilled(boards) === 0 && !storeReadOkRef.current) return;
    const snapshot: LayoutBackup = {
      v: BACKUP_VERSION,
      savedAt: Date.now(),
      boards,
      crops,
      sampleIds,
    };
    const t = window.setTimeout(() => {
      void putMeta(backupMetaKey, snapshot).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [hydrated, backupMetaKey, boards, crops, sampleIds]);

  // Post-hydration health check — the escape hatch for the states the
  // reconcile pass deliberately leaves alone. Reconcile compares *keys* and
  // refuses to act on a read that says "everything is gone" (it can't tell a
  // real total eviction from iOS's transient empty-right-after-launch quirk),
  // so two failure modes used to show counts forever over a blank grid:
  //   - every referenced key missing (total eviction with surviving
  //     localStorage), skipped by the spurious-empty guard on every launch;
  //   - keys all present but blob bytes unreadable (Chromium can lose a
  //     blob's backing file while keeping its record), invisible to any
  //     key-level check.
  // This pass reads actual bytes. Anything repairable is repaired silently
  // (a broken thumb is rebuilt from the intact original). Anything that
  // looks lost is re-verified once, seconds later on fresh connections, to
  // rule out transients — and if it's still bad we only *flag* it
  // (needsResync → the Resync banner). Clearing a user's slots stays behind
  // their explicit tap in resyncPhotos, never automatic.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      const placed = placedIds(boardsRef.current);
      if (placed.length === 0) return;
      const first = await verifyPhotos(placed);
      if (cancelled) return;

      const broken = placed.filter((id) => first.get(id) === "thumb-broken");
      if (broken.length > 0) {
        const fixed = await Promise.all(broken.map(repairThumb));
        if (cancelled) return;
        if (fixed.some(Boolean)) setPhotoEpoch((e) => e + 1);
      }

      const bad = placed.filter((id) => {
        const h = first.get(id);
        return h === "absent" || h === "bytes-lost" || h === "unknown";
      });
      if (bad.length === 0) return;

      await sleep(4000);
      if (cancelled) return;
      resetConnections();
      const recheck = await verifyPhotos(bad);
      if (cancelled) return;

      const nowBroken = bad.filter((id) => recheck.get(id) === "thumb-broken");
      if (nowBroken.length > 0) await Promise.all(nowBroken.map(repairThumb));
      if (cancelled) return;

      const recovered = bad.some((id) => {
        const h = recheck.get(id);
        return h === "ok" || h === "thumb-broken";
      });
      // Re-render thumbnails whose first reads failed but now succeed.
      if (recovered) setPhotoEpoch((e) => e + 1);

      const stillBad = bad.some((id) => {
        const h = recheck.get(id);
        return h === "absent" || h === "bytes-lost" || h === "unknown";
      });
      if (stillBad) setNeedsResync(true);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once, when hydration completes for this board's provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const resyncPhotos = useCallback(async (): Promise<ResyncResult | null> => {
    if (resyncingRef.current) return null;
    resyncingRef.current = true;
    setResyncing(true);
    try {
      resetConnections();
      const placed = placedIds(boardsRef.current);
      if (placed.length === 0) {
        setNeedsResync(false);
        return { found: 0, repaired: 0, lost: 0, unknown: 0 };
      }

      const first = await verifyPhotos(placed);
      let repaired = 0;
      for (const id of placed) {
        if (first.get(id) === "thumb-broken" && (await repairThumb(id))) {
          repaired++;
        }
      }

      // Removal candidates need a second, independent confirmation on fresh
      // connections before we touch the layout. "unknown" (the read itself
      // failed) is never a removal candidate — absence of evidence only
      // counts when the read demonstrably worked.
      const suspect = placed.filter((id) => {
        const h = first.get(id);
        return h === "absent" || h === "bytes-lost";
      });
      const confirmedLost: string[] = [];
      const unknownIds = placed.filter((id) => first.get(id) === "unknown");
      if (suspect.length > 0) {
        await sleep(800);
        resetConnections();
        const second = await verifyPhotos(suspect);
        for (const id of suspect) {
          const h = second.get(id);
          if (h === "absent" || h === "bytes-lost") confirmedLost.push(id);
          else if (h === "thumb-broken" && (await repairThumb(id))) repaired++;
          else if (h === "unknown") unknownIds.push(id);
        }
      }

      if (!mountedRef.current) return null;

      if (confirmedLost.length > 0) {
        const lost = new Set(confirmedLost);
        setBoards((prev) => {
          const next: Boards = {};
          for (const c of COLORS) {
            next[c.id] = (prev[c.id] ?? Array(SLOTS_PER_BOARD).fill(null)).map(
              (id) => (id && lost.has(id) ? null : id),
            );
          }
          return next;
        });
        setSampleIds((s) => s.filter((x) => !lost.has(x)));
        setCrops((prev) => {
          const next: Crops = {};
          for (const [id, c] of Object.entries(prev)) {
            if (!lost.has(id)) next[id] = c;
          }
          return next;
        });
        // The loss was confirmed by clean reads — the (possibly now empty)
        // layout is trustworthy and safe to mirror into the durable backup.
        storeReadOkRef.current = true;
      }

      // Force every thumbnail to re-fetch: repaired thumbs re-render and
      // photos whose earlier reads failed transiently get a fresh attempt.
      setPhotoEpoch((e) => e + 1);
      setNeedsResync(unknownIds.length > 0);

      return {
        found: placed.length - confirmedLost.length - unknownIds.length,
        repaired,
        lost: confirmedLost.length,
        unknown: unknownIds.length,
      };
    } finally {
      resyncingRef.current = false;
      if (mountedRef.current) setResyncing(false);
    }
  }, []);

  const exportBoardData = useCallback(async (boardName: string) => {
    const layout = boardsRef.current;
    const cropsNow = cropsRef.current;
    const colors: BackupManifest["colors"] = {};
    const files: { name: string; blob: Blob }[] = [];
    let photoCount = 0;
    let skipped = 0;
    for (const c of COLORS) {
      const slots = layout[c.id] ?? Array(SLOTS_PER_BOARD).fill(null);
      const entries: (BackupPhotoEntry | null)[] = [];
      for (let i = 0; i < SLOTS_PER_BOARD; i++) {
        const id = slots[i];
        if (!id) {
          entries.push(null);
          continue;
        }
        const rec = await getPhoto(id).catch(() => undefined);
        // Confirm the original's bytes actually read before including it —
        // a photo with a lost backing file would fail the whole archive.
        let readable = false;
        if (rec) {
          try {
            await rec.full.slice(0, 1).arrayBuffer();
            readable = rec.full.size > 0;
          } catch {
            readable = false;
          }
        }
        if (!rec || !readable) {
          skipped++;
          entries.push(null);
          continue;
        }
        const name = `photos/${c.id}-${i + 1}.${extForType(rec.type)}`;
        const entry: BackupPhotoEntry = {
          file: name,
          type: rec.type || "image/jpeg",
        };
        if (cropsNow[id]) entry.crop = cropsNow[id];
        files.push({ name, blob: rec.full });
        entries.push(entry);
        photoCount++;
      }
      colors[c.id] = entries;
    }
    const manifest: BackupManifest = {
      app: "snaps-board-backup",
      version: 1,
      boardName,
      savedAt: Date.now(),
      colors,
    };
    files.unshift({
      name: MANIFEST_NAME,
      blob: new Blob([JSON.stringify(manifest, null, 2)], {
        type: "application/json",
      }),
    });
    const blob = await buildBackupZip(files);
    const date = new Date().toISOString().slice(0, 10);
    const safeName =
      boardName
        .replace(/[^\w\- ]+/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase() || "board";
    return {
      blob,
      filename: `snaps-${safeName}-${date}.zip`,
      photoCount,
      skipped,
    };
  }, []);

  const importBoardData = useCallback(async (file: Blob) => {
    // Parses and validates before anything is written; throws
    // BackupFileError for files that aren't Snaps backups.
    const { manifest, files } = await readBackupZip(file);
    if (!mountedRef.current) throw new Error("Board is no longer active");

    const nextBoards = emptyBoards();
    const nextCrops: Crops = {};
    const written: string[] = [];
    let placed = 0;
    try {
      for (const c of COLORS) {
        const entries = Array.isArray(manifest.colors?.[c.id])
          ? manifest.colors[c.id]
          : [];
        for (let i = 0; i < SLOTS_PER_BOARD; i++) {
          const entry = entries[i];
          if (!entry || typeof entry.file !== "string") continue;
          const raw = files.get(entry.file);
          if (!raw) continue;
          const typed = new Blob([raw], {
            type:
              typeof entry.type === "string" && entry.type
                ? entry.type
                : "image/jpeg",
          });
          // A single undecodable photo (e.g. a HEIC backup restored on a
          // browser without HEIC support) skips that slot rather than
          // failing the whole restore; storage errors still abort below.
          let processed;
          try {
            processed = await processImage(typed);
          } catch {
            continue;
          }
          const id =
            crypto.randomUUID?.() ??
            `${Date.now()}-${Math.random().toString(36)}`;
          await putPhoto({
            id,
            full: typed,
            thumb: processed.thumb,
            type: processed.type,
            width: processed.width,
            height: processed.height,
            addedAt: Date.now(),
          });
          written.push(id);
          nextBoards[c.id][i] = id;
          if (isValidCrop(entry.crop)) {
            nextCrops[id] = {
              scale: entry.crop.scale,
              x: entry.crop.x,
              y: entry.crop.y,
            };
          }
          placed++;
        }
      }
    } catch (err) {
      // All-or-nothing: take back everything written so a failed restore
      // leaves both the board and the photo store exactly as they were.
      await Promise.all(written.map((id) => deletePhoto(id).catch(() => {})));
      throw err;
    }

    if (!mountedRef.current) {
      await Promise.all(written.map((id) => deletePhoto(id).catch(() => {})));
      throw new Error("Board closed while restoring");
    }

    const previous = placedIds(boardsRef.current);
    setBoards(nextBoards);
    setCrops(nextCrops);
    setSampleIds([]);
    for (const id of previous) void deletePhoto(id);
    storeReadOkRef.current = true;
    setNeedsResync(false);
    setPhotoEpoch((e) => e + 1);
    void ensurePersistentStorage();
    return { placed };
  }, []);

  const filledCount = useCallback(
    (colorId: string) => boards[colorId]?.filter(Boolean).length ?? 0,
    [boards]
  );

  const isComplete = useCallback(
    (colorId: string) => filledCount(colorId) === SLOTS_PER_BOARD,
    [filledCount]
  );

  const completedColors = useMemo(
    () => COLORS.filter((c) => filledCount(c.id) === SLOTS_PER_BOARD).length,
    [filledCount]
  );

  const totalFilled = useMemo(
    () => COLORS.reduce((sum, c) => sum + filledCount(c.id), 0),
    [filledCount]
  );

  const totalSlots = COLORS.length * SLOTS_PER_BOARD;

  const addPhoto = useCallback(
    async (colorId: string, slot: number, file: Blob, opts?: { sample?: boolean }) => {
      if (!mountedRef.current) {
        throw new Error("Board is no longer active");
      }
      const processed = await processImage(file);
      const id =
        crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36)}`;
      const record: PhotoRecord = {
        id,
        full: file, // original bytes, untouched
        thumb: processed.thumb,
        type: processed.type,
        width: processed.width,
        height: processed.height,
        addedAt: Date.now(),
      };
      try {
        await putPhoto(record);
      } catch (err) {
        if (err instanceof StorageQuotaError) {
          toast.push({
            title: "Out of storage",
            detail:
              "Your device is full. Remove a photo or free up space and try again.",
            tone: "error",
            timeout: 5500,
          });
        }
        throw err;
      }

      // If the board switched away while the bytes were being written, the
      // setBoards below would be dropped and the record would be orphaned —
      // take it back out and tell the caller.
      if (!mountedRef.current) {
        void deletePhoto(id);
        throw new Error("Board closed while saving");
      }

      // Successful save → (re-)request durable storage, throttled internally.
      void ensurePersistentStorage();

      if (opts?.sample) setSampleIds((prev) => [...prev, id]);

      // Completion detection, against the pre-add snapshot: this placement
      // completes the color only when it fills the grid's single remaining
      // empty slot. Replacing a photo in a full grid never qualifies.
      const prevSlots = boardsRef.current[colorId] ?? [];
      const completesColor =
        !prevSlots[slot] &&
        prevSlots.filter(Boolean).length === SLOTS_PER_BOARD - 1;

      setBoards((prev) => {
        const board = [...(prev[colorId] ?? [])];
        const previous = board[slot];
        board[slot] = id;
        // Drop any photo we just replaced so it doesn't orphan in IndexedDB.
        if (previous) {
          void deletePhoto(previous);
          setSampleIds((s) => s.filter((x) => x !== previous));
          dropCrop(previous);
        }
        return { ...prev, [colorId]: board };
      });

      // Sample/tour seeding stays silent — celebrations are for the player's
      // own photos, and the guided tour must never be interrupted by one.
      if (completesColor && !opts?.sample) {
        const completedAfter = COLORS.filter(
          (c) =>
            c.id === colorId ||
            (boardsRef.current[c.id]?.filter(Boolean).length ?? 0) ===
              SLOTS_PER_BOARD,
        ).length;
        completionSeqRef.current += 1;
        setCompletion({
          seq: completionSeqRef.current,
          colorId,
          completedColors: completedAfter,
          overallComplete: completedAfter === COLORS.length,
        });
      }

      // Janitor: the setBoards above is only *queued* — if this provider
      // unmounts before React commits it (board switched away mid-add, e.g.
      // a demo cascade interrupted by "Clear demo board"), the update is
      // silently dropped and the stored bytes would be referenced by no
      // layout, ever. Verify shortly after the dust settles and take the
      // photo back out if nothing references it. Both checks err toward
      // keeping: a live in-memory reference (covers blocked localStorage,
      // e.g. private mode) or any persisted layout reference wins.
      window.setTimeout(() => {
        if (
          mountedRef.current &&
          Object.values(boardsRef.current).some((slots) => slots.includes(id))
        ) {
          return;
        }
        if (storedLayoutsContain(id)) return;
        void deletePhoto(id);
      }, 2000);

      // Hand back the new id so callers can immediately act on it (e.g. open
      // the crop editor on a freshly-shared photo).
      return id;
    },
    [toast]
  );

  // Forget a photo's crop. Defined as a ref-free helper so the removal paths
  // (replace / remove / clear) can call it from inside their state updaters.
  const dropCrop = useCallback((id: string) => {
    setCrops((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setCrop = useCallback(
    (photoId: string, crop: Crop | null) => {
      setCrops((prev) => {
        if (crop && !isIdentityCrop(crop)) {
          return { ...prev, [photoId]: crop };
        }
        if (!(photoId in prev)) return prev;
        const next = { ...prev };
        delete next[photoId];
        return next;
      });
    },
    []
  );

  const movePhoto = useCallback(
    (colorId: string, fromSlot: number, toSlot: number) => {
      if (fromSlot === toSlot) return;
      setBoards((prev) => {
        const board = [...(prev[colorId] ?? [])];
        if (fromSlot >= board.length || toSlot >= board.length) return prev;
        [board[fromSlot], board[toSlot]] = [board[toSlot], board[fromSlot]];
        return { ...prev, [colorId]: board };
      });
    },
    [],
  );

  const removePhoto = useCallback(async (colorId: string, slot: number) => {
    setBoards((prev) => {
      const board = [...(prev[colorId] ?? [])];
      const id = board[slot];
      board[slot] = null;
      if (id) {
        void deletePhoto(id);
        setSampleIds((s) => s.filter((x) => x !== id));
        dropCrop(id);
      }
      return { ...prev, [colorId]: board };
    });
  }, [dropCrop]);

  const clearBoard = useCallback(async (colorId: string) => {
    setBoards((prev) => {
      const board = prev[colorId] ?? [];
      for (const id of board) if (id) void deletePhoto(id);
      const removed = new Set(board.filter(Boolean) as string[]);
      setSampleIds((s) => s.filter((x) => !removed.has(x)));
      setCrops((c) => {
        const next: Crops = {};
        for (const [id, crop] of Object.entries(c)) {
          if (!removed.has(id)) next[id] = crop;
        }
        return next;
      });
      return { ...prev, [colorId]: Array(SLOTS_PER_BOARD).fill(null) };
    });
  }, []);

  const clearSamples = useCallback(async () => {
    const ids = new Set(sampleRef.current);
    if (ids.size === 0) return;
    setBoards((prev) => {
      const next: Boards = {};
      for (const c of COLORS) {
        next[c.id] = (prev[c.id] ?? []).map((id) => {
          if (id && ids.has(id)) {
            void deletePhoto(id);
            return null;
          }
          return id;
        });
      }
      return next;
    });
    setCrops((c) => {
      const next: Crops = {};
      for (const [id, crop] of Object.entries(c)) {
        if (!ids.has(id)) next[id] = crop;
      }
      return next;
    });
    setSampleIds([]);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      boards,
      filledCount,
      isComplete,
      completedColors,
      totalFilled,
      totalSlots,
      completion,
      addPhoto,
      removePhoto,
      movePhoto,
      clearBoard,
      crops,
      setCrop,
      hasSamples: sampleIds.length > 0,
      sampleCount: sampleIds.length,
      clearSamples,
      needsResync,
      resyncing,
      resyncPhotos,
      photoEpoch,
      exportBoardData,
      importBoardData,
    }),
    [
      boards,
      filledCount,
      isComplete,
      completedColors,
      totalFilled,
      totalSlots,
      completion,
      addPhoto,
      removePhoto,
      movePhoto,
      clearBoard,
      crops,
      setCrop,
      sampleIds,
      clearSamples,
      needsResync,
      resyncing,
      resyncPhotos,
      photoEpoch,
      exportBoardData,
      importBoardData,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
