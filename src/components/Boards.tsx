import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS, SLOTS_PER_BOARD, swatch, wash } from "../colors";
import { estimateUsage, getPhoto } from "../lib/db";
import { haptic } from "../lib/haptics";
import { usePersistenceStatus } from "../lib/persistence";
import { safeSet } from "../lib/safeStorage";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import {
  cleanBoardName,
  DEFAULT_BOARD_ID,
  DEMO_BOARD_ID,
  useBoards,
} from "../state/boards";
import { TOUR_SEEN_KEY, useDemo } from "../state/demo";
import {
  clearDemoBoardData,
  peekBoardLayout,
  useStore,
} from "../state/store";
import { useSampleLoader } from "../state/useSampleLoader";
import { useTheme, type AppearanceMode } from "../state/theme";
import {
  Checkmark,
  Chevron,
  MenuFootnote,
  MenuGroup,
  MenuRow,
  SectionLabel,
} from "./MenuKit";
import { PhotoHuntCard } from "./PhotoHunt";
import { Sheet } from "./Sheet";
import { useToast } from "./Toast";

/**
 * The My Boards menu — the FAB on the home grid plus the bottom sheet it
 * opens. This is the app's main menu:
 *
 *   - every board (each one a full nine-color hunt) with a miniature of all
 *     81 slots, switchable in a tap, plus creating new ones;
 *   - the photo-hunt language helper;
 *   - the GLOBAL settings — appearance, the demo / sample actions, storage.
 *     These live here, not in the per-board gear sheet, so a board's
 *     settings stay about that board and a global toggle can never look
 *     board-scoped.
 *
 * Demos play on a dedicated, disposable demo board (never inside a user's
 * board): launching hops there, the tour hops back when it ends, and the
 * board itself disappears once it's empty.
 *
 * Visually everything is grouped into inset cards (see MenuKit) so the
 * sheet reads as a handful of labeled sections rather than a wall of
 * controls.
 */

type BoardLayout = Record<string, (string | null)[]>;

const SHEET_CLOSE_MS = 240;

const MODES: { id: AppearanceMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/**
 * Cross-remount handoff for demo launches. Switching to the demo board
 * remounts the whole board-scoped tree, so the "what to do once we get
 * there" note lives at module scope (it survives remounts; a full page
 * reload clears it, which is the right behavior for a stale request).
 * Consumed by the effects in App.tsx.
 */
export const demoHandoff: {
  pending: { kind: "tour" | "samples" } | null;
  /** Board to hop back to (and clean up after) when the tour ends. */
  returnAfterTour: string | null;
} = { pending: null, returnAfterTour: null };

/**
 * Launch a demo ("tour" or "samples") on the demo board. If we're already
 * on it, run directly; otherwise stash the request in the handoff and hop —
 * App.tsx picks it up after the remount.
 */
export function useDemoLaunch(): {
  available: boolean;
  launch: (kind: "tour" | "samples") => void;
} {
  const { activeBoardId, openDemoBoard } = useBoards();
  const demo = useDemo();
  const sampleLoader = useSampleLoader();

  const launch = useCallback(
    (kind: "tour" | "samples") => {
      if (kind === "tour") {
        // However the tour is reached, the first-run nudge is done nagging.
        safeSet(TOUR_SEEN_KEY, "1");
      }
      if (activeBoardId === DEMO_BOARD_ID) {
        if (kind === "tour") demo.start();
        else void sampleLoader.load();
        return;
      }
      demoHandoff.pending = { kind };
      demoHandoff.returnAfterTour =
        kind === "tour" ? activeBoardId : demoHandoff.returnAfterTour;
      openDemoBoard();
    },
    [activeBoardId, demo, sampleLoader, openDemoBoard],
  );

  return { available: demo.available, launch };
}

export function BoardsFab({
  visible,
  onOpen,
}: {
  visible: boolean;
  onOpen: () => void;
}) {
  return (
    <motion.button
      onClick={() => {
        haptic("select");
        onOpen();
      }}
      aria-label="My Boards — switch boards or start a new one"
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
        border: "2px solid var(--bg-elevated)",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.22)",
        zIndex: 40,
        pointerEvents: visible ? "auto" : "none",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-elevated)",
      }}
    >
      <BoardsIcon />
    </motion.button>
  );
}

