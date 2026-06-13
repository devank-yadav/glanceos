import type { LayoutT, WidgetT } from "@glanceos/schema";
import { blockFor, type WidgetType } from "./blocks";

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
};

export function PropertiesPanel({
  doc,
  selectedId,
  stageEdit,
  commitDoc,
  onDelete,
}: {
  doc: LayoutT;
  selectedId: string | null;
  stageEdit: (mutate: (d: LayoutT) => void) => void;
  commitDoc: (doc: LayoutT) => void;
  onDelete: () => void;
}) {
  const selected = doc.rows.flatMap((r) => r.blocks).find((b) => b.id === selectedId);
  return selected ? (
    <BlockProperties block={selected} stageEdit={stageEdit} onDelete={onDelete} />
  ) : (
    <BoardSettings doc={doc} commitDoc={commitDoc} />
  );
}

function BlockProperties({
  block,
  stageEdit,
  onDelete,
}: {
  block: WidgetT;
  stageEdit: (mutate: (d: LayoutT) => void) => void;
  onDelete: () => void;
}) {
  const editProp = (key: string, value: unknown) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) (target.props as Record<string, unknown>)[key] = value;
    });
  const editStyle = (patch: Partial<{ invert: boolean; align: string; valign: string }>) =>
    stageEdit((d) => {
      const target = d.rows.flatMap((r) => r.blocks).find((b) => b.id === block.id);
      if (target) target.style = { ...target.style, ...patch } as typeof target.style;
    });
  const props = block.props as Record<string, unknown>;
  const fields = PROP_FIELDS[block.type];
  const style = block.style;

  return (
    <section class="properties">
      <div class="row spread">
        <h3>{blockFor(block.type).label}</h3>
        <button class="danger" onClick={onDelete}>Delete</button>
      </div>
      <p class="muted">Move with the ⠿ handle or arrow keys; double-click to type. Drag a seam to resize.</p>
      <div class="row wrap">
        {fields.map((f) => (
          <PropField key={f.key} field={f} value={props[f.key]} onChange={(v) => editProp(f.key, v)} />
        ))}
        {fields.length === 0 && <p class="muted">Nothing to configure.</p>}
      </div>
      <h4>Emphasis</h4>
      <div class="row wrap">
        <label class="field checkbox">
          <input type="checkbox" checked={style.invert} onChange={(e) => editStyle({ invert: (e.currentTarget as HTMLInputElement).checked })} />
          <span>Invert (black)</span>
        </label>
        <Segmented label="Align" value={style.align} options={["start", "center", "end"]} icons={["⤙", "≡", "⤚"]} onChange={(v) => editStyle({ align: v })} />
        <Segmented label="Vertical" value={style.valign} options={["top", "middle", "bottom"]} icons={["⤒", "─", "⤓"]} onChange={(v) => editStyle({ valign: v })} />
      </div>
    </section>
  );
}

function Segmented({ label, value, options, icons, onChange }: { label: string; value: string; options: string[]; icons: string[]; onChange: (v: string) => void }) {
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

function BoardSettings({ doc, commitDoc }: { doc: LayoutT; commitDoc: (doc: LayoutT) => void }) {
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
            onChange={(e) => commitDoc({ ...structuredClone(doc), theme: { mode: (e.currentTarget as HTMLSelectElement).value as "light" | "dark" } })}
          >
            <option value="light">light</option>
            <option value="dark">dark</option>
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
