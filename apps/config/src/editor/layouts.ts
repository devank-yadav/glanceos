import type { LayoutT, RowT, WidgetT } from "@glanceos/schema";
import { makeBlock, newWidgetId, type WidgetType } from "./blocks";

// v8.0 Sections — "choose your layout" (PowerPoint-style). A preset is a pure description
// of rows × columns over the EXISTING document-flow grid (no schema/engine change): each
// row has a height in units (24 = full screen) and a set of cells, each a starter block
// with a width weight. Picking one arranges the board into that shape; the user then edits
// every cell in place. Optionally the board's existing blocks are poured into the cells in
// order so applying a layout rearranges current content instead of discarding it.

interface Cell { type: WidgetType; props?: Record<string, unknown>; width?: number }
interface PresetRow { h: number; cells: Cell[] }
export interface LayoutPreset { id: string; name: string; rows: PresetRow[] }

const H = (content: string): Cell => ({ type: "heading", props: { content } });
const T = (content = "Add text…"): Cell => ({ type: "text", props: { content } });
const S = (label: string): Cell => ({ type: "stat", props: { label, value: "0" } });
const L = (content: string): Cell => ({ type: "label", props: { content } });

// Heights are in 24-unit page space; per row they sum to ~24 so a layout fills the screen.
export const LAYOUTS: LayoutPreset[] = [
  { id: "single", name: "Single", rows: [{ h: 24, cells: [H("Heading")] }] },
  { id: "title-body", name: "Title + body", rows: [{ h: 5, cells: [H("Title")] }, { h: 19, cells: [T()] }] },
  { id: "halves", name: "Two columns", rows: [{ h: 24, cells: [T("Left"), T("Right")] }] },
  { id: "stacked", name: "Stacked halves", rows: [{ h: 12, cells: [T("Top")] }, { h: 12, cells: [T("Bottom")] }] },
  { id: "thirds", name: "Three columns", rows: [{ h: 24, cells: [T("One"), T("Two"), T("Three")] }] },
  { id: "sidebar-main", name: "Sidebar + main", rows: [{ h: 24, cells: [{ ...L("Sidebar"), width: 1 }, { ...T("Main content"), width: 2 }] }] },
  { id: "main-sidebar", name: "Main + sidebar", rows: [{ h: 24, cells: [{ ...T("Main content"), width: 2 }, { ...L("Sidebar"), width: 1 }] }] },
  { id: "header-two", name: "Header + two columns", rows: [{ h: 5, cells: [H("Title")] }, { h: 19, cells: [T("Left"), T("Right")] }] },
  { id: "quad", name: "Quad (2×2)", rows: [{ h: 12, cells: [S("Metric A"), S("Metric B")] }, { h: 12, cells: [S("Metric C"), S("Metric D")] }] },
  { id: "dashboard", name: "Dashboard", rows: [{ h: 6, cells: [S("KPI 1"), S("KPI 2"), S("KPI 3")] }, { h: 18, cells: [T("Main panel")] }] },
  { id: "header-body-footer", name: "Header · body · footer", rows: [{ h: 4, cells: [H("Title")] }, { h: 16, cells: [T()] }, { h: 4, cells: [L("Footer")] }] },
  { id: "triptych", name: "Triptych", rows: [{ h: 24, cells: [{ ...T("Side"), width: 1 }, { ...T("Feature"), width: 2 }, { ...T("Side"), width: 1 }] }] },
];

function makeCell(c: Cell): WidgetT {
  const b = makeBlock(c.type);
  if (c.props) Object.assign(b.props as Record<string, unknown>, c.props);
  if (c.width) b.width = c.width;
  return b;
}

/**
 * Build the rows for a preset. When `keep` is true, the board's existing blocks are poured
 * into the cells in order (so applying a layout rearranges current content); cells beyond
 * the supply keep their starter block, and surplus blocks spill into full-width rows below.
 */
export function applyLayout(doc: LayoutT, preset: LayoutPreset, keep: boolean): RowT[] {
  const supply = keep ? doc.rows.flatMap((r) => r.blocks) : [];
  let qi = 0;
  const rows: RowT[] = preset.rows.map((r) => ({
    id: newWidgetId(),
    h: r.h,
    blocks: r.cells.map((c) => {
      if (qi < supply.length) return { ...structuredClone(supply[qi++]!), width: c.width ?? 1 };
      return makeCell(c);
    }),
  }));
  while (qi < supply.length) rows.push({ id: newWidgetId(), h: 4, blocks: [{ ...structuredClone(supply[qi++]!), width: 1 }] });
  return rows;
}
