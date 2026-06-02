import { useEffect, useState } from "react";
import { COLORS } from "../colors";
import { estimateUsage } from "../lib/db";
import { haptic } from "../lib/haptics";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import { useSampleLoader } from "../state/useSampleLoader";
import { useStore } from "../state/store";
import { useTheme, type AppearanceMode } from "../state/theme";
import { ProgressBar } from "./Progress";
import { Sheet } from "./Sheet";
import { useToast } from "./Toast";

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
  const toast = useToast();
  const install = useInstallPrompt();
  const [usage, setUsage] = useState<string | null>(null);

  const {
    available: samplesAvailable,
    seeding,
    progress,
    note,
    load,
  } = useSampleLoader();

  useEffect(() => {
    if (!open) return;
    estimateUsage().then((bytes) => {
      if (bytes == null) return setUsage(null);
      const mb = bytes / (1024 * 1024);
      setUsage(mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`);
    });
  }, [open]);

  const handleInstall = async () => {
    haptic("select");
    if (install.canInstall) {
      const accepted = await install.install();
      if (accepted) haptic("success");
      return;
    }
    if (install.needsManualInstructions) {
      toast.push({
        title: "Add to Home Screen",
        detail: "Tap the share icon below, then choose Add to Home Screen.",
        tone: "info",
        timeout: 6000,
      });
      return;
    }
    toast.push({
      title: "Install not available yet",
      detail: "Try this from your phone's browser to install the app.",
      tone: "info",
    });
  };

  const handleLoadSamples = async () => {
    haptic("select");
    const placed = await load();
    if (placed) haptic("success");
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

        {!install.isStandalone && (
          <button
            onClick={handleInstall}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              width: "100%",
              padding: "15px 16px",
              marginBottom: 20,
              borderRadius: 14,
              background: "var(--accent)",
              color: "#fff",
              fontSize: 17,
              fontWeight: 700,
            }}
          >
            <DownloadIcon />
            Install Snaps
          </button>
        )}

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

        {samplesAvailable && (
          <>
            <SectionLabel style={{ marginTop: 22 }}>Sample boards</SectionLabel>
            {seeding ? (
              <div style={{ padding: "4px 2px 2px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 14,
                    marginBottom: 8,
                    color: "var(--label-secondary)",
                  }}
                >
                  <span>Loading example photos…</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {progress.done} / {progress.total || "…"}
                  </span>
                </div>
                <ProgressBar
                  value={progress.done}
                  total={progress.total || 1}
                  tint="var(--accent)"
                />
              </div>
            ) : store.hasSamples ? (
              <BigButton destructive onClick={handleClearSamples}>
                Remove sample photos
              </BigButton>
            ) : (
              <>
                <BigButton onClick={handleLoadSamples}>Load sample boards</BigButton>
                <p
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.45,
                    color: "var(--label-secondary)",
                    margin: "10px 2px 0",
                  }}
                >
                  Fills your empty boards with curated single-color photos so you
                  can see finished collages. Photos from Unsplash.
                </p>
              </>
            )}
            {note && (
              <p
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  color: "var(--label-secondary)",
                  margin: "10px 2px 0",
                }}
              >
                {note}
              </p>
            )}
          </>
        )}

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
          Photos never leave your device. Snaps keeps the original file
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

function BigButton({
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
        padding: "14px 16px",
        borderRadius: 14,
        background: "var(--fill-quaternary)",
        fontSize: 16,
        fontWeight: 600,
        color: destructive ? "#ff453a" : "var(--accent)",
      }}
    >
      {children}
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
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
