import type { LayoutT } from "@glanceos/schema";
import { CHECK_OFF, CHECK_ON } from "./glyphs";
import { getCells, setEditingLock } from "./render";

// v8.0 — true in-place editing. Loaded ONLY by the Studio preview (dynamic import in
// main.ts, gated on the `edit` flag), so it NEVER ships to real screens. It makes the
// block's ACTUAL rendered text contentEditable and posts each change back to the Studio,
// which writes it through its normal stageEdit/undo/autosave path. Zod-free. Editing is
// invisible (no chrome) and round-trips are debounced so typing never glitches.

interface Block { id: string; type: string; props: Record<string, unknown>; source?: unknown }

// Single editable text node per block type → { selector within the cell, prop key }.
// `strip` removes the renderer's surrounding quote marks before saving. Mirrors the
// renderers in widgets.ts (verified). MUST stay in sync with INPLACE_EDIT in blocks.ts.
const SINGLE: Record<string, { sel: string; prop: string; strip?: boolean }> = {
  text: { sel: ".text-content", prop: "content" }, // plain only; markdown skipped at runtime
  heading: { sel: ".heading", prop: "content" },
  subheading: { sel: ".subheading", prop: "content" },
  label: { sel: ".eyebrow", prop: "content" },
  callout: { sel: ".callout-content", prop: "content" },
  banner: { sel: ".banner-text", prop: "content" },
  code: { sel: ".code-block", prop: "content" },
  ascii: { sel: ".ascii", prop: "content" },
  lead: { sel: ".lead", prop: "content" },
  ticker: { sel: ".ticker", prop: "content" },
  highlight: { sel: ".highlight", prop: "content" },
  aside: { sel: ".aside", prop: "content" },
  mantra: { sel: ".mantra", prop: "content" },
  epigraph: { sel: ".epigraph-text", prop: "content" },
  postscript: { sel: ".ps-text", prop: "content" },
  finePrint: { sel: ".fine-print", prop: "content" },
  address: { sel: ".address", prop: "content" },
  breadcrumb: { sel: ".breadcrumb", prop: "path" },
  noticeBar: { sel: ".notice-text", prop: "content" },
  badge: { sel: ".pill", prop: "text" },
  nameTag: { sel: ".nametag-name", prop: "name" },
  signature: { sel: ".sig-name", prop: "name" },
  logoText: { sel: ".logo-text", prop: "text" },
  kicker: { sel: ".kicker-title", prop: "title" },
  letterhead: { sel: ".lh-name", prop: "name" },
  fieldRow: { sel: ".field-value", prop: "value" },
  profileCard: { sel: ".pc-name", prop: "name" },
  definition: { sel: ".def-meaning", prop: "meaning" },
  frame: { sel: ".frame-content", prop: "content" },
  eventBanner: { sel: ".event-title", prop: "title" },
  todaySpecial: { sel: ".ts-title", prop: "title" },
  welcomeSign: { sel: ".welcome-name", prop: "name" },
  priceTag: { sel: ".pt-item", prop: "item" },
  phoneNumber: { sel: ".phone", prop: "number" },
  socialHandle: { sel: ".social-handle", prop: "handle" },
  quote: { sel: ".quote-text", prop: "content", strip: true },
  pullquote: { sel: ".pullquote-text", prop: "content", strip: true },
  dividerLabeled: { sel: ".dl-label", prop: "label" },
  link: { sel: ".link-label", prop: "label" },
  // value-bearing (skip when bound to a live source — handled below)
  stat: { sel: ".stat-value", prop: "value" },
  metric: { sel: ".metric-value", prop: "value" },
  bigNumber: { sel: ".stat-value", prop: "value" },
  moneyStat: { sel: ".stat-value", prop: "amount" }, // renderer uses .stat-value, not .money-amt
  unitStat: { sel: ".metric-value", prop: "value" }, // renderer uses .metric-value, not .us-val
};

