import React, { type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import { BoardsProvider, useBoards } from "./state/boards";
import { DemoProvider } from "./state/demo";
import { StoreProvider } from "./state/store";
import { ThemeProvider } from "./state/theme";
import { registerServiceWorker } from "./lib/registerSW";
import "./index.css";

/**
 * Scopes the photo store to the active board. Keyed on the board id so a
 * switch remounts the store (and everything under it) — the full mount-time
 * hydration/restore/reconcile pass runs against the new board's keys, which
 * is the same battle-tested path as a fresh app launch.
 */
function BoardScopedStore({ children }: { children: ReactNode }) {
  const { activeBoardId } = useBoards();
  return (
    <StoreProvider key={activeBoardId} boardId={activeBoardId}>
      {children}
    </StoreProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <BoardsProvider>
          <BoardScopedStore>
            <DemoProvider>
              <App />
            </DemoProvider>
          </BoardScopedStore>
        </BoardsProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// Service worker update / offline-ready prompts.
registerServiceWorker();
