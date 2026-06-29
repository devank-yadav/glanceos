// Per-user "day context" — today's calendar + current weather, composed server-side.
//
// This is a LEAF module (no import of engine.ts or widgets.ts) so it can be shared by
// BOTH the automation engine (the tick) and resolveWidgetData (the display compose path)
// without an import cycle (engine.ts imports widgets.ts for allBlocks, so widgets.ts must
// not import engine.ts). The calendar/weather resolution used to live inside engine.ts;
// it was moved here verbatim and engine re-exports it for its existing callers + tests.
//
// Everything here is rule-based — NO AI. The composers (#148 daily brief, #154 contextual
// greeting) are pure functions over the resolved context, unit-testable with a fixed clock.
import { getUser, userHomeGeo } from "./auth";
import { devicesOwnedBy } from "./devices";
import { weatherData } from "./fetchers/weather";
import { precipData } from "./fetchers/openmeteo";
import { ensurePersonalOrg } from "./orgs";
import { connLookupForOrg, listConnections } from "./connections";
import { resolveSource } from "./providers/resolve";

export interface DayWeather { tempC: number; summary: string; high?: number; low?: number; precipProbPct: number; isRaining: boolean }
export interface DayCalendar {
  isBusyNow: boolean; minutesUntilNext?: number; nextTitle?: string; nextStart?: string; freeUntil?: string;
  eventsToday: number; nextLocation?: string; nextIsOnline: boolean; nextJoinUrl?: string; nextIsAllDay: boolean;
}

// The user's geo for weather/sun: their home location, else the first located screen they own.
function userGeo(userId: string): { lat: number; lon: number } | null {
  const home = userHomeGeo(userId);
  if (home) return home;
  for (const d of devicesOwnedBy(userId)) {
    if (typeof d.latitude === "number" && typeof d.longitude === "number") return { lat: d.latitude, lon: d.longitude };
  }
  return null;
}

const MEET_HOSTS = /(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|meet\.jit\.si|bluejeans\.com|gotomeeting\.com|chime\.aws|around\.co)/i;
// A video-call link for an event: an explicit url field, else a known host found in the location.
function joinLinkOf(o: Record<string, unknown>): string | undefined {
  const url = String(o.url ?? "");
  if (url && MEET_HOSTS.test(url)) return url;
  const loc = String(o.location ?? "");
  const m = loc.match(/https?:\/\/[^\s"<>)\]]+/g)?.find((u) => MEET_HOSTS.test(u));
  return m || (url && /^https?:\/\//.test(url) ? url : undefined);
}

// A YYYY-MM-DD day key in a timezone, for "is this event today?" (Intl, never throws).
function dayKeyInTz(ts: number, tz: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts)); }
  catch { return new Date(ts).toISOString().slice(0, 10); }
}

// A single parsed agenda event (start/end ms epoch, title, optional location, allDay, join link).
export interface AgendaEvent { start: number; end: number; title: string; location?: string; allDay: boolean; join?: string }
// Pure: parse + sort a raw resolved event list. Used by both calendarContext and the brief.
export function parseAgenda(list: unknown[]): AgendaEvent[] {
  return list
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const s = Date.parse(String(o.start));
      return { start: s, end: o.end ? Date.parse(String(o.end)) : s + 3_600_000, title: String(o.title ?? ""), location: o.location ? String(o.location) : undefined, allDay: o.allDay === true, join: joinLinkOf(o) };
    })
    .filter((e) => Number.isFinite(e.start))
    .sort((a, b) => a.start - b.start);
}

/** Pure: build the calendar context from a resolved event list (start/end/title/allDay/
 *  location/url). Exported for unit testing — no fetch, no clock, no throw. */
export function calendarContext(list: unknown[], now: number, tz: string): DayCalendar {
  const evs = parseAgenda(list);
  const busy = evs.find((e) => e.start <= now && e.end > now);
  const next = evs.find((e) => e.start > now);
  const today = dayKeyInTz(now, tz);
  return {
    isBusyNow: !!busy,
    minutesUntilNext: next ? Math.max(0, Math.round((next.start - now) / 60_000)) : undefined,
    nextTitle: next?.title || undefined,
    nextStart: next ? new Date(next.start).toISOString() : undefined,
    freeUntil: busy ? new Date(busy.end).toISOString() : undefined,
    eventsToday: evs.filter((e) => dayKeyInTz(e.start, tz) === today).length,
    nextLocation: next?.location,
    nextIsOnline: !!next?.join,
    nextJoinUrl: next?.join,
    nextIsAllDay: next?.allDay ?? false,
  };
}

// Resolve the user's current weather (cached, keyless). Returns undefined if no geo/fetch.
export async function resolveUserWeather(userId: string): Promise<DayWeather | undefined> {
  const geo = userGeo(userId);
  if (!geo) return undefined;
  const p = { latitude: geo.lat, longitude: geo.lon };
  const [w, pr] = await Promise.all([weatherData(p), precipData(p).catch(() => null)]);
  if (!w) return undefined;
  return {
    tempC: w.temperatureC, summary: w.summary, high: w.high, low: w.low,
    precipProbPct: pr?.probability ?? 0,
    isRaining: /rain|drizzle|shower|thunder/i.test(w.summary),
  };
}

