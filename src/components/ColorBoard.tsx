import { motion } from "framer-motion";
import { useState } from "react";
import { COLORS, readableInk, SLOTS_PER_BOARD, swatch } from "../colors";
import { useStore } from "../state/store";
import { useTheme } from "../state/theme";
import { ProgressBar, ProgressRing } from "./Progress";

export function ColorBoard({
  onSelect,
}: {
  onSelect: (colorId: string) => void;
}) {
  const { scheme } = useTheme();
  const store = useStore();
  const [showPhotos, setShowPhotos] = useState(
    () => localStorage.getItem("snaps.progressMode") === "photos"
  );

  const value = showPhotos ? store.totalFilled : store.completedColors;
  const total = showPhotos ? store.totalSlots : COLORS.length;

  const toggle = () => {
    setShowPhotos((v) => {
      const next = !v;
      localStorage.setItem("snaps.progressMode", next ? "photos" : "colors");
      return next;
    });
  };

  return (
    <div style={{ padding: "8px 16px 28px" }}>
      {/* Overall progress — tap to toggle between colors and photos */}
      <motion.button
        layout
        onClick={toggle}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          background: "var(--bg-elevated)",
          borderRadius: 18,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--label-secondary)",
            }}
          >
            {showPhotos ? "Photos placed" : "Colors complete"}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {value} of {total}
          </span>
        </div>
        <ProgressBar value={value} total={total} tint="var(--accent)" />
      </motion.button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {COLORS.map((color) => {
          const fill = store.filledCount(color.id);
          const hex = swatch(color, scheme);
          const ink = readableInk(hex);
          const complete = fill === SLOTS_PER_BOARD;
          return (
            <motion.button
              key={color.id}
              layoutId={`hero-${color.id}`}
              onClick={() => onSelect(color.id)}
              whileTap={{ scale: 0.95 }}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                borderRadius: 20,
                background: hex,
                boxShadow: color.needsBorder
                  ? "inset 0 0 0 1px var(--hairline)"
                  : "none",
                padding: 14,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                alignItems: "stretch",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {complete ? (
                  <CheckIcon color={ink} />
                ) : (
                  <ProgressRing
                    value={fill}
                    total={SLOTS_PER_BOARD}
                    tint={ink}
                    track={
                      ink === "#ffffff"
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(0,0,0,0.18)"
                    }
                  />
                )}
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: ink }}>
                  {color.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: ink,
                    opacity: 0.7,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fill}/{SLOTS_PER_BOARD}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill={color} opacity="0.18" />
      <path
        d="M5.5 10.5l3 3 6-6.5"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
