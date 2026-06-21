import type { LayoutT, WidgetT } from "@glanceos/schema";
import type { VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, type QueueState, type TaskItem } from "../api";
import { BINDABLE, blockFor, type WidgetType } from "./blocks";
import { BlockIcon } from "./blockIcons";
import { Icon } from "./icons";

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
  greeting: [S("name", "Name (optional)")],
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
}: {
  block: WidgetT;
  stageEdit: (mutate: (d: LayoutT) => void) => void;
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
  const editStyle = (patch: Partial<{ invert: boolean; align: string; valign: string }>) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) target.style = { ...target.style, ...patch } as typeof target.style;
    });
  const editVisibility = (v: string) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) target.visibility = v === "whenData" ? "whenData" : undefined;
    });
  const props = block.props as Record<string, unknown>;
  const fields = PROP_FIELDS[block.type];
  const style = block.style;

  return (
    <div class="block-fields">
      <h3>{blockFor(block.type).label}</h3>
      <label class="field object-name-field">
        <span>Object name <span class="muted">— refer to it in automations</span></span>
        <input
          value={block.name ?? ""}
          placeholder={blockFor(block.type).label}
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          onBlur={resolveName}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        />
      </label>
      <div class="row wrap">
        {fields.map((f) => (
          <PropField key={f.key} field={f} value={props[f.key]} onChange={(v) => editProp(f.key, v)} />
        ))}
        {fields.length === 0 && <p class="muted">Nothing to configure.</p>}
      </div>
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
      {BINDABLE.has(block.type) && (
        <label class="field">
          <span>Visibility</span>
          <select value={block.visibility ?? "always"} onChange={(e) => editVisibility((e.currentTarget as HTMLSelectElement).value)}>
            <option value="always">Always show</option>
            <option value="whenData">Only when its source has data</option>
          </select>
        </label>
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
      const res = await fetch("/api/uploads", { method: "POST", body: fd, credentials: "same-origin" });
      const r = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !r.url) throw new Error(r.error || `HTTP ${res.status}`);
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
          <span>Gap</span>
          <input
            type="number"
            value={doc.gap}
            onInput={(e) => commitDoc({ ...structuredClone(doc), gap: Math.max(0, Math.min(8, Number((e.currentTarget as HTMLInputElement).value) || 0)) })}
          />
        </label>
        <label class="field">
          <span>Theme</span>
          <select
            value={doc.theme.mode}
            onChange={(e) => commitDoc({ ...structuredClone(doc), theme: { ...doc.theme, mode: (e.currentTarget as HTMLSelectElement).value as "light" | "dark" } })}
          >
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </label>
        <label class="field">
          <span>Font size</span>
          <select
            value={doc.theme.fontScale ?? "m"}
            onChange={(e) => commitDoc({ ...structuredClone(doc), theme: { ...doc.theme, fontScale: (e.currentTarget as HTMLSelectElement).value as "s" | "m" | "l" } })}
          >
            <option value="s">small</option>
            <option value="m">medium</option>
            <option value="l">large</option>
          </select>
        </label>
        <label class="field">
          <span>Vertical align</span>
          <select
            value={doc.align ?? "top"}
            onChange={(e) => commitDoc({ ...structuredClone(doc), align: (e.currentTarget as HTMLSelectElement).value as "top" | "center" | "bottom" })}
          >
            <option value="top">top</option>
            <option value="center">center</option>
            <option value="bottom">bottom</option>
          </select>
        </label>
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
  if (blocks.length === 0) return <p class="muted objects-empty">No objects yet — add a block to the board.</p>;
  return (
    <ul class="objects-list">
      {blocks.map((b) => (
        <li key={b.id} class={`object-row${selectedIds.includes(b.id) ? " on" : ""}${b.hidden ? " is-hidden" : ""}`}>
          <button class="object-pick" title={`Select ${blockFor(b.type).label} on the board`} onClick={() => onSelect(b.id)}><BlockIcon type={b.type} /></button>
          <input class="object-name-input" value={b.name ?? ""} aria-label="Object name"
            onInput={(e) => setName(b.id, (e.currentTarget as HTMLInputElement).value)}
            onBlur={() => resolveName(b.id)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }} />
          <span class="object-type muted">{blockFor(b.type).label}</span>
          <button class="icon-btn object-eye" title={b.hidden ? "Show on screens" : "Hide on screens"} aria-pressed={!!b.hidden} onClick={() => toggleHidden(b.id)}>
            {b.hidden ? <Icon.eyeOff /> : <Icon.eye />}
          </button>
        </li>
      ))}
    </ul>
  );
}
