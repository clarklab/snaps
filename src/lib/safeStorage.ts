/**
 * Defensive wrappers around localStorage. Writes can throw in Safari private
 * mode, on quota-exhausted devices, or when storage is disabled. Reads can
 * throw under the same conditions. The app stays alive either way; callers
 * are notified via the optional onError hook so the UI can surface it.
 */

let onErrorHook: ((err: unknown, op: "get" | "set" | "remove") => void) | null = null;

export function setStorageErrorHandler(
  fn: ((err: unknown, op: "get" | "set" | "remove") => void) | null,
): void {
  onErrorHook = fn;
}

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    onErrorHook?.(err, "get");
    return null;
  }
}

export function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    onErrorHook?.(err, "set");
    return false;
  }
}

export function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    onErrorHook?.(err, "remove");
  }
}

/** True if the error is (or wraps) a QuotaExceededError from any storage API. */
export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014
  );
}
