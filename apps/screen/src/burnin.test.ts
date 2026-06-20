import { describe, expect, it } from "vitest";
import { shiftOffset } from "./burnin";

describe("shiftOffset", () => {
  it("starts at origin and stays within a small bounded diamond", () => {
    expect(shiftOffset(0)).toEqual({ dx: 0, dy: 0 });
    for (let t = 0; t < 20; t++) {
      const { dx, dy } = shiftOffset(t);
      expect(Math.abs(dx)).toBeLessThanOrEqual(3);
      expect(Math.abs(dy)).toBeLessThanOrEqual(3);
    }
  });
  it("cycles (period 9) and handles negative ticks", () => {
    expect(shiftOffset(9)).toEqual(shiftOffset(0));
    expect(shiftOffset(-1)).toEqual(shiftOffset(8));
  });
});
