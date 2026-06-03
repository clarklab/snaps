import { motion } from "framer-motion";
import { COLORS, swatch, type Scheme } from "../colors";
import { useTheme } from "../state/theme";
import { Sheet } from "./Sheet";

/**
 * First-run nudge surfaced as a bottom sheet — same chrome the rest of
 * the app uses for Settings and Share, so dismiss reads as native
 * (drag-down, tap-scrim, system spring close). The previous floating
 * card had its own drag handling and could be missed on tall screens;
 * a proper sheet anchors the welcome flow to the gesture vocabulary
 * users already know.
 *
 * Visibility + persistence are owned by the parent via `open`.
 */
export function SampleCard({
  open,
  onStart,
  onDismiss,
}: {
  open: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const { scheme } = useTheme();
  return (
    <Sheet open={open} onClose={onDismiss}>
      <div
        style={{
          padding: "24px 20px calc(var(--safe-bottom) + 18px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ColorDotsBlock scheme={scheme} />
        <h2
          style={{
            margin: "16px 0 6px",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: -0.2,
          }}
        >
          How Snaps works
        </h2>
        <p
          style={{
            margin: "0 0 18px",
            fontSize: 14.5,
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
            gap: 8,
            width: "100%",
          }}
        >
          {/* Secondary first: the tour is a nice-to-have, so it sits
              above but rendered as a quieter neutral button rather
              than a text link — equal target size for both actions. */}
          <motion.button
            onClick={onStart}
            whileTap={{ scale: 0.97 }}
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 14,
              background: "var(--fill-quaternary)",
              color: "var(--label)",
              fontSize: 15.5,
              fontWeight: 600,
            }}
          >
            Watch a Tour
          </motion.button>
          <motion.button
            onClick={onDismiss}
            whileTap={{ scale: 0.97 }}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              background: "var(--accent)",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Just Get Started
          </motion.button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * A 3×3 of color dots, sized to read as a little app-icon block (~70px
 * across). Mirrors the shorthand the header uses; the white tile swaps
 * to light gray in light mode so it doesn't vanish into the sheet bg.
 */
function ColorDotsBlock({ scheme }: { scheme: Scheme }) {
  const dot = 20; // 3 dots × 20 + 2 gaps × 5 = 70px square block
  const gap = 5;
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
              // Rounded-rect look, not pill — echoes the home-grid color
              // tiles where corners are softened but still rectangular.
              borderRadius: 6,
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
