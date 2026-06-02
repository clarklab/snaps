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
import {
  getSamplesManifest,
  loadSampleBoards,
  type SamplesManifest,
} from "../lib/samples";
import { haptic } from "../lib/haptics";
import { startTransitionSync } from "../lib/viewTransitions";
import { useStore } from "./store";
import { useTheme, type AppearanceMode } from "./theme";

/**
 * The "guided tour" — a player-piano walkthrough that loads the sample
 * boards and then drives the whole UI on the user's behalf so a first-time
 * visitor sees, in one quick smooth take, exactly how Snaps works:
 *
 *   1. The sample photos cascade into every empty board.
 *   2. A color board (Red) opens.
 *   3. Its mosaic layout turns on.
 *   4. Settings opens and flips to dark mode.
 *   5. Back to the (now dark) home grid.
 *   6. Another board (Black) opens to show photos on the dark canvas.
 *   7. Settings opens and flips back to light mode.
 *   8. Back home, and the sample photos clear out — leaving a clean board.
 *
 * The whole thing is choreographed here and exposed as a set of *view
 * overrides* the rest of the app reads while `running` is true; the tour
 * never reaches into component-local state directly. The user's own theme
 * choice is captured up front and restored at the end, so the tour leaves
 * no trace.
 *
 * Total runtime is intentionally short (~8s). Tapping anywhere skips it.
 */

export const TOUR_SEEN_KEY = "snaps.tourSeen.v1";

interface DemoValue {
  /** Whether the guided tour is currently playing. */
  running: boolean;
  /** True once the sample manifest is available (tour can be offered). */
  available: boolean;
  /** Sample-load cascade is in progress (drives the home progress strip). */
  loading: boolean;
  progress: { done: number; total: number };
  /** View overrides the app applies while `running`. */
  selectedId: string | null;
  settingsOpen: boolean;
  mosaic: boolean;
  /** Start the guided tour. No-op if already running or no samples. */
  start: () => void;
  /** Stop early and restore the user's view + theme. */
  stop: () => void;
}

const DemoContext = createContext<DemoValue | null>(null);

const ABORT = Symbol("demo-abort");

export function DemoProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { mode, setMode } = useTheme();

  const [manifest, setManifest] = useState<SamplesManifest | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mosaic, setMosaic] = useState(false);

  // Identifies the current run so a skip (or a second start) cancels any
  // still-pending step without it clobbering freshly-restored state.
  const runId = useRef(0);
  // The user's appearance choice, captured at start and restored at the end.
  const originalMode = useRef<AppearanceMode>(mode);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    getSamplesManifest().then(setManifest);
  }, []);

  const resetView = useCallback(() => {
    setSelectedId(null);
    setSettingsOpen(false);
    setMosaic(false);
    setLoading(false);
  }, []);

  const stop = useCallback(() => {
    if (!running) return;
    runId.current++; // cancel any pending step
    setMode(originalMode.current);
    resetView();
    setRunning(false);
  }, [running, setMode, resetView]);

  const start = useCallback(() => {
    if (running || !manifest) return;
    const myId = ++runId.current;
    originalMode.current = modeRef.current;
    haptic("select");
    setRunning(true);
    setProgress({ done: 0, total: 0 });

    // Sleep that rejects if this run was cancelled in the meantime, so the
    // sequence unwinds cleanly the instant the user skips.
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        window.setTimeout(
          () => (runId.current === myId ? resolve() : reject(ABORT)),
          ms,
        );
      });

    // Open/close a board through the same view-transition morph a real tap
    // uses. The tour runs on an async timeline, so it needs the flushSync
    // variant to commit before the snapshot (a plain tap doesn't).
    const nav = (id: string | null) =>
      startTransitionSync(() => setSelectedId(id));

    (async () => {
      try {
        // 1 — Cascade the samples into every empty board, then linger on the
        //     freshly-filled grid.
        setLoading(true);
        await loadSampleBoards(store, manifest, (done, total) =>
          setProgress({ done, total }),
        );
        setLoading(false);
        await wait(1500);

        // 2 — Open the Red board and admire the photos.
        nav("red");
        await wait(1450);

        // 3 — Turn on its mosaic layout, then hold on it.
        setMosaic(true);
        await wait(1600);

        // 4 — Open Settings and flip to dark mode.
        setSettingsOpen(true);
        await wait(700);
        setMode("dark");
        await wait(1050);
        setSettingsOpen(false);
        await wait(650);

        // 5 — Back to the (now dark) home grid; hold on the photos.
        setMosaic(false);
        nav(null);
        await wait(1400);

        // 6 — Open the Black board to show photos on the dark canvas.
        nav("black");
        await wait(1600);

        // 7 — Open Settings and flip back to light mode.
        setSettingsOpen(true);
        await wait(700);
        setMode("light");
        await wait(1050);
        setSettingsOpen(false);
        await wait(650);

        // 8 — Return all the way home. This is the resting state, so close
        //     plainly (no view transition) — a lingering transition frame
        //     would otherwise sit on top as the final view. The user sees the
        //     full, photo-filled home grid…
        setMosaic(false);
        setSelectedId(null);
        await wait(1500);
        // …then the samples clear out, on the home screen, in plain sight.
        await store.clearSamples();
        await wait(900);

        // Restore the user's own appearance choice and bow out.
        setMode(originalMode.current);
        resetView();
        setRunning(false);
      } catch {
        /* aborted via stop() — it already restored everything */
      }
    })();
  }, [running, manifest, store, setMode, resetView]);

  const value = useMemo<DemoValue>(
    () => ({
      running,
      available: !!manifest,
      loading,
      progress,
      selectedId,
      settingsOpen,
      mosaic,
      start,
      stop,
    }),
    [running, manifest, loading, progress, selectedId, settingsOpen, mosaic, start, stop],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
