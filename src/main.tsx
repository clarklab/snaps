import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import { DemoProvider } from "./state/demo";
import { StoreProvider } from "./state/store";
import { ThemeProvider } from "./state/theme";
import { registerServiceWorker } from "./lib/registerSW";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <StoreProvider>
          <DemoProvider>
            <App />
          </DemoProvider>
        </StoreProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// Service worker update / offline-ready prompts.
registerServiceWorker();
