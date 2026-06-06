import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  bakeBoard,
  bakeOverall,
  shareImage,
  type MosaicSpec,
  type ShareStyle,
} from "../lib/bake";
import { COLORS, SLOTS_PER_BOARD, swatch, type QuestColor } from "../colors";
import { haptic } from "../lib/haptics";
import { useStore } from "../state/store";
import { useTheme } from "../state/theme";
import { Sheet } from "./Sheet";
import { Thumbnail } from "./Thumbnail";

/**
 * Share UI shared by per-color completed boards and the overall-complete
 * home grid. Renders a live CSS preview of the choice (so the user sees
 * exactly what the baked image will look like), then bakes a JPEG with
 * the matching settings when Share is tapped.
 *
 * Two flavours are wired via the `target` discriminator:
 *
 *   - `{ kind: "board", color, slots, mosaic }` — single 3×3 (or mosaic),
 *     where the rounded background is fixed to that color's swatch.
 *   - `{ kind: "overall", boards }` — 9×9 of every photo, with a bg toggle
 *     (white / black) on the rounded style.
 */

export type ShareTarget =
  | {
      kind: "board";
      color: QuestColor;
      slots: (string | null)[];
      mosaic?: MosaicSpec;
    }
  | { kind: "overall" };

export function ShareSheet({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: ShareTarget;
}) {
  const { scheme } = useTheme();
  const store = useStore();
  const [style, setStyle] = useState<ShareStyle>("rounded");
  const [overallBg, setOverallBg] = useState<"white" | "black">("white");
  const [baking, setBaking] = useState(false);

  // For board shares the bg is the swatch; for overall it's the user pick.
  const bg = useMemo(() => {
    if (target.kind === "board") return swatch(target.color, scheme);
    return overallBg === "white" ? "#ffffff" : "#0c0c0e";
  }, [target, scheme, overallBg]);

  const onShare = async () => {
    if (baking) return;
    haptic("select");
    setBaking(true);
    try {
      let blob: Blob;
      let name: string;
      if (target.kind === "board") {
        blob = await bakeBoard({
          photoIds: target.slots,
          bg,
          style,
          mosaic: target.mosaic,
          crops: store.crops,
        });
        name = `snaps-${target.color.id}.jpg`;
      } else {
        blob = await bakeOverall({
          boards: store.boards,
          bg,
          style,
          crops: store.crops,
        });
        name = `snaps-overall.jpg`;
      }
      const ok = await shareImage(blob, name, "My Snaps");
      if (ok) {
        haptic("success");
        onClose();
      }
    } catch (err) {
      console.error("Share failed", err);
    } finally {
      setBaking(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "4px 18px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            Share {target.kind === "board" ? target.color.name : "everything"}
          </h2>
          <button
            onClick={onClose}
            style={{ fontSize: 16, fontWeight: 600, color: "var(--accent)" }}
          >
            Done
          </button>
        </div>

        <SharePreview target={target} style={style} bg={bg} />

        <SegToggle
          value={style}
          onChange={setStyle}
          options={[
            { id: "bleed", label: "Full bleed" },
            { id: "rounded", label: "Rounded" },
          ]}
          style={{ marginTop: 18 }}
        />

        {target.kind === "overall" && style === "rounded" && (
          <SegToggle
            value={overallBg}
            onChange={setOverallBg}
            options={[
              { id: "white", label: "White" },
              { id: "black", label: "Black" },
            ]}
            style={{ marginTop: 10 }}
          />
        )}

        <motion.button
          onClick={onShare}
          disabled={baking}
          whileTap={{ scale: baking ? 1 : 0.97 }}
          style={{
            display: "block",
            width: "100%",
            marginTop: 18,
            padding: "15px 16px",
            borderRadius: 14,
            background: baking ? "var(--fill-quaternary)" : "var(--accent)",
            color: baking ? "var(--label-secondary)" : "#ffffff",
            fontSize: 16,
            fontWeight: 700,
            boxShadow: baking
              ? "none"
              : "0 6px 20px rgba(0, 122, 255, 0.28)",
          }}
        >
          {baking ? "Preparing image…" : "Share"}
        </motion.button>
      </div>
    </Sheet>
  );
}

/**
 * CSS approximation of the baked image. Uses the same Thumbnail component
 * the rest of the app uses, so the preview is the actual photo data — not
 * a stand-in. Sized small enough to feel like an iOS share preview.
 */
function SharePreview({
  target,
  style,
  bg,
}: {
  target: ShareTarget;
  style: ShareStyle;
  bg: string;
}) {
  if (target.kind === "board") {
    return <BoardPreview target={target} style={style} bg={bg} />;
  }
  return <OverallPreview style={style} bg={bg} />;
}

function BoardPreview({
  target,
  style,
  bg,
}: {
  target: Extract<ShareTarget, { kind: "board" }>;
  style: ShareStyle;
  bg: string;
}) {
  const store = useStore();
  const { color, slots, mosaic } = target;
  const rounded = style === "rounded";
  const gap = rounded ? "1.8%" : 0;
  const radius = rounded ? "9%" : 0;
  const aspect = mosaic ? "3 / 4" : "1 / 1";

  // Mosaic preview uses CSS grid template-areas, mirroring ColorDetail's
  // render path so what the user sees here matches the baked output.
  const gridStyle: React.CSSProperties = mosaic
    ? {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(4, 1fr)",
        gridTemplateAreas: mosaic.areas.join(" "),
        gap,
      }
    : {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        gap,
      };

  const order = mosaic ? mosaic.order : Array.from({ length: 9 }, (_, i) => i);
  const areaForCell = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

  return (
    <div
      style={{
        background: bg,
        borderRadius: 16,
        padding: rounded ? "1.8%" : 0,
        aspectRatio: aspect,
        maxWidth: 260,
        margin: "0 auto",
        overflow: "hidden",
        boxShadow: "0 6px 28px rgba(0,0,0,0.18)",
        // The black-tile share preview needs a hairline against the sheet's
        // own near-black background so the preview's edge is visible.
        outline:
          color.needsBorder && bg.toLowerCase() === "#1c1c1e"
            ? "1px solid rgba(255,255,255,0.2)"
            : undefined,
      }}
    >
      <div style={gridStyle}>
        {order.map((slotIdx, i) => {
          const photoId = slots[slotIdx];
          return (
            <div
              key={i}
              style={{
                gridArea: mosaic ? areaForCell[i] : undefined,
                aspectRatio: mosaic ? undefined : "1 / 1",
                background: bg,
                borderRadius: radius,
                overflow: "hidden",
                minWidth: 0,
                minHeight: 0,
              }}
            >
              {photoId && (
                <Thumbnail
                  photoId={photoId}
                  alt=""
                  tint={bg}
                  crop={store.crops[photoId]}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OverallPreview({ style, bg }: { style: ShareStyle; bg: string }) {
  const store = useStore();
  const rounded = style === "rounded";
  const gap = rounded ? "0.6%" : 0;
  const radius = rounded ? "12%" : 0;

  // Flatten 81 ids in COLORS row order (one row per color).
  const ids: (string | null)[] = [];
  for (const color of COLORS) {
    const slots =
      store.boards[color.id] ?? Array(SLOTS_PER_BOARD).fill(null);
    for (let i = 0; i < SLOTS_PER_BOARD; i++) ids.push(slots[i] ?? null);
  }

  return (
    <div
      style={{
        background: bg,
        borderRadius: 16,
        padding: rounded ? "0.6%" : 0,
        aspectRatio: "1 / 1",
        maxWidth: 260,
        margin: "0 auto",
        overflow: "hidden",
        boxShadow: "0 6px 28px rgba(0,0,0,0.18)",
        outline:
          bg.toLowerCase() === "#0c0c0e"
            ? "1px solid rgba(255,255,255,0.18)"
            : undefined,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(9, 1fr)",
          gridTemplateRows: "repeat(9, 1fr)",
          gap,
        }}
      >
        {ids.map((photoId, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "1 / 1",
              background: bg,
              borderRadius: radius,
              overflow: "hidden",
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {photoId && (
              <Thumbnail
                photoId={photoId}
                alt=""
                tint={bg}
                crop={store.crops[photoId]}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SegOption<T extends string> {
  id: T;
  label: string;
}

function SegToggle<T extends string>({
  value,
  onChange,
  options,
  style,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 2,
        padding: 2,
        background: "var(--fill-quaternary)",
        borderRadius: 12,
        ...style,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              padding: "9px 0",
              borderRadius: 10,
              fontSize: 14.5,
              fontWeight: active ? 600 : 500,
              background: active ? "var(--bg-elevated)" : "transparent",
              color: active ? "var(--label)" : "var(--label-secondary)",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