export function BoardsSheet({
  open,
  onClose,
  onReplayIntro,
}: {
  open: boolean;
  onClose: () => void;
  /** Reopen the watercolor intro overlay; the App owns the visible state. */
  onReplayIntro: () => void;
}) {
  const {
    boards,
    activeBoardId,
    createBoard,
    switchBoard,
    removeDemoBoard,
  } = useBoards();
  const store = useStore();
  const toast = useToast();
  const { mode, setMode } = useTheme();
  const { available: demoAvailable, launch: launchDemo } = useDemoLaunch();
  const [draftName, setDraftName] = useState("");
  const [huntOpen, setHuntOpen] = useState(false);
  const totalSlots = COLORS.length * SLOTS_PER_BOARD;
  const demoBoardExists = boards.some((b) => b.id === DEMO_BOARD_ID);
  const { persisted, refresh: refreshPersisted } = usePersistenceStatus();
  const {
    canInstall,
    isStandalone,
    needsManualInstructions,
    install,
  } = useInstallPrompt();

  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    void estimateUsage().then((bytes) => {
      if (bytes == null) return setUsage(null);
      const mb = bytes / (1024 * 1024);
      setUsage(mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`);
    });
  }, [open]);

  // Thumbnails are only worth fetching once the sheet has actually been
  // opened — the sheet element itself is always mounted (it animates via
  // the `open` prop), and the app's launch shouldn't pay for preview reads.
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  // Slot layout per board: the active board live from the store, the rest
  // peeked read-only from their storage keys.
  const layouts = useMemo(() => {
    const m = new Map<string, BoardLayout>();
    for (const b of boards) {
      m.set(
        b.id,
        b.id === activeBoardId ? store.boards : peekBoardLayout(b.id),
      );
    }
    return m;
  }, [boards, activeBoardId, store.boards]);

  const filledCount = (layout: BoardLayout | undefined): number =>
    layout
      ? Object.values(layout).reduce(
          (n, slots) => n + slots.filter(Boolean).length,
          0,
        )
      : 0;

  const choose = (id: string, name: string) => {
    if (id === activeBoardId) {
      onClose();
      return;
    }
    haptic("select");
    onClose();
    // Let the sheet animate out before the keyed store remount swaps the
    // grid underneath it.
    window.setTimeout(() => {
      switchBoard(id);
      toast.push({
        title: `Now on “${name}”`,
        tone: "info",
        timeout: 2500,
      });
    }, SHEET_CLOSE_MS);
  };

  const create = () => {
    const name = cleanBoardName(draftName);
    if (!name) return;
    haptic("success");
    setDraftName("");
    onClose();
    window.setTimeout(() => {
      const id = createBoard(name);
      if (id) {
        toast.push({
          title: `“${name}” is ready`,
          detail: "A fresh board — your other photos are safe where they were.",
          tone: "info",
          timeout: 3500,
        });
      }
    }, SHEET_CLOSE_MS);
  };

  const canCreate = cleanBoardName(draftName).length > 0;

  const runDemo = (kind: "tour" | "samples") => {
    haptic("select");
    onClose();
    if (kind === "samples") {
      toast.push({
        title: "Loading sample photos…",
        detail: "They land on the demo board, not on your own boards.",
        tone: "info",
        timeout: 3000,
      });
    }
    window.setTimeout(() => launchDemo(kind), SHEET_CLOSE_MS);
  };

  // Wipe the demo board: its photos, keys and backup, then its registry
  // entry. If it's the live board, land on the first board before surgery
  // so the mounted store never has the rug pulled out from under it.
  const clearDemo = () => {
    haptic("tap");
    onClose();
    window.setTimeout(() => {
      const wasActive = activeBoardId === DEMO_BOARD_ID;
      if (wasActive) switchBoard(DEFAULT_BOARD_ID);
      window.setTimeout(
        () => {
          void clearDemoBoardData().then(() => {
            removeDemoBoard();
            toast.push({
              title: "Demo board cleared",
              detail: "All demo photos were removed. Your boards are untouched.",
              tone: "info",
              timeout: 3000,
            });
          });
        },
        wasActive ? 150 : 0,
      );
    }, SHEET_CLOSE_MS);
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div
        style={{
          padding: "8px 18px 16px",
          // The menu can outgrow small screens (boards + settings); scroll
          // inside the sheet. pan-y keeps native touch scrolling working
          // under the sheet's drag-to-dismiss.
          maxHeight: "calc(100dvh - var(--safe-top) - 72px)",
          overflowY: "auto",
          touchAction: "pan-y",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            My Boards
          </h2>
          <button
            onClick={onClose}
            style={{ fontSize: 17, fontWeight: 600, color: "var(--accent)" }}
          >
            Done
          </button>
        </div>

        {/* Boards: one card, one row per board, checkmark on the current
            one. The divider starts where the text starts (after the mini)
            so the minis read as one calm column. */}
        <MenuGroup dividerInset={87}>
          {boards.map((b) => {
            const active = b.id === activeBoardId;
            const layout = layouts.get(b.id);
            return (
              <button
                key={b.id}
                onClick={() => choose(b.id, b.name)}
                aria-pressed={active}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 14px 10px 12px",
                  textAlign: "left",
                  background: "transparent",
                }}
              >
                {layout && <BoardMini layout={layout} load={hasOpened} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 650,
                      color: "var(--label)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {b.name}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      marginTop: 2,
                      color: "var(--label-secondary)",
                    }}
                  >
                    {filledCount(layout)} of {totalSlots} photos
                  </div>
                </div>
                {active && <Checkmark />}
              </button>
            );
          })}
        </MenuGroup>

        {/* New board: its own slim card right under the list. */}
        <div style={{ marginTop: 8 }}>
          <MenuGroup>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 6px 3px 14px",
              }}
            >
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
                placeholder="Name a new board…"
                maxLength={40}
                enterKeyHint="done"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "10px 0",
                  border: "none",
                  background: "transparent",
                  color: "var(--label)",
                  fontSize: 16,
                  outline: "none",
                }}
              />
              <button
                onClick={create}
                disabled={!canCreate}
                style={{
                  padding: "10px 10px",
                  fontSize: 15.5,
                  fontWeight: 650,
                  background: "transparent",
                  color: canCreate ? "var(--accent)" : "var(--label-tertiary)",
                  transition: "color 0.15s ease",
                  flexShrink: 0,
                }}
              >
                Create
              </button>
            </div>
          </MenuGroup>
        </div>
        <MenuFootnote>
          Every board is its own nine-color hunt. Photos stay on this device,
          and switching boards never removes anything.
        </MenuFootnote>

        <SectionLabel>Photo Hunt</SectionLabel>
        <MenuGroup>
          <MenuRow
            leading={<span style={{ fontSize: 17 }}>🇭🇷</span>}
            label="Ask to take someone's picture"
            onClick={() => {
              haptic("select");
              setHuntOpen(true);
            }}
            trailing={<Chevron />}
          />
        </MenuGroup>

        <SectionLabel>Photo Safety</SectionLabel>
        <MenuGroup>
          <MenuRow
            label="Storage protection"
            detail={
              persisted === true
                ? "On"
                : persisted === false
                  ? "Off"
                  : "Unknown"
            }
          />
          {persisted === false && !isStandalone && canInstall && (
            <MenuRow
              label="Install Snaps to protect photos"
              onClick={() => {
                haptic("select");
                void install().then((accepted) => {
                  if (accepted) {
                    window.setTimeout(
                      () => void refreshPersisted({ force: true }),
                      2500,
                    );
                  }
                });
              }}
            />
          )}
        </MenuGroup>
        <MenuFootnote>
          {persisted === true
            ? "Your browser treats Snaps photos as protected and won't delete them to free up space. A board backup (in Board Settings) is still the safest copy."
            : `Without protection, the browser may quietly delete photos when the device runs low on space.${
                needsManualInstructions
                  ? " Add Snaps to your Home Screen (Share menu → “Add to Home Screen”) to protect them,"
                  : " Install Snaps to your home screen to protect them,"
              } and use “Back up this board” in Board Settings for a copy the browser can never touch.`}
        </MenuFootnote>

        <SectionLabel>Appearance</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 2,
            padding: 2,
            background: "var(--fill-quaternary)",
            borderRadius: 12,
          }}
        >
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  padding: "9px 0",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: active ? 600 : 500,
                  background: active ? "var(--bg-elevated)" : "transparent",
                  color: active ? "var(--label)" : "var(--label-secondary)",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <SectionLabel>Demo</SectionLabel>
        <MenuGroup>
          {demoAvailable && (
            <MenuRow label="Watch the tour" onClick={() => runDemo("tour")} />
          )}
          {demoAvailable && (
            <MenuRow
              label="Load sample photos"
              onClick={() => runDemo("samples")}
            />
          )}
          <MenuRow
            label="Replay intro"
            onClick={() => {
              haptic("select");
              onReplayIntro();
            }}
          />
          {demoBoardExists && (
            <MenuRow label="Clear demo board" destructive onClick={clearDemo} />
          )}
        </MenuGroup>
        <MenuFootnote>
          The tour and sample photos play on their own demo board — your
          boards are never touched, and the demo board disappears once it's
          cleared.
        </MenuFootnote>

        <p
          style={{
            textAlign: "center",
            fontSize: 12.5,
            color: "var(--label-tertiary)",
            marginTop: 24,
            marginBottom: 0,
            lineHeight: 1.5,
          }}
        >
          Photos stay on this device — nothing is uploaded.
          {usage ? ` Space used: ${usage}.` : ""}
          <br />
          snaps.quest · v1.0
        </p>
      </div>

      {/* Full-screen, above the sheet (its z-index outranks the scrim, and
          the card swallows pointer events so the sheet's drag-to-dismiss
          never grabs gestures made on it). */}
      <PhotoHuntCard open={huntOpen} onClose={() => setHuntOpen(false)} />
    </Sheet>
  );
}

/**
 * A miniature of one board: all 81 slots as a 9×9 grid — the nine color
 * blocks in their home-grid arrangement, each holding its nine slots.
 * Filled slots show the photo's thumbnail; empty slots show the color's
 * wash, so even an empty board reads as a tiny rainbow.
 */
function BoardMini({ layout, load }: { layout: BoardLayout; load: boolean }) {
  const { scheme } = useTheme();

  // The photo ids this mini needs, in a stable key so a re-peeked (but
  // unchanged) layout object doesn't churn object URLs.
  const ids = useMemo(
    () =>
      COLORS.flatMap((c) => layout[c.id] ?? []).filter(
        (x): x is string => typeof x === "string",
      ),
    [layout],
  );
  const idsKey = ids.join(",");

  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    if (!load || ids.length === 0) {
      setUrls(new Map());
      return;
    }
    let alive = true;
    const created: string[] = [];
    void (async () => {
      const next = new Map<string, string>();
      await Promise.all(
        ids.map(async (id) => {
          const rec = await getPhoto(id).catch(() => undefined);
          if (!rec) return;
          const url = URL.createObjectURL(rec.thumb);
          created.push(url);
          next.set(id, url);
        }),
      );
      if (alive) setUrls(next);
    })();
    return () => {
      alive = false;
      for (const url of created) URL.revokeObjectURL(url);
    };
    // idsKey is the stable identity of `ids`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, idsKey]);

  // 9×9 cells: color block (3×3 of blocks) × slot within block (3×3).
  const cells: { key: string; url?: string; tint: string }[] = [];
  COLORS.forEach((color) => {
    const slots = layout[color.id] ?? [];
    const tint = wash(swatch(color, scheme), scheme);
    for (let si = 0; si < SLOTS_PER_BOARD; si++) {
      const id = slots[si];
      cells.push({
        key: `${color.id}-${si}`,
        url: id ? urls.get(id) : undefined,
        tint,
      });
    }
  });

  return (
    <div
      aria-hidden
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(9, 7px)",
        gridTemplateRows: "repeat(9, 7px)",
        borderRadius: 8,
        overflow: "hidden",
        flexShrink: 0,
        background: "var(--fill-quaternary)",
      }}
    >
      {cells.map((cell, i) => {
        // Index within the color block and which block it belongs to.
        const ci = Math.floor(i / SLOTS_PER_BOARD);
        const si = i % SLOTS_PER_BOARD;
        const row = Math.floor(ci / 3) * 3 + Math.floor(si / 3) + 1;
        const col = (ci % 3) * 3 + (si % 3) + 1;
        return cell.url ? (
          <img
            key={cell.key}
            src={cell.url}
            alt=""
            draggable={false}
            style={{
              gridRow: row,
              gridColumn: col,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            key={cell.key}
            style={{
              gridRow: row,
              gridColumn: col,
              background: cell.tint,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * FAB icon: a 2×2 grid of rounded squares in the quest palette — a tiny
 * echo of the color boards themselves.
 */
function BoardsIcon() {
  const cells = [
    { x: 4, y: 4, fill: "#ff3b30" }, // red
    { x: 17, y: 4, fill: "#ffcc00" }, // yellow
    { x: 4, y: 17, fill: "#34c759" }, // green
    { x: 17, y: 17, fill: "#007aff" }, // blue
  ];
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x}
          y={c.y}
          width="9"
          height="9"
          rx="2.5"
          fill={c.fill}
        />
      ))}
    </svg>
  );
}
