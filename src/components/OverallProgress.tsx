import { COLORS, swatch } from "../colors";
import { useStore } from "../state/store";
import { useTheme } from "../state/theme";
import { ProgressBar } from "./Progress";

/**
 * Compact overall progress that lives inline in the top bar. The label is
 * one line: "N/M" colors complete then a tiny 3×3 of color dots in place of
 * the word "colors" — the rainbow shorthand the rest of the app speaks.
 *
 * The bar itself carries two fills layered on the same track:
 *  - a gray underlay that pre-fills with every individual photo placed
 *    (fine-grained, all 81 slots), and
 *  - a brighter accent fill on top that advances one ninth each time a whole
 *    color grid is finished.
 * Both are measured in photos so the bright fill always sits within — and
 * overlaps the left of — the gray one: the gray "levels up" to color as each
 * board completes. The numeric label stays colors-complete (e.g. 0/9); we
 * deliberately don't surface the 0/81 photo count.
 */
export function OverallProgress() {
  const store = useStore();

  const value = store.completedColors;
  const total = COLORS.length;

  return (
    <div
      aria-label={`${value} of ${total} colors complete, ${store.totalFilled} of ${store.totalSlots} photos placed`}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--bg-elevated)",
        borderRadius: 12,
        padding: "7px 12px",
        boxShadow: "var(--surface-shadow)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <ProgressBar
          // Bright fill = completed color grids, expressed in photos so it
          // shares the photo scale with the gray underlay and overlaps it.
          value={value * (store.totalSlots / total)}
          total={store.totalSlots}
          tint="var(--accent)"
          underlay={{
            value: store.totalFilled,
            total: store.totalSlots,
            tint: "var(--label-tertiary)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        <span>
          {value}/{total}
        </span>
        <ColorDotsIcon />
      </div>
    </div>
  );
}

/**
 * A 3×3 of tiny color dots — the rainbow shorthand the app uses on the
 * intro card and elsewhere. Stands in for the word "colors" so the
 * header reads as one tight line.
 */
function ColorDotsIcon() {
  const { scheme } = useTheme();
  const dot = 3.5;
  const gap = 1.5;
  return (
    <div
      aria-hidden
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${dot}px)`,
        gridAutoRows: `${dot}px`,
        gap,
        flexShrink: 0,
      }}
    >
      {COLORS.map((c) => {
        // The white tile vanishes into the white pill background in light
        // mode (and the hairline border isn't enough at this size). Swap it
        // for a light gray so the dot reads against either scheme.
        const fill =
          c.id === "white" && scheme === "light"
            ? "rgba(60, 60, 67, 0.18)"
            : swatch(c, scheme);
        return (
          <span
            key={c.id}
            style={{
              width: dot,
              height: dot,
              borderRadius: 999,
              background: fill,
              boxShadow:
                c.needsBorder && c.id !== "white"
                  ? "inset 0 0 0 0.5px var(--hairline)"
                  : "none",
            }}
          />
        );
      })}
    </div>
  );
}
