/**
 * Minimal, dependency-free EXIF reader.
 *
 * We keep the original photo bytes verbatim in IndexedDB (`PhotoRecord.full`),
 * so the capture metadata is still in there — it's just never parsed at import
 * time. The full-screen viewer reads it on demand to show a details card
 * (time / location / camera). Only the handful of tags the card needs are
 * decoded; everything else is skipped.
 *
 * Scope: JPEG/TIFF EXIF (the format phone cameras write). HEIC/PNG/WebP carry
 * metadata differently and simply return an empty result — the card falls back
 * to the fields we always have (dimensions, type, date added).
 */

export interface PhotoMeta {
  /** Capture time (DateTimeOriginal), ms since epoch. */
  takenAt?: number;
  /** Signed decimal degrees. */
  lat?: number;
  lon?: number;
  make?: string;
  model?: string;
}

// EXIF tag ids we care about.
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

/** Parse EXIF from a photo blob. Never throws — returns {} on anything odd. */
export async function readExif(blob: Blob): Promise<PhotoMeta> {
  try {
    // EXIF sits near the top of the file; reading the first chunk is enough
    // and avoids pulling multi-megabyte originals fully into memory.
    const head = await blob.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(head);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {}; // not JPEG

    // Walk the JPEG marker segments looking for APP1 ("Exif\0\0").
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda) break; // start of scan — image data follows
      const size = view.getUint16(offset + 2);
      if (size < 2) break;
      if (marker === 0xe1) {
        const start = offset + 4;
        // "Exif\0\0"
        if (
          start + 6 <= view.byteLength &&
          view.getUint32(start) === 0x45786966 &&
          view.getUint16(start + 4) === 0x0000
        ) {
          return parseTiff(view, start + 6);
        }
      }
      offset += 2 + size;
    }
  } catch {
    /* corrupt / truncated EXIF — fall through to empty */
  }
  return {};
}

function parseTiff(view: DataView, tiff: number): PhotoMeta {
  if (tiff + 8 > view.byteLength) return {};
  const byteOrder = view.getUint16(tiff);
  const le = byteOrder === 0x4949; // "II" = little-endian, "MM" = big-endian
  if (!le && byteOrder !== 0x4d4d) return {};

  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);
  if (u16(tiff + 2) !== 0x002a) return {};

  const meta: PhotoMeta = {};
  let exifIfd = 0;
  let gpsIfd = 0;

  const readAscii = (entry: number, count: number): string => {
    // ≤4 bytes are stored inline in the value field; longer values are at an
    // offset (relative to the TIFF header start).
    let data = entry + 8;
    if (count > 4) data = tiff + u32(entry + 8);
    let s = "";
    for (let i = 0; i < count && data + i < view.byteLength; i++) {
      const c = view.getUint8(data + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };

  const readRationals = (entry: number, count: number): number[] => {
    // Rational = 8 bytes each, so any count ≥1 lives at an offset.
    const data = tiff + u32(entry + 8);
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const at = data + i * 8;
      if (at + 8 > view.byteLength) break;
      const num = u32(at);
      const den = u32(at + 4);
      out.push(den === 0 ? 0 : num / den);
    }
    return out;
  };

  const eachEntry = (
    ifd: number,
    fn: (tag: number, count: number, entry: number) => void
  ) => {
    if (ifd + 2 > view.byteLength) return;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      fn(u16(entry), u32(entry + 4), entry);
    }
  };

  // IFD0 — camera make/model + pointers to the EXIF and GPS sub-IFDs.
  eachEntry(tiff + u32(tiff + 4), (tag, count, entry) => {
    if (tag === TAG_MAKE) meta.make = readAscii(entry, count);
    else if (tag === TAG_MODEL) meta.model = readAscii(entry, count);
    else if (tag === TAG_EXIF_IFD) exifIfd = tiff + u32(entry + 8);
    else if (tag === TAG_GPS_IFD) gpsIfd = tiff + u32(entry + 8);
  });

  if (exifIfd) {
    eachEntry(exifIfd, (tag, count, entry) => {
      if (tag === TAG_DATETIME_ORIGINAL) {
        meta.takenAt = parseExifDate(readAscii(entry, count)) ?? meta.takenAt;
      } else if (tag === TAG_DATETIME_DIGITIZED && meta.takenAt === undefined) {
        meta.takenAt = parseExifDate(readAscii(entry, count));
      }
    });
  }

  if (gpsIfd) {
    let latRef = "N";
    let lonRef = "E";
    let lat: number | undefined;
    let lon: number | undefined;
    eachEntry(gpsIfd, (tag, count, entry) => {
      if (tag === TAG_GPS_LAT_REF) latRef = readAscii(entry, count) || "N";
      else if (tag === TAG_GPS_LON_REF) lonRef = readAscii(entry, count) || "E";
      else if (tag === TAG_GPS_LAT) lat = dms(readRationals(entry, count));
      else if (tag === TAG_GPS_LON) lon = dms(readRationals(entry, count));
    });
    if (lat !== undefined && lon !== undefined && (lat !== 0 || lon !== 0)) {
      meta.lat = /s/i.test(latRef) ? -lat : lat;
      meta.lon = /w/i.test(lonRef) ? -lon : lon;
    }
  }

  return meta;
}

/** Degrees-minutes-seconds triple → decimal degrees. */
function dms(parts: number[]): number {
  const [d = 0, m = 0, s = 0] = parts;
  return d + m / 60 + s / 3600;
}

/** "YYYY:MM:DD HH:MM:SS" (EXIF local time) → ms epoch. */
function parseExifDate(s: string): number | undefined {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return Number.isNaN(t) ? undefined : t;
}
