// Dependency-free QR encoder — just enough to render a share URL as a scannable
// code (byte mode, ECC level M, versions 1–10, best-mask selection). Lives in
// the config bundle only; never shipped to apps/screen. Pure → unit-tested.

// ---- GF(256) arithmetic (primitive polynomial 0x11d) ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Reed–Solomon generator polynomial for `n` EC codewords, leading coeff first
 *  (i.e. [α^0, …] — the order rsEncode and the spec tables use). */
export function rsGenPoly(n: number): number[] {
  let poly = [1]; // built constant-first, reversed to leading-first below
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j]!, EXP[i]);
      next[j + 1] ^= poly[j]!;
    }
    poly = next;
  }
  return poly.reverse();
}

/** RS error-correction codewords for one data block. */
export function rsEncode(data: number[], n: number): number[] {
  const gen = rsGenPoly(n);
  const res = new Array(n).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) for (let i = 0; i < gen.length - 1; i++) res[i] ^= gfMul(gen[i + 1]!, factor);
  }
  return res;
}

// ---- ECC level M block structure, versions 1–10 ----
interface VSpec { ec: number; groups: [number, number][] } // [blocks, dataCodewordsPerBlock]
const M_SPECS: Record<number, VSpec> = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] },
};
const totalDataCW = (s: VSpec): number => s.groups.reduce((t, [b, d]) => t + b * d, 0);
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const countBits = (v: number): number => (v <= 9 ? 8 : 16); // byte-mode char-count indicator

/** Smallest version (1–10) whose ECC-M capacity holds `len` bytes, or null if too long. */
export function pickVersion(len: number): number | null {
  for (let v = 1; v <= 10; v++) {
    const cap = totalDataCW(M_SPECS[v]!) * 8;
    if (4 + countBits(v) + len * 8 <= cap) return v;
  }
  return null;
}

// ---- bitstream → final interleaved codewords ----
function dataCodewords(bytes: number[], version: number): number[] {
  const spec = M_SPECS[version]!;
  const total = totalDataCW(spec);
  const bits: number[] = [];
  const push = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); // byte mode
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);
  for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; cw.length < total; pad ^= 0xec ^ 0x11) cw.push(pad); // 0xEC,0x11,…
  return cw;
}

function interleave(cw: number[], version: number): number[] {
  const spec = M_SPECS[version]!;
  const blocks: number[][] = [];
  const eccs: number[][] = [];
  let p = 0;
  for (const [count, dataLen] of spec.groups) {
    for (let b = 0; b < count; b++) {
      const data = cw.slice(p, p + dataLen); p += dataLen;
      blocks.push(data);
      eccs.push(rsEncode(data, spec.ec));
    }
  }
  const out: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) out.push(b[i]!);
  for (let i = 0; i < spec.ec; i++) for (const e of eccs) out.push(e[i]!);
  return out;
}

// ---- matrix construction ----
type Grid = (number | null)[][];
const FORMAT_MASK = 0x5412;

function bch15(data5: number): number {
  let d = data5 << 10;
  for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0x537 << (i - 10);
  return ((data5 << 10) | d) ^ FORMAT_MASK;
}
function bch18(version: number): number {
  let d = version << 12;
  for (let i = 17; i >= 12; i--) if ((d >> i) & 1) d ^= 0x1f25 << (i - 12);
  return (version << 12) | d;
}

