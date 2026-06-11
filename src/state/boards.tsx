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
import { getMeta, putMeta } from "../lib/db";
import { safeGet, safeSet } from "../lib/safeStorage";

/**
 * Board registry — the list of the player's boards (each board is a full
 * nine-color quest with its own layout, crops and samples) plus which one is
 * active.
 *
 * Data-safety ground rules (we have real users mid-holiday):
 *
 * 1. The first board everyone already has keeps the ORIGINAL storage keys,
 *    verbatim: `snaps.boards.v1`, `snaps.crops.v1`, `snaps.sampleIds.v1` and
 *    the IndexedDB layout backup `layout.v1`. There is no migration step at
 *    all — nothing is moved, renamed or rewritten — so existing data cannot
 *    be corrupted by this feature, and an older build rolled back onto this
 *    data still reads it perfectly (it simply shows the first board).
 * 2. Extra boards live under suffixed copies of those keys
 *    (`snaps.boards.v1.<id>` …, `layout.v1.<id>`), invisible to old builds
 *    but fully isolated from each other and from the first board.
 * 3. The registry itself is tiny and lives in localStorage with a mirror in
 *    IndexedDB meta (same durability as the photo bytes). If the registry is
 *    ever lost, boards are additionally rediscovered by scanning for their
 *    suffixed layout keys — a lost registry can hide a name, never photos.
 * 4. There is deliberately no "delete board" anywhere in this layer.
 */

export interface BoardInfo {
  id: string;
  name: string;
  createdAt: number;
}

export const DEFAULT_BOARD_ID = "default";
export const DEFAULT_BOARD_NAME = "My Snaps";

/**
 * Reserved board for demos: the guided tour and the sample photos play out
 * here, never inside a user's own board. It's created on demand, listed
 * like any board while it exists, and is the ONLY board that can ever be
 * removed — and even then only through the demo-clear flow, which deletes
 * nothing but this board's own contents. User-created boards get UUID ids,
 * so neither reserved id can collide with one.
 */
export const DEMO_BOARD_ID = "demo";
export const DEMO_BOARD_NAME = "Demo board";

const LIST_KEY = "snaps.boardList.v1";
const ACTIVE_KEY = "snaps.activeBoard.v1";
/** IndexedDB meta mirror of the registry (survives a localStorage wipe). */
const LIST_META_KEY = "boards.v1";
/** Base of the per-board layout keys; must match STORAGE_KEY in store.tsx. */
const LAYOUT_KEY_BASE = "snaps.boards.v1";
/** Placeholder name for boards rediscovered without their registry entry. */
const RECOVERED_NAME = "Recovered board";

const MAX_NAME_LENGTH = 40;

/**
 * Storage-key suffix for a board. The default board maps to the empty
 * suffix so its data stays under the original pre-multi-board keys.
 */
export function boardKeySuffix(boardId: string): string {
  return boardId === DEFAULT_BOARD_ID ? "" : `.${boardId}`;
}

/** Collapse whitespace, trim, cap length. Empty result = invalid name. */
export function cleanBoardName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}

interface RegistrySnapshot {
  v: number;
  boards: BoardInfo[];
  activeId: string;
}

function sanitizeBoardList(raw: unknown): BoardInfo[] {
  if (!Array.isArray(raw)) return [];
  const out: BoardInfo[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const b = item as Partial<BoardInfo> | null;
    if (!b || typeof b.id !== "string" || !b.id || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push({
      id: b.id,
      name:
        typeof b.name === "string" && cleanBoardName(b.name)
          ? cleanBoardName(b.name)
          : b.id === DEFAULT_BOARD_ID
            ? DEFAULT_BOARD_NAME
            : RECOVERED_NAME,
      createdAt: typeof b.createdAt === "number" ? b.createdAt : 0,
    });
  }
  return out;
}

/** Everyone has the first board, always listed first. */
function ensureDefaultBoard(list: BoardInfo[]): BoardInfo[] {
  const def = list.find((b) => b.id === DEFAULT_BOARD_ID) ?? {
    id: DEFAULT_BOARD_ID,
    name: DEFAULT_BOARD_NAME,
    createdAt: 0,
  };
  return [def, ...list.filter((b) => b.id !== DEFAULT_BOARD_ID)];
}

/**
 * Boards whose layout data exists on the device but which the registry has
 * forgotten (cleared key, divergent tabs). Their photos and layout are fully
 * intact under the suffixed keys; only the name needs recovering, which the
 * meta mirror usually supplies a moment later.
 */
function scanOrphanedBoardIds(): string[] {
  const prefix = `${LAYOUT_KEY_BASE}.`;
  try {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) ids.push(key.slice(prefix.length));
    }
    return ids;
  } catch {
    return [];
  }
}

interface RegistryState {
  boards: BoardInfo[];
  activeId: string;
  /** Whether localStorage actually had a registry (vs. synthesized). */
  hadLocal: boolean;
}

function loadInitialState(): RegistryState {
  let boards: BoardInfo[] = [];
  let hadLocal = false;
  try {
    const raw = safeGet(LIST_KEY);
    if (raw) {
      boards = sanitizeBoardList(JSON.parse(raw));
      hadLocal = boards.length > 0;
    }
  } catch {
    /* fall through to the synthesized default */
  }
  boards = ensureDefaultBoard(boards);
  for (const id of scanOrphanedBoardIds()) {
    if (!boards.some((b) => b.id === id)) {
      boards.push({ id, name: RECOVERED_NAME, createdAt: 0 });
    }
  }
  const storedActive = safeGet(ACTIVE_KEY);
  const activeId =
    storedActive && boards.some((b) => b.id === storedActive)
      ? storedActive
      : DEFAULT_BOARD_ID;
  return { boards, activeId, hadLocal };
}

