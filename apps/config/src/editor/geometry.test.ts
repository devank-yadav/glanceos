import type { LayoutT, WidgetT } from "@glanceos/schema";
import { describe, expect, it } from "vitest";
import {
  applyDrop, deleteRow, duplicateRow, hitTest, indicatorBox, moveBlock, moveRow,
  pageGeometry, removeBlocks, resizeColumns, resizeRow,
} from "./geometry";

const block = (id: string, width = 1): WidgetT =>
  ({ id, type: "text", width, props: { content: id, align: "left" } }) as WidgetT;

const doc = (rows: Array<{ id: string; h: number; blocks: WidgetT[] }>): LayoutT => ({
  schemaVersion: 3,
  name: "t",
  theme: { mode: "light", fontScale: "m" },
  gap: 2,
  align: "top",
  rows,
});

// Two lines: [a | b] (h6) then [c] (h6). Σh=12 < 24 → blank space below.
const D = doc([
  { id: "r1", h: 6, blocks: [block("a"), block("b")] },
  { id: "r2", h: 6, blocks: [block("c")] },
]);
const G = pageGeometry(D, 1920, 1080);

describe("pageGeometry (row heights)", () => {
  it("sizes rows by their height units", () => {
    expect(G.pad).toBeCloseTo(43.2);
    expect(G.gap).toBe(16);
    expect(G.rows[0]!.h).toBeCloseTo(6 * G.unit);
    expect(G.rows[0]!.h).toBeCloseTo(G.rows[1]!.h); // both 6 units
  });

  it("does NOT fill the screen when rows are short (blank remainder)", () => {
    const lastBottom = G.rows[1]!.y + G.rows[1]!.h;
    expect(lastBottom).toBeLessThan(1080 - G.pad - 50); // clear blank space below
  });

  it("a taller row takes proportionally more space", () => {
    const tall = pageGeometry(doc([{ id: "r1", h: 12, blocks: [block("a")] }, { id: "r2", h: 4, blocks: [block("b")] }]), 1920, 1080);
    expect(tall.rows[0]!.h / tall.rows[1]!.h).toBeCloseTo(3);
  });

  it("splits row width by weights", () => {
    const g = pageGeometry(doc([{ id: "r", h: 6, blocks: [block("a", 2), block("b", 1)] }]), 1920, 1080);
    expect(g.blocks[0]!.w / g.blocks[1]!.w).toBeCloseTo(2);
  });
});

describe("hitTest", () => {
  const a = G.blocks[0]!;

  it("top half of a block → new line above; bottom half → below", () => {
    expect(hitTest(D, G, a.x + a.w / 2, a.y + a.h * 0.25)).toEqual({ kind: "row", index: 0 });
    expect(hitTest(D, G, a.x + a.w / 2, a.y + a.h * 0.75)).toEqual({ kind: "row", index: 1 });
  });

  it("block edges → column targets", () => {
    expect(hitTest(D, G, a.x + a.w * 0.05, a.y + a.h / 2)).toEqual({ kind: "side", rowIndex: 0, blockIndex: 0 });
    expect(hitTest(D, G, a.x + a.w * 0.95, a.y + a.h / 2)).toEqual({ kind: "side", rowIndex: 0, blockIndex: 1 });
  });

  it("below the last row → append as a new line", () => {
    expect(hitTest(D, G, 960, 1070)).toEqual({ kind: "row", index: 2 });
  });

  it("a full row offers no column targets", () => {
    const full = doc([{ id: "r", h: 6, blocks: [block("a"), block("b"), block("x"), block("y")] }]);
    const g = pageGeometry(full, 1920, 1080);
    const first = g.blocks[0]!;
    expect(hitTest(full, g, first.x + first.w * 0.05, first.y + first.h * 0.2)).toEqual({ kind: "row", index: 0 });
  });

  it("indicator is horizontal for lines, vertical for columns", () => {
    const lineBox = indicatorBox(G, { kind: "row", index: 1 });
    expect(lineBox.w).toBeGreaterThan(lineBox.h);
    const colBox = indicatorBox(G, { kind: "side", rowIndex: 0, blockIndex: 1 });
    expect(colBox.h).toBeGreaterThan(colBox.w);
    expect(colBox.x + colBox.w / 2).toBeCloseTo(a.x + a.w + G.gap / 2, 1);
  });
});

