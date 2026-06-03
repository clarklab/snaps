import { motion } from "framer-motion";
import { useState } from "react";
import {
  COLORS,
  SLOTS_PER_BOARD,
  swatch,
  type QuestColor,
} from "../colors";
import { haptic } from "../lib/haptics";
import { useDemo } from "../state/demo";
import { useStore } from "../state/store";
import { useTheme } from "../state/theme";
import { ProgressBar } from "./Progress";
import { ShareSheet } from "./ShareSheet";
import { Thumbnail } from "./Thumbnail";

export function ColorBoard({
  onSelect,
  supportsVT,
}: {
  onSelect: (colorId: string) => void;
  supportsVT: boolean;
}) {
  const demo = useDemo();
  const store = useStore();
  const [shareOpen, setShareOpen] = useState(false);
  const allComplete = store.totalFilled === store.totalSlots;

  return (
    <div style={{ padding: "4px 16px 28px" }}>
      {/* The guided tour's sample cascade — shown right here so the photos
          visibly pour into the grid below. (The "how it works" explainer
          lives in the welcome tour card, not on the grid.) */}
      {demo.loading && (
        <div style={{ margin: "0 4px 16px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13.5,
              marginBottom: 8,
              color: "var(--label-secondary)",
            }}
          >
            <span>Loading sample photos…</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {demo.progress.done} / {demo.progress.total || "…"}
            </span>
          </div>
          <ProgressBar
            value={demo.progress.done}
            total={demo.progress.total || 1}
            tint="var(--accent)"
          />
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
        }}
      >
        {COLORS.map((color) => (
          <ColorTile
            key={color.id}
            color={color}
            onSelect={onSelect}
            supportsVT={supportsVT}
          />
        ))}
      </div>

      {/* Overall share — surfaces only once every color is full so the user
          earned it. Same shape as the per-color share button. */}
      {allComplete && (
        <motion.button
          onClick={() => {
            haptic("select");
            setShareOpen(true);
          }}
          whileTap={{ scale: 0.97 }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            marginTop: 22,
            padding: "14px 18px",
            borderRadius: 14,
            background: "var(--accent)",
            color: "#ffffff",
            fontSize: 16,
            fontWeight: 700,
            boxShadow: "0 6px 20px rgba(0, 122, 255, 0.28)",
          }}
        >
          <ShareIcon />
          Share my Snaps
        </motion.button>
      )}

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        target={{ kind: "overall" }}
      />
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 11.5V2.5M9 2.5l-3 3M9 2.5l3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 9v5.5a1 1 0 001 1h9a1 1 0 001-1V9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A home tile = a live 3×3 mini-collage of that color's board. Empty slots show
 * the swatch (so an untouched board reads as a color square split into nine);
 * filled slots show the photo, so the home screen fills in as you collect.
 * The colored square is the shared element that morphs into the detail hero.
 */
function ColorTile({
  color,
  onSelect,
  supportsVT,
}: {
  color: QuestColor;
  onSelect: (colorId: string) => void;
  supportsVT: boolean;
}) {
  const { scheme } = useTheme();
  const store = useStore();
  const hex = swatch(color, scheme);
  const slots = store.boards[color.id] ?? Array(SLOTS_PER_BOARD).fill(null);
  const fill = store.filledCount(color.id);
  const complete = fill === SLOTS_PER_BOARD;

  return (
    <div>
      <motion.button
        layoutId={supportsVT ? undefined : `hero-${color.id}`}
        onClick={() => {
          haptic("select");
          onSelect(color.id);
        }}
        whileTap={{ scale: 0.97 }}
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        aria-label={`${color.name}, ${fill} of ${SLOTS_PER_BOARD} photos`}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 3,
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 20,
          overflow: "hidden",
          background: hex,
          boxShadow: color.needsBorder
            ? "inset 0 0 0 1px var(--hairline), var(--tile-shadow)"
            : "var(--tile-shadow)",
          viewTransitionName: supportsVT ? `hero-${color.id}` : undefined,
        }}
      >
        {Array.from({ length: SLOTS_PER_BOARD }).map((_, i) => {
          const photoId = slots[i];
          return (
            <div
              key={i}
              style={{
                aspectRatio: "1 / 1",
                overflow: "hidden",
                background: hex,
              }}
            >
              {photoId && <Thumbnail photoId={photoId} alt="" tint={hex} />}
            </div>
          );
        })}
      </motion.button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "7px 3px 0",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600 }}>{color.name}</span>
        {complete ? (
          <CheckIcon />
        ) : (
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--label-tertiary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fill}/{SLOTS_PER_BOARD}
          </span>
        )}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="10" fill="var(--accent)" />
      <path
        d="M5.5 10.5l3 3 6-6.5"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
