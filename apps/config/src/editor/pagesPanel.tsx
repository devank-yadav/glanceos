// v10 multi-page authoring — lives in the right sidebar as a "Pages" section (same
// collapsible pattern as Objects / Board settings). A vertical list of pages: click a
// row to edit that page (the lens in studio.tsx), reorder / duplicate / delete per row,
// and the active page's settings (name · dwell · schedule) expand inline beneath it.
// Whole-board rotation (default dwell + transition) lives in Board settings. All page
// transforms are the pure helpers in ./pageOps; this just routes them through commitDoc
// + setActivePage.
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
  const apply = (edit: ops.PageEdit | null) => { if (edit) { commitDoc(edit.doc); setActivePage(edit.active); } };

  return (
    <section class="properties pages-panel">
      <ul class="pages-side-list" role="tablist" aria-label="Board pages">
        {Array.from({ length: total }, (_, i) => {
          const s = ops.settingsAt(doc, i);
          const scheduled = !!s?.schedule && Object.keys(s.schedule).length > 0;
          const customDwell = typeof s?.seconds === "number";
          const active = i === idx;
          return (
            <li key={i} class={`pages-li${active ? " on" : ""}`}>
              <div class="pages-row">
                <button class="pages-row-main" role="tab" aria-selected={active} title={ops.pageTitle(doc, i)} onClick={() => setActivePage(i)}>
                  {i === 0 && <span class="page-base-tag">Base</span>}
                  <span class="pages-row-name">{ops.pageLabel(doc, i)}</span>
                  {(scheduled || customDwell) && <PageGlyph scheduled={scheduled} customDwell={customDwell} />}
                </button>
                <span class="pages-row-tools">
                  <button class="ghost sm" title="Move up" disabled={i < 2} onClick={() => apply(ops.movePage(doc, i, -1))}>↑</button>
                  <button class="ghost sm" title="Move down" disabled={i === 0 || i >= total - 1} onClick={() => apply(ops.movePage(doc, i, 1))}>↓</button>
                  <button class="ghost sm" title="Duplicate page" disabled={total >= MAX_PAGES} onClick={() => apply(ops.duplicatePage(doc, i))}><Icon.copy /></button>
                  <button class="ghost sm danger" title="Delete page" disabled={i === 0} onClick={() => apply(ops.deletePage(doc, i))}><Icon.trash /></button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {total < MAX_PAGES && (
        <button class="pages-add-row" onClick={() => apply(ops.addPage(doc))}><Icon.plus /> Add page</button>
      )}
      {total === 1 && <p class="muted hint">One page so far. Add another to make this board rotate — set the dwell + transition in Board settings.</p>}
      <PageSettings doc={doc} index={idx} commitDoc={commitDoc} />
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

// The active page's settings, expanded inline under its row. Grouped Identity / Timing /
// Schedule. Reuses the .pages-pop field styling.
function PageSettings({ doc, index, commitDoc }: { doc: LayoutT; index: number; commitDoc: (doc: LayoutT) => void }) {
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

  return (
    <div class="pages-pop" role="group" aria-label={`Settings for ${ops.pageLabel(doc, index)}`}>
      <div class="pages-set-head">
        <span class="pages-set-name">{ops.pageLabel(doc, index)}</span>
        {index === 0 && <span class="page-base-tag">Base</span>}
      </div>
      {index === 0 && <p class="muted hint">The base page always shows first; it can’t be moved or deleted.</p>}
      {empty && index !== 0 && <p class="muted hint">This page is empty — add blocks, or it’s skipped in rotation.</p>}

      <p class="muted section-label">Identity</p>
      <label class="field">
        <span>Page name</span>
        <input type="text" value={s?.name ?? ""} placeholder={`Page ${index + 1}`} maxLength={60}
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
  );
}
