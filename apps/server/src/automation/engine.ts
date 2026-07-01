import type { ActionT, AutomationT, ComparatorT, ConditionT, LayoutT, TriggerT, WidgetT } from "@glanceos/schema";
import { getUser, userHomeGeo } from "../auth";
import { getCustomData, listCustomData, setCustomData } from "../customdata";
import { applyScene } from "../scenes";
import { getOwnedLayout, updateLayout } from "../layouts";
import { addTask } from "../tasks";
import { advanceQueue } from "../queues";
import { deviceProfile, devicesOwnedBy, getDevice, updateDevice, type DeviceRow } from "../devices";
import { getWritableLayout } from "../shares";
import { createIfAbsent } from "../notifications";
import { pushDevice, pushUserDevices, windowActive } from "../state";
import { wallClock } from "../schedules";
import { emit, isConnected } from "../hub";
import { postJSON } from "../fetchers/cache";
import { resolvePath } from "../fetchers/jsonfeed";
import { connLookupForOrg } from "../connections";
import { ensurePersonalOrg } from "../orgs";
import { resolveSource } from "../providers/resolve";
import { allBlocks } from "../widgets";
import { db } from "../db";
import { calendarContext, resolveUserCalendar, resolveUserWeather, type DayCalendar, type DayWeather } from "../daycontext";
// Re-export the day-context helpers from their new leaf home so existing call sites
// (the tick below, engine.test) keep importing them from "./engine".
export { calendarContext, resolveUserCalendar, resolveUserWeather };
import { sunTimes, tzMinuteOfDay } from "../astro";
import { allUserIds, enabledByTrigger, getAutomation, recordRun } from "../automations";

// The automation engine. evaluate() and the comparators are PURE and TOTAL (never
// throw) so they're trivially unit-tested offline. buildContext() assembles a
// frozen context from local data only (no fetches). runActions() maps to existing
// server seams; the only outbound action goes through the SSRF-guarded postJSON.

// A named object on a board, as seen by automations. Keyed in ctx.objects by BOTH
// the block's stable id (what conditions/actions reference — survives renames) and
// its current name (for readability/debug). `settable` is false for live-data blocks.
export interface ObjEntry { value: unknown; settable: boolean; kind: "data" | "static" | "live"; key?: string; prop?: string; count?: number }

export interface Ctx {
  data: Record<string, unknown>; // the user's custom-data store, keyed by key
  webhook: unknown; // inlet payload (webhook trigger)
  device: Record<string, unknown>; // the device that transitioned (online/offline triggers)
  time: { hour: number; minute: number; minuteOfDay: number; weekday: number; ts: number };
  // v5.0 substrate — today's sun, in the user's location/timezone (undefined if no
  // screen has a location set). Lets boards react to daylight: `sun.isDaytime`,
  // `sun.minsToSunset`, etc. Also powers the "sun" trigger.
  sun?: { isDaytime: boolean; sunriseMin: number; sunsetMin: number; minsToSunrise: number; minsToSunset: number };
  // v5.0 substrate — current weather at the user's location (undefined if no
  // location / offline). Lets boards react: `weather.isRaining`, `weather.tempC`,
  // `weather.precipProbPct`. Resolved only when an automation references `weather.*`.
  weather?: DayWeather;
  // v5.0 substrate — are you home? Derived from the `presence` custom-data key
  // (a phone geofence webhook or a bound Home Assistant person entity). v7.0 adds
  // per-person lanes from `presence.<name>` keys (`presence.people.alex` in conditions),
  // so a household can react to each member without a schema change.
  presence?: { home: boolean; state: string; people: Record<string, boolean> };
  // v6.1 substrate — the user's agenda (first calendar connection), resolved only
  // when a rule references `calendar.*`. Lets boards react to meetings. v11 deepens it:
  // eventsToday (how busy is the day), and the next event's location / video-call link /
  // all-day flag — so rules like "video call starting in 5 min" or ">6 meetings today" work.
  calendar?: DayCalendar;
  objects: Record<string, ObjEntry>; // a board's named objects (empty for global automations)
}
export interface LiveCtx { weather?: Ctx["weather"]; calendar?: Ctx["calendar"] }

// Server-side primary-text heuristic (the config app owns the authoritative per-type
// map; object-set actions carry the exact prop, so this only powers *reads* + a
// fallback). Covers the overwhelming majority of text-bearing blocks.
const TEXT_PROPS = ["content", "text", "value", "title", "label", "message", "body", "heading", "name"];
function primaryProp(props: Record<string, unknown>): string | undefined {
  for (const p of TEXT_PROPS) if (p in props) return p;
  return undefined;
}

// Reduce a resolved live source (what resolveSource/applyMap returns) to a sensable
// scalar for objects.<id>.value, plus a .count for list sources. A scalar (number/
// string from a stat/metric map) passes through; an array exposes its length as both
// value and count so "objects.prs.value > 5" reads naturally on a list; an object with
// a .value/.count field uses it. null/undefined → value undefined (offline → no fire).
function liveScalar(out: unknown): { value: unknown; count?: number } {
  if (out == null) return { value: undefined };
  if (Array.isArray(out)) return { value: out.length, count: out.length };
  if (typeof out === "object") {
    const o = out as Record<string, unknown>;
    const count = typeof o.count === "number" ? o.count : undefined;
    return { value: o.value ?? count, count };
  }
  return { value: out }; // number | string | boolean
}

/** A board's named objects → {value, settable} keyed by id AND name. Pure: object
 *  values come from the doc (static), the already-built custom-data store (bound), or
 *  — when `liveObjects` is supplied — the resolved value of a live-data block, so
 *  automations can sense any integration (objects.<id>.value / .count). Without
 *  liveObjects a live block is present but valueless (the offline/no-rule case). */
