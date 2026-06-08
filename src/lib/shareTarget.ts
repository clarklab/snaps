/**
 * Client side of the Web Share Target flow.
 *
 * The service worker (src/sw.ts) stashes shared images in a private cache and
 * redirects to `/?share-target=1`. This module reads those bytes back as
 * `File`s and then deletes the cache, so a refresh can never re-import the
 * same photos twice.
 */

const SHARE_CACHE = "snaps-shared-v1";
const SHARE_MANIFEST_KEY = "/shared/manifest.json";
/** Query flag the SW redirect appends after a share. */
export const SHARE_FLAG = "share-target";

interface SharedEntry {
  key: string;
  name: string;
  type: string;
}

/** True if this load was triggered by an incoming share. */
export function launchedFromShare(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(SHARE_FLAG);
}

/** Strip the `?share-target=1` flag from the URL without reloading. */
export function clearShareFlag(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SHARE_FLAG)) return;
  url.searchParams.delete(SHARE_FLAG);
  window.history.replaceState(
    null,
    "",
    url.pathname + url.search + url.hash,
  );
}

/**
 * Retrieve any images the OS shared into Snaps, rebuilding them as `File`s,
 * then clear the holding cache. Returns an empty array if there's nothing
 * pending (the common case on a normal launch) or if the Cache API is
 * unavailable.
 */
export async function takeSharedImages(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  try {
    // Skip opening (which would create) the cache on the overwhelmingly common
    // no-share launch.
    if (!(await caches.has(SHARE_CACHE))) return [];
    const cache = await caches.open(SHARE_CACHE);
    const manifestRes = await cache.match(SHARE_MANIFEST_KEY);
    if (!manifestRes) return [];

    const entries = (await manifestRes.json()) as SharedEntry[];
    const files: File[] = [];
    for (const entry of entries) {
      const res = await cache.match(entry.key);
      if (!res) continue;
      const blob = await res.blob();
      files.push(
        new File([blob], entry.name || "shared", {
          type: entry.type || blob.type || "image/jpeg",
        }),
      );
    }

    // Consume: once we hold the bytes in memory the cache copy is dead weight
    // and (worse) would re-import on the next refresh.
    await caches.delete(SHARE_CACHE);
    return files;
  } catch {
    return [];
  }
}
