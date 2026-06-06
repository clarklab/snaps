/**
 * Non-destructive crop model.
 *
 * A crop is *purely* a display transform — it never edits a single byte of the
 * stored photo. The original bytes and the generated thumbnail in IndexedDB are
 * left exactly as they were; a cell simply reframes the photo so the user can
 * choose which part fills it. Clearing the crop returns to the default
 * center-cover framing.
 *
 * Model: the photo is scaled to *cover* the cell (so it always fills it, never
 * letterboxed), optionally zoomed past that baseline, then panned within the
 * overscan. Because panning is bounded to the overscan, the cell is always
 * fully covered — there is never a gap.
 *
 *   - `scale` (>= 1) zooms past the baseline cover fit.
 *   - `x` / `y` pan, each in [-1, 1]: 0 is centered, -1/1 push to the opposite
 *     edges of the available overscan. Expressing pan as a fraction of the
 *     overscan makes a crop resolution- and cell-independent: the same crop
 *     reframes identically in the square editor, the square grid cells, the
 *     home-tile minis, and the baked share.
 */

export interface Crop {
  /** Zoom past the baseline cover fit. >= 1. */
  scale: number;
  /** Horizontal pan as a fraction of the overscan, -1..1 (0 = centered). */
  x: number;
  /** Vertical pan as a fraction of the overscan, -1..1 (0 = centered). */
  y: number;
}

export const IDENTITY_CROP: Crop = { scale: 1, x: 0, y: 0 };

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** True when the crop is (effectively) the default center-cover framing. */
export function isIdentityCrop(c: Crop | null | undefined): boolean {
  if (!c) return true;
  return (
    Math.abs(c.scale - 1) < 1e-3 &&
    Math.abs(c.x) < 1e-3 &&
    Math.abs(c.y) < 1e-3
  );
}

/** Clamp scale to its range and pan to [-1, 1]. */
export function clampCrop(c: Crop): Crop {
  return {
    scale: clamp(c.scale, MIN_SCALE, MAX_SCALE),
    x: clamp(c.x, -1, 1),
    y: clamp(c.y, -1, 1),
  };
}

/** The scale that makes a `nw`×`nh` image cover a `cw`×`ch` box. */
export function coverScale(
  cw: number,
  ch: number,
  nw: number,
  nh: number
): number {
  return Math.max(cw / nw, ch / nh);
}

export interface CropBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Absolute size/position for an image laid out inside a `cw`×`ch` box so it
 * covers the box, zoomed by `crop.scale` and panned by `crop.x`/`y`. Used for
 * both the live CSS render (px within a measured cell) and the editor stage.
 */
export function cropBox(
  crop: Crop,
  cw: number,
  ch: number,
  nw: number,
  nh: number
): CropBox {
  const s = coverScale(cw, ch, nw, nh) * clamp(crop.scale, MIN_SCALE, MAX_SCALE);
  const width = nw * s;
  const height = nh * s;
  const overscanX = Math.max(0, width - cw);
  const overscanY = Math.max(0, height - ch);
  const x = clamp(crop.x, -1, 1);
  const y = clamp(crop.y, -1, 1);
  return {
    width,
    height,
    left: (cw - width) / 2 + (x * overscanX) / 2,
    top: (ch - height) / 2 + (y * overscanY) / 2,
  };
}

/**
 * The sub-rectangle of the source image (`nw`×`nh`) that fills a `destW`×`destH`
 * cell under this crop — so a canvas bake matches the on-screen cell.
 */
export function cropSourceRect(
  crop: Crop,
  destW: number,
  destH: number,
  nw: number,
  nh: number
): { sx: number; sy: number; sw: number; sh: number } {
  const box = cropBox(crop, destW, destH, nw, nh);
  const s = box.width / nw; // displayed px per source px
  return {
    sx: -box.left / s,
    sy: -box.top / s,
    sw: destW / s,
    sh: destH / s,
  };
}