function buildMatrix(version: number, finalCW: number[]): boolean[][] {
  const size = 17 + version * 4;
  const g: Grid = Array.from({ length: size }, () => new Array(size).fill(null));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false)); // function-module mask

  const setF = (r: number, c: number, v: number) => { g[r]![c] = v; fn[r]![c] = true; };

  const finder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const dark = inRing && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      setF(rr, cc, dark ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) { const v = i % 2 === 0 ? 1 : 0; setF(6, i, v); setF(i, 6, v); } // timing

  const ac = ALIGN[version]!;
  for (const r of ac) for (const c of ac) {
    if ((r <= 7 && c <= 7) || (r <= 7 && c >= size - 8) || (r >= size - 8 && c <= 7)) continue; // skip finder overlap
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      setF(r + dr, c + dc, ring === 1 ? 0 : 1);
    }
  }

  setF(size - 8, 8, 1); // dark module

  // Reserve format-info modules (filled after masking).
  for (let i = 0; i < 9; i++) { if (!fn[8]![i]) setF(8, i, 0); if (!fn[i]![8]) setF(i, 8, 0); }
  for (let i = 0; i < 8; i++) { if (!fn[8]![size - 1 - i]) setF(8, size - 1 - i, 0); if (!fn[size - 1 - i]![8]) setF(size - 1 - i, 8, 0); }
  // Reserve version-info modules (v7+).
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { setF(i, size - 11 + j, 0); setF(size - 11 + j, i, 0); }

  // Place data bits in the zigzag pattern.
  const bitAt = (idx: number): number => (finalCW[idx >> 3]! >> (7 - (idx & 7))) & 1;
  let bit = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5; // skip the vertical timing column
    for (let i = 0; i < size; i++) {
      const up = ((col + 1) & 2) === 0; // direction by column pair
      const row = up ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (!fn[row]![c]) { g[row]![c] = bit < finalCW.length * 8 ? bitAt(bit) : 0; bit++; }
      }
    }
  }

  // Choose the lowest-penalty mask.
  const maskFn = (m: number, r: number, c: number): boolean => {
    switch (m) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  };
  let best: boolean[][] | null = null, bestPenalty = Infinity, bestMask = 0;
  for (let m = 0; m < 8; m++) {
    const t: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const v = g[r]![c] ?? 0;
      t[r]![c] = (fn[r]![c] ? v : v ^ (maskFn(m, r, c) ? 1 : 0)) === 1;
    }
    applyFormat(t, fn, m, version);
    const p = penalty(t);
    if (p < bestPenalty) { bestPenalty = p; best = t; bestMask = m; }
  }
  void bestMask;
  return best!;
}

function applyFormat(t: boolean[][], fn: boolean[][], mask: number, version: number): void {
  const size = t.length;
  const fmt = bch15((0b00 << 3) | mask); // ECC level M = 0b00
  const fbit = (i: number) => ((fmt >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) { t[8]![i] = fbit(i); t[i]![8] = fbit(14 - i); }
  t[8]![7] = fbit(6); t[8]![8] = fbit(7); t[7]![8] = fbit(8);
  for (let i = 0; i <= 5; i++) t[size - 1 - i]![8] = fbit(i);
  for (let i = 0; i <= 6; i++) t[8]![size - 7 + i] = fbit(8 + i);
  void fn;
  if (version >= 7) {
    const vinfo = bch18(version);
    for (let i = 0; i < 18; i++) {
      const on = ((vinfo >> i) & 1) === 1;
      const r = Math.floor(i / 3), c = i % 3;
      t[r]![size - 11 + c] = on; t[size - 11 + c]![r] = on;
    }
  }
}

function penalty(t: boolean[][]): number {
  const size = t.length; let p = 0;
  // Rule 1: runs of 5+ same-colour modules in a row/column.
  for (let r = 0; r < size; r++) for (const horiz of [true, false]) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      const a = horiz ? t[r]![c] : t[c]![r], b = horiz ? t[r]![c - 1] : t[c - 1]![r];
      if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1;
    }
  }
  // Rule 2: 2×2 blocks of the same colour.
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++)
    if (t[r]![c] === t[r]![c + 1] && t[r]![c] === t[r + 1]![c] && t[r]![c] === t[r + 1]![c + 1]) p += 3;
  // Rule 4: deviation from 50% dark.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (t[r]![c]) dark++;
  const pct = (dark * 100) / (size * size);
  p += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return p;
}

/** Encode a string to a boolean module matrix (true = dark). Throws if too long for v10-M. */
export function encodeQR(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = pickVersion(bytes.length);
  if (version == null) throw new Error("QR: text too long for v10-M");
  return buildMatrix(version, interleave(dataCodewords(bytes, version), version));
}

/** Render a module matrix as a crisp, self-contained SVG string. */
export function qrToSvg(matrix: boolean[][], opts: { size?: number; quiet?: number } = {}): string {
  const n = matrix.length;
  const quiet = opts.quiet ?? 4;
  const dim = n + quiet * 2;
  const px = opts.size ?? 220;
  let rects = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (matrix[r]![c]) rects += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="QR code">`
    + `<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${rects}" fill="#000"/></svg>`;
}

/** Convenience: text → SVG string. */
export const qrSvg = (text: string, opts?: { size?: number; quiet?: number }): string => qrToSvg(encodeQR(text), opts);
