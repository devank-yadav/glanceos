// Tiny B&W chart + novelty-clock helpers for the block renderers. Pure,
// no dependencies, string-building SVG (numbers only — never user markup).

export const nums = (s: string): number[] =>
  s.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));

export function sparkSvg(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 100;
  const H = 30;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`)
    .join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark-svg"><polyline points="${pts}"/></svg>`;
}

export function barSvg(values: number[]): string {
  if (!values.length) return "";
  const max = Math.max(1, ...values);
  const n = values.length;
  const gap = 6;
  const bw = (100 - gap * (n - 1)) / n;
  const bars = values
    .map((v, i) => {
      const h = (v / max) * 100;
      return `<rect x="${(i * (bw + gap)).toFixed(2)}" y="${(100 - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}"/>`;
    })
    .join("");
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="barchart-svg">${bars}</svg>`;
}

export function ringSvg(pct: number): string {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    `<svg viewBox="0 0 100 100" class="ring-svg">` +
    `<circle cx="50" cy="50" r="${r}" class="ring-track"/>` +
    `<circle cx="50" cy="50" r="${r}" class="ring-fill" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 50 50)"/>` +
    `</svg>`
  );
}

const ROMAN: Array<[number, string]> = [
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
function toRoman(n: number): string {
  if (n === 0) return "·";
  let out = "";
  let v = n;
  // minutes go to 59 → allow L (50) and X chains
  const table: Array<[number, string]> = [[50, "L"], [40, "XL"], ...ROMAN];
  for (const [val, sym] of table) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}
export function romanTime(d: Date): string {
  const h = ((d.getHours() + 11) % 12) + 1;
  return `${toRoman(h)}:${toRoman(d.getMinutes())}`;
}

export function seasonOf(month: number, hemisphere: "north" | "south"): { name: string } {
  const north = ["Winter", "Spring", "Summer", "Autumn"];
  let i = month <= 1 || month === 11 ? 0 : month <= 4 ? 1 : month <= 7 ? 2 : 3;
  if (hemisphere === "south") i = (i + 2) % 4;
  return { name: north[i]! };
}

const ZODIAC: Array<{ sign: string; emoji: string; until: [number, number] }> = [
  { sign: "Capricorn", emoji: "♑", until: [1, 19] },
  { sign: "Aquarius", emoji: "♒", until: [2, 18] },
  { sign: "Pisces", emoji: "♓", until: [3, 20] },
  { sign: "Aries", emoji: "♈", until: [4, 19] },
  { sign: "Taurus", emoji: "♉", until: [5, 20] },
  { sign: "Gemini", emoji: "♊", until: [6, 20] },
  { sign: "Cancer", emoji: "♋", until: [7, 22] },
  { sign: "Leo", emoji: "♌", until: [8, 22] },
  { sign: "Virgo", emoji: "♍", until: [9, 22] },
  { sign: "Libra", emoji: "♎", until: [10, 22] },
  { sign: "Scorpio", emoji: "♏", until: [11, 21] },
  { sign: "Sagittarius", emoji: "♐", until: [12, 21] },
  { sign: "Capricorn", emoji: "♑", until: [12, 31] },
];
export function zodiacOf(month: number, day: number): { sign: string; emoji: string } {
  for (const z of ZODIAC) {
    const [m, d] = z.until;
    if (month < m || (month === m && day <= d)) return { sign: z.sign, emoji: z.emoji };
  }
  return ZODIAC[0]!;
}
