// v10 multi-page authoring. A board is `rows` (page 1) plus optional extra `pages`
// (page 2…N). The top tab strip switches which page you edit (the lens in studio.tsx)
// and adds pages; the gear opens a floating per-page settings popover — the SAME
// DraggablePanel card the block Options / Live-data use, so it never covers the canvas
// as a form-dump. Whole-board rotation (default dwell + transition) lives in Board
// settings. Every edit is a plain whole-doc change routed through commitDoc.
import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import type { LayoutT, PageSettingT, RowT } from "@glanceos/schema";
import { newWidgetId } from "./blocks";
import { Icon } from "./icons";
import { DraggablePanel } from "./DraggablePanel";

const MAX_PAGES = 9; // schema: rows + up to 8 extra pages

type PageSchedule = NonNullable<PageSettingT["schedule"]>;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // bit i = Date.getDay() (0 = Sunday)
const DAY_TITLES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// rows of the page at order index i (0 = base `rows`, else pages[i-1]).
function rowsAt(doc: LayoutT, i: number): RowT[] {
  return i === 0 ? doc.rows : (doc.pages?.[i - 1] ?? []);
}
function settingsAt(doc: LayoutT, i: number): PageSettingT | undefined {
  return doc.pageSettings?.[i];
}
function pageLabel(doc: LayoutT, i: number): string {
  return settingsAt(doc, i)?.name?.trim() || `Page ${i + 1}`;
}
// One-line tooltip describing a tab (name · base? · dwell · scheduled).
function pageTitle(doc: LayoutT, i: number): string {
  const s = settingsAt(doc, i);
  const bits: string[] = [pageLabel(doc, i)];
  if (i === 0) bits.push("base page");
  if (typeof s?.seconds === "number") bits.push(`${s.seconds}s`);
  if (s?.schedule && Object.keys(s.schedule).length) bits.push("scheduled");
  return bits.join(" · ");
}
// Deep-clone a page's rows with fresh ids so block names/ids stay unique board-wide.
function cloneRows(rows: RowT[]): RowT[] {
  return structuredClone(rows).map((r) => ({ ...r, id: newWidgetId(), blocks: r.blocks.map((b) => ({ ...b, id: newWidgetId(), name: undefined })) }));
}
// Drop empty trailing structure so a board with no extras serialises exactly as before.
function normalize(d: LayoutT): LayoutT {
  if (d.pages && d.pages.length === 0) d.pages = undefined;
  if (d.pageSettings) {
    const used = d.pageSettings.some((s) => s && Object.keys(s).length > 0);
    if (!used || !d.pages) d.pageSettings = d.pages ? d.pageSettings : undefined;
    if (d.pageSettings && d.pageSettings.every((s) => !s || Object.keys(s).length === 0)) d.pageSettings = undefined;
  }
  return d;
}
// Mutate pageSettings[i] in a fresh doc, padding the array as needed.
function patchSettings(doc: LayoutT, i: number, patch: Partial<PageSettingT>): LayoutT {
  const d = structuredClone(doc);
  const arr: (PageSettingT | undefined)[] = d.pageSettings ? [...d.pageSettings] : [];
  while (arr.length <= i) arr.push(undefined);
  const cur = arr[i] ?? {};
  const next: PageSettingT = { ...cur, ...patch };
  // strip empty schedule / undefined fields so we don't persist noise
  if (next.schedule && Object.keys(next.schedule).length === 0) delete next.schedule;
  if (next.name === "") delete next.name;
  arr[i] = Object.keys(next).length ? next : undefined;
  d.pageSettings = arr as PageSettingT[];
  return normalize(d);
}
function patchSchedule(doc: LayoutT, i: number, patch: Partial<PageSchedule>): LayoutT {
  const cur = settingsAt(doc, i)?.schedule ?? {};
  const sched: PageSchedule = { ...cur, ...patch };
  for (const k of Object.keys(sched) as (keyof PageSchedule)[]) if (sched[k] == null) delete sched[k];
  return patchSettings(doc, i, { schedule: Object.keys(sched).length ? sched : undefined });
}

const minToTime = (m: number | undefined): string => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
const timeToMin = (t: string): number | undefined => { const m = /^(\d{2}):(\d{2})$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : undefined; };

