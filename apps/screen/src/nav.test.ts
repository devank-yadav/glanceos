import { describe, expect, it } from "vitest";
import { nearestInDirection, type Rect } from "./nav";

const r = (left: number, top: number): Rect => ({ left, top, right: left + 10, bottom: top + 10 });

describe("nearestInDirection", () => {
  const cur = r(100, 100);

  it("picks the aligned neighbour in each direction", () => {
    const cands = [r(100, 0), r(100, 200), r(0, 100), r(200, 100)]; // up, down, left, right
    expect(nearestInDirection(cur, cands, "up")).toBe(0);
    expect(nearestInDirection(cur, cands, "down")).toBe(1);
    expect(nearestInDirection(cur, cands, "left")).toBe(2);
    expect(nearestInDirection(cur, cands, "right")).toBe(3);
  });

  it("returns -1 when nothing lies in that direction", () => {
    expect(nearestInDirection(cur, [r(100, 0)], "down")).toBe(-1);
  });

  it("prefers the closer, better-aligned candidate", () => {
    const cands = [r(300, 105), r(160, 101)]; // far vs near (both to the right)
    expect(nearestInDirection(cur, cands, "right")).toBe(1);
  });
});
