import type { LayoutT, WidgetT } from "@glanceos/schema";
import type { VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, type QueueState, type TaskItem } from "../api";
import { BINDABLE, blockFor, type WidgetType } from "./blocks";
import { BlockIcon } from "./blockIcons";
import { Icon } from "./icons";
import { LocationPicker } from "../components/LocationPicker";

// A geo block left at these schema-default coordinates inherits the screen's
// location (then the account home) at render time — so "Use the screen's location"
// just means resetting to the default. Mirrors widgets.ts geoFor on the server.
const GEO_DEFAULT_LAT = 28.6139, GEO_DEFAULT_LON = 77.209;
const isInheritGeo = (lat: unknown, lon: unknown): boolean =>
  typeof lat === "number" && typeof lon === "number" && Math.abs(lat - GEO_DEFAULT_LAT) < 1e-4 && Math.abs(lon - GEO_DEFAULT_LON) < 1e-4;

// v9.1 — one-click object "looks": set the four container style fields (padding / border /
// corners / background) in a single tap instead of dialling each select. Built from the
// existing BlockStyle fields (v8.1), so a preset is just a normal style edit — no schema
// change, no migration; the screen already renders these classes.
const STYLE_PRESETS: { id: string; label: string; style: { pad: string; border: string; radius: string; bg: string } }[] = [
  { id: "plain", label: "Plain", style: { pad: "none", border: "none", radius: "none", bg: "none" } },
  { id: "card", label: "Card", style: { pad: "m", border: "none", radius: "l", bg: "subtle" } },
  { id: "outline", label: "Outline", style: { pad: "m", border: "strong", radius: "m", bg: "none" } },
  { id: "filled", label: "Filled", style: { pad: "m", border: "none", radius: "m", bg: "strong" } },
];
const presetActive = (style: { pad?: string; border?: string; radius?: string; bg?: string }, p: (typeof STYLE_PRESETS)[number]): boolean =>
  (style.pad ?? "none") === p.style.pad && (style.border ?? "none") === p.style.border && (style.radius ?? "none") === p.style.radius && (style.bg ?? "none") === p.style.bg;

// The right-hand panel: props of the selected block, or board settings when
// nothing is selected. Position is structural (lines and columns), so there
// are no placement fields. Edits flow through stageEdit() — the typing-burst
// gesture — so a run of keystrokes is one undo step.

interface Field {
  key: string;
  label: string;
  kind: "string" | "number" | "boolean" | "select" | "textarea";
  options?: string[];
  numeric?: boolean;
}

const S = (key: string, label: string): Field => ({ key, label, kind: "string" });
const N = (key: string, label: string): Field => ({ key, label, kind: "number" });
const T = (key: string, label: string): Field => ({ key, label, kind: "textarea" });
const B = (key: string, label: string): Field => ({ key, label, kind: "boolean" });
const Sel = (key: string, label: string, options: string[], numeric = false): Field => ({ key, label, kind: "select", options, numeric });

