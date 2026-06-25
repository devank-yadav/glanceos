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
// Per-block cells from the last board render, keyed by block id, so a data tick can
// update only the blocks that changed instead of tearing down + rebuilding the whole
// DOM (the old innerHTML="" did that every tick → an all-day flicker on wall panels,
// and it needlessly recreated every self-running widget's interval). `mountedSig` is
// the structural skeleton; while it's unchanged we diff, otherwise we full-rebuild.
interface Cell { el: HTMLElement; sig: string; cleanup?: () => void }
const cells = new Map<string, Cell>();
let mountedSig: string | null = null;

// v8.0 in-place editing (Studio preview only): the edit layer owns this set of block
// ids currently being typed into. updateCells must NOT repaint a locked cell or it
// tears down the DOM the caret lives in. Empty + a no-op on real screens.
let editingIds: ReadonlySet<string> = new Set();
export function setEditingLock(ids: ReadonlySet<string>): void { editingIds = ids; }
export function getCells(): ReadonlyMap<string, { el: HTMLElement }> { return cells; }

let spotlightStop: (() => void) | null = null;
let pageStop: (() => void) | null = null;
let lastPayload: StreamPayloadT | null = null;

function reset(): void {
  for (const fn of cleanups) fn();
  cleanups = [];
  for (const c of cells.values()) c.cleanup?.();
  cells.clear();
  spotlightStop?.();
  spotlightStop = null;
  pageStop?.();
  pageStop = null;
  mountedSig = null;
  root.innerHTML = "";
}

// v9.x multi-page boards: which page shows now — deterministic from the wall clock
// so every screen rotates in lockstep. n = total pages, secs = seconds per page.
export function activePageIndex(now: number, secs: number, n: number): number {
  if (n <= 1 || secs <= 0) return 0;
  return Math.floor(now / 1000 / secs) % n;
}

// Re-arm a 1 s ticker that re-renders when the active page changes. Idempotent:
// clears any prior ticker; arms only for a rotating multi-page board.
function armPageRotate(pages: RowT[][] | null, secs: number): void {
  pageStop?.();
  pageStop = null;
  if (!pages || pages.length < 2 || secs <= 0) return;
  let last = activePageIndex(Date.now(), secs, pages.length);
  const h = window.setInterval(() => {
    const idx = activePageIndex(Date.now(), secs, pages.length);
    if (idx !== last && lastPayload) { last = idx; renderPayload(lastPayload); }
  }, 1000);
  pageStop = () => window.clearInterval(h);
}

// v8.0 spotlight: cycle a calm emphasis across the board's cells (others dim), one at a
// time, deterministic from the wall clock so multiple screens move in lockstep. Re-armed
// each render; a board with no `spotlight` clears any leftover emphasis. Paused while a
// cell is being edited in the Studio (so the dim never fights an active caret).
function applySpotlight(spotlight: LayoutT["spotlight"]): void {
  spotlightStop?.();
  spotlightStop = null;
  const list = () => [...cells.values()];
  if (!spotlight) { for (const c of list()) c.el.classList.remove("is-spotlight", "is-dimmed"); return; }
  const secs = Math.max(3, Number(spotlight.seconds) || 20); // zod-free runtime: a cached/legacy payload may lack seconds → never NaN

  let last = -1;
  const tick = () => {
    const cs = list();
    if (cs.length < 2) { cs.forEach((c) => c.el.classList.remove("is-spotlight", "is-dimmed")); return; }
    if (editingIds.size > 0) return;
    const idx = Math.floor(Date.now() / 1000 / secs) % cs.length;
    if (idx === last) return;
    last = idx;
    cs.forEach((c, i) => { c.el.classList.toggle("is-spotlight", i === idx); c.el.classList.toggle("is-dimmed", i !== idx); });
  };
  tick();
  const h = window.setInterval(tick, 1000);
  spotlightStop = () => window.clearInterval(h);
}

