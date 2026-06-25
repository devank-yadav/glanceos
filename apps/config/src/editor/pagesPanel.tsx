// v10 multi-page authoring — the "Pages" section in the right sidebar. A draggable list
// of pages: drag a row to reorder (or Alt+↑/↓), click it to edit that page (the lens in
// studio.tsx), open a row's gear for its settings. Every timing/schedule control is a
// one-tap pill (no id-typing) and each row shows its dwell + a plain-language schedule
// at a glance. All transforms are the pure ./pageOps helpers; this routes them through
// commitDoc + setActivePage.
import { useEffect, useRef, useState } from "preact/hooks";
import type { LayoutT } from "@glanceos/schema";
import { Icon } from "./icons";
import * as ops from "./pageOps";
import { DAY_LABELS, DAY_TITLES, MAX_PAGES } from "./pageOps";

const dwellLabel = (v: number): string => (v < 60 ? `${v}s` : `${v / 60}m`);

function Pill({ on, label, title, onClick }: { on: boolean; label: string; title?: string; onClick: () => void }) {
  return <button type="button" class={`preset-pill${on ? " on" : ""}`} aria-pressed={on} title={title} onClick={onClick}>{label}</button>;
}

export function PagesPanel({ doc, activePage, setActivePage, commitDoc }: {
  doc: LayoutT;
  activePage: number;
  setActivePage: (n: number) => void;
  commitDoc: (doc: LayoutT) => void;
}) {
  const total = ops.totalPages(doc);
  const idx = Math.min(activePage, total - 1);
  const [settingsFor, setSettingsFor] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const apply = (edit: ops.PageEdit | null) => { if (edit) { commitDoc(edit.doc); setActivePage(edit.active); } };
  const defaultSecs = typeof doc.pageRotateSeconds === "number" ? doc.pageRotateSeconds : undefined;

  return (
    <section class="properties pages-panel">
      <ul class="pages-side-list" role="tablist" aria-label="Board pages">
        {Array.from({ length: total }, (_, i) => {
          const s = ops.settingsAt(doc, i);
          const customDwell = typeof s?.seconds === "number";
          const summary = ops.scheduleSummary(doc, i);
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
                <button
                  class="pages-row-main"
                  role="tab"
                  aria-selected={active}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  title={ops.pageTitle(doc, i)}
                  onClick={() => setActivePage(i)}
                  onKeyDown={(e) => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); apply(ops.movePage(doc, i, e.key === "ArrowUp" ? -1 : 1)); } }}
                >
                  <span class="pages-row-name">{ops.pageLabel(doc, i)}</span>
                  <span class="pages-row-meta">
                    {summary && <span class="pages-row-sched">{summary}</span>}
                    <span class="pages-row-dwell" data-custom={customDwell ? "" : undefined}>{customDwell ? dwellLabel(s!.seconds!) : `${defaultSecs ?? 10}s`}</span>
                  </span>
                </button>
                <span class="pages-row-tools">
                  <button class={`ghost sm${open ? " on" : ""}`} title="Page settings" aria-expanded={open} onClick={() => { setActivePage(i); setSettingsFor(open ? null : i); }}><Icon.settings /></button>
                  <button class="ghost sm" title="Duplicate page" disabled={total >= MAX_PAGES} onClick={() => apply(ops.duplicatePage(doc, i))}><Icon.copy /></button>
                  <button class="ghost sm danger" title="Delete page (⌘Z to undo)" disabled={i === 0} onClick={() => { apply(ops.deletePage(doc, i)); if (open) setSettingsFor(null); }}><Icon.trash /></button>
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
        <div class="field">
          <span>Default dwell <span class="muted">(each page)</span></span>
          <div class="pill-row">
            {ops.DWELL_PRESETS.map((v) => (
              <Pill key={v} on={(defaultSecs ?? 10) === v} label={dwellLabel(v)} onClick={() => commitDoc({ ...structuredClone(doc), pageRotateSeconds: v === 10 ? undefined : v })} />
            ))}
            <input type="number" min={3} max={3600} class="num pill-num" value={defaultSecs ?? ""} placeholder="10" aria-label="custom default dwell, seconds"
              onInput={(e) => { const v = Number((e.currentTarget as HTMLInputElement).value); commitDoc({ ...structuredClone(doc), pageRotateSeconds: Number.isFinite(v) && v >= 3 ? Math.min(3600, Math.floor(v)) : undefined }); }} />
          </div>
        </div>
        <div class="field" role="group" aria-label="Transition">
          <span>Transition</span>
          <div class="pill-row">
            {[{ l: "Off", v: 0 }, { l: "Quick", v: 150 }, { l: "Smooth", v: 350 }, { l: "Slow", v: 800 }].map((t) => (
              <Pill key={t.l} on={(doc.pageTransitionMs ?? 350) === t.v} label={t.l} onClick={() => commitDoc({ ...structuredClone(doc), pageTransitionMs: t.v === 350 ? undefined : t.v })} />
            ))}
          </div>
        </div>
        {total === 1 && <p class="muted hint">One page so far — add another to make this board rotate.</p>}
      </div>
    </section>
  );
}