// Blocks with 2+ separate editable text nodes (the renderer paints each prop into its own
// node). Listed here are the fields BEYOND the primary in SINGLE (or the full set when the
// type isn't in SINGLE). Each becomes its own in-place editor. `editFields()` merges these
// with the SINGLE primary so a click lands on whichever field is nearest.
const EXTRA: Record<string, { sel: string; prop: string; singleLine?: boolean; strip?: boolean }[]> = {
  definition: [{ sel: ".def-term", prop: "term", singleLine: true }],
  eventBanner: [{ sel: ".event-when", prop: "when", singleLine: true }],
  priceTag: [{ sel: ".pt-price", prop: "price", singleLine: true }],
  socialHandle: [{ sel: ".social-platform", prop: "platform", singleLine: true }],
  welcomeSign: [{ sel: ".welcome-msg", prop: "message" }],
  todaySpecial: [{ sel: ".ts-detail", prop: "detail" }],
  signature: [{ sel: ".sig-role", prop: "role", singleLine: true }],
  letterhead: [{ sel: ".lh-tagline", prop: "tagline", singleLine: true }],
  fieldRow: [{ sel: ".field-label", prop: "label", singleLine: true }],
  frame: [{ sel: ".frame-label", prop: "label", singleLine: true }],
  noticeBar: [{ sel: ".notice-icon", prop: "icon", singleLine: true }],
  profileCard: [{ sel: ".pc-role", prop: "role", singleLine: true }, { sel: ".pc-detail", prop: "detail", singleLine: true }],
  nameTag: [{ sel: ".nametag-sub", prop: "subtitle", singleLine: true }],
  // not in SINGLE — full field set lives here
  numberedHeading: [{ sel: ".numhead-n", prop: "number", singleLine: true }, { sel: ".numhead-t", prop: "content", singleLine: true }],
  readingNow: [{ sel: ".reading-title", prop: "title", singleLine: true }, { sel: ".reading-author", prop: "author", singleLine: true }],
};

// Types that never hold their own newline — Enter commits + blurs instead of inserting one.
const SINGLE_LINE = new Set(["heading", "subheading", "label", "banner", "stat", "badge", "nameTag", "numberedHeading", "kicker", "ticker", "mantra", "logoText", "phoneNumber", "socialHandle", "moneyStat", "unitStat", "eventBanner", "priceTag", "dividerLabeled", "link"]);

// Multi-item lists rendered as one item per line. Each shares a container + per-row
// structure so we can edit items in place: Enter = new item, Backspace-at-start = merge.
const LIST_CFG: Record<string, { container: string; row: string; marker: string; text: string; mark: (i: number) => string; check?: boolean }> = {
  bulletList: { container: ".list", row: "li", marker: "li-marker", text: "li-text", mark: () => "•" },
  numberedList: { container: ".list", row: "li", marker: "li-marker", text: "li-text", mark: (i) => `${i + 1}.` },
  checklist: { container: ".list", row: "li", marker: "li-marker", text: "li-text", mark: () => "", check: true },
  steps: { container: ".steps", row: "step-row", marker: "step-n", text: "step-t", mark: (i) => `${i + 1}` },
  footnotes: { container: ".footnotes", row: "fn-row", marker: "fn-num", text: "fn-text", mark: (i) => `${i + 1}` },
};

// Two-column list blocks: each row holds a key + a value node, serialized one row per line
// as `key<delim> value`. A shared wirer (wireDuoList) edits both nodes in place, with
// Enter/Backspace row management and the same "+ add" affordance as the single lists.
const DUO_CFG: Record<string, { container: string; row: string; keySel: string; valSel: string; delim: string; prop: string }> = {
  keyValue: { container: ".kv", row: ".kv-row", keySel: ".kv-key", valSel: ".kv-val", delim: ":", prop: "pairs" },
  hours: { container: ".kv", row: ".kv-row", keySel: ".kv-key", valSel: ".kv-val", delim: ":", prop: "content" },
  directory: { container: ".kv", row: ".kv-row", keySel: ".kv-key", valSel: ".kv-val", delim: "|", prop: "items" },
  peopleList: { container: ".kv", row: ".kv-row", keySel: ".kv-key", valSel: ".kv-val", delim: "|", prop: "items" },
  wayfinding: { container: ".kv", row: ".kv-row", keySel: ".kv-key", valSel: ".wf-dir", delim: "|", prop: "items" },
  glossary: { container: ".kv", row: ".gloss-row", keySel: ".gloss-term", valSel: ".gloss-def", delim: "|", prop: "items" },
  bookList: { container: ".kv", row: ".book-row", keySel: ".book-title", valSel: ".book-author", delim: "|", prop: "items" },
  menuList: { container: ".menu", row: ".menu-row", keySel: ".menu-item", valSel: ".menu-price", delim: "|", prop: "content" },
  timeline: { container: ".timeline", row: ".tl-row", keySel: ".tl-time", valSel: ".tl-text", delim: "|", prop: "items" },
  faq: { container: ".faq", row: ".faq-row", keySel: ".faq-q", valSel: ".faq-a", delim: "|", prop: "items" },
  statRow: { container: ".statrow", row: ".sr-cell", keySel: ".sr-value", valSel: ".sr-label", delim: "|", prop: "items" },
};

