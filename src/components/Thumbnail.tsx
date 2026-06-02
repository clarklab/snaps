import { useEffect, useState } from "react";
import { getPhoto } from "../lib/db";

/**
 * Loads a stored photo from IndexedDB and renders it via an object URL.
 *
 * - `variant="thumb"` (default) uses the small display copy.
 * - `variant="full"` uses the original, full-quality bytes for the viewer.
 * - `tint` colors the loading placeholder so the parent's color flows
 *   through the empty slot instead of a neutral gray flash.
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
}: {
  photoId: string;
  variant?: "thumb" | "full";
  alt?: string;
  objectFit?: "cover" | "contain";
  tint?: string;
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

  return (
    <img
      ref={handleImgRef}
      src={url}
      alt={alt}
      onLoad={() => setLoaded(true)}
      style={{
        width: "100%",
        height: "100%",
        objectFit,
        display: "block",
        opacity: loaded ? 1 : 0,
        // A barely-there scale-pop makes each photo feel like it lands
        // rather than appearing. Curve is the iOS-style ease-out spring
        // approximation; duration is short enough that 81 thumbnails
        // animating at once (after a page refresh) reads as elegant, not chaotic.
        transform: loaded ? "scale(1)" : "scale(0.92)",
        transition:
          "opacity 0.32s ease-out, transform 0.36s cubic-bezier(0.16, 1, 0.3, 1)",
        background: tint,
      }}
    />
  );
}
