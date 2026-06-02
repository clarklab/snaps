import { motion } from "framer-motion";
import {
  COLORS,
  SLOTS_PER_BOARD,
  swatch,
  type QuestColor,
} from "../colors";
import { haptic } from "../lib/haptics";
import { useSampleLoader } from "../state/useSampleLoader";
import { useStore } from "../state/store";
import { useTheme } from "../state/theme";
import { ProgressBar } from "./Progress";
import { Thumbnail } from "./Thumbnail";

export function ColorBoard({
  onSelect,
  supportsVT,
}: {
  onSelect: (colorId: string) => void;
  supportsVT: boolean;
}) {
  const store = useStore();
  const samples = useSampleLoader();

  const handleLoadSamples = async () => {
    haptic("select");
    const placed = await samples.load();
    if (placed) haptic("success");
  };

  return (
    <div style={{ padding: "4px 16px 28px" }}>
      {(store.totalFilled === 0 || samples.seeding) && (
        <div style={{ margin: "0 4px 16px" }}>
          {samples.seeding ? (
            <>
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
                  {samples.progress.done} / {samples.progress.total || "…"}
                </span>
              </div>
              <ProgressBar
                value={samples.progress.done}
                total={samples.progress.total || 1}
                tint="var(--accent)"
              />
            </>
          ) : (
            <>
              <p
                style={{
                  margin: "0 0 10px",
                  fontSize: 13.5,
                  lineHeight: 1.4,
                  color: "var(--label-secondary)",
                }}
              >
                Pick a color, then fill its grid with nine photos of things in
                that color.
              </p>
              {samples.available && (
                <button
                  onClick={handleLoadSamples}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--accent)",
                    padding: "2px 0",
                  }}
                >
                  Or load a sample set →
                </button>
              )}
            </>
          )}
          {samples.note && (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 12.5,
                lineHeight: 1.4,
                color: "var(--label-secondary)",
              }}
            >
              {samples.note}
            </p>
          )}
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
    </div>
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
