/**
 * Non-destructive crop model.
 *
 * A crop is *purely* a display transform — it never edits a single byte of the
 * stored photo. The original bytes and the generated thumbnail in IndexedDB are
 * left exactly as they were; the grid simply renders the thumbnail through this
 * transform so the user can choose which part of the photo frames best in a
 * square cell. Clearing the crop returns to the default center-cover framing.
 *
 * The transform is the CSS equivalent of `object-fit: cover` followed by
 * `translate(x%, y%) scale(scale)` about the element centre:
 *   - `scale` (>= 1) zooms past the baseline cover fit.
 *   - `x` / `y` pan the photo, expressed as a percentage of the cell so the
 *     same crop reads identically in the square editor and the square grid
 *     cell regardless of pixel size.
 *
 * Authoring happens in a square viewport (CropEditor) and the primary grid
 * cells are square, so the offsets are clamped against a square viewport. That
 * keeps the photo fully covering the cell at every pan/zoom — there is never a
 * gap. (Applying the same crop to a non-square share cell re-fits via cover and
 * stays gap-free for sane values.)
 */

export interface Crop {
  /** Zoom past the baseline cover fit. >= 1. */
  scale: number;
  /** Horizontal pan, percent of the cell. */
  x: number;
  /** Vertical pan, percent of the cell. */
  y: number;
}

export const IDENTITY_CROP: Crop = { scale: 1, x: 0, y: 0 };

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;

/** True when the crop is (effectively) the default center-cover framing. */
export function isIdentityCrop(c: Crop | null | undefined): boolean {
  if (!c) return true;
  return (
    Math.abs(c.scale - 1) < 1e-3 &&
    Math.abs(c.x) < 1e-3 &&
    Math.abs(c.y) < 1e-3
  );
}

/** The CSS transform applied on top of an `object-fit: cover` image. */
export function cropTransform(c: Crop): string {
  return `translate(${c.x}%, ${c.y}%) scale(${c.scale})`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The largest pan (percent of cell) that keeps the cover-fit photo fully
 * covering a square viewport, per axis, at a given scale.
 *
 * In a square viewport the photo's short edge exactly fills the cell at
 * scale 1 (no pan room on that axis) while the long edge overflows by the
 * aspect ratio. Scaling adds room on both axes.
 */
function maxOffsets(
  scale: number,
  iw: number,
  ih: number
): { x: number; y: number } {
  const long = Math.max(iw, ih) / Math.min(iw, ih);
  const rx = iw >= ih ? long : 1;
  const ry = iw >= ih ? 1 : long;
  return {
    x: Math.max(0, ((rx * scale - 1) / 2) * 100),
    y: Math.max(0, ((ry * scale - 1) / 2) * 100),
  };
}

/** Clamp scale to range and pan within the gap-free bounds for the image. */
export function clampCrop(c: Crop, iw: number, ih: number): Crop {
  const scale = clamp(c.scale, MIN_SCALE, MAX_SCALE);
  const max = maxOffsets(scale, iw, ih);
  return {
    scale,
    x: clamp(c.x, -max.x, max.x),
    y: clamp(c.y, -max.y, max.y),
  };
}

/**
 * Given a center-cover source rectangle (`base`) mapping the image onto a
 * `w`×`h` destination cell, return the sub-rectangle of the image that the
 * crop transform makes visible — so a canvas bake matches the CSS grid.
 */
export function cropSourceRect(
  base: { sx: number; sy: number; sw: number; sh: number },
  w: number,
  h: number,
  c: Crop
): { sx: number; sy: number; sw: number; sh: number } {
  if (isIdentityCrop(c)) return base;
  const txpx = (c.x / 100) * w;
  const typx = (c.y / 100) * h;
  // Cell-space window visible after `translate(...) scale(...)` about center.
  const u0 = w / 2 - (w / 2 + txpx) / c.scale;
  const v0 = h / 2 - (h / 2 + typx) / c.scale;
  return {
    sx: base.sx + (u0 / w) * base.sw,
    sy: base.sy + (v0 / h) * base.sh,
    sw: base.sw / c.scale,
    sh: base.sh / c.scale,
  };
}
