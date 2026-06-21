// Which properties of each object type an automation can set, and the value
// control + choices for each. Plain data (no imports) so the light main-shell
// automation builder can use it without pulling the Studio/schema bundle.
//
// Mirrors the meaningful, automatable props per block type — the engine's
// setObjectProp can patch ANY prop on a (non-live) block, so this just makes the
// builder offer the right pickers ("Device status → state → On / Off") instead of
// raw prop/value text. Types not listed fall back to a generic property+value field.

export interface ObjControl {
  key: string; // the block prop to set
  label: string; // human label in the picker
  control: "select" | "toggle" | "number" | "text"; // value editor
  options?: { value: string; label: string }[]; // for "select"
  onLabel?: string; // for "toggle"
  offLabel?: string;
}

const onOff = (on = "On", off = "Off"): ObjControl["options"] => [{ value: "on", label: on }, { value: "off", label: off }];

export const OBJECT_CONTROLS: Record<string, ObjControl[]> = {
  // ---- smart home / signage (enums + booleans — the headline cases) ----
  deviceStatus: [{ key: "state", label: "State", control: "select", options: onOff() }],
  openSign: [{ key: "open", label: "Sign", control: "toggle", onLabel: "Open", offLabel: "Closed" }],
  roomStatus: [{ key: "status", label: "Status", control: "select", options: [{ value: "free", label: "Free" }, { value: "busy", label: "Busy" }] }],
  thermostat: [
    { key: "temperature", label: "Temperature", control: "number" },
    { key: "unit", label: "Unit", control: "select", options: [{ value: "C", label: "°C" }, { value: "F", label: "°F" }] },
  ],
  onAir: [{ key: "onText", label: "On text", control: "text" }, { key: "offText", label: "Off text", control: "text" }],
  sensor: [{ key: "value", label: "Reading", control: "text" }, { key: "unit", label: "Unit", control: "text" }],
  nowPlaying: [{ key: "title", label: "Title", control: "text" }, { key: "artist", label: "Artist", control: "text" }],
  splitFlap: [{ key: "text", label: "Text", control: "text" }],
  homeTile: [{ key: "value", label: "Value", control: "text" }, { key: "icon", label: "Icon", control: "text" }, { key: "label", label: "Label", control: "text" }],

  // ---- numbers / metrics / status ----
  stat: [{ key: "value", label: "Value", control: "text" }, { key: "label", label: "Label", control: "text" }],
  metric: [{ key: "value", label: "Value", control: "text" }, { key: "unit", label: "Unit", control: "text" }, { key: "delta", label: "Delta", control: "text" }],
  bigNumber: [{ key: "value", label: "Value", control: "text" }, { key: "caption", label: "Caption", control: "text" }],
  trend: [{ key: "value", label: "Value", control: "text" }, { key: "delta", label: "Delta", control: "text" }],
  deltaStat: [{ key: "value", label: "Value", control: "text" }, { key: "delta", label: "Delta", control: "text" }],
  moneyStat: [{ key: "amount", label: "Amount", control: "text" }, { key: "currency", label: "Currency", control: "text" }],
  progress: [{ key: "value", label: "Percent", control: "number" }],
  gauge: [{ key: "value", label: "Value", control: "number" }],
  percentBig: [{ key: "value", label: "Percent", control: "number" }],
  progressRing: [{ key: "value", label: "Percent", control: "number" }],
  rating: [{ key: "value", label: "Stars", control: "number" }],
  tally: [{ key: "value", label: "Count", control: "number" }],
  streak: [{ key: "value", label: "Streak", control: "number" }],
  healthRing: [{ key: "value", label: "Value", control: "number" }, { key: "goal", label: "Goal", control: "number" }],
  liveCounter: [{ key: "start", label: "Start at", control: "number" }, { key: "perDay", label: "Per day", control: "number" }],

  // ---- text / headings / signage copy ----
  text: [{ key: "content", label: "Text", control: "text" }, { key: "align", label: "Align", control: "select", options: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }] }],
  heading: [{ key: "content", label: "Text", control: "text" }, { key: "level", label: "Level", control: "select", options: [{ value: "1", label: "H1" }, { value: "2", label: "H2" }] }],
  subheading: [{ key: "content", label: "Text", control: "text" }],
  label: [{ key: "content", label: "Text", control: "text" }],
  banner: [{ key: "content", label: "Text", control: "text" }],
  badge: [{ key: "text", label: "Text", control: "text" }],
  callout: [{ key: "content", label: "Text", control: "text" }, { key: "emoji", label: "Emoji", control: "text" }],
  noticeBar: [{ key: "content", label: "Text", control: "text" }, { key: "icon", label: "Icon", control: "text" }],
  todaySpecial: [{ key: "title", label: "Title", control: "text" }, { key: "detail", label: "Detail", control: "text" }],
  eventBanner: [{ key: "title", label: "Title", control: "text" }, { key: "when", label: "When", control: "text" }],
  welcomeSign: [{ key: "message", label: "Message", control: "text" }, { key: "name", label: "Name", control: "text" }],
  priceTag: [{ key: "price", label: "Price", control: "text" }, { key: "item", label: "Item", control: "text" }],
  myDay: [{ key: "subtitle", label: "Subtitle", control: "text" }, { key: "name", label: "Name", control: "text" }, { key: "showDate", label: "Show date", control: "toggle", onLabel: "Yes", offLabel: "No" }],

  // ---- more signage / status copy ----
  ticker: [{ key: "content", label: "Text", control: "text" }],
  highlight: [{ key: "content", label: "Text", control: "text" }],
  logoText: [{ key: "text", label: "Text", control: "text" }],
  mantra: [{ key: "content", label: "Text", control: "text" }],
  kicker: [{ key: "kicker", label: "Eyebrow", control: "text" }, { key: "title", label: "Title", control: "text" }],
  emojiStat: [{ key: "emoji", label: "Emoji", control: "text" }, { key: "label", label: "Label", control: "text" }],
  moodToday: [{ key: "emoji", label: "Emoji", control: "text" }, { key: "label", label: "Label", control: "text" }],
  fieldRow: [{ key: "value", label: "Value", control: "text" }, { key: "label", label: "Label", control: "text" }],
  unitStat: [{ key: "value", label: "Value", control: "text" }, { key: "unit", label: "Unit", control: "text" }],
  readingNow: [{ key: "title", label: "Title", control: "text" }, { key: "author", label: "Author", control: "text" }, { key: "percent", label: "Percent", control: "number" }],

  // ---- scores / pairs / comparisons ----
  scoreboard: [{ key: "leftScore", label: "Left score", control: "text" }, { key: "rightScore", label: "Right score", control: "text" }],
  comparison: [{ key: "leftValue", label: "Left value", control: "number" }, { key: "rightValue", label: "Right value", control: "number" }],
  counterPair: [{ key: "leftValue", label: "Left value", control: "text" }, { key: "rightValue", label: "Right value", control: "text" }],
  streakPair: [{ key: "current", label: "Current", control: "number" }, { key: "best", label: "Best", control: "number" }],
  fraction: [{ key: "numerator", label: "Numerator", control: "text" }, { key: "denominator", label: "Denominator", control: "text" }],

  // ---- goals / meters / progress (set value + target live) ----
  waterTracker: [{ key: "value", label: "Done", control: "number" }, { key: "total", label: "Goal", control: "number" }],
  savingsGoal: [{ key: "saved", label: "Saved", control: "number" }, { key: "target", label: "Target", control: "number" }],
  goalProgress: [{ key: "value", label: "Value", control: "number" }, { key: "target", label: "Target", control: "number" }],
  stepsToday: [{ key: "value", label: "Steps", control: "number" }, { key: "goal", label: "Goal", control: "number" }],
  budgetLine: [{ key: "spent", label: "Spent", control: "number" }, { key: "budget", label: "Budget", control: "number" }],
  targetMeter: [{ key: "value", label: "Value", control: "number" }, { key: "target", label: "Target", control: "number" }],
  bulletGraph: [{ key: "value", label: "Value", control: "number" }, { key: "target", label: "Target", control: "number" }],
  dotProgress: [{ key: "value", label: "Filled", control: "number" }, { key: "total", label: "Total", control: "number" }],
  dotMatrix: [{ key: "value", label: "Filled", control: "number" }, { key: "total", label: "Total", control: "number" }],
  waffle: [{ key: "value", label: "Percent", control: "number" }],
  gaugeMini: [{ key: "value", label: "Percent", control: "number" }],
  signalBars: [{ key: "value", label: "Bars (0–5)", control: "number" }],
  starBar: [{ key: "value", label: "Filled", control: "number" }, { key: "max", label: "Out of", control: "number" }],
  thermometer: [{ key: "value", label: "Value", control: "number" }],
  kpiSpark: [{ key: "value", label: "Value", control: "text" }, { key: "unit", label: "Unit", control: "text" }],
  dayProgress: [{ key: "label", label: "Label", control: "text" }],

  // ---- time targets you can re-point live ----
  countdown: [{ key: "target", label: "Target (ISO)", control: "text" }, { key: "label", label: "Label", control: "text" }],
  daysUntil: [{ key: "target", label: "Target date", control: "text" }, { key: "label", label: "Label", control: "text" }],
  shiftStatus: [{ key: "open", label: "Opens at (hour)", control: "number" }, { key: "close", label: "Closes at (hour)", control: "number" }],

  // ---- simple toggles ----
  clock: [{ key: "showDate", label: "Show date", control: "toggle", onLabel: "Yes", offLabel: "No" }],
  table: [{ key: "header", label: "Header row", control: "toggle", onLabel: "Yes", offLabel: "No" }],
  stopwatch: [{ key: "showSeconds", label: "Show seconds", control: "toggle", onLabel: "Yes", offLabel: "No" }, { key: "since", label: "Start", control: "text" }],
};

/** Controls for an object type, or null to fall back to the generic prop+value fields. */
export function controlsFor(type: string | undefined): ObjControl[] | null {
  return (type && OBJECT_CONTROLS[type]) || null;
}
