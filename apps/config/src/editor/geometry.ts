import type { LayoutT, WidgetT } from "@glanceos/schema";

// Pure document-flow math, mirroring apps/screen exactly:
// .page = CSS grid, grid-template-rows = each row's `h` units + a remainder
// track; .widget flex-grow = its width. Rows flow from the top at their own
// height — nothing stretches to fill.

const PAGE_UNITS = 24; // mirrors schema; inlined to keep this module dependency-free
export const MAX_COLUMNS = 4;
const SIDE_ZONE = 0.2; // edge fraction of a block that means "make a column"

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface RowBox extends Box {
  index: number;
}
export interface BlockBox extends Box {
  id: string;
  rowIndex: number;
  blockIndex: number;
}
export interface PageGeometry {
  W: number;
  H: number;
  pad: number;
  gap: number;
  unit: number; // pixels per height-unit
  usedUnits: number;
  rows: RowBox[];
  blocks: BlockBox[];
}

export type DropTarget =
  | { kind: "row"; index: number } // a new line at this position
  | { kind: "side"; rowIndex: number; blockIndex: number }; // a column in a line

export type DragSource = { kind: "existing"; id: string } | { kind: "new"; type: WidgetT["type"] };

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function pageGeometry(doc: LayoutT, W: number, H: number): PageGeometry {
  const pad = 0.04 * Math.min(W, H);
  const gap = doc.gap * 8;
  const used = doc.rows.reduce((n, r) => n + r.h, 0);
  const totalUnits = Math.max(PAGE_UNITS, used); // overflow compresses rather than spills
  const hasRemainder = used < PAGE_UNITS;
  const trackCount = doc.rows.length + (hasRemainder ? 1 : 0);
  const innerH = H - 2 * pad;
  const freeH = innerH - gap * Math.max(0, trackCount - 1);
  const unit = totalUnits > 0 ? freeH / totalUnits : 0;
  const innerW = W - 2 * pad;

  const rows: RowBox[] = [];
  const blocks: BlockBox[] = [];
  let y = pad;
  doc.rows.forEach((row, index) => {
    const h = row.h * unit;
    rows.push({ index, x: pad, y, w: innerW, h });
    const totalWeight = row.blocks.reduce((s, b) => s + b.width, 0);
    const usable = innerW - gap * (row.blocks.length - 1);
    let x = pad;
    row.blocks.forEach((b, blockIndex) => {
      const w = (usable * b.width) / totalWeight;
      blocks.push({ id: b.id, rowIndex: index, blockIndex, x, y, w, h });
      x += w + gap;
    });
    y += h + gap;
  });
  return { W, H, pad, gap, unit, usedUnits: used, rows, blocks };
}

/** Where would a drop at (x, y) land? Block edges → column; middles/gaps → line. */
export function hitTest(doc: LayoutT, g: PageGeometry, x: number, y: number): DropTarget {
  if (doc.rows.length === 0) return { kind: "row", index: 0 };

  for (const r of g.rows) {
    if (y < r.y - g.gap / 2) return { kind: "row", index: r.index };
    if (y > r.y + r.h + g.gap / 2) continue;

    const row = doc.rows[r.index]!;
    const rowBlocks = g.blocks.filter((b) => b.rowIndex === r.index);
    const columnsOpen = row.blocks.length < MAX_COLUMNS;

    if (columnsOpen) {
      if (rowBlocks.length > 0 && x < rowBlocks[0]!.x) return { kind: "side", rowIndex: r.index, blockIndex: 0 };
      const last = rowBlocks[rowBlocks.length - 1];
      if (last && x > last.x + last.w) return { kind: "side", rowIndex: r.index, blockIndex: row.blocks.length };
      for (const b of rowBlocks) {
        if (x >= b.x && x <= b.x + b.w) {
          const rel = (x - b.x) / b.w;
          if (rel < SIDE_ZONE) return { kind: "side", rowIndex: r.index, blockIndex: b.blockIndex };
          if (rel > 1 - SIDE_ZONE) return { kind: "side", rowIndex: r.index, blockIndex: b.blockIndex + 1 };
          break;
        }
      }
      for (let i = 0; i < rowBlocks.length - 1; i++) {
        const b = rowBlocks[i]!;
        if (x > b.x + b.w && x < rowBlocks[i + 1]!.x) return { kind: "side", rowIndex: r.index, blockIndex: b.blockIndex + 1 };
      }
    }
    return { kind: "row", index: y < r.y + r.h / 2 ? r.index : r.index + 1 };
  }
  return { kind: "row", index: doc.rows.length };
}

