import { useEffect, useState } from "react";
import { COLORS } from "../colors";
import { haptic } from "../lib/haptics";
import { cleanBoardName, useBoards } from "../state/boards";
import { useStore } from "../state/store";
import {
  MenuFootnote,
  MenuGroup,
  MenuRow,
  SectionLabel,
} from "./MenuKit";
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
            marginBottom: 14,
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

        <SectionLabel first>Name</SectionLabel>
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
                padding: "10px 0",
                border: "none",
                background: "transparent",
                color: "var(--label)",
                fontSize: 16,
                outline: "none",
              }}
            />
            <button
              onClick={saveName}
              disabled={!dirty}
              style={{
                padding: "10px 10px",
                fontSize: 15.5,
                fontWeight: 650,
                background: "transparent",
                color: dirty ? "var(--accent)" : "var(--label-tertiary)",
                transition: "color 0.15s ease",
                flexShrink: 0,
              }}
            >
              Save
            </button>
          </div>
        </MenuGroup>

        <SectionLabel>Progress</SectionLabel>
        <MenuGroup>
          <MenuRow
            label="Photos placed"
            detail={`${store.totalFilled} of ${store.totalSlots}`}
          />
          <MenuRow
            label="Colors complete"
            detail={`${store.completedColors} of ${COLORS.length}`}
          />
        </MenuGroup>

        {/* Sample photos that were loaded onto THIS board (normally only the
            demo board ever has them). Removing them never touches the
            photos you added yourself. */}
        {store.hasSamples && (
          <>
            <SectionLabel>Sample Photos</SectionLabel>
            <MenuGroup>
              <MenuRow
                destructive
                label={`Remove ${store.sampleCount} sample photo${
                  store.sampleCount === 1 ? "" : "s"
                }`}
                onClick={handleClearSamples}
              />
            </MenuGroup>
            <MenuFootnote>
              Only the loaded examples are removed — photos you added
              yourself stay put.
            </MenuFootnote>
          </>
        )}
      </div>
    </Sheet>
  );
}