function el(className: string, text?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

// What makes the DOM skeleton: gap/align, zones rects, and the visible blocks (id +
// type) per row. If this is unchanged between ticks we keep the DOM and only refresh
// changed cells; if it differs (layout edited, a block shown/hidden) we full-rebuild.
function structuralSig(layout: LayoutT, data: Record<string, unknown>): string {
  const vis = (b: RowT["blocks"][number]) =>
    !b.hidden && !(b.visibility === "whenData" && data[b.id] == null) && (WIDGETS as Record<string, unknown>)[b.type];
  const rowsSig = (rows: RowT[]) => rows.map((r) => `${r.h}|${r.blocks.filter(vis).map((b) => `${b.id}:${b.type}`).join(",")}`).join(";");
  const base = `${layout.gap}/${layout.align ?? "top"}/`;
  return layout.zones?.length
    ? base + "Z" + layout.zones.map((z) => `${z.rect.x},${z.rect.y},${z.rect.w},${z.rect.h}[${rowsSig(z.rows)}]`).join("|")
    : base + rowsSig(layout.rows);
}
// Per-block content signature — re-render the cell only when its props/style/width/data change.
const blockSig = (block: RowT["blocks"][number], datum: unknown) => JSON.stringify([block.props, block.style, block.width, datum]);

// (Re)paint a widget into a cell, applying its chrome (alignment/invert/flex weight).
function paintCell(cell: HTMLElement, block: RowT["blocks"][number], datum: unknown): (() => void) | undefined {
  const st = block.style ?? { invert: false, align: "start", valign: "top" };
  // v9.0 designable objects — optional per-block style as CSS classes (absent = unchanged).
  const d = st as { pad?: string; border?: string; radius?: string; bg?: string; size?: string };
  const deco =
    (d.pad && d.pad !== "none" ? ` pad-${d.pad}` : "") +
    (d.border && d.border !== "none" ? ` bd-${d.border}` : "") +
    (d.radius && d.radius !== "none" ? ` rad-${d.radius}` : "") +
    (d.bg && d.bg !== "none" ? ` bg-${d.bg}` : "") +
    (d.size && d.size !== "m" ? ` bsize-${d.size}` : "");
  cell.className = `widget widget-${block.type} halign-${st.align} valign-${st.valign}${st.invert ? " is-invert" : ""}${deco}`;
  cell.style.flexGrow = String(block.width ?? 1); // zod-free runtime: default the weight (the "thin strip" bug)
  const render = (WIDGETS as Record<string, (typeof WIDGETS)[keyof typeof WIDGETS] | undefined>)[block.type];
  if (!render) return undefined;
  try {
    return render(cell, block, datum) || undefined;
  } catch (err) {
    // A single throwing widget must NEVER blank the whole wall (e.g. malformed live
    // data at 3am): paint a calm placeholder for just this cell and keep every sibling
    // — and the live clock — running. No cleanup to return.
    try { console.warn(`[glanceos] block "${block.type}" failed to render`, err); } catch { /* ignore */ }
    cell.replaceChildren();
    cell.appendChild(el("placeholder", "·"));
    return undefined;
  }
}

// A new tick with the same skeleton: refresh only the cells whose content changed,
// with a gentle fade (CSS-gated off under reduced-motion / e-ink screenshot).
function updateCells(layout: LayoutT, data: Record<string, unknown>): void {
  const visit = (rows: RowT[]) => {
    for (const row of rows) for (const block of row.blocks) {
      const c = cells.get(block.id);
      if (!c) continue; // structuralSig guarantees a cell exists for every visible block
      if (editingIds.has(block.id)) continue; // being typed into in place — repainting would kill the caret
      const sig = blockSig(block, data[block.id]);
      if (c.sig === sig) continue; // unchanged → leave it (and its running interval) alone
      c.cleanup?.();
      c.el.replaceChildren();
      c.cleanup = paintCell(c.el, block, data[block.id]);
      c.sig = sig;
      c.el.classList.remove("swap"); void c.el.offsetWidth; c.el.classList.add("swap"); // retrigger the fade
    }
  };
  if (layout.zones?.length) for (const z of layout.zones) visit(z.rows); else visit(layout.rows);
}

export function renderPayload(payload: StreamPayloadT): void {
  if (!payload.claimed) {
    reset();
    renderClaim(payload.claimCode);
    return;
  }
  const state = payload.state;
  lastPayload = payload; // for the page-rotation ticker to re-render with the latest data
  // TV-mode devices carry display settings server-side; apply before painting.
  if (state.tv?.enabled) {
    enableTvMode();
    applySafeArea(state.tv.safeArea);
    if (state.tv.power === "off") { reset(); stopPixelShift(root); renderAsleep(); return; } // outside the wake window
    if (state.tv.burnIn?.pixelShift) startPixelShift(root); else stopPixelShift(root);
  }
  if (!state.layout) {
    renderMessage("Claimed and ready", "Pick a setup for this screen in the config studio.");
    return;
  }

  const board = state.layout;
  // v9.x multi-page: render the active page as a normal board ([rows, ...pages] rotated
  // by the wall clock). Single-page boards (no `pages`) take `layout = board` unchanged.
  const allPages: RowT[][] | null = board.pages?.length ? [board.rows, ...board.pages] : null;
  const rotSecs = Math.max(0, Number(board.pageRotateSeconds) || 0);
  const layout: LayoutT = allPages
    ? { ...board, rows: allPages[activePageIndex(Date.now(), rotSecs, allPages.length)]!, pages: undefined }
    : board;
  // Theme + look + quiet dim are body-level — apply every tick, no rebuild needed.
  // "auto" mode resolves to effectiveTheme server-side (sun); fall back to light.
  const mode = state.effectiveTheme ?? (layout.theme.mode === "auto" ? "light" : layout.theme.mode);
  document.body.classList.toggle("dark", mode === "dark");
  document.body.classList.toggle("quiet-dim", !!state.quietDim);
  // Look is opt-in: no look → the default sans (existing boards unchanged).
  if (layout.theme.look) document.body.dataset.look = layout.theme.look; else delete document.body.dataset.look;
  const FONT_SCALE: Record<string, number> = { s: 0.85, m: 1, l: 1.18 };
  const fs = String(FONT_SCALE[layout.theme.fontScale ?? "m"] ?? 1);
  document.body.style.setProperty("--font-scale", fs);
  document.body.style.setProperty("--fs-base", fs); // v9.0: constant board scale a per-block `bsize-*` cell multiplies (no self-reference)

  // Same skeleton as last tick → diff in place (no flash); else full rebuild.
  // (When the active page changes, the sig differs → a clean rebuild of that page.)
  const sig = structuralSig(layout, state.data);
  if (mountedSig === sig && cells.size > 0) { updateCells(layout, state.data); applySpotlight(layout.spotlight); armPageRotate(allPages, rotSecs); return; }
  reset();
  mountedSig = sig;
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
  applySpotlight(layout.spotlight);
  armPageRotate(allPages, rotSecs);
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
      // Hidden by an automation (showObject/hideObject) — skip rendering entirely.
      if (block.hidden) continue;
      // Conditional visibility: a "whenData" block hides when its bound source resolved to nothing.
      if (block.visibility === "whenData" && data[block.id] == null) continue;
      // A cached bundle older than the document may not know this type — skip, don't blank.
      if (!(WIDGETS as Record<string, unknown>)[block.type]) continue;
      const cell = document.createElement("div");
      const cleanup = paintCell(cell, block, data[block.id]); // sets className + flex weight + paints
      cells.set(block.id, { el: cell, sig: blockSig(block, data[block.id]), cleanup }); // registered for in-place diff updates
      rowEl.appendChild(cell);
    }
    page.appendChild(rowEl);
  });
  return page;
}

