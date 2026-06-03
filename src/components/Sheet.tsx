import { motion } from "framer-motion";
import { type ReactNode, useEffect } from "react";

/**
 * A native-feeling bottom sheet with a scrim and drag-to-dismiss.
 *
 * The sheet is always mounted and animates between open/closed states
 * via motion's `animate` prop instead of AnimatePresence's mount/exit
 * tracking. AnimatePresence was dropping `onExitComplete` when the
 * guided tour toggled `open` rapidly, leaving an orphaned scrim that
 * silently swallowed taps on the home grid. Always-mounted with a
 * finite-duration tween is the simplest reliable fix.
 */
export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <motion.div
      initial={false}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--sheet-scrim)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        // pointer-events follows the live `open` prop so a closed sheet
        // can never block taps on the home grid below.
        pointerEvents: open ? "auto" : "none",
      }}
      aria-hidden={!open}
    >
      <motion.div
        initial={false}
        animate={{ y: open ? "0%" : "100%" }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        drag={open ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) onClose();
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--bg-elevated)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: "calc(var(--safe-bottom) + 12px)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 5,
            borderRadius: 999,
            background: "var(--label-tertiary)",
            margin: "8px auto 4px",
          }}
        />
        {children}
      </motion.div>
    </motion.div>
  );
}
