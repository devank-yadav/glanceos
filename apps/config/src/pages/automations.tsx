import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Menu } from "../components/Menu";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";
import { controlsFor, type ObjControl } from "../editor/objectControls";

// Automations: when a trigger fires (webhook / screen online↔offline / minute
// tick / time-of-day) and an optional condition matches, run a list of actions.
// The condition grammar + enums are mirrored here as plain data so the main shell
// doesn't pull the schema/zod bundle (that stays in the Studio chunk).
//
// Two contexts: the global page (Settings/route) edits cross-board rules, and the
// Studio embeds this with a board's `objects` so conditions/actions can target a
// named object by name (Shortcuts-style). objectId is the stable reference.

type Cond =
  | { type: "all"; conditions: Cond[] }
  | { type: "any"; conditions: Cond[] }
  | { type: "not"; condition: Cond }
  | { type: "sustained"; minutes: number; condition: Cond } // v7.0 — engine-supported; preserved on round-trip
  | { type: "timeWindow"; startMin: number; endMin: number; daysMask?: number } // gate to a daily time window
  | { type: "field"; field: string; op: string; value?: unknown; value2?: unknown; valueField?: string };
interface Action { kind: string; [k: string]: unknown }
interface Trigger { kind: string; atMinute?: number; daysMask?: number; event?: string; offsetMin?: number; everyMinutes?: number; person?: string; key?: string }
interface Automation { id?: string; name: string; enabled: boolean; trigger: Trigger; conditions?: Cond | null; actions: Action[]; layoutId?: number | null; lastRun?: number | null; runCount?: number; cooldownMinutes?: number; snoozedUntil?: number | null; oncePerDay?: boolean }

// One of the current board's named objects, offered in the pickers. `settable` is
// false for live-data blocks (they're read-only). `prop` is the primary text prop.
export interface ObjOption { id: string; name: string; label: string; type?: string; settable: boolean; prop?: string }

const OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "crossesAbove", "crossesBelow", "between", "contains", "startsWith", "endsWith", "matches", "exists", "changed", "stale"];
const NO_VALUE_OPS = new Set(["exists", "changed", "rising", "falling", "steady"]); // these ops take no comparison value
const OP_LABEL: Record<string, string> = { eq: "is", ne: "is not", gt: "greater than", gte: "≥", lt: "less than", lte: "≤", crossesAbove: "rises above", crossesBelow: "drops below", between: "between", contains: "contains", startsWith: "starts with", endsWith: "ends with", matches: "matches (regex)", exists: "exists", changed: "changed", rising: "is rising", falling: "is falling", steady: "is steady", stale: "hasn't changed in (min)" };
const NUM_OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "crossesAbove", "crossesBelow", "between", "changed", "rising", "falling", "steady", "stale"];
const TEXT_OPS = ["eq", "ne", "contains", "startsWith", "endsWith", "matches", "exists", "changed", "stale"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Plain-English catalog of the fields the engine's substrate exposes (buildContext:
// weather/sun/time/presence/device + webhook). Drives the friendly "Only if…" field
// picker + a value control that matches each field, so conditions read like sentences
// instead of hand-typed dotted paths. Field names mirror engine.ts exactly.
interface FieldDef { field: string; label: string; group: string; control: "bool" | "number" | "select" | "text"; options?: { value: string; label: string }[] }
const FIELD_CATALOG: FieldDef[] = [
  // Weather
  { field: "weather.isRaining", label: "It’s raining", group: "Weather", control: "bool" },
  { field: "weather.tempC", label: "Temperature °C", group: "Weather", control: "number" },
  { field: "weather.precipProbPct", label: "Chance of rain %", group: "Weather", control: "number" },
  { field: "weather.high", label: "Forecast high °C", group: "Weather", control: "number" },
  { field: "weather.low", label: "Forecast low °C", group: "Weather", control: "number" },
  { field: "weather.summary", label: "Weather summary", group: "Weather", control: "text" },
  // Sun
  { field: "sun.isDaytime", label: "It’s daytime", group: "Sun", control: "bool" },
  { field: "sun.minsToSunset", label: "Minutes to sunset", group: "Sun", control: "number" },
  { field: "sun.minsToSunrise", label: "Minutes to sunrise", group: "Sun", control: "number" },
  // Time
  { field: "time.hour", label: "Hour (0–23)", group: "Time", control: "number" },
  { field: "time.minute", label: "Minute (0–59)", group: "Time", control: "number" },
  { field: "time.minuteOfDay", label: "Minute of day", group: "Time", control: "number" },
  { field: "time.weekday", label: "Day of week", group: "Time", control: "select", options: WEEKDAY_FULL.map((d, i) => ({ value: String(i), label: d })) },
  { field: "time.isWeekend", label: "It’s the weekend", group: "Time", control: "bool" }, // #7
  { field: "time.isWorkday", label: "It’s a workday (Mon–Fri)", group: "Time", control: "bool" }, // #7
  // Presence
  { field: "presence.home", label: "Someone is home", group: "Presence", control: "bool" },
  { field: "presence.state", label: "Presence", group: "Presence", control: "select", options: [{ value: "home", label: "Home" }, { value: "away", label: "Away" }] },
  // Calendar (resolved from your first calendar connection)
  { field: "calendar.isBusyNow", label: "In an event right now", group: "Calendar", control: "bool" },
  { field: "calendar.minutesUntilNext", label: "Minutes until next event", group: "Calendar", control: "number" },
  { field: "calendar.nextTitle", label: "Next event title", group: "Calendar", control: "text" },
  { field: "calendar.freeUntil", label: "Free until (time)", group: "Calendar", control: "text" },
  { field: "calendar.eventsToday", label: "Meetings today (count)", group: "Calendar", control: "number" },
  { field: "calendar.nextIsOnline", label: "Next is a video call", group: "Calendar", control: "bool" },
  { field: "calendar.nextLocation", label: "Next event location", group: "Calendar", control: "text" },
  { field: "calendar.nextIsAllDay", label: "Next event is all-day", group: "Calendar", control: "bool" },
  // Screen / device
  { field: "device.online", label: "Screen is online", group: "Screen", control: "bool" },
  // Webhook
  { field: "webhook.value", label: "Webhook value", group: "Webhook", control: "text" },
];
const fieldDef = (field: string): FieldDef | undefined => FIELD_CATALOG.find((f) => f.field === field);
const CATALOG_GROUPS = [...new Set(FIELD_CATALOG.map((f) => f.group))];
const TRIGGERS: { id: string; label: string }[] = [
  { id: "webhook", label: "A webhook arrives" },
  { id: "deviceOnline", label: "A screen comes online" },
  { id: "deviceOffline", label: "A screen goes offline" },
  { id: "tick", label: "Every minute (check data)" },
  { id: "interval", label: "Every N minutes" },
  { id: "time", label: "At a time of day" },
  { id: "sun", label: "At sunrise / sunset" },
  { id: "presence", label: "When you arrive / leave home" },
  { id: "manual", label: "On demand (Run now, the API, or your phone)" },
  { id: "dataChanged", label: "The moment a data value changes" },
];
// Friendly one-tap "When…" scenarios — each seeds the trigger (and a starter
// condition) so you don't have to assemble it by hand. Built on the existing
// senses (time/interval/sun/weather/presence/screen/webhook/data). Grouped for
// scanning; picking one replaces the When + Only-if, leaving Name + Then-do.
const WEEKDAYS_MASK = 62; // Mon–Fri (bits 1..5)
const WEEKENDS_MASK = 65; // Sun + Sat (bits 0,6)
const fcond = (field: string, op: string, value: unknown): Cond => ({ type: "all", conditions: [{ type: "field", field, op, value }] });
interface WhenScenario { id: string; group: string; label: string; trigger: Trigger; conditions?: Cond }
const WHEN_SCENARIOS: WhenScenario[] = [
  // Time of day
  { id: "wd-morning", group: "Time", label: "Weekday mornings (8am)", trigger: { kind: "time", atMinute: 480, daysMask: WEEKDAYS_MASK } },
  { id: "every-morning", group: "Time", label: "Every morning (7am)", trigger: { kind: "time", atMinute: 420, daysMask: 127 } },
  { id: "every-evening", group: "Time", label: "Every evening (6pm)", trigger: { kind: "time", atMinute: 1080, daysMask: 127 } },
  { id: "weekend-am", group: "Time", label: "Weekend mornings (9am)", trigger: { kind: "time", atMinute: 540, daysMask: WEEKENDS_MASK } },
  { id: "midnight", group: "Time", label: "At midnight (daily reset)", trigger: { kind: "time", atMinute: 0, daysMask: 127 } },
  { id: "lunch", group: "Time", label: "Workday lunchtime (12pm)", trigger: { kind: "time", atMinute: 720, daysMask: WEEKDAYS_MASK } },
  { id: "on-weekdays", group: "Time", label: "Only on weekdays (Mon–Fri)", trigger: { kind: "tick" }, conditions: fcond("time.isWorkday", "eq", true) },
  { id: "on-weekends", group: "Time", label: "Only on weekends", trigger: { kind: "tick" }, conditions: fcond("time.isWeekend", "eq", true) },
  // On a cadence
  { id: "every-5", group: "Cadence", label: "Every 5 minutes", trigger: { kind: "interval", everyMinutes: 5 } },
  { id: "every-15", group: "Cadence", label: "Every 15 minutes", trigger: { kind: "interval", everyMinutes: 15 } },
  { id: "every-hour", group: "Cadence", label: "Every hour", trigger: { kind: "interval", everyMinutes: 60 } },
  // Sun
  { id: "sunrise", group: "Sun", label: "At sunrise", trigger: { kind: "sun", event: "sunrise", offsetMin: 0, daysMask: 127 } },
  { id: "sunset", group: "Sun", label: "At sunset", trigger: { kind: "sun", event: "sunset", offsetMin: 0, daysMask: 127 } },
  { id: "before-sunset", group: "Sun", label: "30 min before sunset", trigger: { kind: "sun", event: "sunset", offsetMin: -30, daysMask: 127 } },
  { id: "after-sunrise", group: "Sun", label: "30 min after sunrise", trigger: { kind: "sun", event: "sunrise", offsetMin: 30, daysMask: 127 } },
  // Weather (checked each minute)
  { id: "rain-start", group: "Weather", label: "When it starts raining", trigger: { kind: "tick" }, conditions: fcond("weather.isRaining", "eq", true) },
  { id: "hot", group: "Weather", label: "When it's hot (above 30°C)", trigger: { kind: "tick" }, conditions: fcond("weather.tempC", "gt", 30) },
  { id: "cold", group: "Weather", label: "When it's cold (below 5°C)", trigger: { kind: "tick" }, conditions: fcond("weather.tempC", "lt", 5) },
  { id: "rain-likely", group: "Weather", label: "When rain is likely (≥60%)", trigger: { kind: "tick" }, conditions: fcond("weather.precipProbPct", "gte", 60) },
  // Presence
  { id: "arrive", group: "Presence", label: "When I arrive home", trigger: { kind: "presence", event: "enter" } },
  { id: "leave", group: "Presence", label: "When I leave home", trigger: { kind: "presence", event: "leave" } },
  { id: "arrive-person", group: "Presence", label: "When a household member arrives", trigger: { kind: "presence", event: "enter", person: "" } },
  { id: "leave-person", group: "Presence", label: "When a household member leaves", trigger: { kind: "presence", event: "leave", person: "" } },
  // Calendar (from your first calendar connection) — the context-aware bits
  { id: "meeting-soon", group: "Calendar", label: "My next meeting is within 15 min", trigger: { kind: "tick" }, conditions: fcond("calendar.minutesUntilNext", "lte", 15) },
  { id: "in-meeting", group: "Calendar", label: "While I'm in a meeting", trigger: { kind: "tick" }, conditions: fcond("calendar.isBusyNow", "eq", true) },
  { id: "video-soon", group: "Calendar", label: "Video call starting within 5 min", trigger: { kind: "tick" }, conditions: { type: "all", conditions: [{ type: "field", field: "calendar.nextIsOnline", op: "eq", value: true }, { type: "field", field: "calendar.minutesUntilNext", op: "lte", value: 5 }] } },
  { id: "busy-day", group: "Calendar", label: "Heavy day (more than 5 meetings)", trigger: { kind: "tick" }, conditions: fcond("calendar.eventsToday", "gt", 5) },
  { id: "free-now", group: "Calendar", label: "When I'm free (no event now)", trigger: { kind: "tick" }, conditions: fcond("calendar.isBusyNow", "eq", false) },
  // Trend — react to a direction, not just a level (uses the trend ring-buffer)
  { id: "rising", group: "Trend", label: "When a value has been rising", trigger: { kind: "tick" }, conditions: fcond("data.value", "rising", "") },
  { id: "falling", group: "Trend", label: "When a value has been falling", trigger: { kind: "tick" }, conditions: fcond("data.value", "falling", "") },
  { id: "rising-24h", group: "Trend", label: "When a value has risen over the last 24 h", trigger: { kind: "tick" }, conditions: fcond("data.value", "rising", 1440) },
  // Screen health
  { id: "offline", group: "Screen", label: "When a screen goes offline", trigger: { kind: "deviceOffline" } },
  { id: "online", group: "Screen", label: "When a screen comes online", trigger: { kind: "deviceOnline" } },
  // Data & webhooks
  { id: "webhook", group: "Data", label: "When a webhook arrives", trigger: { kind: "webhook" } },
  { id: "flag-on", group: "Data", label: "When a flag turns on", trigger: { kind: "tick" }, conditions: fcond("data.flag", "eq", true) },
  { id: "counter-cross", group: "Data", label: "When a counter crosses a number (once)", trigger: { kind: "tick" }, conditions: fcond("data.count", "crossesAbove", 10) },
  { id: "value-changed", group: "Data", label: "When a value changes", trigger: { kind: "tick" }, conditions: fcond("data.value", "changed", "") },
  { id: "value-stale", group: "Data", label: "When a value goes stale (no update)", trigger: { kind: "tick" }, conditions: fcond("data.value", "stale", 30) },
];
const WHEN_GROUPS = [...new Set(WHEN_SCENARIOS.map((s) => s.group))];
const ACTION_KINDS: { id: string; label: string }[] = [
  { id: "setData", label: "Set custom data" },
  { id: "incrementData", label: "Add to a number" },
  { id: "toggleData", label: "Toggle a flag" },
  { id: "addTask", label: "Add a task" },
  { id: "advanceQueue", label: "Advance a queue" },
  { id: "switchBoard", label: "Switch a screen's board" },
  { id: "applyScene", label: "Apply a scene" },
  { id: "notify", label: "Send a notification" },
  { id: "alert", label: "Show an on-screen alert" },
  { id: "webhook", label: "Call a webhook (outbound)" },
  { id: "delay", label: "Wait…" },
];
// Object-targeting actions — only offered when a board's objects are in scope.
const OBJECT_ACTIONS: { id: string; label: string }[] = [
  { id: "setObjectText", label: "Set an object's text" },
  { id: "setObjectProp", label: "Set an object's property" },
  { id: "showObject", label: "Show an object" },
  { id: "hideObject", label: "Hide an object" },
];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const blankField = (): Cond => ({ type: "field", field: "data.", op: "eq", value: "" });
const blankTimeWindow = (): Cond => ({ type: "timeWindow", startMin: 540, endMin: 1020, daysMask: 127 }); // 09:00–17:00, every day
const defaultAction = (kind: string, objects?: ObjOption[]): Action => {
  const o = objects?.find((x) => x.settable); // settable object for set-actions
  const anyObj = objects?.[0]; // any named object for show/hide
  switch (kind) {
    case "setData": return { kind, key: "", value: "" };
    case "incrementData": return { kind, key: "", delta: 1 };
    case "toggleData": return { kind, key: "" };
    case "addTask": return { kind, listId: "default", text: "" };
    case "advanceQueue": return { kind, queueId: "", delta: 1 };
    case "switchBoard": return { kind, deviceId: "", layoutId: 0 };
    case "applyScene": return { kind, sceneId: 0 };
    case "notify": return { kind, message: "" };
    case "alert": return { kind, severity: "info", title: "", target: "all" };
    case "delay": return { kind, ms: 1000 };
    case "setObjectText": return { kind, objectId: o?.id ?? "", objectName: o?.name, prop: o?.prop, text: "" };
    case "setObjectProp": return { kind, objectId: o?.id ?? "", objectName: o?.name, prop: controlsFor(o?.type)?.[0]?.key ?? o?.prop ?? "content", value: "" };
    case "showObject": case "hideObject": return { kind, objectId: anyObj?.id ?? "", objectName: anyObj?.name };
    default: return { kind: "webhook", url: "" };
  }
};

// Coerce a builder string into a typed JSON value (number / bool / string).
const coerce = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return v;
};

