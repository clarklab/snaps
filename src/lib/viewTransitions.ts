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
 *
 * The state update is wrapped in `flushSync` so React commits the DOM
 * *synchronously* before `startViewTransition` snapshots it. Without this,
 * a callback invoked outside a React event handler (e.g. the guided tour's
 * async timeline) would be batched into a microtask and run after the
 * snapshot — freezing a stale frame and making the morph look like it jumps.
 */

export function supportsViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function startTransition(cb: () => void): void {
  if (supportsViewTransitions()) {
    document.startViewTransition(() => flushSync(cb));
  } else {
    cb();
  }
}
