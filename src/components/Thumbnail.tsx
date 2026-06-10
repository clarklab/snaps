import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPhoto } from "../lib/db";
import { type Crop, cropBox, isIdentityCrop } from "../lib/crop";

/**
 * Convert a string ID into a stable, small float in a given range.
 * Used to give each thumbnail a slightly different entrance rotation
 * so the sample-load cascade reads as a sparkle of confetti rather
 * than a row of identical pops.
 */
function hashToRange(seed: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const t = ((h & 0xffff) / 0xffff + 1) % 1; // 0..1
  return min + t * (max - min);
}

/**
 * Loads a stored photo from IndexedDB and renders it via an object URL.
 *
 * - `variant="thumb"` (default) uses the small display copy.
 * - `variant="full"` uses the original, full-quality bytes for the viewer.
 * - `tint` colors the loading placeholder so the parent's color flows
 *   through the empty slot instead of a neutral gray flash.
 * - `crop` applies a non-destructive grid framing (pan/zoom) as a pure CSS
 *   transform on top of `object-fit: cover`. The stored bytes are untouched;
 *   this only changes which part of the photo fills the cell.
 *
 * We call `img.decode()` before flipping opacity so the fade-in runs on
 * a fully-decoded frame; without this, very large originals can paint
 * partially before the transition runs and visibly flicker.
 */
export function Thumbnail({
  photoId,
  variant = "thumb",
  alt = "",
  objectFit = "cover",
  tint,
  crop,
}: {
  photoId: string;
  variant?: "thumb" | "full";
  alt?: string;
  objectFit?: "cover" | "contain";
  tint?: string;
  crop?: Crop | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setLoaded(false);

    // Read with retries: a transient IndexedDB hiccup (connection being
    // re-established after another tab's upgrade, the iOS "empty right after
    // launch" quirk) must degrade to "try again shortly", never to a
    // permanently blank tile. If the photo still can't be read we leave the
    // tinted placeholder — deciding a photo is truly gone is the store's
    // reconcile pass's job, never the renderer's.
    (async () => {
      for (let attempt = 0; attempt < 4 && alive; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
          if (!alive) return;
        }
        const rec = await getPhoto(photoId).catch(() => undefined);
        if (!alive) return;
        if (!rec) continue;
        const blob = variant === "full" ? rec.full : rec.thumb;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        if (rec.width && rec.height)
          setNatural({ w: rec.width, h: rec.height });
        return;
      }
    })();

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId, variant]);

  // The crop is laid out against the actual cell size, so measure it. A
  // callback ref attaches the observer exactly when the cropped cell mounts
  // (which is after the async natural-size load), avoiding a stale measure.
  const cropActive =
    objectFit === "cover" && variant === "thumb" && !isIdentityCrop(crop);
  const [cell, setCell] = useState<{ w: number; h: number } | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const setCellRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!el) {
      roRef.current = null;
      return;
    }
    const update = () => setCell({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    roRef.current = ro;
  }, []);

  // Decode before paint: avoids a flash when the image is large or the
  // browser is busy. Falls back to the load event if decode() rejects
  // (e.g. animated images decode lazily).
  const handleImgRef = (node: HTMLImageElement | null) => {
    if (!node || !url) return;
    node
      .decode?.()
      .then(() => setLoaded(true))
      .catch(() => {
        /* fall back to onLoad */
      });
  };

  if (!url) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: tint ?? "var(--fill-quaternary)",
        }}
      />
    );
  }

  // A small per-photo rotation derived from the id so each photo lands
  // at its own jaunty angle — combined with the spring scale it reads
  // as a sparkle of confetti during the sample-load cascade rather than
  // a row of identical pops. Range is intentionally small so steady-state
  // photos still look neatly aligned (the rotation animates to 0 anyway).
  const rotateFrom = hashToRange(photoId, -8, 8);

  // A non-destructive grid crop reframes the photo within the cell. It needs
  // the cell's measured size and the photo's natural size to stay gap-free.
  if (cropActive && natural) {
    const box =
      cell && cell.w > 0 && cell.h > 0
        ? cropBox(crop!, cell.w, cell.h, natural.w, natural.h)
        : null;
    return (
      <div
        ref={setCellRef}
        style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: tint }}
      >
        <img
          ref={handleImgRef}
          src={url}
          alt={alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          style={{
            position: "absolute",
            // Until the cell is measured, fall back to a plain cover fit so the
            // photo is never missing — the precise box lands a frame later.
            ...(box
              ? {
                  width: box.width,
                  height: box.height,
                  left: box.left,
                  top: box.top,
                }
              : { width: "100%", height: "100%", objectFit: "cover", left: 0, top: 0 }),
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.28s ease",
            display: "block",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  }

  const img = (
    <motion.img
      ref={handleImgRef}
      src={url}
      alt={alt}
      // Never let the browser treat the photo as a draggable/long-pressable
      // asset — that's what pops the native "open / save image" callout that
      // fights our long-press-to-rearrange gesture.
      draggable={false}
      onLoad={() => setLoaded(true)}
      initial={{ opacity: 0, scale: 0.55, rotate: rotateFrom }}
      animate={
        loaded
          ? { opacity: 1, scale: 1, rotate: 0 }
          : { opacity: 0, scale: 0.55, rotate: rotateFrom }
      }
      transition={{
        opacity: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
        scale: { type: "spring", stiffness: 260, damping: 14, mass: 0.6 },
        rotate: { type: "spring", stiffness: 220, damping: 16, mass: 0.6 },
      }}
      style={{
        width: "100%",
        height: "100%",
        objectFit,
        display: "block",
        background: tint,
        // Hint the compositor so the transform animation stays smooth
        // even when many thumbnails animate concurrently.
        willChange: "transform, opacity",
        // Suppress the iOS long-press image callout + text selection so the
        // long-press only triggers our drag-to-rearrange.
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );

  return img;
}