interface RunLog { id: number; trigger: string; matched: boolean; actionsRun: number; error: string | null; createdAt: number }

// Starter templates — one-click pre-filled drafts so the builder isn't a blank
// slate (the Shortcuts "Gallery" idea). They're starting points; the user edits
// the specifics. Object-based ones only show when the board has objects.
interface TCtx { scoped: boolean; layoutId?: number; objects?: ObjOption[] }
const tmpl = (c: TCtx, name: string, trigger: Trigger, conditions: Cond | undefined, actions: Action[]): Automation =>
  ({ name, enabled: true, trigger, conditions: conditions ?? { type: "all", conditions: [] }, actions, layoutId: c.layoutId ?? null });

// Compact builders for the recipe gallery — keep each recipe one readable line.
const cAll = (...fs: { field: string; op: string; value?: unknown }[]): Cond => ({ type: "all", conditions: fs.map((f) => ({ type: "field", field: f.field, op: f.op, value: f.value })) });
const aAlert = (title: string, body?: string, severity: "info" | "warn" | "critical" = "info"): Action => ({ kind: "alert", severity, title, body, target: "all" });
const aNotify = (message: string): Action => ({ kind: "notify", message });
const aSwitch = (): Action => ({ kind: "switchBoard", deviceId: "", layoutId: 0 }); // user picks screen + board
const objOf = (c: TCtx, type?: string): ObjOption | undefined => (type ? c.objects?.find((o) => o.settable && o.type === type) : c.objects?.find((o) => o.settable));
const aProp = (o: ObjOption, prop: string, value: unknown): Action => ({ kind: "setObjectProp", objectId: o.id, objectName: o.name, prop, value });
const aText = (o: ObjOption, text: string): Action => ({ kind: "setObjectText", objectId: o.id, objectName: o.name, prop: o.prop, text });

