/**
 * Best-effort haptic feedback. The Vibration API is supported on Android
 * browsers and is silently ignored on iOS Safari, so this is purely additive.
 */
type Feel = "tap" | "select" | "success";

const PATTERNS: Record<Feel, number | number[]> = {
  tap: 6,
  select: 10,
  success: [10, 50, 16],
};

export function haptic(feel: Feel = "tap"): void {
  try {
    navigator.vibrate?.(PATTERNS[feel]);
  } catch {
    /* no-op */
  }
}
