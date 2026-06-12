import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  COLORS,
  colorById,
  readableInk,
  swatch,
  wash,
  type QuestColor,
} from "../colors";
import { getPhoto } from "../lib/db";
import { haptic } from "../lib/haptics";
import { useStore, type CompletionEvent } from "../state/store";
import { useTheme } from "../state/theme";
import { Confetti } from "./Confetti";
import { ShareSheet, type ShareTarget } from "./ShareSheet";
import { Thumbnail } from "./Thumbnail";

/**
 * Completion celebrations, driven by the store's CompletionEvent (emitted
 * only when a real photo placement fills a color grid's last slot — never by
 * hydration, restores, imports or sample seeding, so these can't false-fire).
 *
 * Two tiers:
 *  - ColorCelebration: a color grid just filled — confetti tinted to the
 *    color, the nine photos popping in, and how many colors remain.
 *  - OverallFinale: the 81st snap — the full end-game. Rainbow confetti
 *    bursts, count-up stats read straight from IndexedDB (photo count,
 *    first→last time span, total bytes), and the overall share.
 *
 * Everything here is read-only against storage: stats come from getPhoto
 * reads that skip anything unreadable, and nothing is ever written.
 *
 * Stacking: the celebration overlay sits at z 48 — above the color detail
 * (10) and default confetti (45), below sheets (50) so the ShareSheet it
 * opens slides in on top, and below the share intake (85) / tour layer (90).
 * While either of those owns the screen the host *defers* instead: the event
 * is held and the celebration pops the moment the flow ends.
 */
export function CelebrationHost({ deferred = false }: { deferred?: boolean }) {
  const store = useStore();
  const [active, setActive] = useState<ActiveCelebration | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const lastSeq = useRef(0);
  const pending = useRef<CompletionEvent | null>(null);

  useEffect(() => {
    const ev = store.completion;
    if (ev && ev.seq !== lastSeq.current) {
      lastSeq.current = ev.seq;
      pending.current = ev;
    }
    if (deferred || !pending.current) return;
    const next = pending.current;
    pending.current = null;
    // Snapshot the completed grid's slots now, so the share target and the
    // mini preview show exactly what was on the board at the moment of glory.
    setActive({
      event: next,
      slots: [...(store.boards[next.colorId] ?? [])],
    });
    haptic("success");
  }, [store.completion, deferred, store.boards]);

  const color = active ? colorById(active.event.colorId) : undefined;

  return (
    <>
      <AnimatePresence>
        {active && !active.event.overallComplete && color && (
          <ColorCelebration
            key={`color-${active.event.seq}`}
            color={color}
            slots={active.slots}
            completedColors={active.event.completedColors}
            onShare={() =>
              setShareTarget({ kind: "board", color, slots: active.slots })
            }
            onClose={() => setActive(null)}
          />
        )}
        {active && active.event.overallComplete && (
          <OverallFinale
            key={`finale-${active.event.seq}`}
            onShare={() => setShareTarget({ kind: "overall" })}
            onClose={() => setActive(null)}
          />
        )}
      </AnimatePresence>
      {shareTarget && (
        <CelebrationShareSheet
          target={shareTarget}
          onDone={() => setShareTarget(null)}
        />
      )}
    </>
  );
}

interface ActiveCelebration {
  event: CompletionEvent;
  /** The completed color's slot ids, snapshotted at event time. */
  slots: (string | null)[];
}

/**
 * ShareSheet wrapper that mounts closed and opens on the next frame so the
 * sheet's slide-in plays (Sheet animates `open` transitions, not mounts) —
 * and that only exists while needed, so the overall preview's 81 thumbnail
 * reads don't run on every app launch.
 */
function CelebrationShareSheet({
  target,
  onDone,
}: {
  target: ShareTarget;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <ShareSheet
      open={open}
      onClose={() => {
        setOpen(false);
        // Let the slide-out tween (0.22s) finish before unmounting.
        window.setTimeout(onDone, 260);
      }}
      target={target}
    />
  );
}

/** Lock body scroll while a celebration owns the screen (same as Sheet). */
function useBodyScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────
// Tier 1: a single color grid completed
// ─────────────────────────────────────────────────────────────────────────

