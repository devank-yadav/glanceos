import type { WeatherDataT } from "@glanceos/schema";

// Open-Meteo: keyless, generous limits. Cached per rounded coordinate so ten
// screens showing the same city cost one upstream call.
const TTL_MS = 15 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;
const cache = new Map<string, { at: number; data: WeatherDataT | null }>();

// WMO weather interpretation codes → glanceable words
const SUMMARIES: Record<number, string> = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "fog",
  51: "drizzle", 53: "drizzle", 55: "drizzle",
  61: "rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "snow", 73: "snow", 75: "heavy snow", 77: "snow",
  80: "showers", 81: "showers", 82: "heavy showers", 85: "snow showers", 86: "snow showers",
  95: "thunderstorm", 96: "thunderstorm", 99: "thunderstorm",
};

export async function weatherData(props: { latitude: number; longitude: number }): Promise<WeatherDataT | null> {
  const key = `${props.latitude.toFixed(2)},${props.longitude.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.data ? TTL_MS : FAIL_TTL_MS)) return hit.data;

  let data: WeatherDataT | null = null;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(props.latitude));
    url.searchParams.set("longitude", String(props.longitude));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "1");
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const j = (await res.json()) as {
        current: { temperature_2m: number; weather_code: number };
        daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
      };
      data = {
        temperatureC: Math.round(j.current.temperature_2m * 10) / 10,
        summary: SUMMARIES[j.current.weather_code] ?? "—",
        high: j.daily?.temperature_2m_max?.[0],
        low: j.daily?.temperature_2m_min?.[0],
      };
    }
  } catch {
    // offline or upstream down — screens render a placeholder, retry in a minute
  }
  cache.set(key, { at: Date.now(), data });
  return data;
}
