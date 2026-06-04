import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  // Production build settings tuned for slow / metered connections:
  //   - drop console + debugger so production JS doesn't ship dev noise
  //   - target modern evergreen browsers so esbuild emits tighter output
  //   - split react and framer-motion into their own chunks so an app-code
  //     deploy doesn't bust the (much larger) vendor cache
  esbuild: {
    drop: ["console", "debugger"],
  },
  build: {
    target: "es2020",
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          motion: ["framer-motion"],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/apple-touch-icon.png",
        "icons/favicon-64.png",
        "fonts/*.woff2",
        "unfurl.webp",
      ],
      manifest: {
        name: "Snaps — A color hunt for your travels",
        short_name: "Snaps",
        description:
          "A pocket-size color hunt. Collect nine photos of nine colors, then share the rainbow you found.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0c0c0e",
        theme_color: "#0c0c0e",
        lang: "en",
        dir: "ltr",
        // Explicitly tell stores we don't have a wrapped native app — keep
        // the install prompt pointing at the PWA itself.
        prefer_related_applications: false,
        categories: ["photo", "lifestyle", "games"],
        // Re-using an open Snaps tab on relaunch keeps the user's IndexedDB
        // photo store on the same client instance instead of opening a
        // second tab with stale state.
        launch_handler: { client_mode: ["focus-existing", "auto"] },
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
        // Native-iPhone 14 Pro frames; the Play Store + the modern install
        // prompts surface these so users see the actual UI before they
        // tap install.
        screenshots: [
          {
            src: "marketing/01-grid-partial.png",
            sizes: "1179x2556",
            type: "image/png",
            form_factor: "narrow",
            label: "Home grid filling in with photos",
          },
          {
            src: "marketing/02-welcome-sheet.png",
            sizes: "1179x2556",
            type: "image/png",
            form_factor: "narrow",
            label: "How Snaps works — welcome sheet",
          },
          {
            src: "marketing/03-intro.png",
            sizes: "1179x2556",
            type: "image/png",
            form_factor: "narrow",
            label: "Watercolor intro",
          },
        ],
      },
      workbox: {
        // Precache the app shell + fonts + sample manifest + sample WebPs
        // so the full offline experience (including "load sample boards")
        // works after the first visit.
        globPatterns: [
          "**/*.{js,css,html,png,svg,woff2,webp,json,webmanifest}",
        ],
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
        // Workbox refuses to precache files larger than this; raise it a
        // little so larger sample sets (≈5 MB total today) don't get skipped.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
