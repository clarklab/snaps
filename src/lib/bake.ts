/**
 * Canvas image composition for the Share feature.
 *
 * Given a list of photo ids and a layout/style, bakes a JPEG blob suitable
 * for the Web Share API. Two layout families:
 *
 *   - `grid` — uniform 3×3 of nine photos (per-color square)
 *   - `mosaic` — 3-col × 4-row template with cells spanning 1×1, 1×2, 2×1, 2×2
 *   - `overall` — uniform 9×9 of all 81 photos in COLORS order
 *
 * Style:
 *
 *   - `bleed` — no gaps; photos touch edge-to-edge; bg color is irrelevant
 *     (any gap that would have shown bg is zero)
 *   - `rounded` — small inter-photo gap reveals `bg`; each photo is clipped
 *     to a rounded rect
 *
 * Output is a 0.92-quality JPEG so the resulting file is shareable over
 * SMS without re-compression surprises, while still small enough not to
 * choke older mobile devices.
 */

import { COLORS, SLOTS_PER_BOARD } from "../colors";
import { type Crop, cropSourceRect } from "./crop";
import { getPhoto } from "./db";

export type ShareStyle = "bleed" | "rounded";

export interface MosaicSpec {
  /** CSS-grid-style template rows, e.g. ['"a a b"', '"a a c"', '"d e f"', '"g h i"'] */
  areas: string[];
  /** Mapping of cell-position → slot index. Matches MOSAIC_CELLS order. */
  order: number[];
}

/** Cell labels in document order; matches the ColorDetail MOSAIC_CELLS export. */
const MOSAIC_CELLS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

export interface BakeBoardOptions {
  /** Photo ids to draw; index = slot index. May contain nulls for empty slots. */
  photoIds: (string | null)[];
  /** Background color in hex (#rrggbb). For `bleed` style it only fills any
   *  letterboxing around the canvas — almost never visible. */
  bg: string;
  style: ShareStyle;
  /** When set, lays out as a mosaic. When undefined, uses uniform 3×3. */
  mosaic?: MosaicSpec;
  /** Per-photo non-destructive crop, matching the grid framing. */
  crops?: Record<string, Crop>;
  /** Output square edge in px for grid; for mosaic this is the column width × 3
   *  and the canvas is 4/3 as tall. Defaults to 2160. */
  size?: number;
}

export async function bakeBoard(opts: BakeBoardOptions): Promise<Blob> {
  const size = opts.size ?? 2160;

  // Mosaic is 3 cols × 4 rows; the natural aspect ratio is 3:4.
  // For the grid case the canvas is square.
  const width = size;
  const height = opts.mosaic ? Math.round((size * 4) / 3) : size;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, width, height);

  // Bleed = no gap. Rounded = small reveal of `bg`. The gap is a percentage of
  // the canvas width so it scales with output size.
  const cols = 3;
  const rows = opts.mosaic ? 4 : 3;
  const gap = opts.style === "rounded" ? Math.round(width * 0.018) : 0;
  const cellW = (width - gap * (cols + 1)) / cols;
  const cellH = opts.mosaic
    ? (height - gap * (rows + 1)) / rows
    : (height - gap * (rows + 1)) / rows;

  // Load every needed image up front, in parallel. Failed loads draw nothing
  // (the bg colour shows through), which matches how the UI shows empty slots.
  const images = await Promise.all(
    opts.photoIds.map((id) => (id ? loadFullImage(id) : Promise.resolve(null))),
  );

  if (opts.mosaic) {
    const layout = parseMosaicLayout(opts.mosaic.areas);
    for (let i = 0; i < MOSAIC_CELLS.length; i++) {
      const cell = MOSAIC_CELLS[i];
      const pos = layout[cell];
      if (!pos) continue;
      const slot = opts.mosaic.order[i];
      const img = images[slot];
      const x = gap + pos.col * (cellW + gap);
      const y = gap + pos.row * (cellH + gap);
      const w = pos.colSpan * cellW + (pos.colSpan - 1) * gap;
      const h = pos.rowSpan * cellH + (pos.rowSpan - 1) * gap;
      const crop = cropFor(opts.crops, opts.photoIds[slot]);
      drawCell(ctx, img, x, y, w, h, opts.style === "rounded", crop);
    }
  } else {
    for (let i = 0; i < SLOTS_PER_BOARD; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gap + col * (cellW + gap);
      const y = gap + row * (cellH + gap);
      const crop = cropFor(opts.crops, opts.photoIds[i]);
      drawCell(ctx, images[i], x, y, cellW, cellH, opts.style === "rounded", crop);
    }
  }

  return canvasToJpeg(canvas);
}

export interface BakeOverallOptions {
  /** Board state — colorId → 9 slot ids (or nulls). */
  boards: Record<string, (string | null)[]>;
  /** Background hex; the only place the user picks it explicitly. */
  bg: string;
  style: ShareStyle;
  /** Per-photo non-destructive crop, matching the grid framing. */
  crops?: Record<string, Crop>;
  /** Output square edge. Default 2700 ⇒ each photo cell ≈ 300px in `bleed`. */
  size?: number;
}

