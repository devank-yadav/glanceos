import { describe, expect, it } from "vitest";
import type { SourceMapT } from "@glanceos/schema";
import { applyMap } from "./resolve";

// v6.1 derived transforms — pure, total scalar shapers (raw number → human phrase).
const m = (transform: string, transformArg?: string): SourceMapT =>
  ({ path: "", transform, transformArg } as unknown as SourceMapT);

describe("derived transforms (v6.1)", () => {
  it("round — to N decimals", () => {
    expect(applyMap(3.14159, m("round", "2"))).toBe(3.14);
    expect(applyMap(3.7, m("round", "0"))).toBe(4);
  });
  it("currency — symbol-prefixed with 2 decimals", () => {
    const out = String(applyMap(1234.5, m("currency", "$")));
    expect(out.startsWith("$")).toBe(true);
    expect(out).toContain("234.50");
  });
  it("duration — seconds → h/m/s", () => {
    expect(applyMap(3720, m("duration"))).toBe("1h 2m");
    expect(applyMap(150, m("duration"))).toBe("2m");
    expect(applyMap(45, m("duration"))).toBe("45s");
  });
  it("rangeToWords — maps a number to a label by thresholds", () => {
    const arg = "33,67:low,medium,high";
    expect(applyMap(20, m("rangeToWords", arg))).toBe("low");
    expect(applyMap(50, m("rangeToWords", arg))).toBe("medium");
    expect(applyMap(80, m("rangeToWords", arg))).toBe("high");
  });
});
