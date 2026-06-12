import { useCallback, useEffect, useState } from "react";
import { safeGet, safeSet } from "./safeStorage";

/**
 * Durable-storage management. Browsers treat an origin's storage as
 * "best-effort" by default: under disk pressure they may silently evict the
 * whole IndexedDB — which is how a player can lose every photo while the
 * localStorage layout (and its slot counts) survives. `persist()` asks the
 * browser to exempt us from that eviction.
 *
 * The old implementation asked exactly once and cached the answer forever,
 * which is wrong in both directions: Chromium grants persistence based on
 * engagement (and automatically once the PWA is installed), so an early
 * "denied" routinely becomes "granted" later — but only if you ask again.
 * This module re-checks `persisted()` (free, no prompt) on every call and
 * re-requests at most once per interval, with the throttle bypassed right
 * after an install since that's the moment Chromium flips to auto-grant.
 */

// JSON: { lastAsk: number }. Replaces the old one-shot
// "snaps.persistRequested.v1" flag, which is simply abandoned in place.
const ASK_KEY = "snaps.persistAsk.v1";
const ASK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function lastAsk(): number {
  try {
    const raw = safeGet(ASK_KEY);
    const parsed = raw ? (JSON.parse(raw) as { lastAsk?: number }) : null;
    return typeof parsed?.lastAsk === "number" ? parsed.lastAsk : 0;
  } catch {
    return 0;
  }
}

/**
 * Returns the current protection state: `true` when the origin's storage is
 * persistent, `false` when it's still best-effort, `null` when the platform
 * doesn't expose the API at all. May trigger a (throttled) `persist()`
 * request as a side effect; pass `force` to bypass the throttle, e.g. right
 * after `appinstalled`.
 */
export async function ensurePersistentStorage(opts?: {
  force?: boolean;
}): Promise<boolean | null> {
  try {
    const storage = navigator.storage;
    if (!storage?.persist) return null;
    if (storage.persisted && (await storage.persisted())) return true;
    if (!opts?.force && Date.now() - lastAsk() < ASK_INTERVAL_MS) return false;
    safeSet(ASK_KEY, JSON.stringify({ lastAsk: Date.now() }));
    return await storage.persist.call(storage);
  } catch {
    return null;
  }
}

/**
 * Live protection status for UI (the protect nudge, the Photo Safety menu).
 * Re-checks when the app is installed — the moment Chromium starts granting
 * persistence automatically.
 */
export function usePersistenceStatus(): {
  /** true = protected, false = best-effort (evictable), null = unknown. */
  persisted: boolean | null;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
} {
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    setPersisted(await ensurePersistentStorage(opts));
  }, []);

  useEffect(() => {
    void refresh();
    const onInstalled = () => {
      // Chromium grants persist() to installed PWAs; the grant can land a
      // beat after the event, so check now and once more shortly after.
      void refresh({ force: true });
      window.setTimeout(() => void refresh({ force: true }), 3000);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [refresh]);

  return { persisted, refresh };
}