/**
 * Bakes a 9×9 image: nine rows of nine photos, in COLORS order
 * (Red row, Orange row, …, White row).
 */
export async function bakeOverall(opts: BakeOverallOptions): Promise<Blob> {
  const size = opts.size ?? 2700;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, size, size);

  // 9 across and 9 down. Smaller relative gap than the per-color share
  // because 81 photos at 1.8% gap each would look fragmented.
  const cols = 9;
  const gap = opts.style === "rounded" ? Math.round(size * 0.006) : 0;
  const cellSize = (size - gap * (cols + 1)) / cols;

  // Flatten all 81 ids in COLORS row order (each color contributes one row).
  const ids: (string | null)[] = [];
  for (const color of COLORS) {
    const slots = opts.boards[color.id] ?? Array(SLOTS_PER_BOARD).fill(null);
    for (let i = 0; i < SLOTS_PER_BOARD; i++) ids.push(slots[i] ?? null);
  }
  const images = await Promise.all(
    ids.map((id) => (id ? loadFullImage(id) : Promise.resolve(null))),
  );

  for (let i = 0; i < ids.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gap + col * (cellSize + gap);
    const y = gap + row * (cellSize + gap);
    const crop = cropFor(opts.crops, ids[i]);
    drawCell(ctx, images[i], x, y, cellSize, cellSize, opts.style === "rounded", crop);
  }

  return canvasToJpeg(canvas);
}

function cropFor(
  crops: Record<string, Crop> | undefined,
  id: string | null,
): Crop | undefined {
  return crops && id ? crops[id] : undefined;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  rounded: boolean,
  crop?: Crop,
) {
  if (!img) return;
  // Corner radius is ~9% of the shorter side — same eyeballed value as
  // the ColorTile and Thumbnail use in the UI, so the baked image reads
  // as "the thing I saw on screen, just bigger".
  const radius = rounded ? Math.min(w, h) * 0.09 : 0;
  if (radius > 0) {
    ctx.save();
    roundedRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
  }
  drawCover(ctx, img, x, y, w, h, crop);
  if (radius > 0) ctx.restore();
}

async function loadFullImage(photoId: string): Promise<HTMLImageElement | null> {
  const rec = await getPhoto(photoId);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.full);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
    // `decode()` would be nicer but isn't required once `onload` has fired and
    // browsers without it would fall through anyway.
    return img;
  } finally {
    // The HTMLImageElement keeps a decoded copy in memory; we can free the
    // object URL the moment the load resolves.
    URL.revokeObjectURL(url);
  }
}

/**
 * `object-fit: cover` for a canvas. Center-crops by default; when a
 * non-destructive `crop` is supplied it reproduces the grid's pan/zoom by
 * narrowing the source rectangle, so the share matches what's on screen.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  crop?: Crop,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  let sx: number, sy: number, sw: number, sh: number;
  if (crop) {
    ({ sx, sy, sw, sh } = cropSourceRect(crop, w, h, iw, ih));
  } else {
    // Center-crop cover.
    const targetRatio = w / h;
    const srcRatio = iw / ih;
    sx = 0;
    sy = 0;
    sw = iw;
    sh = ih;
    if (srcRatio > targetRatio) {
      sw = ih * targetRatio;
      sx = (iw - sw) / 2;
    } else {
      sh = iw / targetRatio;
      sy = (ih - sh) / 2;
    }
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

interface CellPos {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

/** Parse the CSS-grid template-areas-style mosaic spec into per-cell positions. */
function parseMosaicLayout(areas: string[]): Record<string, CellPos> {
  // Each row looks like `'"a a b"'`. Strip the surrounding quotes and split on space.
  const grid = areas.map((row) =>
    row.replace(/^"|"$/g, "").trim().split(/\s+/),
  );
  const out: Record<string, CellPos> = {};
  for (const cell of MOSAIC_CELLS) {
    let minR = -1;
    let minC = -1;
    let maxR = -1;
    let maxC = -1;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === cell) {
          if (minR === -1) {
            minR = r;
            minC = c;
          }
          maxR = r;
          maxC = c;
        }
      }
    }
    if (minR !== -1) {
      out[cell] = {
        row: minR,
        col: minC,
        rowSpan: maxR - minR + 1,
        colSpan: maxC - minC + 1,
      };
    }
  }
  return out;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      0.92,
    );
  });
}

/**
 * Triggers the Web Share API with `blob` as a file, falling back to a
 * download link when sharing files isn't supported.
 *
 * Returns true if the share dialog opened (or the download started),
 * false on user cancel.
 */
export async function shareImage(
  blob: Blob,
  filename: string,
  shareText?: string,
): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  const data: ShareData = { files: [file], title: "Snaps", text: shareText };

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare(data) &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share(data);
      return true;
    } catch (err) {
      // AbortError = user cancelled the sheet, which we treat as a soft no.
      if (
        err instanceof DOMException &&
        (err.name === "AbortError" || err.name === "NotAllowedError")
      ) {
        return false;
      }
      // Other errors fall through to the download path below.
    }
  }

  // Fallback: trigger a download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
