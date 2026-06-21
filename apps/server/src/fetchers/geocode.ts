import { cached, FAIL, getJSON, TTL } from "./cache";

// City → coordinates via Open-Meteo's free, keyless geocoding API (same provider
// the weather blocks already use). Goes through the SSRF-guarded getJSON, so it
// inherits the DNS-rebind / redirect protections. Used by the per-screen location
// picker; the chosen coordinates are stored on the device.

export interface GeoHit {
  name: string;
  admin1: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null; // IANA tz Open-Meteo returns with each place → pick a city, set the clock too
}

interface OMResult {
  name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string;
}

/** Up to 8 matching places for a free-text city query (empty for short input). */
export function geocodeSearch(query: string): Promise<GeoHit[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return Promise.resolve([]);
  return cached(`geocode:${q.toLowerCase()}`, TTL.h12, FAIL, async () => {
    const j = await getJSON<{ results?: OMResult[] }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`,
    );
    return (j.results ?? []).map((r) => ({
      name: r.name,
      admin1: r.admin1 ?? null,
      country: r.country ?? null,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone ?? null,
    }));
  }).then((hits) => hits ?? []);
}

interface RevResult { city?: string; locality?: string; principalSubdivision?: string; countryName?: string }

/** Coordinates → a human place name ("Tokyo, Japan"), via BigDataCloud's free,
 *  keyless reverse-geocode endpoint. SSRF-guarded through getJSON. Used after a
 *  one-time browser geolocation so a saved home shows its real city, not numbers.
 *  Returns null on failure → the caller falls back to a generic label. */
export function reverseGeocode(latitude: number, longitude: number): Promise<{ name: string } | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return Promise.resolve(null);
  const lat = latitude.toFixed(4), lon = longitude.toFixed(4);
  return cached(`revgeo:${lat},${lon}`, TTL.h12, FAIL, async () => {
    const j = await getJSON<RevResult>(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    );
    const place = j.city || j.locality || j.principalSubdivision || "";
    const name = [place, j.countryName].filter(Boolean).join(", ");
    return { name: name || "My location" };
  }).then((r) => r ?? null);
}