/** The blue line: horizontal for line drops, vertical for column drops. */
export function indicatorBox(g: PageGeometry, t: DropTarget): Box {
  const T = 3;
  if (t.kind === "row") {
    const x = g.pad;
    const w = g.W - 2 * g.pad;
    if (g.rows.length === 0) return { x, y: g.pad, w, h: T };
    if (t.index >= g.rows.length) {
      const last = g.rows[g.rows.length - 1]!;
      return { x, y: Math.min(last.y + last.h + g.gap / 2, g.H - g.pad) - T / 2, w, h: T };
    }
    const r = g.rows[t.index]!;
    const y = t.index === 0 ? r.y - T : r.y - g.gap / 2 - T / 2;
    return { x, y: Math.max(g.pad - T, y), w, h: T };
  }
  const r = g.rows[t.rowIndex]!;
  const rowBlocks = g.blocks.filter((b) => b.rowIndex === t.rowIndex);
  if (t.blockIndex >= rowBlocks.length) {
    const last = rowBlocks[rowBlocks.length - 1]!;
    return { x: Math.min(last.x + last.w + g.gap / 2, g.W - g.pad) - T / 2, y: r.y, w: T, h: r.h };
  }
  const b = rowBlocks[t.blockIndex]!;
  return { x: (t.blockIndex === 0 ? b.x : b.x - g.gap / 2) - T / 2, y: r.y, w: T, h: r.h };
}

let rowCounter = 0;
const newRowId = (blockId: string): string => `r-${blockId}-${(++rowCounter).toString(36)}`;

/**
 * Apply a drop. `removeId` pulls the dragged block from where it was first;
 * `rowHeight` is the height (units) for a freshly created line. Returns null on
 * a no-op (same place) or an illegal move (line already at MAX_COLUMNS).
 */
export function applyDrop(
  doc: LayoutT,
  block: WidgetT,
  target: DropTarget,
  removeId?: string,
  rowHeight = 4,
): LayoutT | null {
  const next = structuredClone(doc);
  let t: DropTarget = { ...target };

  if (removeId) {
    const rowIndex = next.rows.findIndex((r) => r.blocks.some((b) => b.id === removeId));
    if (rowIndex === -1) return null;
    const row = next.rows[rowIndex]!;
    const blockIndex = row.blocks.findIndex((b) => b.id === removeId);

    if (t.kind === "side" && t.rowIndex === rowIndex) {
      if (t.blockIndex === blockIndex || t.blockIndex === blockIndex + 1) return null;
    }
    if (t.kind === "row" && row.blocks.length === 1) {
      if (t.index === rowIndex || t.index === rowIndex + 1) return null;
    }

    row.blocks.splice(blockIndex, 1);
    if (row.blocks.length === 0) {
      next.rows.splice(rowIndex, 1);
      if (t.kind === "row" && t.index > rowIndex) t = { ...t, index: t.index - 1 };
      if (t.kind === "side" && t.rowIndex > rowIndex) t = { ...t, rowIndex: t.rowIndex - 1 };
    } else if (t.kind === "side" && t.rowIndex === rowIndex && t.blockIndex > blockIndex) {
      t = { ...t, blockIndex: t.blockIndex - 1 };
    }
  }

  const inserted: WidgetT = { ...block, width: 1 };
  if (t.kind === "row") {
    next.rows.splice(clamp(t.index, 0, next.rows.length), 0, {
      id: newRowId(block.id),
      h: clamp(Math.round(rowHeight), 1, 24),
      blocks: [inserted],
    });
  } else {
    const row = next.rows[t.rowIndex];
    if (!row || row.blocks.length >= MAX_COLUMNS) return null;
    row.blocks = row.blocks.map((b) => ({ ...b, width: 1 })); // equal columns, Notion-style
    row.blocks.splice(clamp(t.blockIndex, 0, row.blocks.length), 0, inserted);
  }
  return next;
}