interface BoardsValue {
  boards: BoardInfo[];
  activeBoardId: string;
  activeBoard: BoardInfo;
  /**
   * Create a board with the given name and switch to it. Returns the new
   * board's id, or null if the name is empty after cleaning.
   */
  createBoard: (name: string) => string | null;
  /** Switch the active board. Unknown ids are ignored. */
  switchBoard: (id: string) => void;
  /** Rename a board. Empty (after cleaning) or unknown ids are ignored. */
  renameBoard: (id: string, name: string) => void;
  /** Create the demo board if needed and switch to it. */
  openDemoBoard: () => void;
  /**
   * Drop the demo board from the registry (and land on the first board if
   * it was active). Registry-only and hard-wired to the demo id — callers
   * are responsible for having cleared its contents first.
   */
  removeDemoBoard: () => void;
}

const BoardsContext = createContext<BoardsValue | null>(null);

export function BoardsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RegistryState>(loadInitialState);

  // Merge in the IndexedDB mirror once: boards missing locally (wiped or
  // divergent localStorage) are re-added, placeholder names recover their
  // real ones, and — only when localStorage had no registry at all — the
  // previously-active board is restored too.
  const mergedRef = useRef(false);
  useEffect(() => {
    if (mergedRef.current) return;
    mergedRef.current = true;
    let cancelled = false;
    void getMeta<RegistrySnapshot>(LIST_META_KEY).then((backup) => {
      if (cancelled || !backup) return;
      const fromMeta = new Map(
        sanitizeBoardList(backup.boards).map((b) => [b.id, b]),
      );
      if (fromMeta.size === 0) return;
      setState((prev) => {
        let changed = false;
        const boards = prev.boards.map((b) => {
          const m = fromMeta.get(b.id);
          if (m && b.name === RECOVERED_NAME && m.name !== RECOVERED_NAME) {
            changed = true;
            return { ...b, name: m.name, createdAt: m.createdAt };
          }
          return b;
        });
        for (const [id, b] of fromMeta) {
          if (!boards.some((x) => x.id === id)) {
            boards.push(b);
            changed = true;
          }
        }
        let activeId = prev.activeId;
        if (
          !prev.hadLocal &&
          typeof backup.activeId === "string" &&
          boards.some((b) => b.id === backup.activeId)
        ) {
          activeId = backup.activeId;
          changed = changed || activeId !== prev.activeId;
        }
        return changed
          ? { ...prev, boards: ensureDefaultBoard(boards), activeId }
          : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change: localStorage is the primary home, the
  // IndexedDB mirror the durable backup. Both writes are tiny.
  useEffect(() => {
    safeSet(LIST_KEY, JSON.stringify(state.boards));
    safeSet(ACTIVE_KEY, state.activeId);
    const snapshot: RegistrySnapshot = {
      v: 1,
      boards: state.boards,
      activeId: state.activeId,
    };
    void putMeta(LIST_META_KEY, snapshot).catch(() => {});
  }, [state.boards, state.activeId]);

  const createBoard = useCallback((rawName: string): string | null => {
    const name = cleanBoardName(rawName);
    if (!name) return null;
    const id =
      crypto.randomUUID?.() ??
      `b${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const board: BoardInfo = { id, name, createdAt: Date.now() };
    setState((prev) => ({
      ...prev,
      boards: [...prev.boards, board],
      activeId: id,
    }));
    return id;
  }, []);

  const switchBoard = useCallback((id: string) => {
    setState((prev) =>
      prev.activeId !== id && prev.boards.some((b) => b.id === id)
        ? { ...prev, activeId: id }
        : prev,
    );
  }, []);

  const renameBoard = useCallback((id: string, rawName: string) => {
    const name = cleanBoardName(rawName);
    if (!name) return;
    setState((prev) => {
      const boards = prev.boards.map((b) =>
        b.id === id && b.name !== name ? { ...b, name } : b,
      );
      return boards.some((b, i) => b !== prev.boards[i])
        ? { ...prev, boards }
        : prev;
    });
  }, []);

  const openDemoBoard = useCallback(() => {
    setState((prev) => ({
      ...prev,
      boards: prev.boards.some((b) => b.id === DEMO_BOARD_ID)
        ? prev.boards
        : [
            ...prev.boards,
            { id: DEMO_BOARD_ID, name: DEMO_BOARD_NAME, createdAt: Date.now() },
          ],
      activeId: DEMO_BOARD_ID,
    }));
  }, []);

  const removeDemoBoard = useCallback(() => {
    setState((prev) => {
      if (!prev.boards.some((b) => b.id === DEMO_BOARD_ID)) return prev;
      return {
        ...prev,
        boards: prev.boards.filter((b) => b.id !== DEMO_BOARD_ID),
        activeId:
          prev.activeId === DEMO_BOARD_ID ? DEFAULT_BOARD_ID : prev.activeId,
      };
    });
  }, []);

  const value = useMemo<BoardsValue>(() => {
    const activeBoard =
      state.boards.find((b) => b.id === state.activeId) ?? state.boards[0];
    return {
      boards: state.boards,
      activeBoardId: activeBoard.id,
      activeBoard,
      createBoard,
      switchBoard,
      renameBoard,
      openDemoBoard,
      removeDemoBoard,
    };
  }, [
    state.boards,
    state.activeId,
    createBoard,
    switchBoard,
    renameBoard,
    openDemoBoard,
    removeDemoBoard,
  ]);

  return (
    <BoardsContext.Provider value={value}>{children}</BoardsContext.Provider>
  );
}

export function useBoards(): BoardsValue {
  const ctx = useContext(BoardsContext);
  if (!ctx) throw new Error("useBoards must be used within BoardsProvider");
  return ctx;
}
