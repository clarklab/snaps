import { useEffect, useState } from "react";
import { COLORS } from "../colors";
import { estimateUsage } from "../lib/db";
import { useStore } from "../state/store";
import { useTheme, type AppearanceMode } from "../state/theme";
import { Sheet } from "./Sheet";

const MODES: { id: AppearanceMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function Settings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { mode, setMode } = useTheme();
  const store = useStore();
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    estimateUsage().then((bytes) => {
      if (bytes == null) return setUsage(null);
      const mb = bytes / (1024 * 1024);
      setUsage(mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`);
    });
  }, [open]);

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
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Settings</h2>
          <button
            onClick={onClose}
            style={{ fontSize: 17, fontWeight: 600, color: "var(--accent)" }}
          >
            Done
          </button>
        </div>

        <SectionLabel>Appearance</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 2,
            padding: 2,
            background: "var(--fill-quaternary)",
            borderRadius: 12,
          }}
        >
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  padding: "9px 0",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: active ? 600 : 500,
                  background: active ? "var(--bg-elevated)" : "transparent",
                  color: active ? "var(--label)" : "var(--label-secondary)",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                }}
              >
                {m.label}
              </button>
            );
          })}
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

        <SectionLabel style={{ marginTop: 22 }}>Your Photos</SectionLabel>
        <Row label="Storage" value="On this device" />
        <Row label="Quality" value="Original, uncompressed" />
        {usage && <Row label="Space used" value={usage} />}
        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            color: "var(--label-secondary)",
            margin: "10px 2px 0",
          }}
        >
          Photos never leave your device. Snaps Quest keeps the original file
          bytes in your browser's local storage — nothing is uploaded or
          compressed.
        </p>

        <p
          style={{
            textAlign: "center",
            fontSize: 12.5,
            color: "var(--label-tertiary)",
            marginTop: 22,
          }}
        >
          snaps.quest · v1.0
        </p>
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