// One page's settings, expanded inline under its row when the gear is open: name, how
// long it shows (one-tap pills + an exact custom), and an OPTIONAL schedule behind a
// checkbox (off by default — tick it to reveal friendly day + time presets).
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
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []); // land on the first field when opened
  // "Schedule this page" — on when any schedule field is set. Turning it off clears the
  // schedule (page returns to always-on); turning it on reveals the presets + fields.
  const [schedOn, setSchedOn] = useState(!!sched && Object.keys(sched).length > 0);
  const setSched = (on: boolean) => {
    setSchedOn(on);
    if (!on) commitDoc(ops.patchSchedule(doc, index, { daysMask: undefined, startMin: undefined, endMin: undefined, fromDate: undefined, toDate: undefined }));
  };
  const schedId = `pages-sched-${index}`;

  return (
    <div class="pages-pop" role="group" aria-label={`Settings for ${ops.pageLabel(doc, index)}`}>
      {empty && index !== 0 && <p class="muted hint">This page is empty — add blocks, or it’s skipped in rotation.</p>}
      <label class="field">
        <span>Page name</span>
        <input ref={nameRef} type="text" value={s?.name ?? ""} placeholder={`Page ${index + 1}`} maxLength={60}
          onInput={(e) => commitDoc(ops.patchSettings(doc, index, { name: (e.target as HTMLInputElement).value }))} />
      </label>

      <div class="field">
        <span>Show for</span>
        <div class="pill-row">
          <Pill on={s?.seconds == null} label="Default" title={`Use the board default (${defaultSecs ?? 10}s)`} onClick={() => commitDoc(ops.patchSettings(doc, index, { seconds: undefined }))} />
          {ops.DWELL_PRESETS.map((v) => (
            <Pill key={v} on={s?.seconds === v} label={dwellLabel(v)} onClick={() => commitDoc(ops.patchSettings(doc, index, { seconds: v }))} />
          ))}
          <input type="number" min={1} max={3600} class="num pill-num" value={s?.seconds ?? ""} placeholder="custom" aria-label="custom show-for, seconds"
            onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); commitDoc(ops.patchSettings(doc, index, { seconds: Number.isFinite(v) && v >= 1 ? Math.min(3600, Math.floor(v)) : undefined })); }} />
        </div>
      </div>

      <label class="check-row">
        <input type="checkbox" checked={schedOn} aria-expanded={schedOn} aria-controls={schedId} onChange={(e) => setSched((e.currentTarget as HTMLInputElement).checked)} />
        <span>Schedule this page <span class="muted">— only show it at certain times</span></span>
      </label>
      {schedOn && (
        <div class="pages-schedule" id={schedId}>
          <div class="field">
            <span>Show on days</span>
            <div class="pill-row">
              {ops.DAY_PRESETS.map((d) => (
                <Pill key={d.label} on={(daysMask ?? 127) === (d.mask ?? 127)} label={d.label} onClick={() => commitDoc(ops.patchSchedule(doc, index, { daysMask: d.mask }))} />
              ))}
            </div>
            <div class="day-chips">
              {DAY_LABELS.map((d, b) => (
                <button key={b} type="button" title={DAY_TITLES[b]} class={`day-chip${dayOn(b) ? " on" : ""}`} aria-pressed={dayOn(b)} onClick={() => toggleDay(b)}>{d}</button>
              ))}
            </div>
          </div>
          <div class="field">
            <span>Time window <span class="muted">(device’s local time)</span></span>
            <div class="pill-row">
              {ops.TIME_PRESETS.map((w) => (
                <Pill key={w.label} on={sched?.startMin === w.startMin && sched?.endMin === w.endMin} label={w.label} title={w.title} onClick={() => commitDoc(ops.patchSchedule(doc, index, { startMin: w.startMin, endMin: w.endMin }))} />
              ))}
            </div>
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
