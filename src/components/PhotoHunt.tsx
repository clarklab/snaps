import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { haptic } from "../lib/haptics";

/**
 * The "ask permission" helper card for shooting photos of people while out
 * on the color hunt. A full-screen card explains, in big friendly type,
 * that we're collecting color photos and politely asks whether we may take
 * a picture. The hunt is set in Croatia, so the default message is in
 * Croatian.
 *
 * Croatia draws visitors (and has communities) from all over, so the card
 * carries a row of language chips — German, Dutch, Italian and the other
 * languages most commonly heard there — letting you flip the message to
 * whatever the person in front of you reads most easily.
 *
 * Opened from Settings; the home-grid FAB it used to hang off now belongs
 * to the board manager (see Boards.tsx).
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

export function PhotoHuntCard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const closeCard = () => {
    haptic("tap");
    onClose();
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="photo-hunt-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            onClick={closeCard}
            // Keep pointer gestures on the card: when embedded inside a
            // bottom sheet, a stray swipe must not reach the sheet's
            // drag-to-dismiss handler underneath.
            onPointerDownCapture={(e) => e.stopPropagation()}
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
