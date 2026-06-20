import { describe, expect, it } from "vitest";
import { encodeQR, pickVersion, qrSvg } from "./qr";

// The encoder is ported verbatim from apps/config (which has the rigorous
// round-trip/decoder suite); here we just guard the port + the SVG wrapper.
describe("screen QR encoder", () => {
  it("encodes a string to a square matrix with three finder patterns", () => {
    const m = encodeQR("https://glance.example/?claim=ABC-123");
    const size = m.length;
    expect((size - 17) % 4).toBe(0);
    for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      expect(m[r!]![c!]).toBe(true);        // finder corner dark
      expect(m[r! + 1]![c! + 1]).toBe(false); // inner ring light
      expect(m[r! + 3]![c! + 3]).toBe(true);  // 3×3 centre dark
    }
  });

  it("qrSvg returns a self-contained <svg> with a path", () => {
    const svg = qrSvg("hello", { size: 100 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<path");
  });

  it("pickVersion grows with length, caps at v10-M", () => {
    expect(pickVersion(10)).toBe(1);
    expect(pickVersion(216)).toBe(null);
  });
});