function ColorCelebration({
  color,
  slots,
  completedColors,
  onShare,
  onClose,
}: {
  color: QuestColor;
  slots: (string | null)[];
  completedColors: number;
  onShare: () => void;
  onClose: () => void;
}) {
  const { scheme } = useTheme();
  const store = useStore();
  useBodyScrollLock();

  const hex = swatch(color, scheme);
  const ink = readableInk(hex);
  const tile = wash(hex, scheme);
  const remaining = COLORS.length - completedColors;

  const message =
    completedColors === 1
      ? `First color in the bag — ${remaining} to go!`
      : remaining === 1
        ? "Just one more color and the whole board is yours!"
        : `${completedColors} of ${COLORS.length} colors complete — ${remaining} to go.`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${color.name} board complete`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 48,
        background: "var(--sheet-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Confetti tint={hex} count={120} zIndex={49} />
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 12 }}
        transition={{ type: "spring", stiffness: 340, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 340,
          background: "var(--bg-elevated)",
          borderRadius: 28,
          padding: "26px 22px 20px",
          textAlign: "center",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        }}
      >
        <CheckBadge hex={hex} ink={ink} needsBorder={color.needsBorder} />

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, type: "spring", stiffness: 300, damping: 24 }}
          style={{
            margin: "14px 0 4px",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: -0.4,
          }}
        >
          {color.name} complete!
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.26, duration: 0.3 }}
          style={{
            margin: "0 0 16px",
            fontSize: 14,
            color: "var(--label-secondary)",
          }}
        >
          All nine {color.name.toLowerCase()} snaps collected.
        </motion.p>

        {/* The nine photos, popping in one by one. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 5,
            width: 168,
            margin: "0 auto 18px",
          }}
        >
          {slots.map((photoId, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, rotate: i % 2 === 0 ? -10 : 10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{
                delay: 0.28 + i * 0.05,
                type: "spring",
                stiffness: 320,
                damping: 18,
              }}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 9,
                overflow: "hidden",
                background: tile,
              }}
            >
              {photoId && (
                <Thumbnail
                  photoId={photoId}
                  alt=""
                  tint={tile}
                  crop={store.crops[photoId]}
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Quest progress: one dot per color, lit when complete. */}
        <div
          aria-label={`${completedColors} of ${COLORS.length} colors complete`}
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {COLORS.map((c, i) => {
            const done = store.isComplete(c.id);
            const isNew = c.id === color.id;
            const dotHex =
              c.id === "white" && scheme === "light"
                ? "rgba(60, 60, 67, 0.3)"
                : swatch(c, scheme);
            return (
              <motion.span
                key={c.id}
                initial={{ scale: 0 }}
                animate={{ scale: isNew ? [0, 1.5, 1] : 1 }}
                transition={{
                  delay: 0.55 + i * 0.04,
                  type: "spring",
                  stiffness: 380,
                  damping: isNew ? 14 : 20,
                }}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: done ? dotHex : "var(--fill-quaternary)",
                  boxShadow:
                    done && c.needsBorder && c.id !== "white"
                      ? "inset 0 0 0 1px var(--hairline)"
                      : "none",
                }}
              />
            );
          })}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.3 }}
          style={{
            margin: "0 0 18px",
            fontSize: 14.5,
            fontWeight: 600,
            color: "var(--label)",
          }}
        >
          {message}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 26 }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <motion.button
            onClick={() => {
              haptic("select");
              onShare();
            }}
            whileTap={{ scale: 0.97 }}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              background: hex,
              color: ink,
              fontSize: 16,
              fontWeight: 700,
              boxShadow: color.needsBorder
                ? "inset 0 0 0 1px var(--hairline)"
                : "0 6px 20px rgba(0,0,0,0.22)",
            }}
          >
            Share {color.name}
          </motion.button>
          <motion.button
            onClick={() => {
              haptic("tap");
              onClose();
            }}
            whileTap={{ scale: 0.97 }}
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 14,
              background: "var(--fill-quaternary)",
              color: "var(--label)",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Keep snapping
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/** Big colored circle with a check that draws itself in. */
function CheckBadge({
  hex,
  ink,
  needsBorder,
}: {
  hex: string;
  ink: string;
  needsBorder?: boolean;
}) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -20 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.05 }}
      style={{
        width: 64,
        height: 64,
        borderRadius: 999,
        background: hex,
        margin: "0 auto",
        display: "grid",
        placeItems: "center",
        boxShadow: needsBorder ? "inset 0 0 0 1px var(--hairline)" : "none",
      }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
        <motion.path
          d="M8 17l6 6L25 11"
          stroke={ink}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.25, duration: 0.4, ease: "easeOut" }}
        />
      </svg>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tier 2: the whole board — the end game
// ─────────────────────────────────────────────────────────────────────────

interface FinaleStats {
  /** Placed slots, straight from the layout — the source of truth. */
  photoCount: number;
  /** How many of those photos' records read successfully. */
  measured: number;
  /** Sum of the readable originals' bytes. */
  totalBytes: number;
  firstAt: number | null;
  lastAt: number | null;
}

/**
 * Read-only stat sweep over every placed photo. Records that fail to read
 * are skipped (counted via `measured`) rather than failing the whole pass —
 * the finale shows what it can verify and stays honest about the rest.
 */
async function collectFinaleStats(
  boards: Record<string, (string | null)[]>,
): Promise<FinaleStats> {
  const ids: string[] = [];
  for (const c of COLORS) {
    for (const id of boards[c.id] ?? []) if (id) ids.push(id);
  }
  let totalBytes = 0;
  let measured = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  await Promise.all(
    ids.map(async (id) => {
      try {
        const rec = await getPhoto(id);
        if (!rec) return;
        measured++;
        totalBytes += rec.full?.size ?? 0;
        const t = rec.addedAt;
        if (typeof t === "number" && Number.isFinite(t) && t > 0) {
          firstAt = firstAt === null || t < firstAt ? t : firstAt;
          lastAt = lastAt === null || t > lastAt ? t : lastAt;
        }
      } catch {
        /* unreadable record — skip, never block the party */
      }
    }),
  );
  return { photoCount: ids.length, measured, totalBytes, firstAt, lastAt };
}

function OverallFinale({
  onShare,
  onClose,
}: {
  onShare: () => void;
  onClose: () => void;
}) {
  const store = useStore();
  const reduceMotion = useReducedMotion();
  useBodyScrollLock();

  const [stats, setStats] = useState<FinaleStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    void collectFinaleStats(store.boards).then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
    // Stats are a snapshot of the moment the finale opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const span =
    stats && stats.firstAt !== null && stats.lastAt !== null
      ? stats.lastAt - stats.firstAt
      : null;
  const spanParts = span !== null ? formatSpanParts(span) : null;
  const bytesParts =
    stats && stats.measured > 0 ? formatBytesParts(stats.totalBytes) : null;
  // Honesty marker: if some photos couldn't be measured, the total is a floor.
  const bytesApprox = stats !== null && stats.measured < stats.photoCount;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Board complete"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 48,
        background: "rgba(10, 10, 14, 0.72)",
        backdropFilter: "blur(16px) saturate(1.2)",
        WebkitBackdropFilter: "blur(16px) saturate(1.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding:
          "calc(var(--safe-top) + 24px) 24px calc(var(--safe-bottom) + 24px)",
      }}
    >
      <FinaleBursts />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          textAlign: "center",
          margin: "auto",
        }}
      >
        {/* Trophy: springs in, then floats. */}
        <motion.div
          initial={{ scale: 0, rotate: -16 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
          style={{ marginBottom: 6 }}
        >
          <motion.div
            animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
            transition={{
              duration: 2.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1.2,
            }}
            style={{ fontSize: 58, lineHeight: 1 }}
            aria-hidden
          >
            🏆
          </motion.div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 14, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.22, type: "spring", stiffness: 280, damping: 22 }}
          style={{
            margin: "8px 0 6px",
            fontSize: 38,
            fontWeight: 800,
            letterSpacing: -0.8,
            background:
              "linear-gradient(92deg, #ff453a, #ff9f0a, #ffd60a, #30d158, #0a84ff, #bf5af2)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          You did it!
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.35 }}
          style={{
            margin: "0 0 22px",
            fontSize: 15.5,
            fontWeight: 500,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          Every color, every slot — the whole board is complete.
        </motion.p>

        {/* Stats — staggered cards with count-up numbers. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <StatCard label="snaps collected" delay={0.5}>
            <CountUp
              value={stats ? stats.photoCount : store.totalSlots}
              delay={0.55}
            />
          </StatCard>

          {spanParts && (
            <StatCard label="from first snap to last" delay={0.62}>
              {"text" in spanParts ? (
                spanParts.text
              ) : (
                <>
                  <CountUp value={spanParts.value} delay={0.67} />{" "}
                  <StatUnit>{spanParts.unit}</StatUnit>
                </>
              )}
            </StatCard>
          )}

          {bytesParts && (
            <StatCard label="of memories saved" delay={0.74}>
              {bytesApprox && "≈ "}
              <CountUp
                value={bytesParts.value}
                decimals={bytesParts.decimals}
                delay={0.79}
              />{" "}
              <StatUnit>{bytesParts.unit}</StatUnit>
            </StatCard>
          )}
        </div>

        {stats && stats.firstAt !== null && stats.lastAt !== null && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.35 }}
            style={{
              margin: "0 0 22px",
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: 0.3,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            {formatDateRange(stats.firstAt, stats.lastAt)}
          </motion.p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, type: "spring", stiffness: 280, damping: 24 }}
          style={{ display: "flex", flexDirection: "column", gap: 9 }}
        >
          <motion.button
            onClick={() => {
              haptic("select");
              onShare();
            }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "16px 18px",
              borderRadius: 16,
              background: "#ffffff",
              color: "#0c0c0e",
              fontSize: 17,
              fontWeight: 700,
              boxShadow: "0 8px 28px rgba(255,255,255,0.22)",
            }}
          >
            <FinaleShareIcon />
            Share your board
          </motion.button>
          <motion.button
            onClick={() => {
              haptic("tap");
              onClose();
            }}
            whileTap={{ scale: 0.97 }}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.92)",
              fontSize: 15.5,
              fontWeight: 600,
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)",
            }}
          >
            Take a bow
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/** Three staggered rainbow bursts — one pop isn't enough for 81 photos. */
function FinaleBursts() {
  const [bursts, setBursts] = useState([0]);
  useEffect(() => {
    const t1 = window.setTimeout(() => setBursts((b) => [...b, 1]), 700);
    const t2 = window.setTimeout(() => setBursts((b) => [...b, 2]), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return (
    <>
      {bursts.map((i) => (
        <Confetti key={i} count={i === 0 ? 150 : 90} zIndex={49} />
      ))}
    </>
  );
}

function StatCard({
  label,
  delay,
  children,
}: {
  label: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 24 }}
      style={{
        background: "rgba(255,255,255,0.08)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
        borderRadius: 18,
        padding: "14px 16px 12px",
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          color: "#ffffff",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.5,
          lineHeight: 1.15,
        }}
      >
        {children}
      </div>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.6)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </motion.div>
  );
}

function StatUnit({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0 }}>
      {children}
    </span>
  );
}

/** Animated number that counts up from zero; instant under reduced motion. */
function CountUp({
  value,
  decimals = 0,
  delay = 0,
}: {
  value: number;
  decimals?: number;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);
  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      delay,
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [value, delay, reduceMotion]);
  return <>{display.toFixed(decimals)}</>;
}

// ── Formatting helpers ───────────────────────────────────────────────────

function formatSpanParts(
  ms: number,
): { value: number; unit: string } | { text: string } {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (ms < minute) return { text: "under a minute" };
  if (ms < 90 * minute) {
    const v = Math.max(1, Math.round(ms / minute));
    return { value: v, unit: v === 1 ? "minute" : "minutes" };
  }
  if (ms < 48 * hour) {
    const v = Math.max(1, Math.round(ms / hour));
    return { value: v, unit: v === 1 ? "hour" : "hours" };
  }
  if (ms < 2 * week) {
    const v = Math.round(ms / day);
    return { value: v, unit: v === 1 ? "day" : "days" };
  }
  if (ms < 9 * week) {
    const v = Math.round(ms / week);
    return { value: v, unit: v === 1 ? "week" : "weeks" };
  }
  const v = Math.max(2, Math.round(ms / (30.44 * day)));
  return { value: v, unit: "months" };
}

function formatBytesParts(n: number): {
  value: number;
  decimals: number;
  unit: string;
} {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (n >= GB) return { value: n / GB, decimals: 2, unit: "GB" };
  if (n >= 100 * MB) return { value: n / MB, decimals: 0, unit: "MB" };
  if (n >= MB) return { value: n / MB, decimals: 1, unit: "MB" };
  if (n >= KB) return { value: Math.round(n / KB), decimals: 0, unit: "KB" };
  return { value: n, decimals: 0, unit: n === 1 ? "byte" : "bytes" };
}

function formatDateRange(firstAt: number, lastAt: number): string {
  const first = new Date(firstAt);
  const last = new Date(lastAt);
  const opts: Intl.DateTimeFormatOptions =
    first.getFullYear() === last.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  const a = first.toLocaleDateString(undefined, opts);
  const b = last.toLocaleDateString(undefined, opts);
  return a === b ? `All on ${a}` : `${a} — ${b}`;
}

function FinaleShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 11.5V2.5M9 2.5l-3 3M9 2.5l3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 9v5.5a1 1 0 001 1h9a1 1 0 001-1V9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
