import { useEffect, useState } from "react";

/**
 * Subscribes to navigator.onLine via the `online` / `offline` events.
 * The initial value is read synchronously so first render is correct.
 *
 * Note: navigator.onLine reports the OS-level network state, not whether
 * any specific endpoint is reachable. Good enough for an indicator;
 * not good enough for "is the CDN up". The sample loader already handles
 * fetch failures gracefully on top of this.
 */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