function buildLayoutObjects(layout: LayoutT, dataStore: Record<string, unknown>, liveObjects?: Record<string, unknown>): Record<string, ObjEntry> {
  const out: Record<string, ObjEntry> = {};
  const named = allBlocks(layout).filter((b) => b.name);
  const entryFor = (block: WidgetT): ObjEntry => {
    const props = block.props as Record<string, unknown>;
    if (block.type === "customData") {
      const key = String(props.key ?? "");
      // No data key (malformed) → read nothing, not dataStore[""].
      return key ? { value: dataStore[key], settable: true, kind: "data", key } : { value: undefined, settable: false, kind: "data", key: "" };
    }
    if (block.source) { const { value, count } = liveScalar(liveObjects?.[block.id]); return { value, count, settable: false, kind: "live" }; }
    const prop = primaryProp(props);
    return { value: prop ? props[prop] : undefined, settable: !!prop, kind: "static", prop };
  };
  // Ids are authoritative — conditions/actions reference objects.<id>, so build all
  // id keys first. Names are a readability alias added second; never let a name
  // clobber an id (or an earlier name — autoNameObjects keeps names unique anyway).
  for (const block of named) out[block.id] = entryFor(block);
  for (const block of named) if (!(block.name! in out)) out[block.name!] = out[block.id]!;
  return out;
}

const num = (x: unknown): number | null => { const n = Number(x); return Number.isFinite(n) ? n : null; };
// JS has no regex timeout, and the ~60s tick evaluates every user's conditions in
// turn — so a user-supplied "matches" pattern must never be able to backtrack
// unboundedly (ReDoS). Refuse patterns with nested/stacked quantifiers (the classic
// catastrophic-backtracking trap) and bound both the pattern and the tested input.
function safeRegexTest(pattern: string, input: string): boolean {
  if (pattern.length > 120) return false;
  if (/[)\]][*+?{]/.test(pattern) || /[*+?][*+?]/.test(pattern)) return false;
  try { return new RegExp(pattern).test(input.slice(0, 2000)); } catch { return false; }
}
// Defensive: never throw on circular/BigInt values, even though the context is
// currently always JSON-derived (keeps compare()/changed strictly total).
const safeStringify = (v: unknown): string => { try { return JSON.stringify(v) ?? "undefined"; } catch { return "[unstringifiable]"; } };
const looseEq = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" || typeof b === "object") return safeStringify(a) === safeStringify(b);
  return String(a) === String(b);
};
const MAX_EVAL_DEPTH = 64; // runtime backstop; the schema caps stored trees far lower

/** Total comparator — any unexpected input yields false, never an exception. */
function compare(op: ComparatorT, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case "eq": return looseEq(actual, expected);
    case "ne": return !looseEq(actual, expected);
    case "gt": { const a = num(actual), b = num(expected); return a !== null && b !== null && a > b; }
    case "gte": { const a = num(actual), b = num(expected); return a !== null && b !== null && a >= b; }
    case "lt": { const a = num(actual), b = num(expected); return a !== null && b !== null && a < b; }
    case "lte": { const a = num(actual), b = num(expected); return a !== null && b !== null && a <= b; }
    case "contains":
      if (Array.isArray(actual)) return actual.some((x) => looseEq(x, expected));
      return String(actual ?? "").includes(String(expected ?? ""));
    case "startsWith": return String(actual ?? "").startsWith(String(expected ?? ""));
    case "endsWith": return String(actual ?? "").endsWith(String(expected ?? ""));
    case "matches": return safeRegexTest(String(expected ?? ""), String(actual ?? ""));
    default: return false; // exists/changed/between handled in evaluate
  }
}

/** Evaluate a condition tree against a context (and an optional previous context
 *  for the "changed" operator). Pure + total. */
export function evaluate(
  cond: ConditionT,
  ctx: Ctx,
  prev?: Ctx,
  depth = 0,
  trend?: Record<string, "rising" | "falling" | "steady" | null>,
  staleMs?: Record<string, number>,
  sustained?: Record<string, boolean>,
): boolean {
  if (depth > MAX_EVAL_DEPTH) return false; // never recurse a hostile/pathological tree off the stack
  switch (cond.type) {
    case "all": return cond.conditions.every((c) => evaluate(c, ctx, prev, depth + 1, trend, staleMs, sustained));
    case "any": return cond.conditions.length > 0 && cond.conditions.some((c) => evaluate(c, ctx, prev, depth + 1, trend, staleMs, sustained));
    case "not": return !evaluate(cond.condition, ctx, prev, depth + 1, trend, staleMs, sustained);
    // The "held for N minutes" verdict is precomputed in the tick layer (resolveSustained)
    // and threaded in by content key, so evaluate stays pure/total — like trend.
    case "sustained": return sustained?.[sustainedKey(cond)] ?? false;
    // Pure clock gate: in the daily [startMin,endMin) window (wrapping past midnight
    // when end <= start) on an allowed weekday. Reads only ctx.time → total.
    case "timeWindow": {
      const mask = cond.daysMask ?? 127;
      if (((mask >> ctx.time.weekday) & 1) === 0) return false;
      const t = ctx.time.minuteOfDay, s = cond.startMin, e = cond.endMin;
      return s <= e ? t >= s && t < e : t >= s || t < e;
    }
    case "field": {
      if (cond.op === "rising" || cond.op === "falling" || cond.op === "steady") return (trend?.[cond.field] ?? null) === cond.op;
      if (cond.op === "stale") { const ms = staleMs?.[cond.field]; const min = num(cond.value) ?? 0; return ms != null && ms >= min * 60_000; }
      const actual = resolvePath(ctx, cond.field);
      if (cond.op === "exists") return actual !== undefined && actual !== null;
      if (cond.op === "changed") return safeStringify(actual) !== safeStringify(prev ? resolvePath(prev, cond.field) : undefined);
      if (cond.op === "between") { const a = num(actual), lo = num(cond.value), hi = num(cond.value2); return a !== null && lo !== null && hi !== null && a >= Math.min(lo, hi) && a <= Math.max(lo, hi); }
      // Edge comparators: fire only on the transition tick. Need both the current and the
      // prior sample (no prev → no crossing detectable → false, like "changed").
      if (cond.op === "crossesAbove" || cond.op === "crossesBelow") {
        const a = num(actual), t = num(cond.value), p = prev ? num(resolvePath(prev, cond.field)) : null;
        if (a === null || t === null || p === null) return false;
        return cond.op === "crossesAbove" ? p <= t && a > t : p >= t && a < t;
      }
      return compare(cond.op, actual, cond.value);
    }
  }
}

