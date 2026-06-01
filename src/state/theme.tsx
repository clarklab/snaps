import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Scheme } from "../colors";

export type AppearanceMode = "system" | "light" | "dark";

interface ThemeValue {
  mode: AppearanceMode;
  scheme: Scheme; // the effective scheme after resolving "system"
  setMode: (mode: AppearanceMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const STORAGE_KEY = "snaps.appearance";

function systemScheme(): Scheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppearanceMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
  });
  const [sysScheme, setSysScheme] = useState<Scheme>(systemScheme);

  // Track the system preference while in "system" mode.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSysScheme(systemScheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const scheme: Scheme = mode === "system" ? sysScheme : mode;

  // Drive CSS variables + the browser chrome color.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", scheme);
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]:not([media])'
    );
    const color = scheme === "dark" ? "#0c0c0e" : "#f2f2f7";
    if (meta) meta.content = color;
    else {
      const m = document.createElement("meta");
      m.name = "theme-color";
      m.content = color;
      document.head.appendChild(m);
    }
  }, [scheme]);

  const setMode = (m: AppearanceMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  const value = useMemo<ThemeValue>(
    () => ({ mode, scheme, setMode }),
    [mode, scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