export function PagesStrip({ doc, activePage, setActivePage, commitDoc }: {
  doc: LayoutT;
  activePage: number;
  setActivePage: (n: number) => void;
  commitDoc: (doc: LayoutT) => void;
}) {
  const [settingsFor, setSettingsFor] = useState<number | null>(null); // page whose popover is open (null = closed)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // popover spawn point (viewport coords)
  const [dragFrom, setDragFrom] = useState<number | null>(null); // order index being dragged (≥1)
  const [dragOver, setDragOver] = useState<number | null>(null); // order index hovered while dragging
  const tabsRef = useRef<HTMLDivElement>(null);
  const total = (doc.pages?.length ?? 0) + 1;
  const idx = Math.min(activePage, total - 1);

  const addPage = () => {
    if (total >= MAX_PAGES) return;
    const d = structuredClone(doc);
    d.pages = [...(d.pages ?? []), []]; // a fresh empty page — switch to it to fill in
    commitDoc(normalize(d));
    setActivePage((doc.pages?.length ?? 0) + 1);
  };
  const duplicatePage = (i: number) => {
    if (total >= MAX_PAGES) return;
    const d = structuredClone(doc);
    const clone = cloneRows(rowsAt(doc, i));
    const pages = [...(d.pages ?? [])];
    pages.splice(i, 0, clone); // 0 → front of pages; i → right after order-index i
    d.pages = pages;
    if (d.pageSettings) { const ps = [...d.pageSettings]; ps.splice(i + 1, 0, settingsAt(doc, i) ? structuredClone(settingsAt(doc, i)!) : undefined as unknown as PageSettingT); d.pageSettings = ps; }
    commitDoc(normalize(d));
    setActivePage(i + 1);
  };
  const deletePage = (i: number) => {
    if (i === 0 || !doc.pages?.length) return; // page 1 (base rows) can't be removed
    const d = structuredClone(doc);
    d.pages = d.pages!.filter((_, k) => k !== i - 1);
    if (d.pageSettings) d.pageSettings = d.pageSettings.filter((_, k) => k !== i);
    commitDoc(normalize(d));
    setActivePage(Math.max(0, i - 1));
  };
  const movePage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (i < 1 || j < 1 || j > total - 1 || !doc.pages?.length) return; // only extras (≥1) reorder, base stays first
    const d = structuredClone(doc);
    const p = [...d.pages!];
    [p[i - 1], p[j - 1]] = [p[j - 1]!, p[i - 1]!];
    d.pages = p;
    if (d.pageSettings) { const ps = [...d.pageSettings]; while (ps.length <= Math.max(i, j)) ps.push(undefined as unknown as PageSettingT); [ps[i], ps[j]] = [ps[j]!, ps[i]!]; d.pageSettings = ps; }
    commitDoc(normalize(d));
    setActivePage(j);
  };

  // Move an extra page (order index ≥1) to another position by drag-and-drop. The base
  // page (0) is fixed and never a drag source or target.
  const reorderPage = (from: number, to: number) => {
    if (from < 1 || to < 1 || from === to || !doc.pages?.length) return;
    const d = structuredClone(doc);
    const p = [...d.pages!];
    const [moved] = p.splice(from - 1, 1);
    p.splice(to - 1, 0, moved!);
    d.pages = p;
    if (d.pageSettings) {
      const ps = [...d.pageSettings];
      while (ps.length <= Math.max(from, to)) ps.push(undefined as unknown as PageSettingT);
      const [movedS] = ps.splice(from, 1);
      ps.splice(to, 0, movedS!);
      d.pageSettings = ps;
    }
    commitDoc(normalize(d));
    setActivePage(to);
  };

  const openSettings = (i: number, anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    setPos({ x: r.left, y: r.bottom + 6 }); // just below the clicked control; DraggablePanel clamps to viewport
    setActivePage(i); // editing context follows the page being configured
    setSettingsFor(i);
  };
  const closeSettings = () => setSettingsFor(null);

  // keep the active tab visible in the horizontal scroller (up to 9 pages)
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>(`.page-tab[data-page="${idx}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [idx]);

  return (
    <div class="pages-strip">
      <div class="pages-tabs" role="tablist" aria-label="Board pages" ref={tabsRef}>
        {Array.from({ length: total }, (_, i) => {
          const s = settingsAt(doc, i);
          const scheduled = !!s?.schedule && Object.keys(s.schedule).length > 0;
          const customDwell = typeof s?.seconds === "number";
          return (
            <button
              key={i}
              role="tab"
              aria-selected={i === idx}
              data-page={i}
              class={`page-tab${i === idx ? " on" : ""}${dragFrom === i ? " dragging" : ""}${dragOver === i && dragFrom !== null && dragFrom !== i ? " drag-over" : ""}`}
              title={pageTitle(doc, i)}
              draggable={i !== 0}
              onClick={() => { setActivePage(i); if (settingsFor !== null) setSettingsFor(i); }}
              onDblClick={(e) => openSettings(i, e.currentTarget as HTMLElement)}
              onDragStart={(e) => { if (i === 0) { e.preventDefault(); return; } setDragFrom(i); try { (e as unknown as DragEvent).dataTransfer?.setData("text/plain", String(i)); } catch { /* jsdom */ } }}
              onDragOver={(e) => { if (dragFrom !== null && i !== 0) { e.preventDefault(); if (dragOver !== i) setDragOver(i); } }}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && i !== 0) reorderPage(dragFrom, i); setDragFrom(null); setDragOver(null); }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            >
              {i === 0 && <span class="page-tab-base">Base</span>}
              <span class="page-tab-name">{pageLabel(doc, i)}</span>
              {(scheduled || customDwell) && <PageGlyph scheduled={scheduled} customDwell={customDwell} />}
            </button>
          );
        })}
        {total < MAX_PAGES && (
          <button class="page-add" title="Add a page" onClick={addPage}><Icon.plus /> Page</button>
        )}
        <button
          class={`page-cog${settingsFor !== null ? " on" : ""}`}
          title="Page settings"
          aria-expanded={settingsFor !== null}
          aria-haspopup="dialog"
          onClick={(e) => (settingsFor === null ? openSettings(idx, e.currentTarget as HTMLElement) : closeSettings())}
        >
          <Icon.settings />
        </button>
      </div>

      {settingsFor !== null && pos && createPortal(
        <PagesPopover
          key={`pg-${settingsFor}`}
          index={settingsFor}
          x={pos.x}
          y={pos.y}
          doc={doc}
          total={total}
          commitDoc={commitDoc}
          onClose={closeSettings}
          duplicatePage={duplicatePage}
          deletePage={deletePage}
          movePage={movePage}
        />,
        document.body,
      )}
    </div>
  );
}

// A tiny, cheap status glyph on a tab — derived ONLY from settingsAt(doc,i) (no geometry
// walk, no iframe): a 7-stripe "week" mark when a schedule exists + a ring-dot for a
// custom dwell. Both are pure CSS so they invert in dark mode for free.
function PageGlyph({ scheduled, customDwell }: { scheduled: boolean; customDwell: boolean }) {
  return (
    <span class="page-glyph" aria-hidden="true">
      {scheduled && <span class="pg-cal" />}
      {customDwell && <span class="pg-dwell" />}
    </span>
  );
}

// Per-page settings, in the shared floating DraggablePanel. Grouped Identity / Timing /
// Schedule; whole-board rotation lives in Board settings, not here.
function PagesPopover({ index, x, y, doc, total, commitDoc, onClose, duplicatePage, deletePage, movePage }: {
  index: number;
  x: number;
  y: number;
  doc: LayoutT;
  total: number;
  commitDoc: (doc: LayoutT) => void;
  onClose: () => void;
  duplicatePage: (i: number) => void;
  deletePage: (i: number) => void;
  movePage: (i: number, dir: -1 | 1) => void;
}) {
  const s = settingsAt(doc, index);
  const sched = s?.schedule;
  const defaultSecs = typeof doc.pageRotateSeconds === "number" ? doc.pageRotateSeconds : undefined;
  const daysMask = sched?.daysMask;
  const dayOn = (b: number): boolean => (daysMask == null ? true : ((daysMask >> b) & 1) === 1);
  const toggleDay = (b: number) => {
    const base = daysMask == null ? 127 : daysMask;
    const next = base ^ (1 << b);
    commitDoc(patchSchedule(doc, index, { daysMask: next === 127 ? undefined : next })); // 127 (all days) ≡ no constraint
  };
  const empty = rowsAt(doc, index).every((r) => r.blocks.length === 0);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []); // land on the most-edited field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <DraggablePanel x={x} y={y} title={pageLabel(doc, index)} onClose={onClose}>
      <div class="pages-pop" role="dialog" aria-label={`Settings for ${pageLabel(doc, index)}`}>
        <div class="pages-panel-head">
          {index === 0 && <span class="page-base-tag">Base</span>}
          <span class="grow" />
          <button class="ghost sm" title="Move earlier" disabled={index < 2} onClick={() => movePage(index, -1)}>↑</button>
          <button class="ghost sm" title="Move later" disabled={index === 0 || index >= total - 1} onClick={() => movePage(index, 1)}>↓</button>
          <button class="ghost sm" title="Duplicate this page" disabled={total >= MAX_PAGES} onClick={() => duplicatePage(index)}><Icon.copy /></button>
          <button class="ghost sm danger" title="Delete this page" disabled={index === 0} onClick={() => { deletePage(index); onClose(); }}><Icon.trash /></button>
        </div>
        {index === 0 && <p class="muted hint">The base page can’t be moved or deleted — it always shows first.</p>}
        {empty && index !== 0 && <p class="muted hint">This page is empty — add blocks, or it’s skipped in rotation.</p>}

        <p class="muted section-label">Identity</p>
        <label class="field">
          <span>Page name</span>
          <input ref={nameRef} type="text" value={s?.name ?? ""} placeholder={`Page ${index + 1}`} maxLength={60}
            onInput={(e) => commitDoc(patchSettings(doc, index, { name: (e.target as HTMLInputElement).value }))} />
        </label>

        <p class="muted section-label">Timing</p>
        <label class="field">
          <span>Show for</span>
          <span class="row gap">
            <input type="number" min={1} max={3600} class="num" value={s?.seconds ?? ""} placeholder={String(defaultSecs ?? 10)}
              onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); commitDoc(patchSettings(doc, index, { seconds: Number.isFinite(v) && v >= 1 ? Math.min(3600, Math.floor(v)) : undefined })); }} />
            <span class="muted">seconds {s?.seconds == null && <em>(default)</em>}</span>
          </span>
        </label>

        <p class="muted section-label">Schedule <span class="muted">— optional</span></p>
        <div class="field">
          <span>Show on days</span>
          <div class="day-chips">
            {DAY_LABELS.map((d, b) => (
              <button key={b} type="button" title={DAY_TITLES[b]} class={`day-chip${dayOn(b) ? " on" : ""}`} aria-pressed={dayOn(b)} onClick={() => toggleDay(b)}>{d}</button>
            ))}
          </div>
        </div>
        <div class="field">
          <span>Time window <span class="muted">(device’s local time)</span></span>
          <span class="row gap">
            <input type="time" value={minToTime(sched?.startMin)} onInput={(e) => commitDoc(patchSchedule(doc, index, { startMin: timeToMin((e.target as HTMLInputElement).value) }))} />
            <span class="muted">to</span>
            <input type="time" value={minToTime(sched?.endMin)} onInput={(e) => commitDoc(patchSchedule(doc, index, { endMin: timeToMin((e.target as HTMLInputElement).value) }))} />
            {(sched?.startMin != null || sched?.endMin != null) && (
              <button class="ghost sm" title="Clear time window" onClick={() => commitDoc(patchSchedule(doc, index, { startMin: undefined, endMin: undefined }))}><Icon.x /></button>
            )}
          </span>
        </div>
        <div class="field">
          <span>Date range</span>
          <span class="row gap">
            <input type="date" value={sched?.fromDate ?? ""} onInput={(e) => commitDoc(patchSchedule(doc, index, { fromDate: (e.target as HTMLInputElement).value || undefined }))} />
            <span class="muted">to</span>
            <input type="date" value={sched?.toDate ?? ""} onInput={(e) => commitDoc(patchSchedule(doc, index, { toDate: (e.target as HTMLInputElement).value || undefined }))} />
            {(sched?.fromDate || sched?.toDate) && (
              <button class="ghost sm" title="Clear date range" onClick={() => commitDoc(patchSchedule(doc, index, { fromDate: undefined, toDate: undefined }))}><Icon.x /></button>
            )}
          </span>
        </div>
      </div>
    </DraggablePanel>
  );
}