const PROP_FIELDS: Record<WidgetType, Field[]> = {
  clock: [B("showDate", "Show date")],
  weather: [N("latitude", "Latitude"), N("longitude", "Longitude"), S("label", "Label")],
  calendar: [S("url", "ICS URL"), N("maxEvents", "Max events")],
  tasks: [S("listId", "List id"), N("maxItems", "Max items")],
  text: [T("content", "Text"), Sel("align", "Align", ["left", "center"])],
  queue: [S("queueId", "Queue id"), S("title", "Title")],
  heading: [S("content", "Text"), Sel("level", "Level", ["1", "2"], true)],
  divider: [],
  image: [S("url", "Image URL"), Sel("fit", "Fit", ["cover", "contain"])],
  deck: [T("slides", "Slides (separate each with a blank line)"), N("seconds", "Seconds per slide")],
  callout: [T("content", "Text"), S("emoji", "Emoji")],
  subheading: [S("content", "Text")],
  quote: [T("content", "Quote"), S("author", "Author")],
  bulletList: [T("items", "Items (one per line)")],
  numberedList: [T("items", "Items (one per line)")],
  checklist: [T("items", "Items (prefix x for done)")],
  code: [T("content", "Code"), S("language", "Language")],
  label: [S("content", "Text")],
  keyValue: [T("pairs", "Pairs (key: value)")],
  table: [T("content", "Rows (comma or | separated)"), B("header", "First row is header")],
  link: [S("label", "Label"), S("url", "URL")],
  banner: [S("content", "Text")],
  definition: [S("term", "Term"), T("meaning", "Meaning")],
  spacer: [],
  stat: [S("value", "Value"), S("label", "Label")],
  metric: [S("label", "Label"), S("value", "Value"), S("unit", "Unit"), S("delta", "Delta")],
  progress: [S("label", "Label"), N("value", "Percent")],
  rating: [N("value", "Stars (0–5)"), S("label", "Label")],
  gauge: [S("label", "Label"), N("value", "Percent")],
  worldClock: [S("label", "Label"), S("timeZone", "Time zone")],
  countdown: [S("label", "Label"), S("target", "Target (ISO date-time)")],
  daysUntil: [S("label", "Label"), S("target", "Target date (YYYY-MM-DD)")],
  weekNumber: [S("label", "Label")],
  dateBadge: [S("label", "Label")],
  timer: [S("label", "Label"), S("since", "Since (YYYY-MM-DD)")],
  analogClock: [S("label", "Label")],
  moonPhase: [S("label", "Label")],
  sunriseSunset: [N("latitude", "Latitude"), N("longitude", "Longitude"), S("label", "Label")],
  icon: [S("symbol", "Symbol / emoji"), S("label", "Label")],
  avatar: [S("url", "Photo URL"), S("name", "Name"), S("role", "Role")],
  badge: [S("text", "Text")],
  nameTag: [S("name", "Name"), S("subtitle", "Subtitle")],
  hours: [T("content", "Lines (Day: time)")],
  menuList: [T("content", "Lines (item | price)")],
  deviceStatus: [S("label", "Label"), Sel("state", "State", ["on", "off"])],
  sensor: [S("label", "Label"), S("value", "Value"), S("unit", "Unit")],
  thermostat: [S("label", "Label"), N("temperature", "Temperature"), Sel("unit", "Unit", ["C", "F"])],
  // v0.6 text & structure
  lead: [T("content", "Text")],
  pullquote: [T("content", "Quote"), S("author", "Author")],
  dropCap: [T("content", "Text")],
  finePrint: [T("content", "Text")],
  numberedHeading: [S("number", "Number"), S("content", "Title")],
  verse: [T("content", "Lines")],
  ascii: [T("content", "ASCII art")],
  tagCloud: [T("tags", "Tags (comma-separated)")],
  timeline: [T("items", "Lines (time | text)")],
  steps: [T("items", "Steps (one per line)")],
  faq: [T("items", "Lines (question | answer)")],
  prosCons: [T("pros", "Pros (one per line)"), T("cons", "Cons (one per line)")],
  // v0.6 charts
  sparkline: [T("values", "Numbers (comma-separated)"), S("label", "Label")],
  barChart: [T("values", "Numbers (comma-separated)"), S("label", "Label")],
  progressRing: [N("value", "Percent"), S("label", "Label")],
  dotProgress: [N("value", "Filled"), N("total", "Total"), S("label", "Label")],
  scoreboard: [S("leftLabel", "Left"), S("leftScore", "Left score"), S("rightLabel", "Right"), S("rightScore", "Right score")],
  fraction: [S("numerator", "Numerator"), S("denominator", "Denominator"), S("label", "Label")],
  tally: [N("value", "Count"), S("label", "Label")],
  heatStrip: [T("values", "Numbers (comma-separated)"), S("label", "Label")],
  trend: [S("value", "Value"), S("delta", "Delta (e.g. +12%)"), S("label", "Label")],
  kpiSpark: [S("value", "Value"), S("unit", "Unit"), S("label", "Label"), T("values", "Spark numbers")],
  // v0.6 time computed
  dayProgress: [S("label", "Label")],
  yearProgress: [S("label", "Label")],
  weekProgress: [S("label", "Label")],
  greeting: [S("name", "Name (optional)"), B("showContext", "Speak to my day (calendar + weather)"), N("maxContextLength", "Max context length")],
  romanClock: [S("label", "Label")],
  binaryClock: [S("label", "Label")],
  seasonClock: [Sel("hemisphere", "Hemisphere", ["north", "south"]), S("label", "Label")],
  zodiac: [S("date", "Date (YYYY-MM-DD)"), S("label", "Label")],
  // v0.6 trackers
  habitTracker: [S("label", "Label"), S("days", "Days (x or . per day)")],
  streak: [N("value", "Count"), S("label", "Label")],
  waterTracker: [N("value", "Done"), N("total", "Goal"), S("label", "Label")],
  wifiCard: [S("ssid", "Network"), S("password", "Password"), S("label", "Label")],
  // v0.6 live
  forecast: [N("latitude", "Latitude"), N("longitude", "Longitude"), N("days", "Days"), S("label", "Label")],
  windCompass: [N("latitude", "Latitude"), N("longitude", "Longitude"), S("label", "Label")],
  uvIndex: [N("latitude", "Latitude"), N("longitude", "Longitude"), S("label", "Label")],
  airQuality: [N("latitude", "Latitude"), N("longitude", "Longitude"), S("label", "Label")],
  precip: [N("latitude", "Latitude"), N("longitude", "Longitude"), S("label", "Label")],
  headlines: [S("url", "RSS/Atom URL"), N("max", "Max items"), S("label", "Label")],
  currencyRate: [S("from", "From (e.g. USD)"), S("to", "To (e.g. INR)"), S("label", "Label")],
  cryptoPrice: [S("coin", "Coin id (e.g. bitcoin)"), S("vs", "Vs (e.g. usd)"), S("label", "Label")],
  onThisDay: [N("max", "Max items"), S("label", "Label")],
  wikiToday: [S("title", "Article title (blank = random)"), S("label", "Label")],
  quoteLive: [S("label", "Label")],
  factLive: [S("label", "Label")],
  hackerNews: [N("max", "Max items"), S("label", "Label")],
  githubStats: [S("user", "User"), S("repo", "Repo (blank = followers)"), S("label", "Label")],
  nextHoliday: [S("country", "Country code (e.g. IN)"), S("label", "Label")],
  issNow: [S("label", "Label")],
  jsonFeed: [S("url", "JSON URL"), T("template", "Template — {{dotted.path}}"), S("label", "Label"), N("refreshSeconds", "Refresh (seconds)")],
  customData: [S("key", "Data key"), S("label", "Label"), Sel("format", "Format", ["text", "number", "json"])],
  // v0.8 text & structure
  signature: [S("name", "Name"), S("role", "Role")],
  address: [T("content", "Address")],
  byline: [S("author", "Author"), S("date", "Date")],
  legend: [T("items", "Lines (symbol + text)")],
  breadcrumb: [S("path", "Path (a / b / c)")],
  noticeBar: [S("content", "Text"), S("icon", "Icon")],
  keyCombo: [S("keys", "Keys (space-separated)"), S("label", "Label")],
  dividerLabeled: [S("label", "Label")],
  // v0.8 visual
  iconRow: [S("symbols", "Symbols (space-separated)")],
  statRow: [T("items", "Lines (value | label)")],
  spacerDots: [],
  frame: [S("label", "Label"), T("content", "Content")],
  // v0.8 charts
  lineChart: [T("values", "Numbers (comma-separated)"), S("label", "Label")],
  areaChart: [T("values", "Numbers (comma-separated)"), S("label", "Label")],
  bulletGraph: [N("value", "Value"), N("target", "Target"), S("label", "Label")],
  horizontalBars: [T("items", "Lines (label | number)")],
  rankingList: [T("items", "Lines (name | number)")],
  waffle: [N("value", "Percent"), S("label", "Label")],
  signalBars: [N("value", "Bars (0–5)"), S("label", "Label")],
  thermometer: [N("value", "Value"), N("min", "Min"), N("max", "Max"), S("unit", "Unit"), S("label", "Label")],
  comparison: [S("leftLabel", "Left"), N("leftValue", "Left value"), S("rightLabel", "Right"), N("rightValue", "Right value")],
  percentList: [T("items", "Lines (label | number)")],
  // v0.8 time & calendar
  monthCalendar: [S("label", "Label")],
  weekStrip: [S("label", "Label")],
  nowNext: [T("items", "Lines (HH:MM | text)")],
  ageCounter: [S("since", "Since (YYYY-MM-DD)"), S("label", "Label")],
  anniversary: [S("date", "Date (YYYY-MM-DD)"), S("label", "Label")],
  timeBlocks: [T("items", "Lines (range | text)")],
  shiftStatus: [N("open", "Opens at (hour)"), N("close", "Closes at (hour)"), S("label", "Label")],
  pomodoro: [N("workMin", "Work min"), N("breakMin", "Break min"), S("label", "Label")],
  stopwatch: [S("label", "Label"), S("since", "Start (YYYY-MM-DDTHH:MM)"), B("showSeconds", "Show seconds")],
  liveCounter: [S("label", "Label"), N("start", "Start value"), N("perDay", "Increase per day"), S("since", "Counting since (YYYY-MM-DD)"), S("unit", "Unit"), N("decimals", "Decimals")],
  onAir: [S("label", "Label"), N("start", "Start hour (0–24)"), N("end", "End hour (0–24)"), S("onText", "On text"), S("offText", "Off text")],
  upNext: [S("label", "Label"), T("items", "Schedule (HH:MM | Title | Location)")],
  dayTimeline: [S("label", "Label"), T("items", "Schedule (HH:MM | Title)"), N("max", "Max rows")],
  focusNow: [S("label", "Label"), T("items", "Schedule (HH:MM | Title | Location)")],
  leaveBy: [S("label", "Label"), T("items", "Schedule (HH:MM | Title | Location)"), N("travelMinutes", "Travel minutes")],
  sinceYouLooked: [S("title", "Title"), N("max", "Max rows")],
  myDay: [S("name", "Your name"), T("subtitle", "Subtitle line"), B("showDate", "Show date")],
  dailyBrief: [S("title", "Title"), B("showDate", "Show date"), B("showWeather", "Show weather"), N("maxEvents", "Max events"), N("maxTasks", "Max tasks")],
  healthRing: [S("label", "Label"), N("value", "Value"), N("goal", "Goal"), S("unit", "Unit")],
  homeTile: [S("label", "Label"), S("icon", "Icon"), S("value", "Value"), S("unit", "Unit")],
  sunArc: [N("latitude", "Latitude"), N("longitude", "Longitude"), S("label", "Label")],
  nextFullMoon: [S("label", "Label")],
  // v0.8 trackers
  monthHabit: [S("label", "Label"), T("days", "Days (x or . each)")],
  savingsGoal: [N("saved", "Saved"), N("target", "Target"), S("unit", "Unit"), S("label", "Label")],
  readingNow: [S("title", "Title"), S("author", "Author"), N("percent", "Percent")],
  weightTrend: [T("values", "Numbers (comma-separated)"), S("unit", "Unit"), S("label", "Label")],
  moodWeek: [S("moods", "Moods (space-separated)")],
  checklistProgress: [T("items", "Items (prefix x for done)"), S("label", "Label")],
  // v0.8 signage & office
  roomStatus: [S("room", "Room"), Sel("status", "Status", ["free", "busy"])],
  directory: [T("items", "Lines (name | location)")],
  eventBanner: [S("title", "Title"), S("when", "When")],
  openSign: [B("open", "Open"), S("label", "Label")],
  nowPlaying: [S("title", "Track"), S("artist", "Artist")],
  splitFlap: [S("text", "Text")],
  // v0.9 text & structure
  epigraph: [T("content", "Quote"), S("author", "Author")],
  kicker: [S("kicker", "Eyebrow"), S("title", "Title")],
  ticker: [S("content", "Text")],
  glossary: [T("items", "Lines (term | meaning)")],
  footnotes: [T("items", "Notes (one per line)")],
  highlight: [T("content", "Text")],
  letterhead: [S("name", "Name"), S("tagline", "Tagline")],
  fieldRow: [S("label", "Label"), S("value", "Value")],
  contents: [T("items", "Entries (one per line)")],
  aside: [T("content", "Text")],
  postscript: [S("content", "Text")],
  mantra: [S("content", "Text")],
  // v0.9 media & identity
  emojiStat: [S("emoji", "Emoji"), S("label", "Label")],
  monogram: [S("letters", "Letters"), S("label", "Label")],
  flag: [S("emoji", "Flag emoji"), S("label", "Label")],
  logoText: [S("text", "Text")],
  profileCard: [S("name", "Name"), S("role", "Role"), S("detail", "Detail")],
  peopleList: [T("items", "Lines (name | role)")],
  // v0.9 numbers
  bigNumber: [S("value", "Value"), S("caption", "Caption")],
  percentBig: [N("value", "Percent"), S("label", "Label")],
  deltaStat: [S("value", "Value"), S("delta", "Delta (e.g. +12%)"), S("label", "Label")],
  moneyStat: [S("amount", "Amount"), S("currency", "Currency symbol"), S("label", "Label")],
  counterPair: [S("leftLabel", "Left"), S("leftValue", "Left value"), S("rightLabel", "Right"), S("rightValue", "Right value")],
  targetMeter: [N("value", "Value"), N("target", "Target"), S("unit", "Unit"), S("label", "Label")],
  unitStat: [S("value", "Value"), S("unit", "Unit"), S("label", "Label")],
  progressBars: [T("items", "Lines (label | percent)")],
  // v0.9 charts
  lollipopChart: [T("items", "Lines (label | number)")],
  winLossBar: [T("values", "1 win, -1 loss, 0 tie"), S("label", "Label")],
  dotMatrix: [N("value", "Filled"), N("total", "Total"), S("label", "Label")],
  rangeBar: [N("min", "Min"), N("max", "Max"), N("value", "Value"), S("label", "Label")],
  bubbleScale: [T("items", "Lines (label | number)")],
  starBar: [N("value", "Filled"), N("max", "Out of"), S("label", "Label")],
  columnLabels: [T("items", "Lines (label | number)")],
  deltaList: [T("items", "Lines (label | +/-n)")],
  gaugeMini: [N("value", "Percent"), S("label", "Label")],
  histogram: [T("values", "Numbers (comma-separated)"), S("label", "Label")],
  // v0.9 time computed
  fullDate: [S("label", "Label")],
  monthName: [S("label", "Label")],
  timeOfDay: [S("label", "Label")],
  quarterProgress: [S("label", "Label")],
  daysLeftMonth: [S("label", "Label")],
  unixClock: [S("label", "Label")],
  tzPair: [S("labelA", "Left label"), S("tzA", "Left time zone"), S("labelB", "Right label"), S("tzB", "Right time zone")],
  nextWeekday: [Sel("weekday", "Weekday", ["0", "1", "2", "3", "4", "5", "6"], true), S("label", "Label")],
  // v0.9 nature computed
  daylight: [N("latitude", "Latitude"), N("longitude", "Longitude"), S("label", "Label")],
  moonProgress: [S("label", "Label")],
  seasonProgress: [Sel("hemisphere", "Hemisphere", ["north", "south"]), S("label", "Label")],
  goldenHour: [N("latitude", "Latitude"), N("longitude", "Longitude"), S("label", "Label")],
  // v0.9 trackers
  goalProgress: [N("value", "Value"), N("target", "Target"), S("unit", "Unit"), S("label", "Label")],
  stepsToday: [N("value", "Steps"), N("goal", "Goal"), S("label", "Label")],
  streakPair: [N("current", "Current"), N("best", "Best"), S("label", "Label")],
  bookList: [T("items", "Lines (title | author)")],
  moodToday: [S("emoji", "Emoji"), S("label", "Label")],
  budgetLine: [N("spent", "Spent"), N("budget", "Budget"), S("unit", "Unit"), S("label", "Label")],
  // v0.9 info & signage
  welcomeSign: [S("message", "Message"), S("name", "Name")],
  priceTag: [S("item", "Item"), S("price", "Price"), S("unit", "Currency symbol")],
  todaySpecial: [S("title", "Title"), S("detail", "Detail")],
  phoneNumber: [S("label", "Label"), S("number", "Number")],
  socialHandle: [S("platform", "Platform"), S("handle", "Handle")],
  wayfinding: [T("items", "Lines (place | direction)")],
};

