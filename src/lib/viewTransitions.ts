import { flushSync } from "react-dom";

/**
 * Tiny wrapper around `document.startViewTransition` so callers don't have
 * to feature-detect. When the browser supports the View Transitions API,
 * the state update happens inside a transition that animates the visual
 * diff at the compositor level (smoother than any JS-driven animation).
 * Falls back to running the callback synchronously otherwise.
 *
 * Important: in the supported path, callers should AVOID also running a
 * JS-based morph (e.g. framer-motion's `layoutId`) on the same element,
 * or the two animations fight. `supportsViewTransitions()` lets callers
 * gate that.
 */

export function supportsViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * For navigation triggered from a React event handler (e.g. tapping a tile).
 * React commits the update at the right moment for the transition to capture
 * the before/after states, so we pass the callback straight through — do NOT
 * wrap it in `flushSync` here, which changes the commit timing and breaks the
 * hero morph on tap.
 */
export function startTransition(cb: () => void): void {
  if (supportsViewTransitions()) {
    document.startViewTransition(cb);
  } else {
    cb();
  }
}

/**
 * For navigation triggered OUTSIDE a React event — e.g. the guided tour's
 * async (setTimeout) timeline. There, React batches the state update into a
 * microtask that would run *after* the transition snapshots the DOM, freezing
 * a stale frame. `flushSync` commits synchronously so the snapshot is fresh.
 */
export function startTransitionSync(cb: () => void): void {
  if (supportsViewTransitions()) {
    document.startViewTransition(() => flushSync(cb));
  } else {
    cb();
  }
}
