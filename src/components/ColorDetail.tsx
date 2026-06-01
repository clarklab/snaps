import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import {
  readableInk,
  SLOTS_PER_BOARD,
  swatch,
  wash,
  type QuestColor,
} from "../colors";
import { haptic } from "../lib/haptics";
import { useStore } from "../state/store";
import { useTheme } from "../state/theme";
import { PhotoViewer } from "./PhotoViewer";
import { ProgressBar } from "./Progress";
import { Sheet } from "./Sheet";
import { Thumbnail } from "./Thumbnail";

export function ColorDetail({
  color,
  onBack,
}: {
  color: QuestColor;
  onBack: () => void;
}) {
  const { scheme } = useTheme();
  const store = useStore();

  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [viewerSlot, setViewerSlot] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const libRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const hex = swatch(color, scheme);
  const ink = readableInk(hex);
  const fill = store.filledCount(color.id);
  const slots = store.boards[color.id] ?? Array(SLOTS_PER_BOARD).fill(null);

  const openSource = (slot: number) => {
    setActiveSlot(slot);
    setSourceOpen(true);
  };

  const pick = (useCamera: boolean) => {
    setSourceOpen(false);
    (useCamera ? camRef : libRef).current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file || activeSlot == null) return;
    const slot = activeSlot;
    const willComplete = store.filledCount(color.id) === SLOTS_PER_BOARD - 1;
    setActiveSlot(null);
    try {
      await store.addPhoto(color.id, slot, file);
      if (willComplete) {
        haptic("success");
        setJustCompleted(true);
        setTimeout(() => setJustCompleted(false), 1900);
      } else {
        haptic("tap");
      }
    } catch (err) {
      console.error("Failed to add photo", err);
    }
  };

  return (
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Colored hero — morphs from the tapped tile */}
      <motion.div
        layoutId={`hero-${color.id}`}
        style={{
          background: hex,
          boxShadow: color.needsBorder
            ? "inset 0 0 0 1px var(--hairline)"
            : "none",
          borderRadius: 24,
          margin: "calc(var(--safe-top) + 10px) 12px 4px",
          padding: "16px 18px 18px",
          color: ink,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: ink,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            <BackIcon />
            Colors
          </button>
          {fill > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              aria-label="Board options"
              style={{ color: ink, opacity: 0.85 }}
            >
              <DotsIcon />
            </button>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          <motion.h1
            layout="position"
            style={{ margin: 0, fontSize: 34, fontWeight: 700, color: ink }}
          >
            {color.name}
          </motion.h1>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              margin: "12px 0 8px",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <span style={{ opacity: 0.85 }}>
              {fill === SLOTS_PER_BOARD ? "Board complete" : "Keep collecting"}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {fill} of {SLOTS_PER_BOARD}
            </span>
          </div>
          <div style={{ opacity: 0.9 }}>
            <ProgressBar
              value={fill}
              total={SLOTS_PER_BOARD}
              tint={ink === "#ffffff" ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.8)"}
            />
          </div>
        </div>
      </motion.div>

      {/* Photo grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.28 }}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          padding: "12px 16px calc(var(--safe-bottom) + 28px)",
        }}
      >
        {slots.map((photoId, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              haptic("tap");
              if (photoId) setViewerSlot(i);
              else openSource(i);
            }}
            aria-label={
              photoId
                ? `View ${color.name} photo ${i + 1}`
                : `Add a ${color.name.toLowerCase()} photo`
            }
            style={{
              position: "relative",
              aspectRatio: "1 / 1",
              borderRadius: 16,
              overflow: "hidden",
              background: photoId ? "var(--fill-quaternary)" : wash(hex, scheme),
              boxShadow: "inset 0 0 0 1px var(--hairline)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {photoId ? (
              <Thumbnail photoId={photoId} alt={`${color.name} photo`} />
            ) : (
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  border: `1.5px dashed ${hex}`,
                  opacity: 0.7,
                }}
              >
                <PlusIcon color={hex} />
              </div>
            )}
          </motion.button>
        ))}
      </motion.div>

      {/* Hidden file inputs */}
      <input
        ref={libRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        style={{ display: "none" }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: "none" }}
      />

      {/* Source picker */}
      <Sheet
        open={sourceOpen}
        onClose={() => {
          setSourceOpen(false);
          setActiveSlot(null);
        }}
      >
        <div style={{ padding: "8px 16px 8px" }}>
          <p
            style={{
              textAlign: "center",
              color: "var(--label-secondary)",
              fontSize: 13,
              margin: "4px 0 12px",
            }}
          >
            Add a {color.name.toLowerCase()} photo
          </p>
          <SheetButton onClick={() => pick(false)}>Choose from Library</SheetButton>
          <SheetButton onClick={() => pick(true)}>Take Photo</SheetButton>
          <SheetButton
            onClick={() => {
              setSourceOpen(false);
              setActiveSlot(null);
            }}
            muted
          >
            Cancel
          </SheetButton>
        </div>
      </Sheet>

      {/* Board options */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)}>
        <div style={{ padding: "8px 16px 8px" }}>
          <SheetButton
            destructive
            onClick={() => {
              setMoreOpen(false);
              void store.clearBoard(color.id);
            }}
          >
            Clear this board
          </SheetButton>
          <SheetButton muted onClick={() => setMoreOpen(false)}>
            Cancel
          </SheetButton>
        </div>
      </Sheet>

      {/* Board-complete celebration */}
      <AnimatePresence>
        {justCompleted && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            style={{
              position: "fixed",
              top: "calc(var(--safe-top) + 16px)",
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 40,
            }}
          >
            <div
              style={{
                background: "var(--bg-elevated)",
                color: "var(--label)",
                padding: "10px 18px",
                borderRadius: 999,
                boxShadow: "var(--surface-shadow)",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              🎉 {color.name} board complete
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen viewer */}
      <AnimatePresence>
        {viewerSlot != null && slots[viewerSlot] && (
          <PhotoViewer
            photoId={slots[viewerSlot]!}
            onClose={() => setViewerSlot(null)}
            onReplace={() => {
              const slot = viewerSlot;
              setViewerSlot(null);
              setActiveSlot(slot);
              setSourceOpen(true);
            }}
            onRemove={() => {
              haptic("tap");
              void store.removePhoto(color.id, viewerSlot!);
              setViewerSlot(null);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SheetButton({
  children,
  onClick,
  destructive,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  muted?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      style={{
        display: "block",
        width: "100%",
        padding: "15px 16px",
        margin: "6px 0",
        borderRadius: 14,
        background: "var(--fill-quaternary)",
        fontSize: 17,
        fontWeight: muted ? 500 : 600,
        color: destructive
          ? "#ff453a"
          : muted
            ? "var(--label-secondary)"
            : "var(--accent)",
      }}
    >
      {children}
    </motion.button>
  );
}

function BackIcon() {
  return (
    <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
      <path
        d="M9.5 1.5L2 9l7.5 7.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="currentColor">
      <circle cx="3.5" cy="9" r="1.7" />
      <circle cx="9" cy="9" r="1.7" />
      <circle cx="14.5" cy="9" r="1.7" />
    </svg>
  );
}

function PlusIcon({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
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
