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
  /** Caption text. Wrap a span in `**…**` to render those words bold. */
  text: string;
}

const FRAMES: Frame[] = [
  {
    src: "/intro/intro-1.webp",
    text: "There is color all around us, waiting to be discovered.",
  },
  {
    src: "/intro/intro-2.webp",
    text: "Boy howdy, check out this blue door!",
  },
  {
    src: "/intro/intro-3.webp",
    text: "Let's add it to my blue bucket.",
  },
  {
    src: "/intro/intro-4.webp",
    text: "Oh lucky fellow! The car and sky are yellow!",
  },
  {
    src: "/intro/intro-5.webp",
    text: "Remember all the colors of your travel with Snaps.",
  },
];

const HOLD_MS = 3200; // how long each frame stays before transitioning

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

  // Warm up the watercolor reveal mask once so the first slide's
  // animation isn't running against an in-flight image fetch.
  useEffect(() => {
    const img = new Image();
    img.src = "/intro/cloud-texture.png";
  }, []);

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
      <WatercolorFilter />

      {/* Skip in the corner — quiet, doesn't compete with the install CTA.
          Colors are pinned to light-theme values since the white bg
          stays white regardless of the device theme. */}
      <button
        onClick={dismiss}
        style={{
          position: "absolute",
          top: "calc(var(--safe-top) + 16px)",
          right: 18,
          color: "rgba(60, 60, 67, 0.6)",
          fontSize: 14,
          fontWeight: 500,
          padding: "6px 10px",
          borderRadius: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
        aria-label="Skip intro"
      >
        Skip
        <ExitToAppIcon />
      </button>

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
              the same slot without disrupting layout.

              Enter animation is now a watercolor mask reveal: the photo
              emerges from the center outward through a hand-painted
              cloud-shaped mask that scales up from ~8% to fully covering
              the image. Combined with the SVG `wc-edge` filter we already
              use for steady-state, the new frame literally paints itself
              onto the page. Exit stays as a soft blur fade so two frames
              never compete for attention. */}
          <AnimatePresence initial={false}>
            <motion.img
              key={idx}
              src={frame.src}
              alt=""
              draggable={false}
              initial={
                reducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 1,
                      maskSize: "8%",
                      WebkitMaskSize: "8%",
                      filter: "saturate(1.15)",
                    }
              }
              animate={
                reducedMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 1,
                      maskSize: "280%",
                      WebkitMaskSize: "280%",
                      filter: "saturate(1) url(#wc-edge)",
                    }
              }
              exit={
                reducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      filter: "blur(14px) saturate(0.9)",
                    }
              }
              transition={{
                duration: reducedMotion ? 0.3 : 2.1,
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
                // The reveal mask — a soft watercolor cloud that fades to
                // transparent at the edges. Default mask-size of `auto`
                // means the texture renders at its own pixel size; we
                // override via the animated maskSize above.
                maskImage: "url(/intro/cloud-texture.png)",
                WebkitMaskImage: "url(/intro/cloud-texture.png)",
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
                maskPosition: "center",
                WebkitMaskPosition: "center",
              }}
            />
          </AnimatePresence>
        </div>

        {/* Caption — fixed-height container precalculated for the longest
            three-line frame at 28px × 1.26 line-height. Locking the
            height here means the install CTA below never reflows when
            frames swap, so the layout is rock-steady throughout the
            loop. mode="wait" still runs exit→enter sequentially so two
            captions never stack while the image crossfade keeps the
            frame visually present during the brief gap. */}
        <div
          style={{
            height: 116,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 32px",
          }}
        >
        <AnimatePresence mode="wait" initial={false}>
          <AnimatedCaption
            key={idx}
            text={frame.text}
            reducedMotion={reducedMotion}
          />
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
      </div>
    </motion.div>
  );
}

/**
 * Captions animate in word-by-word — each word fades up into place with a
 * small stagger, so the line reads as if it's being written by hand onto
 * the page rather than appearing all at once. Words wrapped in `**…**` in
 * the source text are rendered bold; the asterisks are stripped.
 *
 * Exit is a single, quick fade so we don't hold the next frame waiting on a
 * per-word stagger when transitioning.
 */
function AnimatedCaption({
  text,
  reducedMotion,
}: {
  text: string;
  reducedMotion: boolean;
}) {
  const words = useMemo(() => parseBoldWords(text), [text]);

  return (
    <motion.p
      // The container handles only the exit fade — per-word enter delays
      // are explicit on each span below. (Tried staggerChildren on the
      // container and it would only start the first child, not subsequent
      // ones; explicit delays are dead simple and behave the same.)
      initial={false}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      style={{
        margin: 0,
        // Averia Serif Libre italic — a soft, slightly-wobbly serif that
        // reads as hand-painted text on the watercolor paper.
        fontFamily:
          '"Averia Serif Libre", "Iowan Old Style", "Georgia", serif',
        fontStyle: "italic",
        fontWeight: 400,
        fontSize: 28,
        lineHeight: 1.26,
        letterSpacing: 0,
        color: "#1c1c1e",
        maxWidth: 380,
      }}
    >
      {words.map((w, i) => (
        <motion.span
          key={i}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{
            duration: reducedMotion ? 0.2 : 0.42,
            delay: reducedMotion ? 0 : 0.06 + i * 0.055,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{
            display: "inline-block",
            // Words can't share a text node and still animate independently,
            // so spacing lives on the span itself rather than as whitespace.
            marginRight: "0.3em",
            fontWeight: w.bold ? 700 : 400,
            // The bold span tightens the visual rhythm of the line a touch
            // — without this it reads as a separate weight rather than a
            // wordmark inside the sentence.
            letterSpacing: w.bold ? -0.2 : 0,
          }}
        >
          {w.text}
        </motion.span>
      ))}
    </motion.p>
  );
}

