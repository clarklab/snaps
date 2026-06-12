import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { haptic } from "../lib/haptics";
import { usePersistenceStatus } from "../lib/persistence";
import { safeGet, safeSet } from "../lib/safeStorage";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import { useStore } from "../state/store";
import { useToast } from "./Toast";

const SNOOZE_KEY = "snaps.protectNudgeSnooze.v1";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function snoozedUntil(): number {
  const raw = safeGet(SNOOZE_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Slim home-grid nudge shown while photos sit in best-effort (evictable)
 * storage in a browser tab. The browser is free to delete that data under
 * disk pressure — losing every photo — and installing the app is what flips
 * Chromium to durable storage. One line, one button: tapping Install fires
 * the native prompt where the platform has one, and shows the
 * add-to-home-screen steps where it doesn't (iOS). Dismissing snoozes two
 * weeks; the banner retires itself once storage is persistent or the app
 * is installed.
 */
export function ProtectCard() {
  const store = useStore();
  const toast = useToast();
  const { persisted, refresh } = usePersistenceStatus();
  const { canInstall, isStandalone, install } = useInstallPrompt();
  const [snooze, setSnooze] = useState(snoozedUntil);

  const show =
    persisted === false &&
    !isStandalone &&
    store.totalFilled > 0 &&
    !store.needsResync &&
    Date.now() > snooze;

  const dismiss = () => {
    haptic("tap");
    const until = Date.now() + SNOOZE_MS;
    safeSet(SNOOZE_KEY, String(until));
    setSnooze(until);
  };

  const doInstall = async () => {
    haptic("select");
    if (canInstall) {
      const accepted = await install();
      // Chromium grants persistence to installed PWAs; give the grant a
      // beat to land, then re-check so the banner retires itself.
      if (accepted) window.setTimeout(() => void refresh({ force: true }), 2500);
      return;
    }
    // No programmatic prompt (iOS Safari, or the event hasn't fired yet):
    // show the manual steps instead.
    toast.push({
      title: "Add to Home Screen",
      detail: "Tap the share icon, then choose Add to Home Screen.",
      tone: "info",
      timeout: 6000,
    });
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 14 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: "hidden", padding: "0 16px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 14,
              background: "var(--fill-quaternary)",
              boxShadow: "inset 0 0 0 1px var(--hairline)",
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13.5,
                fontWeight: 550,
                lineHeight: 1.3,
              }}
            >
              Install Snaps to keep your photos safe.
            </span>
            <motion.button
              onClick={() => void doInstall()}
              whileTap={{ scale: 0.96 }}
              style={{
                flexShrink: 0,
                padding: "8px 14px",
                borderRadius: 11,
                background: "var(--accent)",
                color: "#ffffff",
                fontSize: 13.5,
                fontWeight: 650,
              }}
            >
              Install
            </motion.button>
            <button
              onClick={dismiss}
              aria-label="Dismiss for now"
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: 999,
                background: "var(--fill-quaternary)",
                color: "var(--label-secondary)",
                display: "grid",
                placeItems: "center",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