// The literal first pixels on a fresh panel — make them a designed first impression,
// not a bare code: a live clock proves the screen is alive, a framed card presents the
// pairing code + QR with confidence. Still 1-bit-safe + monochrome.
function renderClaim(code: string): void {
  document.body.classList.remove("dark", "quiet-dim");
  document.body.dataset.look = "editorial";
  const wrap = el("claim");
  const clock = el("claim-clock");
  const paint = () => { const d = new Date(); clock.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  paint();
  const t = window.setInterval(paint, 30_000);
  cleanups.push(() => window.clearInterval(t));
  wrap.appendChild(clock);
  wrap.appendChild(el("claim-brand", "GLANCEOS"));
  const card = el("claim-card");
  card.appendChild(el("claim-label", "Pairing code"));
  card.appendChild(el("claim-code", code));
  // Scan-to-set-up: a QR to the config app (couch distance). Best-effort — if the
  // encoder ever throws on an odd origin, just skip it; the code still shows.
  try {
    const qr = el("claim-qr");
    qr.innerHTML = qrSvg(`${location.origin}/?claim=${encodeURIComponent(code)}`, { size: 220 });
    card.appendChild(qr);
  } catch { /* no QR, the code still shows */ }
  wrap.appendChild(card);
  wrap.appendChild(el("claim-hint", "Scan to open the GlanceOS app, or enter this code there to claim the screen."));
  root.appendChild(wrap);
}

// Outside the wake window: a near-black screen with a faint, slowly-updating
// clock — confirms the panel is alive without burning a static board overnight.
function renderAsleep(): void {
  document.body.classList.add("dark");
  document.body.classList.remove("quiet-dim"); // don't carry a board's quiet dim into the asleep clock
  delete document.body.dataset.look; // nor its Look font preset
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
  // A neutral system message ("Claimed and ready") — shed the prior board's quiet dim
  // and Look font preset so they don't bleed onto it (both are board-path-only classes).
  document.body.classList.remove("quiet-dim");
  delete document.body.dataset.look;
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
