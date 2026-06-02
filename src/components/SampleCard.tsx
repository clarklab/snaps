import { motion } from "framer-motion";
import { COLORS, swatch } from "../colors";
import { useTheme } from "../state/theme";

/**
 * First-run nudge: a dismissible card that animates up from the bottom of
 * the home screen, offering the guided tour (which loads sample photos and
 * walks through the whole app). Replaces the old inline "load a sample set"
 * link so the welcome reads as a clean grid with one friendly invitation.
 *
 * It's deliberately non-modal — no scrim — so it sits over the grid as a
 * gentle suggestion the user can swipe away or ignore and start tapping
 * colors. Visibility + persistence are owned by the parent.
 */
export function SampleCard({
  onStart,
  onDismiss,
}: {
  onStart: () => void;
  onDismiss: () => void;
}) {
  const { scheme } = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 60 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.5 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 80 || info.velocity.y > 500) onDismiss();
      }}
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "calc(var(--safe-bottom) + 12px)",
        maxWidth: 520,
        margin: "0 auto",
        zIndex: 40,
        background: "var(--bg-elevated)",
        borderRadius: 22,
        padding: "18px 18px 16px",
        boxShadow: "0 12px 44px rgba(0,0,0,0.22)",
        border: "1px solid var(--separator)",
      }}
    >
      {/* Dismiss */}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 30,
          height: 30,
          borderRadius: 999,
          background: "var(--fill-quaternary)",
          color: "var(--label-secondary)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path
            d="M3 3l10 10M13 3L3 13"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* A little ring of color dots echoing the app icon. */}
      <div
        aria-hidden
        style={{
          display: "flex",
          gap: 5,
          marginBottom: 12,
        }}
      >
        {COLORS.map((c) => (
          <span
            key={c.id}
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: swatch(c, scheme),
              boxShadow: c.needsBorder
                ? "inset 0 0 0 1px var(--hairline)"
                : "none",
            }}
          />
        ))}
      </div>

      <h2 style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700 }}>
        How Snaps works
      </h2>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 14,
          lineHeight: 1.45,
          color: "var(--label-secondary)",
        }}
      >
        Pick a color, then fill its grid with nine photos of things in that
        color — a blue door, a blue mug, a blue sky. Want to see it first? Tap
        below and we'll load some samples and show you around in about ten
        seconds.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <motion.button
          onClick={onStart}
          whileTap={{ scale: 0.97 }}
          style={{
            flex: 1,
            padding: "13px 16px",
            borderRadius: 14,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Play the tour
        </motion.button>
        <button
          onClick={onDismiss}
          style={{
            padding: "13px 12px",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--label-secondary)",
          }}
        >
          Not now
        </button>
      </div>
    </motion.div>
  );
}
