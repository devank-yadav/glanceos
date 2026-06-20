// 1-bit dithering: an 8-bit grayscale buffer (0 = black … 255 = white) becomes
// a 1-bit buffer (1 = white, 0 = black). Pure and deterministic → unit-tests
// without a browser. Three algorithms, an optional threshold, and a gamma LUT so
// each panel can be tuned; the defaults reproduce the original Floyd output.

export type DitherAlgo = "floyd" | "ordered" | "threshold";
export interface DitherOpts { algo: DitherAlgo; threshold: number; gamma: number }
export const DEFAULT_DITHER: DitherOpts = { algo: "floyd", threshold: 128, gamma: 1 };

/** Coerce stored render_opts JSON to a valid DitherOpts (clamped, with defaults). */
export function toDitherOpts(o: Record<string, unknown> | null | undefined): DitherOpts {
  const algo = o?.algo === "ordered" || o?.algo === "threshold" ? o.algo : "floyd";
  const threshold = typeof o?.threshold === "number" ? Math.max(1, Math.min(254, Math.round(o.threshold))) : 128;
  const gamma = typeof o?.gamma === "number" ? Math.max(0.3, Math.min(3, o.gamma)) : 1;
  return { algo, threshold, gamma };
}

// 4×4 Bayer matrix (0..15) for ordered dithering.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function gammaAdjust(gray: Uint8Array, gamma: number): Uint8Array {
  if (gamma === 1) return gray;
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(255 * Math.pow(gray[i]! / 255, gamma))));
  return out;
}

/** Original Floyd–Steinberg at the standard 128 threshold (kept for callers/tests). */
export function floydSteinberg(gray: Uint8Array, w: number, h: number): Uint8Array {
  return dither(gray, w, h, DEFAULT_DITHER);
}

export function dither(gray: Uint8Array, w: number, h: number, opts: DitherOpts = DEFAULT_DITHER): Uint8Array {
  const src = gammaAdjust(gray, opts.gamma);
  const out = new Uint8Array(w * h);

  if (opts.algo === "threshold") {
    for (let i = 0; i < src.length; i++) out[i] = src[i]! >= opts.threshold ? 1 : 0;
    return out;
  }
  if (opts.algo === "ordered") {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = ((BAYER4[(y % 4) * 4 + (x % 4)]! + 0.5) / 16) * 255; // 0..255 threshold map
        out[y * w + x] = src[y * w + x]! >= t ? 1 : 0;
      }
    }
    return out;
  }

  // floyd: error diffusion at the configurable threshold
  const buf = Float32Array.from(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = buf[i]!;
      const nv = old < opts.threshold ? 0 : 255;
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
