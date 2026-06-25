import { describe, expect, it } from "vitest";
import type { LayoutT, RowT } from "@glanceos/schema";
import * as ops from "./pageOps";

// minimal valid board; `page(tag)` makes a one-block page we can identify after moves
const page = (tag: string): RowT[] => [{ id: `r-${tag}`, h: 6, blocks: [{ id: `b-${tag}`, type: "divider", props: {} }] }] as unknown as RowT[];
const firstBlockId = (rows: RowT[]): string | undefined => rows[0]?.blocks[0]?.id;
function mk(opts: Partial<LayoutT> = {}): LayoutT {
  return { schemaVersion: 3, name: "T", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top", rows: page("base"), ...opts } as LayoutT;
}

describe("pageOps — structural ops", () => {
  it("addPage appends an empty page and returns its index; caps at 9 total", () => {
    const r = ops.addPage(mk())!;
    expect(r.doc.pages).toHaveLength(1);
    expect(r.doc.pages![0]).toEqual([]);
    expect(r.active).toBe(1);
    // from one extra → new page is order index 2
    const r2 = ops.addPage(mk({ pages: [page("a")] }))!;
    expect(r2.active).toBe(2);
    // 9 total (8 extras) → no-op
    expect(ops.addPage(mk({ pages: Array.from({ length: 8 }, () => [] as RowT[]) }))).toBeNull();
  });

  it("duplicatePage clones rows with FRESH ids + clears names, inserts after, switches to it", () => {
    const doc = mk({ rows: [{ id: "r0", h: 6, blocks: [{ id: "b0", type: "stat", props: {}, name: "Metric" }] }] as unknown as RowT[] });
    const r = ops.duplicatePage(doc, 0)!; // duplicate the base page
    expect(r.doc.pages).toHaveLength(1);
    const clone = r.doc.pages![0]!;
    expect(clone[0]!.id).not.toBe("r0"); // fresh row id
    expect(clone[0]!.blocks[0]!.id).not.toBe("b0"); // fresh block id
    expect(clone[0]!.blocks[0]!.name).toBeUndefined(); // name cleared so auto-naming re-uniques it
    expect(r.active).toBe(1);
    expect(ops.duplicatePage(mk({ pages: Array.from({ length: 8 }, () => [] as RowT[]) }), 0)).toBeNull(); // at cap
  });

  it("deletePage removes an extra + its settings, clamps active, and can't touch the base page", () => {
    expect(ops.deletePage(mk(), 0)).toBeNull(); // base page protected
    const doc = mk({ pages: [page("a"), page("b")], pageSettings: [undefined, { name: "A" }, { name: "B" }] as never });
    const r = ops.deletePage(doc, 1)!; // delete order index 1 (page "a")
    expect(r.doc.pages).toHaveLength(1);
    expect(firstBlockId(r.doc.pages![0]!)).toBe("b-b"); // "b" survived
    expect(r.doc.pageSettings?.[1]).toEqual({ name: "B" }); // settings shifted with it
    expect(r.active).toBe(0);
    // deleting the only extra drops pages entirely (back to single-page)
    const r2 = ops.deletePage(mk({ pages: [page("a")] }), 1)!;
    expect(r2.doc.pages).toBeUndefined();
  });

  it("movePage swaps adjacent extras (settings follow) and leaves the base pinned", () => {
    const doc = mk({ pages: [page("a"), page("b")], pageSettings: [undefined, { name: "A" }, { name: "B" }] as never });
    const r = ops.movePage(doc, 1, 1)!; // move order 1 → 2
    expect(r.doc.pages!.map((p) => firstBlockId(p))).toEqual(["b-b", "b-a"]);
    expect(r.doc.pageSettings?.[1]).toEqual({ name: "B" });
    expect(r.doc.pageSettings?.[2]).toEqual({ name: "A" });
    expect(r.active).toBe(2);
    expect(ops.movePage(doc, 0, 1)).toBeNull(); // base can't move
    expect(ops.movePage(doc, 2, 1)).toBeNull(); // off the end
    expect(ops.movePage(doc, 1, -1)).toBeNull(); // into the base slot
  });

  it("reorderPage moves a page to an arbitrary slot (settings follow); base/identity no-ops", () => {
    const doc = mk({ pages: [page("a"), page("b"), page("c")], pageSettings: [undefined, { name: "A" }, { name: "B" }, { name: "C" }] as never });
    const r = ops.reorderPage(doc, 3, 1)!; // move "c" to the front of the extras
    expect(r.doc.pages!.map((p) => firstBlockId(p))).toEqual(["b-c", "b-a", "b-b"]);
    expect(r.doc.pageSettings?.slice(1)).toEqual([{ name: "C" }, { name: "A" }, { name: "B" }]);
    expect(r.active).toBe(1);
    expect(ops.reorderPage(doc, 2, 2)).toBeNull(); // same slot
    expect(ops.reorderPage(doc, 0, 2)).toBeNull(); // base isn't reorderable
  });

  it("never mutates the input doc", () => {
    const doc = mk({ pages: [page("a")] });
    const snapshot = JSON.stringify(doc);
    ops.addPage(doc); ops.duplicatePage(doc, 1); ops.deletePage(doc, 1); ops.movePage(doc, 1, 1); ops.reorderPage(doc, 1, 1);
    ops.patchSettings(doc, 1, { name: "X" }); ops.patchSchedule(doc, 1, { daysMask: 3 });
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});

describe("pageOps — settings + normalize", () => {
  it("patchSettings sets a field, strips empties, and drops all-empty pageSettings", () => {
    const r = ops.patchSettings(mk({ pages: [page("a")] }), 1, { name: "Hello" });
    expect(r.pageSettings?.[1]).toEqual({ name: "Hello" });
    // clearing the only set field removes the entry → no pageSettings left
    const cleared = ops.patchSettings(r, 1, { name: "" });
    expect(cleared.pageSettings).toBeUndefined();
  });

  it("patchSchedule writes/clears the schedule object", () => {
    const doc = mk({ pages: [page("a")] });
    const withSched = ops.patchSchedule(doc, 1, { daysMask: 62, startMin: 540, endMin: 1020 });
    expect(withSched.pageSettings?.[1]?.schedule).toEqual({ daysMask: 62, startMin: 540, endMin: 1020 });
    // nulling every field removes schedule, then the empty settings entry, then pageSettings
    const cleared = ops.patchSchedule(withSched, 1, { daysMask: undefined, startMin: undefined, endMin: undefined });
    expect(cleared.pageSettings).toBeUndefined();
  });

  it("normalize drops empty pages[] and all-empty pageSettings; keeps real ones", () => {
    expect(ops.normalize(mk({ pages: [] })).pages).toBeUndefined();
    expect(ops.normalize(mk({ pages: [page("a")], pageSettings: [undefined, {}] as never })).pageSettings).toBeUndefined();
    const kept = ops.normalize(mk({ pages: [page("a")], pageSettings: [undefined, { name: "A" }] as never }));
    expect(kept.pageSettings?.[1]).toEqual({ name: "A" });
    // pageSettings without any pages is meaningless → dropped
    expect(ops.normalize(mk({ pageSettings: [{ name: "x" }] as never })).pageSettings).toBeUndefined();
  });
});

describe("pageOps — scheduleSummary + friendly presets", () => {
  const sched = (s: object) => mk({ pages: [page("a")], pageSettings: [undefined, { schedule: s }] as never });
  it("returns null when a page has no schedule", () => {
    expect(ops.scheduleSummary(mk({ pages: [page("a")] }), 1)).toBeNull();
  });
  it("describes days + time in plain language", () => {
    expect(ops.scheduleSummary(sched({ daysMask: 62, startMin: 540, endMin: 1020 }), 1)).toBe("Mon–Fri · 9am–5pm");
    expect(ops.scheduleSummary(sched({ daysMask: 65 }), 1)).toBe("Weekends");
    expect(ops.scheduleSummary(sched({ startMin: 540, endMin: 1020 }), 1)).toBe("9am–5pm"); // no day constraint → no "every day"
    expect(ops.scheduleSummary(sched({ daysMask: 5 }), 1)).toBe("Sun, Tue"); // bits 0 + 2
    expect(ops.scheduleSummary(sched({ startMin: 1020 }), 1)).toBe("from 5pm");
  });
  it("presets match the runtime conventions (daysMask = getDay bit, minute-of-day windows)", () => {
    expect(ops.DAY_PRESETS.find((p) => p.label === "Weekdays")!.mask).toBe(62);
    expect(ops.DAY_PRESETS.find((p) => p.label === "Weekends")!.mask).toBe(65);
    expect(ops.DAY_PRESETS.find((p) => p.label === "Every day")!.mask).toBeUndefined();
    expect(ops.TIME_PRESETS.find((p) => p.label === "Business")).toMatchObject({ startMin: 540, endMin: 1020 });
    expect(ops.DWELL_PRESETS).toEqual([5, 10, 30, 60]);
  });
});

describe("pageOps — labels + time helpers", () => {
  it("pageLabel / pageTitle reflect name, base, dwell, schedule", () => {
    const doc = mk({ pages: [page("a")], pageSettings: [undefined, { name: " Lobby ", seconds: 20, schedule: { daysMask: 3 } }] as never });
    expect(ops.pageLabel(doc, 0)).toBe("Page 1");
    expect(ops.pageLabel(doc, 1)).toBe("Lobby"); // trimmed
    expect(ops.pageTitle(doc, 0)).toBe("Page 1 · base page");
    expect(ops.pageTitle(doc, 1)).toBe("Lobby · 20s · scheduled");
  });
  it("minToTime / timeToMin round-trip and handle blanks", () => {
    expect(ops.minToTime(undefined)).toBe("");
    expect(ops.minToTime(540)).toBe("09:00");
    expect(ops.minToTime(1439)).toBe("23:59");
    expect(ops.timeToMin("09:00")).toBe(540);
    expect(ops.timeToMin("")).toBeUndefined();
    expect(ops.timeToMin("bad")).toBeUndefined();
  });
});
