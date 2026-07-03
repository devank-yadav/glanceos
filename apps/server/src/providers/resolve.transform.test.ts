import { describe, expect, it } from "vitest";
import { SourceMap, type SourceMapT } from "@glanceos/schema";
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

describe("#23 transform chaining", () => {
  const m = (over: Record<string, unknown>) => SourceMap.parse(over);

  it("chains scalar shapers after an array reducer: sum → round → currency", () => {
    const map = m({ transform: "sum", chain: [{ t: "round", arg: "0" }, { t: "currency", arg: "€" }] });
    expect(applyMap([1.2, 2.3, 3.6], map)).toBe("€7.00");
  });

  it("count → rangeToWords turns a list length into a word", () => {
    const map = m({ transform: "count", chain: [{ t: "rangeToWords", arg: "3,6:quiet,busy,slammed" }] });
    expect(applyMap(["a", "b", "c", "d"], map)).toBe("busy");
  });

  it("a mid-chain shape mismatch degrades to null (the placeholder), like today", () => {
    const map = m({ transform: "round", chain: [{ t: "sum" }] }); // round yields a scalar; sum needs an array
    expect(applyMap(3.7, map)).toBeNull();
  });

  it("a chain alone (primary transform none) still shapes the raw value", () => {
    const map = m({ transform: "none", path: "", chain: [{ t: "round", arg: "1" }] });
    expect(applyMap(3.14159, map)).toBe(3.1);
  });

  it("no chain = byte-for-byte today's behavior; the schema caps chains at 5", () => {
    expect(applyMap(3.14159, m({ transform: "round", transformArg: "2" }))).toBe(3.14);
    expect(SourceMap.safeParse({ chain: Array.from({ length: 6 }, () => ({ t: "round" })) }).success).toBe(false);
  });
});
