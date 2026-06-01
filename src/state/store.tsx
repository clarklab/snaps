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
import { COLORS, SLOTS_PER_BOARD } from "../colors";
import { deletePhoto, putPhoto, type PhotoRecord } from "../lib/db";
import { processImage } from "../lib/image";

/** colorId -> array of SLOTS_PER_BOARD photo ids (or null). */
type Boards = Record<string, (string | null)[]>;

const STORAGE_KEY = "snaps.boards.v1";
const SAMPLE_KEY = "snaps.sampleIds.v1";

function emptyBoards(): Boards {
  const b: Boards = {};
  for (const c of COLORS) b[c.id] = Array(SLOTS_PER_BOARD).fill(null);
  return b;
}

function loadBoards(): Boards {
  const base = emptyBoards();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
    const raw = localStorage.getItem(SAMPLE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
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
  clearBoard: (colorId: string) => Promise<void>;
  /** Whether any currently-placed photo came from the sample set. */
  hasSamples: boolean;
  /** Removes every sample photo, leaving the player's own photos intact. */
  clearSamples: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boards, setBoards] = useState<Boards>(loadBoards);
  const [sampleIds, setSampleIds] = useState<string[]>(loadSampleIds);

  // Keep a ref so async seeders read the latest sample set without re-binding.
  const sampleRef = useRef(sampleIds);
  sampleRef.current = sampleIds;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  }, [boards]);

  useEffect(() => {
    localStorage.setItem(SAMPLE_KEY, JSON.stringify(sampleIds));
  }, [sampleIds]);

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
      await putPhoto(record);

      if (opts?.sample) setSampleIds((prev) => [...prev, id]);

      setBoards((prev) => {
        const board = [...(prev[colorId] ?? [])];
        const previous = board[slot];
        board[slot] = id;
        // Drop any photo we just replaced so it doesn't orphan in IndexedDB.
        if (previous) {
          void deletePhoto(previous);
          setSampleIds((s) => s.filter((x) => x !== previous));
        }
        return { ...prev, [colorId]: board };
      });
    },
    []
  );

  const removePhoto = useCallback(async (colorId: string, slot: number) => {
    setBoards((prev) => {
      const board = [...(prev[colorId] ?? [])];
      const id = board[slot];
      board[slot] = null;
      if (id) {
        void deletePhoto(id);
        setSampleIds((s) => s.filter((x) => x !== id));
      }
      return { ...prev, [colorId]: board };
    });
  }, []);

  const clearBoard = useCallback(async (colorId: string) => {
    setBoards((prev) => {
      const board = prev[colorId] ?? [];
      for (const id of board) if (id) void deletePhoto(id);
      const removed = new Set(board.filter(Boolean) as string[]);
      setSampleIds((s) => s.filter((x) => !removed.has(x)));
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
      clearBoard,
      hasSamples: sampleIds.length > 0,
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
      clearBoard,
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