interface CaptionWord {
  text: string;
  bold: boolean;
}

function parseBoldWords(text: string): CaptionWord[] {
  // The source uses Markdown-style `**bold**` markers. Splitting on `**`
  // yields alternating regular / bold segments; whitespace inside each
  // segment splits the words.
  const out: CaptionWord[] = [];
  const segments = text.split("**");
  for (let i = 0; i < segments.length; i++) {
    const bold = i % 2 === 1;
    const words = segments[i].split(/\s+/).filter(Boolean);
    for (const w of words) out.push({ text: w, bold });
  }
  return out;
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
        // A saturated multi-hue base sits under the drifting blobs. If a
        // pixel ever falls between blobs the user still sees colour, not
        // a dark sliver of fallback. The angle on the linear gradient
        // means every quadrant of the button has a different hue.
        // A darker saturated base — the additive blobs over the top stay
        // visible (additive over near-black = the blob's own colour).
        background:
          "linear-gradient(125deg, #2d0033 0%, #001a3a 50%, #2a0030 100%)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
        border: "none",
        cursor: "pointer",
      }}
    >
      {/* Five oversized colour blobs, each on its own incommensurate
          drift period (rb-drift-a … rb-drift-e). They overlap and
          screen-blend so the wash brightens where they collide, and the
          fact that none of the loops are in sync means the eye never
          finds a rotating arm or a repeating cycle — the surface is
          always alive but never on a metronome.

          Each blob is inset:-40% with a heavy blur, so its bounding box
          extends past the button in all directions and there's never a
          hard edge in the visible area. */}
      <RainbowBlob className="rb-blob-a" color="rgba(255, 0, 122, 1)" />
      <RainbowBlob className="rb-blob-b" color="rgba(255, 170, 0, 1)" />
      <RainbowBlob className="rb-blob-c" color="rgba(0, 220, 200, 1)" />
      <RainbowBlob className="rb-blob-d" color="rgba(50, 90, 255, 1)" />
      <RainbowBlob className="rb-blob-e" color="rgba(200, 50, 255, 1)" />

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
          textShadow: "0 1px 2px rgba(0, 0, 0, 0.32)",
        }}
      >
        {label}
      </span>
    </motion.button>
  );
}

/**
 * One drifting colour blob layer for the rainbow button. The class name
 * selects which keyframe (rb-drift-a … rb-drift-e) and the per-class
 * animation duration is defined inline below so we don't have to edit
 * index.css when tuning a single blob's tempo.
 */
function RainbowBlob({
  className,
  color,
}: {
  className: string;
  color: string;
}) {
  // Five intentionally incommensurate durations — see index.css. Doubled
  // from the previous pacing because the user read the faster cycle as
  // restless rather than alive.
  const durations: Record<string, string> = {
    "rb-blob-a": "17.4s",
    "rb-blob-b": "22.6s",
    "rb-blob-c": "27s",
    "rb-blob-d": "18.8s",
    "rb-blob-e": "31.6s",
  };
  const keyframes: Record<string, string> = {
    "rb-blob-a": "rb-drift-a",
    "rb-blob-b": "rb-drift-b",
    "rb-blob-c": "rb-drift-c",
    "rb-blob-d": "rb-drift-d",
    "rb-blob-e": "rb-drift-e",
  };
  return (
    <span
      aria-hidden
      className={`rb-blob ${className}`}
      style={{
        position: "absolute",
        inset: "-30%",
        background: `radial-gradient(circle, ${color} 0%, transparent 50%)`,
        filter: "blur(24px) saturate(1.25)",
        // Plain normal blend at moderate opacity: each blob paints over
        // what's beneath at ~60/40, so the visible colour is always a
        // weighted mix of the underlying hues — never additive into
        // white. The text in the centre stays readable regardless of
        // which blobs happen to converge there.
        mixBlendMode: "normal",
        opacity: 0.6,
        pointerEvents: "none",
        animation: `${keyframes[className]} ${durations[className]} ease-in-out infinite`,
      }}
    />
  );
}

/**
 * The SVG filter the frames use in steady state. `feTurbulence` plus a
 * small `feDisplacementMap` warps the edges a couple of pixels, which
 * combined with the bloom-in/wash-out blur transition reads as a
 * watercolor wash. The filter is defined once and reused.
 */
/**
 * Material Symbols "exit_to_app" — a tiny doorway with an arrow leaving it.
 * Pairs with the Skip text so the affordance reads as "leave this screen,
 * go to the app" rather than ambiguous "skip what?".
 */
function ExitToAppIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

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
