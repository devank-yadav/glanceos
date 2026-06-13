import { describe, expect, it } from "vitest";
import { encodeBmp1 } from "./render/bmp";
import { floydSteinberg, packRaw1 } from "./render/dither";

describe("dither + 1-bit encoders (no browser needed)", () => {
  it("maps pure black to 0 and pure white to 1", () => {
    expect([...floydSteinberg(new Uint8Array([0, 0, 0, 0]), 2, 2)]).toEqual([0, 0, 0, 0]);
    expect([...floydSteinberg(new Uint8Array([255, 255, 255, 255]), 2, 2)]).toEqual([1, 1, 1, 1]);
  });

  it("dithers a uniform mid-gray to a roughly even mix", () => {
    const bits = floydSteinberg(new Uint8Array(64).fill(128), 8, 8);
    const on = bits.reduce((n, b) => n + b, 0);
    expect(on).toBeGreaterThan(16);
    expect(on).toBeLessThan(56);
  });

  it("packs raw1 MSB-first", () => {
    // 8×1, white at columns 0 and 7 → 0b1000_0001 = 0x81
    const bits = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 1]);
    const buf = packRaw1(bits, 8, 1);
    expect(buf).toHaveLength(1);
    expect(buf[0]).toBe(0x81);
  });

  it("encodes a valid 1-bit BMP", () => {
    const w = 8;
    const h = 2;
    const bmp = encodeBmp1(new Uint8Array(w * h).fill(1), w, h);
    expect(bmp.toString("ascii", 0, 2)).toBe("BM");
    expect(bmp.readUInt32LE(2)).toBe(bmp.length); // file size
    expect(bmp.readInt32LE(18)).toBe(w);
    expect(bmp.readInt32LE(22)).toBe(h);
    expect(bmp.readUInt16LE(28)).toBe(1); // 1 bpp
    // header (62) + 2 rows × 4-byte stride = 70
    expect(bmp.length).toBe(62 + 8);
  });
});
