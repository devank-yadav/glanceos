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
}

interface OMResult {
  name: string; admin1?: string; country?: string; latitude: number; longitude: number;
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
    }));
  }).then((hits) => hits ?? []);
}