const stripQuotes = (s: string): string => s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "");

// caret helpers (work inside the iframe document)
function caretOffset(node: HTMLElement): number {
  const sel = node.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const r = sel.getRangeAt(0).cloneRange();
  const pre = node.ownerDocument.createRange();
  pre.selectNodeContents(node);
  pre.setEnd(r.endContainer, r.endOffset);
  return pre.toString().length;
}
function setCaret(node: HTMLElement, offset: number): void {
  node.focus();
  const sel = node.ownerDocument.getSelection();
  if (!sel) return;
  const r = node.ownerDocument.createRange();
  const tn = node.firstChild;
  if (tn && tn.nodeType === 3) r.setStart(tn, Math.min(offset, (tn.textContent ?? "").length));
  else r.setStart(node, 0);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

// Click anywhere in a block → drop the caret at the clicked point (Notion: the whole
// block is one text field). Falls back to end-of-text if the point isn't over the text
// (e.g. the cell's padding) or the browser lacks caretRangeFromPoint.
function placeCaretFromPoint(node: HTMLElement, x: number, y: number): void {
  node.focus();
  const doc = node.ownerDocument as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const sel = doc.getSelection();
  const range = doc.caretRangeFromPoint ? doc.caretRangeFromPoint(x, y) : null;
  if (sel && range && node.contains(range.startContainer)) {
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    setCaret(node, (node.textContent ?? "").length);
  }
}

export interface EditLayer { refresh(): void }

export function createEditLayer(opts: { post: (m: unknown) => void; getDoc: () => LayoutT | null }): EditLayer {
  // The lock the renderer reads to skip repainting a cell mid-edit (caret safety).
  const editing = new Set<string>();
  setEditingLock(editing);

  // Real screens are wall displays, so the runtime hides the mouse pointer globally
  // (`body { cursor: none }`). In the Studio that made the pointer VANISH over every gap
  // and non-editable block and only flash back as an I-beam over text — the "it hides /
  // glitches near text" the user felt. In edit mode we restore a normal pointer: a plain
  // arrow everywhere, and (via .glance-editcell) a steady I-beam over editable text. The
  // inline style beats the stylesheet rule, so this wins without touching real screens.
  document.body.style.cursor = "default";

  // The Studio overlay is click-through, so empty-board input lands HERE in the iframe.
  // A press on empty board starts a rubber-band marquee: drag a box and every cell it
  // touches is selected (the iframe owns the real cell rects, so it hit-tests itself and
  // posts the ids up). A plain click (no drag) just deselects. A press inside an editable
  // cell is left alone (the caret/affordance owns it). The marquee box + its live cell
  // outlines are inline-styled (this chunk never ships to real screens, so 0 runtime cost).
  const overlaps = (r: DOMRect, x: number, y: number, w: number, h: number): boolean =>
    r.left < x + w && r.right > x && r.top < y + h && r.bottom > y;
  const clearOutlines = (): void => { for (const [, c] of getCells()) { const el = c.el as HTMLElement; el.style.outline = ""; el.style.outlineOffset = ""; } };
  let marquee: { x0: number; y0: number; box: HTMLDivElement | null; badge: HTMLSpanElement | null; moved: boolean; add: boolean } | null = null;
  document.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || t?.closest?.(".glance-editcell") || t?.closest?.(".gl-additem")) return;
    marquee = { x0: e.clientX, y0: e.clientY, box: null, badge: null, moved: false, add: e.shiftKey }; // Shift = add to selection
    try { document.documentElement.setPointerCapture(e.pointerId); } catch { /* no real pointer (tests) */ }
  });
  document.addEventListener("pointermove", (e) => {
    const m = marquee;
    if (!m) return;
    const dx = e.clientX - m.x0, dy = e.clientY - m.y0;
    if (!m.moved && Math.abs(dx) + Math.abs(dy) < 5) return; // a press, not yet a drag
    if (!m.moved) {
      m.moved = true;
      const box = document.createElement("div");
      box.className = "glance-marquee";
      box.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:1.5px solid #2383e2;background:rgba(35,131,226,.10);border-radius:4px;box-shadow:0 1px 8px rgba(35,131,226,.30),inset 0 0 0 1px rgba(255,255,255,.45);";
      const badge = document.createElement("span"); // a live "N selected" count that follows the cursor
      badge.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;background:#2383e2;color:#fff;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;padding:4px 8px;border-radius:999px;box-shadow:0 1px 5px rgba(0,0,0,.25);white-space:nowrap;";
      document.body.append(box, badge);
      document.body.style.userSelect = "none";
      m.box = box; m.badge = badge;
    }
    const x = Math.min(e.clientX, m.x0), y = Math.min(e.clientY, m.y0), w = Math.abs(dx), h = Math.abs(dy);
    Object.assign(m.box!.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    let n = 0;
    for (const [, c] of getCells()) { const el = c.el as HTMLElement; const hit = overlaps(el.getBoundingClientRect(), x, y, w, h); if (hit) n++; el.style.outline = hit ? "2px solid rgba(35,131,226,.65)" : ""; el.style.outlineOffset = hit ? "2px" : ""; }
    const b = m.badge!;
    b.textContent = n ? `${n} selected${m.add ? " +" : ""}` : "";
    b.style.display = n ? "block" : "none";
    b.style.left = `${e.clientX + 14}px`;
    b.style.top = `${e.clientY + 14}px`;
  });
  const endMarquee = (e: PointerEvent): void => {
    const m = marquee;
    marquee = null;
    if (!m) return;
    document.body.style.userSelect = "";
    m.badge?.remove();
    if (!m.moved) { opts.post({ type: "glanceos:focus", id: null }); return; } // plain click → deselect
    const x = Math.min(e.clientX, m.x0), y = Math.min(e.clientY, m.y0), w = Math.abs(e.clientX - m.x0), h = Math.abs(e.clientY - m.y0);
    const ids: string[] = [];
    for (const [id, c] of getCells()) if (overlaps((c.el as HTMLElement).getBoundingClientRect(), x, y, w, h)) ids.push(id);
    clearOutlines();
    m.box?.remove();
    opts.post({ type: "glanceos:select", ids, add: m.add });
  };
  document.addEventListener("pointerup", endMarquee);
  document.addEventListener("pointercancel", () => { const m = marquee; marquee = null; if (!m) return; document.body.style.userSelect = ""; clearOutlines(); m.box?.remove(); m.badge?.remove(); });

  const blocksById = (): Map<string, Block> => {
    const m = new Map<string, Block>();
    const doc = opts.getDoc();
    if (!doc) return m;
    const add = (rows: LayoutT["rows"]) => { for (const r of rows) for (const b of r.blocks) m.set(b.id, b as unknown as Block); };
    add(doc.rows ?? []);
    if (doc.zones) for (const z of doc.zones) add(z.rows);
    return m;
  };

  // A debounced sender for one block: typing shows instantly (native CE); we only sync
  // to the Studio after a pause (update) or on blur (commit) — no per-keystroke churn.
  const makeSender = (id: string, serialize: () => Record<string, unknown>) => {
    let timer = 0, composing = false;
    return {
      composing: (v: boolean) => { composing = v; },
      update: () => { if (composing) return; clearTimeout(timer); timer = window.setTimeout(() => opts.post({ type: "glanceos:edit", id, patch: serialize(), phase: "update" }), 600); },
      commit: () => { clearTimeout(timer); opts.post({ type: "glanceos:edit", id, patch: serialize(), phase: "commit" }); },
    };
  };

  const markEditable = (node: HTMLElement): void => {
    node.setAttribute("contenteditable", "plaintext-only"); // plaintext = no markup injection (we read textContent)
    node.spellcheck = false;
    node.classList.add("glance-editable");
  };

  // Every editable text field for a block type = its SINGLE primary (if any) + any EXTRA
  // fields. One unified list so single- and multi-field blocks share the click/wire path.
  const editFields = (type: string): { sel: string; prop: string; singleLine?: boolean; strip?: boolean }[] => {
    const out: { sel: string; prop: string; singleLine?: boolean; strip?: boolean }[] = [];
    const sg = SINGLE[type];
    if (sg) out.push({ sel: sg.sel, prop: sg.prop, strip: sg.strip, singleLine: SINGLE_LINE.has(type) });
    if (EXTRA[type]) out.push(...EXTRA[type]);
    return out;
  };

  // nearest node to a click (2-D), for "click anywhere in the block → caret in the closest field".
  const nearest2D = (nodes: HTMLElement[], x: number, y: number): HTMLElement | null => {
    const d2 = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return (r.left + r.width / 2 - x) ** 2 + (r.top + r.height / 2 - y) ** 2; };
    return nodes.reduce<HTMLElement | null>((best, n) => (!best || d2(n) < d2(best) ? n : best), null);
  };

  // A dimmed, non-editable "+ …" ghost appended to a list so adding an item is discoverable
  // (not just an Enter you have to know about). Styled inline — edit.ts is a Studio-only
  // chunk, never shipped to real screens, so this costs the runtime gzip budget nothing.
  const makeAddItem = (label: string, onAdd: () => void): HTMLElement => {
    const add = document.createElement("div");
    add.className = "gl-additem";
    add.textContent = `+ ${label}`;
    add.style.cssText = "opacity:.4;cursor:pointer;font-size:.82em;padding:3px 0;user-select:none;";
    add.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); onAdd(); });
    add.addEventListener("pointerenter", () => { add.style.opacity = ".7"; });
    add.addEventListener("pointerleave", () => { add.style.opacity = ".4"; });
    return add;
  };

  // ---- single-text blocks ----
  const wireText = (id: string, node: HTMLElement, prop: string, singleLine: boolean, strip?: boolean): void => {
    const w = node as HTMLElement & { _glw?: boolean };
    if (w._glw) return; w._glw = true;
    markEditable(node);
    const s = makeSender(id, () => ({ [prop]: strip ? stripQuotes(node.textContent ?? "") : (node.textContent ?? "") }));
    node.addEventListener("compositionstart", () => s.composing(true));
    node.addEventListener("compositionend", () => { s.composing(false); s.update(); });
    node.addEventListener("focus", () => { editing.add(id); opts.post({ type: "glanceos:focus", id }); });
    node.addEventListener("input", () => s.update());
    node.addEventListener("blur", () => { editing.delete(id); s.commit(); });
    node.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && singleLine) { e.preventDefault(); node.blur(); }
      if (e.key === "Escape") node.blur();
    });
  };

  // ---- lists (bulletList/numberedList/checklist/steps) ----
  const wireList = (id: string, cell: HTMLElement, type: string): void => {
    const cfg = LIST_CFG[type];
    if (!cfg) return;
    const container = cell.querySelector<HTMLElement>(cfg.container);
    const cw = container as (HTMLElement & { _glw?: boolean }) | null;
    if (!cw || cw._glw) return; cw._glw = true;
    const items = () => [...cw.querySelectorAll<HTMLElement>("." + cfg.text)];
    const serialize = (): Record<string, unknown> => ({
      items: items().map((t) => (cfg.check && t.classList.contains("li-done") ? "x " : "") + (t.textContent ?? "")).join("\n"),
    });
    const s = makeSender(id, serialize);
    const renumber = () => { if (type === "numberedList" || type === "steps") items().forEach((t, i) => { const m = t.closest("." + cfg.row)?.querySelector("." + cfg.marker); if (m) m.textContent = cfg.mark(i); }); };
    const makeRow = (text: string): HTMLElement => {
      const row = cw.ownerDocument.createElement("div");
      row.className = cfg.row;
      const marker = cw.ownerDocument.createElement("div");
      marker.className = cfg.marker;
      if (cfg.check) { marker.innerHTML = CHECK_OFF; marker.style.cursor = "pointer"; } else marker.textContent = cfg.mark(0);
      const t = cw.ownerDocument.createElement("div");
      t.className = cfg.text; t.textContent = text;
      row.append(marker, t);
      wireItem(t);
      return row;
    };
    const wireItem = (t: HTMLElement): void => {
      const tw = t as HTMLElement & { _glw?: boolean };
      if (tw._glw) return; tw._glw = true;
      markEditable(t);
      t.addEventListener("focus", () => { editing.add(id); opts.post({ type: "glanceos:focus", id }); });
      t.addEventListener("input", () => s.update());
      t.addEventListener("blur", () => { window.setTimeout(() => {
        const active = cw.ownerDocument.activeElement as HTMLElement | null;
        if (!active || !cw.contains(active)) { editing.delete(id); s.commit(); } // left the list entirely
      }, 0); });
      t.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          // Enter on a blank trailing row exits the list (Notion) instead of stacking empties.
          const liEl = t.closest("." + cfg.row), after = liEl?.nextElementSibling;
          if ((t.textContent ?? "") === "" && (!after || after.classList.contains("gl-additem"))) { t.blur(); return; }
          const off = caretOffset(t), txt = t.textContent ?? "";
          t.textContent = txt.slice(0, off);
          const row = makeRow(txt.slice(off));
          liEl?.after(row);
          renumber(); setCaret(row.querySelector<HTMLElement>("." + cfg.text)!, 0); s.update();
        } else if (e.key === "Backspace" && caretOffset(t) === 0) {
          const li = t.closest("." + cfg.row);
          const prev = li?.previousElementSibling;
          const prevT = prev?.querySelector<HTMLElement>("." + cfg.text);
          if (prevT && li) {
            e.preventDefault();
            const plen = (prevT.textContent ?? "").length;
            prevT.textContent = (prevT.textContent ?? "") + (t.textContent ?? "");
            li.remove(); renumber(); setCaret(prevT, plen); s.update();
          }
        } else if (e.key === "Escape") { t.blur(); }
      });
    };
    items().forEach(wireItem);
    // Checklist: tapping the box toggles done (so a to-do actually works in place).
    if (cfg.check) {
      cw.querySelectorAll<HTMLElement>("." + cfg.marker).forEach((m) => { m.style.cursor = "pointer"; });
      cw.addEventListener("pointerdown", (e) => {
        const marker = (e.target as HTMLElement)?.closest?.("." + cfg.marker);
        if (!marker) return;
        e.preventDefault();
        const t = marker.parentElement?.querySelector<HTMLElement>("." + cfg.text);
        if (!t) return;
        const done = t.classList.toggle("li-done");
        marker.innerHTML = done ? CHECK_ON : CHECK_OFF;
        editing.add(id); s.commit(); editing.delete(id);
      });
    }
    // An empty list is otherwise a dead block — give it one row to click into. The "+ add"
    // ghost makes adding discoverable (no need to know Enter splits a row).
    if (items().length === 0) cw.appendChild(makeRow(""));
    let ghost: HTMLElement;
    const addRow = () => { const row = makeRow(""); cw.insertBefore(row, ghost); renumber(); setCaret(row.querySelector<HTMLElement>("." + cfg.text)!, 0); s.update(); };
    ghost = makeAddItem(cfg.check ? "add task" : "add item", addRow);
    cw.appendChild(ghost);
  };

  // ---- two-column lists (keyValue/hours/menuList/timeline/faq/glossary/directory/wayfinding/statRow/peopleList/bookList) ----
  // Each row holds a key + value node; Enter on the key jumps to the value, Enter on the
  // value makes a new row, Backspace-at-start merges/removes. Serialized one row per line.
  const wireDuoList = (id: string, cell: HTMLElement, type: string): void => {
    const cfg = DUO_CFG[type];
    if (!cfg) return;
    const container = cell.querySelector<HTMLElement>(cfg.container);
    const cw = container as (HTMLElement & { _glw?: boolean }) | null;
    if (!cw || cw._glw) return; cw._glw = true;
    const sep = cfg.delim === ":" ? ": " : " | ";
    const rowClass = cfg.row.slice(1), keyClass = cfg.keySel.slice(1), valClass = cfg.valSel.slice(1);
    const rows = () => [...cw.querySelectorAll<HTMLElement>(cfg.row)].filter((r) => !r.classList.contains("gl-additem"));
    const serialize = (): Record<string, unknown> => ({
      [cfg.prop]: rows().map((r) => {
        const k = (r.querySelector<HTMLElement>(cfg.keySel)?.textContent ?? "").trim();
        const v = (r.querySelector<HTMLElement>(cfg.valSel)?.textContent ?? "").trim();
        return v ? `${k}${sep}${v}` : k;
      }).join("\n"),
    });
    const s = makeSender(id, serialize);
    // Clone an existing row (keeps dots/leaders) when one with both nodes exists, else build
    // a minimal row — the renderer restores full structure on the next repaint after blur.
    let template: HTMLElement | null = rows()[0] ?? null;
    if (template && !template.querySelector(cfg.valSel)) template = null;
    const minimalRow = (): HTMLElement => {
      const r = cw.ownerDocument.createElement("div"); r.className = rowClass;
      const k = cw.ownerDocument.createElement("div"); k.className = keyClass;
      const v = cw.ownerDocument.createElement("div"); v.className = valClass;
      r.append(k, v); return r;
    };
    const blankClone = (tmpl: HTMLElement): HTMLElement => {
      const c = tmpl.cloneNode(true) as HTMLElement;
      const k = c.querySelector<HTMLElement>(cfg.keySel), v = c.querySelector<HTMLElement>(cfg.valSel);
      if (k) k.textContent = ""; if (v) v.textContent = "";
      return c;
    };
    let ghost: HTMLElement;
    const wireNode = (n: HTMLElement, isKey: boolean): void => {
      const nw = n as HTMLElement & { _glw?: boolean };
      if (nw._glw) return; nw._glw = true;
      markEditable(n);
      n.addEventListener("focus", () => { editing.add(id); opts.post({ type: "glanceos:focus", id }); });
      n.addEventListener("input", () => s.update());
      n.addEventListener("blur", () => { window.setTimeout(() => {
        const active = cw.ownerDocument.activeElement as HTMLElement | null;
        if (!active || !cw.contains(active)) { editing.delete(id); s.commit(); }
      }, 0); });
      n.addEventListener("keydown", (e) => {
        e.stopPropagation();
        const row = n.closest(cfg.row) as HTMLElement | null;
        if (e.key === "Escape") { n.blur(); return; }
        if (e.key === "Enter") {
          e.preventDefault();
          const v = row?.querySelector<HTMLElement>(cfg.valSel);
          if (isKey && v) { setCaret(v, (v.textContent ?? "").length); return; } // key → value
          const k = row?.querySelector<HTMLElement>(cfg.keySel);
          const empty = !(k?.textContent ?? "").trim() && !(v?.textContent ?? "").trim();
          const after = row?.nextElementSibling;
          if (empty && (!after || after.classList.contains("gl-additem"))) { n.blur(); return; } // exit on blank trailing row
          addRow(row ?? undefined);
        } else if (e.key === "Backspace" && caretOffset(n) === 0) {
          if (!isKey) { const k = row?.querySelector<HTMLElement>(cfg.keySel); if (k) { e.preventDefault(); setCaret(k, (k.textContent ?? "").length); } return; }
          const k = row?.querySelector<HTMLElement>(cfg.keySel), v = row?.querySelector<HTMLElement>(cfg.valSel);
          if (!(k?.textContent ?? "") && !(v?.textContent ?? "").trim()) {
            const prev = row?.previousElementSibling as HTMLElement | null;
            if (prev && !prev.classList.contains("gl-additem")) {
              e.preventDefault();
              const pv = prev.querySelector<HTMLElement>(cfg.valSel) ?? prev.querySelector<HTMLElement>(cfg.keySel);
              row?.remove(); if (pv) setCaret(pv, (pv.textContent ?? "").length); s.update();
            }
          }
        }
      });
    };
    const wireRow = (r: HTMLElement): void => {
      const k = r.querySelector<HTMLElement>(cfg.keySel), v = r.querySelector<HTMLElement>(cfg.valSel);
      if (k) wireNode(k, true);
      if (v) wireNode(v, false);
    };
    const makeRow = (): HTMLElement => { const r = template ? blankClone(template) : minimalRow(); wireRow(r); return r; };
    const addRow = (afterRow?: HTMLElement): void => {
      const r = makeRow();
      if (afterRow) afterRow.after(r); else cw.insertBefore(r, ghost);
      const k = r.querySelector<HTMLElement>(cfg.keySel); if (k) setCaret(k, 0);
      s.update();
    };
    rows().forEach(wireRow);
    if (rows().length === 0) { const r = makeRow(); cw.appendChild(r); template = r; }
    ghost = makeAddItem("add row", () => addRow());
    cw.appendChild(ghost);
  };

  // ---- tables ----
  // Each th/td edits in place; serialize back to the renderer's `content` format (cells
  // joined by ", ", rows by "\n"). Enter in the last cell grows the table by a row.
  const tableSerialize = (container: HTMLElement): Record<string, unknown> => ({
    content: [...container.querySelectorAll("tr")]
      .map((tr) => [...tr.querySelectorAll<HTMLElement>("th,td")].map((c) => (c.textContent ?? "").trim()).join(", "))
      .join("\n"),
  });
  const wireTable = (id: string, cellEl: HTMLElement): void => {
    const container = cellEl.querySelector<HTMLElement>(".data-table");
    const cw = container as (HTMLElement & { _glw?: boolean }) | null;
    if (!cw || cw._glw) return; cw._glw = true;
    const s = makeSender(id, () => tableSerialize(cw));
    const cells = () => [...cw.querySelectorAll<HTMLElement>("th,td")];
    const wireC = (c: HTMLElement): void => {
      const cc = c as HTMLElement & { _glw?: boolean };
      if (cc._glw) return; cc._glw = true;
      markEditable(c);
      c.addEventListener("focus", () => { editing.add(id); opts.post({ type: "glanceos:focus", id }); });
      c.addEventListener("input", () => s.update());
      c.addEventListener("blur", () => { window.setTimeout(() => {
        const active = cw.ownerDocument.activeElement as HTMLElement | null;
        if (!active || !cw.contains(active)) { editing.delete(id); s.commit(); }
      }, 0); });
      c.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") { c.blur(); return; }
        if (e.key === "Enter") {
          e.preventDefault();
          const all = cells();
          if (all[all.length - 1] === c) {
            const rows = [...cw.querySelectorAll("tr")];
            const lastRow = rows[rows.length - 1]!;
            const cols = lastRow.querySelectorAll("th,td").length;
            const tr = cw.ownerDocument.createElement("tr");
            for (let i = 0; i < cols; i++) { const td = cw.ownerDocument.createElement("td"); tr.appendChild(td); wireC(td); }
            lastRow.after(tr);
            setCaret(tr.querySelector<HTMLElement>("td")!, 0); s.update();
          } else {
            const next = all[all.indexOf(c) + 1];
            if (next) setCaret(next, (next.textContent ?? "").length);
          }
        }
      });
    };
    cells().forEach(wireC);
  };

  // Make the WHOLE cell behave like one text field (Notion): I-beam everywhere on the
  // block, and a click anywhere inside drops the caret into its text — even when you hit
  // the padding around the words. This is what kills the cursor flicker: instead of the
  // caret living only on a tiny text node (I-beam over the word, arrow over the gap), the
  // entire block owns a single, stable text cursor, here INSIDE the iframe where the text
  // actually lives — not fought over by an overlay in the parent document.
  const wireCellFocus = (id: string, cellEl: HTMLElement, type: string): void => {
    const c = cellEl as HTMLElement & { _glcf?: boolean };
    cellEl.style.cursor = "text";
    cellEl.classList.add("glance-editcell");
    if (c._glcf) return; c._glcf = true;
    cellEl.addEventListener("pointerdown", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest(".glance-editable")) return; // hit the text itself → native caret placement
      if (t.closest(".gl-additem")) return; // the "+ add" ghost owns its click
      const cfg = LIST_CFG[type];
      const dcfg = DUO_CFG[type];
      if (cfg && t.closest("." + cfg.marker)) return; // checkbox toggle owns its click
      let node: HTMLElement | null = null;
      if (cfg) {
        // focus the list item nearest the click's vertical position
        const its = [...cellEl.querySelectorAll<HTMLElement>("." + cfg.text)];
        node = its.reduce<HTMLElement | null>((best, it) => {
          if (!best) return it;
          const a = it.getBoundingClientRect(), b = best.getBoundingClientRect();
          return Math.abs(a.top + a.height / 2 - e.clientY) < Math.abs(b.top + b.height / 2 - e.clientY) ? it : best;
        }, null);
      } else if (dcfg) {
        // focus the key/value node nearest the click (2-D)
        node = nearest2D([...cellEl.querySelectorAll<HTMLElement>(dcfg.keySel + "," + dcfg.valSel)], e.clientX, e.clientY);
      } else if (type === "table") {
        // focus the table cell nearest the click (2-D)
        node = nearest2D([...cellEl.querySelectorAll<HTMLElement>("th,td")], e.clientX, e.clientY);
      } else {
        // single- or multi-field block → caret in the nearest editable field
        const cands = editFields(type).map((f) => cellEl.querySelector<HTMLElement>(f.sel)).filter((n): n is HTMLElement => !!n);
        node = cands.length <= 1 ? (cands[0] ?? null) : nearest2D(cands, e.clientX, e.clientY);
      }
      if (!node) return;
      e.preventDefault();
      placeCaretFromPoint(node, e.clientX, e.clientY);
    });
  };

  // After each render, (re)attach editing to every editable, unbound block. Cells locked
  // for editing are never repainted, so their wired nodes persist (caret stays put).
  const refresh = (): void => {
    const byId = blocksById();
    for (const [id, cell] of getCells()) {
      const cellEl = cell.el as HTMLElement;
      const block = byId.get(id);
      const fields = block ? editFields(block.type) : [];
      const editable =
        !!block && !block.source &&
        (block.type === "table" || !!LIST_CFG[block.type] || !!DUO_CFG[block.type] ||
          (fields.length > 0 && !(block.type === "text" && (block.props as { format?: string }).format === "markdown")));
      if (!editable) { cellEl.style.cursor = ""; cellEl.classList.remove("glance-editcell"); continue; }
      wireCellFocus(id, cellEl, block!.type);
      if (block!.type === "table") { wireTable(id, cellEl); continue; }
      if (LIST_CFG[block!.type]) { wireList(id, cellEl, block!.type); continue; }
      if (DUO_CFG[block!.type]) { wireDuoList(id, cellEl, block!.type); continue; }
      for (const f of fields) { const node = cellEl.querySelector<HTMLElement>(f.sel); if (node) wireText(id, node, f.prop, !!f.singleLine, f.strip); }
    }
  };

  return { refresh };
}
