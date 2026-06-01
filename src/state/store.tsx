import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { COLORS, SLOTS_PER_BOARD } from "../colors";
import { deletePhoto, putPhoto, type PhotoRecord } from "../lib/db";
import { processImage } from "../lib/image";

/** colorId -> array of SLOTS_PER_BOARD photo ids (or null). */
type Boards = Record<string, (string | null)[]>;

const STORAGE_KEY = "snaps.boards.v1";

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

interface StoreValue {
  boards: Boards;
  filledCount: (colorId: string) => number;
  isComplete: (colorId: string) => boolean;
  completedColors: number;
  totalFilled: number;
  totalSlots: number;
  addPhoto: (colorId: string, slot: number, file: Blob) => Promise<void>;
  removePhoto: (colorId: string, slot: number) => Promise<void>;
  clearBoard: (colorId: string) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boards, setBoards] = useState<Boards>(loadBoards);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  }, [boards]);

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
    async (colorId: string, slot: number, file: Blob) => {
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

      setBoards((prev) => {
        const board = [...(prev[colorId] ?? [])];
        const previous = board[slot];
        board[slot] = id;
        // Drop any photo we just replaced so it doesn't orphan in IndexedDB.
        if (previous) void deletePhoto(previous);
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
      if (id) void deletePhoto(id);
      return { ...prev, [colorId]: board };
    });
  }, []);

  const clearBoard = useCallback(async (colorId: string) => {
    setBoards((prev) => {
      const board = prev[colorId] ?? [];
      for (const id of board) if (id) void deletePhoto(id);
      return { ...prev, [colorId]: Array(SLOTS_PER_BOARD).fill(null) };
    });
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
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