describe("applyDrop", () => {
  it("side-drop pulls a block into another line as an equal column", () => {
    const next = applyDrop(D, D.rows[1]!.blocks[0]!, { kind: "side", rowIndex: 0, blockIndex: 2 }, "c")!;
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]!.blocks.map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(next.rows[0]!.blocks.every((b) => b.width === 1)).toBe(true);
  });

  it("row-drop pulls a column into its own line with the given height", () => {
    const next = applyDrop(D, D.rows[0]!.blocks[1]!, { kind: "row", index: 2 }, "b", 5)!;
    expect(next.rows.map((r) => r.blocks.map((b) => b.id))).toEqual([["a"], ["c"], ["b"]]);
    expect(next.rows[2]!.h).toBe(5);
  });

  it("detects no-op drops", () => {
    expect(applyDrop(D, D.rows[1]!.blocks[0]!, { kind: "row", index: 1 }, "c")).toBeNull();
    expect(applyDrop(D, D.rows[1]!.blocks[0]!, { kind: "row", index: 2 }, "c")).toBeNull();
    expect(applyDrop(D, D.rows[0]!.blocks[0]!, { kind: "side", rowIndex: 0, blockIndex: 1 }, "a")).toBeNull();
  });

  it("refuses a fifth column", () => {
    const full = doc([
      { id: "r", h: 6, blocks: [block("a"), block("b"), block("x"), block("y")] },
      { id: "r2", h: 6, blocks: [block("c")] },
    ]);
    expect(applyDrop(full, full.rows[1]!.blocks[0]!, { kind: "side", rowIndex: 0, blockIndex: 1 }, "c")).toBeNull();
  });

  it("inserts brand-new blocks with their own line height", () => {
    const next = applyDrop(D, block("z"), { kind: "row", index: 1 }, undefined, 3)!;
    expect(next.rows.map((r) => r.blocks.map((b) => b.id))).toEqual([["a", "b"], ["z"], ["c"]]);
    expect(next.rows[1]!.h).toBe(3);
  });
});

describe("moveBlock, resizeColumns, resizeRow", () => {
  it("moves a column out of its line and within it", () => {
    expect(moveBlock(D, "b", "down")!.rows.map((r) => r.blocks.map((b) => b.id))).toEqual([["a"], ["b"], ["c"]]);
    expect(moveBlock(D, "a", "left")).toBeNull();
    expect(moveBlock(D, "a", "right")!.rows[0]!.blocks.map((b) => b.id)).toEqual(["b", "a"]);
  });

  it("moves single-block lines up and down with edges", () => {
    expect(moveBlock(D, "c", "up")!.rows.map((r) => r.blocks.map((b) => b.id))).toEqual([["c"], ["a", "b"]]);
    expect(moveBlock(D, "c", "down")).toBeNull();
  });

  it("clamps gutter and row-height resizes", () => {
    expect(resizeColumns(D, 0, 0, 4.7, 0.05).rows[0]!.blocks[1]!.width).toBe(0.2);
    expect(resizeRow(D, 1, 99).rows[1]!.h).toBe(24);
    expect(resizeRow(D, 1, 0).rows[1]!.h).toBe(1);
  });
});

describe("row operations (v0.6)", () => {
  it("moves whole lines and refuses out-of-bounds", () => {
    expect(moveRow(D, 0, "up")).toBeNull();
    expect(moveRow(D, 1, "down")).toBeNull();
    expect(moveRow(D, 0, "down")!.rows.map((r) => r.blocks.map((b) => b.id))).toEqual([["c"], ["a", "b"]]);
  });

  it("duplicates a line below itself with fresh ids", () => {
    let n = 0;
    const next = duplicateRow(D, 0, () => `new${n++}`)!;
    expect(next.rows).toHaveLength(3);
    expect(next.rows[1]!.blocks).toHaveLength(2);
    expect(next.rows[1]!.blocks.every((b) => b.id.startsWith("new"))).toBe(true);
    expect(next.rows[1]!.h).toBe(D.rows[0]!.h);
  });

  it("deletes a line and removes blocks dropping empty lines", () => {
    expect(deleteRow(D, 1).rows.map((r) => r.id)).toEqual(["r1"]);
    const pruned = removeBlocks(D, new Set(["a", "b"]));
    expect(pruned.rows.map((r) => r.blocks.map((b) => b.id))).toEqual([["c"]]); // r1 emptied → dropped
  });
});