// A sustained node's stable identity within one automation: its window + the inner
// condition's shape. Two identical sustained nodes share history (identical truth →
// identical first-true), which is correct, so a content key needs no positional path.
const sustainedKey = (cond: Extract<ConditionT, { type: "sustained" }>): string => `${cond.minutes}:${safeStringify(cond.condition)}`;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Wall-clock parts in the user's timezone — the "time" trigger means *their* 09:00,
// not the server's (containers commonly run UTC). Falls back to server local time.
function zonedTime(now: Date, tz: string): Ctx["time"] {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", weekday: "short" })
        .formatToParts(now).map((p) => [p.type, p.value]),
    );
    const hour = Number(parts.hour) % 24;
    const minute = Number(parts.minute);
    const weekday = WEEKDAYS.indexOf(parts.weekday as string);
    return { hour, minute, minuteOfDay: hour * 60 + minute, weekday: weekday < 0 ? now.getDay() : weekday, ts: now.getTime() };
  } catch {
    return { hour: now.getHours(), minute: now.getMinutes(), minuteOfDay: now.getHours() * 60 + now.getMinutes(), weekday: now.getDay(), ts: now.getTime() };
  }
}

// The user's "home" location for sun/weather math: the account home (v6.0) if set,
// else the first screen that has a location. Undefined → no sun context / sun trigger
// no-ops gracefully.
function userGeo(userId: string): { lat: number; lon: number } | null {
  const home = userHomeGeo(userId);
  if (home) return home;
  for (const d of devicesOwnedBy(userId)) {
    if (typeof d.latitude === "number" && typeof d.longitude === "number") return { lat: d.latitude, lon: d.longitude };
  }
  return null;
}

function sunContext(userId: string, now: Date, tz: string, nowMin: number): Ctx["sun"] {
  const geo = userGeo(userId);
  if (!geo) return undefined;
  const t = sunTimes(now, geo.lat, geo.lon);
  if (!t) return undefined; // polar day/night
  const sunriseMin = tzMinuteOfDay(t.sunrise, tz);
  const sunsetMin = tzMinuteOfDay(t.sunset, tz);
  return {
    isDaytime: nowMin >= sunriseMin && nowMin < sunsetMin,
    sunriseMin, sunsetMin,
    minsToSunrise: sunriseMin - nowMin,
    minsToSunset: sunsetMin - nowMin,
  };
}

export function buildContext(userId: string, opts: { webhook?: unknown; device?: Record<string, unknown>; now?: Date; layout?: LayoutT; live?: LiveCtx; liveObjects?: Record<string, unknown> } = {}): Ctx {
  const now = opts.now ?? new Date();
  const data: Record<string, unknown> = {};
  for (const e of listCustomData(userId)) data[e.key] = e.value;
  const tz = getUser(userId)?.defaultTimezone || "UTC";
  const time = zonedTime(now, tz);
  return Object.freeze({
    data,
    webhook: opts.webhook ?? {},
    device: opts.device ?? {},
    time,
    sun: sunContext(userId, now, tz, time.minuteOfDay),
    weather: opts.live?.weather,
    presence: presenceFromData(data),
    calendar: opts.live?.calendar,
    objects: opts.layout ? buildLayoutObjects(opts.layout, data, opts.liveObjects) : {},
  });
}

// "home" if the `presence` custom-data key reads as present. Set it from a phone
// geofence webhook ({key:"presence", value:"home"|"away"}) or a bound HA person entity.
const isHomeState = (s: string): boolean => /^\s*(home|present|in|true|1|yes|on)\s*$/i.test(s);
function presenceFromData(data: Record<string, unknown>): Ctx["presence"] {
  const state = String(data.presence ?? "");
  // Per-person lanes from `presence.<name>` keys (the data store is flat key→JSON),
  // so a household reacts to each member with no schema/migration change.
  const people: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("presence.") && k.length > "presence.".length) people[k.slice("presence.".length)] = isHomeState(String(v ?? ""));
  }
  return { home: isHomeState(state), state, people };
}

// resolveUserWeather / resolveUserCalendar / calendarContext now live in ../daycontext (a
// leaf module shared with resolveWidgetData) and are imported + re-exported at the top of
// this file, so the tick and the engine tests keep their existing call sites.

// Does any of these automations read `<prefix>.*` in its conditions? (cheap guard so
// the tick only fetches weather/calendar when a rule actually needs it).
function refsField(cond: ConditionT | null | undefined, prefix: string): boolean {
  if (!cond) return false;
  if (cond.type === "field") return cond.field.startsWith(prefix);
  if (cond.type === "all" || cond.type === "any") return cond.conditions.some((c) => refsField(c, prefix));
  if (cond.type === "not" || cond.type === "sustained") return refsField(cond.condition, prefix);
  return false;
}

// v6.1 trend sense — a small, bounded in-memory ring-buffer of recent numeric samples
// per (user[:board]):field, so a condition can react to DIRECTION (rising/falling/
// steady) over a window, not just a level. Re-baselines on restart, like prevCtx.
interface TrendSample { ts: number; value: number }
const TREND_CAP = 12; // ~12 minutes at the 60s tick
const trendSamples = new Map<string, TrendSample[]>();
function recordTrend(key: string, value: number, minuteStamp: number): void {
  let buf = trendSamples.get(key);
  if (!buf) { buf = []; trendSamples.set(key, buf); }
  if (buf.length && buf[buf.length - 1]!.ts === minuteStamp) buf[buf.length - 1]!.value = value; // same minute → replace
  else { buf.push({ ts: minuteStamp, value }); if (buf.length > TREND_CAP) buf.shift(); }
}
function trendDirection(buf: TrendSample[] | undefined): "rising" | "falling" | "steady" | null {
  if (!buf || buf.length < 3) return null; // not enough history yet → no trend (like "changed" before prev)
  const first = buf[0]!.value, last = buf[buf.length - 1]!.value;
  const tol = Math.max(1e-9, Math.abs(first) * 0.02);
  if (last - first > tol) return "rising";
  if (first - last > tol) return "falling";
  return "steady";
}
// Field paths a tree references with a trend comparator (so the tick samples only those).
function collectTrendFields(cond: ConditionT | null | undefined, out: Set<string>): void {
  if (!cond) return;
  if (cond.type === "field") { if (cond.op === "rising" || cond.op === "falling" || cond.op === "steady") out.add(cond.field); return; }
  if (cond.type === "not" || cond.type === "sustained") return collectTrendFields(cond.condition, out);
  if (cond.type === "all" || cond.type === "any") cond.conditions.forEach((c) => collectTrendFields(c, out));
}

