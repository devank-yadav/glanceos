import type { LayoutT } from "@glanceos/schema";
import { getCells, setEditingLock } from "./render";

// v8.0 — true in-place editing. Loaded ONLY by the Studio preview (dynamic import in
// main.ts, gated on the `edit` flag), so it NEVER ships to real screens. It makes the
// block's ACTUAL rendered text element contentEditable and posts each change back to the
// Studio, which writes it through its normal stageEdit/undo/autosave path. Zod-free.

interface Block { id: string; type: string; props: Record<string, unknown>; source?: unknown }

// Single editable text node per block type → { selector within the cell, prop key }.
// Mirrors the renderers in widgets.ts (verified). Reconstructed/quote-mark/list/table
// blocks are handled in a later pass — they're simply not in this map yet (still editable
// via the side panel). Bound blocks (block.source set) are read-only here regardless.
const SINGLE: Record<string, { sel: string; prop: string }> = {
  text: { sel: ".text-content", prop: "content" }, // plain only; markdown skipped at runtime
  heading: { sel: ".heading", prop: "content" },
  subheading: { sel: ".subheading", prop: "content" },
  label: { sel: ".eyebrow", prop: "content" },
  callout: { sel: ".callout-content", prop: "content" },
  banner: { sel: ".banner-text", prop: "content" },
  code: { sel: ".code-block", prop: "content" },
  lead: { sel: ".lead", prop: "content" },
  ticker: { sel: ".ticker", prop: "content" },
  highlight: { sel: ".highlight", prop: "content" },
  aside: { sel: ".aside", prop: "content" },
  mantra: { sel: ".mantra", prop: "content" },
  epigraph: { sel: ".epigraph-text", prop: "content" },
  postscript: { sel: ".ps-text", prop: "content" },
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
  todaySpecial: { sel: ".ts-title", prop: "title" },
  welcomeSign: { sel: ".welcome-name", prop: "name" },
  priceTag: { sel: ".pt-item", prop: "item" },
  phoneNumber: { sel: ".phone", prop: "number" },
  socialHandle: { sel: ".social-handle", prop: "handle" },
  // value-bearing (skip when bound to a live source — handled below)
  stat: { sel: ".stat-value", prop: "value" },
  metric: { sel: ".metric-value", prop: "value" },
  bigNumber: { sel: ".stat-value", prop: "value" },
};

// Types that never hold their own newline — Enter commits + blurs instead of inserting one.
const SINGLE_LINE = new Set(["heading", "subheading", "label", "banner", "stat", "badge", "nameTag", "numberedHeading", "kicker", "ticker", "mantra", "logoText"]);

export interface EditLayer { refresh(): void }

export function createEditLayer(opts: { post: (m: unknown) => void; getDoc: () => LayoutT | null }): EditLayer {
  // The lock the renderer reads to skip repainting a cell mid-edit (caret safety).
  const editing = new Set<string>();
  setEditingLock(editing);

  // The Studio overlay is now click-through, so a click on empty board area lands here
  // (not on the overlay) — tell the Studio to deselect. Clicks on editable text are
  // ignored (their own focus handler selects); clicks on non-editable blocks are caught
  // by the overlay in the parent, so they never reach this document.
  document.addEventListener("pointerdown", (e) => {
    if (!(e.target as HTMLElement)?.closest?.(".glance-editable")) opts.post({ type: "glanceos:focus", id: null });
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

  const wire = (id: string, node: HTMLElement, prop: string, singleLine: boolean): void => {
    const w = node as HTMLElement & { _glwired?: boolean };
    if (w._glwired) return; // already contentEditable + listening
    w._glwired = true;
    // plaintext-only blocks rich-paste markup (we read textContent only). setAttribute
    // (not the IDL prop) reflects reliably across the Studio's Chromium + jsdom tests.
    node.setAttribute("contenteditable", "plaintext-only");
    node.spellcheck = false;
    node.classList.add("glance-editable");
    let composing = false;
    const emit = (phase: "update" | "commit") => {
      if (composing && phase === "update") return; // mid-IME: wait for compositionend
      opts.post({ type: "glanceos:edit", id, patch: { [prop]: node.textContent ?? "" }, phase });
    };
    node.addEventListener("compositionstart", () => { composing = true; });
    node.addEventListener("compositionend", () => { composing = false; emit("update"); });
    node.addEventListener("focus", () => { editing.add(id); opts.post({ type: "glanceos:focus", id }); });
    node.addEventListener("input", () => emit("update"));
    node.addEventListener("blur", () => { editing.delete(id); emit("commit"); });
    node.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && singleLine) { e.preventDefault(); node.blur(); }
      if (e.key === "Escape") node.blur();
    });
  };

  // After each render, (re)attach contentEditable to every editable, unbound text node.
  // Cells locked for editing are never repainted, so their wired node persists.
  const refresh = (): void => {
    const byId = blocksById();
    for (const [id, cell] of getCells()) {
      const block = byId.get(id);
      if (!block) continue;
      const map = SINGLE[block.type];
      if (!map) continue;
      if (block.source) continue; // bound to live data — editing the prop would be overwritten
      if (block.type === "text" && (block.props as { format?: string }).format === "markdown") continue;
      const node = (cell.el as HTMLElement).querySelector<HTMLElement>(map.sel);
      if (node) wire(id, node, map.prop, SINGLE_LINE.has(block.type));
    }
  };

  return { refresh };
}
