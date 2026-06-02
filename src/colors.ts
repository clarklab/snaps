export type Scheme = "light" | "dark";

export interface QuestColor {
  id: string;
  name: string;
  light: string; // swatch hex in light mode
  dark: string; // swatch hex in dark mode
  /** Near-black / near-white tiles need a hairline border to stay visible. */
  needsBorder?: boolean;
}

/**
 * Nine colors arranged like a rainbow, with the wildcards on the bottom row:
 *
 *   Red    Orange  Yellow
 *   Green  Blue    Purple
 *   Pink   Black   White
 */
export const COLORS: QuestColor[] = [
  { id: "red", name: "Red", light: "#ff3b30", dark: "#ff453a" },
  { id: "orange", name: "Orange", light: "#ff9500", dark: "#ff9f0a" },
  { id: "yellow", name: "Yellow", light: "#ffcc00", dark: "#ffd60a" },
  { id: "green", name: "Green", light: "#34c759", dark: "#30d158" },
  { id: "blue", name: "Blue", light: "#007aff", dark: "#0a84ff" },
  { id: "purple", name: "Purple", light: "#af52de", dark: "#bf5af2" },
  // Warm dusty rose rather than system magenta — the pink of Italian
  // stucco walls and a cherry blossom rather than a highlighter.
  { id: "pink", name: "Pink", light: "#e89c9a", dark: "#eea9a5" },
  // Black & white stay literal in both schemes; the hairline border keeps them
  // visible against the matching background.
  { id: "black", name: "Black", light: "#1c1c1e", dark: "#1c1c1e", needsBorder: true },
  { id: "white", name: "White", light: "#ffffff", dark: "#ffffff", needsBorder: true },
];

export const SLOTS_PER_BOARD = 9;

export function colorById(id: string): QuestColor | undefined {
  return COLORS.find((c) => c.id === id);
}

export function swatch(color: QuestColor, scheme: Scheme): string {
  return scheme === "dark" ? color.dark : color.light;
}

/** Relative luminance of a hex color, 0–1. */
function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white text that reads well on top of the given swatch. */
export function readableInk(hex: string): string {
  return luminance(hex) > 0.6 ? "rgba(0,0,0,0.88)" : "#ffffff";
}

/** A soft, color-matched wash for empty slots / backgrounds. */
export function wash(hex: string, scheme: Scheme): string {
  const alpha = scheme === "dark" ? 0.18 : 0.12;
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
