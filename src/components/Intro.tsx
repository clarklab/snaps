import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { haptic } from "../lib/haptics";
import { safeGet, safeSet } from "../lib/safeStorage";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import { useToast } from "./Toast";

/**
 * First-run intro overlay. Three illustrated frames cycle in a smooth
 * loop with a watercolor-bleed transition between them. A persistent
 * "Install App" button triggers the native add-to-home-screen flow when
 * the browser supports it; a small Skip link dismisses the overlay.
 *
 * The "watercolor" effect is achieved by:
 *   1. A persistent SVG filter (turbulence + small displacement) that
 *      gives each frame a subtle painted edge in steady state.
 *   2. Strong blur + saturate during enter/exit transitions, so frames
 *      bloom in and wash out like watercolor on wet paper.
 *
 * The intro is shown only once per device (persisted via localStorage),
 * unless the user explicitly resets it from Settings (future hook).
 *
 * No-flicker design: rendered at the very top of `App.tsx`'s tree, with
 * `position: fixed; inset: 0; background: var(--bg)` so it covers the
 * grid the instant React mounts — same bg as the body, no white flash.
 */

export const INTRO_SEEN_KEY = "snaps.introSeen.v1";

export function introWasSeen(): boolean {
  return safeGet(INTRO_SEEN_KEY) === "1";
}

interface Frame {
  src: string;
  text: string;
}

const FRAMES: Frame[] = [
  {
    src: "/intro/intro-1.webp",
    text: "We're going on a colorful snaps quest!",
  },
  {
    src: "/intro/intro-2.webp",
    text: "Wow, check out this blue door!",
  },
  {
    src: "/intro/intro-3.webp",
    text: "I'll add it to my blue bucket.",
  },
];

const HOLD_MS = 3000; // how long each frame stays before transitioning
const TRANSITION_MS = 850; // crossfade duration; long enough to "bleed"

export function Intro({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const install = useInstallPrompt();
  const toast = useToast();
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Auto-advance the loop. A single setTimeout per frame is essentially
  // free; we don't bother pausing on visibilitychange because backgrounded
  // tabs already throttle JS timers heavily.
  useEffect(() => {
    const t = window.setTimeout(
      () => setIdx((i) => (i + 1) % FRAMES.length),
      HOLD_MS,
    );
    return () => clearTimeout(t);
  }, [idx]);

  // Preload upcoming images so the next crossfade doesn't pop.
  useEffect(() => {
    const next = FRAMES[(idx + 1) % FRAMES.length].src;
    const img = new Image();
    img.src = next;
  }, [idx]);

  const dismiss = () => {
    safeSet(INTRO_SEEN_KEY, "1");
    onDone();
  };

  const handleInstall = async () => {
    haptic("select");
    if (install.canInstall) {
      const accepted = await install.install();
      if (accepted) {
        haptic("success");
        dismiss();
      }
      return;
    }
    if (install.needsManualInstructions) {
      toast.push({
        title: "Add to Home Screen",
        detail: "Tap the share icon below, then choose Add to Home Screen.",
        tone: "info",
        timeout: 6000,
      });
      return;
    }
    toast.push({
      title: "Install not available yet",
      detail: "Try this from your phone's browser to install the app.",
      tone: "info",
    });
  };

  const installLabel = install.isStandalone
    ? "App installed"
    : install.canInstall
      ? "Install App"
      : install.needsManualInstructions
        ? "Add to Home Screen"
        : "Install App";

  const frame = FRAMES[idx];

  return (
    <motion.div
      // No initial animation — we want the intro to appear instantly to
      // cover the grid (no flicker). We do animate on exit when dismissed.
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "var(--bg)",
        color: "var(--label)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "calc(var(--safe-top) + 24px)",
        paddingBottom: "calc(var(--safe-bottom) + 28px)",
      }}
    >
      <WatercolorFilter />

      {/* Skip in the corner — quiet, doesn't compete with the install CTA. */}
      <button
        onClick={dismiss}
        style={{
          position: "absolute",
          top: "calc(var(--safe-top) + 16px)",
          right: 18,
          color: "var(--label-secondary)",
          fontSize: 14,
          fontWeight: 500,
          padding: "6px 10px",
          borderRadius: 8,
        }}
        aria-label="Skip intro"
      >
        Skip
      </button>

      {/* Image stage — fixed aspect frame so transitions don't shift layout. */}
      <div
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 420,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
            maxHeight: "60vh",
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={idx}
              src={frame.src}
              alt=""
              draggable={false}
              initial={
                reducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 1.06,
                      filter: "blur(14px) saturate(1.4)",
                    }
              }
              animate={
                reducedMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 1,
                      scale: 1,
                      filter: "blur(0px) saturate(1) url(#wc-edge)",
                    }
              }
              exit={
                reducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 0.94,
                      filter: "blur(18px) saturate(0.85)",
                    }
              }
              transition={{
                duration: TRANSITION_MS / 1000,
                ease: [0.32, 0.72, 0, 1],
              }}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            />
          </AnimatePresence>
        </div>
      </div>

      {/* Caption that crossfades with the frame.
          mode="wait" runs exit→enter sequentially so two captions never
          stack on top of each other; the image crossfade above keeps the
          frame visually present during that brief gap. */}
      <div
        style={{
          minHeight: 70,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 32px",
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.36, ease: [0.4, 0, 0.2, 1] }}
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 600,
              lineHeight: 1.35,
              color: "var(--label)",
              letterSpacing: -0.1,
              maxWidth: 360,
            }}
          >
            {frame.text}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Dot pager — small visual cue of the three-frame loop. */}
      <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 22 }}>
        {FRAMES.map((_, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background:
                i === idx ? "var(--label)" : "var(--label-tertiary)",
              transition: "background 0.35s ease",
            }}
          />
        ))}
      </div>

      {/* CTA */}
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: "0 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <motion.button
          onClick={handleInstall}
          disabled={install.isStandalone}
          whileTap={install.isStandalone ? undefined : { scale: 0.97 }}
          style={{
            width: "100%",
            padding: "15px 20px",
            borderRadius: 14,
            fontSize: 17,
            fontWeight: 700,
            color: install.isStandalone ? "var(--label-tertiary)" : "#ffffff",
            background: install.isStandalone
              ? "var(--fill-quaternary)"
              : "var(--accent)",
            boxShadow: install.isStandalone
              ? "none"
              : "0 6px 18px rgba(0,122,255,0.32)",
            transition: "background 0.2s ease",
          }}
        >
          {installLabel}
        </motion.button>
        <button
          onClick={dismiss}
          style={{
            background: "transparent",
            color: "var(--label-secondary)",
            fontSize: 14,
            fontWeight: 500,
            padding: "6px 10px",
            borderRadius: 8,
          }}
        >
          Maybe later
        </button>
      </div>
    </motion.div>
  );
}

/**
 * The SVG filter the frames use in steady state. `feTurbulence` plus a
 * small `feDisplacementMap` warps the edges a couple of pixels, which
 * combined with the bloom-in/wash-out blur transition reads as a
 * watercolor wash. The filter is defined once and reused.
 */
function WatercolorFilter() {
  return (
    <svg
      aria-hidden
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        pointerEvents: "none",
      }}
    >
      <defs>
        <filter
          id="wc-edge"
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018"
            numOctaves="2"
            seed="4"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="3.5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