// The per-block fields + emphasis controls, rendered on-board in the toolbar's
// Options popover (no longer the side panel). Header/delete live on the toolbar.
export function BlockFields({
  block,
  stageEdit,
  onMakeLive,
}: {
  block: WidgetT;
  stageEdit: (mutate: (d: LayoutT) => void) => void;
  onMakeLive?: () => void;
}) {
  const editProp = (key: string, value: unknown) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) (target.props as Record<string, unknown>)[key] = value;
    });
  // The object's name (used to target it from automations). Type freely; on blur
  // we resolve collisions so names stay unique within the board.
  const setName = (raw: string) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) target.name = raw.slice(0, 60);
    });
  const resolveName = () =>
    stageEdit((d) => {
      const blocks = d.rows.flatMap((r) => r.blocks);
      const target = blocks.find((b) => b.id === block.id);
      if (!target) return;
      const desired = (target.name ?? "").trim() || blockFor(target.type).label;
      const taken = new Set(blocks.filter((b) => b.id !== block.id && b.name).map((b) => b.name!.toLowerCase()));
      let nm = desired;
      for (let n = 2; taken.has(nm.toLowerCase()); n++) nm = `${desired} ${n}`;
      target.name = nm;
    });
  const editStyle = (patch: Partial<{ invert: boolean; align: string; valign: string; pad: string; border: string; radius: string; bg: string; size: string }>) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) target.style = { ...target.style, ...patch } as typeof target.style;
    });
  const editVisibility = (v: string) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) target.visibility = v === "whenData" ? "whenData" : undefined;
    });
  // #50 — value-conditional visibility: show the block only when its value passes a test.
  const editVisibleWhen = (op: string, value?: string) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (!target) return;
      target.visibleWhen = op ? ({ op, value: op === "empty" || op === "nonempty" ? undefined : value } as typeof target.visibleWhen) : undefined;
    });
  // #22 — authored fallback shown on the screen when the bound data is missing/empty.
  const editFallback = (text: string) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) target.fallback = text.trim() || undefined;
    });
  // #149 — mark a block to hide while Focus mode is on (set focusHide; undefined when off).
  const editFocusHide = (on: boolean) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) target.focusHide = on || undefined;
    });
  // #80 — per-block schedule: show the block only inside a time/day/date window. Merge a patch
  // (a null/"" field clears it); an all-blank schedule prunes back to undefined (= always shown).
  const sched = block.schedule;
  const editSchedule = (patch: Partial<NonNullable<WidgetT["schedule"]>> | null) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (!target) return;
      if (patch === null) { target.schedule = undefined; return; }
      const next: Record<string, unknown> = { ...(target.schedule ?? {}), ...patch };
      for (const k of Object.keys(next)) if (next[k] == null || next[k] === "") delete next[k];
      target.schedule = (Object.keys(next).length ? next : undefined) as WidgetT["schedule"];
    });
  const dayOn = (b: number): boolean => (sched?.daysMask == null ? true : ((sched.daysMask >> b) & 1) === 1);
  const toggleDay = (b: number) => { const base = sched?.daysMask ?? 127; const next = base ^ (1 << b); editSchedule({ daysMask: next === 127 ? undefined : next }); };
  const hhmm = (m?: number) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  const toMin = (s: string): number | undefined => { const m = /^(\d{2}):(\d{2})$/.exec(s); return m ? Number(m[1]) * 60 + Number(m[2]) : undefined; };
  const clearSource = () =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) target.source = undefined;
    });
  // Set a geo block's coordinates in one edit (the two raw lat/lon fields are
  // replaced by a friendly location control — search a city or use my location).
  const setGeo = (lat: number, lon: number) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) { const p = target.props as Record<string, unknown>; p.latitude = lat; p.longitude = lon; }
    });
  const props = block.props as Record<string, unknown>;
  const allFields = PROP_FIELDS[block.type];
  // Hide raw latitude/longitude inputs when the block is geo-aware — a LocationField
  // takes their place. Other props still render normally.
  const hasGeo = allFields.some((f) => f.key === "latitude") && allFields.some((f) => f.key === "longitude");
  const fields = hasGeo ? allFields.filter((f) => f.key !== "latitude" && f.key !== "longitude") : allFields;
  const style = block.style;

  return (
    <div class="block-fields">
      <h3>{blockFor(block.type).label}</h3>
      <label class="field object-name-field">
        <span>Object name <span class="muted">— refer to it in automations</span></span>
        <input
          value={block.name ?? ""}
          placeholder={blockFor(block.type).label}
          maxLength={60}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          onBlur={resolveName}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        />
      </label>
      <div class="row wrap">
        {fields.map((f) => (
          <PropField key={f.key} field={f} value={props[f.key]} onChange={(v) => editProp(f.key, v)} />
        ))}
        {fields.length === 0 && !hasGeo && <p class="muted">Nothing to configure.</p>}
      </div>
      {hasGeo && (
        <div class="field grow geo-field">
          <span>Location <span class="muted">— for this block</span></span>
          {isInheritGeo(props.latitude, props.longitude) ? (
            <p class="muted setting-help">Following the screen's location (or your account home). Search a city or use your location to pin this block to a specific place.</p>
          ) : (
            <div class="row spread geo-current">
              <span class="muted">📍 {Number(props.latitude).toFixed(3)}, {Number(props.longitude).toFixed(3)}</span>
              <button class="ghost" onClick={() => setGeo(GEO_DEFAULT_LAT, GEO_DEFAULT_LON)}>Follow screen</button>
            </div>
          )}
          <LocationPicker current={null} onPick={(l) => setGeo(l.latitude, l.longitude)} onClear={() => setGeo(GEO_DEFAULT_LAT, GEO_DEFAULT_LON)} />
        </div>
      )}
      {block.type === "image" && <ImageUpload onUploaded={(url) => editProp("url", url)} />}
      {block.type === "tasks" && <TasksItemsEditor listId={(props.listId as string) || "default"} />}
      {block.type === "queue" && <QueueCounterEditor queueId={(props.queueId as string) || "default"} />}
      {block.type === "text" && (
        <label class="field">
          <span>Format</span>
          <select value={(props.format as string) ?? "plain"} onChange={(e) => editProp("format", (e.currentTarget as HTMLSelectElement).value)}>
            <option value="plain">Plain text</option>
            <option value="markdown">Markdown (**bold**, *italic*, [link](url))</option>
          </select>
        </label>
      )}
      {BINDABLE.has(block.type) && onMakeLive && (
        <div class="field make-live">
          <span>Live data <span class="muted">— update on its own</span></span>
          {block.source ? (
            <div class="row make-live-row">
              <span class="make-live-badge"><span class="status-dot live" aria-hidden="true" /> Live · {block.source.kind.split(".")[0]}</span>
              <button class="ghost" type="button" onClick={onMakeLive}>Edit source</button>
              <button class="ghost" type="button" onClick={clearSource}>Make static</button>
            </div>
          ) : (
            <button class="primary make-live-btn" type="button" onClick={onMakeLive}><Icon.link /> Make it live</button>
          )}
        </div>
      )}
      {BINDABLE.has(block.type) && (
        <>
          <label class="field">
            <span>Visibility</span>
            <select value={block.visibility ?? "always"} onChange={(e) => editVisibility((e.currentTarget as HTMLSelectElement).value)}>
              <option value="always">Always show</option>
              <option value="whenData">Only when its source has data</option>
            </select>
          </label>
          <label class="field">
            <span>Show only when value…</span>
            <select value={block.visibleWhen?.op ?? ""} onChange={(e) => editVisibleWhen((e.currentTarget as HTMLSelectElement).value, block.visibleWhen?.value != null ? String(block.visibleWhen.value) : "")}>
              <option value="">Always (no value test)</option>
              <option value="gt">greater than</option>
              <option value="gte">≥</option>
              <option value="lt">less than</option>
              <option value="lte">≤</option>
              <option value="eq">equals</option>
              <option value="ne">does not equal</option>
              <option value="nonempty">is not empty</option>
              <option value="empty">is empty</option>
            </select>
          </label>
          {block.visibleWhen && block.visibleWhen.op !== "empty" && block.visibleWhen.op !== "nonempty" && (
            <label class="field">
              <span>Value</span>
              <input value={block.visibleWhen.value != null ? String(block.visibleWhen.value) : ""} onInput={(e) => editVisibleWhen(block.visibleWhen!.op, (e.currentTarget as HTMLInputElement).value)} />
            </label>
          )}
          <label class="field">
            <span>When no data, show…</span>
            <input placeholder="(leave blank to keep the block's own content)" value={block.fallback ?? ""} onInput={(e) => editFallback((e.currentTarget as HTMLInputElement).value)} />
          </label>
        </>
      )}
      <label class="field checkbox">
        <input type="checkbox" checked={!!block.focusHide} onChange={(e) => editFocusHide((e.currentTarget as HTMLInputElement).checked)} />
        <span>Hide in Focus mode</span>
      </label>
      <label class="field checkbox">
        <input type="checkbox" checked={!!sched} onChange={(e) => editSchedule((e.currentTarget as HTMLInputElement).checked ? {} : null)} />
        <span>Show only on a schedule</span>
      </label>
      {sched && (
        <div class="block-schedule">
          <div class="row">
            <label class="field"><span>From</span>
              <input type="time" value={hhmm(sched.startMin)} onInput={(e) => editSchedule({ startMin: toMin((e.currentTarget as HTMLInputElement).value) })} />
            </label>
            <label class="field"><span>To</span>
              <input type="time" value={hhmm(sched.endMin)} onInput={(e) => editSchedule({ endMin: toMin((e.currentTarget as HTMLInputElement).value) })} />
            </label>
          </div>
          <div class="row wrap day-pills" role="group" aria-label="Days of week">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <button type="button" key={i} class={`day-pill${dayOn(i) ? " on" : ""}`} aria-pressed={dayOn(i)} onClick={() => toggleDay(i)}>{d}</button>
            ))}
          </div>
          <div class="row">
            <label class="field"><span>Start date</span>
              <input type="date" value={sched.fromDate ?? ""} onInput={(e) => editSchedule({ fromDate: (e.currentTarget as HTMLInputElement).value })} />
            </label>
            <label class="field"><span>End date</span>
              <input type="date" value={sched.toDate ?? ""} onInput={(e) => editSchedule({ toDate: (e.currentTarget as HTMLInputElement).value })} />
            </label>
          </div>
          <p class="muted tiny">Hidden outside this window. Leave times empty for all-day; all days on = every day.</p>
        </div>
      )}
      <h4>Emphasis</h4>
      <div class="row wrap">
        <label class="field checkbox">
          <input type="checkbox" checked={style.invert} onChange={(e) => editStyle({ invert: (e.currentTarget as HTMLInputElement).checked })} />
          <span>Invert (black)</span>
        </label>
        <Segmented label="Align" value={style.align} options={["start", "center", "end"]} icons={[<Icon.alignLeft />, <Icon.alignCenter />, <Icon.alignRight />]} onChange={(v) => editStyle({ align: v })} />
        <Segmented label="Vertical" value={style.valign} options={["top", "middle", "bottom"]} icons={[<Icon.alignTop />, <Icon.alignMiddle />, <Icon.alignBottom />]} onChange={(v) => editStyle({ valign: v })} />
      </div>
      <h4>Design</h4>
      <div class="style-presets">
        {STYLE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            class={`style-preset${presetActive(style, p) ? " active" : ""}`}
            onClick={() => editStyle(p.style)}
            title={`${p.label} look`}
          >
            <span class={`sp-swatch sp-${p.id}`} aria-hidden="true" />
            <span class="sp-label">{p.label}</span>
          </button>
        ))}
      </div>
      <div class="row wrap">
        <label class="field">
          <span>Padding</span>
          <select value={style.pad ?? "none"} onChange={(e) => editStyle({ pad: (e.currentTarget as HTMLSelectElement).value })}>
            <option value="none">None</option><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option>
          </select>
        </label>
        <label class="field">
          <span>Border</span>
          <select value={style.border ?? "none"} onChange={(e) => editStyle({ border: (e.currentTarget as HTMLSelectElement).value })}>
            <option value="none">None</option><option value="thin">Thin</option><option value="strong">Strong</option>
          </select>
        </label>
        <label class="field">
          <span>Corners</span>
          <select value={style.radius ?? "none"} onChange={(e) => editStyle({ radius: (e.currentTarget as HTMLSelectElement).value })}>
            <option value="none">Square</option><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option>
          </select>
        </label>
        <label class="field">
          <span>Background</span>
          <select value={style.bg ?? "none"} onChange={(e) => editStyle({ bg: (e.currentTarget as HTMLSelectElement).value })}>
            <option value="none">None</option><option value="subtle">Subtle</option><option value="strong">Strong</option>
          </select>
        </label>
        <label class="field">
          <span>Text size</span>
          <select value={style.size ?? "m"} onChange={(e) => editStyle({ size: (e.currentTarget as HTMLSelectElement).value })}>
            <option value="xs">XS</option><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option><option value="xl">XL</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function ImageUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [status, setStatus] = useState("");
  const pick = async (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    setStatus("Uploading…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.upload<{ url?: string; error?: string }>("/api/uploads", fd);
      if (!r.url) throw new Error(r.error || "upload failed");
      onUploaded(r.url);
      setStatus("Uploaded ✓");
    } catch (err) {
      setStatus(String(err instanceof Error ? err.message : err));
    }
  };
  return (
    <label class="field">
      <span>Upload image <em>(PNG/JPEG/WebP/GIF, ≤2 MB)</em></span>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pick} />
      {status && <span class="field-hint muted">{status}</span>}
    </label>
  );
}

