import type {
  AirQualityDataT, ForecastDataT, MarineDataT, PollenDataT, PrecipDataT, UvDataT, WindDataT,
} from "@glanceos/schema";
import { cached, FAIL, getJSON, TTL } from "./cache";

// The Open-Meteo family — forecast, wind, UV, air quality, precipitation.
// All keyless, all the same provider used by the existing weather block.

const WMO: Record<number, string> = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "fog", 51: "drizzle", 53: "drizzle", 55: "drizzle",
  61: "rain", 63: "rain", 65: "heavy rain", 71: "snow", 73: "snow", 75: "heavy snow",
  80: "showers", 81: "showers", 82: "heavy showers", 95: "storm", 96: "storm", 99: "storm",
};
const wmo = (c: number) => WMO[c] ?? "—";

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (deg: number) => COMPASS[Math.round(((deg % 360) / 22.5)) % 16]!;

const key = (name: string, p: { latitude: number; longitude: number }, extra = "") =>
  `${name}:${p.latitude.toFixed(2)},${p.longitude.toFixed(2)}${extra}`;

const forecastBase = (p: { latitude: number; longitude: number }) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&timezone=auto`;

export function forecastData(p: { latitude: number; longitude: number; days: number }): Promise<ForecastDataT | null> {
  return cached(key("forecast", p, `:${p.days}`), TTL.m30, FAIL, async () => {
    const j = await getJSON<{ daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] } }>(
      `${forecastBase(p)}&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=${p.days}`,
    );
    const d = j.daily;
    return {
      days: d.time.map((t, i) => ({
        day: new Date(t).toLocaleDateString([], { weekday: "short" }),
        hi: Math.round(d.temperature_2m_max[i]!),
        lo: Math.round(d.temperature_2m_min[i]!),
        summary: wmo(d.weather_code[i]!),
      })),
    };
  });
}

export function windData(p: { latitude: number; longitude: number }): Promise<WindDataT | null> {
  return cached(key("wind", p), TTL.m15, FAIL, async () => {
    const j = await getJSON<{ current: { wind_speed_10m: number; wind_direction_10m: number } }>(
      `${forecastBase(p)}&current=wind_speed_10m,wind_direction_10m`,
    );
    return { speed: Math.round(j.current.wind_speed_10m), deg: j.current.wind_direction_10m, dir: compass(j.current.wind_direction_10m) };
  });
}

const uvLevel = (v: number) => (v < 3 ? "Low" : v < 6 ? "Moderate" : v < 8 ? "High" : v < 11 ? "Very high" : "Extreme");

export function uvData(p: { latitude: number; longitude: number }): Promise<UvDataT | null> {
  return cached(key("uv", p), TTL.m30, FAIL, async () => {
    const j = await getJSON<{ daily: { uv_index_max: number[] } }>(`${forecastBase(p)}&daily=uv_index_max&forecast_days=1`);
    const v = Math.round((j.daily.uv_index_max[0] ?? 0) * 10) / 10;
    return { value: v, level: uvLevel(v) };
  });
}

const aqiLevel = (a: number) =>
  a <= 50 ? "Good" : a <= 100 ? "Moderate" : a <= 150 ? "Unhealthy (sensitive)" : a <= 200 ? "Unhealthy" : a <= 300 ? "Very unhealthy" : "Hazardous";

export function airQualityData(p: { latitude: number; longitude: number }): Promise<AirQualityDataT | null> {
  return cached(key("aq", p), TTL.m30, FAIL, async () => {
    const j = await getJSON<{ current: { pm2_5: number; us_aqi: number } }>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.latitude}&longitude=${p.longitude}&current=pm2_5,us_aqi`,
    );
    const aqi = Math.round(j.current.us_aqi);
    return { pm25: Math.round(j.current.pm2_5), aqi, level: aqiLevel(aqi) };
  });
}

export function precipData(p: { latitude: number; longitude: number }): Promise<PrecipDataT | null> {
  return cached(key("precip", p), TTL.m30, FAIL, async () => {
    const j = await getJSON<{ daily: { precipitation_probability_max: number[] } }>(
      `${forecastBase(p)}&daily=precipitation_probability_max&forecast_days=1`,
    );
    const prob = Math.round(j.daily.precipitation_probability_max[0] ?? 0);
    return { probability: prob, summary: prob < 20 ? "dry" : prob < 50 ? "some chance" : prob < 80 ? "likely" : "very likely" };
  });
}

// #87 — pollen: the same Open-Meteo air-quality API (CAMS model). Family values are grains/m³;
// outside the model's coverage every field is null → we return null so the block shows its
// authored fallback instead of a fake zero.
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const maxOf = (...vs: (number | null)[]): number | null => {
  const nn = vs.filter((v): v is number => v != null);
  return nn.length ? Math.max(...nn) : null;
};
export const pollenLevel = (v: number): string => (v < 20 ? "Low" : v < 80 ? "Moderate" : v < 200 ? "High" : "Very high");

export function pollenData(p: { latitude: number; longitude: number }): Promise<PollenDataT | null> {
  return cached(key("pollen", p), TTL.m30, FAIL, async () => {
    const j = await getJSON<{ current: Record<string, unknown> }>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.latitude}&longitude=${p.longitude}` +
        `&current=grass_pollen,birch_pollen,alder_pollen,olive_pollen,mugwort_pollen,ragweed_pollen`,
    );
    const c = j.current;
    const grass = num(c.grass_pollen);
    const tree = maxOf(num(c.birch_pollen), num(c.alder_pollen), num(c.olive_pollen));
    const weed = maxOf(num(c.mugwort_pollen), num(c.ragweed_pollen));
    const worst = maxOf(grass, tree, weed);
    if (worst == null) return null; // no coverage here → calm fallback, not a fake reading
    return { grass, tree, weed, level: pollenLevel(worst) };
  });
}

// #87 — sea state from the Open-Meteo marine API. Inland coordinates error out → cached FAIL →
// null → the block's fallback.
export function marineData(p: { latitude: number; longitude: number }): Promise<MarineDataT | null> {
  return cached(key("marine", p), TTL.m30, FAIL, async () => {
    const j = await getJSON<{ current: Record<string, unknown> }>(
      `https://marine-api.open-meteo.com/v1/marine?latitude=${p.latitude}&longitude=${p.longitude}` +
        `&current=wave_height,wave_direction,wave_period,swell_wave_height,sea_surface_temperature`,
    );
    const c = j.current;
    const wave = num(c.wave_height);
    if (wave == null) return null;
    const deg = num(c.wave_direction);
    return {
      waveM: Math.round(wave * 10) / 10,
      swellM: num(c.swell_wave_height) != null ? Math.round((num(c.swell_wave_height) as number) * 10) / 10 : null,
      waterC: num(c.sea_surface_temperature) != null ? Math.round(num(c.sea_surface_temperature) as number) : null,
      periodS: num(c.wave_period) != null ? Math.round(num(c.wave_period) as number) : null,
      dir: deg != null ? compass(deg) : "—",
    };
  });
}
