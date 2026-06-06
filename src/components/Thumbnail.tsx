import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getPhoto } from "../lib/db";
import { type Crop, cropTransform, isIdentityCrop } from "../lib/crop";

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

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setLoaded(false);

    getPhoto(photoId).then((rec) => {
      if (!rec || !alive) return;
      const blob = variant === "full" ? rec.full : rec.thumb;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId, variant]);

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

  // A non-destructive grid crop only makes sense for the cover-filled grid
  // thumbnail; the full viewer always shows the untouched original.
  const applyCrop =
    objectFit === "cover" && variant === "thumb" && !isIdentityCrop(crop);

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

  if (!applyCrop) return img;

  // The crop is applied on a wrapper so it composes cleanly with the image's
  // own entrance animation. The cell's `overflow: hidden` clips the zoom.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: cropTransform(crop!),
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      {img}
    </div>
  );
}
