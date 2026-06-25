// v10 multi-page authoring — the "Pages" section in the right sidebar. A draggable
// list of pages: drag a row to reorder, click it to edit that page (the lens in
// studio.tsx), open a row's gear for its settings (name · how long it shows · an
// optional schedule). All rotation/timing lives here: each page's "Show for" overrides
// the board-wide "Default dwell" at the bottom. Transforms are the pure ./pageOps
// helpers; this just routes them through commitDoc + setActivePage.
import { useState } from "preact/hooks";
import type { LayoutT } from "@glanceos/schema";
import { Icon } from "./icons";
import * as ops from "./pageOps";
import { DAY_LABELS, DAY_TITLES, MAX_PAGES } from "./pageOps";

export function PagesPanel({ doc, activePage, setActivePage, commitDoc }: {
  doc: LayoutT;
  activePage: number;
  setActivePage: (n: number) => void;
  commitDoc: (doc: LayoutT) => void;
}) {
  const total = ops.totalPages(doc);
  const idx = Math.min(activePage, total - 1);
  const [settingsFor, setSettingsFor] = useState<number | null>(null); // which row's settings are open
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const apply = (edit: ops.PageEdit | null) => { if (edit) { commitDoc(edit.doc); setActivePage(edit.active); } };

  const defaultSecs = typeof doc.pageRotateSeconds === "number" ? doc.pageRotateSeconds : undefined;

  return (
    <section class="properties pages-panel">
      <ul class="pages-side-list" role="tablist" aria-label="Board pages">
        {Array.from({ length: total }, (_, i) => {
          const s = ops.settingsAt(doc, i);
          const scheduled = !!s?.schedule && Object.keys(s.schedule).length > 0;
          const customDwell = typeof s?.seconds === "number";
          const active = i === idx;
          const open = settingsFor === i;
          return (
            <li
              key={i}
              class={`pages-li${active ? " on" : ""}${dragOver === i && dragFrom !== null && dragFrom !== i ? " drag-over" : ""}${dragFrom === i ? " dragging" : ""}`}
              draggable={i !== 0}
              onDragStart={(e) => { if (i === 0) { e.preventDefault(); return; } setDragFrom(i); try { (e as unknown as DragEvent).dataTransfer?.setData("text/plain", String(i)); } catch { /* jsdom */ } }}
              onDragOver={(e) => { if (dragFrom !== null && i !== 0) { e.preventDefault(); if (dragOver !== i) setDragOver(i); } }}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && i !== 0) apply(ops.reorderPage(doc, dragFrom, i)); setDragFrom(null); setDragOver(null); }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            >
              <div class="pages-row">
                <span class="pages-grip" aria-hidden="true" title={i === 0 ? "The first page can’t be moved" : "Drag to reorder"}><Icon.grip /></span>
                <button class="pages-row-main" role="tab" aria-selected={active} title={ops.pageTitle(doc, i)} onClick={() => setActivePage(i)}>
                  <span class="pages-row-name">{ops.pageLabel(doc, i)}</span>
                  {(scheduled || customDwell) && <PageGlyph scheduled={scheduled} customDwell={customDwell} />}
                </button>
                <span class="pages-row-tools">
                  <button class={`ghost sm${open ? " on" : ""}`} title="Page settings" aria-expanded={open} onClick={() => { setActivePage(i); setSettingsFor(open ? null : i); }}><Icon.settings /></button>
                  <button class="ghost sm" title="Duplicate page" disabled={total >= MAX_PAGES} onClick={() => apply(ops.duplicatePage(doc, i))}><Icon.copy /></button>
                  <button class="ghost sm danger" title="Delete page" disabled={i === 0} onClick={() => { apply(ops.deletePage(doc, i)); if (open) setSettingsFor(null); }}><Icon.trash /></button>
                </span>
              </div>
              {open && <PageSettings key={`set-${i}`} doc={doc} index={i} defaultSecs={defaultSecs} commitDoc={commitDoc} />}
            </li>
          );
        })}
      </ul>
      {total < MAX_PAGES && (
        <button class="pages-add-row" onClick={() => apply(ops.addPage(doc))}><Icon.plus /> Add page</button>
      )}

      <div class="pages-rotation">
        <p class="muted section-label">Rotation</p>
        <label class="field">
          <span>Default dwell <span class="muted">(secs each page)</span></span>
          <span class="row gap">
            <input type="number" min={3} max={3600} class="num" value={defaultSecs ?? ""} placeholder="10"
              onInput={(e) => { const v = Number((e.currentTarget as HTMLInputElement).value); commitDoc({ ...structuredClone(doc), pageRotateSeconds: Number.isFinite(v) && v >= 3 ? Math.min(3600, Math.floor(v)) : undefined }); }} />
            <span class="muted">unless a page sets its own</span>
          </span>
        </label>
        <label class="field">
          <span>Transition <span class="muted">({doc.pageTransitionMs ?? 350} ms)</span></span>
          <input type="range" min={0} max={2000} step={50} value={doc.pageTransitionMs ?? 350}
            onInput={(e) => { const v = Number((e.currentTarget as HTMLInputElement).value); commitDoc({ ...structuredClone(doc), pageTransitionMs: v === 350 ? undefined : v }); }} />
        </label>
        {total === 1 && <p class="muted hint">One page so far — add another to make this board rotate.</p>}
      </div>
    </section>
  );
}

