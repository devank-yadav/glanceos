// Floyd–Steinberg error-diffusion dithering: an 8-bit grayscale buffer
// (0 = black … 255 = white) becomes a 1-bit buffer (1 = white, 0 = black).
// Pure and deterministic, so it unit-tests without a browser.

export function floydSteinberg(gray: Uint8Array, w: number, h: number): Uint8Array {
  const buf = Float32Array.from(gray);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = buf[i]!;
      const nv = old < 128 ? 0 : 255;
      out[i] = nv === 255 ? 1 : 0;
      const err = old - nv;
      if (x + 1 < w) buf[i + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) buf[i + w - 1] += (err * 3) / 16;
        buf[i + w] += (err * 5) / 16;
        if (x + 1 < w) buf[i + w + 1] += (err * 1) / 16;
      }
    }
  }
  return out;
}

/** Pack 1-bit pixels MSB-first, row-major, top-down (no header) — the `raw1`
 * framebuffer an MCU draws straight onto an e-paper panel. */
export function packRaw1(bits: Uint8Array, w: number, h: number): Buffer {
  const rowBytes = Math.ceil(w / 8);
  const out = Buffer.alloc(rowBytes * h);
  let off = 0;
  for (let y = 0; y < h; y++) {
    for (let bx = 0; bx < rowBytes; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < w && bits[y * w + x] === 1) byte |= 0x80 >> bit;
      }
      out[off++] = byte;
    }
  }
  return out;
}
