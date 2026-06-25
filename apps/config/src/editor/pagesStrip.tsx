// v10 multi-page authoring. A board is `rows` (page 1) plus optional extra `pages`
// (page 2…N). This strip lets you add / duplicate / delete / reorder pages, pick
// which one you're editing (the lens in studio.tsx), and tune how the real screen
// rotates them: a default dwell, a per-page dwell + schedule (time window · weekdays ·
// date range), and a transition fade. All edits are plain whole-doc changes routed
// through commitDoc — no lens needed here, so it can never disturb block editing.
import { useState } from "preact/hooks";
import type { LayoutT, PageSettingT, RowT } from "@glanceos/schema";
import { newWidgetId } from "./blocks";
import { Icon } from "./icons";

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
  const [open, setOpen] = useState(false);
  const total = (doc.pages?.length ?? 0) + 1;
  const idx = Math.min(activePage, total - 1);

  const addPage = () => {
    if (total >= MAX_PAGES) return;
    const d = structuredClone(doc);
    d.pages = [...(d.pages ?? []), []]; // a fresh empty page — switch to it to fill in
    commitDoc(normalize(d));
    setActivePage((doc.pages?.length ?? 0) + 1);
    setOpen(true);
  };
  const duplicatePage = (i: number) => {
    if (total >= MAX_PAGES) return;
    const d = structuredClone(doc);
    const clone = cloneRows(rowsAt(doc, i));
    const pages = [...(d.pages ?? [])];
    const insertAt = i; // 0 → front of pages; i → right after order-index i
    pages.splice(insertAt, 0, clone);
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

  const s = settingsAt(doc, idx);
  const sched = s?.schedule;
  const defaultSecs = typeof doc.pageRotateSeconds === "number" ? doc.pageRotateSeconds : undefined;
  const daysMask = sched?.daysMask;
  const dayOn = (b: number): boolean => (daysMask == null ? true : ((daysMask >> b) & 1) === 1);
  const toggleDay = (b: number) => {
    const base = daysMask == null ? 127 : daysMask;
    const next = base ^ (1 << b);
    // 127 (all days) ≡ no constraint → store undefined
    commitDoc(patchSchedule(doc, idx, { daysMask: next === 127 ? undefined : next }));
  };
  const empty = rowsAt(doc, idx).every((r) => r.blocks.length === 0);

  return (
    <div class="pages-strip">
      <div class="pages-tabs" role="tablist" aria-label="Board pages">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === idx}
            class={`page-tab${i === idx ? " on" : ""}${settingsAt(doc, i)?.schedule ? " scheduled" : ""}`}
            title={settingsAt(doc, i)?.schedule ? `${pageLabel(doc, i)} · scheduled` : pageLabel(doc, i)}
            onClick={() => { setActivePage(i); }}
          >
            {pageLabel(doc, i)}
          </button>
        ))}
        {total < MAX_PAGES && (
          <button class="page-add" title="Add a page" onClick={addPage}><Icon.plus /> Page</button>
        )}
        <button class={`page-cog${open ? " on" : ""}`} title="Page & rotation settings" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon.settings />
        </button>
      </div>

      {open && (
        <div class="pages-panel">
          <div class="pages-panel-head">
            <strong>{pageLabel(doc, idx)}</strong>
            <span class="grow" />
            <button class="ghost sm" title="Move earlier" disabled={idx < 2} onClick={() => movePage(idx, -1)}>↑</button>
            <button class="ghost sm" title="Move later" disabled={idx === 0 || idx >= total - 1} onClick={() => movePage(idx, 1)}>↓</button>
            <button class="ghost sm" title="Duplicate this page" disabled={total >= MAX_PAGES} onClick={() => duplicatePage(idx)}><Icon.copy /></button>
            <button class="ghost sm danger" title="Delete this page" disabled={idx === 0} onClick={() => deletePage(idx)}><Icon.trash /></button>
          </div>
          {empty && idx !== 0 && <p class="muted hint">This page is empty — add blocks to it, or it’s skipped in rotation.</p>}

          <label class="field">
            <span>Page name</span>
            <input type="text" value={s?.name ?? ""} placeholder={`Page ${idx + 1}`} maxLength={60}
              onInput={(e) => commitDoc(patchSettings(doc, idx, { name: (e.target as HTMLInputElement).value }))} />
          </label>

          <label class="field">
            <span>Show for</span>
            <span class="row gap">
              <input type="number" min={1} max={3600} class="num" value={s?.seconds ?? ""} placeholder={String(defaultSecs ?? 10)}
                onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); commitDoc(patchSettings(doc, idx, { seconds: Number.isFinite(v) && v >= 1 ? Math.min(3600, Math.floor(v)) : undefined })); }} />
              <span class="muted">seconds {s?.seconds == null && <em>(default)</em>}</span>
            </span>
          </label>

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
              <input type="time" value={minToTime(sched?.startMin)} onInput={(e) => commitDoc(patchSchedule(doc, idx, { startMin: timeToMin((e.target as HTMLInputElement).value) }))} />
              <span class="muted">to</span>
              <input type="time" value={minToTime(sched?.endMin)} onInput={(e) => commitDoc(patchSchedule(doc, idx, { endMin: timeToMin((e.target as HTMLInputElement).value) }))} />
              {(sched?.startMin != null || sched?.endMin != null) && (
                <button class="ghost sm" title="Clear time window" onClick={() => commitDoc(patchSchedule(doc, idx, { startMin: undefined, endMin: undefined }))}><Icon.x /></button>
              )}
            </span>
          </div>

          <div class="field">
            <span>Date range</span>
            <span class="row gap">
              <input type="date" value={sched?.fromDate ?? ""} onInput={(e) => commitDoc(patchSchedule(doc, idx, { fromDate: (e.target as HTMLInputElement).value || undefined }))} />
              <span class="muted">to</span>
              <input type="date" value={sched?.toDate ?? ""} onInput={(e) => commitDoc(patchSchedule(doc, idx, { toDate: (e.target as HTMLInputElement).value || undefined }))} />
              {(sched?.fromDate || sched?.toDate) && (
                <button class="ghost sm" title="Clear date range" onClick={() => commitDoc(patchSchedule(doc, idx, { fromDate: undefined, toDate: undefined }))}><Icon.x /></button>
              )}
            </span>
          </div>

          <hr />
          <p class="muted section-label">Rotation (whole board)</p>
          <label class="field">
            <span>Default dwell</span>
            <span class="row gap">
              <input type="number" min={3} max={3600} class="num" value={defaultSecs ?? ""} placeholder="10"
                onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); const d = structuredClone(doc); d.pageRotateSeconds = Number.isFinite(v) && v >= 3 ? Math.min(3600, Math.floor(v)) : undefined; commitDoc(d); }} />
              <span class="muted">seconds per page</span>
            </span>
          </label>
          <label class="field">
            <span>Transition</span>
            <span class="row gap">
              <input type="range" min={0} max={2000} step={50} value={doc.pageTransitionMs ?? 350}
                onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); const d = structuredClone(doc); d.pageTransitionMs = v === 350 ? undefined : v; commitDoc(d); }} />
              <span class="muted">{(doc.pageTransitionMs ?? 350)} ms fade</span>
            </span>
          </label>
          {total === 1 && <p class="muted hint">One page so far. Add a page to make this board rotate.</p>}
        </div>
      )}
    </div>
  );
}
