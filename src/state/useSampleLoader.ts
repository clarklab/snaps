import { useCallback, useEffect, useState } from "react";
import {
  getSamplesManifest,
  loadSampleBoards,
  type SamplesManifest,
} from "../lib/samples";
import { useStore } from "./store";

/**
 * Shared logic for the "Load sample boards" action, used by both Settings and
 * the home empty-state. Each caller gets its own progress UI state; the
 * underlying store + manifest cache are shared.
 */
export function useSampleLoader() {
  const store = useStore();
  const [manifest, setManifest] = useState<SamplesManifest | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getSamplesManifest().then(setManifest);
  }, []);

  const load = useCallback(async () => {
    if (!manifest || seeding) return;
    setNote(null);
    setSeeding(true);
    setProgress({ done: 0, total: 0 });
    try {
      const placed = await loadSampleBoards(store, manifest, (done, total) =>
        setProgress({ done, total })
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