// Manage the to-do items behind THIS block's list (its listId). Each tasks block
// with a different listId edits a different list — fully independent. Edits push
// to live screens server-side, so the board updates without a reload.
function TasksItemsEditor({ listId }: { listId: string }) {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [text, setText] = useState("");
  const refresh = () => api.get<TaskItem[]>(`/api/tasks?listId=${encodeURIComponent(listId)}`).then(setItems).catch(() => {});
  useEffect(() => { refresh(); }, [listId]);
  const add = async () => {
    if (!text.trim()) return;
    await api.post("/api/tasks", { listId, text }).catch(() => {});
    setText("");
    refresh();
  };
  return (
    <div class="block-data">
      <h4>List items <span class="muted">· {listId}</span></h4>
      <div class="row">
        <label class="field grow"><span>New item</span>
          <input value={text} onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        </label>
        <button onClick={add}>Add</button>
      </div>
      <ul class="tasks">
        {items.map((item) => (
          <li key={item.id} class="row spread">
            <label class="field checkbox">
              <input type="checkbox" checked={item.done} onChange={() => api.patch(`/api/tasks/${item.id}`, { done: !item.done }).then(refresh)} />
              <span class={item.done ? "done" : ""}>{item.text}</span>
            </label>
            <button class="ghost" onClick={() => api.del(`/api/tasks/${item.id}`).then(refresh)} aria-label="Delete item"><Icon.x /></button>
          </li>
        ))}
        {items.length === 0 && <li class="muted">No items yet.</li>}
      </ul>
    </div>
  );
}

