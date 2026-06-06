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
  putPhoto,
  StorageQuotaError,
  type PhotoRecord,
} from "../lib/db";
import { processImage } from "../lib/image";
import { type Crop, isIdentityCrop } from "../lib/crop";
import { safeGet, safeSet, setStorageErrorHandler } from "../lib/safeStorage";

/** colorId -> array of SLOTS_PER_BOARD photo ids (or null). */
type Boards = Record<string, (string | null)[]>;

/** photoId -> non-destructive grid crop transform. */
type Crops = Record<string, Crop>;

const STORAGE_KEY = "snaps.boards.v1";
const SAMPLE_KEY = "snaps.sampleIds.v1";
const CROP_KEY = "snaps.crops.v1";
const PERSIST_KEY = "snaps.persistRequested.v1";

function emptyBoards(): Boards {
  const b: Boards = {};
  for (const c of COLORS) b[c.id] = Array(SLOTS_PER_BOARD).fill(null);
  return b;
}

function loadBoards(): Boards {
  const base = emptyBoards();
  try {
    const raw = safeGet(STORAGE_KEY);
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

function loadSampleIds(): string[] {
  try {
    const raw = safeGet(SAMPLE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function loadCrops(): Crops {
  try {
    const raw = safeGet(CROP_KEY);
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
 * Best-effort: ask the OS not to evict our IndexedDB data. The result is
 * cached in localStorage so we never nag the user again. iOS Safari grants
 * this silently after some engagement; Chrome grants it for installed PWAs.
 */
async function requestPersistentStorage(): Promise<void> {
  if (safeGet(PERSIST_KEY)) return;
  try {
    const persist = navigator.storage?.persist;
    if (!persist) return;
    const granted = await persist.call(navigator.storage);
    safeSet(PERSIST_KEY, granted ? "granted" : "denied");
  } catch {
    /* no-op */
  }
}

interface StoreValue {
  boards: Boards;
  filledCount: (colorId: string) => number;
  isComplete: (colorId: string) => boolean;
  completedColors: number;
  totalFilled: number;
  totalSlots: number;
  addPhoto: (
    colorId: string,
    slot: number,
    file: Blob,
    opts?: { sample?: boolean }
  ) => Promise<void>;
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
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [boards, setBoards] = useState<Boards>(loadBoards);
  const [sampleIds, setSampleIds] = useState<string[]>(loadSampleIds);
  const [crops, setCrops] = useState<Crops>(loadCrops);

  // Keep a ref so async seeders read the latest sample set without re-binding.
  const sampleRef = useRef(sampleIds);
  sampleRef.current = sampleIds;

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
    safeSet(STORAGE_KEY, JSON.stringify(boards));
  }, [boards]);

  useEffect(() => {
    safeSet(SAMPLE_KEY, JSON.stringify(sampleIds));
  }, [sampleIds]);

  useEffect(() => {
    safeSet(CROP_KEY, JSON.stringify(crops));
  }, [crops]);

  // Reconcile boards with IndexedDB once on mount: drop refs to photos that
  // no longer exist (partial wipe, storage eviction, manual db edits).
  useEffect(() => {
    let cancelled = false;
    existingPhotoIds().then((ids) => {
      if (cancelled) return;
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
    });
    return () => {
      cancelled = true;
    };
  }, [toast]);

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

      // First successful save → best-effort persistent-storage request.
      void requestPersistentStorage();

      if (opts?.sample) setSampleIds((prev) => [...prev, id]);

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
      addPhoto,
      removePhoto,
      movePhoto,
      clearBoard,
      crops,
      setCrop,
      hasSamples: sampleIds.length > 0,
      sampleCount: sampleIds.length,
      clearSamples,
    }),
    [
      boards,
      filledCount,
      isComplete,
      completedColors,
      totalFilled,
      totalSlots,
      addPhoto,
      removePhoto,
      movePhoto,
      clearBoard,
      crops,
      setCrop,
      sampleIds,
      clearSamples,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
