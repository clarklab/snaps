import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { getPhoto } from "../lib/db";
import {
  type Crop,
  IDENTITY_CROP,
  MAX_SCALE,
  MIN_SCALE,
  clampCrop,
  cropTransform,
  isIdentityCrop,
} from "../lib/crop";
import { haptic } from "../lib/haptics";

/**
 * Non-destructive crop editor.
 *
 * Move-and-scale framing in a square viewport that mirrors the square grid
 * cell, so what the user lines up here is exactly what the grid shows. We
 * never re-encode the photo — the result is just a `{ scale, x, y }` transform
 * stored alongside the board. Works entirely offline (no library, no network):
 * the image is read straight from IndexedDB and gestures are hand-rolled with
 * native pointer events, matching the viewer's approach.
 */
export function CropEditor({
  photoId,
  initialCrop,
  onCancel,
  onSave,
}: {
  photoId: string;
  initialCrop?: Crop | null;
  onCancel: () => void;
  onSave: (crop: Crop | null) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop>(initialCrop ?? IDENTITY_CROP);

  const stageRef = useRef<HTMLDivElement>(null);
  const stageSize = useRef(1);

  // Pointer/gesture state, mirroring PhotoViewer's single-source-of-truth model
  // so pan (one pointer) and pinch (two pointers) never fight.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number; cx: number; cy: number } | null>(
    null
  );
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);

  // Load the original bytes (best framing source) straight from IndexedDB.
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    getPhoto(photoId).then((rec) => {
      if (!rec || !alive) return;
      objectUrl = URL.createObjectURL(rec.full);
      setUrl(objectUrl);
      if (rec.width && rec.height) setNatural({ w: rec.width, h: rec.height });
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  // Lock body scroll while the editor is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const measure = () => {
    const el = stageRef.current;
    if (el) stageSize.current = el.clientWidth || 1;
  };

  const apply = (next: Crop) => {
    if (!natural) return;
    setCrop(clampCrop(next, natural.w, natural.h));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    measure();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        scale: crop.scale,
      };
      dragStart.current = null;
    } else if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const V = stageSize.current;

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const nextScale =
        (distance / pinchStart.current.distance) * pinchStart.current.scale;
      apply({ ...crop, scale: nextScale });
    } else if (pointers.current.size === 1 && dragStart.current) {
      // Pan follows the finger; offsets are a percentage of the cell.
      const dx = ((e.clientX - dragStart.current.x) / V) * 100;
      const dy = ((e.clientY - dragStart.current.y) / V) * 100;
      apply({ ...crop, x: dragStart.current.cx + dx, y: dragStart.current.cy + dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
    else if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      dragStart.current = { x: only.x, y: only.y, cx: crop.x, cy: crop.y };
    }
  };

  const reset = () => {
    haptic("select");
    setCrop(IDENTITY_CROP);
  };

  const done = () => {
    haptic("tap");
    onSave(isIdentityCrop(crop) ? null : crop);
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
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: "calc(var(--safe-top) + 12px)",
          left: 16,
          right: 16,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#fff",
        }}
      >
        <button
          onClick={onCancel}
          style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}
        >
          Cancel
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, opacity: 0.9 }}>
          Move &amp; Scale
        </span>
        <button
          onClick={done}
          style={{ fontSize: 16, fontWeight: 700, color: "#0a84ff" }}
        >
          Done
        </button>
      </div>

      {/* Square cropping stage, matching a square grid cell. The area outside
          the square is dimmed so the framing reads clearly. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "calc(var(--safe-top) + 64px) 16px 0",
        }}
      >
        <div
          ref={stageRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: "relative",
            width: "min(86vw, 60vh)",
            aspectRatio: "1 / 1",
            overflow: "hidden",
            borderRadius: 12,
            touchAction: "none",
            background: "#111",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.18)",
          }}
        >
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) => {
                if (!natural) {
                  const t = e.currentTarget;
                  if (t.naturalWidth && t.naturalHeight)
                    setNatural({ w: t.naturalWidth, h: t.naturalHeight });
                }
                measure();
              }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                transform: cropTransform(crop),
                transformOrigin: "center center",
                WebkitUserSelect: "none",
                userSelect: "none",
                WebkitTouchCallout: "none",
                pointerEvents: "none",
              }}
            />
          )}
          {/* Rule-of-thirds guides */}
          <Guides />
        </div>
      </div>

      {/* Zoom slider + reset */}
      <div
        style={{
          padding: "16px 24px calc(var(--safe-bottom) + 24px)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          color: "#fff",
        }}
      >
        <ZoomIcon small />
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.01}
          value={crop.scale}
          onChange={(e) => apply({ ...crop, scale: parseFloat(e.target.value) })}
          aria-label="Zoom"
          style={{ flex: 1, accentColor: "#0a84ff" }}
        />
        <ZoomIcon />
        <button
          onClick={reset}
          disabled={isIdentityCrop(crop)}
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: isIdentityCrop(crop) ? "rgba(255,255,255,0.35)" : "#fff",
            whiteSpace: "nowrap",
          }}
        >
          Reset
        </button>
      </div>
    </motion.div>
  );
}

function Guides() {
  return (
    <svg
      viewBox="0 0 3 3"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.4,
      }}
    >
      <path
        d="M1 0V3M2 0V3M0 1H3M0 2H3"
        stroke="#fff"
        strokeWidth="0.01"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ZoomIcon({ small }: { small?: boolean }) {
  const s = small ? 13 : 19;
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d={small ? "M3 10h14" : "M3 10h14M10 3v14"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
