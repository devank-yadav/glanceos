// Pure page-list + page-settings transforms for the multi-page board model. A board is
// `rows` (page 1, order index 0) plus optional extra `pages` (page 2…N) and an
// index-aligned `pageSettings[]` (entry i = settings for order index i). These helpers
// take a doc and return a NEW doc (never mutate the input) so they're trivially testable;
// the structural ops also return the order index to make active. PagesPanel wires the
// results through commitDoc + setActivePage. Kept free of Preact so they unit-test alone.
import type { LayoutT, PageSettingT, RowT } from "@glanceos/schema";
import { newWidgetId } from "./blocks";

export const MAX_PAGES = 9; // schema: rows + up to 8 extra pages
export const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // bit i = Date.getDay() (0 = Sunday)
export const DAY_TITLES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type PageSchedule = NonNullable<PageSettingT["schedule"]>;

export function totalPages(doc: LayoutT): number {
  return (doc.pages?.length ?? 0) + 1;
}
// rows of the page at order index i (0 = base `rows`, else pages[i-1]).
export function rowsAt(doc: LayoutT, i: number): RowT[] {
  return i === 0 ? doc.rows : (doc.pages?.[i - 1] ?? []);
}
export function settingsAt(doc: LayoutT, i: number): PageSettingT | undefined {
  return doc.pageSettings?.[i];
}
export function pageLabel(doc: LayoutT, i: number): string {
  return settingsAt(doc, i)?.name?.trim() || `Page ${i + 1}`;
}
// One-line tooltip describing a tab (name · base? · dwell · scheduled).
export function pageTitle(doc: LayoutT, i: number): string {
  const s = settingsAt(doc, i);
  const bits: string[] = [pageLabel(doc, i)];
  if (i === 0) bits.push("base page");
  if (typeof s?.seconds === "number") bits.push(`${s.seconds}s`);
  if (s?.schedule && Object.keys(s.schedule).length) bits.push("scheduled");
  return bits.join(" · ");
}
// Deep-clone a page's rows with fresh ids so block names/ids stay unique board-wide.
export function cloneRows(rows: RowT[]): RowT[] {
  return structuredClone(rows).map((r) => ({ ...r, id: newWidgetId(), blocks: r.blocks.map((b) => ({ ...b, id: newWidgetId(), name: undefined })) }));
}
// Drop empty trailing structure so a board with no extras serialises exactly as before.
export function normalize(d: LayoutT): LayoutT {
  if (d.pages && d.pages.length === 0) d.pages = undefined;
  if (d.pageSettings) {
    if (!d.pages) d.pageSettings = undefined;
    else if (d.pageSettings.every((s) => !s || Object.keys(s).length === 0)) d.pageSettings = undefined;
  }
  return d;
}
// Mutate pageSettings[i] in a fresh doc, padding the array as needed.
export function patchSettings(doc: LayoutT, i: number, patch: Partial<PageSettingT>): LayoutT {
  const d = structuredClone(doc);
  const arr: (PageSettingT | undefined)[] = d.pageSettings ? [...d.pageSettings] : [];
  while (arr.length <= i) arr.push(undefined);
  const next: PageSettingT = { ...(arr[i] ?? {}), ...patch };
  if (next.schedule && Object.keys(next.schedule).length === 0) delete next.schedule;
  // drop blanked-out fields so an entry can become truly empty (and then get pruned) —
  // otherwise `{ name: undefined }` / `{ schedule: undefined }` would linger as junk.
  for (const k of Object.keys(next) as (keyof PageSettingT)[]) if (next[k] === undefined || next[k] === "") delete next[k];
  arr[i] = Object.keys(next).length ? next : undefined;
  d.pageSettings = arr as PageSettingT[];
  return normalize(d);
}
export function patchSchedule(doc: LayoutT, i: number, patch: Partial<PageSchedule>): LayoutT {
  const cur = settingsAt(doc, i)?.schedule ?? {};
  const sched: PageSchedule = { ...cur, ...patch };
  for (const k of Object.keys(sched) as (keyof PageSchedule)[]) if (sched[k] == null) delete sched[k];
  return patchSettings(doc, i, { schedule: Object.keys(sched).length ? sched : undefined });
}

export const minToTime = (m: number | undefined): string => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
export const timeToMin = (t: string): number | undefined => { const m = /^(\d{2}):(\d{2})$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : undefined; };

// ── Structural ops: take a doc, return { doc, active } or null when it's a no-op
// (at the page cap, or an illegal move of the base page). The caller commits + switches.
export type PageEdit = { doc: LayoutT; active: number };

export function addPage(doc: LayoutT): PageEdit | null {
  if (totalPages(doc) >= MAX_PAGES) return null;
  const d = structuredClone(doc);
  d.pages = [...(d.pages ?? []), []]; // a fresh empty page — switch to it to fill in
  return { doc: normalize(d), active: (doc.pages?.length ?? 0) + 1 };
}
export function duplicatePage(doc: LayoutT, i: number): PageEdit | null {
  if (totalPages(doc) >= MAX_PAGES) return null;
  const d = structuredClone(doc);
  const clone = cloneRows(rowsAt(doc, i));
  const pages = [...(d.pages ?? [])];
  pages.splice(i, 0, clone); // 0 → front of pages; i → right after order-index i
  d.pages = pages;
  if (d.pageSettings) { const ps = [...d.pageSettings]; ps.splice(i + 1, 0, settingsAt(doc, i) ? structuredClone(settingsAt(doc, i)!) : undefined as unknown as PageSettingT); d.pageSettings = ps; }
  return { doc: normalize(d), active: i + 1 };
}
export function deletePage(doc: LayoutT, i: number): PageEdit | null {
  if (i === 0 || !doc.pages?.length) return null; // page 1 (base rows) can't be removed
  const d = structuredClone(doc);
  d.pages = d.pages!.filter((_, k) => k !== i - 1);
  if (d.pageSettings) d.pageSettings = d.pageSettings.filter((_, k) => k !== i);
  return { doc: normalize(d), active: Math.max(0, i - 1) };
}
export function movePage(doc: LayoutT, i: number, dir: -1 | 1): PageEdit | null {
  const j = i + dir;
  if (i < 1 || j < 1 || j > totalPages(doc) - 1 || !doc.pages?.length) return null; // only extras reorder, base stays first
  const d = structuredClone(doc);
  const p = [...d.pages!];
  [p[i - 1], p[j - 1]] = [p[j - 1]!, p[i - 1]!];
  d.pages = p;
  if (d.pageSettings) { const ps = [...d.pageSettings]; while (ps.length <= Math.max(i, j)) ps.push(undefined as unknown as PageSettingT); [ps[i], ps[j]] = [ps[j]!, ps[i]!]; d.pageSettings = ps; }
  return { doc: normalize(d), active: j };
}
export function reorderPage(doc: LayoutT, from: number, to: number): PageEdit | null {
  if (from < 1 || to < 1 || from === to || !doc.pages?.length) return null;
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
  return { doc: normalize(d), active: to };
}
