// Pure-math nature calculations — no network, computed on the screen.

const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0); // a known new moon

const PHASE_NAMES = [
  "New moon", "Waxing crescent", "First quarter", "Waxing gibbous",
  "Full moon", "Waning gibbous", "Last quarter", "Waning crescent",
];

export function moonPhase(date: Date): { name: string; illumination: number; waxing: boolean } {
  let age = ((date.getTime() - REF_NEW_MOON) / 86_400_000) % SYNODIC;
  if (age < 0) age += SYNODIC;
  const idx = Math.floor((age / SYNODIC) * 8 + 0.5) % 8;
  return {
    name: PHASE_NAMES[idx]!,
    illumination: Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2) * 100),
    waxing: age < SYNODIC / 2, // lit limb grows on the right in the first half of the cycle
  };
}

// Sunrise/sunset via the well-known SunCalc algorithm (Astronomical Almanac).
const rad = Math.PI / 180;
const dayMs = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;

const toDays = (date: Date): number => date.valueOf() / dayMs - 0.5 + J1970 - J2000;
const fromJulian = (j: number): Date => new Date((j + 0.5 - J1970) * dayMs);

export function sunTimes(date: Date, lat: number, lng: number): { sunrise: Date; sunset: Date } | null {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + (lw + 0) / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(rad * 23.4397));
  const Jtransit = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const h0 = rad * -0.833;
  const cosW = (Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return null; // polar day or night
  const w = Math.acos(cosW);
  const Jset = J2000 + (J0 + (w + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const Jrise = Jtransit - (Jset - Jtransit);
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) };
}

/** ISO 8601 week number. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / dayMs + 1) / 7);
}
