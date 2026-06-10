/// <reference lib="webworker" />
/**
 * Custom Snaps service worker (Workbox `injectManifest` strategy).
 *
 * It does everything the previous auto-generated worker did — precache the
 * app shell + fonts + samples, clean up old caches, and fall back to
 * index.html for SPA navigations — plus one thing a generated worker can't:
 * it receives shared images via the Web Share Target API.
 *
 * Snaps is a static, server-less PWA, so when the OS share sheet sends an
 * image to us it arrives as a POST that nothing on a CDN can answer. The
 * service worker is the only code that can intercept it: we stash the file
 * bytes in a private cache and redirect to the app, which reads them back on
 * load (see lib/shareTarget.ts) and walks the user through placing them.
 *
 * Note: the Web Share *Target* API is supported on Android (installed
 * Chromium PWAs) and desktop Chrome; iOS/iPadOS Safari does not implement it,
 * so Snaps simply won't appear in the iOS share sheet. The handler is inert
 * there and costs nothing.
 */
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

/** Cache that briefly holds freshly-shared images until the app consumes them. */
const SHARE_CACHE = "snaps-shared-v1";
/** The form field name declared in the manifest's `share_target.params.files`. */
const SHARE_FIELD = "photos";
/** Must match `share_target.action` in the manifest. */
const SHARE_PATH = "/share-target";
/** Key under which the app finds the list of stashed images. */
export const SHARE_MANIFEST_KEY = "/shared/manifest.json";

// autoUpdate semantics: take over as soon as we're installed/activated so a
// freshly-shared image lands in the newest code, not a stale tab.
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
// __WB_MANIFEST is replaced at build time with the precache manifest.
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback (replaces the old workbox.navigateFallback). The
// share POST is denylisted so it falls through to our fetch handler rather
// than being answered with the app shell.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [new RegExp(`^${SHARE_PATH}`)],
  }),
);

// Wedged-IndexedDB rescue (see watchForWedge in lib/db.ts). A window stuck
// behind a blocked connection queue asks us to reload every *other* window:
// any stale-build window holding the old database connection gets replaced
// with fresh code that releases it, which un-wedges the sender on its own.
// Rate-limited so two wedged windows can't ping-pong reloads.
let lastStaleRefresh = 0;
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | null;
  if (data?.type !== "snaps:refresh-stale-clients") return;
  const now = Date.now();
  if (now - lastStaleRefresh < 10_000) return;
  lastStaleRefresh = now;
  event.waitUntil(
    (async () => {
      const senderId = (event.source as Client | null)?.id;
      const wins = await self.clients.matchAll({ type: "window" });
      for (const client of wins) {
        if (client.id === senderId) continue;
        try {
          await (client as WindowClient).navigate(client.url);
        } catch {
          /* uncontrollable client — skip */
        }
      }
    })(),
  );
});

/**
 * Metadata the app needs to rebuild each shared File from its cached bytes.
 */
interface SharedEntry {
  key: string;
  name: string;
  type: string;
}

// Web Share Target receiver. Workbox's router only handles GET, so this POST
// never collides with the routes above; we add our own listener for it.
self.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== SHARE_PATH) return;

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form
          .getAll(SHARE_FIELD)
          .filter((v): v is File => v instanceof File && v.type.startsWith("image/"));

        const cache = await caches.open(SHARE_CACHE);
        // Drop any previous, unconsumed share so we never mix two batches.
        for (const req of await cache.keys()) await cache.delete(req);

        const entries: SharedEntry[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const key = `/shared/${i}`;
          await cache.put(
            key,
            new Response(file, {
              headers: {
                "content-type": file.type || "application/octet-stream",
              },
            }),
          );
          entries.push({ key, name: file.name || `shared-${i}`, type: file.type });
        }

        await cache.put(
          SHARE_MANIFEST_KEY,
          new Response(JSON.stringify(entries), {
            headers: { "content-type": "application/json" },
          }),
        );
      } catch {
        // If anything goes wrong we still redirect; the app finds no pending
        // share and simply carries on as a normal launch.
      }

      // 303 makes the browser follow up with a GET for the app shell.
      return Response.redirect("/?share-target=1", 303);
    })(),
  );
});
