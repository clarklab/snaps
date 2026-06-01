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
      <motion.div
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
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tint}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ type: "spring", stiffness: 240, damping: 28 }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
