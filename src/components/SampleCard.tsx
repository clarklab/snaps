import { motion } from "framer-motion";
import { COLORS, swatch, type Scheme } from "../colors";
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

      {/* 3x3 of color dots — the same shorthand used in the header
          progress chip, blown up so it reads as a little app icon. */}
      <ColorDotsBlock scheme={scheme} />
      <div style={{ height: 14 }} />

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
        Fill your grid with color matched photos: a blue door, a blue mug, a
        blue sky. Share your collage when complete. Enjoy your travels!
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <motion.button
          onClick={onDismiss}
          whileTap={{ scale: 0.97 }}
          style={{
            width: "100%",
            padding: "13px 16px",
            borderRadius: 14,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Get Started
        </motion.button>
        <button
          onClick={onStart}
          style={{
            padding: "8px 10px",
            fontSize: 13.5,
            fontWeight: 500,
            color: "var(--label-secondary)",
          }}
        >
          or watch a tour
        </button>
      </div>
    </motion.div>
  );
}

/**
 * A 3×3 of color dots, sized to read as a little app-icon block (~72px
 * across). Mirrors the shorthand the header uses; the white tile swaps
 * to light gray in light mode so it doesn't vanish into the card bg.
 */
function ColorDotsBlock({ scheme }: { scheme: Scheme }) {
  const dot = 18; // 3 dots × 18 + 2 gaps × 9 = 72px square block
  const gap = 9;
  return (
    <div
      aria-hidden
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${dot}px)`,
        gridAutoRows: `${dot}px`,
        gap,
      }}
    >
      {COLORS.map((c) => {
        const fill =
          c.id === "white" && scheme === "light"
            ? "rgba(60, 60, 67, 0.18)"
            : swatch(c, scheme);
        return (
          <span
            key={c.id}
            style={{
              width: dot,
              height: dot,
              borderRadius: 999,
              background: fill,
              boxShadow:
                c.needsBorder && c.id !== "white"
                  ? "inset 0 0 0 1px var(--hairline)"
                  : "none",
            }}
          />
        );
      })}
    </div>
  );
}
