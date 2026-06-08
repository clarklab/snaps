# Snaps

Colors: you gotta catch 'em all.

**Snaps** is a local-first, cross-platform photo game that runs in the
browser on iOS and Android (and desktop). You get a 3×3 board of nine colors
arranged like a rainbow. Tap a color and it expands into its own 3×3 board of
empty slots — your job is to fill all nine with photos of things in that color.
A blue door, a blue mug, a blue sky… then step back and admire the collage.

It's a single-player take on the trip idea where each friend only shoots one
color and ends up with a beautiful single-hue grid.

## What it does

- **Nine colors**, arranged rainbow-style: Red, Orange, Yellow / Green, Blue,
  Purple / Pink, Black, White.
- **Tap to dive in** — the color tile morphs into its photo board.
- **Fill a slot** by choosing from your camera roll, or by taking a photo right
  then with your phone's camera (`<input type="file" capture>`).
- **Full resolution, always.** A browser can't reference a filesystem path, so
  the faithful equivalent is used: the **original file bytes are stored,
  untouched, in IndexedDB** on your device — never re-encoded or compressed. A
  tiny thumbnail is generated alongside purely for fast grid rendering. (Verified:
  a 42,411-byte source photo is stored as exactly 42,411 bytes.)
- **Local only.** Nothing is uploaded; there is no server and no network call.
  Board layout lives in `localStorage`; photo bytes live in IndexedDB.
- **Installable PWA.** Add to Home Screen for a standalone, full-screen app that
  works completely offline (app shell + fonts are precached).
- **Share into Snaps.** Once installed, Snaps registers as a share target
  (Web Share Target API): pick a photo in your gallery, hit **Share → Snaps**,
  and the app asks which color and which slot, then lets you set a
  non-destructive crop. Supported on Android / desktop Chromium; iOS Safari
  doesn't implement share targets, so Snaps simply won't appear in its share
  sheet there.
- **Progress, gently.** Each color tile shows a `n/9` ring; the home screen
  shows an overall bar that taps to toggle between "colors complete" (`2 of 9`)
  and "photos placed" (`42 of 81`).
- **Light & dark**, following the system by default, with an in-app switcher in
  Settings (System / Light / Dark).
- **Google Sans Flex** throughout, self-hosted (OFL) so it works offline.

## Tech

- **React + TypeScript + Vite**, no backend.
- **framer-motion** for the tile→board morph, sheets, and gestures.
- **IndexedDB** (hand-rolled wrapper) for full-quality photo bytes; `localStorage`
  for board state.
- **vite-plugin-pwa** (Workbox) for the offline service worker + manifest.

## Project layout

```
index.html
vite.config.ts            Vite + PWA manifest / service worker
public/
  fonts/                  Google Sans Flex (OFL) — see NOTICE.md
  icons/                  App + maskable + Apple touch icons
src/
  main.tsx                Entry; wraps app in Theme + Store providers
  App.tsx                 Home header + board, detail overlay, settings
  sw.ts                   Custom service worker (precache + Web Share Target)
  colors.ts               The nine colors, swatches, contrast helpers
  index.css               Tokens (light/dark), @font-face, resets
  lib/
    db.ts                 IndexedDB blob store (full + thumb) + layout backup
    image.ts              Thumbnail generation (canvas), never touches original
    shareTarget.ts        Reads images shared into Snaps back out of the SW cache
  state/
    store.tsx             Boards: colorId → nine photo references
    theme.tsx             Appearance mode + effective scheme
  components/
    ColorBoard.tsx        Home 3×3 color grid + overall progress
    ColorDetail.tsx       A single color's 3×3 photo board + pickers
    ShareIntake.tsx       Place + crop photos shared in via the share target
    PhotoHunt.tsx         Croatian-flag FAB + multilingual photo-permission card
    PhotoViewer.tsx       Full-screen, full-quality viewer (drag to dismiss)
    Thumbnail.tsx         Loads a stored photo by id via object URL
    Progress.tsx          Slim bar + progress ring
    Sheet.tsx             Reusable bottom sheet
    Settings.tsx          Appearance switcher + stats + privacy note
```

## Run it

```sh
npm install
npm run dev        # local dev server
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
```

Open on your phone (same network, or deploy to **snaps.quest**) and use
**Add to Home Screen** for the full standalone app experience. Granting the
photo picker happens through the OS the first time you add a photo.

## Deploy (Netlify)

`netlify.toml` is included, so deploying is zero-config:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- SPA fallback + sensible cache headers (long-lived for fingerprinted assets
  and fonts; always-revalidate for `sw.js` and the manifest) are configured.

Point Netlify at the repo (or `netlify deploy --build --prod`) and attach the
**snaps.quest** domain. Because it's a PWA, the first visit installs the service
worker and subsequent visits work offline.

## Notes on quality & privacy

Everything stays on the device. Originals are stored verbatim and only ever
downscaled for the on-screen thumbnail; the full-screen viewer reads the
original bytes back. Because storage is per-browser, clearing site data (or
deleting the installed app) removes the photos from Snaps — the originals
in your camera roll are of course untouched.

---

Domain: [snaps.quest](https://snaps.quest)
