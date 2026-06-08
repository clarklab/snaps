import { motion } from "framer-motion";

export function ProgressBar({
  value,
  total,
  tint,
  underlay,
}: {
  value: number;
  total: number;
  tint: string;
  /**
   * An optional second fill drawn *beneath* the main one, sharing the same
   * track and left edge. Used on the home grid so a fine-grained gray fill
   * (every photo placed) shows underneath, with the brighter main fill
   * (every color grid completed) overlapping it. The main fill is always
   * ≤ the underlay, so it reads as the underlay "leveling up" to color.
   */
  underlay?: { value: number; total: number; tint: string };
}) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  const underPct =
    underlay && underlay.total !== 0
      ? (underlay.value / underlay.total) * 100
      : 0;
  return (
    <div
      style={{
        position: "relative",
        height: 6,
        borderRadius: 999,
        background: "var(--fill-quaternary)",
        overflow: "hidden",
      }}
    >
      {/* Gray photo-progress fill, beneath the bright fill. Same flash-of-full
          guard (`initial={{ width: 0 }}`) as the main bar below. */}
      {underlay && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${underPct}%` }}
          transition={{ type: "spring", stiffness: 240, damping: 28 }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            borderRadius: 999,
            background: underlay.tint,
          }}
        />
      )}
      {/* `initial={{ width: 0 }}` is critical — without it the inner div
          renders at CSS `width: auto` on first paint (100% of parent),
          flashing a full bar that then snaps to the real value once
          framer-motion applies the animated width. Starting at 0 means
          the bar always fills in. */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 240, damping: 28 }}
        style={{
          position: "relative",
          height: "100%",
          borderRadius: 999,
          background: tint,
        }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  total,
  tint,
  track,
  size = 20,
  stroke = 3,
}: {
  value: number;
  total: number;
  tint: string;
  track: string;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total === 0 ? 0 : value / total;
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={track}
        strokeWidth={stroke}
      />
      {/* Same flash-of-full bug applies to the ring: without an explicit
          initial, the SVG draws the full circle on first paint before the
          animated dashoffset is applied. Start fully offset (empty ring)
          and animate to the real value. */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tint}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ type: "spring", stiffness: 240, damping: 28 }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
