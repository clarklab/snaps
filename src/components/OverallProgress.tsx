import { useState } from "react";
import { COLORS } from "../colors";
import { useStore } from "../state/store";
import { ProgressBar } from "./Progress";

/**
 * Compact overall progress that lives inline in the top bar. Tap to toggle
 * between "colors complete" and "photos placed".
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
          flexDirection: "column",
          alignItems: "flex-end",
          lineHeight: 1.05,
        }}
      >
        <span
          style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
        >
          {value}/{total}
        </span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: "var(--label-tertiary)",
          }}
        >
          {showPhotos ? "photos" : "colors"}
        </span>
      </div>
    </button>
  );
}
