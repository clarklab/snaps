import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * A tiny non-blocking toast/banner used for storage failures, the SW
 * update prompt, and the offline indicator. Designed to feel like a
 * native iOS banner: pill-shaped, spring-in from the top, dismissible.
 *
 * One toast at a time keeps the screen calm — newer toasts replace older
 * ones, and `persist: true` pins a toast until explicitly cleared (used
 * for the offline indicator).
 */

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  action?: ToastAction;
  tone?: "info" | "warn" | "error";
  /** When true, only dismissed by another call to dismiss(id) or push() with a different toast. */
  persist?: boolean;
  /** Auto-dismiss in ms when not persistent. Defaults to 3800. */
  timeout?: number;
}

interface ToastValue {
  push: (t: Omit<Toast, "id">) => number;
  dismiss: (id?: number) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  // Mirror current toast in a ref so push/dismiss can stay referentially
  // stable — they're often used inside effect deps, and a changing
  // identity would force every consumer to re-run on each toast change.
  const currentRef = useRef<Toast | null>(null);
  currentRef.current = toast;

  const dismiss = useCallback((id?: number) => {
    if (id != null && currentRef.current?.id !== id) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const push = useCallback((t: Omit<Toast, "id">): number => {
    const id = ++idRef.current;
    const next: Toast = { id, timeout: 3800, ...t };
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(next);
    if (!next.persist) {
      timerRef.current = window.setTimeout(() => {
        setToast((cur) => (cur?.id === id ? null : cur));
        timerRef.current = null;
      }, next.timeout);
    }
    return id;
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const value = useMemo<ToastValue>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toast={toast} onDismiss={() => dismiss()} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastViewport({
  toast,
  onDismiss,
}: {
  toast: Toast | null;
  onDismiss: () => void;
}) {
  const accent =
    toast?.tone === "error"
      ? "#ff453a"
      : toast?.tone === "warn"
        ? "#ff9f0a"
        : "var(--accent)";

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: "calc(var(--safe-top) + 12px)",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 70,
        padding: "0 16px",
      }}
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.6, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -40 || info.velocity.y < -500) onDismiss();
            }}
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
              maxWidth: 480,
              width: "100%",
              padding: "10px 12px 10px 14px",
              borderRadius: 14,
              background: "var(--bg-elevated)",
              color: "var(--label)",
              boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
              border: "1px solid var(--hairline)",
              touchAction: "none",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: accent,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{toast.title}</div>
              {toast.detail && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--label-secondary)",
                    marginTop: 2,
                  }}
                >
                  {toast.detail}
                </div>
              )}
            </div>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.onPress();
                  onDismiss();
                }}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: accent,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "var(--fill-quaternary)",
                  flexShrink: 0,
                }}
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