// v7.0 stale sense — a per-(user[:board]):field record of WHEN a field last changed
// value, so a condition can react to "hasn't updated in N minutes". Re-baselines on
// restart (a field is treated as fresh the first time the tick sees it), like trend.
const lastChange = new Map<string, { sig: string; ts: number }>();
// Field paths a tree references with the `stale` comparator (the tick stamps only those).
function collectStaleFields(cond: ConditionT | null | undefined, out: Set<string>): void {
  if (!cond) return;
  if (cond.type === "field") { if (cond.op === "stale") out.add(cond.field); return; }
  if (cond.type === "not" || cond.type === "sustained") return collectStaleFields(cond.condition, out);
  if (cond.type === "all" || cond.type === "any") cond.conditions.forEach((c) => collectStaleFields(c, out));
}

// v7.0 sustained sense — per-(user[:board]):node first-true timestamp. resolveSustained
// walks an automation's tree once per tick (innermost first), drives this map from each
// sustained node's current inner truth, and returns a content-keyed verdict map that
// evaluate() reads. Re-baselines on restart, like prevCtx/trend.
const sustainedSince = new Map<string, number>();
function resolveSustained(
  cond: ConditionT | null | undefined,
  autoKey: string,
  ctx: Ctx,
  prev: Ctx | undefined,
  trend: Record<string, "rising" | "falling" | "steady" | null>,
  staleMs: Record<string, number>,
  nowMs: number,
  out: Record<string, boolean> = {},
): Record<string, boolean> {
  if (!cond) return out;
  if (cond.type === "all" || cond.type === "any") { for (const c of cond.conditions) resolveSustained(c, autoKey, ctx, prev, trend, staleMs, nowMs, out); return out; }
  if (cond.type === "not") { resolveSustained(cond.condition, autoKey, ctx, prev, trend, staleMs, nowMs, out); return out; }
  if (cond.type === "sustained") {
    resolveSustained(cond.condition, autoKey, ctx, prev, trend, staleMs, nowMs, out); // nested first → inner verdicts ready
    const innerTrue = evaluate(cond.condition, ctx, prev, 0, trend, staleMs, out);
    const localKey = sustainedKey(cond);
    const masterKey = `${autoKey}:${localKey}`;
    if (innerTrue) {
      if (!sustainedSince.has(masterKey)) sustainedSince.set(masterKey, nowMs);
      out[localKey] = nowMs - (sustainedSince.get(masterKey) as number) >= cond.minutes * 60_000;
    } else { sustainedSince.delete(masterKey); out[localKey] = false; }
  }
  return out;
}

const dayOf = (ctx: Ctx): number => Math.floor(ctx.time.ts / 86_400_000);

// Is this device inside its quiet-hours window right now, and if so how many minutes
// until it ends? (used by respectQuiet — don't flash a 2am alert at a bedroom screen.)
function deviceQuiet(d: DeviceRow): { quiet: boolean; minsToEnd: number } {
  const q = deviceProfile(d).quietHours;
  if (!q) return { quiet: false, minsToEnd: 0 };
  const { weekday, minute } = wallClock(Date.now(), d.timezone);
  if (!windowActive(q, minute, weekday)) return { quiet: false, minsToEnd: 0 };
  let mins = q.endMin - minute;
  if (mins <= 0) mins += 1440; // window end is later today / tomorrow morning
  return { quiet: true, minsToEnd: mins };
}

// The connected screens an alert targets (a specific device, or all the user's screens).
function alertTargets(userId: string, a: Extract<ActionT, { kind: "alert" }>): DeviceRow[] {
  if (a.target === "device" && a.deviceId) {
    const d = getDevice(a.deviceId);
    return d && d.user_id === userId && isConnected(d.id) ? [d] : [];
  }
  return devicesOwnedBy(userId).filter((d) => isConnected(d.id));
}

async function emitAlert(userId: string, a: Extract<ActionT, { kind: "alert" }>): Promise<void> {
  const payload = { severity: a.severity, title: a.title, body: a.body, ttl: a.ttlSeconds };
  const mode = a.respectQuiet ?? "off";
  for (const d of alertTargets(userId, a)) {
    if (mode !== "off" && mode !== "hold" && deviceQuiet(d).quiet) {
      if (mode === "suppress") continue; // skip this sleeping screen entirely
      if (mode === "soften") { await emit(d.id, "alert", { ...payload, severity: "info", quiet: true }); continue; } // calm, no flash/chime
    }
    await emit(d.id, "alert", payload);
  }
}

// hold: if any target screen is in quiet hours now, how long until the soonest window
// ends (so runActions can defer the whole alert until then). 0 = none are quiet.
function alertHoldMinutes(userId: string, a: Extract<ActionT, { kind: "alert" }>): number {
  const ends = alertTargets(userId, a).map((d) => deviceQuiet(d)).filter((q) => q.quiet).map((q) => q.minsToEnd);
  return ends.length ? Math.min(...ends) : 0;
}

/** Execute ONE action's effect (the raw switch). Returns whether it touched user data
 *  (so the caller can re-push the user's screens once). Throws on failure; the caller
 *  isolates it. No enable/defer logic here — runActions + drainDeferred own that. */
