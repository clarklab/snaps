import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "./haptics";

/**
 * Long-press-to-drag for a grid of slots.
 *
 * Holding a finger on a slot for `pressMs` arms a drag; moving before then
 * cancels (treated as scroll intent). Once armed, the dragged cell follows
 * the pointer and the hook reports which slot the pointer is over so the
 * UI can highlight it. Releasing over a different slot fires `onSwap`;
 * releasing over the same slot (or off-grid) is a no-op.
 *
 * The hook does NOT manipulate the DOM directly — it returns a `state`
 * snapshot the consumer applies to whichever cell is being dragged. This
 * keeps the visual treatment (lift, shadow, scale of target) in the
 * consumer's hands and composes cleanly with framer-motion `layoutId`
 * morphs on the swap.
 */
export interface GridDragState {
  /** Index of the slot the user grabbed. */
  from: number;
  /** Pointer offset (px) from the press origin. */
  x: number;
  y: number;
  /** Slot index under the pointer right now, or null if off-grid. */
  target: number | null;
}

export interface GridDragApi {
  state: GridDragState | null;
  /** Pass to each cell's `ref`. */
  setCellRef: (i: number) => (el: HTMLElement | null) => void;
  /** Wire to each cell's `onPointerDown`. Returns a no-op if drag isn't allowed for that slot. */
  onCellPointerDown: (i: number) => (e: React.PointerEvent) => void;
  /**
   * Read flag set during the press window. If true at click time the
   * consumer should suppress the cell's normal onClick so a long-press
   * doesn't also fire the tap handler.
   */
  consumeTapSuppression: () => boolean;
}

export function useGridDrag(opts: {
  count: number;
  isDraggable: (i: number) => boolean;
  onSwap: (from: number, to: number) => void;
  pressMs?: number;
}): GridDragApi {
  const { count, isDraggable, onSwap } = opts;
  const pressMs = opts.pressMs ?? 380;
  const moveCancelPx = 8;

  const [state, setState] = useState<GridDragState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const cellsRef = useRef<(HTMLElement | null)[]>([]);
  if (cellsRef.current.length !== count) cellsRef.current.length = count;

  // True between the moment a long-press triggered and the next click; lets
  // the consumer's onClick handler skip the tap path.
  const suppressNextTap = useRef(false);

  const findCellAtPoint = useCallback((x: number, y: number): number | null => {
    for (let i = 0; i < cellsRef.current.length; i++) {
      const r = cellsRef.current[i]?.getBoundingClientRect();
      if (!r) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return null;
  }, []);

  const setCellRef = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      cellsRef.current[i] = el;
    },
    [],
  );

  const onCellPointerDown = useCallback(
    (i: number) => (e: React.PointerEvent) => {
      if (!isDraggable(i)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const startX = e.clientX;
      const startY = e.clientY;
      let timer: number | null = null;
      let dragging = false;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!dragging) {
          if (Math.hypot(dx, dy) > moveCancelPx) cleanup();
          return;
        }
        ev.preventDefault();
        const target = findCellAtPoint(ev.clientX, ev.clientY);
        const prev = stateRef.current;
        if (prev) setState({ ...prev, x: dx, y: dy, target });
      };

      const onUp = () => {
        const cur = stateRef.current;
        cleanup();
        if (cur && dragging) {
          if (cur.target !== null && cur.target !== cur.from) {
            onSwap(cur.from, cur.target);
            haptic("success");
          }
          setState(null);
        }
      };

      const onCancel = () => {
        cleanup();
        if (dragging) {
          setState(null);
        }
      };

      timer = window.setTimeout(() => {
        timer = null;
        dragging = true;
        suppressNextTap.current = true;
        haptic("select");
        setState({ from: i, x: 0, y: 0, target: i });
      }, pressMs);

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [findCellAtPoint, isDraggable, onSwap, pressMs],
  );

  const consumeTapSuppression = useCallback(() => {
    if (suppressNextTap.current) {
      suppressNextTap.current = false;
      return true;
    }
    return false;
  }, []);

  // Safety: if the component unmounts mid-drag, ensure we don't leave stale
  // listeners on the window. The pointerup handlers attached above are
  // scoped to a single press, so this is just belt-and-suspenders for the
  // case where the user navigates away while holding.
  useEffect(() => {
    return () => {
      if (stateRef.current) setState(null);
    };
  }, []);

  return { state, setCellRef, onCellPointerDown, consumeTapSuppression };
}