const RECIPE_CATEGORIES = ["Daily routine", "On a cadence", "Weather", "Sun & daylight", "Presence", "Screen health", "Data & counters", "Signage & objects"] as const;
interface Recipe { id: string; category: string; label: string; desc: string; show: (c: TCtx) => boolean; build: (c: TCtx) => Automation }
const has = (type: string) => (c: TCtx) => !!objOf(c, type);
const TEMPLATES: Recipe[] = [
  // ---- Daily routine ----
  { id: "morning-board", category: "Daily routine", label: "Morning board at 7am", desc: "Switch a screen to your morning board.", show: () => true, build: (c) => tmpl(c, "Morning board", { kind: "time", atMinute: 420, daysMask: 127 }, undefined, [aSwitch()]) },
  { id: "evening-board", category: "Daily routine", label: "Evening board at 6pm", desc: "Switch a screen to a calmer evening board.", show: () => true, build: (c) => tmpl(c, "Evening board", { kind: "time", atMinute: 1080, daysMask: 127 }, undefined, [aSwitch()]) },
  { id: "workday-start", category: "Daily routine", label: "Workday start (9am, Mon–Fri)", desc: "A gentle nudge to begin the day.", show: () => true, build: (c) => tmpl(c, "Workday start", { kind: "time", atMinute: 540, daysMask: WEEKDAYS_MASK }, undefined, [aAlert("Good morning", "Here's your day at a glance.")]) },
  { id: "workday-end", category: "Daily routine", label: "Workday wind-down (5pm, Mon–Fri)", desc: "Signal the end of the workday.", show: () => true, build: (c) => tmpl(c, "Wind down", { kind: "time", atMinute: 1020, daysMask: WEEKDAYS_MASK }, undefined, [aAlert("Wind down", "Time to wrap up for the day.")]) },
  { id: "lunch", category: "Daily routine", label: "Lunch reminder (12pm, Mon–Fri)", desc: "Notify you to take a break.", show: () => true, build: (c) => tmpl(c, "Lunch", { kind: "time", atMinute: 720, daysMask: WEEKDAYS_MASK }, undefined, [aNotify("Lunchtime — step away for a bit")]) },
  { id: "standup", category: "Daily routine", label: "Standup reminder (9:15, Mon–Fri)", desc: "Nudge before the daily standup.", show: () => true, build: (c) => tmpl(c, "Standup", { kind: "time", atMinute: 555, daysMask: WEEKDAYS_MASK }, undefined, [aNotify("Standup in 15 minutes")]) },
  { id: "weekend-mode", category: "Daily routine", label: "Weekend board (Sat 8am)", desc: "Switch to a relaxed weekend board.", show: () => true, build: (c) => tmpl(c, "Weekend mode", { kind: "time", atMinute: 480, daysMask: WEEKENDS_MASK }, undefined, [aSwitch()]) },
  { id: "midnight-reset", category: "Daily routine", label: "Reset a counter at midnight", desc: "Zero a daily counter at 00:00.", show: () => true, build: (c) => tmpl(c, "Daily reset", { kind: "time", atMinute: 0, daysMask: 127 }, undefined, [{ kind: "setData", key: "count", value: 0 }]) },
  { id: "morning-count", category: "Daily routine", label: "Tick a streak every morning", desc: "Add 1 to a streak counter at 6am.", show: () => true, build: (c) => tmpl(c, "Streak +1", { kind: "time", atMinute: 360, daysMask: 127 }, undefined, [{ kind: "incrementData", key: "streak", delta: 1 }]) },
  { id: "focus-board", category: "Daily routine", label: "Focus board (weekday 9am)", desc: "Switch a screen to a focus board.", show: () => true, build: (c) => tmpl(c, "Focus board", { kind: "time", atMinute: 540, daysMask: WEEKDAYS_MASK }, undefined, [aSwitch()]) },
  // #150 Routines — sequenced scenes on a schedule. Save scenes on the Account page first, then
  // pick them in each step; "+N m later" staggers the sequence.
  { id: "morning-routine", category: "Daily routine", label: "Morning routine (apply a scene at 7am)", desc: "Apply a saved scene, then another a few minutes later — a morning sequence.", show: () => true, build: (c) => tmpl(c, "Morning routine", { kind: "time", atMinute: 420, daysMask: 127 }, undefined, [{ kind: "applyScene", sceneId: 0 }, { kind: "applyScene", sceneId: 0, afterMinutes: 15 }]) },
  { id: "evening-routine", category: "Daily routine", label: "Evening wind-down (apply a scene at 9pm)", desc: "Flip your wall to a calm evening scene.", show: () => true, build: (c) => tmpl(c, "Evening wind-down", { kind: "time", atMinute: 1260, daysMask: 127 }, undefined, [{ kind: "applyScene", sceneId: 0 }]) },

  // ---- On a cadence ----
  { id: "hourly-chime", category: "On a cadence", label: "Hourly chime", desc: "An on-screen note every hour.", show: () => true, build: (c) => tmpl(c, "Hourly chime", { kind: "interval", everyMinutes: 60 }, undefined, [aAlert("Top of the hour", undefined)]) },
  { id: "heartbeat", category: "On a cadence", label: "Heartbeat every 15 minutes", desc: "Stamp a 'last checked' value regularly.", show: () => true, build: (c) => tmpl(c, "Heartbeat", { kind: "interval", everyMinutes: 15 }, undefined, [{ kind: "setData", key: "lastChecked", value: "ok" }]) },
  { id: "rotate-signage", category: "On a cadence", label: "Rotate signage every 30 minutes", desc: "Flip a screen's board on a loop.", show: () => true, build: (c) => tmpl(c, "Rotate signage", { kind: "interval", everyMinutes: 30 }, undefined, [aSwitch()]) },
  { id: "poll-5", category: "On a cadence", label: "Quick poll every 5 minutes", desc: "Re-check a value frequently.", show: () => true, build: (c) => tmpl(c, "5-minute poll", { kind: "interval", everyMinutes: 5 }, undefined, [{ kind: "setData", key: "pulse", value: "ok" }]) },

  // ---- Weather ----
  { id: "rain-umbrella", category: "Weather", label: "Umbrella reminder when it's raining", desc: "Warn when rain is falling.", show: () => true, build: (c) => tmpl(c, "Umbrella reminder", { kind: "tick" }, cAll({ field: "weather.isRaining", op: "eq", value: true }), [aAlert("Take an umbrella", "Rain is expected today.", "warn")]) },
  { id: "rain-indoor", category: "Weather", label: "Switch to an indoor board when it rains", desc: "Flip a screen when rain starts.", show: () => true, build: (c) => tmpl(c, "Rainy-day board", { kind: "tick" }, cAll({ field: "weather.isRaining", op: "eq", value: true }), [aSwitch()]) },
  { id: "heat", category: "Weather", label: "Heat warning above 30°C", desc: "Alert when it gets hot.", show: () => true, build: (c) => tmpl(c, "Heat warning", { kind: "tick" }, cAll({ field: "weather.tempC", op: "gt", value: 30 }), [aAlert("Stay cool", "It's above 30°C — hydrate.", "warn")]) },
  { id: "cold", category: "Weather", label: "Cold warning below 5°C", desc: "Alert when it gets cold.", show: () => true, build: (c) => tmpl(c, "Cold warning", { kind: "tick" }, cAll({ field: "weather.tempC", op: "lt", value: 5 }), [aAlert("Bundle up", "It's below 5°C outside.", "warn")]) },
  { id: "rain-likely", category: "Weather", label: "Rain likely today (≥60%)", desc: "Heads-up when rain is probable.", show: () => true, build: (c) => tmpl(c, "Rain likely", { kind: "tick" }, cAll({ field: "weather.precipProbPct", op: "gte", value: 60 }), [aAlert("Rain likely", "Pack a layer — rain is on the way.")]) },
  { id: "rainy-commute", category: "Weather", label: "Rainy-commute alert (8am, Mon–Fri)", desc: "Only warns if it's actually raining.", show: () => true, build: (c) => tmpl(c, "Rainy commute", { kind: "time", atMinute: 480, daysMask: WEEKDAYS_MASK }, cAll({ field: "weather.isRaining", op: "eq", value: true }), [aAlert("Wet commute", "Leave a little early — it's raining.", "warn")]) },

  // ---- Sun & daylight ----
  { id: "sun-evening", category: "Sun & daylight", label: "Evening cue at sunset", desc: "A calm note when the sun sets.", show: () => true, build: (c) => tmpl(c, "Evening at sunset", { kind: "sun", event: "sunset", offsetMin: 0, daysMask: 127 }, undefined, [aAlert("Good evening", "The sun has set — easing into night.")]) },
  { id: "sun-morning", category: "Sun & daylight", label: "Good morning at sunrise", desc: "Greet the day at first light.", show: () => true, build: (c) => tmpl(c, "Sunrise hello", { kind: "sun", event: "sunrise", offsetMin: 0, daysMask: 127 }, undefined, [aAlert("Good morning", "The sun is up.")]) },
  { id: "sun-board", category: "Sun & daylight", label: "Switch to a night board 30 min before sunset", desc: "Ease the screen toward evening.", show: () => true, build: (c) => tmpl(c, "Pre-sunset board", { kind: "sun", event: "sunset", offsetMin: -30, daysMask: 127 }, undefined, [aSwitch()]) },
  { id: "daytime-only", category: "Sun & daylight", label: "Do something only during daylight", desc: "A tick gated on it being daytime.", show: () => true, build: (c) => tmpl(c, "Daytime only", { kind: "tick" }, cAll({ field: "sun.isDaytime", op: "eq", value: true }), [aNotify("It's daytime")]) },

  // ---- Presence ----
  { id: "arrive-home", category: "Presence", label: "Welcome when you arrive home", desc: "An on-screen welcome on arrival.", show: () => true, build: (c) => tmpl(c, "Welcome home", { kind: "presence", event: "enter" }, undefined, [aAlert("Welcome home")]) },
  { id: "arrive-board", category: "Presence", label: "Resume your home board on arrival", desc: "Switch a screen when you get home.", show: () => true, build: (c) => tmpl(c, "Home board", { kind: "presence", event: "enter" }, undefined, [aSwitch()]) },
  { id: "leave-flag", category: "Presence", label: "Mark 'away' when everyone leaves", desc: "Set an away flag on departure.", show: () => true, build: (c) => tmpl(c, "Set away", { kind: "presence", event: "leave" }, undefined, [{ kind: "setData", key: "mode", value: "away" }]) },
  { id: "leave-board", category: "Presence", label: "Switch to an away board when you leave", desc: "Flip a screen when the house empties.", show: () => true, build: (c) => tmpl(c, "Away board", { kind: "presence", event: "leave" }, undefined, [aSwitch()]) },

  // ---- Screen health ----
  { id: "offline-alert", category: "Screen health", label: "Alert when a screen goes offline", desc: "Know the moment a screen drops.", show: () => true, build: (c) => tmpl(c, "Screen offline", { kind: "deviceOffline" }, undefined, [aAlert("A screen went offline", undefined, "critical")]) },
  { id: "online-notify", category: "Screen health", label: "Notify when a screen comes back", desc: "Confirmation when a screen reconnects.", show: () => true, build: (c) => tmpl(c, "Screen back online", { kind: "deviceOnline" }, undefined, [aNotify("A screen is back online")]) },
  { id: "offline-failover", category: "Screen health", label: "Fail over to a backup board when a screen drops", desc: "Switch another screen on an outage.", show: () => true, build: (c) => tmpl(c, "Failover board", { kind: "deviceOffline" }, undefined, [aSwitch()]) },

  // ---- Data & counters ----
  { id: "threshold", category: "Data & counters", label: "Alert when a value crosses 10", desc: "Watch a number and warn past a limit.", show: () => true, build: (c) => tmpl(c, "Over threshold", { kind: "tick" }, cAll({ field: "data.count", op: "gt", value: 10 }), [aAlert("Threshold crossed", undefined, "warn")]) },
  { id: "changed-notify", category: "Data & counters", label: "Notify when data changes", desc: "Fire whenever a value changes.", show: () => true, build: (c) => tmpl(c, "Data changed", { kind: "tick" }, cAll({ field: "data.status", op: "changed", value: "" }), [aNotify("Data changed")]) },
  { id: "flag-on", category: "Data & counters", label: "Do something when a flag turns on", desc: "React when a boolean becomes true.", show: () => true, build: (c) => tmpl(c, "Flag on", { kind: "tick" }, cAll({ field: "data.flag", op: "eq", value: true }), [aNotify("Flag is on")]) },
  { id: "webhook-set", category: "Data & counters", label: "Set a value from a webhook", desc: "Store a webhook field as data.", show: () => true, build: (c) => tmpl(c, "Set from webhook", { kind: "webhook" }, undefined, [{ kind: "setData", key: "status", value: "" }]) },
  { id: "webhook-toggle", category: "Data & counters", label: "Toggle a flag on a webhook", desc: "Flip a boolean each time it fires.", show: () => true, build: (c) => tmpl(c, "Toggle on webhook", { kind: "webhook" }, undefined, [{ kind: "toggleData", key: "flag" }]) },
  { id: "webhook-count", category: "Data & counters", label: "Count webhooks", desc: "Increment a counter on each call.", show: () => true, build: (c) => tmpl(c, "Count webhooks", { kind: "webhook" }, undefined, [{ kind: "incrementData", key: "hooks", delta: 1 }]) },
  { id: "add-task-hook", category: "Data & counters", label: "Add a task from a webhook", desc: "Append to a task list on a call.", show: () => true, build: (c) => tmpl(c, "Task from webhook", { kind: "webhook" }, undefined, [{ kind: "addTask", listId: "default", text: "New task" }]) },

  // ---- Signage & objects (need a settable object on the board) ----
  { id: "webhook-text", category: "Signage & objects", label: "Update an object's text on a webhook", desc: "Push live text to an object.", show: (c) => !!objOf(c), build: (c) => tmpl(c, "Update on webhook", { kind: "webhook" }, undefined, [aText(objOf(c)!, "")]) },
  { id: "night-hide", category: "Signage & objects", label: "Hide an object at 10pm", desc: "Tuck an object away at night.", show: (c) => !!c.objects?.length, build: (c) => tmpl(c, "Hide at night", { kind: "time", atMinute: 1320, daysMask: 127 }, undefined, [{ kind: "hideObject", objectId: c.objects![0].id, objectName: c.objects![0].name }]) },
  { id: "morning-show", category: "Signage & objects", label: "Show an object at 8am", desc: "Reveal an object in the morning.", show: (c) => !!c.objects?.length, build: (c) => tmpl(c, "Show in morning", { kind: "time", atMinute: 480, daysMask: 127 }, undefined, [{ kind: "showObject", objectId: c.objects![0].id, objectName: c.objects![0].name }]) },
  { id: "ds-on-sunrise", category: "Signage & objects", label: "Turn a Device status On at sunrise", desc: "Flip a device-status object to On.", show: has("deviceStatus"), build: (c) => tmpl(c, "Lights on at sunrise", { kind: "sun", event: "sunrise", offsetMin: 0, daysMask: 127 }, undefined, [aProp(objOf(c, "deviceStatus")!, "state", "on")]) },
  { id: "ds-off-night", category: "Signage & objects", label: "Turn a Device status Off at 11pm", desc: "Flip a device-status object to Off.", show: has("deviceStatus"), build: (c) => tmpl(c, "Lights off at night", { kind: "time", atMinute: 1380, daysMask: 127 }, undefined, [aProp(objOf(c, "deviceStatus")!, "state", "off")]) },
  { id: "open-am", category: "Signage & objects", label: "Open the sign at 9am", desc: "Set an Open sign to Open.", show: has("openSign"), build: (c) => tmpl(c, "Open at 9am", { kind: "time", atMinute: 540, daysMask: WEEKDAYS_MASK }, undefined, [aProp(objOf(c, "openSign")!, "open", true)]) },
  { id: "close-pm", category: "Signage & objects", label: "Close the sign at 6pm", desc: "Set an Open sign to Closed.", show: has("openSign"), build: (c) => tmpl(c, "Close at 6pm", { kind: "time", atMinute: 1080, daysMask: WEEKDAYS_MASK }, undefined, [aProp(objOf(c, "openSign")!, "open", false)]) },
  { id: "room-busy-hook", category: "Signage & objects", label: "Mark a room Busy on a webhook", desc: "Set a Room status to Busy.", show: has("roomStatus"), build: (c) => tmpl(c, "Room busy", { kind: "webhook" }, undefined, [aProp(objOf(c, "roomStatus")!, "status", "busy")]) },
  { id: "room-free-hook", category: "Signage & objects", label: "Mark a room Free on a webhook", desc: "Set a Room status to Free.", show: has("roomStatus"), build: (c) => tmpl(c, "Room free", { kind: "webhook" }, undefined, [aProp(objOf(c, "roomStatus")!, "status", "free")]) },
  { id: "away-status", category: "Signage & objects", label: "Show 'Away' on an object when you leave", desc: "Set an object's text on departure.", show: (c) => !!objOf(c), build: (c) => tmpl(c, "Away status", { kind: "presence", event: "leave" }, undefined, [aText(objOf(c)!, "Away")]) },
  { id: "home-status", category: "Signage & objects", label: "Show 'Home' on an object when you arrive", desc: "Set an object's text on arrival.", show: (c) => !!objOf(c), build: (c) => tmpl(c, "Home status", { kind: "presence", event: "enter" }, undefined, [aText(objOf(c)!, "Home")]) },
  { id: "rain-object", category: "Signage & objects", label: "Show a rain notice on an object when it rains", desc: "Update an object when rain starts.", show: (c) => !!objOf(c), build: (c) => tmpl(c, "Rain notice", { kind: "tick" }, cAll({ field: "weather.isRaining", op: "eq", value: true }), [aText(objOf(c)!, "Rain expected")]) },
];

