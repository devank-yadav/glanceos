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
  // value-bearing (skip when bound to a live source — handled below)
  stat: { sel: ".stat-value", prop: "value" },
  metric: { sel: ".metric-value", prop: "value" },
  bigNumber: { sel: ".stat-value", prop: "value" },
  moneyStat: { sel: ".money-amt", prop: "amount" },
  unitStat: { sel: ".us-val", prop: "value" },
};

// Types that never hold their own newline — Enter commits + blurs instead of inserting one.
const SINGLE_LINE = new Set(["heading", "subheading", "label", "banner", "stat", "badge", "nameTag", "numberedHeading", "kicker", "ticker", "mantra", "logoText", "phoneNumber", "socialHandle", "moneyStat", "unitStat", "eventBanner", "priceTag"]);

// Multi-item lists rendered as one item per line. Each shares a container + per-row
// structure so we can edit items in place: Enter = new item, Backspace-at-start = merge.
const LIST_CFG: Record<string, { container: string; row: string; marker: string; text: string; mark: (i: number) => string; check?: boolean }> = {
  bulletList: { container: ".list", row: "li", marker: "li-marker", text: "li-text", mark: () => "•" },
  numberedList: { container: ".list", row: "li", marker: "li-marker", text: "li-text", mark: (i) => `${i + 1}.` },
  checklist: { container: ".list", row: "li", marker: "li-marker", text: "li-text", mark: () => "", check: true },
  steps: { container: ".steps", row: "step-row", marker: "step-n", text: "step-t", mark: (i) => `${i + 1}` },
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

  // The Studio overlay is click-through, so a click on empty board area lands here —
  // tell the Studio to deselect. A click ANYWHERE inside an editable block keeps its
  // selection (the cell focus handler drops the caret into the text), so we only
  // deselect when the click misses every editable cell.
  document.addEventListener("pointerdown", (e) => {
    if (!(e.target as HTMLElement)?.closest?.(".glance-editcell")) opts.post({ type: "glanceos:focus", id: null });
  });

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
      if (cfg.check) marker.innerHTML = CHECK_OFF; else marker.textContent = cfg.mark(0);
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
          const off = caretOffset(t), txt = t.textContent ?? "";
          t.textContent = txt.slice(0, off);
          const row = makeRow(txt.slice(off));
          t.closest("." + cfg.row)?.after(row);
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
      const cfg = LIST_CFG[type];
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
      } else {
        const map = SINGLE[type];
        node = map ? cellEl.querySelector<HTMLElement>(map.sel) : null;
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
      const editable =
        !!block && !block.source &&
        (!!LIST_CFG[block.type] || (!!SINGLE[block.type] && !(block.type === "text" && (block.props as { format?: string }).format === "markdown")));
      if (!editable) { cellEl.style.cursor = ""; cellEl.classList.remove("glance-editcell"); continue; }
      wireCellFocus(id, cellEl, block!.type);
      if (LIST_CFG[block!.type]) { wireList(id, cellEl, block!.type); continue; }
      const map = SINGLE[block!.type]!;
      const node = cellEl.querySelector<HTMLElement>(map.sel);
      if (node) wireText(id, node, map.prop, SINGLE_LINE.has(block!.type), map.strip);
    }
  };

  return { refresh };
}
