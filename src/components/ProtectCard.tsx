import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { haptic } from "../lib/haptics";
import { usePersistenceStatus } from "../lib/persistence";
import { safeGet, safeSet } from "../lib/safeStorage";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import { useStore } from "../state/store";

const SNOOZE_KEY = "snaps.protectNudgeSnooze.v1";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function snoozedUntil(): number {
  const raw = safeGet(SNOOZE_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Gentle home-grid nudge shown while photos sit in best-effort (evictable)
 * storage in a browser tab. The browser is free to delete that data under
 * disk pressure — losing every photo — and installing the app is what flips
 * Chromium to durable storage. Dismissable, snoozes two weeks, and
 * disappears for good once storage is persistent or the app is installed.
 */
export function ProtectCard() {
  const store = useStore();
  const { persisted, refresh } = usePersistenceStatus();
  const { canInstall, isStandalone, needsManualInstructions, install } =
    useInstallPrompt();
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
    const accepted = await install();
    // Chromium grants persistence to installed PWAs; give the grant a
    // beat to land, then re-check so the card retires itself.
    if (accepted) window.setTimeout(() => void refresh({ force: true }), 2500);
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
              gap: 12,
              padding: "12px 14px",
              borderRadius: 16,
              background: "var(--fill-quaternary)",
              boxShadow: "inset 0 0 0 1px var(--hairline)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 650 }}>
                Protect your photos
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.35,
                  color: "var(--label-secondary)",
                  marginTop: 2,
                }}
              >
                {needsManualInstructions
                  ? "Browsers can delete tab storage to free space. Open the Share menu and choose “Add to Home Screen” to keep your photos safe."
                  : "Browsers can delete tab storage to free space. Add Snaps to your home screen to keep your photos safe."}
              </div>
            </div>
            {canInstall && (
              <motion.button
                onClick={() => void doInstall()}
                whileTap={{ scale: 0.96 }}
                style={{
                  flexShrink: 0,
                  padding: "9px 14px",
                  borderRadius: 12,
                  background: "var(--accent)",
                  color: "#ffffff",
                  fontSize: 13.5,
                  fontWeight: 650,
                }}
              >
                Add to Home Screen
              </motion.button>
            )}
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
