import type { LayoutT, WidgetT } from "@glanceos/schema";
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
import { metricSeries } from "./metrics";
import { promptForDay, recentJournal } from "./journal";
import { queueData } from "./queues";
import { listTasks, tasksData } from "./tasks";
import { composeContextualGreeting, composeDailyBrief, dayContext } from "./daycontext";
import { computeChanges } from "./whatchanged";

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

// Every block in the document, across the base `rows`, extra `pages` (v10
// multi-page rotation, Row[][]), and `zones` (free-form signage rectangles, each
// with its own rows). The screen renders any of these by data[block.id], so a
// bound/live block on page 2 or inside a zone must be resolved too — otherwise it
// silently shows its placeholder props. (Block ids are board-wide unique.)
export function allBlocks(layout: LayoutT): WidgetT[] {
  const out = layout.rows.flatMap((row) => row.blocks);
  for (const page of layout.pages ?? []) for (const row of page) out.push(...row.blocks);
  for (const zone of layout.zones ?? []) for (const row of zone.rows) out.push(...row.blocks);
  return out;
}

// #21 — last-known cache. A bound block's last successfully-resolved value, keyed by block id.
// When a fetch blips (resolveSource → null), we serve this instead of dropping to the block's
// props, so the wall never goes blank on a network hiccup — and we stamp it stale (the reserved
// `__stale` data key) so a future "as of 5m ago" badge can show it isn't fresh. Memory-bounded
// (insertion-ordered eviction). Identical for everyone resolving that block, so it's safe to
// share across devices/requests (the value is the source's output, not user-specific).
const LAST_GOOD_CAP = 2000;
const lastGood = new Map<string, { value: unknown; at: number }>();
/** Record a block's freshly-resolved value (exported for tests). */
export function rememberResolved(blockId: string, value: unknown, at: number): void {
  lastGood.delete(blockId); // re-insert so it becomes the newest (eviction order)
  lastGood.set(blockId, { value, at });
  if (lastGood.size > LAST_GOOD_CAP) {
    const oldest = lastGood.keys().next().value;
    if (oldest !== undefined) lastGood.delete(oldest);
  }
}
/** The last good value for a block, or undefined if never resolved (exported for tests). */
export function lastResolved(blockId: string): { value: unknown; at: number } | undefined {
  return lastGood.get(blockId);
}

export async function resolveWidgetData(layout: LayoutT, userId: string, connLookup?: ConnLookup, deviceGeo?: Geo, snapshotKey?: string, commit = true): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};
  const staleAt: Record<string, number> = {}; // #21 — block ids served from the last-known cache
  const now = new Date();
  const blocks = allBlocks(layout);
  const g = <T extends { latitude?: number; longitude?: number }>(p: T): T => geoFor(p, deviceGeo);
  // #148/#154 — compose the per-user "day context" (calendar + weather) at most ONCE, and
  // only when the board actually has a block that needs it, so ordinary boards pay nothing.
  const needsDay = blocks.some((b) => b.type === "dailyBrief" || (b.type === "greeting" && (b.props as { showContext?: boolean }).showContext === true));
  const dctx = needsDay ? await dayContext(userId, now.getTime()) : null;
  const briefTasks = dctx ? listTasks(userId, "default").map((t) => ({ text: t.text, done: t.done })) : [];
  await Promise.all(
    blocks.map(async (b) => {
      // A bound block draws from a live source instead of its props. Resolves to
      // null on any failure → the screen falls back to the block's props.
      if (b.source) {
        const out = await resolveSource(b.source, connLookup);
        if (out !== null) {
          data[b.id] = out;
          rememberResolved(b.id, out, now.getTime());
        } else {
          // #21 — a transient failure serves the last good value (stamped stale) instead of blanking.
          const cached = lastResolved(b.id);
          if (cached) { data[b.id] = cached.value; staleAt[b.id] = cached.at; }
        }
        return;
      }
      switch (b.type) {
        case "weather": data[b.id] = await weatherData(g(b.props)); break;
        case "calendar": data[b.id] = await calendarData(b.props); break;
        case "tasks": data[b.id] = tasksData(b.props, userId); break;
        // #148 daily brief + #154 contextual greeting — composed from the shared dayContext.
        case "dailyBrief":
          if (dctx) data[b.id] = composeDailyBrief(dctx, briefTasks, { maxEvents: b.props.maxEvents, maxTasks: b.props.maxTasks, showWeather: b.props.showWeather, showDate: b.props.showDate }, now.getTime());
          break;
        case "greeting":
          if (dctx && b.props.showContext) data[b.id] = { contextualGreeting: composeContextualGreeting(dctx.calendar, dctx.weather, dctx.tz, b.props.maxContextLength, now.getTime()) };
          break;
        case "queue": data[b.id] = queueData(b.props, userId); break;
        case "customData": { const cd = customDataWidget(b.props, userId); if (cd) data[b.id] = cd; break; }
        // #27 — chart a numeric data key's recorded history as a series the sparkline draws.
        case "metricHistory": {
          const key = b.props.dataKey.trim();
          if (key) data[b.id] = metricSeries(userId, key, now.getTime() - b.props.days * 86_400_000).map((p) => p.value);
          break;
        }
        // #153 — a calm reflection: today's prompt + the latest journal entry.
        case "journal": {
          const latest = recentJournal(userId, 1)[0];
          const day = latest?.day ?? new Date(now.getTime()).toISOString().slice(0, 10);
          data[b.id] = { prompt: promptForDay(day), entry: latest?.text ?? "" };
          break;
        }
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
  // "What changed since you last looked" — once the rest of the board is resolved, diff
  // its scalars against this snapshotKey's previous render and feed each digest block.
  // Only runs when a key is supplied (the device display) AND a digest block exists.
  if (snapshotKey) {
    const digests = blocks.filter((b) => b.type === "sinceYouLooked");
    if (digests.length) {
      const max = Math.max(...digests.map((b) => (b.props as { max?: number }).max ?? 5));
      const changes = computeChanges(blocks, data, snapshotKey, max, commit);
      // Only write when there's something to show, so a `whenData` digest hides until a
      // delta appears (matching the renderer's gate); always-visible blocks still paint
      // their "nothing new" placeholder from undefined data.
      for (const b of digests) {
        const slice = changes.slice(0, (b.props as { max?: number }).max ?? 5);
        if (slice.length) data[b.id] = { changes: slice };
      }
    }
  }
  // #21 — set AFTER the digest diff (a reserved metadata key, not block data) so a stale-served
  // value never registers as a "change since you looked". The screen reads it for a freshness hint.
  if (Object.keys(staleAt).length) data["__stale"] = staleAt;
  return data;
}
