import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Thumbnail } from "./Thumbnail";

/**
 * Full-screen viewer showing the original, full-quality image on a black
 * backdrop. Drag down to dismiss; a small menu offers replace / remove.
 */
export function PhotoViewer({
  photoId,
  onClose,
  onReplace,
  onRemove,
}: {
  photoId: string;
  onClose: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.6}
        onDragEnd={(_, info) => {
          if (Math.abs(info.offset.y) > 140 || Math.abs(info.velocity.y) > 700)
            onClose();
        }}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      >
        <Thumbnail photoId={photoId} variant="full" objectFit="contain" alt="" />
      </motion.div>

      {/* Top controls */}
      <div
        style={{
          position: "absolute",
          top: "calc(var(--safe-top) + 12px)",
          left: 16,
          right: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <RoundButton onClick={onClose} label="Close">
          <CloseIcon />
        </RoundButton>
        <RoundButton onClick={() => setMenuOpen((v) => !v)} label="More">
          <DotsIcon />
        </RoundButton>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            style={{
              position: "absolute",
              top: "calc(var(--safe-top) + 60px)",
              right: 16,
              background: "var(--bg-elevated)",
              borderRadius: 14,
              overflow: "hidden",
              minWidth: 180,
              boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
            }}
          >
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                onReplace();
              }}
            >
              Replace photo
            </MenuItem>
            <div style={{ height: 1, background: "var(--separator)" }} />
            <MenuItem
              destructive
              onClick={() => {
                setMenuOpen(false);
                onRemove();
              }}
            >
              Remove
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RoundButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        background: "rgba(40,40,40,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color: "#fff",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function MenuItem({
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
        textAlign: "left",
        padding: "13px 16px",
        fontSize: 16,
        fontWeight: 500,
        color: destructive ? "#ff453a" : "var(--label)",
      }}
    >
      {children}
    </button>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 3l10 10M13 3L3 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <circle cx="3.5" cy="9" r="1.6" />
      <circle cx="9" cy="9" r="1.6" />
      <circle cx="14.5" cy="9" r="1.6" />
    </svg>
  );
}
