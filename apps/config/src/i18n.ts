import en from "./locales/en";

// A tiny, dependency-free i18n for the config app: a t(key, vars?) lookup with
// {var} interpolation and a missing-key fallback to the key itself. Only English
// ships in v1.5; this is the scaffold so more locales are a sibling file away.
const LOCALES: Record<string, Record<string, string>> = { en };

/** Locale codes that have a dictionary (e.g. ["en"]). */
export const AVAILABLE = Object.keys(LOCALES);

const LOCALE_KEY = "glanceos.locale";

function detect(): string {
  try { const s = localStorage.getItem(LOCALE_KEY); if (s && LOCALES[s]) return s; } catch { /* ignore */ }
  try { const n = (navigator.language || "en").slice(0, 2); if (LOCALES[n]) return n; } catch { /* ignore */ }
  return "en";
}

let locale = detect();
export const getLocale = (): string => locale;
export function setLocale(l: string): void {
  if (!LOCALES[l]) return;
  locale = l;
  try { localStorage.setItem(LOCALE_KEY, l); } catch { /* ignore */ }
}

/** Translate a key for the active locale, interpolating {placeholders}. Unknown
 *  keys fall back to en, then to the key itself (so nothing renders blank). */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = LOCALES[locale]?.[key] ?? LOCALES.en![key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`)) : raw;
}