// Fetch the raw event list from the user's first calendar connection (iCal/Google).
// Returns null when there is NO calendar connection (distinct from an empty agenda) so
// callers can preserve the "no connection → undefined context" contract.
async function fetchUserAgenda(userId: string): Promise<unknown[] | null> {
  const orgId = ensurePersonalOrg(userId); // a user's own calendar lives in their personal org
  const conn = listConnections(orgId).find((c) => c.provider === "ical" || c.provider === "google");
  if (!conn) return null;
  const kind = conn.provider === "google" ? "google.calendar" : "ical.events";
  // NB: pass an explicit `query: {}` — this object skips the schema (cast), so the
  // `.prefault({})` default never runs and resolveSource's stableHash(src.query) would
  // throw on undefined (swallowed by .catch → calendar silently dead). The ical/google
  // providers tolerate an empty query (ical falls back to the connection's .ics URL).
  const raw = await resolveSource({ kind, connectionId: conn.id, query: {}, map: { transform: "none" } } as unknown as Parameters<typeof resolveSource>[0], connLookupForOrg(orgId)).catch(() => null);
  return Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown[] }).events) ? (raw as { events: unknown[] }).events : [];
}

// Resolve the user's agenda context (counts + next event). undefined = no calendar connection.
export async function resolveUserCalendar(userId: string): Promise<DayCalendar | undefined> {
  const list = await fetchUserAgenda(userId);
  if (list === null) return undefined;
  return calendarContext(list, Date.now(), getUser(userId)?.defaultTimezone || "UTC");
}

// ---- #148/#154 shared substrate -------------------------------------------------------

export interface DayContext { calendar?: DayCalendar; weather?: DayWeather; events: AgendaEvent[]; tz: string }

// Resolve calendar + weather + the raw upcoming-event list for a user, in one shot. Fetches
// each at most once. Used by resolveWidgetData for dailyBrief / contextual-greeting blocks.
export async function dayContext(userId: string, now = Date.now()): Promise<DayContext> {
  const tz = getUser(userId)?.defaultTimezone || "UTC";
  const [list, weather] = await Promise.all([fetchUserAgenda(userId), resolveUserWeather(userId)]);
  const events = parseAgenda(list ?? []);
  const calendar = list === null ? undefined : calendarContext(list, now, tz);
  return { calendar, weather, events, tz };
}

function greetingWord(now: number, tz: string): string {
  let h = new Date(now).getUTCHours();
  try { h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date(now))); } catch { /* keep UTC hour */ }
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

function weatherPhrase(w: DayWeather): string {
  const t = `${Math.round(w.tempC)}°`;
  const s = w.summary ? w.summary.toLowerCase() : "";
  return s ? `${t}, ${s}` : t;
}

// Format an epoch ms as a short local time ("9:00 AM") in the given tz. Never throws.
function shortTime(ts: number, tz: string): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ts)); }
  catch { return new Date(ts).toISOString().slice(11, 16); }
}

/** #154 — one calm contextual line, e.g. "Good morning · 3 meetings today · 18°, light rain".
 *  Pure, rule-based, no AI. Truncated to maxLen. */
export function composeContextualGreeting(cal: DayCalendar | undefined, weather: DayWeather | undefined, tz: string, maxLen = 200, now = Date.now()): string {
  const parts: string[] = [greetingWord(now, tz)];
  if (cal) {
    if (cal.isBusyNow && cal.freeUntil) parts.push(`free at ${shortTime(Date.parse(cal.freeUntil), tz)}`);
    else if (cal.eventsToday > 0) parts.push(`${cal.eventsToday} meeting${cal.eventsToday > 1 ? "s" : ""} today`);
    else parts.push("no meetings today");
    if (!cal.isBusyNow && cal.nextTitle && cal.minutesUntilNext != null && cal.minutesUntilNext <= 120) {
      parts.push(`next in ${cal.minutesUntilNext}m`);
    }
  }
  if (weather) parts.push(weatherPhrase(weather));
  const line = parts.join("  ·  ");
  return line.length > maxLen ? line.slice(0, maxLen - 1).trimEnd() + "…" : line;
}

export interface DailyBriefDataT {
  greeting: string;
  dateLabel: string;
  weatherLine: string | null;
  events: { time: string; title: string; location?: string }[];
  tasks: string[];
}

/** #148 — compose the calm morning brief from the day context + the user's tasks. Pure,
 *  rule-based: greeting by hour, the next `maxEvents` upcoming events today (pre-formatted
 *  in the user's tz), and up to `maxTasks` undone tasks. NO AI. */
export function composeDailyBrief(
  ctx: DayContext,
  tasks: { text: string; done: boolean }[],
  opts: { maxEvents: number; maxTasks: number; showWeather: boolean; showDate: boolean },
  now = Date.now(),
): DailyBriefDataT {
  const tz = ctx.tz;
  const todayKey = dayKeyInTz(now, tz);
  const upcoming = ctx.events
    // today's events that haven't ended yet; all-day events (which often arrive with no
    // explicit end → a 1h default) stay visible for the whole day.
    .filter((e) => dayKeyInTz(e.start, tz) === todayKey && (e.allDay || e.end > now))
    .slice(0, Math.max(0, opts.maxEvents))
    .map((e) => ({ time: e.allDay ? "All day" : shortTime(e.start, tz), title: e.title || "(untitled)", location: e.location }));
  const undone = tasks.filter((t) => !t.done).slice(0, Math.max(0, opts.maxTasks)).map((t) => t.text);
  return {
    greeting: greetingWord(now, tz),
    dateLabel: opts.showDate ? (() => { try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(now)); } catch { return new Date(now).toDateString(); } })() : "",
    weatherLine: opts.showWeather && ctx.weather ? weatherPhrase(ctx.weather) : null,
    events: upcoming,
    tasks: undone,
  };
}
