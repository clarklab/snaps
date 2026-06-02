import { AnimatePresence, LayoutGroup } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { colorById } from "./colors";
import { ColorBoard } from "./components/ColorBoard";
import { ColorDetail } from "./components/ColorDetail";
import { Intro, introWasSeen } from "./components/Intro";
import { OverallProgress } from "./components/OverallProgress";
import { Settings } from "./components/Settings";
import { useToast } from "./components/Toast";
import { useNetworkStatus } from "./lib/useNetworkStatus";
import type { SwUpdateDetail } from "./lib/registerSW";
import { startTransition } from "./lib/viewTransitions";

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Intro state is initialized synchronously from localStorage so there's
  // no flicker on first paint: returning users render the home grid
  // immediately, first-time users render the intro immediately.
  const [introOpen, setIntroOpen] = useState(() => !introWasSeen());
  const online = useNetworkStatus();
  const toast = useToast();
  const firstNetworkTick = useRef(true);
  const supportsVT = typeof document !== "undefined" && "startViewTransition" in document;

  const selected = selectedId ? colorById(selectedId) : undefined;

  // Notify on going offline. Skip the very first effect tick so a user who
  // opens the app while offline doesn't get an immediate scolding toast.
  useEffect(() => {
    if (firstNetworkTick.current) {
      firstNetworkTick.current = false;
      return;
    }
    if (!online) {
      toast.push({
        title: "You're offline",
        detail: "Your photos are saved on this device and still work.",
        tone: "info",
      });
    }
  }, [online, toast]);

  // Service worker lifecycle → toast.
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<SwUpdateDetail>).detail;
      toast.push({
        title: "Update available",
        detail: "Reload to get the latest version.",
        action: {
          label: "Reload",
          onPress: () => {
            void detail.update();
          },
        },
        persist: true,
      });
    };
    const onReady = () => {
      toast.push({
        title: "Ready for offline",
        detail: "Snaps Quest is fully cached on this device.",
        tone: "info",
      });
    };
    window.addEventListener("snaps:sw-update", onUpdate as EventListener);
    window.addEventListener("snaps:sw-offline-ready", onReady);
    return () => {
      window.removeEventListener("snaps:sw-update", onUpdate as EventListener);
      window.removeEventListener("snaps:sw-offline-ready", onReady);
    };
  }, [toast]);

  const openColor = (id: string) =>
    startTransition(() => setSelectedId(id));
  const closeColor = () => startTransition(() => setSelectedId(null));

  return (
    <LayoutGroup>
      {/* Home — single top row: title · progress · settings */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "calc(var(--safe-top) + 12px) 16px 10px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: -0.2,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Snaps Quest
        </h1>
        <OverallProgress />
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label={online ? "Settings" : "Settings — offline"}
          style={{
            position: "relative",
            width: 36,
            height: 36,
            borderRadius: 999,
            flexShrink: 0,
            background: settingsOpen
              ? "var(--label)"
              : "var(--fill-quaternary)",
            color: settingsOpen ? "var(--bg)" : "var(--label)",
            display: "grid",
            placeItems: "center",
            transition: "background 0.2s ease, color 0.2s ease",
          }}
        >
          <GearIcon />
          {!online && <OfflineDot />}
        </button>
      </header>

      <ColorBoard onSelect={openColor} supportsVT={supportsVT} />

      {/* Detail overlays the home and morphs from the tapped tile */}
      <AnimatePresence>
        {selected && (
          <ColorDetail
            key={selected.id}
            color={selected}
            supportsVT={supportsVT}
            onBack={closeColor}
          />
        )}
      </AnimatePresence>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Intro overlay — covers everything on first launch. Once dismissed,
          the exit animation fades it away to reveal the home grid. */}
      <AnimatePresence>
        {introOpen && <Intro key="intro" onDone={() => setIntroOpen(false)} />}
      </AnimatePresence>
    </LayoutGroup>
  );
}

function OfflineDot() {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: 4,
        right: 4,
        width: 9,
        height: 9,
        borderRadius: 999,
        background: "#ff9f0a",
        boxShadow: "0 0 0 2px var(--bg)",
      }}
    />
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 13a3 3 0 100-6 3 3 0 000 6z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M16.5 10c0-.5-.05-.97-.14-1.43l1.4-1.1-1.5-2.6-1.67.67a6.5 6.5 0 00-2.47-1.43L11.8 2H8.2l-.32 1.7A6.5 6.5 0 005.4 5.14L3.74 4.47l-1.5 2.6 1.4 1.1a6.6 6.6 0 000 2.86l-1.4 1.1 1.5 2.6 1.67-.67a6.5 6.5 0 002.47 1.43L8.2 18h3.6l.32-1.7a6.5 6.5 0 002.47-1.43l1.67.67 1.5-2.6-1.4-1.1c.09-.46.14-.93.14-1.43z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
