import { animate, AnimatePresence, motion, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Thumbnail } from "./Thumbnail";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Full-screen viewer showing the original, full-quality image on a black
 * backdrop.
 *
 * Gestures (modeled on iOS Photos):
 *  - Drag down (at 1× scale) to dismiss.
 *  - Pinch with two fingers to zoom 1–4×.
 *  - Double-tap to toggle 1× / 2.5× zoom (centered on the tap point).
 *  - Drag with one finger when zoomed in to pan.
 *
 * Implementation uses native pointer events so a single source of truth
 * drives both pinch (two pointers) and pan (one pointer). framer-motion's
 * built-in `drag` is intentionally not used here because it can't model
 * the pinch case, and mixing the two leaks state.
 */
export function PhotoViewer({
  photoId,
  onClose,
  onReplace,
  onRemove,
}: {
  photoId: string;
  onClose: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(1);
  const stageRef = useRef<HTMLDivElement>(null);

  // Two-pointer tracking, last-tap detection, and per-gesture starting values.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{
    distance: number;
    scale: number;
    midX: number;
    midY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const dragStart = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const lastTap = useRef(0);

  // Lock body scroll while viewer is open (P3).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const resetZoom = () => {
    animate(scale, 1);
    animate(x, 0);
    animate(y, 0);
    animate(opacity, 1);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      start.current = {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        scale: scale.get(),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        offsetX: x.get(),
        offsetY: y.get(),
      };
      dragStart.current = null;
    } else if (pointers.current.size === 1) {
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        sx: x.get(),
        sy: y.get(),
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && start.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const nextScale = clamp((distance / start.current.distance) * start.current.scale, 1, 4);
      scale.set(nextScale);
      // Pan to keep the pinch midpoint stable as scale changes.
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      x.set(start.current.offsetX + (midX - start.current.midX));
      y.set(start.current.offsetY + (midY - start.current.midY));
    } else if (pointers.current.size === 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (scale.get() > 1.01) {
        // Pan when zoomed in.
        x.set(dragStart.current.sx + dx);
        y.set(dragStart.current.sy + dy);
      } else {
        // Drag-to-dismiss at 1×.
        y.set(dy);
        opacity.set(clamp(1 - Math.abs(dy) / 600, 0.3, 1));
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);

    if (pointers.current.size === 0) {
      const at1x = scale.get() <= 1.01;
      const offset = y.get();

      // Snap-dismiss at 1× when the user pulled far enough.
      if (at1x && Math.abs(offset) > 140) {
        onClose();
        return;
      }

      // Snap back / clamp to a valid resting state.
      if (at1x) {
        animate(y, 0, { type: "spring", stiffness: 380, damping: 32 });
        animate(x, 0, { type: "spring", stiffness: 380, damping: 32 });
        animate(opacity, 1);
      } else {
        clampPan();
      }

      // Detect double-tap (only when nothing else moved).
      if (dragStart.current) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        if (Math.hypot(dx, dy) < 8) {
          const now = performance.now();
          if (now - lastTap.current < 300) {
            lastTap.current = 0;
            toggleZoomAt(e.clientX, e.clientY);
          } else {
            lastTap.current = now;
          }
        }
      }
      start.current = null;
      dragStart.current = null;
    }
  };

  const toggleZoomAt = (cx: number, cy: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (scale.get() > 1.01) {
      resetZoom();
    } else {
      // Zoom into the tap point: keep that screen point stable.
      const target = 2.5;
      const px = cx - rect.left - rect.width / 2;
      const py = cy - rect.top - rect.height / 2;
      animate(scale, target);
      animate(x, -px * (target - 1));
      animate(y, -py * (target - 1));
    }
  };

  const clampPan = () => {
    // Keep ~⅓ of the screen always visible — generous but prevents losing the image.
    const stage = stageRef.current;
    if (!stage) return;
    const s = scale.get();
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const maxX = ((s - 1) * w) / 2;
    const maxY = ((s - 1) * h) / 2;
    if (Math.abs(x.get()) > maxX) animate(x, Math.sign(x.get()) * maxX);
    if (Math.abs(y.get()) > maxY) animate(y, Math.sign(y.get()) * maxY);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <motion.div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          width: "100%",
          height: "100%",
          touchAction: "none",
          scale,
          x,
          y,
          opacity,
          willChange: "transform",
        }}
      >
        <Thumbnail photoId={photoId} variant="full" objectFit="contain" alt="" />
      </motion.div>

      {/* Top controls */}
      <div
        style={{
          position: "absolute",
          top: "calc(var(--safe-top) + 12px)",
          left: 16,
          right: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <RoundButton onClick={onClose} label="Close">
          <CloseIcon />
        </RoundButton>
        <RoundButton onClick={() => setMenuOpen((v) => !v)} label="More">
          <DotsIcon />
        </RoundButton>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            style={{
              position: "absolute",
              top: "calc(var(--safe-top) + 60px)",
              right: 16,
              background: "var(--bg-elevated)",
              borderRadius: 14,
              overflow: "hidden",
              minWidth: 180,
              boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
            }}
          >
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                onReplace();
              }}
            >
              Replace photo
            </MenuItem>
            <div style={{ height: 1, background: "var(--separator)" }} />
            <MenuItem
              destructive
              onClick={() => {
                setMenuOpen(false);
                onRemove();
              }}
            >
              Remove
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RoundButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        background: "rgba(40,40,40,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color: "#fff",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "13px 16px",
        fontSize: 16,
        fontWeight: 500,
        color: destructive ? "#ff453a" : "var(--label)",
      }}
    >
      {children}
    </button>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 3l10 10M13 3L3 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <circle cx="3.5" cy="9" r="1.6" />
      <circle cx="9" cy="9" r="1.6" />
      <circle cx="14.5" cy="9" r="1.6" />
    </svg>
  );
}
