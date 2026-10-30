"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useT } from "@/components/i18n-provider";

export type Theme = "light" | "dark";
const STORAGE_KEY = "pix-theme";
/**
 * The theme is mirrored into a cookie so the *server* can render
 * `<html data-theme="dark">` on the first byte. localStorage alone is only
 * readable after hydration, which produced a white flash on every reload.
 */
export const THEME_COOKIE = "pix-theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
});

const THEME_EVENT = "pix-theme-change";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * The site always boots in the light theme (see the inline script in the root
 * layout); dark mode is an explicit, persisted choice. The current value lives
 * on <html data-theme> so server and client markup stay in sync.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "light");

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing: the theme still applies for this session.
    }
    // 1 year, same-site; the server reads this on the next request.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const t = useT();
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border hairline ${className}`}
      aria-label={theme === "dark" ? t("x.ack-temaya-gec") : t("x.koyu-temaya-gec")}
      title={theme === "dark" ? t("x.ack-tema") : "Koyu tema"}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
