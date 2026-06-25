// v10 multi-page authoring UI. The top tab strip switches which page you edit (the lens
// in studio.tsx), adds pages, and reorders them by drag; the gear opens a floating
// per-page settings popover — the SAME DraggablePanel card the block Options / Live-data
// use, so it never covers the canvas as a form-dump. Whole-board rotation (default dwell
// + transition) lives in Board settings. All page transforms are pure (./pageOps); these
// thin wrappers just route the result through commitDoc + setActivePage.
import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import type { LayoutT } from "@glanceos/schema";
import { Icon } from "./icons";
import { DraggablePanel } from "./DraggablePanel";
import * as ops from "./pageOps";
import { DAY_LABELS, DAY_TITLES, MAX_PAGES } from "./pageOps";

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
  const total = ops.totalPages(doc);
  const idx = Math.min(activePage, total - 1);

  const apply = (edit: ops.PageEdit | null) => { if (edit) { commitDoc(edit.doc); setActivePage(edit.active); } };
  const addPage = () => apply(ops.addPage(doc));
  const duplicatePage = (i: number) => apply(ops.duplicatePage(doc, i));
  const deletePage = (i: number) => apply(ops.deletePage(doc, i));
  const movePage = (i: number, dir: -1 | 1) => apply(ops.movePage(doc, i, dir));
  const reorderPage = (from: number, to: number) => apply(ops.reorderPage(doc, from, to));

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
          const s = ops.settingsAt(doc, i);
          const scheduled = !!s?.schedule && Object.keys(s.schedule).length > 0;
          const customDwell = typeof s?.seconds === "number";
          return (
            <button
              key={i}
              role="tab"
              aria-selected={i === idx}
              data-page={i}
              class={`page-tab${i === idx ? " on" : ""}${dragFrom === i ? " dragging" : ""}${dragOver === i && dragFrom !== null && dragFrom !== i ? " drag-over" : ""}`}
              title={ops.pageTitle(doc, i)}
              draggable={i !== 0}
              onClick={() => { setActivePage(i); if (settingsFor !== null) setSettingsFor(i); }}
              onDblClick={(e) => openSettings(i, e.currentTarget as HTMLElement)}
              onDragStart={(e) => { if (i === 0) { e.preventDefault(); return; } setDragFrom(i); try { (e as unknown as DragEvent).dataTransfer?.setData("text/plain", String(i)); } catch { /* jsdom */ } }}
              onDragOver={(e) => { if (dragFrom !== null && i !== 0) { e.preventDefault(); if (dragOver !== i) setDragOver(i); } }}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && i !== 0) reorderPage(dragFrom, i); setDragFrom(null); setDragOver(null); }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            >
              {i === 0 && <span class="page-tab-base">Base</span>}
              <span class="page-tab-name">{ops.pageLabel(doc, i)}</span>
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

// A tiny, cheap status glyph on a tab — derived ONLY from the page's settings (no geometry
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
  const s = ops.settingsAt(doc, index);
  const sched = s?.schedule;
  const defaultSecs = typeof doc.pageRotateSeconds === "number" ? doc.pageRotateSeconds : undefined;
  const daysMask = sched?.daysMask;
  const dayOn = (b: number): boolean => (daysMask == null ? true : ((daysMask >> b) & 1) === 1);
  const toggleDay = (b: number) => {
    const base = daysMask == null ? 127 : daysMask;
    const next = base ^ (1 << b);
    commitDoc(ops.patchSchedule(doc, index, { daysMask: next === 127 ? undefined : next })); // 127 (all days) ≡ no constraint
  };
  const empty = ops.rowsAt(doc, index).every((r) => r.blocks.length === 0);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []); // land on the most-edited field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <DraggablePanel x={x} y={y} title={ops.pageLabel(doc, index)} onClose={onClose}>
      <div class="pages-pop" role="dialog" aria-label={`Settings for ${ops.pageLabel(doc, index)}`}>
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
            onInput={(e) => commitDoc(ops.patchSettings(doc, index, { name: (e.target as HTMLInputElement).value }))} />
        </label>

        <p class="muted section-label">Timing</p>
        <label class="field">
          <span>Show for</span>
          <span class="row gap">
            <input type="number" min={1} max={3600} class="num" value={s?.seconds ?? ""} placeholder={String(defaultSecs ?? 10)}
              onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); commitDoc(ops.patchSettings(doc, index, { seconds: Number.isFinite(v) && v >= 1 ? Math.min(3600, Math.floor(v)) : undefined })); }} />
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
            <input type="time" value={ops.minToTime(sched?.startMin)} onInput={(e) => commitDoc(ops.patchSchedule(doc, index, { startMin: ops.timeToMin((e.target as HTMLInputElement).value) }))} />
            <span class="muted">to</span>
            <input type="time" value={ops.minToTime(sched?.endMin)} onInput={(e) => commitDoc(ops.patchSchedule(doc, index, { endMin: ops.timeToMin((e.target as HTMLInputElement).value) }))} />
            {(sched?.startMin != null || sched?.endMin != null) && (
              <button class="ghost sm" title="Clear time window" onClick={() => commitDoc(ops.patchSchedule(doc, index, { startMin: undefined, endMin: undefined }))}><Icon.x /></button>
            )}
          </span>
        </div>
        <div class="field">
          <span>Date range</span>
          <span class="row gap">
            <input type="date" value={sched?.fromDate ?? ""} onInput={(e) => commitDoc(ops.patchSchedule(doc, index, { fromDate: (e.target as HTMLInputElement).value || undefined }))} />
            <span class="muted">to</span>
            <input type="date" value={sched?.toDate ?? ""} onInput={(e) => commitDoc(ops.patchSchedule(doc, index, { toDate: (e.target as HTMLInputElement).value || undefined }))} />
            {(sched?.fromDate || sched?.toDate) && (
              <button class="ghost sm" title="Clear date range" onClick={() => commitDoc(ops.patchSchedule(doc, index, { fromDate: undefined, toDate: undefined }))}><Icon.x /></button>
            )}
          </span>
        </div>
      </div>
    </DraggablePanel>
  );
}