// A tiny status glyph on a row — derived only from the page's settings (no geometry,
// no iframe): a 7-stripe "week" mark when a schedule exists + a ring-dot for a custom
// dwell. Pure CSS, so it inverts in dark mode for free.
function PageGlyph({ scheduled, customDwell }: { scheduled: boolean; customDwell: boolean }) {
  return (
    <span class="page-glyph" aria-hidden="true">
      {scheduled && <span class="pg-cal" />}
      {customDwell && <span class="pg-dwell" />}
    </span>
  );
}

// One page's settings, expanded inline under its row when the gear is open: name, how
// long it shows, and an OPTIONAL schedule (off by default — tick the box to reveal it).
function PageSettings({ doc, index, defaultSecs, commitDoc }: { doc: LayoutT; index: number; defaultSecs: number | undefined; commitDoc: (doc: LayoutT) => void }) {
  const s = ops.settingsAt(doc, index);
  const sched = s?.schedule;
  const daysMask = sched?.daysMask;
  const dayOn = (b: number): boolean => (daysMask == null ? true : ((daysMask >> b) & 1) === 1);
  const toggleDay = (b: number) => {
    const base = daysMask == null ? 127 : daysMask;
    const next = base ^ (1 << b);
    commitDoc(ops.patchSchedule(doc, index, { daysMask: next === 127 ? undefined : next })); // 127 (all days) ≡ no constraint
  };
  const empty = ops.rowsAt(doc, index).every((r) => r.blocks.length === 0);
  // The "Schedule this page" checkbox: on when any schedule field is set. Toggling off
  // clears the schedule (page returns to always-on); toggling on reveals the fields.
  const [schedOn, setSchedOn] = useState(!!sched && Object.keys(sched).length > 0);
  const setSched = (on: boolean) => {
    setSchedOn(on);
    if (!on) commitDoc(ops.patchSchedule(doc, index, { daysMask: undefined, startMin: undefined, endMin: undefined, fromDate: undefined, toDate: undefined }));
  };

  return (
    <div class="pages-pop" role="group" aria-label={`Settings for ${ops.pageLabel(doc, index)}`}>
      {empty && index !== 0 && <p class="muted hint">This page is empty — add blocks, or it’s skipped in rotation.</p>}
      <label class="field">
        <span>Page name</span>
        <input type="text" value={s?.name ?? ""} placeholder={`Page ${index + 1}`} maxLength={60}
          onInput={(e) => commitDoc(ops.patchSettings(doc, index, { name: (e.target as HTMLInputElement).value }))} />
      </label>
      <label class="field">
        <span>Show for</span>
        <span class="row gap">
          <input type="number" min={1} max={3600} class="num" value={s?.seconds ?? ""} placeholder={String(defaultSecs ?? 10)}
            onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); commitDoc(ops.patchSettings(doc, index, { seconds: Number.isFinite(v) && v >= 1 ? Math.min(3600, Math.floor(v)) : undefined })); }} />
          <span class="muted">seconds {s?.seconds == null && <em>(uses the default)</em>}</span>
        </span>
      </label>

      <label class="check-row">
        <input type="checkbox" checked={schedOn} onChange={(e) => setSched((e.currentTarget as HTMLInputElement).checked)} />
        <span>Schedule this page <span class="muted">— only show it at certain times</span></span>
      </label>
      {schedOn && (
        <div class="pages-schedule">
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
            </span>
          </div>
          <div class="field">
            <span>Date range</span>
            <span class="row gap">
              <input type="date" value={sched?.fromDate ?? ""} onInput={(e) => commitDoc(ops.patchSchedule(doc, index, { fromDate: (e.target as HTMLInputElement).value || undefined }))} />
              <span class="muted">to</span>
              <input type="date" value={sched?.toDate ?? ""} onInput={(e) => commitDoc(ops.patchSchedule(doc, index, { toDate: (e.target as HTMLInputElement).value || undefined }))} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
