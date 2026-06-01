/**
 * Builds a small display thumbnail from a picked/captured image file, without
 * ever touching the original (which we store verbatim). Uses `createImageBitmap`
 * where available — it respects EXIF orientation on modern browsers — and falls
 * back to an <img> decode otherwise.
 */

export interface ProcessedImage {
  thumb: Blob;
  width: number;
  height: number;
  type: string;
}

const MAX_THUMB = 720; // longest edge, in CSS px * a bit of headroom

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const { bitmap, width, height } = await decode(file);

  const scale = Math.min(1, MAX_THUMB / Math.max(width, height));
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, tw, th);
  if ("close" in bitmap) (bitmap as ImageBitmap).close?.();

  const thumb = await toBlob(canvas);
  return { thumb, width, height, type: file.type || "image/jpeg" };
}

async function decode(
  file: Blob
): Promise<{ bitmap: CanvasImageSource; width: number; height: number }> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      return { bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // fall through to <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { bitmap: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      0.85
    );
  });
}
