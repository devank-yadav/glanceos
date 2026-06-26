import { describe, expect, it } from "vitest";
import type { WidgetT } from "@glanceos/schema";
import { computeChanges } from "./whatchanged";

const blk = (id: string, type: string, props: Record<string, unknown>) =>
  ({ id, type, width: 1, h: 4, props, style: {} }) as unknown as WidgetT;

describe("computeChanges — what changed since you last looked", () => {
  it("baselines on the first look, then reports scalar deltas", () => {
    const a = [blk("prs", "stat", { label: "Open PRs", value: "3" }), blk("d", "sinceYouLooked", { title: "x", max: 5 })];
    expect(computeChanges(a, {}, "k1")).toEqual([]); // first look → baseline only
    const b = [blk("prs", "stat", { label: "Open PRs", value: "7" }), blk("d", "sinceYouLooked", { title: "x", max: 5 })];
    expect(computeChanges(b, {}, "k1")).toEqual([{ label: "Open PRs", from: "3", to: "7" }]);
  });

  it("prefers resolved live data over typed props, and counts a list source", () => {
    const blocks = [blk("inbox", "stat", { label: "Inbox" })];
    computeChanges(blocks, { inbox: 5 }, "k2"); // baseline from live data
    expect(computeChanges(blocks, { inbox: 9 }, "k2")).toEqual([{ label: "Inbox", from: "5", to: "9" }]);
    computeChanges(blocks, { inbox: [1, 2] }, "k3"); // a list → its length
    expect(computeChanges(blocks, { inbox: [1, 2, 3, 4] }, "k3")).toEqual([{ label: "Inbox", from: "2", to: "4" }]);
  });

  it("nothing changed → no rows; snapshot keys are independent per device", () => {
    const same = [blk("x", "stat", { label: "X", value: "1" })];
    computeChanges(same, {}, "kA");
    expect(computeChanges(same, {}, "kA")).toEqual([]); // unchanged
    expect(computeChanges(same, {}, "kB")).toEqual([]); // fresh key baselines independently
  });

  it("honors the max cap", () => {
    const mk = (v: string) => [blk("a", "stat", { label: "A", value: v }), blk("b", "stat", { label: "B", value: v }), blk("c", "stat", { label: "C", value: v })];
    computeChanges(mk("0"), {}, "kMax", 2);
    expect(computeChanges(mk("1"), {}, "kMax", 2).length).toBe(2);
  });
});
