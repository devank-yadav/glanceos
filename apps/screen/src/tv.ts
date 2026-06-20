import type { SafeAreaT } from "@glanceos/schema";

// TV / large-display chrome for the screen runtime: true fullscreen (kiosk),
// a screen wake-lock so the panel never sleeps, and overscan-safe margins.
// Strictly opt-in (?tv=1 or a tvMode device) so the e-ink/normal path is
// byte-identical. Framework-free; everything here degrades to a no-op where a
// browser lacks the API.

let tvOn = false;
export const isTvMode = (): boolean => tvOn;

let wakeLock: { release: () => Promise<void> } | null = null;
async function acquireWakeLock(): Promise<void> {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (wl) wakeLock = await wl.request("screen");
  } catch { /* unsupported or denied — fine */ }
}

function requestFullscreen(): void {
  try { if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.(); } catch { /* ignore */ }
}

/** Turn on TV chrome (idempotent). Fullscreen is attempted immediately (works in
 *  a kiosk/native wrapper) and again on the first user gesture (browsers that
 *  require one); the wake-lock re-acquires whenever the tab becomes visible. */
export function enableTvMode(): void {
  if (tvOn) return;
  tvOn = true;
  document.body.classList.add("tv");
  requestFullscreen();
  const onGesture = () => { requestFullscreen(); };
  document.addEventListener("pointerdown", onGesture, { once: true });
  document.addEventListener("keydown", onGesture, { once: true });
  void acquireWakeLock();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void acquireWakeLock(); });
}

/** Apply overscan-safe margins (percent per edge) as CSS vars the page reads. */
export function applySafeArea(safeArea?: SafeAreaT): void {
  const s = document.documentElement.style;
  s.setProperty("--safe-top", `${safeArea?.top ?? 0}%`);
  s.setProperty("--safe-right", `${safeArea?.right ?? 0}%`);
  s.setProperty("--safe-bottom", `${safeArea?.bottom ?? 0}%`);
  s.setProperty("--safe-left", `${safeArea?.left ?? 0}%`);
}
