import { describe, expect, it } from "vitest";
import { DEFAULT_DITHER, dither, type DitherAlgo, toDitherOpts } from "./dither";

const fill = (n: number, v: number): Uint8Array => { const a = new Uint8Array(n); a.fill(v); return a; };
const onCount = (a: Uint8Array): number => [...a].filter((x) => x === 1).length;
const ALGOS: DitherAlgo[] = ["floyd", "ordered", "threshold"];

describe("dither", () => {
  it("all-black → 0, all-white → 1 for every algorithm", () => {
    for (const algo of ALGOS) {
      expect(onCount(dither(fill(16, 0), 4, 4, { algo, threshold: 128, gamma: 1 }))).toBe(0);
      expect(onCount(dither(fill(16, 255), 4, 4, { algo, threshold: 128, gamma: 1 }))).toBe(16);
    }
  });

  it("the default reproduces the known Floyd output on a tiny ramp", () => {
    expect([...dither(Uint8Array.from([0, 255]), 2, 1)]).toEqual([0, 1]);
    expect([...dither(Uint8Array.from([200, 200]), 2, 1)]).toEqual([1, 1]);
  });

  it("a lower threshold turns more pixels white", () => {
    const mid = fill(100, 130);
    expect(onCount(dither(mid, 10, 10, { algo: "threshold", threshold: 50, gamma: 1 })))
      .toBeGreaterThan(onCount(dither(mid, 10, 10, { algo: "threshold", threshold: 200, gamma: 1 })));
  });

  it("gamma shifts the midtone on-pixel count", () => {
    const mid = fill(256, 128);
    const dark = onCount(dither(mid, 16, 16, { algo: "ordered", threshold: 128, gamma: 2.2 })); // darkens
    const bright = onCount(dither(mid, 16, 16, { algo: "ordered", threshold: 128, gamma: 0.5 })); // brightens
    expect(bright).toBeGreaterThan(dark);
  });

  it("toDitherOpts clamps junk and defaults", () => {
    expect(toDitherOpts({ algo: "weird", threshold: 9999, gamma: 99 })).toEqual({ algo: "floyd", threshold: 254, gamma: 3 });
    expect(toDitherOpts(null)).toEqual(DEFAULT_DITHER);
    expect(toDitherOpts({ algo: "ordered" })).toEqual({ algo: "ordered", threshold: 128, gamma: 1 });
  });
});
