import { animate, AnimatePresence, motion, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { getPhoto, type PhotoRecord } from "../lib/db";
import { readExif, type PhotoMeta } from "../lib/exif";
import { type Crop } from "../lib/crop";
import { CropEditor } from "./CropEditor";
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
  crop,
  onClose,
  onReplace,
  onRemove,
  onSaveCrop,
}: {
  photoId: string;
  crop?: Crop | null;
  onClose: () => void;
  onReplace: () => void;
  onRemove: () => void;
  /** Persist the photo's non-destructive grid crop (null clears it). */
  onSaveCrop: (crop: Crop | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [record, setRecord] = useState<PhotoRecord | null>(null);
  const [meta, setMeta] = useState<PhotoMeta | null>(null);

  // Load the stored record (dimensions / size / date added) and parse EXIF
  // (capture time / GPS / camera) from the original bytes for the details card.
  useEffect(() => {
    let alive = true;
    setRecord(null);
    setMeta(null);
    getPhoto(photoId)
      .catch(() => undefined)
      .then((rec) => {
        if (!alive || !rec) return;
        setRecord(rec);
        void readExif(rec.full).then((m) => {
          if (alive) setMeta(m);
        });
      });
    return () => {
      alive = false;
    };
  }, [photoId]);

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
        <div style={{ display: "flex", gap: 10 }}>
          <RoundButton
            onClick={() => setShowInfo((v) => !v)}
            label={showInfo ? "Hide details" : "Show details"}
            active={showInfo}
          >
            <InfoIcon />
          </RoundButton>
          <RoundButton
            onClick={() => {
              resetZoom();
              setMenuOpen(false);
              setCropOpen(true);
            }}
            label="Crop"
          >
            <CropIcon />
          </RoundButton>
          <RoundButton onClick={() => setMenuOpen((v) => !v)} label="More">
            <DotsIcon />
          </RoundButton>
        </div>
      </div>

      <AnimatePresence>
        {showInfo && record && (
          <DetailsCard record={record} meta={meta} />
        )}
      </AnimatePresence>

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

      <AnimatePresence>
        {cropOpen && (
          <CropEditor
            photoId={photoId}
            initialCrop={crop}
            onCancel={() => setCropOpen(false)}
            onSave={(next) => {
              onSaveCrop(next);
              setCropOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RoundButton({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  /** Tinted "on" state — used for the details toggle while the card is open. */
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        background: active ? "rgba(255,255,255,0.92)" : "rgba(40,40,40,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color: active ? "#000" : "#fff",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Bottom-anchored glass card showing what we know about the photo: when it
 * was taken (or added), where (GPS, tappable through to a map), and a few meta
 * chips (dimensions, megapixels, file size, format) plus the camera if EXIF
 * carries it. Sits above the gesture stage like the top controls, so it never
 * scales or pans with the image.
 */
function DetailsCard({
  record,
  meta,
}: {
  record: PhotoRecord;
  meta: PhotoMeta | null;
}) {
  const taken = meta?.takenAt != null;
  const when = new Date(meta?.takenAt ?? record.addedAt);
  const dateLabel = when.toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = when.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const mp = (record.width * record.height) / 1_000_000;
  const chips = [
    `${record.width} × ${record.height}`,
    mp >= 0.1 ? `${mp.toFixed(1)} MP` : null,
    formatBytes(record.full.size),
    fileKind(record.type),
  ].filter(Boolean) as string[];

  const camera = cameraLabel(meta);
  const hasGps = meta?.lat != null && meta?.lon != null;
  const mapsUrl = hasGps
    ? `https://www.google.com/maps/search/?api=1&query=${meta!.lat},${meta!.lon}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 360, damping: 34 }}
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: "calc(var(--safe-bottom) + 12px)",
        padding: "14px 16px",
        borderRadius: 20,
        background: "rgba(28,28,30,0.6)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CalendarIcon />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>
            {dateLabel}
          </span>
          <span
            style={{
              fontSize: 12.5,
              color: "rgba(235,235,245,0.6)",
              lineHeight: 1.2,
            }}
          >
            {timeLabel} · {taken ? "Taken" : "Added to Snaps"}
            {camera ? ` · ${camera}` : ""}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {chips.map((c) => (
          <span
            key={c}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "rgba(235,235,245,0.88)",
              background: "rgba(120,120,128,0.28)",
              padding: "4px 9px",
              borderRadius: 999,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {c}
          </span>
        ))}
      </div>

      {hasGps && (
        <button
          onClick={() => window.open(mapsUrl!, "_blank", "noopener,noreferrer")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            textAlign: "left",
            color: "#fff",
          }}
        >
          <PinIcon />
          <span
            style={{
              fontSize: 13,
              fontVariantNumeric: "tabular-nums",
              color: "rgba(235,235,245,0.88)",
            }}
          >
            {fmtLat(meta!.lat!)}, {fmtLon(meta!.lon!)}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 13,
              fontWeight: 600,
              color: "#0a84ff",
              whiteSpace: "nowrap",
            }}
          >
            View on map ›
          </span>
        </button>
      )}
    </motion.div>
  );
}

function formatBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(type: string): string {
  const sub = type.split("/")[1]?.toUpperCase();
  return sub ? sub : "Image";
}

function cameraLabel(meta: PhotoMeta | null): string | null {
  if (!meta) return null;
  const make = meta.make?.trim();
  const model = meta.model?.trim();
  if (!model) return make || null;
  if (make && !model.toLowerCase().startsWith(make.toLowerCase())) {
    return `${make} ${model}`;
  }
  return model;
}

function fmtLat(v: number): string {
  return `${Math.abs(v).toFixed(5)}° ${v >= 0 ? "N" : "S"}`;
}

function fmtLon(v: number): string {
  return `${Math.abs(v).toFixed(5)}° ${v >= 0 ? "E" : "W"}`;
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

function CropIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M5 1v12h12M1 5h12v12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
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

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="7.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="5.6" r="0.95" fill="currentColor" />
      <path
        d="M9 8.2v4.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect
        x="3"
        y="4.5"
        width="14"
        height="12.5"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3 8h14M6.5 3v3M13.5 3v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 16s5.2-4.4 5.2-8.3A5.2 5.2 0 109 7.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 16s-5.2-4.4-5.2-8.3A5.2 5.2 0 019 7.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7.5" r="1.7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
