import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { COLORS, SLOTS_PER_BOARD } from "../colors";
import { haptic } from "../lib/haptics";
import { cleanBoardName, useBoards } from "../state/boards";
import { filledCountForBoardId, useStore } from "../state/store";
import { Sheet } from "./Sheet";
import { useToast } from "./Toast";

/**
 * Board manager — the FAB on the home grid plus the bottom sheet it opens.
 *
 * The sheet lists every board (each one a full nine-color hunt with its own
 * photos), lets you hop between them, and creates new ones with a custom
 * name. Switching never moves or removes anything: each board's layout
 * lives under its own storage keys and the photos all stay on the device.
 */

const SHEET_CLOSE_MS = 240;

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
      aria-label="Your boards — switch boards or start a new one"
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
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { boards, activeBoardId, createBoard, switchBoard } = useBoards();
  const store = useStore();
  const toast = useToast();
  const [draftName, setDraftName] = useState("");
  const totalSlots = COLORS.length * SLOTS_PER_BOARD;

  // Photo counts per board: the active board from the live store, the rest
  // peeked read-only from their storage keys whenever the sheet opens.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (!open) return m;
    for (const b of boards) {
      m.set(
        b.id,
        b.id === activeBoardId
          ? store.totalFilled
          : filledCountForBoardId(b.id),
      );
    }
    return m;
  }, [open, boards, activeBoardId, store.totalFilled]);

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

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 18px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            Your boards
          </h2>
          <button
            onClick={onClose}
            style={{ fontSize: 17, fontWeight: 600, color: "var(--accent)" }}
          >
            Done
          </button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {boards.map((b) => {
            const active = b.id === activeBoardId;
            const filled = counts.get(b.id) ?? 0;
            return (
              <button
                key={b.id}
                onClick={() => choose(b.id, b.name)}
                aria-pressed={active}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 14px",
                  borderRadius: 14,
                  textAlign: "left",
                  background: active
                    ? "var(--fill-quaternary)"
                    : "transparent",
                  border: `1.5px solid ${
                    active ? "var(--accent)" : "var(--separator)"
                  }`,
                }}
              >
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
                    {filled} of {totalSlots} photos
                  </div>
                </div>
                {active && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--accent)",
                      flexShrink: 0,
                    }}
                  >
                    Current
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* New board: name it, get a fresh nine-color hunt. */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
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
              padding: "12px 14px",
              borderRadius: 12,
              border: "1.5px solid var(--separator)",
              background: "var(--bg)",
              color: "var(--label)",
              fontSize: 16,
            }}
          />
          <button
            onClick={create}
            disabled={!canCreate}
            style={{
              padding: "0 18px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              background: canCreate ? "var(--accent)" : "var(--fill-quaternary)",
              color: canCreate ? "#fff" : "var(--label-tertiary)",
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            Create
          </button>
        </div>

        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            color: "var(--label-secondary)",
            margin: "12px 2px 0",
          }}
        >
          Every board is its own nine-color hunt. Photos stay on this device,
          and switching boards never removes anything.
        </p>
      </div>
    </Sheet>
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
