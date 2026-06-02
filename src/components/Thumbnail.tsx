import { useEffect, useState } from "react";
import { getPhoto } from "../lib/db";

/**
 * Loads a stored photo from IndexedDB and renders it via an object URL.
 * `variant="thumb"` (default) uses the small display copy; `variant="full"`
 * uses the original, full-quality bytes for the viewer.
 */
export function Thumbnail({
  photoId,
  variant = "thumb",
  alt = "",
  objectFit = "cover",
}: {
  photoId: string;
  variant?: "thumb" | "full";
  alt?: string;
  objectFit?: "cover" | "contain";
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

  if (!url) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "var(--fill-quaternary)",
        }}
      />
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      onLoad={() => setLoaded(true)}
      style={{
        width: "100%",
        height: "100%",
        objectFit,
        display: "block",
        opacity: loaded ? 1 : 0,
        transition: "opacity 0.28s ease",
      }}
    />
  );
}
