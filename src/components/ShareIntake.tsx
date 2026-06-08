import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  COLORS,
  readableInk,
  SLOTS_PER_BOARD,
  swatch,
  wash,
  type QuestColor,
} from "../colors";
import { haptic } from "../lib/haptics";
import { useStore } from "../state/store";
import { useTheme } from "../state/theme";
import { CropEditor } from "./CropEditor";
import { Thumbnail } from "./Thumbnail";

/**
 * Share-target intake flow.
 *
 * Driven by images the OS shared into Snaps (see lib/shareTarget.ts). For
 * each shared photo it walks the user through:
 *   1. which color board it belongs to,
 *   2. which of that board's nine slots to drop it in (occupied slots are
 *      shown so the user can deliberately replace one), then
 *   3. a non-destructive crop in the same editor used everywhere else.
 *
 * Multiple shared images are handled as a queue — finish one and the next
 * begins. The photo bytes are stored the moment a slot is chosen (so the
 * crop editor can read them straight from IndexedDB); cancelling the crop
 * just leaves the default framing.
 */
type Phase = "color" | "slot" | "crop";

export function ShareIntake({
  files,
  onDone,
}: {
  files: File[];
  onDone: () => void;
}) {
  const store = useStore();
  const { scheme } = useTheme();

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("color");
  const [colorId, setColorId] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const file = files[index];
  const color = colorId ? COLORS.find((c) => c.id === colorId) : undefined;

  // Preview thumbnail of the image currently being placed.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Defensive: if we somehow run dry, close.
  useEffect(() => {
    if (!file) onDone();
  }, [file, onDone]);

  if (!file) return null;

  const advance = () => {
    if (index + 1 < files.length) {
      setIndex((i) => i + 1);
      setPhase("color");
      setColorId(null);
      setPhotoId(null);
    } else {
      onDone();
    }
  };

  const chooseColor = (c: QuestColor) => {
    haptic("select");
    setColorId(c.id);
    setPhase("slot");
  };

  const chooseSlot = async (slot: number) => {
    if (!colorId || placing) return;
    haptic("tap");
    setPlacing(true);
    try {
      const id = await store.addPhoto(colorId, slot, file);
      setPhotoId(id);
      setPhase("crop");
    } catch {
      // Store surfaces quota/errors via toast; stay on the slot step.
    } finally {
      setPlacing(false);
    }
  };

  // ── Crop step: hand off to the shared editor. Rendered alone (no intake
  //    backdrop) so it owns the screen like it does everywhere else. ──
  if (phase === "crop" && photoId) {
    const id = photoId;
    return (
      <CropEditor
        photoId={id}
        initialCrop={null}
        onCancel={advance}
        onSave={(crop) => {
          store.setCrop(id, crop);
          advance();
        }}
      />
    );
  }

  const count = files.length;
  const header =
    count > 1 ? `Add shared photo ${index + 1} of ${count}` : "Add shared photo";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 85,
        background: "var(--bg)",
        color: "var(--label)",
        display: "flex",
        flexDirection: "column",
        paddingTop: "calc(var(--safe-top) + 12px)",
        paddingBottom: "calc(var(--safe-bottom) + 20px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Top bar: back (on slot step) + title + close. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px 8px",
          gap: 8,
        }}
      >
        {phase === "slot" ? (
          <button
            onClick={() => {
              haptic("tap");
              setPhase("color");
              setColorId(null);
            }}
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--accent)",
              flexShrink: 0,
            }}
          >
            Back
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--label-secondary)",
            textAlign: "center",
            flex: 1,
          }}
        >
          {header}
        </span>
        <button
          onClick={() => {
            haptic("tap");
            onDone();
          }}
          aria-label="Cancel"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--accent)",
            flexShrink: 0,
          }}
        >
          Done
        </button>
      </div>

      {/* Preview of the image being placed. */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "4px 16px 14px",
        }}
      >
        <div
          style={{
            width: 116,
            height: 116,
            borderRadius: 18,
            overflow: "hidden",
            background: "var(--fill-quaternary)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.16)",
          }}
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>
      </div>

      <h2
        style={{
          margin: 0,
          padding: "0 24px 16px",
          textAlign: "center",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: -0.3,
        }}
      >
        {phase === "color"
          ? "Which color is it?"
          : `Pick a ${color?.name.toLowerCase()} slot`}
      </h2>

      <AnimatePresence mode="wait">
        {phase === "color" ? (
          <motion.div
            key="colors"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.16 }}
            style={gridStyle}
          >
            {COLORS.map((c) => {
              const hex = swatch(c, scheme);
              const ink = readableInk(hex);
              const fill = store.filledCount(c.id);
              const full = fill === SLOTS_PER_BOARD;
              return (
                <button
                  key={c.id}
                  onClick={() => chooseColor(c)}
                  aria-label={`${c.name}${full ? " (board full)" : ""}`}
                  style={{
                    position: "relative",
                    aspectRatio: "1 / 1",
                    borderRadius: 16,
                    background: hex,
                    color: ink,
                    boxShadow: c.needsBorder
                      ? "inset 0 0 0 1px var(--hairline)"
                      : "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    padding: 12,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      opacity: 0.85,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {full ? "Full" : `${fill}/${SLOTS_PER_BOARD}`}
                  </span>
                </button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="slots"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.16 }}
            style={gridStyle}
          >
            {color &&
              (store.boards[color.id] ?? Array(SLOTS_PER_BOARD).fill(null)).map(
                (slotId, slot) => {
                  const hex = swatch(color, scheme);
                  return (
                    <button
                      key={slot}
                      onClick={() => chooseSlot(slot)}
                      disabled={placing}
                      aria-label={
                        slotId
                          ? `Replace ${color.name} photo ${slot + 1}`
                          : `Place in ${color.name} slot ${slot + 1}`
                      }
                      style={{
                        position: "relative",
                        aspectRatio: "1 / 1",
                        borderRadius: 16,
                        overflow: "hidden",
                        background: slotId
                          ? "var(--fill-quaternary)"
                          : wash(hex, scheme),
                        boxShadow: "inset 0 0 0 1px var(--hairline)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {slotId ? (
                        <>
                          <Thumbnail
                            photoId={slotId}
                            alt={`${color.name} photo`}
                            tint={wash(hex, scheme)}
                            crop={store.crops[slotId]}
                          />
                          {/* Persistent badge so it's obvious this slot is
                              taken and tapping it replaces the photo. */}
                          <span
                            style={{
                              position: "absolute",
                              top: 6,
                              right: 6,
                              padding: "3px 7px",
                              borderRadius: 999,
                              background: "rgba(0,0,0,0.55)",
                              color: "#fff",
                              fontSize: 10.5,
                              fontWeight: 700,
                              letterSpacing: 0.2,
                              backdropFilter: "blur(2px)",
                            }}
                          >
                            Replace
                          </span>
                        </>
                      ) : (
                        <span
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 999,
                            display: "grid",
                            placeItems: "center",
                            border: `1.5px dashed ${hex}`,
                            opacity: 0.7,
                          }}
                        >
                          <PlusIcon color={hex} />
                        </span>
                      )}
                    </button>
                  );
                },
              )}
          </motion.div>
        )}
      </AnimatePresence>

      {phase === "slot" && (
        <p
          style={{
            textAlign: "center",
            fontSize: 12.5,
            color: "var(--label-secondary)",
            padding: "14px 32px 0",
            margin: 0,
          }}
        >
          Tap an empty slot to place it, or a filled one to replace.
        </p>
      )}
    </motion.div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  padding: "0 16px",
  maxWidth: 460,
  width: "100%",
  margin: "0 auto",
};

function PlusIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden>
      <path
        d="M13 5v16M5 13h16"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}
