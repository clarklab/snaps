import { useEffect, useRef, useState } from "react";
import { COLORS } from "../colors";
import { BackupFileError } from "../lib/backupFile";
import { StorageQuotaError } from "../lib/db";
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
import { useToast } from "./Toast";

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
  const toast = useToast();
  const { activeBoard, renameBoard } = useBoards();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // A picked backup file awaiting the in-place "replace everything?"
  // confirmation. Cleared whenever the sheet closes.
  const [pendingRestore, setPendingRestore] = useState<File | null>(null);
  useEffect(() => {
    if (!open) setPendingRestore(null);
  }, [open]);

  const backUp = async () => {
    if (backingUp) return;
    setBackingUp(true);
    haptic("select");
    try {
      const { blob, filename, photoCount, skipped } =
        await store.exportBoardData(activeBoard.name);
      const file = new File([blob], filename, { type: "application/zip" });
      // Mobile-first: the share sheet lets the user land the file in
      // Files / Drive / wherever. Fall back to a plain download.
      let shared = false;
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          shared = true;
        } catch (err) {
          // User cancelled the share sheet → not an error, and not a
          // download either.
          if ((err as { name?: string })?.name === "AbortError") return;
        }
      }
      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      toast.push({
        title: `Backed up ${photoCount} photo${photoCount === 1 ? "" : "s"}`,
        detail:
          (skipped > 0
            ? `${skipped} couldn't be read and ${skipped === 1 ? "was" : "were"} left out. `
            : "") +
          "Keep the file somewhere safe — it restores this board exactly, photos and all.",
        tone: "info",
        timeout: 6000,
      });
    } catch {
      toast.push({
        title: "Backup failed",
        detail: "Couldn't read the photos from storage. Try again in a moment.",
        tone: "error",
      });
    } finally {
      setBackingUp(false);
    }
  };

  const restore = async (file: File) => {
    if (restoring) return;
    setRestoring(true);
    haptic("select");
    try {
      const { placed } = await store.importBoardData(file);
      setPendingRestore(null);
      toast.push({
        title: `Restored ${placed} photo${placed === 1 ? "" : "s"}`,
        detail: "The board now matches the backup.",
        tone: "info",
      });
    } catch (err) {
      const detail =
        err instanceof BackupFileError
          ? "That file doesn't look like a Snaps backup."
          : err instanceof StorageQuotaError
            ? "Your device is out of storage. Free up space and try again."
            : "Nothing was changed — the board is exactly as it was. Try again in a moment.";
      toast.push({ title: "Restore failed", detail, tone: "error" });
    } finally {
      setRestoring(false);
    }
  };

  const onFilePicked = (file: File | null) => {
    if (!file) return;
    // Replacing a non-empty board is destructive — confirm in place.
    if (store.totalFilled > 0) setPendingRestore(file);
    else void restore(file);
  };

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

        <SectionLabel>Backup</SectionLabel>
        <MenuGroup>
          <MenuRow
            label={
              backingUp
                ? "Preparing backup…"
                : `Back up this board (${store.totalFilled} photo${store.totalFilled === 1 ? "" : "s"})`
            }
            onClick={() => void backUp()}
            disabled={backingUp || store.totalFilled === 0}
          />
          {!pendingRestore ? (
            <MenuRow
              label={restoring ? "Restoring…" : "Restore from backup"}
              onClick={() => {
                haptic("tap");
                fileInputRef.current?.click();
              }}
              disabled={restoring}
            />
          ) : (
            <>
              <MenuRow
                destructive
                label={
                  restoring
                    ? "Restoring…"
                    : `Replace all ${store.totalFilled} photo${store.totalFilled === 1 ? "" : "s"} with “${pendingRestore.name}”`
                }
                onClick={() => void restore(pendingRestore)}
                disabled={restoring}
              />
              <MenuRow
                label="Cancel restore"
                onClick={() => {
                  haptic("tap");
                  setPendingRestore(null);
                }}
                disabled={restoring}
              />
            </>
          )}
        </MenuGroup>
        <MenuFootnote>
          A backup is a regular ZIP of this board's original photos plus
          their layout. Save it to Files or a cloud drive — it's the one copy
          the browser can never delete. Restoring replaces everything on this
          board with the backup's contents.
        </MenuFootnote>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          style={{ display: "none" }}
          onChange={(e) => {
            onFilePicked(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

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
