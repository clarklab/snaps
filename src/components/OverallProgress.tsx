import { useState } from "react";
import { COLORS, swatch } from "../colors";
import { useStore } from "../state/store";
import { useTheme } from "../state/theme";
import { ProgressBar } from "./Progress";

/**
 * Compact overall progress that lives inline in the top bar. Tap to toggle
 * between "colors complete" and "photos placed". The label reads as one
 * line: "N/M" then a tiny 3×3 of color dots in place of the word
 * "colors" / "photos" — same shorthand the rest of the app speaks.
 */
export function OverallProgress() {
  const store = useStore();
  const [showPhotos, setShowPhotos] = useState(
    () => localStorage.getItem("snaps.progressMode") === "photos"
  );

  const value = showPhotos ? store.totalFilled : store.completedColors;
  const total = showPhotos ? store.totalSlots : COLORS.length;

  const toggle = () =>
    setShowPhotos((v) => {
      const next = !v;
      localStorage.setItem("snaps.progressMode", next ? "photos" : "colors");
      return next;
    });

  return (
    <button
      onClick={toggle}
      aria-label={`${value} of ${total} ${
        showPhotos ? "photos placed" : "colors complete"
      }. Tap to switch.`}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--bg-elevated)",
        borderRadius: 12,
        padding: "7px 12px",
        boxShadow: "var(--surface-shadow)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <ProgressBar value={value} total={total} tint="var(--accent)" />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        <span>
          {value}/{total}
        </span>
        <ColorDotsIcon />
      </div>
    </button>
  );
}

/**
 * A 3×3 of tiny color dots — the rainbow shorthand the app uses on the
 * intro card and elsewhere. Stands in for the word "colors" so the
 * header reads as one tight line.
 */
function ColorDotsIcon() {
  const { scheme } = useTheme();
  const dot = 3.5;
  const gap = 1.5;
  return (
    <div
      aria-hidden
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${dot}px)`,
        gridAutoRows: `${dot}px`,
        gap,
        flexShrink: 0,
      }}
    >
      {COLORS.map((c) => (
        <span
          key={c.id}
          style={{
            width: dot,
            height: dot,
            borderRadius: 999,
            background: swatch(c, scheme),
            boxShadow: c.needsBorder
              ? "inset 0 0 0 0.5px var(--hairline)"
              : "none",
          }}
        />
      ))}
    </div>
  );
}