// Drive THIS block's queue counter (its queueId) — now-serving + waiting.
function QueueCounterEditor({ queueId }: { queueId: string }) {
  const [queue, setQueue] = useState<QueueState | null>(null);
  const refresh = () => api.get<QueueState>(`/api/queues/${encodeURIComponent(queueId)}`).then(setQueue).catch(() => {});
  useEffect(() => { refresh(); }, [queueId]);
  const act = (path: string, body?: unknown) => api.post<QueueState>(path, body).then(setQueue).catch(() => {});
  const base = `/api/queues/${encodeURIComponent(queueId)}`;
  return (
    <div class="block-data">
      <h4>Queue <span class="muted">· {queueId}</span></h4>
      <p class="muted">Now serving <strong>{queue?.now_serving ?? "—"}</strong> · waiting {queue?.waiting ?? "—"}</p>
      <div class="row wrap">
        <button class="primary" onClick={() => act(`${base}/advance`)}>Next +1</button>
        <button onClick={() => act(`${base}/waiting`, { delta: 1 })}>Waiting +1</button>
        <button onClick={() => act(`${base}/waiting`, { delta: -1 })}>Waiting −1</button>
        <button class="danger" onClick={() => act(`${base}/reset`)}>Reset</button>
      </div>
    </div>
  );
}

