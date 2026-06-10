import { useEffect, useState } from "react";
import { COLORS } from "../colors";
import { haptic } from "../lib/haptics";
import { cleanBoardName, useBoards } from "../state/boards";
import { useStore } from "../state/store";
import { Sheet } from "./Sheet";

/**
 * Board settings — everything in here is about the board you're currently
 * on, and nothing else. Global concerns (appearance, demos, storage, the
 * language helper) live in the My Boards menu on the home-grid FAB, so a
 * change made here can never reach across boards and a global toggle can
 * never look like it "belongs" to one board.
 */
export function Settings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const store = useStore();
  const { activeBoard, renameBoard } = useBoards();

  // Local draft of the board name; saved on demand, re-synced whenever the
  // sheet opens (or the board itself changes underneath us).
  const [draft, setDraft] = useState(activeBoard.name);
  useEffect(() => {
    if (open) setDraft(activeBoard.name);
  }, [open, activeBoard.name]);

  const cleaned = cleanBoardName(draft);
  const dirty = cleaned.length > 0 && cleaned !== activeBoard.name;
  const saveName = () => {
    if (!dirty) return;
    haptic("select");
    renameBoard(activeBoard.id, cleaned);
  };

  const handleClearSamples = () => {
    haptic("tap");
    void store.clearSamples();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 18px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            Board Settings
          </h2>
          <button
            onClick={onClose}
            style={{ fontSize: 17, fontWeight: 600, color: "var(--accent)" }}
          >
            Done
          </button>
        </div>

        <SectionLabel>Name</SectionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
            }}
            maxLength={40}
            enterKeyHint="done"
            aria-label="Board name"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "11px 13px",
              borderRadius: 12,
              border: "1.5px solid var(--separator)",
              background: "var(--bg)",
              color: "var(--label)",
              fontSize: 16,
            }}
          />
          <button
            onClick={saveName}
            disabled={!dirty}
            style={{
              padding: "0 16px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              background: dirty ? "var(--accent)" : "var(--fill-quaternary)",
              color: dirty ? "#fff" : "var(--label-tertiary)",
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            Save
          </button>
        </div>

        <SectionLabel style={{ marginTop: 22 }}>Progress</SectionLabel>
        <Row
          label="Photos placed"
          value={`${store.totalFilled} of ${store.totalSlots}`}
        />
        <Row
          label="Colors complete"
          value={`${store.completedColors} of ${COLORS.length}`}
        />

        {/* Sample photos that were loaded onto THIS board (normally only the
            demo board ever has them). Removing them never touches the
            photos you added yourself. */}
        {store.hasSamples && (
          <>
            <SectionLabel style={{ marginTop: 22 }}>
              Sample Photos
            </SectionLabel>
            <SmallButton destructive onClick={handleClearSamples}>
              Remove {store.sampleCount} sample photo
              {store.sampleCount === 1 ? "" : "s"}
            </SmallButton>
            <p
              style={{
                fontSize: 12.5,
                lineHeight: 1.45,
                color: "var(--label-secondary)",
                margin: "10px 2px 0",
              }}
            >
              Only the loaded examples are removed — photos you added
              yourself stay put.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--label-secondary)",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        margin: "0 2px 8px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Compact full-width action button. */
function SmallButton({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "12px 12px",
        borderRadius: 12,
        background: "var(--fill-quaternary)",
        fontSize: 14.5,
        fontWeight: 600,
        color: destructive ? "#ff453a" : "var(--accent)",
        textAlign: "center",
      }}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "11px 2px",
        borderBottom: "1px solid var(--separator)",
        fontSize: 15,
      }}
    >
      <span>{label}</span>
      <span style={{ color: "var(--label-secondary)" }}>{value}</span>
    </div>
  );
}
