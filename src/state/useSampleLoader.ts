import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSamplesManifest,
  loadSampleBoards,
  type SamplesManifest,
} from "../lib/samples";
import { useStore } from "./store";

/**
 * Shared logic for the "Load sample photos" action. Each caller gets its
 * own progress UI state; the underlying store + manifest cache are shared.
 *
 * The cascade is tied to this hook's lifetime: the consuming component
 * lives inside the board-scoped tree, so when the board it's seeding goes
 * away (switch, demo-board clear) the unmount cancels the loop instead of
 * letting it keep writing photos that no layout will ever reference.
 */
export function useSampleLoader() {
  const store = useStore();
  const [manifest, setManifest] = useState<SamplesManifest | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [note, setNote] = useState<string | null>(null);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    getSamplesManifest().then(setManifest);
  }, []);

  const load = useCallback(async () => {
    if (!manifest || seeding) return;
    setNote(null);
    setSeeding(true);
    setProgress({ done: 0, total: 0 });
    try {
      const placed = await loadSampleBoards(
        store,
        manifest,
        (done, total) => setProgress({ done, total }),
        () => aliveRef.current,
      );
      if (placed === 0) {
        setNote(
          "Your boards already have photos. Clear a board first to drop samples there."
        );
      }
      return placed;
    } catch {
      setNote("Couldn't load samples — check your connection and try again.");
      return 0;
    } finally {
      setSeeding(false);
    }
  }, [manifest, seeding, store]);

  return {
    available: !!manifest,
    seeding,
    progress,
    note,
    load,
  };
}
