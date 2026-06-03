import { motion } from "framer-motion";

export function ProgressBar({
  value,
  total,
  tint,
}: {
  value: number;
  total: number;
  tint: string;
}) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: "var(--fill-quaternary)",
        overflow: "hidden",
      }}
    >
      {/* `initial={{ width: 0 }}` is critical — without it the inner div
          renders at CSS `width: auto` on first paint (100% of parent),
          flashing a full bar that then snaps to the real value once
          framer-motion applies the animated width. Starting at 0 means
          the bar always fills in. */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 240, damping: 28 }}
        style={{ height: "100%", borderRadius: 999, background: tint }}
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
