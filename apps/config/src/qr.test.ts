import { describe, expect, it } from "vitest";
import { encodeQR, pickVersion, rsGenPoly } from "./qr";

// GF(256) log, to compare generator-polynomial coefficients against the QR
// spec's published alpha exponents (independent ground truth for the RS core).
const LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } })();

describe("Reed–Solomon generator polynomial (spec ground truth)", () => {
  it("matches the published exponents for 7 and 10 EC codewords", () => {
    expect(rsGenPoly(7).map((v) => LOG[v])).toEqual([0, 87, 229, 146, 149, 238, 102, 21]);
    expect(rsGenPoly(10).map((v) => LOG[v])).toEqual([0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45]);
  });
});

describe("version selection", () => {
  it("picks the smallest version that fits, null past v10-M", () => {
    expect(pickVersion(10)).toBe(1);
    expect(pickVersion(14)).toBe(1); // v1-M holds 14 bytes after the 12-bit header
    expect(pickVersion(15)).toBe(2);
    expect(pickVersion(120)).toBe(7);
    expect(pickVersion(216)).toBe(null); // > v10-M usable capacity
  });
});

describe("matrix structure", () => {
  it("is square, sized 17+4v, with three finder patterns", () => {
    const m = encodeQR("https://glance.example/s/AbC123");
    const size = m.length;
    expect((size - 17) % 4).toBe(0);
    for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      expect(m[r]![c]).toBe(true); // finder corner dark
      expect(m[r + 1]![c + 1]).toBe(false); // inner ring light
      expect(m[r + 3]![c + 3]).toBe(true); // 3×3 centre dark
    }
  });
});

// ---- independent decoder: reverse the encoder for single-group versions
// (v1–v7, equal-size blocks) and confirm the original string round-trips. This
// validates zigzag placement, masking, and interleaving end-to-end. ----
const M_SPECS: Record<number, { ec: number; blocks: number; data: number }> = {
  1: { ec: 10, blocks: 1, data: 16 }, 2: { ec: 16, blocks: 1, data: 28 },
  3: { ec: 26, blocks: 1, data: 44 }, 4: { ec: 18, blocks: 2, data: 32 },
  5: { ec: 24, blocks: 2, data: 43 }, 6: { ec: 16, blocks: 4, data: 27 },
  7: { ec: 18, blocks: 4, data: 31 },
};
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38] };

function fnMask(version: number, size: number): boolean[][] {
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (r: number, c: number) => { if (r >= 0 && c >= 0 && r < size && c < size) fn[r]![c] = true; };
  const finder = (r: number, c: number) => { for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) mark(r + dr, c + dc); };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { mark(6, i); mark(i, 6); }
  const ac = ALIGN[version]!;
  for (const r of ac) for (const c of ac) {
    if ((r <= 7 && c <= 7) || (r <= 7 && c >= size - 8) || (r >= size - 8 && c <= 7)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(r + dr, c + dc);
  }
  mark(size - 8, 8);
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(8, size - 1 - i); mark(size - 1 - i, 8); }
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { mark(i, size - 11 + j); mark(size - 11 + j, i); }
  return fn;
}
const MASK = (m: number, r: number, c: number): boolean => [
  (r + c) % 2 === 0, r % 2 === 0, c % 3 === 0, (r + c) % 3 === 0,
  (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, ((r * c) % 2) + ((r * c) % 3) === 0,
  (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
][m]!;

/** Recover the applied mask from the (BCH-encoded) format information region. */
function readMask(matrix: boolean[][]): number {
  const size = matrix.length;
  const bit = (r: number, c: number) => (matrix[r]![c] ? 1 : 0);
  let fmt = 0;
  for (let i = 0; i < 6; i++) fmt |= bit(size - 1 - i, 8) << i; // bits 0–5
  fmt |= bit(8, 7) << 6; // bit 6
  fmt |= bit(8, 8) << 7; // bit 7
  for (let i = 0; i < 7; i++) fmt |= bit(8, size - 7 + i) << (8 + i); // bits 8–14
  fmt ^= 0x5412;
  return (fmt >> 10) & 0b111; // top 5 bits = level(2)|mask(3) → low 3 = mask
}

function decode(matrix: boolean[][]): string | null {
  const size = matrix.length;
  const version = (size - 17) / 4;
  const spec = M_SPECS[version];
  if (!spec) return null;
  const fn = fnMask(version, size);
  const m = readMask(matrix);
  const bits: number[] = [];
  for (let col = size - 1; col > 0; col -= 2) {
    const cc = col === 6 ? 5 : col;
    for (let i = 0; i < size; i++) {
      const up = ((cc + 1) & 2) === 0;
      const row = up ? size - 1 - i : i;
      for (const c of [cc, cc - 1]) if (!fn[row]![c]) bits.push((matrix[row]![c] ? 1 : 0) ^ (MASK(m, row, c) ? 1 : 0));
    }
  }
  const cw: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  // de-interleave equal-size blocks → concatenated data codewords
  const data: number[] = [];
  for (let b = 0; b < spec.blocks; b++) for (let i = 0; i < spec.data; i++) data.push(cw[i * spec.blocks + b]!);
  let p = 0; const read = (n: number) => { let v = 0; for (let i = 0; i < n; i++) { v = (v << 1) | ((data[p >> 3]! >> (7 - (p & 7))) & 1); p++; } return v; };
  if (read(4) !== 0b0100) return null;
  const len = read(version <= 9 ? 8 : 16);
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(read(8));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(out)); } catch { return null; }
}

describe("encode → decode round-trip (v1–v7)", () => {
  for (const s of ["hi", "https://glance.example/s/AbC123", "https://my.glanceos.host/screen?share=9f3a2b7c1d&v=1", "x".repeat(100)]) {
    it(`round-trips ${JSON.stringify(s.slice(0, 24))}${s.length > 24 ? "…" : ""}`, () => {
      expect(decode(encodeQR(s))).toBe(s);
    });
  }
});
