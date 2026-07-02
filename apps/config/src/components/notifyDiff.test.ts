import { describe, expect, it } from "vitest";
import { freshSince } from "./notifyDiff";

const n = (id: number, read = false) => ({ id, kind: "info", message: `m${id}`, read });

describe("#45 freshSince (desktop-banner diff)", () => {
  it("first look baselines silently: no banners, watermark advances", () => {
    const r = freshSince([n(5), n(4), n(3)], 0);
    expect(r.fresh).toEqual([]);
    expect(r.maxId).toBe(5);
  });

  it("banners only what is newer than the watermark AND unread, oldest first", () => {
    const r = freshSince([n(7), n(6, true), n(5), n(4)], 4);
    expect(r.fresh.map((x) => x.id)).toEqual([5, 7]); // 6 is read, 4 already seen
    expect(r.maxId).toBe(7);
  });

  it("no news → nothing fresh, watermark stays", () => {
    const r = freshSince([n(4), n(3)], 4);
    expect(r.fresh).toEqual([]);
    expect(r.maxId).toBe(4);
  });

  it("an emptied feed (clear-all) never regresses the watermark", () => {
    const r = freshSince([], 9);
    expect(r.maxId).toBe(9);
    expect(r.fresh).toEqual([]);
  });
});
