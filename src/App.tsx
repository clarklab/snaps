import { AnimatePresence, LayoutGroup } from "framer-motion";
import { useState } from "react";
import { colorById } from "./colors";
import { ColorBoard } from "./components/ColorBoard";
import { ColorDetail } from "./components/ColorDetail";
import { Settings } from "./components/Settings";

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selected = selectedId ? colorById(selectedId) : undefined;

  return (
    <LayoutGroup>
      {/* Home */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "calc(var(--safe-top) + 14px) 18px 6px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: -0.3 }}>
          Snaps Quest
        </h1>
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: "var(--fill-quaternary)",
            color: "var(--label)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <GearIcon />
        </button>
      </header>

      <ColorBoard onSelect={setSelectedId} />

      {/* Detail overlays the home and morphs from the tapped tile */}
      <AnimatePresence>
        {selected && (
          <ColorDetail
            key={selected.id}
            color={selected}
            onBack={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </LayoutGroup>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 13a3 3 0 100-6 3 3 0 000 6z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M16.5 10c0-.5-.05-.97-.14-1.43l1.4-1.1-1.5-2.6-1.67.67a6.5 6.5 0 00-2.47-1.43L11.8 2H8.2l-.32 1.7A6.5 6.5 0 005.4 5.14L3.74 4.47l-1.5 2.6 1.4 1.1a6.6 6.6 0 000 2.86l-1.4 1.1 1.5 2.6 1.67-.67a6.5 6.5 0 002.47 1.43L8.2 18h3.6l.32-1.7a6.5 6.5 0 002.47-1.43l1.67.67 1.5-2.6-1.4-1.1c.09-.46.14-.93.14-1.43z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
