import { AnimatePresence, motion } from "framer-motion";
import { haptic } from "../lib/haptics";
import { useStore } from "../state/store";
import { useToast } from "./Toast";

/**
 * Shown on the home grid when the store has verified that placed photos
 * won't render (slot counts are up, tiles are blank). Offers the one-tap
 * recovery path: deep-verify storage, repair what's repairable, and — only
 * via this explicit action — clear slots whose photos are confirmed gone.
 */
export function ResyncBanner() {
  const store = useStore();
  const toast = useToast();

  const run = async () => {
    haptic("select");
    const result = await store.resyncPhotos();
    if (!result) return;
    if (result.unknown > 0) {
      toast.push({
        title: "Couldn't reach photo storage",
        detail:
          "Close any other Snaps tabs or windows, then tap Resync again. Nothing has been changed.",
        tone: "warn",
        timeout: 7000,
      });
    } else if (result.lost > 0) {
      toast.push({
        title: `${result.lost} photo${result.lost === 1 ? "" : "s"} couldn't be recovered`,
        detail:
          result.found > 0
            ? `Your browser removed them from this device. ${result.found} photo${result.found === 1 ? " was" : "s were"} found and restored; the empty slots are ready to fill again.`
            : "Your browser removed them from this device. The slots are open again, ready for new photos.",
        tone: "info",
        timeout: 8000,
      });
    } else {
      toast.push({
        title: `All ${result.found} photo${result.found === 1 ? "" : "s"} found`,
        detail:
          result.repaired > 0
            ? `${result.repaired} thumbnail${result.repaired === 1 ? " was" : "s were"} rebuilt. Everything should display now.`
            : "Everything should display now.",
        tone: "info",
      });
    }
  };

  return (
    <AnimatePresence>
      {store.needsResync && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 14 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: "hidden", padding: "0 16px" }}
        >
          <div
            role="status"
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
                Photos not showing?
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.35,
                  color: "var(--label-secondary)",
                  marginTop: 2,
                }}
              >
                Some saved photos aren't loading from storage right now.
              </div>
            </div>
            <motion.button
              onClick={() => void run()}
              disabled={store.resyncing}
              whileTap={{ scale: 0.96 }}
              style={{
                flexShrink: 0,
                padding: "9px 14px",
                borderRadius: 12,
                background: "var(--accent)",
                color: "#ffffff",
                fontSize: 13.5,
                fontWeight: 650,
                opacity: store.resyncing ? 0.6 : 1,
              }}
            >
              {store.resyncing ? "Resyncing…" : "Resync my photos"}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
