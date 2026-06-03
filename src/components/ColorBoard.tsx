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
  // "Every placed photo came from the sample set" — used to surface a
  // secondary Remove-samples affordance under the overall Share button.
  const allAreSamples =
    allComplete && store.sampleCount === store.totalSlots;

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
          gap: 10,
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
        <>
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
          {/* Secondary action: only when the grid is entirely sample data.
              Sharing a complete demo set is fun the first time, but the
              prominent next step is clearing it so the user can collect
              their own photos. */}
          {allAreSamples && (
            <motion.button
              onClick={() => {
                haptic("tap");
                void store.clearSamples();
              }}
              whileTap={{ scale: 0.97 }}
              style={{
                display: "block",
                width: "100%",
                marginTop: 10,
                padding: "12px 18px",
                borderRadius: 14,
                background: "var(--fill-quaternary)",
                color: "#ff453a",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Remove sample photos
            </motion.button>
          )}
        </>
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
/**
 * Per-tile pill theming. For chromatic tiles the pill background is a
 * deeper analogous shade of the swatch and the text is a cream/pastel
 * from the same family — keeps every chip visually in-key with the
 * colour behind it instead of reading as a black sticker on top. The
 * two neutrals invert: black tile gets a light pill, white tile gets a
 * dark one (color theory takes a back seat to readability there).
 */
const PILL_THEME: Record<string, { bg: string; text: string }> = {
  red: { bg: "rgba(96, 14, 28, 0.55)", text: "#ffe2d6" },
  orange: { bg: "rgba(96, 42, 0, 0.55)", text: "#ffe7c2" },
  yellow: { bg: "rgba(96, 64, 0, 0.55)", text: "#fff7c4" },
  green: { bg: "rgba(14, 58, 28, 0.55)", text: "#d6f5dc" },
  blue: { bg: "rgba(8, 28, 78, 0.55)", text: "#dae8ff" },
  purple: { bg: "rgba(46, 14, 74, 0.55)", text: "#eedaff" },
  pink: { bg: "rgba(96, 32, 38, 0.5)", text: "#fde4e3" },
  black: { bg: "rgba(240, 240, 245, 0.22)", text: "#f4f4f6" },
  white: { bg: "rgba(20, 20, 22, 0.72)", text: "#ffffff" },
};

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
  const pill = PILL_THEME[color.id] ?? PILL_THEME.black;

  return (
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
        position: "relative",
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

      {/* Inset count pill in the bottom-right corner of the tile.
          `pill.bg` is a darker analogous shade of the swatch (for
          chromatic tiles) so the chip reads as same-family rather than
          stuck-on; `pill.text` is a matching cream/pastel ink. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          minWidth: 28,
          height: 22,
          padding: "0 8px",
          borderRadius: 999,
          background: pill.bg,
          color: pill.text,
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: 0.1,
          fontVariantNumeric: "tabular-nums",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        {complete ? <PillCheck /> : `${fill}/${SLOTS_PER_BOARD}`}
      </span>
    </motion.button>
  );
}

function PillCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4.5 10.5l3.2 3.2L15.5 6"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

