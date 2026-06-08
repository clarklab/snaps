import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { haptic } from "../lib/haptics";

/**
 * A floating "ask permission" helper for shooting photos of people while
 * out on the color hunt. The hunt is set in Croatia, so the FAB wears a
 * Croatian flag and the default message is in Croatian — tap it and a
 * full-screen card explains, in big friendly type, that we're collecting
 * color photos and politely asks whether we may take a picture.
 *
 * Croatia draws visitors (and has communities) from all over, so the card
 * carries a row of language chips — German, Dutch, Italian and the other
 * languages most commonly heard there — letting you flip the message to
 * whatever the person in front of you reads most easily.
 */

interface Lang {
  /** BCP-47-ish code, used as the React key and for `lang`/`dir` hints. */
  code: string;
  /** Endonym shown on the chip (the language's own name for itself). */
  name: string;
  /** Flag emoji for the chip. */
  flag: string;
  /** One brief line explaining the color photo hunt. */
  explain: string;
  /** The polite ask. */
  ask: string;
}

// Croatian first (it's the home language of the hunt), then the languages
// most commonly spoken by visitors to and communities in Croatia: German
// and Italian top the list, followed by Slovenian, Dutch, Czech, Polish,
// Hungarian, French, and English as the lingua franca.
const LANGS: Lang[] = [
  {
    code: "hr",
    name: "Hrvatski",
    flag: "🇭🇷",
    explain: "U lovu smo na fotografije u boji.",
    ask: "Smijemo li te slikati?",
  },
  {
    code: "de",
    name: "Deutsch",
    flag: "🇩🇪",
    explain: "Wir sind auf der Jagd nach Farbfotos.",
    ask: "Dürfen wir ein Foto machen?",
  },
  {
    code: "it",
    name: "Italiano",
    flag: "🇮🇹",
    explain: "Siamo a caccia di foto a colori.",
    ask: "Possiamo farti una foto?",
  },
  {
    code: "sl",
    name: "Slovenščina",
    flag: "🇸🇮",
    explain: "Lovimo barvite fotografije.",
    ask: "Ali te smemo fotografirati?",
  },
  {
    code: "nl",
    name: "Nederlands",
    flag: "🇳🇱",
    explain: "Wij zijn op kleurenjacht voor foto's.",
    ask: "Mogen wij een foto maken?",
  },
  {
    code: "cs",
    name: "Čeština",
    flag: "🇨🇿",
    explain: "Lovíme barevné fotografie.",
    ask: "Můžeme si tě vyfotit?",
  },
  {
    code: "pl",
    name: "Polski",
    flag: "🇵🇱",
    explain: "Polujemy na kolorowe zdjęcia.",
    ask: "Czy możemy zrobić zdjęcie?",
  },
  {
    code: "hu",
    name: "Magyar",
    flag: "🇭🇺",
    explain: "Színes fotókra vadászunk.",
    ask: "Készíthetünk egy fényképet?",
  },
  {
    code: "fr",
    name: "Français",
    flag: "🇫🇷",
    explain: "Nous chassons les photos en couleur.",
    ask: "Pouvons-nous prendre une photo ?",
  },
  {
    code: "en",
    name: "English",
    flag: "🇬🇧",
    explain: "We're on a color photo hunt.",
    ask: "May we take a picture?",
  },
];

