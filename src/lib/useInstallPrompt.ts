import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps the PWA install lifecycle so a UI can offer a real "Install App"
 * button when the platform supports it.
 *
 * Behaviour by platform:
 *  - Chromium (Android, desktop): the browser fires `beforeinstallprompt`
 *    once the PWA meets installability criteria. We capture and replay
 *    it on `install()`.
 *  - iOS Safari: no programmatic install. `canInstall` stays false; we
 *    surface `needsManualInstructions` so callers can show "Tap share →
 *    Add to Home Screen" instead of a button that wouldn't work.
 *  - Already installed (running in standalone): `isStandalone` is true
 *    and the install UI should be hidden.
 */

// Chromium's beforeinstallprompt is not standard, so type it minimally.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * True when the app is running as an installed PWA (launched from the home
 * screen) rather than inside a browser tab. Exported so non-install UI — like
 * the first-run intro — can tell that the user has already added the app and
 * skip flows that only make sense in the browser.
 */
export function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari sets this non-standard flag when launched from the home screen.
  const navWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  return navWithStandalone.standalone === true;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
}

export interface InstallApi {
  /** True if `install()` can actually trigger the native prompt right now. */
  canInstall: boolean;
  /** True if the app is already running as an installed PWA. */
  isStandalone: boolean;
  /** True if there's no programmatic prompt available but the user could install manually (iOS Safari). */
  needsManualInstructions: boolean;
  /** Trigger the native install prompt; resolves true if the user accepted. */
  install: () => Promise<boolean>;
}

export function useInstallPrompt(): InstallApi {
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(detectStandalone);
  const isIOS = useRef(detectIOS()).current;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      deferred.current = null;
      setCanInstall(false);
      setIsStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const evt = deferred.current;
    if (!evt) return false;
    try {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      deferred.current = null;
      setCanInstall(false);
      return outcome === "accepted";
    } catch {
      return false;
    }
  }, []);

  return {
    canInstall,
    isStandalone,
    needsManualInstructions: !canInstall && !isStandalone && isIOS,
    install,
  };
}