function Segmented({ label, value, options, icons, onChange }: { label: string; value: string; options: string[]; icons: (string | VNode)[]; onChange: (v: string) => void }) {
  return (
    <div class="field">
      <span>{label}</span>
      <div class="segmented">
        {options.map((o, i) => (
          <button key={o} class={value === o ? "seg active" : "seg"} title={o} onClick={() => onChange(o)}>
            {icons[i]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BoardSettings({ doc, commitDoc }: { doc: LayoutT; commitDoc: (doc: LayoutT) => void }) {
  return (
    <section class="properties">
      <h3>Board settings</h3>
      <p class="muted">Select a block to edit it — or tune the board.</p>
      <div class="row wrap">
        <label class="field">
          <span>Gap <span class="muted">(0–8)</span></span>
          <input
            type="number" min={0} max={8} step={1}
            value={doc.gap}
            onInput={(e) => commitDoc({ ...structuredClone(doc), gap: Math.round(Math.max(0, Math.min(8, Number((e.currentTarget as HTMLInputElement).value) || 0))) })}
          />
        </label>
        <label class="field">
          <span>Theme</span>
          <select
            value={doc.theme.mode}
            onChange={(e) => commitDoc({ ...structuredClone(doc), theme: { ...doc.theme, mode: (e.currentTarget as HTMLSelectElement).value as "light" | "dark" | "auto" } })}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto (follows the sun)</option>
          </select>
        </label>
        <label class="field">
          <span>Look</span>
          <select
            value={doc.theme.look ?? ""}
            onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; const theme = { ...doc.theme }; if (v) theme.look = v as "editorial" | "terminal" | "grotesk" | "stencil"; else delete theme.look; commitDoc({ ...structuredClone(doc), theme }); }}
          >
            <option value="">Default</option>
            <option value="editorial">Editorial</option>
            <option value="terminal">Terminal</option>
            <option value="grotesk">Grotesk</option>
            <option value="stencil">Stencil</option>
          </select>
        </label>
        <label class="field">
          <span>Font size</span>
          <select
            value={doc.theme.fontScale ?? "m"}
            onChange={(e) => commitDoc({ ...structuredClone(doc), theme: { ...doc.theme, fontScale: (e.currentTarget as HTMLSelectElement).value as "s" | "m" | "l" } })}
          >
            <option value="s">Small</option>
            <option value="m">Medium</option>
            <option value="l">Large</option>
          </select>
        </label>
        <label class="field">
          <span>Vertical align</span>
          <select
            value={doc.align ?? "top"}
            onChange={(e) => commitDoc({ ...structuredClone(doc), align: (e.currentTarget as HTMLSelectElement).value as "top" | "center" | "bottom" })}
          >
            <option value="top">Top</option>
            <option value="center">Center</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label class="field">
          <span>Spotlight</span>
          <select
            value={doc.spotlight ? "on" : "off"}
            onChange={(e) => { const on = (e.currentTarget as HTMLSelectElement).value === "on"; const next = structuredClone(doc); if (on) next.spotlight = { seconds: doc.spotlight?.seconds ?? 20 }; else delete next.spotlight; commitDoc(next); }}
          >
            <option value="off">Off</option>
            <option value="on">Cycle emphasis across objects</option>
          </select>
        </label>
        {doc.spotlight && (
          <label class="field">
            <span>Spotlight <span class="muted">(secs each)</span></span>
            <input
              type="number" min={3} max={600} step={1}
              value={doc.spotlight.seconds}
              onInput={(e) => commitDoc({ ...structuredClone(doc), spotlight: { seconds: Math.round(Math.max(3, Math.min(600, Number((e.currentTarget as HTMLInputElement).value) || 20))) } })}
            />
          </label>
        )}
      </div>
    </section>
  );
}

function PropField({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  if (field.kind === "boolean") {
    return (
      <label class="field checkbox">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.kind === "select") {
    return (
      <label class="field">
        <span>{field.label}</span>
        <select
          value={String(value ?? "")}
          onChange={(e) => {
            const raw = (e.currentTarget as HTMLSelectElement).value;
            onChange(field.numeric ? Number(raw) : raw);
          }}
        >
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (field.kind === "textarea") {
    return (
      <label class="field grow">
        <span>{field.label}</span>
        <textarea value={String(value ?? "")} onInput={(e) => onChange((e.currentTarget as HTMLTextAreaElement).value)} />
      </label>
    );
  }
  return (
    <label class="field">
      <span>{field.label}</span>
      <input
        value={String(value ?? "")}
        onInput={(e) => {
          const raw = (e.currentTarget as HTMLInputElement).value;
          onChange(field.kind === "number" ? Number(raw) || 0 : raw);
        }}
      />
    </label>
  );
}

// A layers-style list of every named object on the board: click to select it on
// the canvas, rename inline (kept unique), and show/hide it (the same `hidden`
// flag automations toggle). Lives in the Studio side panel.
export function ObjectsPanel({ doc, stageEdit, onSelect, selectedIds }: {
  doc: LayoutT;
  stageEdit: (mutate: (d: LayoutT) => void) => void;
  onSelect: (id: string) => void;
  selectedIds: string[];
}) {
  const blocks = doc.rows.flatMap((r) => r.blocks).filter((b) => b.name);
  const setName = (id: string, raw: string) => stageEdit((d) => {
    const t = d.rows.flatMap((r) => r.blocks).find((b) => b.id === id);
    if (t) t.name = raw.slice(0, 60);
  });
  const resolveName = (id: string) => stageEdit((d) => {
    const all = d.rows.flatMap((r) => r.blocks);
    const t = all.find((b) => b.id === id);
    if (!t) return;
    const desired = (t.name ?? "").trim() || blockFor(t.type).label;
    const taken = new Set(all.filter((b) => b.id !== id && b.name).map((b) => b.name!.toLowerCase()));
    let nm = desired;
    for (let n = 2; taken.has(nm.toLowerCase()); n++) nm = `${desired} ${n}`;
    t.name = nm;
  });
  const toggleHidden = (id: string) => stageEdit((d) => {
    const t = d.rows.flatMap((r) => r.blocks).find((b) => b.id === id);
    if (t) t.hidden = !t.hidden;
  });
  // Reorder: swap the object with its neighbour in reading order (across rows too).
  // Structure-preserving — each row keeps its column count; only the block in a slot
  // changes (the block carries its own width). Safe for the row/column doc model.
  const move = (id: string, dir: -1 | 1) => stageEdit((d) => {
    const slots: { ri: number; bi: number }[] = [];
    d.rows.forEach((r, ri) => r.blocks.forEach((_, bi) => slots.push({ ri, bi })));
    const k = slots.findIndex((p) => d.rows[p.ri].blocks[p.bi].id === id);
    const nk = k + dir;
    if (k < 0 || nk < 0 || nk >= slots.length) return;
    const a = slots[k]!, b = slots[nk]!;
    const tmp = d.rows[a.ri]!.blocks[a.bi]!;
    d.rows[a.ri]!.blocks[a.bi] = d.rows[b.ri]!.blocks[b.bi]!;
    d.rows[b.ri]!.blocks[b.bi] = tmp;
  });
  if (blocks.length === 0) return <p class="muted objects-empty">No objects yet — add a block to the board.</p>;
  return (
    <ul class="objects-list">
      {blocks.map((b, i) => (
        <li key={b.id} class={`object-row${selectedIds.includes(b.id) ? " on" : ""}${b.hidden ? " is-hidden" : ""}`}>
          <button class="object-pick" title={`Select ${blockFor(b.type).label} on the board`} onClick={() => onSelect(b.id)}><BlockIcon type={b.type} /></button>
          <input class="object-name-input" value={b.name ?? ""} aria-label="Object name" maxLength={60}
            onInput={(e) => setName(b.id, (e.currentTarget as HTMLInputElement).value)}
            onBlur={() => resolveName(b.id)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }} />
          <span class="object-type muted">{blockFor(b.type).label}</span>
          <span class="object-move">
            <button class="icon-btn" title="Move earlier" disabled={i === 0} onClick={() => move(b.id, -1)}>↑</button>
            <button class="icon-btn" title="Move later" disabled={i === blocks.length - 1} onClick={() => move(b.id, 1)}>↓</button>
          </span>
          <button class="icon-btn object-eye" title={b.hidden ? "Show on screens" : "Hide on screens"} aria-pressed={!!b.hidden} onClick={() => toggleHidden(b.id)}>
            {b.hidden ? <Icon.eyeOff /> : <Icon.eye />}
          </button>
        </li>
      ))}
    </ul>
  );
}
