/**
 * Service-worker registration with friendly UX hooks.
 *
 * vite-plugin-pwa generates a virtual module that wraps Workbox's
 * registration; we forward its lifecycle events as window CustomEvents so
 * React components (the ToastProvider listener in App.tsx) can react
 * without any cross-module coupling.
 */

export interface SwUpdateDetail {
  /** Call to activate the waiting SW and reload. */
  update: () => Promise<void>;
}

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (typeof window === "undefined") return;

  void import("virtual:pwa-register")
    .then(({ registerSW }) => {
      const update = registerSW({
        immediate: true,
        onNeedRefresh() {
          window.dispatchEvent(
            new CustomEvent<SwUpdateDetail>("snaps:sw-update", {
              detail: { update: async () => void update(true) },
            }),
          );
        },
        onOfflineReady() {
          window.dispatchEvent(new CustomEvent("snaps:sw-offline-ready"));
        },
        onRegisterError(err: unknown) {
          // Swallow — registration failures are best-effort.
          console.warn("SW registration failed", err);
        },
      });
    })
    .catch((err) => {
      console.warn("SW module load failed", err);
    });
}
