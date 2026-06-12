import type { Crop } from "./crop";

/**
 * The on-disk backup format: a plain ZIP archive containing every placed
 * photo's ORIGINAL bytes (never re-encoded) plus a `manifest.json` that maps
 * each file back to its color, slot, and crop. Using real ZIP — store-only,
 * with proper CRCs — means the backup is also just a folder of photos the
 * player can open in any file manager, not an opaque blob they have to
 * trust us to read back.
 *
 * Writing emits store-only (uncompressed) entries: photos are already
 * compressed image data, and "no compression" keeps the writer tiny and the
 * memory profile flat. Reading additionally accepts deflate entries via
 * DecompressionStream, so an archive a user unzipped and re-zipped with a
 * desktop tool still restores.
 */

export interface BackupPhotoEntry {
  /** Path of this photo inside the archive, e.g. "photos/red-3.jpg". */
  file: string;
  /** Original MIME type, reapplied on restore. */
  type: string;
  /** Non-destructive grid crop, if one was set. */
  crop?: Crop;
}

export interface BackupManifest {
  app: "snaps-board-backup";
  version: 1;
  boardName: string;
  savedAt: number;
  /** colorId -> 9 slots, each a photo entry or null. */
  colors: Record<string, (BackupPhotoEntry | null)[]>;
}

export const MANIFEST_NAME = "manifest.json";

/** Thrown when a file handed to readBackupZip isn't a usable backup. */
export class BackupFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupFileError";
  }
}

// ---------------------------------------------------------------- writing

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time:
      (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date:
      (((d.getFullYear() - 1980) & 0x7f) << 9) |
      ((d.getMonth() + 1) << 5) |
      d.getDate(),
  };
}

const UTF8_FLAG = 0x0800;

/**
 * Assemble a store-only ZIP. Each input blob's bytes are read once (for the
 * CRC) and the output Blob references the inputs rather than copying them,
 * so peak memory stays around one photo at a time.
 */
export async function buildBackupZip(
  files: { name: string; blob: Blob }[],
): Promise<Blob> {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const parts: (Uint8Array<ArrayBuffer> | Blob)[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const bytes = new Uint8Array(await f.blob.arrayBuffer());
    const crc = crc32(bytes);
    const size = bytes.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, 0, true); // method: store
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, f.blob);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true); // made by
    cd.setUint16(6, 20, true); // needed
    cd.setUint16(8, UTF8_FLAG, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true); // local header offset
    const entry = new Uint8Array(46 + nameBytes.length);
    entry.set(new Uint8Array(cd.buffer), 0);
    entry.set(nameBytes, 46);
    central.push(entry);

    offset += 30 + nameBytes.length + size;
  }

  const cdSize = central.reduce((n, e) => n + e.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  parts.push(...central, new Uint8Array(eocd.buffer));

  return new Blob(parts, { type: "application/zip" });
}

// ---------------------------------------------------------------- reading

/**
 * Open a backup archive and return its manifest plus a lazily-sliced Blob
 * per photo file. Photo bytes are not read into memory here — stored
 * entries come back as zero-copy slices of the source file.
 */
export async function readBackupZip(
  file: Blob,
): Promise<{ manifest: BackupManifest; files: Map<string, Blob> }> {
  // End-of-central-directory record: scan the tail (sig + max comment).
  const tailStart = Math.max(0, file.size - 65557);
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new BackupFileError("Not a ZIP archive");
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);

  const cd = new DataView(
    await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer(),
  );
  const dec = new TextDecoder();
  const out = new Map<string, Blob>();
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) {
      throw new BackupFileError("Damaged archive directory");
    }
    const method = cd.getUint16(p + 10, true);
    const compSize = cd.getUint32(p + 20, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const localOffset = cd.getUint32(p + 42, true);
    const name = dec.decode(
      new Uint8Array(cd.buffer, p + 46, nameLen),
    );
    p += 46 + nameLen + extraLen + commentLen;

    // The local header's name/extra lengths can differ from the central
    // directory's — read them to find where the data really starts.
    const local = new DataView(
      await file.slice(localOffset, localOffset + 30).arrayBuffer(),
    );
    if (local.getUint32(0, true) !== 0x04034b50) {
      throw new BackupFileError("Damaged archive entry");
    }
    const dataStart =
      localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    const raw = file.slice(dataStart, dataStart + compSize);

    if (method === 0) {
      out.set(name, raw);
    } else if (method === 8 && typeof DecompressionStream !== "undefined") {
      out.set(
        name,
        await new Response(
          raw.stream().pipeThrough(new DecompressionStream("deflate-raw")),
        ).blob(),
      );
    }
    // Other methods: skip the entry; the importer reports it as missing.
  }

  const manifestBlob = out.get(MANIFEST_NAME);
  if (!manifestBlob) {
    throw new BackupFileError("No Snaps manifest in this archive");
  }
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(await manifestBlob.text()) as BackupManifest;
  } catch {
    throw new BackupFileError("Unreadable Snaps manifest");
  }
  if (manifest?.app !== "snaps-board-backup" || manifest.version !== 1) {
    throw new BackupFileError("Not a Snaps board backup");
  }
  return { manifest, files: out };
}
