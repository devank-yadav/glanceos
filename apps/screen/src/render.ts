import type { StreamPayloadT } from "@glanceos/schema";
import { WIDGETS } from "./widgets";

// Mirrors PAGE_UNITS in @glanceos/schema. Inlined as a literal so the screen
// bundle never imports a runtime value from the schema package (which would
// pull zod in and blow past the "tiny, old-TV-safe" budget — see DECISIONS 007).
const PAGE_UNITS = 24;

const root = document.getElementById("app")!;
let cleanups: Array<() => void> = [];

function reset(): void {
  for (const fn of cleanups) fn();
  cleanups = [];
  root.innerHTML = "";
}

function el(className: string, text?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

export function renderPayload(payload: StreamPayloadT): void {
  reset();
  if (!payload.claimed) {
    renderClaim(payload.claimCode);
    return;
  }
  const state = payload.state;
  if (!state.layout) {
    renderMessage("Claimed and ready", "Pick a setup for this screen in the config studio.");
    return;
  }

  document.body.classList.toggle("dark", state.layout.theme.mode === "dark");
  // Per-board font scale (s/m/l) → a multiplier the CSS reads via var(--font-scale).
  const FONT_SCALE: Record<string, number> = { s: 0.85, m: 1, l: 1.18 };
  document.body.style.setProperty("--font-scale", String(FONT_SCALE[state.layout.theme.fontScale ?? "m"] ?? 1));

  // Document flow: rows stack at their own height (units out of PAGE_UNITS); a
  // blank remainder track absorbs the slack and is positioned per the board's
  // vertical alignment (top / center / bottom). Mirrors the studio's geometry.
  const gap = `${state.layout.gap * 8}px`;
  const page = el("page");
  page.style.gap = gap;
  const layout = state.layout;
  const used = layout.rows.reduce((n, r) => n + r.h, 0);
  const remainder = Math.max(0, PAGE_UNITS - used);
  const align = layout.align ?? "top";

  const tracks = layout.rows.map((r) => `${r.h}fr`);
  let offset = 0; // leading filler tracks before the content
  if (remainder > 0) {
    if (align === "bottom") {
      tracks.unshift(`${remainder}fr`);
      offset = 1;
    } else if (align === "center") {
      tracks.unshift(`${remainder / 2}fr`);
      tracks.push(`${remainder / 2}fr`);
      offset = 1;
    } else {
      tracks.push(`${remainder}fr`);
    }
  }
  page.style.gridTemplateRows = tracks.join(" ");

  layout.rows.forEach((row, i) => {
    const rowEl = el("board-row");
    rowEl.style.gap = gap;
    rowEl.style.gridRow = String(offset + i + 1);
    for (const block of row.blocks) {
      // Conditional visibility: a "whenData" block hides when its bound source resolved to nothing.
      if (block.visibility === "whenData" && state.data[block.id] == null) continue;
      // A cached bundle older than the document may not know this type — skip, don't blank.
      const render = (WIDGETS as Record<string, (typeof WIDGETS)[keyof typeof WIDGETS] | undefined>)[block.type];
      if (!render) continue;
      const st = block.style ?? { invert: false, align: "start", valign: "top" };
      const cell = el(`widget widget-${block.type} halign-${st.align} valign-${st.valign}`);
      if (st.invert) cell.classList.add("is-invert");
      cell.style.flexGrow = String(block.width);
      const cleanup = render(cell, block, state.data[block.id]);
      if (cleanup) cleanups.push(cleanup);
      rowEl.appendChild(cell);
    }
    page.appendChild(rowEl);
  });
  root.appendChild(page);
}

function renderClaim(code: string): void {
  document.body.classList.remove("dark");
  const wrap = el("claim");
  wrap.appendChild(el("claim-brand", "glanceos"));
  wrap.appendChild(el("claim-code", code));
  wrap.appendChild(el("claim-hint", "Open the config app and enter this code to claim the screen."));
  root.appendChild(wrap);
}

export function renderMessage(title: string, body: string): void {
  reset();
  const wrap = el("message");
  wrap.appendChild(el("message-title", title));
  wrap.appendChild(el("message-body", body));
  root.appendChild(wrap);
}

export function markStale(): void {
  document.body.classList.add("stale");
}

export function markFresh(): void {
  document.body.classList.remove("stale");
}
