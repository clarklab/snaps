import { Children, type CSSProperties, type ReactNode } from "react";

/**
 * Shared building blocks for the app's menus (the My Boards sheet and the
 * per-board settings sheet), modeled on iOS inset-grouped lists: a small
 * uppercase section label, a rounded card, hairline-separated rows inside
 * it, and an optional footnote hanging under the card. Grouping everything
 * into cards is what keeps the menus calm — the eye reads four shapes, not
 * twenty controls.
 */

export function SectionLabel({
  children,
  first = false,
}: {
  children: ReactNode;
  /** First label under the sheet header sits closer to it. */
  first?: boolean;
}) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--label-secondary)",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        margin: `${first ? 2 : 24}px 4px 7px`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Inset grouped card. Falsy children are skipped; the rest are separated
 * by inset hairlines (`dividerInset` lets rows with a leading thumbnail
 * start the line where their text starts).
 */
export function MenuGroup({
  children,
  dividerInset = 14,
}: {
  children: ReactNode;
  dividerInset?: number;
}) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <div
      style={{
        background: "var(--fill-quaternary)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {items.map((child, i) => (
        <div key={i}>
          {i > 0 && (
            <div
              style={{
                height: 1,
                background: "var(--separator)",
                marginLeft: dividerInset,
              }}
            />
          )}
          {child}
        </div>
      ))}
    </div>
  );
}

/**
 * One row in a MenuGroup. With `onClick` it renders as a full-width button;
 * without, as a static label/value row.
 */
export function MenuRow({
  label,
  onClick,
  leading,
  detail,
  trailing,
  destructive = false,
  disabled = false,
}: {
  label: ReactNode;
  onClick?: () => void;
  /** Emoji / icon / thumbnail at the start of the row. */
  leading?: ReactNode;
  /** Secondary value pinned to the right (static rows). */
  detail?: ReactNode;
  /** Custom trailing element (checkmark, chevron…). */
  trailing?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "12px 14px",
    fontSize: 15.5,
    textAlign: "left",
    background: "transparent",
    color: onClick
      ? destructive
        ? "#ff453a"
        : "var(--accent)"
      : "var(--label)",
    fontWeight: onClick ? 600 : 400,
    opacity: disabled ? 0.45 : 1,
  };
  const body = (
    <>
      {leading != null && (
        <span aria-hidden style={{ flexShrink: 0, lineHeight: 1 }}>
          {leading}
        </span>
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {detail != null && (
        <span style={{ color: "var(--label-secondary)", flexShrink: 0 }}>
          {detail}
        </span>
      )}
      {trailing}
    </>
  );
  if (!onClick) return <div style={style}>{body}</div>;
  return (
    <button onClick={onClick} disabled={disabled} style={style}>
      {body}
    </button>
  );
}

/** Small explanatory text hanging under a MenuGroup. */
export function MenuFootnote({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12.5,
        lineHeight: 1.45,
        color: "var(--label-secondary)",
        margin: "7px 4px 0",
      }}
    >
      {children}
    </p>
  );
}

/** iOS-style trailing chevron for rows that open something. */
export function Chevron() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden
      style={{ flexShrink: 0, color: "var(--label-tertiary)" }}
    >
      <path
        d="M1 1l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Accent checkmark marking the selected row. */
export function Checkmark() {
  return (
    <svg width="16" height="13" viewBox="0 0 16 13" fill="none" aria-hidden
      style={{ flexShrink: 0, color: "var(--accent)" }}
    >
      <path
        d="M1.5 7l4.2 4.2L14.5 1.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
