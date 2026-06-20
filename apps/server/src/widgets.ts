import type { LayoutT } from "@glanceos/schema";
import { resolveSource, type ConnLookup } from "./providers/resolve";
import { calendarData } from "./fetchers/ics";
import { jsonFeedData } from "./fetchers/jsonfeed";
import {
  cryptoData, currencyData, factData, githubData, hackerNewsData, headlinesData,
  holidayData, issData, onThisDayData, quoteData, wikiData,
} from "./fetchers/live";
import { airQualityData, forecastData, precipData, uvData, windData } from "./fetchers/openmeteo";
import { weatherData } from "./fetchers/weather";
import { customDataWidget } from "./customdata";
import { queueData } from "./queues";
import { tasksData } from "./tasks";

/**
 * Turn a layout into the data its blocks need, keyed by block id, scoped to
 * the owning user. Blocks not listed here (clock, charts, trackers, computed
 * time/nature, etc.) render entirely on the screen from their props.
 * Every live fetcher resolves to null on failure → the screen shows a calm
 * placeholder, so this never throws and works offline.
 */
// A screen's location overrides a geo block's coordinates only when that block
// is still at the schema default (28.6139, 77.209) — i.e. the user never set a
// per-block location of their own. Keeps the precedence: block geo → screen geo.
const DEFAULT_LAT = 28.6139, DEFAULT_LON = 77.209;
export interface Geo { latitude: number; longitude: number }
function geoFor<T extends { latitude?: number; longitude?: number }>(props: T, deviceGeo?: Geo): T {
  if (deviceGeo && typeof props.latitude === "number" && typeof props.longitude === "number" &&
    Math.abs(props.latitude - DEFAULT_LAT) < 1e-4 && Math.abs(props.longitude - DEFAULT_LON) < 1e-4) {
    return { ...props, latitude: deviceGeo.latitude, longitude: deviceGeo.longitude };
  }
  return props;
}

export async function resolveWidgetData(layout: LayoutT, userId: string, connLookup?: ConnLookup, deviceGeo?: Geo): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};
  const now = new Date();
  const blocks = layout.rows.flatMap((row) => row.blocks);
  const g = <T extends { latitude?: number; longitude?: number }>(p: T): T => geoFor(p, deviceGeo);
  await Promise.all(
    blocks.map(async (b) => {
      // A bound block draws from a live source instead of its props. Resolves to
      // null on any failure → the screen falls back to the block's props.
      if (b.source) {
        const out = await resolveSource(b.source, connLookup);
        if (out !== null) data[b.id] = out;
        return;
      }
      switch (b.type) {
        case "weather": data[b.id] = await weatherData(g(b.props)); break;
        case "calendar": data[b.id] = await calendarData(b.props); break;
        case "tasks": data[b.id] = tasksData(b.props, userId); break;
        case "queue": data[b.id] = queueData(b.props, userId); break;
        case "customData": { const cd = customDataWidget(b.props, userId); if (cd) data[b.id] = cd; break; }
        // location-aware: screens inherit their device location for untouched blocks
        case "sunriseSunset": case "daylight": case "goldenHour": {
          const gp = g(b.props as { latitude?: number; longitude?: number });
          if (gp !== b.props) data[b.id] = { latitude: gp.latitude, longitude: gp.longitude };
          break;
        }
        // live
        case "forecast": data[b.id] = await forecastData(g(b.props)); break;
        case "windCompass": data[b.id] = await windData(g(b.props)); break;
        case "uvIndex": data[b.id] = await uvData(g(b.props)); break;
        case "airQuality": data[b.id] = await airQualityData(g(b.props)); break;
        case "precip": data[b.id] = await precipData(g(b.props)); break;
        case "headlines": data[b.id] = await headlinesData(b.props); break;
        case "currencyRate": data[b.id] = await currencyData(b.props); break;
        case "cryptoPrice": data[b.id] = await cryptoData(b.props); break;
        case "onThisDay": data[b.id] = await onThisDayData(b.props, now); break;
        case "wikiToday": data[b.id] = await wikiData(b.props); break;
        case "quoteLive": data[b.id] = await quoteData(); break;
        case "factLive": data[b.id] = await factData(); break;
        case "hackerNews": data[b.id] = await hackerNewsData(b.props); break;
        case "githubStats": data[b.id] = await githubData(b.props); break;
        case "nextHoliday": data[b.id] = await holidayData(b.props, now); break;
        case "issNow": data[b.id] = await issData(); break;
        case "jsonFeed": data[b.id] = await jsonFeedData(b.props); break;
        default: break;
      }
    }),
  );
  return data;
}
