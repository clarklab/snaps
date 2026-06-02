import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
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
    text: "We're going on a colorful snaps adventure!",
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

  // Refs into the live SVG filter so we can animate the ink-bleed per
  // transition without re-rendering React every frame.
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  const turbRef = useRef<SVGFETurbulenceElement>(null);

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

  // Ink bleed: on every frame change, ramp the SVG displacement up to a
  // peak at the midpoint of the crossfade, then settle back to a gentle
  // painterly warp. Paired with the blur/saturate bloom on the images, the
  // edges smear and re-form like wet pigment soaking into paper instead of
  // a flat dissolve. Driven imperatively (no React re-render per frame) and
  // skipped entirely under reduced-motion.
  useEffect(() => {
    if (reducedMotion) return;
    const disp = dispRef.current;
    const turb = turbRef.current;
    if (!disp || !turb) return;

    const PEAK = 34; // px of edge displacement at the height of the bleed
    const REST = 2; // gentle warp left behind so steady frames look painted
    let raf = 0;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TRANSITION_MS);
      // Smooth 0 → 1 → 0 bell so the smear blooms and recedes symmetrically.
      const bell = Math.sin(Math.PI * t);
      disp.setAttribute("scale", (REST + PEAK * bell).toFixed(2));
      // The noise grows finer at the peak so the bleed reads as many small
      // splotches spreading, then coarsens back as it settles.
      turb.setAttribute("baseFrequency", (0.012 + 0.022 * bell).toFixed(4));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        disp.setAttribute("scale", String(REST));
        turb.setAttribute("baseFrequency", "0.012");
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [idx, reducedMotion]);

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
      ? "Install Snaps"
      : install.needsManualInstructions
        ? "Add to Home Screen"
        : "Install Snaps";

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
        // White matches the watercolor paper of the spot art, so the
        // illustrations sit on the same surface as the rest of the page.
        background: "#ffffff",
        color: "#1c1c1e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "calc(var(--safe-top) + 24px)",
        paddingBottom: "calc(var(--safe-bottom) + 28px)",
      }}
    >
      <WatercolorFilter dispRef={dispRef} turbRef={turbRef} />

      {/* Image + caption are vertically centered together as one block in
          the space between Skip and the CTA so the caption sits close
          beneath the illustration (storybook spread, not split layout). */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // Tight gap so the caption reads as a line beneath the spot art
          // rather than a separate region.
          gap: 4,
          width: "100%",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "calc(100% - 48px)",
            maxWidth: 420,
            // 4:3 matches the source illustrations; using 1:1 letterboxed
            // them and left an awkward gap of white before the caption.
            aspectRatio: "4 / 3",
            maxHeight: "44vh",
          }}
        >
          {/* Default mode ("sync") so old + new crossfade in parallel.
              The motion.img is absolute-positioned, so both can occupy
              the same slot without disrupting layout. Total transition
              time = TRANSITION_MS, not 2× — keeps each frame readable. */}
          <AnimatePresence initial={false}>
            <motion.img
              key={idx}
              src={frame.src}
              alt=""
              draggable={false}
              // url(#wc-bleed) is held across all three states so framer-motion
              // only tweens the blur/saturate bloom while the filter's own
              // displacement (animated imperatively above) does the smearing.
              initial={
                reducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 1.06,
                      filter: "blur(16px) saturate(1.5) url(#wc-bleed)",
                    }
              }
              animate={
                reducedMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 1,
                      scale: 1,
                      filter: "blur(0px) saturate(1) url(#wc-bleed)",
                    }
              }
              exit={
                reducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 0.94,
                      filter: "blur(20px) saturate(0.8) url(#wc-bleed)",
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

        {/* Caption that crossfades with the frame.
            A FIXED height (tall enough for the longest two-line caption)
            reserves the caption's space so the spot art above never shifts
            as captions of different lengths swap in. mode="wait" runs
            exit→enter sequentially so two captions never stack. */}
        <div
          style={{
            height: 88,
            flexShrink: 0,
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
            // Fade in place — no vertical travel — so the text appears exactly
            // where it sits and never nudges the layout.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.36, ease: [0.4, 0, 0.2, 1] }}
            style={{
              margin: 0,
              // Averia Serif Libre italic — a soft, slightly-wobbly serif
              // that reads as hand-painted text on the watercolor paper.
              fontFamily:
                '"Averia Serif Libre", "Iowan Old Style", "Georgia", serif',
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: 26,
              lineHeight: 1.28,
              letterSpacing: 0,
              color: "#1c1c1e",
              maxWidth: 380,
            }}
          >
            {frame.text}
          </motion.p>
        </AnimatePresence>
        </div>
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
        {install.isStandalone ? (
          <motion.button
            disabled
            style={{
              width: "100%",
              padding: "15px 20px",
              borderRadius: 14,
              fontSize: 17,
              fontWeight: 700,
              color: "rgba(60, 60, 67, 0.3)",
              background: "rgba(116, 116, 128, 0.08)",
            }}
          >
            {installLabel}
          </motion.button>
        ) : (
          <RainbowInstallButton onClick={handleInstall} label={installLabel} />
        )}
        <button
          onClick={dismiss}
          style={{
            background: "transparent",
            color: "rgba(60, 60, 67, 0.6)",
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
 * "Install App" button with a slow, swirling rainbow background.
 *
 * Two independent layers handle the motion:
 *   - A full-spectrum conic-gradient that rotates once every 10 s. The
 *     wrapper is inset:-80% so the rotated square still covers the
 *     button without bare corners.
 *   - A radial swirl that drifts on its own 7 s loop and is `mix-blend`
 *     onto the conic layer, producing colourshifted hotspots that read
 *     as liquid swirls rather than a rotating disc.
 *
 * Both layers sit behind a `position: relative` text span that carries
 * a tiny drop-shadow so the label reads cleanly no matter which colour
 * is passing under it.
 */
function RainbowInstallButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      style={{
        position: "relative",
        width: "100%",
        padding: "15px 20px",
        borderRadius: 14,
        overflow: "hidden",
        isolation: "isolate", // contain mix-blend-mode to this button
        color: "#ffffff",
        background: "#1a1a1a", // fallback if gradients fail
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
        border: "none",
        cursor: "pointer",
      }}
    >
      {/* Rotating spectrum. inset:-80% so the rotated bounding box
          fully covers the visible button at any angle. */}
      <span
        aria-hidden
        className="rainbow-spin"
        style={{
          position: "absolute",
          inset: "-80%",
          background:
            "conic-gradient(from 0deg, #ff006e, #fb5607, #ffbe0b, #06ffa5, #3a86ff, #8338ec, #ff006e)",
          animation: "rainbow-spin 10s linear infinite",
          filter: "saturate(1.4) blur(14px)",
        }}
      />
      {/* Drifting swirl — two offset radial blobs overlay-blended onto
          the conic so the colour mix shifts unevenly. */}
      <span
        aria-hidden
        className="rainbow-swirl"
        style={{
          position: "absolute",
          inset: "-30%",
          background:
            "radial-gradient(circle at 30% 30%, rgba(255, 0, 255, 0.85) 0%, transparent 45%), radial-gradient(circle at 70% 70%, rgba(0, 220, 255, 0.85) 0%, transparent 45%)",
          mixBlendMode: "overlay",
          animation: "rainbow-swirl 7s ease-in-out infinite",
          filter: "blur(18px)",
        }}
      />
      {/* Subtle top sheen so the button reads as a domed surface
          rather than a flat hue. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.10) 100%)",
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: 0.1,
          textShadow: "0 1px 2px rgba(0, 0, 0, 0.28)",
        }}
      >
        {label}
      </span>
    </motion.button>
  );
}

/**
 * The SVG ink-bleed filter the frames pass through. `feTurbulence` feeds a
 * `feDisplacementMap` that warps the image edges; the `scale` (how far it
 * smears) and the turbulence frequency are animated imperatively during each
 * transition (see the rAF effect above) so frames bloom and re-form like wet
 * pigment rather than cross-dissolving. The filter is defined once and shared
 * by both the entering and leaving images so they smear together.
 */
function WatercolorFilter({
  dispRef,
  turbRef,
}: {
  dispRef: React.Ref<SVGFEDisplacementMapElement>;
  turbRef: React.Ref<SVGFETurbulenceElement>;
}) {
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
        {/* Generous region so a big mid-transition displacement doesn't clip. */}
        <filter
          id="wc-bleed"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            ref={turbRef}
            type="fractalNoise"
            baseFrequency="0.012"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            ref={dispRef}
            in="SourceGraphic"
            in2="noise"
            scale="2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