/** Keyboard reorder: up/down move a block across lines; left/right within a line. */
export function moveBlock(doc: LayoutT, id: string, dir: "up" | "down" | "left" | "right"): LayoutT | null {
  const rowIndex = doc.rows.findIndex((r) => r.blocks.some((b) => b.id === id));
  if (rowIndex === -1) return null;
  const row = doc.rows[rowIndex]!;
  const blockIndex = row.blocks.findIndex((b) => b.id === id);
  const block = row.blocks[blockIndex]!;

  if (dir === "left" || dir === "right") {
    const targetIndex = dir === "left" ? blockIndex - 1 : blockIndex + 2;
    if (targetIndex < 0 || targetIndex > row.blocks.length) return null;
    return applyDrop(doc, block, { kind: "side", rowIndex, blockIndex: targetIndex }, id);
  }

  const single = row.blocks.length === 1;
  if (dir === "up") {
    if (single && rowIndex === 0) return null;
    return applyDrop(doc, block, { kind: "row", index: single ? rowIndex - 1 : rowIndex }, id, row.h);
  }
  if (single && rowIndex === doc.rows.length - 1) return null;
  return applyDrop(doc, block, { kind: "row", index: single ? rowIndex + 2 : rowIndex + 1 }, id, row.h);
}

/** Gutter drag: shift width between two adjacent blocks, sum preserved. */
export function resizeColumns(
  doc: LayoutT,
  rowIndex: number,
  leftIndex: number,
  leftWidth: number,
  rightWidth: number,
): LayoutT {
  const next = structuredClone(doc);
  const row = next.rows[rowIndex];
  const left = row?.blocks[leftIndex];
  const right = row?.blocks[leftIndex + 1];
  if (!left || !right) return next;
  left.width = clamp(Math.round(leftWidth * 100) / 100, 0.2, 5);
  right.width = clamp(Math.round(rightWidth * 100) / 100, 0.2, 5);
  return next;
}

/** Row-height drag: set a line's height in units (snapped). */
export function resizeRow(doc: LayoutT, rowIndex: number, h: number): LayoutT {
  const next = structuredClone(doc);
  const row = next.rows[rowIndex];
  if (row) row.h = clamp(Math.round(h), 1, 24);
  return next;
}

/** Swap a whole line up or down. */
export function moveRow(doc: LayoutT, rowIndex: number, dir: "up" | "down"): LayoutT | null {
  const j = dir === "up" ? rowIndex - 1 : rowIndex + 1;
  if (j < 0 || j >= doc.rows.length) return null;
  const next = structuredClone(doc);
  [next.rows[rowIndex], next.rows[j]] = [next.rows[j]!, next.rows[rowIndex]!];
  return next;
}

/** Clone a line (and its blocks, with fresh ids) directly below itself. */
export function duplicateRow(doc: LayoutT, rowIndex: number, nextId: () => string): LayoutT | null {
  const row = doc.rows[rowIndex];
  if (!row) return null;
  const next = structuredClone(doc);
  next.rows.splice(rowIndex + 1, 0, {
    id: nextId(),
    h: row.h,
    blocks: row.blocks.map((b) => ({ ...structuredClone(b), id: nextId() })),
  });
  return next;
}

export function deleteRow(doc: LayoutT, rowIndex: number): LayoutT {
  const next = structuredClone(doc);
  next.rows.splice(rowIndex, 1);
  return next;
}

/** Remove a set of blocks, dropping any line that becomes empty. */
export function removeBlocks(doc: LayoutT, ids: ReadonlySet<string>): LayoutT {
  const next = structuredClone(doc);
  next.rows = next.rows
    .map((r) => ({ ...r, blocks: r.blocks.filter((b) => !ids.has(b.id)) }))
    .filter((r) => r.blocks.length > 0);
  return next;
}
