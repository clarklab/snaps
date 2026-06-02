import { COLORS, SLOTS_PER_BOARD } from "../colors";

/**
 * Sample boards: a curated set of single-color photos (built offline from
 * Unsplash — see scripts/build_samples.py) that a player can load to see
 * finished collages instantly. The manifest only holds image URLs + credit;
 * the images themselves are fetched on demand and stored locally, exactly
 * like a photo the player adds, so the experience stays local-first.
 */

export interface SampleEntry {
  url: string;
  alt?: string;
  author?: string;
  authorUrl?: string;
  link?: string;
}

export interface SamplesManifest {
  source?: string;
  generatedAt?: string;
  colors: Record<string, SampleEntry[]>;
}

let cache: SamplesManifest | null | undefined;

export async function getSamplesManifest(): Promise<SamplesManifest | null> {
  if (cache !== undefined) return cache;
  try {
    // Default cache mode so the service worker can serve from its precache
    // when the device is offline.
    const res = await fetch(`${import.meta.env.BASE_URL}samples.json`);
    if (!res.ok) {
      cache = null;
      return null;
    }
    const data = (await res.json()) as SamplesManifest;
    cache = data && data.colors && Object.keys(data.colors).length ? data : null;
  } catch {
    cache = null;
  }
  return cache;
}

/** Minimal slice of the store the seeder needs (avoids an import cycle). */
interface SeedStore {
  filledCount: (colorId: string) => number;
  addPhoto: (
    colorId: string,
    slot: number,
    file: Blob,
    opts?: { sample?: boolean }
  ) => Promise<void>;
}

/**
 * Fisher-Yates shuffle — used so the sample boards fill in as a fun
 * cross-color trickle rather than completing one color before the next.
 */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * How many sample fetches run at once. The local-precached set is small
 * (≈40 KB each), so the bottleneck is canvas thumbnailing on the main
 * thread. Ten gives the cascade a livelier "popcorn" feel without
 * fully starving the UI thread on mid-range Androids.
 */
const CONCURRENCY = 10;

/**
 * Fills every *empty* color board from the manifest. Boards that already have
 * any photo are left untouched so we never clobber the player's own work.
 *
 * Items are shuffled across colors and pulled by a small pool of workers, so
 * photos pop into different boards at the same time instead of completing
 * one color before starting the next. Returns the number of photos placed.
 */
export async function loadSampleBoards(
  store: SeedStore,
  manifest: SamplesManifest,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const items: { colorId: string; slot: number; url: string }[] = [];
  for (const color of COLORS) {
    if (store.filledCount(color.id) > 0) continue;
    const entries = (manifest.colors[color.id] ?? []).slice(0, SLOTS_PER_BOARD);
    entries.forEach((e, slot) => items.push({ colorId: color.id, slot, url: e.url }));
  }

  const queue = shuffled(items);
  const total = queue.length;
  if (total === 0) return 0;

  let done = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= queue.length) return;
      const it = queue[i];
      try {
        const res = await fetch(it.url);
        const blob = await res.blob();
        if (blob.type.startsWith("image/")) {
          await store.addPhoto(it.colorId, it.slot, blob, { sample: true });
        }
      } catch {
        /* skip a single failed image, keep going */
      }
      done++;
      onProgress?.(done, total);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()),
  );
  return done;
}
