import { useCallback, useEffect, useState } from "preact/hooks";

// Config-app theme: light / dark / system, persisted and applied via
// <html data-theme>. The screens themselves have their own theme; this is just
// the editor chrome. CSS does the actual colour swap (token-only).

export type Theme = "light" | "dark" | "system";
const KEY = "glanceos.theme";

const read = (): Theme => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { /* private mode */ }
  return "system";
};

const apply = (t: Theme) => {
  const el = document.documentElement;
  if (t === "system") el.removeAttribute("data-theme");
  else el.dataset.theme = t;
};

export function useTheme(): [Theme, (t: Theme) => void, () => void] {
  const [theme, setThemeState] = useState<Theme>(read);

  useEffect(() => { apply(theme); }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
    setThemeState(t);
  }, []);

  // cycle light → dark → system
  const toggle = useCallback(() => {
    setThemeState((cur) => {
      const next: Theme = cur === "light" ? "dark" : cur === "dark" ? "system" : "light";
      try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return [theme, setTheme, toggle];
}
