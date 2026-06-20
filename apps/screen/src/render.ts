import type { LayoutT, RowT, StreamPayloadT } from "@glanceos/schema";
import { startPixelShift, stopPixelShift } from "./burnin";
import { qrSvg } from "./qr";
import { applySafeArea, enableTvMode } from "./tv";
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
  // TV-mode devices carry display settings server-side; apply before painting.
  if (state.tv?.enabled) {
    enableTvMode();
    applySafeArea(state.tv.safeArea);
    if (state.tv.power === "off") { stopPixelShift(root); renderAsleep(); return; } // outside the wake window
    if (state.tv.burnIn?.pixelShift) startPixelShift(root); else stopPixelShift(root);
  }
  if (!state.layout) {
    renderMessage("Claimed and ready", "Pick a setup for this screen in the config studio.");
    return;
  }

  document.body.classList.toggle("dark", state.layout.theme.mode === "dark");
  // Per-board font scale (s/m/l) → a multiplier the CSS reads via var(--font-scale).
  const FONT_SCALE: Record<string, number> = { s: 0.85, m: 1, l: 1.18 };
  document.body.style.setProperty("--font-scale", String(FONT_SCALE[state.layout.theme.fontScale ?? "m"] ?? 1));

  const layout = state.layout;
  // Multi-zone signage: each zone is a positioned rectangle (%) with its own
  // document. Absent zones → one full-screen page, byte-identical to before.
  if (layout.zones && layout.zones.length > 0) {
    const zones = el("page-zones");
    for (const zone of layout.zones) {
      const z = el("zone");
      z.style.left = `${zone.rect.x}%`;
      z.style.top = `${zone.rect.y}%`;
      z.style.width = `${zone.rect.w}%`;
      z.style.height = `${zone.rect.h}%`;
      z.appendChild(buildPage(zone.rows, layout, state.data));
      zones.appendChild(z);
    }
    root.appendChild(zones);
  } else {
    root.appendChild(buildPage(layout.rows, layout, state.data));
  }
}

// Build one document page (a height-unit grid of rows) for the given rows. Used
// for the whole board and for each signage zone. Mirrors the studio's geometry:
// rows stack at their own height (units out of PAGE_UNITS); a blank remainder
// track absorbs the slack, positioned per the board's vertical alignment.
function buildPage(rows: RowT[], layout: LayoutT, data: Record<string, unknown>): HTMLElement {
  const gap = `${layout.gap * 8}px`;
  const page = el("page");
  page.style.gap = gap;
  const used = rows.reduce((n, r) => n + r.h, 0);
  const remainder = Math.max(0, PAGE_UNITS - used);
  const align = layout.align ?? "top";

  const tracks = rows.map((r) => `${r.h}fr`);
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

  rows.forEach((row, i) => {
    const rowEl = el("board-row");
    rowEl.style.gap = gap;
    rowEl.style.gridRow = String(offset + i + 1);
    for (const block of row.blocks) {
      // Conditional visibility: a "whenData" block hides when its bound source resolved to nothing.
      if (block.visibility === "whenData" && data[block.id] == null) continue;
      // A cached bundle older than the document may not know this type — skip, don't blank.
      const render = (WIDGETS as Record<string, (typeof WIDGETS)[keyof typeof WIDGETS] | undefined>)[block.type];
      if (!render) continue;
      const st = block.style ?? { invert: false, align: "start", valign: "top" };
      const cell = el(`widget widget-${block.type} halign-${st.align} valign-${st.valign}`);
      if (st.invert) cell.classList.add("is-invert");
      cell.style.flexGrow = String(block.width);
      const cleanup = render(cell, block, data[block.id]);
      if (cleanup) cleanups.push(cleanup);
      rowEl.appendChild(cell);
    }
    page.appendChild(rowEl);
  });
  return page;
}

function renderClaim(code: string): void {
  document.body.classList.remove("dark");
  const wrap = el("claim");
  wrap.appendChild(el("claim-brand", "glanceos"));
  wrap.appendChild(el("claim-code", code));
  // Scan-to-set-up: a big QR to the config app (couch distance). Best-effort —
  // if the encoder ever throws on an odd origin, just skip it.
  try {
    const qr = el("claim-qr");
    qr.innerHTML = qrSvg(`${location.origin}/?claim=${encodeURIComponent(code)}`, { size: 240 });
    wrap.appendChild(qr);
  } catch { /* no QR, the code still shows */ }
  wrap.appendChild(el("claim-hint", "Scan to open the GlanceOS app, or enter this code there to claim the screen."));
  root.appendChild(wrap);
}

// Outside the wake window: a near-black screen with a faint, slowly-updating
// clock — confirms the panel is alive without burning a static board overnight.
function renderAsleep(): void {
  document.body.classList.add("dark");
  const wrap = el("tv-asleep");
  const clock = el("tv-asleep-clock");
  const paint = () => {
    const d = new Date();
    clock.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  paint();
  const t = window.setInterval(paint, 30_000);
  cleanups.push(() => window.clearInterval(t));
  wrap.appendChild(clock);
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
