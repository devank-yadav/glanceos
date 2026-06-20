// D-pad / remote spatial navigation for TV mode. Framework-free, ~1 kB, and only
// armed in TV mode so the normal/e-ink path is untouched. Boards are mostly
// glanceable, so the focusable set is just genuinely-actionable targets
// (links + anything tagged [data-focusable]); arrows move focus to the nearest
// element in that direction, Enter activates, Back/Escape blurs.

export interface Rect { left: number; top: number; right: number; bottom: number }

/** Pure: index of the nearest candidate in `dir` from `cur`, or -1. Prefers
 *  candidates that are far along the axis-of-travel and well-aligned across it. */
export function nearestInDirection(cur: Rect, cands: Rect[], dir: "up" | "down" | "left" | "right"): number {
  const cx = (cur.left + cur.right) / 2, cy = (cur.top + cur.bottom) / 2;
  let best = -1, bestScore = Infinity;
  cands.forEach((r, i) => {
    const rx = (r.left + r.right) / 2, ry = (r.top + r.bottom) / 2;
    const dx = rx - cx, dy = ry - cy;
    const along = dir === "up" ? -dy : dir === "down" ? dy : dir === "left" ? -dx : dx;
    if (along <= 1) return; // not in that direction (ignore same/behind)
    const across = dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy);
    const score = along + across * 2; // closeness + alignment penalty
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

const KEY_DIR: Record<string, "up" | "down" | "left" | "right" | undefined> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
};
const BACK_KEYS = new Set(["Escape", "XF86Back", "BrowserBack", "GoBack", "Backspace"]);

const focusables = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("a[href], [data-focusable]")];
const rectOf = (el: HTMLElement): Rect => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };

function onKey(e: KeyboardEvent): void {
  const dir = KEY_DIR[e.key];
  if (dir) {
    const els = focusables();
    if (!els.length) return;
    const cur = document.activeElement as HTMLElement | null;
    const idx = cur ? els.indexOf(cur) : -1;
    if (idx < 0) { els[0]!.focus(); e.preventDefault(); return; } // nothing focused → first
    const next = nearestInDirection(rectOf(cur!), els.map(rectOf), dir);
    if (next >= 0) { els[next]!.focus(); e.preventDefault(); }
  } else if (e.key === "Enter") {
    (document.activeElement as HTMLElement | null)?.click?.();
  } else if (BACK_KEYS.has(e.key)) {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
}

let armed = false;
/** Arm spatial navigation (idempotent). Called from TV mode. */
export function enableSpatialNav(): void {
  if (armed) return;
  armed = true;
  document.addEventListener("keydown", onKey);
}
