// Server-side sun math — the same SunCalc algorithm the screen runtime uses
// (apps/screen/src/astro.ts), duplicated here so the server stays decoupled from
// the screen bundle (which must remain zod-free and import nothing from the server).
// Pure, no network — used by the automation engine's `sun` trigger + `sun.*` context.

const rad = Math.PI / 180;
const dayMs = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;

const toDays = (date: Date): number => date.valueOf() / dayMs - 0.5 + J1970 - J2000;
const fromJulian = (j: number): Date => new Date((j + 0.5 - J1970) * dayMs);

/** Sunrise/sunset as UTC instants for a given date + location, or null at the
 *  poles (no rise/set that day). Mirrors apps/screen/src/astro.ts:sunTimes. */
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

/** Minute-of-day (0-1439) of an instant in a given IANA timezone. */
export function tzMinuteOfDay(d: Date, tz: string): number {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" })
        .formatToParts(d).map((p) => [p.type, p.value]),
    );
    return (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  } catch {
    return d.getHours() * 60 + d.getMinutes();
  }
}
