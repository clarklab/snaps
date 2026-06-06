import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  readableInk,
  SLOTS_PER_BOARD,
  swatch,
  wash,
  type QuestColor,
} from "../colors";
import { haptic } from "../lib/haptics";
import { useGridDrag } from "../lib/useGridDrag";
import { useStore } from "../state/store";
import { useTheme } from "../state/theme";
import { Confetti } from "./Confetti";
import { PhotoViewer } from "./PhotoViewer";
import { ProgressBar } from "./Progress";
import { ShareSheet } from "./ShareSheet";
import { Sheet } from "./Sheet";
import { Thumbnail } from "./Thumbnail";

export function ColorDetail({
  color,
  onBack,
  supportsVT,
  forceMosaic,
}: {
  color: QuestColor;
  onBack: () => void;
  supportsVT: boolean;
  /**
   * When defined (the guided tour), the mosaic layout is driven externally:
   * `true` rolls a fresh mosaic, `false` returns to the plain grid. Left
   * undefined for normal use so the in-board toggle stays in control.
   */
  forceMosaic?: boolean;
}) {
  const { scheme } = useTheme();
  const store = useStore();

  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [viewerSlot, setViewerSlot] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [mosaic, setMosaic] = useState<MosaicState | null>(null);

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

  const toggleMosaic = () => {
    haptic("select");
    setMosaic((prev) => (prev ? null : rollMosaic()));
  };

  // Guided-tour override: flip the mosaic on/off on command.
  useEffect(() => {
    if (forceMosaic === undefined) return;
    setMosaic(forceMosaic ? rollMosaic() : null);
  }, [forceMosaic]);

  // Long-press a filled slot to drag-swap it with another. The hook reports
  // a `state` object during drag (origin, current pointer offset, current
  // drop target) which we apply as a transform/scale below; the swap itself
  // is a store-level slot swap, and layoutId on the photo wrappers lets
  // framer-motion animate both photos to their new homes.
  const drag = useGridDrag({
    count: SLOTS_PER_BOARD,
    isDraggable: (i) => !!slots[i],
    onSwap: (from, to) => store.movePhoto(color.id, from, to),
  });

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
        layoutId={supportsVT ? undefined : `hero-${color.id}`}
        style={{
          background: hex,
          boxShadow: color.needsBorder
            ? "inset 0 0 0 1px var(--hairline)"
            : "none",
          borderRadius: 24,
          marginTop: "calc(var(--safe-top) + 10px)",
          marginLeft: "auto",
          marginRight: "auto",
          marginBottom: 4,
          padding: "clamp(16px, 4vw, 22px) clamp(18px, 4vw, 24px) clamp(18px, 4vw, 24px)",
          maxWidth: 536,
          width: "calc(100% - 24px)",
          color: ink,
          viewTransitionName: supportsVT ? `hero-${color.id}` : undefined,
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
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={toggleMosaic}
                aria-label={mosaic ? "Switch to grid layout" : "Switch to mosaic layout"}
                aria-pressed={!!mosaic}
                style={{
                  color: ink,
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  background: mosaic
                    ? ink === "#ffffff"
                      ? "rgba(255,255,255,0.18)"
                      : "rgba(0,0,0,0.12)"
                    : "transparent",
                  transition: "background 0.18s ease",
                }}
              >
                <MosaicIcon />
              </button>
              <button
                onClick={() => setMoreOpen(true)}
                aria-label="Board options"
                style={{
                  color: ink,
                  opacity: 0.85,
                  width: 32,
                  height: 32,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <DotsIcon />
              </button>
            </div>
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

      {/* Photo grid.
          When View Transitions are available the page-level transition
          handles the entrance, so skipping the JS fade-in avoids it being
          stuck at opacity 0 while the VT freezes the document.  */}
      <motion.div
        initial={supportsVT ? false : { opacity: 0, y: 10 }}
        animate={supportsVT ? undefined : { opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.28 }}
        style={
          mosaic
            ? {
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                // Explicit row height keyed to viewport width so each cell
                // is square (without it, `1fr` rows expand to image
                // intrinsic height and the layout balloons).
                gridTemplateRows:
                  "repeat(4, calc((min(100vw, 536px) - 36px) / 3))",
                gridTemplateAreas: mosaic.template.areas.join(" "),
                gap: 6,
                padding: "12px 12px calc(var(--safe-bottom) + 28px)",
              }
            : {
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                padding: "12px 16px calc(var(--safe-bottom) + 28px)",
              }
        }
      >
        {(mosaic ? mosaic.order : slots.map((_, i) => i)).map((slotIdx, i) => {
          const photoId = slots[slotIdx];
          const area = mosaic ? MOSAIC_CELLS[i] : undefined;
          // Hero cells (those spanning multiple rows or columns) carry a
          // softer outer shadow so they read as the focal point.
          const isHero =
            mosaic !== null &&
            mosaic.template.areas.join(" ").split(area!).length - 1 > 1;
          const isDragSource = drag.state?.from === slotIdx;
          const isDropTarget =
            drag.state?.target === slotIdx && drag.state.from !== slotIdx;
          return (
            <motion.button
              key={mosaic ? `m-${i}` : i}
              ref={drag.setCellRef(slotIdx)}
              onPointerDown={drag.onCellPointerDown(slotIdx)}
              whileTap={isDragSource ? undefined : { scale: 0.97 }}
              animate={{
                x: isDragSource ? drag.state!.x : 0,
                y: isDragSource ? drag.state!.y : 0,
                scale: isDragSource ? 1.08 : isDropTarget ? 0.94 : 1,
              }}
              transition={
                isDragSource
                  ? { type: "spring", stiffness: 1200, damping: 60, mass: 0.4 }
                  : { type: "spring", stiffness: 380, damping: 30 }
              }
              onClick={(e) => {
                if (drag.consumeTapSuppression()) {
                  e.preventDefault();
                  return;
                }
                haptic("tap");
                if (photoId) setViewerSlot(slotIdx);
                else openSource(slotIdx);
              }}
              aria-label={
                photoId
                  ? `View ${color.name} photo ${slotIdx + 1}`
                  : `Add a ${color.name.toLowerCase()} photo`
              }
              style={{
                position: "relative",
                aspectRatio: mosaic ? undefined : "1 / 1",
                gridArea: area,
                minWidth: 0,
                minHeight: 0,
                borderRadius: mosaic ? 12 : 16,
                overflow: "hidden",
                background: photoId
                  ? "var(--fill-quaternary)"
                  : wash(hex, scheme),
                boxShadow: isDragSource
                  ? "0 18px 40px rgba(0,0,0,0.28), inset 0 0 0 1px var(--hairline)"
                  : isHero
                    ? "inset 0 0 0 1px var(--hairline), 0 6px 20px rgba(0,0,0,0.10)"
                    : "inset 0 0 0 1px var(--hairline)",
                display: "grid",
                placeItems: "center",
                zIndex: isDragSource ? 30 : undefined,
                // Suppress browser-level touch behaviors so long-press
                // doesn't accidentally trigger pull-to-refresh or scroll.
                touchAction: "none",
              }}
            >
              {photoId ? (
                // layoutId on the photo wrapper lets framer-motion FLIP-
                // animate both photos to their new homes when slots swap,
                // so the drop reads as an exchange rather than a content flip.
                <motion.div
                  layoutId={`photo-${photoId}`}
                  transition={{ type: "spring", stiffness: 360, damping: 32 }}
                  style={{ width: "100%", height: "100%" }}
                >
                  <Thumbnail
                    photoId={photoId}
                    alt={`${color.name} photo`}
                    tint={wash(hex, scheme)}
                    crop={store.crops[photoId]}
                  />
                </motion.div>
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
          );
        })}
      </motion.div>

      {/* Share button — only when the board is full. Sits below the grid
          so it reads as the natural next step once the user has all nine. */}
      {fill === SLOTS_PER_BOARD && (
        <div style={{ padding: "0 16px calc(var(--safe-bottom) + 24px)" }}>
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
            Share {color.name}
          </motion.button>
        </div>
      )}

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
          <>
            <Confetti tint={hex} />
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
                zIndex: 46,
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
          </>
        )}
      </AnimatePresence>

      {/* Full-screen viewer */}
      <AnimatePresence>
        {viewerSlot != null && slots[viewerSlot] && (
          <PhotoViewer
            photoId={slots[viewerSlot]!}
            crop={store.crops[slots[viewerSlot]!]}
            onSaveCrop={(c) => store.setCrop(slots[viewerSlot]!, c)}
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

      {/* Share — mirrors the board's current layout (3×3 or mosaic) so the
          baked image matches what the user is looking at. */}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        target={{
          kind: "board",
          color,
          slots,
          mosaic: mosaic
            ? { areas: mosaic.template.areas, order: mosaic.order }
            : undefined,
        }}
      />
    </motion.div>
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

function MosaicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.6" />
      <rect x="12" y="1.5" width="4.5" height="4.5" rx="1" />
      <rect x="12" y="7.5" width="4.5" height="3" rx="1" />
      <rect x="1.5" y="12" width="6" height="4.5" rx="1" />
      <rect x="9" y="12" width="3" height="4.5" rx="1" />
      <rect x="13.5" y="12" width="3" height="4.5" rx="1" />
    </svg>
  );
}

/**
 * Mosaic templates. Each is a 4-row × 3-col CSS grid with named areas
 * a..i — nine cells, but with different cells spanning 2×2 (hero),
 * 1×2 (wide), or 2×1 (tall) so photos read more like a magazine spread
 * than a uniform grid.
 *
 * Add more templates here to expand the variety; every toggle picks one
 * at random plus a fresh photo shuffle, so users get a new mosaic each
 * time they enable it.
 */
const MOSAIC_TEMPLATES: { areas: string[] }[] = [
  // Hero top-left + 8 small
  { areas: ['"a a b"', '"a a c"', '"d e f"', '"g h i"'] },
  // Hero top-right + 8 small
  { areas: ['"a b b"', '"c b b"', '"d e f"', '"g h i"'] },
  // Hero center + 8 small
  { areas: ['"a b c"', '"d e e"', '"f e e"', '"g h i"'] },
  // Wide banner top + grid + wide banner bottom
  { areas: ['"a a a"', '"b c d"', '"e f g"', '"h h i"'] },
  // Tall bottom-left + two wide rows on the right
  { areas: ['"a b c"', '"d e f"', '"g h h"', '"g i i"'] },
  // Wide top + tall right + small grid
  { areas: ['"a a b"', '"c d b"', '"e f f"', '"g h i"'] },
];

/** Cell labels in document order — matches MOSAIC_TEMPLATES area strings. */
const MOSAIC_CELLS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

interface MosaicState {
  template: (typeof MOSAIC_TEMPLATES)[number];
  /** Permutation of [0..8] mapping cell index → slot index. */
  order: number[];
}

function rollMosaic(): MosaicState {
  const template =
    MOSAIC_TEMPLATES[Math.floor(Math.random() * MOSAIC_TEMPLATES.length)];
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { template, order };
}