async function execAction(a: ActionT, userId: string, ctx: Ctx, board?: { id: number; document: LayoutT }): Promise<boolean> {
  let touched = false;
  switch (a.kind) {
    case "setData": setCustomData(userId, a.key, a.value); touched = true; break;
    case "applyScene": applyScene(a.sceneId, userId); touched = true; break; // #150 — a routine step
    case "addTask": addTask(userId, a.listId || "default", a.text); touched = true; break;
    case "advanceQueue": advanceQueue(userId, a.queueId, a.delta ?? 1); touched = true; break;
    case "switchBoard": {
      if (!getWritableLayout(a.layoutId, userId)) throw new Error("no access to that board");
      if (!updateDevice(a.deviceId, { layoutId: a.layoutId }, userId)) throw new Error("screen not found or not yours");
      await pushDevice(a.deviceId);
      break;
    }
    case "notify": createIfAbsent(userId, null, "automation", a.message, `auto:${a.message}:${dayOf(ctx)}`); break;
    case "alert": await emitAlert(userId, a); break;
    // assertSafeUrl inside; the marker header lets our own inlet handler skip
    // re-firing automations, so an automation that POSTs to its own /api/hooks
    // URL can't form an HTTP self-trigger loop.
    case "webhook": await postJSON(a.url, a.body ?? { context: ctx }, { "x-glanceos-automation": "1" }); break;
    // Object writes target a block by its stable id. A custom-data-bound object
    // writes its data key; a static object patches its prop on the board doc.
    // Either way pushUserDevices() at the end re-renders every screen the user
    // owns, so the change reaches whatever screen is showing this board.
    case "setObjectText":
    case "setObjectProp": {
      if (!board) throw new Error("object actions only run on board-scoped automations");
      const block = board.document.rows.flatMap((r) => r.blocks).find((b) => b.id === a.objectId);
      if (!block) throw new Error(`object not found: ${a.objectName ?? a.objectId}`);
      const props = block.props as Record<string, unknown>;
      const next = a.kind === "setObjectText" ? a.text : a.value;
      if (block.type === "customData") {
        const key = String(props.key ?? "");
        if (!key) throw new Error("object has no data key");
        setCustomData(userId, key, next);
      } else if (block.source) {
        throw new Error("object shows live data and can't be set");
      } else {
        const prop = a.kind === "setObjectText" ? (a.prop || primaryProp(props)) : a.prop;
        if (!prop) throw new Error("object has no settable text");
        const original = props[prop];
        props[prop] = next;
        // Keep the in-memory doc consistent with persistence: if the save fails,
        // roll the mutation back so sibling automations in this pass don't read it.
        try { updateLayout(board.id, board.document); }
        catch (e) { props[prop] = original; throw e; }
      }
      touched = true;
      break;
    }
    case "showObject":
    case "hideObject": {
      if (!board) throw new Error("object actions only run on board-scoped automations");
      const block = board.document.rows.flatMap((r) => r.blocks).find((b) => b.id === a.objectId);
      if (!block) throw new Error(`object not found: ${a.objectName ?? a.objectId}`);
      const wasHidden = block.hidden;
      block.hidden = a.kind === "hideObject";
      try { updateLayout(board.id, board.document); }
      catch (e) { block.hidden = wasHidden; throw e; }
      touched = true;
      break;
    }
    case "incrementData": {
      const cur = num(getCustomData(userId, a.key)) ?? 0; // start from 0 if unset/non-numeric
      setCustomData(userId, a.key, cur + (a.delta ?? 1));
      touched = true;
      break;
    }
    case "toggleData": {
      const cur = getCustomData(userId, a.key);
      const on = cur === true || cur === "true" || cur === 1 || cur === "1";
      setCustomData(userId, a.key, !on);
      touched = true;
      break;
    }
    case "delay": { await new Promise((r) => setTimeout(r, Math.min(5_000, Math.max(0, a.ms)))); break; } // bounded: the tick is shared across users
  }
  return touched;
}

/** Run an automation's actions. Each is isolated: one failing action is logged and the
 *  rest still run. An action carrying `afterMinutes` is queued (drainDeferred runs it that
 *  many minutes later), not run inline. The webhook action is the only egress — SSRF-guarded. */