export function AutomationsPage({ layoutId, objects, embedded }: { layoutId?: number; objects?: ObjOption[]; embedded?: boolean } = {}) {
  const [items, setItems] = useState<Automation[] | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [history, setHistory] = useState<{ name: string; runs: RunLog[] } | null>(null);
  const [histFilter, setHistFilter] = useState<"all" | "ran" | "skipped">("all"); // #12 run-history filter
  const confirm = useConfirm();
  const toast = useToast();
  const scoped = layoutId != null;

  // The board tab shows this board's rules; the global page shows cross-board rules.
  const load = () => api.get<Automation[]>("/api/automations")
    .then((all) => setItems(all.filter((a) => (scoped ? a.layoutId === layoutId : !a.layoutId))))
    .catch(() => setItems([]));
  useEffect(() => { load(); }, [layoutId]);

  const newDraft = (): Automation => ({
    name: "", enabled: true, trigger: { kind: scoped ? "tick" : "webhook" },
    conditions: { type: "all", conditions: [] },
    actions: [defaultAction(objects && objects.some((o) => o.settable) ? "setObjectText" : "setData", objects)],
    layoutId: layoutId ?? null,
  });

  const toggle = async (a: Automation) => { await api.patch(`/api/automations/${a.id}`, { enabled: !a.enabled }).catch(() => {}); await load(); };
  // #14 — mute a noisy rule for N minutes (0 clears the snooze).
  const snooze = async (a: Automation, minutes: number) => {
    try { await api.post(`/api/automations/${a.id}/snooze`, { minutes }); toast.success(minutes > 0 ? `Snoozed ${a.name}` : `${a.name} un-snoozed`); await load(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const runNow = async (a: Automation) => {
    try {
      const r = await api.post<{ matched: boolean; run: number; errors: string[] }>(`/api/automations/${a.id}/run-now`);
      toast.success(r.matched ? `Ran — ${r.run} action${r.run === 1 ? "" : "s"}${r.errors.length ? `, ${r.errors.length} error(s)` : ""}` : "Conditions didn't match — nothing ran");
      await load();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const duplicate = async (a: Automation) => {
    const clone: Automation = structuredClone(a);
    delete clone.id; clone.name = `${a.name} (copy)`; clone.lastRun = null; clone.runCount = 0;
    if (clone.conditions == null) delete clone.conditions; // omit null (schema is optional, not nullable)
    try { await api.post("/api/automations", clone); toast.success("Duplicated"); await load(); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const showHistory = async (a: Automation) => {
    try { setHistory({ name: a.name, runs: await api.get<RunLog[]>(`/api/automations/${a.id}/runs`) }); }
    catch { setHistory({ name: a.name, runs: [] }); }
  };
  const remove = async (a: Automation) => {
    if (!(await confirm({ title: `Delete "${a.name}"?`, body: "This automation will stop running.", confirmLabel: "Delete", danger: true }))) return;
    await api.del(`/api/automations/${a.id}`).catch(() => {});
    await load();
  };

  const body = (
    <>
      {!embedded && <p class="muted page-intro">When something happens — a webhook, a screen going offline, a data value crossing a threshold, or a time of day — run actions automatically. <strong>If this, then that</strong> for your screens.</p>}
      {embedded && <p class="muted page-intro">Make this board react on its own — read and set its objects when a webhook arrives, on a schedule, or when data crosses a threshold.</p>}

      {!editing && (
        <div class="auto-start" style={{ marginBottom: "14px" }}>
          <div class="row"><button class="primary" onClick={() => setEditing(newDraft())}><Icon.plus /> New automation</button></div>
          {(() => {
            const tctx: TCtx = { scoped, layoutId, objects };
            const shown = TEMPLATES.filter((t) => t.show(tctx));
            return shown.length ? (
              <details class="recipe-gallery">
                <summary>Start from a recipe — {shown.length} ready automations</summary>
                <div class="recipe-cats">
                  {RECIPE_CATEGORIES.filter((cat) => shown.some((t) => t.category === cat)).map((cat) => (
                    <div key={cat} class="recipe-cat">
                      <span class="recipe-cat-label">{cat}</span>
                      <div class="recipe-cards">
                        {shown.filter((t) => t.category === cat).map((t) => (
                          <button key={t.id} class="recipe-card" onClick={() => setEditing(t.build(tctx))}>
                            <strong>{t.label}</strong>
                            <span class="muted">{t.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null;
          })()}
        </div>
      )}

      {editing && <AutomationEditor draft={editing} objects={objects} layoutId={layoutId} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}

      {!editing && (items === null ? (
        <div class="cards">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Icon.command />} title="No automations yet" body={scoped ? "Add one to make this board react to events." : "Create one to make your screens react to events."} action={{ label: "New automation", onClick: () => setEditing(newDraft()) }} />
      ) : (
        <ul class="picker-list key-list">
          {items.map((a) => (
            <li key={a.id} class="row spread">
              <span class="key-meta">
                <strong>{a.name}</strong> {!a.enabled && <span class="chip subtle">off</span>}
                {a.snoozedUntil != null && a.snoozedUntil > Date.now() && <span class="chip subtle" title={`Muted until ${new Date(a.snoozedUntil).toLocaleString()}`}>snoozed</span>}
                <span class="muted">when {TRIGGERS.find((t) => t.id === a.trigger.kind)?.label ?? a.trigger.kind} → {a.actions.length} action{a.actions.length === 1 ? "" : "s"}</span>
                <span class="muted">{a.lastRun ? `last ran ${new Date(a.lastRun).toLocaleString()} · ${a.runCount}×` : "never run"}</span>
              </span>
              <span class="row" style={{ gap: "6px" }}>
                <button class="ghost" onClick={() => runNow(a)} title="Run this automation now (live)">Run now</button>
                <button class="ghost" onClick={() => setEditing(structuredClone(a))}>Edit</button>
                <button class="ghost" onClick={() => toggle(a)}>{a.enabled ? "Disable" : "Enable"}</button>
                <Menu
                  trigger={<Icon.list />}
                  items={[
                    { label: "Run history", icon: <Icon.list />, onClick: () => showHistory(a) },
                    { label: "Snooze 1 hour", icon: <Icon.moon />, onClick: () => snooze(a, 60) },
                    { label: "Snooze 8 hours", icon: <Icon.moon />, onClick: () => snooze(a, 480) },
                    ...(a.snoozedUntil != null && a.snoozedUntil > Date.now() ? [{ label: "Un-snooze", icon: <Icon.sun />, onClick: () => snooze(a, 0) }] : []),
                    { label: "Duplicate", icon: <Icon.copy />, onClick: () => duplicate(a) },
                    { label: "Delete", icon: <Icon.trash />, danger: true, onClick: () => remove(a) },
                  ]}
                />
              </span>
            </li>
          ))}
        </ul>
      ))}
      {history && (
        <Modal open onClose={() => { setHistory(null); setHistFilter("all"); }} title={`Run history — ${history.name}`} width={520}>
          {history.runs.length === 0 ? (
            <p class="muted">No runs recorded yet.</p>
          ) : (() => {
            const ran = history.runs.filter((r) => r.matched).length;
            const shown = history.runs.filter((r) => histFilter === "all" || (histFilter === "ran") === r.matched);
            return (<>
            <div class="row spread" style={{ marginBottom: "8px" }}>
              <div class="row" style={{ gap: "4px" }}>
                {(["all", "ran", "skipped"] as const).map((f) => (
                  <button key={f} class={`day-toggle ${histFilter === f ? "on" : ""}`} onClick={() => setHistFilter(f)}>{f === "all" ? "All" : f === "ran" ? "Ran" : "Skipped"}</button>
                ))}
              </div>
              <span class="muted">{ran} ran · {history.runs.length - ran} skipped of {history.runs.length}</span>
            </div>
            <ul class="picker-list key-list run-log">
              {shown.map((r) => (
                <li key={r.id} class="row spread">
                  <span class="key-meta">
                    <strong>{r.matched ? `ran ${r.actionsRun} action${r.actionsRun === 1 ? "" : "s"}` : "didn't match"}</strong>
                    <span class="muted">{r.trigger} · {new Date(r.createdAt).toLocaleString()}</span>
                    {r.error && <span class="muted" style={{ color: "var(--bad)" }}>{r.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
            </>);
          })()}
        </Modal>
      )}
    </>
  );

  if (embedded) return <div class="auto-embed">{body}</div>;
  return (
    <>
      <PageHeader title="Automations" />
      <div class="shell-content">{body}</div>
    </>
  );
}

function AutomationEditor({ draft, objects, layoutId, onCancel, onSaved }: { draft: Automation; objects?: ObjOption[]; layoutId?: number; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [a, setA] = useState<Automation>(draft);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ matched: boolean; wouldRun: string[] } | null>(null);
  const toast = useToast();
  const set = (patch: Partial<Automation>) => setA((x) => ({ ...x, ...patch }));
  const settable = (objects ?? []).filter((o) => o.settable);
  // Screens + boards for the "Switch a screen" picker — so the user never types an
  // id. Fetched once when the editor opens; `picksLoaded` lets the picker say
  // "Loading…" then "No screens yet" instead of ever falling back to a raw id box.
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const [boards, setBoards] = useState<{ id: number; name: string }[]>([]);
  const [scenes, setScenes] = useState<{ id: number; name: string }[]>([]); // #150 — for the applyScene action
  const [picksLoaded, setPicksLoaded] = useState(false);
  useEffect(() => {
    Promise.all([
      api.get<{ id: string; name: string | null }[]>("/api/devices").then((d) => setDevices(d.map((x) => ({ id: x.id, name: x.name || x.id })))).catch(() => {}),
      api.get<{ id: number; name: string }[]>("/api/layouts").then((l) => setBoards(l.map((x) => ({ id: x.id, name: x.name })))).catch(() => {}),
      api.get<{ id: number; name: string }[]>("/api/scenes").then((s) => setScenes(s.map((x) => ({ id: x.id, name: x.name })))).catch(() => {}),
    ]).finally(() => setPicksLoaded(true));
  }, []);
  // Object actions appear when the board has any named object (show/hide work on any;
  // set-text/prop list only settable ones in their picker).
  const actionKinds = objects && objects.length ? [...ACTION_KINDS, ...OBJECT_ACTIONS] : ACTION_KINDS;
  // Required-field check so we don't POST an action the schema will 400 on.
  const actionsValid = a.actions.every((act) => {
    if (act.kind === "setData" || act.kind === "incrementData" || act.kind === "toggleData") return !!String(act.key ?? "").trim();
    if (act.kind === "setObjectProp") return !!act.objectId && !!String(act.prop ?? "").trim();
    if (act.kind === "setObjectText" || act.kind === "showObject" || act.kind === "hideObject") return !!act.objectId;
    if (act.kind === "switchBoard") return !!String(act.deviceId ?? "").trim() && Number(act.layoutId) > 0; // recipe seeds blanks → must pick a screen + board
    if (act.kind === "applyScene") return Number(act.sceneId) > 0; // must pick a scene
    if (act.kind === "advanceQueue") return !!String(act.queueId ?? "").trim();
    if (act.kind === "addTask") return !!String(act.text ?? "").trim();
    return true;
  });

  // Normalise the draft for the API: empty condition group → undefined (always),
  // and coerce field/value strings to typed JSON. layoutId rides along so the
  // server scopes the rule to this board.
  const normalize = (): Automation => {
    const norm = (c: Cond): Cond => {
      if (c.type === "field") return { type: "field", field: c.field, op: c.op, value: coerce(c.value), value2: coerce(c.value2) };
      if (c.type === "not") return { type: "not", condition: norm(c.condition) };
      if (c.type === "sustained") return { type: "sustained", minutes: c.minutes, condition: norm(c.condition) }; // preserve engine sustained nodes
      if (c.type === "timeWindow") return { type: "timeWindow", startMin: c.startMin, endMin: c.endMin, daysMask: c.daysMask ?? 127 };
      return c.type === "all" ? { type: "all", conditions: c.conditions.map(norm) } : { type: "any", conditions: c.conditions.map(norm) };
    };
    const root = a.conditions;
    // No condition → omit the key entirely. The schema's `conditions` is optional
    // (accepts undefined, not null); sending null fails validation.
    const conditions = root && (root.type === "all" || root.type === "any") && root.conditions.length === 0 ? undefined : root ? norm(root) : undefined;
    const actions = a.actions.map((act) =>
      act.kind === "switchBoard" ? { ...act, layoutId: Number(act.layoutId) || 0 }
        : act.kind === "applyScene" ? { ...act, sceneId: Number(act.sceneId) || 0 }
        : act.kind === "advanceQueue" ? { ...act, delta: Number(act.delta) || 1 }
          : act.kind === "incrementData" ? { ...act, delta: Number(act.delta) || 1 }
            : act.kind === "delay" ? { ...act, ms: Math.max(50, Math.min(5000, Number(act.ms) || 1000)) }
              : act.kind === "setData" || act.kind === "setObjectProp" ? { ...act, value: coerce(act.value) }
                : act);
    // Existing rules keep their own board; only a new draft adopts this modal's board.
    return { ...a, layoutId: a.id ? a.layoutId ?? null : layoutId ?? a.layoutId ?? null, conditions, actions };
  };

  const save = async () => {
    setBusy(true);
    try {
      const reqBody = normalize();
      if (a.id) await api.patch(`/api/automations/${a.id}`, reqBody);
      else await api.post("/api/automations", reqBody);
      toast.success("Automation saved");
      await onSaved();
    } catch (e) { toast.error(String(e instanceof Error ? e.message : e)); setBusy(false); }
  };
  const test = async () => {
    try { setPreview(await api.post<{ matched: boolean; wouldRun: string[] }>("/api/automations/test", normalize())); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
  };

  const setAction = (i: number, patch: Action) => set({ actions: a.actions.map((x, j) => (j === i ? patch : x)) });

  return (
    <section class="card account-section auto-editor">
      <h2>{a.id ? "Edit automation" : "New automation"}</h2>
      <label class="field grow"><span>Name</span>
        <input value={a.name} placeholder="e.g. Show “Busy” when the lobby fills up" onInput={(e) => set({ name: (e.currentTarget as HTMLInputElement).value })} />
      </label>

      <label class="field"><span>When…</span>
        <select value={a.trigger.kind} onChange={(e) => {
          const kind = (e.currentTarget as HTMLSelectElement).value;
          const seeded: Trigger = kind === "time" ? { kind, atMinute: 540, daysMask: 127 }
            : kind === "sun" ? { kind, event: "sunset", offsetMin: 0, daysMask: 127 }
              : kind === "presence" ? { kind, event: "enter" }
                : kind === "interval" ? { kind, everyMinutes: 15 }
                  : { kind };
          set({ trigger: seeded });
        }}>
          {TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <details class="scenario-picker">
        <summary>Or pick a ready-made “when”…</summary>
        <div class="scenario-groups">
          {WHEN_GROUPS.map((g) => (
            <div key={g} class="scenario-group">
              <span class="scenario-group-label">{g}</span>
              <div class="scenario-chips">
                {WHEN_SCENARIOS.filter((s) => s.group === g).map((s) => (
                  <button key={s.id} class="ghost scenario-chip" onClick={() => set({ trigger: s.trigger, conditions: s.conditions })}>{s.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
      {a.trigger.kind === "webhook" && <WebhookInlets />}
      {a.trigger.kind === "time" && (
        <div class="row wrap">
          <label class="field"><span>At</span>
            <input type="time" value={minToTime(a.trigger.atMinute ?? 540)} onInput={(e) => set({ trigger: { ...a.trigger, atMinute: timeToMin((e.currentTarget as HTMLInputElement).value) } })} />
          </label>
          <div class="field"><span>On days</span>
            <div class="row" style={{ gap: "4px" }}>
              {DAYS.map((d, i) => {
                const mask = a.trigger.daysMask ?? 127;
                const on = (mask >> i) & 1;
                return <button key={d} class={`day-toggle ${on ? "on" : ""}`} onClick={() => set({ trigger: { ...a.trigger, daysMask: mask ^ (1 << i) } })}>{d}</button>;
              })}
            </div>
          </div>
        </div>
      )}
      {a.trigger.kind === "sun" && (
        <div class="row wrap">
          <label class="field"><span>Event</span>
            <select value={a.trigger.event ?? "sunset"} onChange={(e) => set({ trigger: { ...a.trigger, event: (e.currentTarget as HTMLSelectElement).value } })}>
              <option value="sunrise">Sunrise</option>
              <option value="sunset">Sunset</option>
            </select>
          </label>
          <label class="field"><span>Offset (min, ± before/after)</span>
            <input type="number" min={-180} max={180} value={a.trigger.offsetMin ?? 0} onInput={(e) => set({ trigger: { ...a.trigger, offsetMin: Number((e.currentTarget as HTMLInputElement).value) || 0 } })} />
          </label>
          <p class="muted" style={{ flexBasis: "100%", margin: 0 }}>Uses the location set on your screen. e.g. Sunset with −30 fires 30 min before sunset.</p>
        </div>
      )}
      {a.trigger.kind === "dataChanged" && (
        <label class="field"><span>Watch this data key</span>
          <input placeholder="e.g. temperature" value={a.trigger.key ?? ""} onInput={(e) => set({ trigger: { ...a.trigger, key: (e.currentTarget as HTMLInputElement).value } })} />
        </label>
      )}
      {a.trigger.kind === "interval" && (
        <div class="row wrap">
          <label class="field"><span>Every</span>
            <input type="number" min={1} max={1440} step={1} value={a.trigger.everyMinutes ?? 15} onInput={(e) => set({ trigger: { ...a.trigger, everyMinutes: Math.round(Math.max(1, Math.min(1440, Number((e.currentTarget as HTMLInputElement).value) || 15))) } })} />
          </label>
          <span class="muted" style={{ alignSelf: "flex-end", paddingBottom: "10px" }}>minutes</span>
          <p class="muted" style={{ flexBasis: "100%", margin: 0 }}>Runs on a fixed cadence, aligned to the clock (e.g. 15 → :00 :15 :30 :45). Pair with an <strong>Only if</strong> to act only when something is true.</p>
        </div>
      )}
      {a.trigger.kind === "presence" && (
        <div class="row wrap">
          <label class="field"><span>When</span>
            <select value={a.trigger.event ?? "enter"} onChange={(e) => set({ trigger: { ...a.trigger, event: (e.currentTarget as HTMLSelectElement).value } })}>
              <option value="enter">arrives home</option>
              <option value="leave">leaves home</option>
            </select>
          </label>
          <label class="field"><span>Who <span class="muted">(optional)</span></span>
            <input type="text" placeholder="anyone" value={a.trigger.person ?? ""} onInput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value.trim();
              const { person: _drop, ...rest } = a.trigger;
              set({ trigger: v ? { ...rest, person: v } : rest });
            }} />
          </label>
          <p class="muted" style={{ flexBasis: "100%", margin: 0 }}>Leave <strong>Who</strong> blank for the single <code>presence</code> lane, or name a household member to watch their own <code>presence.&lt;name&gt;</code> key (e.g. <code>presence.alex</code>). Set presence from a phone geofence webhook (POST <code>{"{key:\"presence.alex\", value:\"home\"|\"away\"}"}</code>) or a bound Home Assistant person entity.</p>
        </div>
      )}

      <div class="field"><span>Only if… <span class="muted">(optional)</span></span>
        {a.conditions && a.conditions.type !== "field" ? (
          <ConditionNode node={a.conditions} objects={objects} onChange={(n) => set({ conditions: n })} />
        ) : (
          <button class="ghost" onClick={() => set({ conditions: { type: "all", conditions: [] } })}>+ Add a condition</button>
        )}
      </div>

      <label class="field"><span>Run at most once every <span class="muted">(optional)</span></span>
        <span class="row" style={{ alignItems: "center", gap: "6px" }}>
          <input type="number" min="0" max="1440" step="1" style={{ width: "5.5rem" }} value={a.cooldownMinutes ?? 0} onInput={(e) => set({ cooldownMinutes: Math.round(Math.max(0, Math.min(1440, Number((e.currentTarget as HTMLInputElement).value) || 0))) })} />
          <span class="muted">minutes — 0 means every time it matches. Keeps a long-held condition (rain, low battery) from re-firing each tick.</span>
        </span>
      </label>
      <label class="field checkbox">
        <input type="checkbox" checked={!!a.oncePerDay} onChange={(e) => set({ oncePerDay: (e.currentTarget as HTMLInputElement).checked || undefined })} />
        <span>At most once per day <span class="muted">— resets at your midnight (a morning rule greets each new day once)</span></span>
      </label>

      <div class="field"><span>Then do</span>
        {a.actions.map((act, i) => (
          <div key={i} class={`action-row${act.enabled === false ? " action-off" : ""}`}>
            <input type="checkbox" class="action-enable" title={act.enabled === false ? "Step is off — won't run" : "Step is on"} checked={act.enabled !== false} onChange={(e) => setAction(i, { ...act, enabled: (e.currentTarget as HTMLInputElement).checked })} />
            <select value={act.kind} onChange={(e) => setAction(i, defaultAction((e.currentTarget as HTMLSelectElement).value, objects))}>
              {actionKinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <ActionFields action={act} objects={objects} devices={devices} boards={boards} scenes={scenes} loaded={picksLoaded} onChange={(p) => setAction(i, p)} />
            <label class="action-after" title="Run this step this many minutes later (0 = right away)">+<input type="number" min="0" max="1440" step="1" value={Number(act.afterMinutes ?? 0)} onInput={(e) => {
              const n = Math.round(Math.max(0, Math.min(1440, Number((e.currentTarget as HTMLInputElement).value) || 0)));
              const { afterMinutes: _drop, ...rest } = act as Action & { afterMinutes?: number };
              setAction(i, n > 0 ? { ...rest, afterMinutes: n } : (rest as Action));
            }} />m later</label>
            {a.actions.length > 1 && <button class="ghost danger icon-btn" onClick={() => set({ actions: a.actions.filter((_, j) => j !== i) })}>×</button>}
            {/* #2 — an optional per-action guard: this step runs only when its condition passes. */}
            <div class="action-guard">
              {act.condition ? (
                <div class="row" style={{ gap: "6px", alignItems: "flex-start" }}>
                  <span class="muted" style={{ paddingTop: "6px" }}>only if</span>
                  <div class="grow"><ConditionNode node={act.condition as Cond} objects={objects} onChange={(n) => setAction(i, { ...act, condition: n })} onRemove={() => { const { condition: _c, ...rest } = act as Action; setAction(i, rest as Action); }} /></div>
                </div>
              ) : (
                <button class="ghost tiny" onClick={() => setAction(i, { ...act, condition: { type: "all", conditions: [] } })}>+ only if…</button>
              )}
            </div>
          </div>
        ))}
        <button class="ghost" onClick={() => set({ actions: [...a.actions, defaultAction(objects && objects.length ? (settable.length ? "setObjectText" : "showObject") : "setData", objects)] })}>+ Add action</button>
      </div>

      {preview && (
        <div class={`callout ${preview.matched ? "" : "subtle"}`}>
          <strong>{preview.matched ? "Right now this would run:" : "Right now the condition does not match."}</strong>
          {preview.matched && <ul>{preview.wouldRun.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}

      <div class="row spread" style={{ marginTop: "8px" }}>
        <button class="ghost" onClick={test}>Test now</button>
        <span class="row" style={{ gap: "8px" }}>
          <button class="ghost" onClick={onCancel}>Cancel</button>
          <button class="primary" disabled={busy || !a.name.trim() || !actionsValid} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </span>
      </div>
    </section>
  );
}

// Webhook trigger helper: list (and mint) the inlet URLs that fire this automation.
// A "none" sink just receives the POST; its JSON body becomes webhook.* in conditions.
function WebhookInlets() {
  const [inlets, setInlets] = useState<{ id: string; name: string; secret: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const urlFor = (secret: string) => `${location.origin}/api/hooks/${secret}`;
  const load = () => api.get<{ id: string; name: string; secret: string }[]>("/api/inlets").then(setInlets).catch(() => setInlets([]));
  useEffect(() => { load(); }, []);
  const create = async () => {
    setBusy(true);
    try { await api.post("/api/inlets", { name: "Automation webhook", sinkKind: "none", requireSignature: false }); await load(); toast.success("Webhook URL created — copy it below"); }
    catch (e) { toast.error(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  };
  const copy = (s: string) => navigator.clipboard?.writeText(urlFor(s)).then(() => toast.success("Copied"), () => {});
  return (
    <div class="callout subtle webhook-inlets">
      <strong>Webhook URLs</strong>
      <p class="muted">POST JSON to one of these to fire this automation. The body is readable as <code>webhook.*</code> in the condition below.</p>
      {inlets === null ? <p class="muted">Loading…</p> : inlets.length === 0 ? (
        <p class="muted">No webhook URL yet — create one.</p>
      ) : (
        <ul class="webhook-list">
          {inlets.map((it) => (
            <li key={it.id} class="row spread">
              <code class="webhook-url">{urlFor(it.secret)}</code>
              <button class="ghost" onClick={() => copy(it.secret)}>Copy</button>
            </li>
          ))}
        </ul>
      )}
      <button class="ghost" disabled={busy} onClick={create}>{busy ? "Creating…" : "+ New webhook URL"}</button>
    </div>
  );
}

function ConditionNode({ node, objects, onChange, onRemove }: { node: Cond; objects?: ObjOption[]; onChange: (n: Cond) => void; onRemove?: () => void }) {
  if (node.type === "all" || node.type === "any") {
    const group = node;
    const withKids = (conditions: Cond[]): Cond => (group.type === "all" ? { type: "all", conditions } : { type: "any", conditions });
    return (
      <div class="cond-group">
        <div class="row spread">
          <select class="cond-comb" value={group.type} onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value === "any" ? { type: "any", conditions: group.conditions } : { type: "all", conditions: group.conditions })}>
            <option value="all">Match all</option>
            <option value="any">Match any</option>
          </select>
          {onRemove && <button class="ghost icon-btn" onClick={onRemove}>×</button>}
        </div>
        {group.conditions.map((c, i) => (
          <ConditionNode key={i} node={c} objects={objects}
            onChange={(n) => onChange(withKids(group.conditions.map((x, j) => (j === i ? n : x))))}
            onRemove={() => onChange(withKids(group.conditions.filter((_, j) => j !== i)))} />
        ))}
        <div class="row cond-add">
          <button class="ghost" onClick={() => onChange(withKids([...group.conditions, blankField()]))}>+ condition</button>
          <button class="ghost" onClick={() => onChange(withKids([...group.conditions, { type: "all", conditions: [] }]))}>+ group</button>
          <button class="ghost" onClick={() => onChange(withKids([...group.conditions, { type: "not", condition: blankField() }]))}>+ not</button>
          <button class="ghost" onClick={() => onChange(withKids([...group.conditions, { type: "sustained", minutes: 5, condition: blankField() }]))}>+ held for…</button>
          <button class="ghost" onClick={() => onChange(withKids([...group.conditions, blankTimeWindow()]))}>+ between hours</button>
        </div>
      </div>
    );
  }
  if (node.type === "not") {
    return (
      <div class="cond-not">
        <span class="cond-not-label">NOT</span>
        <div class="grow"><ConditionNode node={node.condition} objects={objects} onChange={(n) => onChange({ type: "not", condition: n })} /></div>
        {onRemove && <button class="ghost icon-btn" onClick={onRemove}>×</button>}
      </div>
    );
  }
  if (node.type === "sustained") {
    return (
      <div class="cond-not">
        <span class="cond-not-label">FOR</span>
        <input type="number" min="1" max="1440" step="1" style={{ width: "4rem" }} value={node.minutes} onInput={(e) => onChange({ type: "sustained", minutes: Math.round(Math.max(1, Math.min(1440, Number((e.currentTarget as HTMLInputElement).value) || 1))), condition: node.condition })} />
        <span class="muted">min, while</span>
        <div class="grow"><ConditionNode node={node.condition} objects={objects} onChange={(n) => onChange({ type: "sustained", minutes: node.minutes, condition: n })} /></div>
        {onRemove && <button class="ghost icon-btn" onClick={onRemove}>×</button>}
      </div>
    );
  }
  if (node.type === "timeWindow") {
    const tw = node;
    const mask = tw.daysMask ?? 127;
    return (
      <div class="cond-not">
        <span class="cond-not-label">BETWEEN</span>
        <input type="time" value={minToTime(tw.startMin)} onInput={(e) => onChange({ ...tw, startMin: timeToMin((e.currentTarget as HTMLInputElement).value) })} />
        <span class="muted">and</span>
        <input type="time" value={minToTime(tw.endMin)} onInput={(e) => onChange({ ...tw, endMin: timeToMin((e.currentTarget as HTMLInputElement).value) })} />
        <div class="row" style={{ gap: "4px" }}>
          {DAYS.map((d, i) => {
            const on = (mask >> i) & 1;
            return <button key={d} class={`day-toggle ${on ? "on" : ""}`} onClick={() => onChange({ ...tw, daysMask: mask ^ (1 << i) })}>{d}</button>;
          })}
        </div>
        {onRemove && <button class="ghost icon-btn" onClick={onRemove}>×</button>}
      </div>
    );
  }
  const leaf = node;
  const patch = (p: Partial<Extract<Cond, { type: "field" }>>): Cond => ({ type: "field", field: leaf.field, op: leaf.op, value: leaf.value, value2: leaf.value2, valueField: leaf.valueField, ...p });
  // The left side is a single grouped picker: an object on this board, a built-in
  // sense (weather/sun/time/presence/screen/webhook), or "Custom field…" for a raw
  // dotted path. A known field then drives the op list + a matching value control.
  const objMatch = objects?.find((o) => leaf.field === `objects.${o.id}.value`);
  const def = fieldDef(leaf.field);
  const isCustom = !objMatch && !def;
  const fieldValue = objMatch ? `obj:${objMatch.id}` : def ? `cat:${def.field}` : "__custom";
  const onFieldChange = (v: string) => {
    if (v === "__custom") return onChange(patch({ field: "data.", op: "eq", value: "", value2: undefined }));
    if (v.startsWith("obj:")) return onChange(patch({ field: `objects.${v.slice(4)}.value`, op: "eq", value: "", value2: undefined }));
    const d = fieldDef(v.slice(4))!; // catalog field — seed a sensible default op + value
    const op = d.control === "number" ? "gt" : d.control === "text" ? "contains" : "eq";
    const value: unknown = d.control === "bool" ? true : d.control === "select" ? (d.options?.[0]?.value ?? "") : "";
    onChange(patch({ field: d.field, op, value, value2: undefined }));
  };
  const opChoices = def?.control === "number" ? NUM_OPS : def?.control === "select" ? ["eq", "ne", "changed"] : def?.control === "text" ? TEXT_OPS : OPS;
  const valType = def?.control === "number" ? "number" : "text";
  // #5 — the comparison side can be another field ("indoor > outdoor"). Not offered for
  // matches (a regex) or stale (a duration), where a field on the right makes no sense.
  const canVsField = !NO_VALUE_OPS.has(leaf.op) && leaf.op !== "matches" && leaf.op !== "stale";
  const vsField = canVsField && leaf.valueField != null;
  const vfMatch = objects?.find((o) => leaf.valueField === `objects.${o.id}.value`);
  const vfDef = leaf.valueField ? fieldDef(leaf.valueField) : undefined;
  const vfValue = vfMatch ? `obj:${vfMatch.id}` : vfDef ? `cat:${vfDef.field}` : "__custom";
  const onVfChange = (v: string) => {
    if (v === "__custom") return onChange(patch({ valueField: "data." }));
    if (v.startsWith("obj:")) return onChange(patch({ valueField: `objects.${v.slice(4)}.value` }));
    onChange(patch({ valueField: fieldDef(v.slice(4))!.field }));
  };
  return (
    <div class="cond-row">
      <select class="cond-field" value={fieldValue} onChange={(e) => onFieldChange((e.currentTarget as HTMLSelectElement).value)}>
        {objects && objects.length > 0 && (
          <optgroup label="Objects on this board">
            {objects.map((o) => <option key={o.id} value={`obj:${o.id}`}>{o.name}’s value</option>)}
          </optgroup>
        )}
        {CATALOG_GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {FIELD_CATALOG.filter((f) => f.group === g).map((f) => <option key={f.field} value={`cat:${f.field}`}>{f.label}</option>)}
          </optgroup>
        ))}
        <option value="__custom">Custom field…</option>
      </select>
      {isCustom && (
        <input class="cond-field" value={leaf.field} placeholder="data.key" onInput={(e) => onChange(patch({ field: (e.currentTarget as HTMLInputElement).value }))} />
      )}
      {def?.control === "bool" ? (
        <select class="cond-val" value={leaf.value === true || leaf.value === "true" ? "true" : "false"} onChange={(e) => onChange(patch({ op: "eq", value: (e.currentTarget as HTMLSelectElement).value === "true" }))}>
          <option value="true">is yes</option>
          <option value="false">is no</option>
        </select>
      ) : (
        <>
          <select value={leaf.op} onChange={(e) => onChange(patch({ op: (e.currentTarget as HTMLSelectElement).value }))}>
            {opChoices.map((o) => <option key={o} value={o}>{OP_LABEL[o] ?? o}</option>)}
          </select>
          {(leaf.op === "rising" || leaf.op === "falling" || leaf.op === "steady") && leaf.field.startsWith("data.") && (
            // #6 — optional lookback window: blank = the live ~12-min buffer; a number of
            // minutes = direction over the persistent metric history (survives restarts).
            <select class="cond-val" value={String(leaf.value ?? "")} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; onChange(patch({ value: v ? Number(v) : "" })); }}>
              <option value="">live (~12 min)</option>
              <option value="60">over the last hour</option>
              <option value="360">over the last 6 h</option>
              <option value="1440">over the last 24 h</option>
              <option value="10080">over the last 7 days</option>
              <option value="43200">over the last 30 days</option>
            </select>
          )}
          {canVsField && (
            <select class="cond-vs" title="Compare against a typed value or another field" value={vsField ? "field" : "value"} onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value === "field" ? patch({ valueField: "data." }) : patch({ valueField: undefined }))}>
              <option value="value">a value</option>
              <option value="field">another field</option>
            </select>
          )}
          {vsField ? (
            <>
              <select class="cond-field" value={vfValue} onChange={(e) => onVfChange((e.currentTarget as HTMLSelectElement).value)}>
                {objects && objects.length > 0 && (
                  <optgroup label="Objects on this board">
                    {objects.map((o) => <option key={o.id} value={`obj:${o.id}`}>{o.name}’s value</option>)}
                  </optgroup>
                )}
                {CATALOG_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {FIELD_CATALOG.filter((f) => f.group === g).map((f) => <option key={f.field} value={`cat:${f.field}`}>{f.label}</option>)}
                  </optgroup>
                ))}
                <option value="__custom">Custom field…</option>
              </select>
              {!vfMatch && !vfDef && (
                <input class="cond-field" value={leaf.valueField ?? ""} placeholder="data.other" onInput={(e) => onChange(patch({ valueField: (e.currentTarget as HTMLInputElement).value }))} />
              )}
            </>
          ) : (!NO_VALUE_OPS.has(leaf.op) && (
            def?.control === "select"
              ? <select class="cond-val" value={String(leaf.value ?? def.options?.[0]?.value ?? "")} onChange={(e) => onChange(patch({ value: (e.currentTarget as HTMLSelectElement).value }))}>
                  {def.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              : <input class="cond-val" type={valType} value={String(leaf.value ?? "")} placeholder={leaf.op === "between" ? "min" : leaf.op === "matches" ? "regex" : "value"} onInput={(e) => onChange(patch({ value: (e.currentTarget as HTMLInputElement).value }))} />
          ))}
          {leaf.op === "between" && (
            <input class="cond-val" type={valType} value={String(leaf.value2 ?? "")} placeholder="max" onInput={(e) => onChange(patch({ value2: (e.currentTarget as HTMLInputElement).value }))} />
          )}
        </>
      )}
      {onRemove && <button class="ghost icon-btn" onClick={onRemove}>×</button>}
    </div>
  );
}

// The value editor for one settable property — a dropdown of the property's
// choices, an on/off toggle, a number, or free text. Keeps the user from typing
// raw values: "Device status → state → On / Off".
function valueControl(c: ObjControl, value: unknown, onValue: (v: unknown) => void) {
  if (c.control === "select") {
    return (
      <select class="grow" value={String(value ?? c.options?.[0]?.value ?? "")} onChange={(e) => onValue((e.currentTarget as HTMLSelectElement).value)}>
        {(c.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (c.control === "toggle") {
    const on = value === true || value === "true" || value === "on" || value === 1 || value === "1";
    return (
      <div class="row toggle-pair" style={{ gap: "4px" }}>
        <button type="button" class={`day-toggle ${on ? "on" : ""}`} onClick={() => onValue(true)}>{c.onLabel ?? "On"}</button>
        <button type="button" class={`day-toggle ${!on ? "on" : ""}`} onClick={() => onValue(false)}>{c.offLabel ?? "Off"}</button>
      </div>
    );
  }
  if (c.control === "number") {
    return <input class="grow" type="number" value={value == null ? "" : String(value)} placeholder="0" onInput={(e) => onValue((e.currentTarget as HTMLInputElement).value)} />;
  }
  return <input class="grow" value={value == null ? "" : String(value)} placeholder="value" onInput={(e) => onValue((e.currentTarget as HTMLInputElement).value)} />;
}

function ActionFields({ action, objects, devices, boards, scenes, loaded, onChange }: { action: Action; objects?: ObjOption[]; devices?: { id: string; name: string }[]; boards?: { id: number; name: string }[]; scenes?: { id: number; name: string }[]; loaded?: boolean; onChange: (a: Action) => void }) {
  const f = (k: string, v: unknown) => onChange({ ...action, [k]: v });
  const txt = (k: string, ph: string, cls = "") => <input class={cls} value={String(action[k] ?? "")} placeholder={ph} onInput={(e) => f(k, (e.currentTarget as HTMLInputElement).value)} />;
  // Object picker for the object-targeting actions — settable objects only, and we
  // stash the current name + primary prop alongside the stable id.
  const settable = (objects ?? []).filter((o) => o.settable);
  // set-text/prop pick from settable objects; show/hide can target any named object.
  const objSelect = (list: ObjOption[], onPick?: (o: ObjOption | undefined) => void) => {
    const cur = String(action.objectId ?? "");
    const missing = cur !== "" && !list.some((o) => o.id === cur); // target was renamed away or deleted
    return (
      <select value={cur} onChange={(e) => {
        const o = list.find((x) => x.id === (e.currentTarget as HTMLSelectElement).value);
        if (onPick) onPick(o);
        else onChange({ ...action, objectId: o?.id ?? "", objectName: o?.name, ...(action.kind === "setObjectText" ? { prop: o?.prop } : {}) });
      }}>
        <option value="" disabled>Pick an object…</option>
        {missing && <option value={cur}>{`⚠ ${action.objectName ?? cur} (missing)`}</option>}
        {list.map((o) => <option key={o.id} value={o.id}>{`${o.name} (${o.label})`}</option>)}
      </select>
    );
  };
  switch (action.kind) {
    case "setData": return <>{txt("key", "data key")}{txt("value", "value", "grow")}</>;
    case "incrementData": return <>{txt("key", "data key")}{txt("delta", "+1")}</>;
    case "toggleData": return txt("key", "flag key", "grow");
    case "addTask": return <>{txt("listId", "list")}{txt("text", "task text", "grow")}</>;
    case "advanceQueue": return <>{txt("queueId", "queue id")}{txt("delta", "+1")}</>;
    case "switchBoard": {
      // Always pick from dropdowns — the user never types an id. When the list is
      // empty (still loading, or no screens/boards exist yet) the select is disabled
      // with a plain-language hint instead of a raw id box.
      const dev = String(action.deviceId ?? "");
      const lay = action.layoutId != null ? Number(action.layoutId) : 0;
      const devList = devices ?? [];
      const boardList = boards ?? [];
      const devMissing = dev !== "" && !devList.some((d) => d.id === dev);
      const layMissing = !!lay && !boardList.some((b) => b.id === lay);
      const devEmptyLabel = !loaded ? "Loading screens…" : "No screens yet — claim one first";
      const boardEmptyLabel = !loaded ? "Loading boards…" : "No boards yet — create one first";
      return (
        <>
          <select value={dev} disabled={devList.length === 0} onChange={(e) => f("deviceId", (e.currentTarget as HTMLSelectElement).value)}>
            <option value="" disabled>{devList.length ? "Pick a screen…" : devEmptyLabel}</option>
            {devMissing && <option value={dev}>{`⚠ ${dev} (missing)`}</option>}
            {devList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <span class="muted">→</span>
          <select class="grow" value={lay ? String(lay) : ""} disabled={boardList.length === 0} onChange={(e) => f("layoutId", Number((e.currentTarget as HTMLSelectElement).value) || 0)}>
            <option value="" disabled>{boardList.length ? "Pick a board…" : boardEmptyLabel}</option>
            {layMissing && <option value={String(lay)}>{`⚠ board #${lay} (missing)`}</option>}
            {boardList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </>
      );
    }
    case "applyScene": {
      const sid = action.sceneId != null ? Number(action.sceneId) : 0;
      const sceneList = scenes ?? [];
      const sceneMissing = !!sid && !sceneList.some((s) => s.id === sid);
      const emptyLabel = !loaded ? "Loading scenes…" : "No scenes yet — save one on the Account page";
      return (
        <select class="grow" value={sid ? String(sid) : ""} disabled={sceneList.length === 0} onChange={(e) => f("sceneId", Number((e.currentTarget as HTMLSelectElement).value) || 0)}>
          <option value="" disabled>{sceneList.length ? "Pick a scene…" : emptyLabel}</option>
          {sceneMissing && <option value={String(sid)}>{`⚠ scene #${sid} (missing)`}</option>}
          {sceneList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      );
    }
    case "notify": return txt("message", "message", "grow");
    case "alert": return (
      <>
        <select value={String(action.severity ?? "info")} onChange={(e) => f("severity", (e.currentTarget as HTMLSelectElement).value)}>
          <option value="info">info</option><option value="warn">warn</option><option value="critical">critical</option>
        </select>
        {txt("title", "title", "grow")}
        <select value={String(action.respectQuiet ?? "off")} onChange={(e) => f("respectQuiet", (e.currentTarget as HTMLSelectElement).value)} title="What this alert does during a screen's quiet hours">
          <option value="off">Quiet hrs: always show</option>
          <option value="soften">Quiet hrs: soften</option>
          <option value="hold">Quiet hrs: hold till morning</option>
          <option value="suppress">Quiet hrs: skip</option>
        </select>
      </>
    );
    case "webhook": return txt("url", "https://…", "grow");
    case "delay": return <><span class="muted">wait</span>{txt("ms", "1000")}<span class="muted">ms</span></>;
    case "setObjectText": return <>{objSelect(settable)}{txt("text", "new text", "grow")}</>;
    case "setObjectProp": {
      // Smart per-object property picker: pick the object, then the property and
      // its value come from a dropdown/toggle (no remembering prop names or values).
      const obj = settable.find((o) => o.id === action.objectId);
      const controls = controlsFor(obj?.type);
      const pick = objSelect(settable, (o) => {
        const ctrls = controlsFor(o?.type);
        onChange({ ...action, objectId: o?.id ?? "", objectName: o?.name, prop: ctrls?.[0]?.key ?? o?.prop ?? "content", value: "" });
      });
      if (!obj || !controls) return <>{pick}{txt("prop", "property")}{txt("value", "value", "grow")}</>;
      const cur = controls.find((c) => c.key === action.prop) ?? controls[0];
      return (
        <>
          {pick}
          <span class="muted">set</span>
          <select value={cur.key} onChange={(e) => onChange({ ...action, prop: (e.currentTarget as HTMLSelectElement).value, value: "" })}>
            {controls.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <span class="muted">to</span>
          {valueControl(cur, action.value, (v) => f("value", v))}
        </>
      );
    }
    case "showObject": case "hideObject": return objSelect(objects ?? []);
    default: return null;
  }
}

const minToTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMin = (t: string): number => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
