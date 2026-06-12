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
    text: "Remember all the colors of your travel.",
  },
];

const HOLD_MS = 3200; // how long each frame stays before transitioning

export function Intro({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  // Skipping in a browser tab first shows a one-beat explainer: photos live
  // in storage the browser is allowed to clear, and installing is what makes
  // them durable. The user can still continue in the browser with one tap.
  const [skipOpen, setSkipOpen] = useState(false);
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

  const onSkip = () => {
    haptic("tap");
    // Installed app already has durable storage — nothing to warn about.
    if (install.isStandalone) {
      dismiss();
      return;
    }
    setSkipOpen(true);
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
        onClick={onSkip}
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

      {/* Skip explainer — the one thing worth saying before someone leaves:
          in a browser tab the photos sit in storage the browser may clear.
          Tapping the scrim returns to the intro; "Continue in browser"
          proceeds with the skip. Colors are pinned to light values like the
          rest of the intro's white page. */}
      <AnimatePresence>
        {skipOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            onClick={() => setSkipOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Before you skip"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0, 0, 0, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 28,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ type: "spring", stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 330,
                background: "#ffffff",
                color: "#1c1c1e",
                borderRadius: 24,
                padding: "24px 22px 18px",
                textAlign: "center",
                boxShadow: "0 24px 70px rgba(0,0,0,0.3)",
              }}
            >
              <h2
                style={{
                  margin: "0 0 8px",
                  fontSize: 21,
                  fontWeight: 700,
                  letterSpacing: -0.3,
                }}
              >
                One thing before you go
              </h2>
              <p
                style={{
                  margin: "0 0 18px",
                  fontSize: 14.5,
                  lineHeight: 1.45,
                  color: "rgba(60, 60, 67, 0.78)",
                }}
              >
                Your photos stay on this device only. In a browser tab, the
                browser is allowed to delete them to free up space —
                installing the app keeps them safe.
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                {install.needsManualInstructions ? (
                  <p
                    style={{
                      margin: "0 0 2px",
                      padding: "12px 14px",
                      borderRadius: 14,
                      background: "rgba(116, 116, 128, 0.08)",
                      fontSize: 13.5,
                      lineHeight: 1.4,
                      fontWeight: 500,
                      color: "#1c1c1e",
                    }}
                  >
                    Tap <ShareGlyph /> below, then choose
                    {" "}
                    <strong>Add to Home Screen</strong>.
                  </p>
                ) : (
                  <RainbowInstallButton
                    onClick={handleInstall}
                    label={installLabel}
                  />
                )}
                <button
                  onClick={dismiss}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    borderRadius: 14,
                    background: "rgba(116, 116, 128, 0.08)",
                    color: "rgba(60, 60, 67, 0.7)",
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  Continue in browser
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Inline iOS share glyph (square with up arrow), sized to flow with text. */
function ShareGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 18 18"
      fill="none"
      aria-label="the share button"
      style={{ display: "inline", verticalAlign: "-2px" }}
    >
      <path
        d="M9 11.5V2.5M9 2.5l-3 3M9 2.5l3 3"
        stroke="#007aff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 9v5.5a1 1 0 001 1h9a1 1 0 001-1V9"
        stroke="#007aff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
        // `text-wrap: balance` distributes inline content evenly across
        // all lines — practically that means the last line never ends
        // up with a single orphaned word, which the storybook captions
        // were occasionally producing (e.g. "yellow!" or "discovered."
        // alone). `pretty` would also work but balance is more widely
        // supported and produces a nicer rag on a 2-3 line caption.
        textWrap: "balance",
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
      <RainbowBlob className="rb-blob-a" color="rgba(255, 20, 140, 1)" />
      <RainbowBlob className="rb-blob-b" color="rgba(255, 220, 0, 1)" />
      <RainbowBlob className="rb-blob-c" color="rgba(0, 255, 200, 1)" />
      <RainbowBlob className="rb-blob-d" color="rgba(80, 70, 255, 1)" />
      <RainbowBlob className="rb-blob-e" color="rgba(220, 40, 255, 1)" />

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
  // Five intentionally incommensurate durations — see index.css.
  const durations: Record<string, string> = {
    "rb-blob-a": "12.4s",
    "rb-blob-b": "16.6s",
    "rb-blob-c": "19s",
    "rb-blob-d": "14.8s",
    "rb-blob-e": "23.6s",
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
        // Tighter radial (transparent at 38%) so each blob reads as a
        // distinct neon splotch instead of a wide haze. Heavy
        // saturate(1.6) pushes the already-bright source colours into
        // proper neon territory.
        background: `radial-gradient(circle, ${color} 0%, transparent 38%)`,
        filter: "blur(22px) saturate(1.6)",
        // Plain normal blend at 0.82 opacity — the top blob dominates
        // wherever it sits, so its neon colour shows through cleanly
        // rather than averaging with siblings into a muddy wash. Where
        // a blob's radial edge fades out, the next blob below shows
        // through, so the full surface stays multicoloured.
        mixBlendMode: "normal",
        opacity: 0.82,
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