export async function runActions(actions: ActionT[], userId: string, ctx: Ctx, board?: { id: number; document: LayoutT }): Promise<{ run: number; errors: string[] }> {
  let run = 0; let touched = false; const errors: string[] = [];
  for (const a of actions) {
    if (a.enabled === false) continue; // a step toggled off in the builder
    if (a.condition && !evaluate(a.condition, ctx)) continue; // #2 — per-action guard: skip unless it passes now
    if (a.afterMinutes && a.afterMinutes > 0) { enqueueDeferred(userId, a, ctx, board, a.afterMinutes); run++; continue; } // run later
    // respectQuiet "hold": if any target screen is in quiet hours, defer the alert until
    // the soonest window ends. The deferred copy uses "suppress" so a drain that lands
    // while a screen is still quiet stays calm instead of firing loudly.
    if (a.kind === "alert" && a.respectQuiet === "hold") {
      const mins = alertHoldMinutes(userId, a);
      if (mins > 0) { enqueueDeferred(userId, { ...a, respectQuiet: "suppress" }, ctx, board, mins); run++; continue; }
    }
    try { if (await execAction(a, userId, ctx, board)) touched = true; run++; }
    catch (e) { errors.push(`${a.kind}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (touched) await pushUserDevices(userId);
  return { run, errors };
}

// v7.0 deferred actions — "then, N minutes later, do X". Queued in memory (re-baselines on
// restart, like the rest of the engine's history) and drained by the ~60s tick. A board
// action re-loads the live doc at drain time so a late write can't clobber edits made in
// between. Bounded so a runaway rule can't grow the queue without limit.
interface Deferred { dueMs: number; userId: string; action: ActionT; ctx: Ctx; layoutId: number | null }
const MAX_DEFERRED = 1000;
const deferredQueue: Deferred[] = [];
function enqueueDeferred(userId: string, action: ActionT, ctx: Ctx, board: { id: number; document: LayoutT } | undefined, afterMinutes: number): void {
  if (deferredQueue.length >= MAX_DEFERRED) return; // backstop: drop rather than grow unbounded
  deferredQueue.push({ dueMs: ctx.time.ts + afterMinutes * 60_000, userId, action, ctx, layoutId: board?.id ?? null });
}
/** Run every deferred action now due. Called once per ~60s tick. One failure never
 *  blocks the others; screens re-push once per affected user. */
export async function drainDeferred(now = new Date()): Promise<void> {
  const nowMs = now.getTime();
  if (!deferredQueue.some((d) => d.dueMs <= nowMs)) return;
  const due: Deferred[] = []; const keep: Deferred[] = [];
  for (const d of deferredQueue) (d.dueMs <= nowMs ? due : keep).push(d);
  deferredQueue.length = 0; deferredQueue.push(...keep);
  const touchedUsers = new Set<string>();
  for (const d of due) {
    const board = d.layoutId != null ? loadBoard(d.userId, d.layoutId) : undefined; // re-load the live doc
    try { if (await execAction(d.action, d.userId, d.ctx, board)) touchedUsers.add(d.userId); }
    catch { /* a deferred action's failure is isolated; there's no run row to attach it to */ }
  }
  for (const u of touchedUsers) await pushUserDevices(u);
}

// "time" trigger dedupe — fire at most once per matched minute (the tick may run
// more than once within a clock minute on a busy loop).
const lastTimeFire = new Map<string, number>();
function timeMatches(trigger: Extract<TriggerT, { kind: "time" }>, ctx: Ctx, autoId: string): boolean {
  if (trigger.atMinute !== ctx.time.minuteOfDay) return false;
  if (((trigger.daysMask >> ctx.time.weekday) & 1) === 0) return false;
  const stamp = Math.floor(ctx.time.ts / 60_000);
  if (lastTimeFire.get(autoId) === stamp) return false;
  lastTimeFire.set(autoId, stamp);
  return true;
}

// "sun" trigger — fires the minute the sun event (± offset) lands, deduped per minute.
function sunMatches(trigger: Extract<TriggerT, { kind: "sun" }>, ctx: Ctx, autoId: string): boolean {
  if (!ctx.sun) return false;
  if (((trigger.daysMask >> ctx.time.weekday) & 1) === 0) return false;
  const base = trigger.event === "sunrise" ? ctx.sun.sunriseMin : ctx.sun.sunsetMin;
  const target = (((base + trigger.offsetMin) % 1440) + 1440) % 1440;
  if (ctx.time.minuteOfDay !== target) return false;
  const stamp = Math.floor(ctx.time.ts / 60_000);
  if (lastTimeFire.get(autoId) === stamp) return false;
  lastTimeFire.set(autoId, stamp);
  return true;
}

// "interval" trigger — fires every N minutes, aligned to the minute-of-day so
// cadences are predictable (e.g. every 15 → :00 :15 :30 :45). Deduped per minute.
function intervalMatches(trigger: Extract<TriggerT, { kind: "interval" }>, ctx: Ctx, autoId: string): boolean {
  const every = Math.max(1, trigger.everyMinutes);
  if (ctx.time.minuteOfDay % every !== 0) return false;
  const stamp = Math.floor(ctx.time.ts / 60_000);
  if (lastTimeFire.get(autoId) === stamp) return false;
  lastTimeFire.set(autoId, stamp);
  return true;
}

// Per-context previous snapshot (for "changed") + per-device presence (for edges),
// in-memory by design: a restart simply re-baselines (no spurious fires). The key
// is the user (global rules) or `user:layoutId` (a board's objects).
const prevCtx = new Map<string, Ctx>();
const lastOnline = new Map<string, boolean>();
const lastPresence = new Map<string, boolean>();
const lastPresencePerson = new Map<string, boolean>(); // v7.0 per-person lanes, keyed `user:name`
const ctxKey = (userId: string, layoutId: number | null): string => (layoutId == null ? userId : `${userId}:${layoutId}`);
const loadBoard = (userId: string, layoutId: number): { id: number; document: LayoutT } | undefined => {
  const rec = getOwnedLayout(layoutId, userId);
  return rec ? { id: rec.id, document: rec.document } : undefined;
};

/** Fire every enabled automation of a user whose trigger matches `kind`. A
 *  board-scoped automation evaluates against its board's objects. Actions never
 *  fire further automations, so there is no recursion. */
export async function fireAutomations(
  userId: string,
  kind: TriggerT["kind"],
  opts: { webhook?: unknown; device?: Record<string, unknown>; prev?: Ctx; now?: Date; ctx?: Ctx; usePrev?: boolean; live?: LiveCtx; presenceEvent?: "enter" | "leave"; presencePerson?: string } = {},
): Promise<void> {
  const autos = enabledByTrigger(userId, kind);
  if (autos.length === 0) return;
  // Resolve live data (weather + calendar) once, only if a rule references it — keeps the tick cheap.
  const live: LiveCtx = opts.live ?? {
    weather: autos.some((a) => refsField(a.conditions, "weather")) ? await resolveUserWeather(userId) : undefined,
    calendar: autos.some((a) => refsField(a.conditions, "calendar")) ? await resolveUserCalendar(userId) : undefined,
  };
  const hasLive = live.weather !== undefined || live.calendar !== undefined;
  const baseCtx = !hasLive && opts.ctx ? opts.ctx : buildContext(userId, { webhook: opts.webhook, device: opts.device, now: opts.now, live });
  // Numeric fields any rule reads with a trend comparator + paths any rule watches for
  // staleness — the tick samples/stamps just these.
  const trendNeeded = new Set<string>();
  const staleNeeded = new Set<string>();
  for (const a of autos) { collectTrendFields(a.conditions, trendNeeded); collectStaleFields(a.conditions, staleNeeded); }
  // Live-block sensing: for any board whose rules read objects.*, resolve its named
  // live-data blocks once (cached via resolveSource → typically the same fetch the
  // screen already did, so usually free) into objects.<id>.value/.count. Gated by
  // refsField so a tick with no objects.* rule fetches nothing — mirrors the lazy
  // weather/calendar resolution above. User-scoped, so the user's personal-org
  // connections back the lookup (a team-only connection degrades to no value).
  const liveObjectsByLayout = new Map<number, Record<string, unknown>>();
  const objBoards = new Set<number>();
  for (const a of autos) if (a.layoutId != null && refsField(a.conditions, "objects")) objBoards.add(a.layoutId);
  if (objBoards.size) {
    const lookup = connLookupForOrg(ensurePersonalOrg(userId));
    for (const lid of objBoards) {
      const board = loadBoard(userId, lid);
      if (!board) continue;
      const sources = allBlocks(board.document).filter((b) => b.name && b.source);
      const map: Record<string, unknown> = {};
      await Promise.all(sources.map(async (b) => { const r = await resolveSource(b.source!, lookup).catch(() => null); if (r != null) map[b.id] = r; }));
      liveObjectsByLayout.set(lid, map);
    }
  }
  type Resolved = { board?: { id: number; document: LayoutT }; ctx: Ctx; trend: Record<string, "rising" | "falling" | "steady" | null>; staleMs: Record<string, number> };
  // Build each referenced context once (board objects read from the doc + data),
  // record this tick's trend samples + change-stamps for it, and snapshot the results.
  const ctxCache = new Map<number | null, Resolved>();
  const ctxFor = (layoutId: number | null): Resolved => {
    let c = ctxCache.get(layoutId);
    if (!c) {
      const board = layoutId == null ? undefined : loadBoard(userId, layoutId);
      const ctx = layoutId == null ? baseCtx : board ? buildContext(userId, { webhook: opts.webhook, device: opts.device, now: opts.now, layout: board.document, live, liveObjects: liveObjectsByLayout.get(layoutId) }) : baseCtx;
      const tkey = ctxKey(userId, layoutId);
      const trend: Resolved["trend"] = {};
      for (const f of trendNeeded) {
        // Sample on every pass (not just the usePrev tick): a rising/falling/steady rule
        // can ride an interval/time/sun trigger too. recordTrend dedups within a clock
        // minute (minuteStamp replace), so repeated passes in one minute are harmless.
        const v = num(resolvePath(ctx, f));
        if (v !== null) recordTrend(`${tkey}:${f}`, v, Math.floor(ctx.time.ts / 60_000));
        trend[f] = trendDirection(trendSamples.get(`${tkey}:${f}`));
      }
      const staleMs: Record<string, number> = {};
      for (const f of staleNeeded) {
        const skey = `${tkey}:${f}`;
        const sig = safeStringify(resolvePath(ctx, f));
        const seen = lastChange.get(skey);
        if (!seen || seen.sig !== sig) lastChange.set(skey, { sig, ts: ctx.time.ts });
        staleMs[f] = ctx.time.ts - (lastChange.get(skey) as { sig: string; ts: number }).ts;
      }
      c = { board, ctx, trend, staleMs };
      ctxCache.set(layoutId, c);
    }
    return c;
  };
  for (const a of autos) {
    const { board, ctx, trend, staleMs } = ctxFor(a.layoutId);
    if (a.trigger.kind === "time" && !timeMatches(a.trigger, ctx, a.id)) continue;
    if (a.trigger.kind === "interval" && !intervalMatches(a.trigger, ctx, a.id)) continue;
    if (a.trigger.kind === "sun" && !sunMatches(a.trigger, ctx, a.id)) continue;
    if (a.trigger.kind === "presence" && (a.trigger.event !== opts.presenceEvent || (a.trigger.person ?? "") !== (opts.presencePerson ?? ""))) continue;
    const prev = opts.usePrev ? prevCtx.get(ctxKey(userId, a.layoutId)) : opts.prev;
    // "held for N minutes" verdicts are driven once here (mutating sustainedSince), then
    // read purely inside evaluate. Only walks the tree when the rule uses `sustained`.
    const sustainedMap = a.conditions ? resolveSustained(a.conditions, ctxKey(userId, a.layoutId), ctx, prev, trend, staleMs, ctx.time.ts) : {};
    const matched = a.conditions ? evaluate(a.conditions, ctx, prev, 0, trend, staleMs, sustainedMap) : true;
    if (matched) {
      // Cooldown: stay quiet for N minutes after a run so a long-held condition
      // (rain, low battery) doesn't re-fire every tick. lastRun is the persisted
      // last *matched* fire; we skip silently (keep lastRun) until it expires.
      const cdMs = (a.cooldownMinutes ?? 0) * 60_000;
      if (cdMs > 0 && a.lastRun != null && ctx.time.ts - a.lastRun < cdMs) continue;
      const r = await runActions(a.actions, userId, ctx, board);
      recordRun(a.id, userId, kind, true, r.run, r.errors.length ? r.errors.join("; ") : null);
    } else {
      recordRun(a.id, userId, kind, false, 0, null);
    }
  }
  // The tick stashes every context it evaluated as next tick's "prev" (so "changed"
  // compares against the exact prior snapshot — globally and per board).
  if (opts.usePrev) {
    for (const [lid, c] of ctxCache) prevCtx.set(ctxKey(userId, lid), c.ctx);
  }
}

/** The ~60s tick: data-threshold ("tick"), time-of-day ("time"), and screen
 *  online↔offline edges. Wrapped by the caller so it never crashes the loop. */
export async function runAutomationTick(now = new Date()): Promise<void> {
  await drainDeferred(now); // run any "N minutes later" actions that have come due
  for (const userId of allUserIds()) {
    const ctx = buildContext(userId, { now });
    await fireAutomations(userId, "tick", { ctx, now, usePrev: true });
    await fireAutomations(userId, "interval", { ctx, now });
    await fireAutomations(userId, "time", { ctx, now });
    await fireAutomations(userId, "sun", { ctx, now });
    for (const d of devicesOwnedBy(userId)) {
      const online = isConnected(d.id);
      const was = lastOnline.get(d.id);
      if (was !== undefined && was !== online) {
        await fireAutomations(userId, online ? "deviceOnline" : "deviceOffline", { device: { id: d.id, name: d.name, online }, now });
      }
      lastOnline.set(d.id, online);
    }
    // Presence edge (arrive home / leave) — derived from the `presence` data key.
    const homeNow = ctx.presence?.home ?? false;
    const wasHome = lastPresence.get(userId);
    if (wasHome !== undefined && wasHome !== homeNow) {
      await fireAutomations(userId, "presence", { ctx, now, presenceEvent: homeNow ? "enter" : "leave" });
    }
    lastPresence.set(userId, homeNow);
    // v7.0 — per-person lanes (presence.<name>): one edge per household member.
    for (const [name, here] of Object.entries(ctx.presence?.people ?? {})) {
      const pk = `${userId}:${name}`;
      const wasHere = lastPresencePerson.get(pk);
      if (wasHere !== undefined && wasHere !== here) {
        await fireAutomations(userId, "presence", { ctx, now, presenceEvent: here ? "enter" : "leave", presencePerson: name });
      }
      lastPresencePerson.set(pk, here);
    }
  }
  persistEngineState(); // #1 — flush sensing history so a restart doesn't re-baseline
}

// #1 — persist the engine's in-memory sensing maps + deferred queue to `engine_state`
// (one JSON row per map), flushed once per tick and hydrated on boot. Bounded by the same
// caps the maps already enforce; wrapped so a serialize/DB hiccup never crashes the tick.
const ENGINE_STATE_MAPS: Array<[string, Map<string, unknown>]> = [
  ["trend", trendSamples as Map<string, unknown>],
  ["change", lastChange as Map<string, unknown>],
  ["sustained", sustainedSince as Map<string, unknown>],
  ["prev", prevCtx as unknown as Map<string, unknown>],
  ["online", lastOnline as Map<string, unknown>],
  ["presence", lastPresence as Map<string, unknown>],
  ["presencePerson", lastPresencePerson as Map<string, unknown>],
  ["timeFire", lastTimeFire as Map<string, unknown>],
];
export function persistEngineState(): void {
  try {
    const stmt = db.prepare("INSERT INTO engine_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v");
    db.transaction(() => {
      for (const [k, m] of ENGINE_STATE_MAPS) stmt.run(k, JSON.stringify([...m]));
      stmt.run("deferred", JSON.stringify(deferredQueue));
    })();
  } catch { /* a flush hiccup must never break the tick; next tick retries */ }
}
/** Restore the engine's sensing history from the DB on boot (call once after migrate()). */
export function hydrateEngineState(): void {
  try {
    const read = (k: string): unknown => { const r = db.prepare("SELECT v FROM engine_state WHERE k = ?").get(k) as { v: string } | undefined; return r ? JSON.parse(r.v) : null; };
    for (const [k, m] of ENGINE_STATE_MAPS) { const e = read(k); if (Array.isArray(e)) { m.clear(); for (const pair of e) if (Array.isArray(pair)) m.set(pair[0] as string, pair[1]); } }
    const def = read("deferred");
    if (Array.isArray(def)) { deferredQueue.length = 0; deferredQueue.push(...(def as Deferred[])); }
  } catch { /* corrupt/absent state → start fresh, exactly as before this feature */ }
}

const describeAction = (a: ActionT): string => {
  if (a.afterMinutes && a.afterMinutes > 0) return `after ${a.afterMinutes} min: ${describeAction({ ...a, afterMinutes: undefined } as ActionT)}`;
  switch (a.kind) {
    case "setData": return `set data "${a.key}"`;
    case "applyScene": return `apply scene #${a.sceneId}`;
    case "addTask": return `add task "${a.text}"`;
    case "advanceQueue": return `advance queue "${a.queueId}" by ${a.delta ?? 1}`;
    case "switchBoard": return `switch a screen to board #${a.layoutId}`;
    case "notify": return `notify: ${a.message}`;
    case "alert": return `alert (${a.severity}): ${a.title}`;
    case "webhook": return `POST to ${a.url}`;
    case "setObjectText": return `set “${a.objectName ?? a.objectId}” text`;
    case "setObjectProp": return `set “${a.objectName ?? a.objectId}” ${a.prop}`;
    case "showObject": return `show “${a.objectName ?? a.objectId}”`;
    case "hideObject": return `hide “${a.objectName ?? a.objectId}”`;
    case "incrementData": return `${(a.delta ?? 1) < 0 ? "decrease" : "increase"} data "${a.key}" by ${Math.abs(a.delta ?? 1)}`;
    case "toggleData": return `toggle data "${a.key}"`;
    case "delay": return `wait ${a.ms} ms`;
  }
};

/** Preview an automation against the current context with NO side effects. A
 *  board-scoped preview reads that board's objects. */
export function dryRunAutomation(a: AutomationT, userId: string, layoutId?: number | null): { matched: boolean; wouldRun: string[]; context: Ctx } {
  const board = layoutId != null ? loadBoard(userId, layoutId) : undefined;
  const ctx = buildContext(userId, board ? { layout: board.document } : {});
  const matched = a.conditions ? evaluate(a.conditions, ctx, prevCtx.get(ctxKey(userId, layoutId ?? null))) : true; // "changed" reflects the last tick
  return { matched, wouldRun: matched ? a.actions.map(describeAction) : [], context: ctx };
}

/** Fire a saved automation right now (real side effects) — the "Run now" button.
 *  Evaluates its conditions against the live context and runs its actions. */
export async function runAutomationById(id: string, userId: string): Promise<{ matched: boolean; run: number; errors: string[] }> {
  const a = getAutomation(id, userId);
  if (!a) throw new Error("automation not found");
  const board = a.layoutId != null ? loadBoard(userId, a.layoutId) : undefined;
  const ctx = buildContext(userId, board ? { layout: board.document } : {});
  const matched = a.conditions ? evaluate(a.conditions, ctx, prevCtx.get(ctxKey(userId, a.layoutId))) : true;
  let run = 0; const errors: string[] = [];
  if (matched) { const r = await runActions(a.actions, userId, ctx, board); run = r.run; errors.push(...r.errors); }
  recordRun(a.id, userId, "manual", matched, run, errors.length ? errors.join("; ") : null);
  return { matched, run, errors };
}
