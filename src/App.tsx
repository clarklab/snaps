import { AnimatePresence, LayoutGroup } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { colorById } from "./colors";
import { BoardsFab, BoardsSheet } from "./components/Boards";
import { ColorBoard } from "./components/ColorBoard";
import { ColorDetail } from "./components/ColorDetail";
import { Intro, INTRO_SEEN_KEY, introWasSeen } from "./components/Intro";
import { OverallProgress } from "./components/OverallProgress";
import { SampleCard } from "./components/SampleCard";
import { ShareIntake } from "./components/ShareIntake";
import { Settings } from "./components/Settings";
import { useToast } from "./components/Toast";
import { useNetworkStatus } from "./lib/useNetworkStatus";
import type { SwUpdateDetail } from "./lib/registerSW";
import { safeGet, safeSet } from "./lib/safeStorage";
import { detectStandalone } from "./lib/useInstallPrompt";
import { clearShareFlag, takeSharedImages } from "./lib/shareTarget";
import { startTransition } from "./lib/viewTransitions";
import { useBoards } from "./state/boards";
import { TOUR_SEEN_KEY, useDemo } from "./state/demo";
import { useStore } from "./state/store";

export default function App() {
  const [userSelectedId, setSelectedId] = useState<string | null>(null);
  const [userSettingsOpen, setSettingsOpen] = useState(false);
  // The board manager sheet, opened from the home-grid FAB.
  const [boardsOpen, setBoardsOpen] = useState(false);
  // Intro state is initialized synchronously from localStorage so there's
  // no flicker on first paint: returning users render the home grid
  // immediately, first-time users render the intro immediately.
  //
  // Running standalone means the user has already added Snaps to their home
  // screen — the intro's whole job is to pitch that install, so once it's
  // done there's nothing left to show. We skip it outright (not just on the
  // launch where they installed): on iOS the installed PWA gets its own
  // localStorage separate from Safari, so introWasSeen() reads false on
  // first standalone launch and the intro would otherwise reappear forever.
  const [introOpen, setIntroOpen] = useState(
    () => !introWasSeen() && !detectStandalone(),
  );
  // Bumped each time the user replays the intro; keyed onto the Intro
  // component to force a fresh mount so the frame counter starts back at 0
  // rather than wherever the previous mount left it.
  const [introRunId, setIntroRunId] = useState(0);
  const [tourSeen, setTourSeen] = useState(() => safeGet(TOUR_SEEN_KEY) === "1");
  // Images handed to Snaps via the OS share sheet (Web Share Target). When
  // non-empty, the ShareIntake flow takes over to place + crop them.
  const [sharedFiles, setSharedFiles] = useState<File[]>([]);
  const online = useNetworkStatus();
  const toast = useToast();
  const store = useStore();
  const { activeBoard } = useBoards();
  const demo = useDemo();
  const firstNetworkTick = useRef(true);
  const supportsVT = typeof document !== "undefined" && "startViewTransition" in document;

  // While the guided tour plays it drives the view; otherwise the user's own
  // navigation is in charge.
  const selectedId = demo.running ? demo.selectedId : userSelectedId;
  const settingsOpen = demo.running ? demo.settingsOpen : userSettingsOpen;
  const selected = selectedId ? colorById(selectedId) : undefined;

  // First-run nudge: offer the tour on a clean board, once.
  const showSampleCard =
    !introOpen &&
    !tourSeen &&
    !demo.running &&
    demo.available &&
    store.totalFilled === 0;

  const markTourSeen = () => {
    safeSet(TOUR_SEEN_KEY, "1");
    setTourSeen(true);
  };
  const startTour = () => {
    markTourSeen();
    demo.start();
  };

  // Web Share Target intake. The service worker stashes shared images and
  // redirects here; we pull them out of the holding cache and hand them to
  // the intake flow. Run on mount and whenever the app regains focus — the
  // latter covers `launch_handler: focus-existing`, where the OS focuses an
  // already-open Snaps instead of loading a fresh one. takeSharedImages()
  // clears the cache as it reads, so repeat calls are harmless no-ops.
  useEffect(() => {
    let cancelled = false;
    const ingest = async () => {
      const files = await takeSharedImages();
      if (cancelled) return;
      clearShareFlag();
      if (files.length > 0) setSharedFiles((prev) => (prev.length ? prev : files));
    };
    void ingest();
    const onFocus = () => void ingest();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

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
        detail: "Snaps is fully cached on this device.",
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

  // Photo storage wedged behind another window's database lock (lib/db.ts
  // dispatches this after it has already asked the service worker to reload
  // stale windows). Photos are safe on the device; reads will complete the
  // moment the lock clears, so guide the user in case the automatic nudge
  // isn't enough.
  useEffect(() => {
    const onWedged = () => {
      toast.push({
        title: "Waiting for your photos",
        detail:
          "Another open Snaps window is holding the photo storage. Close other Snaps tabs or windows and your photos will appear — nothing is lost.",
        tone: "warn",
        timeout: 8000,
      });
    };
    window.addEventListener("snaps:db-wedged", onWedged);
    return () => window.removeEventListener("snaps:db-wedged", onWedged);
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
          padding: "calc(var(--safe-top) + 16px) 16px 14px",
        }}
      >
        {/* The active board's name is the page title — "My Snaps" for the
            board everyone starts with, the custom name for the rest. */}
        <h1
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: -0.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "42vw",
            flexShrink: 0,
          }}
        >
          {activeBoard.name}
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

      <ColorBoard
        onSelect={openColor}
        supportsVT={supportsVT}
        activeId={selectedId}
      />

      {/* Board manager FAB. Only on the home grid — hidden whenever a
          color detail, settings, the intro, or the tour owns the screen. */}
      <BoardsFab
        visible={
          !selected &&
          !settingsOpen &&
          !boardsOpen &&
          !introOpen &&
          !demo.running &&
          sharedFiles.length === 0
        }
        onOpen={() => setBoardsOpen(true)}
      />
      <BoardsSheet open={boardsOpen} onClose={() => setBoardsOpen(false)} />

      {/* Detail overlays the home and morphs from the tapped tile.
          Plain conditional (no AnimatePresence): each transition through
          startViewTransition() commits one selectedId at a time, and the
          morph is driven by the View Transitions API (or layoutId in the
          fallback). Wrapping in AnimatePresence here used to leave prior
          ColorDetail mounts orphaned in the DOM when the guided tour
          flipped boards back-to-back. */}
      {selected && (
        <ColorDetail
          key={selected.id}
          color={selected}
          supportsVT={supportsVT}
          onBack={closeColor}
          forceMosaic={demo.running ? demo.mosaic : undefined}
        />
      )}

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onReplayIntro={() => {
          // Forget that the intro was seen and pop it back open over the
          // grid. Closing Settings first so the intro isn't covered by the
          // settings sheet on the way back in. The bumped runId forces a
          // fresh mount so the frame counter restarts at the first slide.
          safeSet(INTRO_SEEN_KEY, "");
          setSettingsOpen(false);
          setIntroRunId((id) => id + 1);
          setIntroOpen(true);
        }}
      />

      {/* First-run nudge to play the guided tour, presented as a native
          bottom sheet. SampleCard wraps Sheet internally and stays
          mounted — visibility is driven by the `open` prop. */}
      <SampleCard
        open={showSampleCard}
        onStart={startTour}
        onDismiss={markTourSeen}
      />

      {/* While the tour plays, a transparent layer captures taps so the
          choreography isn't fought by stray touches; tapping it skips.
          Rendered as a plain conditional rather than via AnimatePresence:
          AnimatePresence was leaving the layer mounted at opacity 0 with
          pointerEvents: auto after the tour ended, silently swallowing
          taps on the home grid. */}
      {demo.running && <TourSkipLayer onSkip={demo.stop} />}

      {/* Intro overlay — covers everything on first launch. Plain conditional
          rendering instead of AnimatePresence: rapid open/close (Skip then
          Replay) was leaving the previous Intro mounted at low opacity over
          the new one. The Intro fades itself out internally on dismiss, so
          dropping the wrapper exit doesn't lose anything visible. */}
      {introOpen && (
        <Intro key={`intro-${introRunId}`} onDone={() => setIntroOpen(false)} />
      )}

      {/* Web Share Target intake — placing + cropping photos shared into
          Snaps from the OS gallery. Drives its own multi-photo queue. */}
      <AnimatePresence>
        {sharedFiles.length > 0 && (
          <ShareIntake
            files={sharedFiles}
            onDone={() => setSharedFiles([])}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}

/**
 * Full-screen transparent catcher shown during the guided tour. It sits
 * above every tour-driven surface so the user's taps don't interfere with
 * the choreography (no visible affordance — the tour is short enough to
 * just let it play through). Tapping it still skips, in case someone
 * really wants out.
 */
function TourSkipLayer({ onSkip }: { onSkip: () => void }) {
  return (
    <div
      onClick={onSkip}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "transparent",
      }}
    />
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