export function PhotoHunt({ visible }: { visible: boolean }) {
  const [open, setOpen] = useState(false);
  // Default to Croatian — that's the language of the place we're hunting in.
  const [langCode, setLangCode] = useState("hr");
  const lang = LANGS.find((l) => l.code === langCode) ?? LANGS[0];

  // Lock body scroll while the card is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc closes the card on desktop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openCard = () => {
    haptic("select");
    setOpen(true);
  };
  const closeCard = () => {
    haptic("tap");
    setOpen(false);
  };

  return (
    <>
      {/* FAB — sits in the bottom-right corner of the home grid. Hidden
          (and non-interactive) whenever another surface owns the screen so
          it never floats over the color detail, settings, or intro. */}
      <motion.button
        onClick={openCard}
        aria-label="Show the photo-hunt request to ask someone if we may take their picture"
        initial={false}
        animate={{
          opacity: visible ? 1 : 0,
          scale: visible ? 1 : 0.6,
        }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        whileTap={{ scale: 0.92 }}
        style={{
          position: "fixed",
          right: 20,
          bottom: "calc(var(--safe-bottom) + 20px)",
          width: 60,
          height: 60,
          borderRadius: 999,
          padding: 0,
          overflow: "hidden",
          border: "2px solid var(--bg-elevated)",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.22)",
          zIndex: 40,
          pointerEvents: visible ? "auto" : "none",
          display: "grid",
          placeItems: "center",
          background: "var(--bg-elevated)",
        }}
      >
        <CroatianFlag />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="photo-hunt-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            onClick={closeCard}
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              background: "var(--bg)",
              color: "var(--label)",
              display: "flex",
              flexDirection: "column",
              paddingTop: "calc(var(--safe-top) + 16px)",
              paddingBottom: "calc(var(--safe-bottom) + 20px)",
            }}
          >
            {/* Close button, top-right. */}
            <button
              onClick={closeCard}
              aria-label="Close"
              style={{
                position: "absolute",
                top: "calc(var(--safe-top) + 12px)",
                right: 14,
                width: 38,
                height: 38,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: "var(--fill-quaternary)",
                color: "var(--label)",
              }}
            >
              <CloseIcon />
            </button>

            {/* The message — big, friendly, centered. Tapping it shouldn't
                dismiss the card (only the backdrop / close button do), so
                we stop propagation on the content block. */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "0 28px",
                gap: 18,
              }}
            >
              <span style={{ fontSize: 56, lineHeight: 1 }} aria-hidden>
                📸🌈
              </span>
              <AnimatePresence mode="wait">
                <motion.div
                  key={lang.code}
                  lang={lang.code}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "clamp(26px, 7.5vw, 40px)",
                      fontWeight: 600,
                      lineHeight: 1.18,
                      letterSpacing: -0.4,
                      textWrap: "balance",
                    }}
                  >
                    {lang.explain}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "clamp(30px, 9vw, 48px)",
                      fontWeight: 800,
                      lineHeight: 1.12,
                      letterSpacing: -0.6,
                      textWrap: "balance",
                      color: "var(--accent)",
                    }}
                  >
                    {lang.ask}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Language chips. Croatian is the default; the rest cover the
                languages most commonly spoken by Croatia's visitors. */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 8,
                padding: "0 16px",
              }}
            >
              {LANGS.map((l) => {
                const active = l.code === lang.code;
                return (
                  <button
                    key={l.code}
                    onClick={() => {
                      haptic("tap");
                      setLangCode(l.code);
                    }}
                    aria-pressed={active}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "9px 14px",
                      borderRadius: 999,
                      fontSize: 15,
                      fontWeight: active ? 700 : 500,
                      background: active
                        ? "var(--label)"
                        : "var(--fill-quaternary)",
                      color: active ? "var(--bg)" : "var(--label)",
                      transition: "background 0.15s ease, color 0.15s ease",
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>
                      {l.flag}
                    </span>
                    {l.name}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * A stylized Croatian flag: three horizontal bands (red / white / blue)
 * with the šahovnica — the red-and-white checkerboard — at its heart. The
 * real coat of arms has a crowned shield of 13×13 squares; this draws a
 * clean 5×5 checker, which reads unmistakably as Croatian at FAB size
 * while staying crisp as an inline SVG (no emoji-font dependency).
 */
function CroatianFlag() {
  const RED = "#d81e05";
  const BLUE = "#171796";
  // 5×5 checkerboard, top-left square red, centered on the flag.
  const cells = [];
  const n = 5;
  const cell = 4; // px per square in the 60×40 viewBox
  const size = n * cell; // 20
  const x0 = 30 - size / 2; // 20
  const y0 = 20 - size / 2; // 10
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if ((r + c) % 2 === 0) {
        cells.push(
          <rect
            key={`${r}-${c}`}
            x={x0 + c * cell}
            y={y0 + r * cell}
            width={cell}
            height={cell}
            fill={RED}
          />,
        );
      }
    }
  }
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 60 40"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ display: "block", borderRadius: 8 }}
    >
      <rect x="0" y="0" width="60" height="13.34" fill={RED} />
      <rect x="0" y="13.34" width="60" height="13.33" fill="#ffffff" />
      <rect x="0" y="26.67" width="60" height="13.33" fill={BLUE} />
      {/* Shield: white field behind the checker, with a thin red frame. */}
      <rect
        x={x0 - 1}
        y={y0 - 1}
        width={size + 2}
        height={size + 2}
        fill="#ffffff"
        stroke={RED}
        strokeWidth="1"
      />
      {cells}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
