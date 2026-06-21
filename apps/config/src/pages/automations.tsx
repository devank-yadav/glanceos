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
  | { type: "field"; field: string; op: string; value?: unknown; value2?: unknown };
interface Action { kind: string; [k: string]: unknown }
interface Trigger { kind: string; atMinute?: number; daysMask?: number; event?: string; offsetMin?: number }
interface Automation { id?: string; name: string; enabled: boolean; trigger: Trigger; conditions?: Cond | null; actions: Action[]; layoutId?: number | null; lastRun?: number | null; runCount?: number }

// One of the current board's named objects, offered in the pickers. `settable` is
// false for live-data blocks (they're read-only). `prop` is the primary text prop.
export interface ObjOption { id: string; name: string; label: string; type?: string; settable: boolean; prop?: string }

const OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "between", "contains", "startsWith", "endsWith", "matches", "exists", "changed"];
const NO_VALUE_OPS = new Set(["exists", "changed"]); // these ops take no comparison value
const OP_LABEL: Record<string, string> = { eq: "is", ne: "is not", gt: "greater than", gte: "≥", lt: "less than", lte: "≤", between: "between", contains: "contains", startsWith: "starts with", endsWith: "ends with", matches: "matches (regex)", exists: "exists", changed: "changed" };
const NUM_OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "between", "changed"];
const TEXT_OPS = ["eq", "ne", "contains", "startsWith", "endsWith", "matches", "exists", "changed"];
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
  // Presence
  { field: "presence.home", label: "Someone is home", group: "Presence", control: "bool" },
  { field: "presence.state", label: "Presence", group: "Presence", control: "select", options: [{ value: "home", label: "Home" }, { value: "away", label: "Away" }] },
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
  { id: "time", label: "At a time of day" },
  { id: "sun", label: "At sunrise / sunset" },
  { id: "presence", label: "When you arrive / leave home" },
];
const ACTION_KINDS: { id: string; label: string }[] = [
  { id: "setData", label: "Set custom data" },
  { id: "incrementData", label: "Add to a number" },
  { id: "toggleData", label: "Toggle a flag" },
  { id: "addTask", label: "Add a task" },
  { id: "advanceQueue", label: "Advance a queue" },
  { id: "switchBoard", label: "Switch a screen's board" },
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
const TEMPLATES: { id: string; label: string; show: (c: TCtx) => boolean; build: (c: TCtx) => Automation }[] = [
  {
    id: "threshold", label: "Alert when a value crosses a number", show: () => true,
    build: (c) => {
      const o = c.objects?.find((x) => x.settable);
      const field = c.scoped && c.objects?.[0] ? `objects.${c.objects[0].id}.value` : "data.count";
      const action: Action = o ? { kind: "setObjectText", objectId: o.id, objectName: o.name, prop: o.prop, text: "Busy" } : { kind: "alert", severity: "warn", title: "Threshold crossed", target: "all" };
      return tmpl(c, "When a value crosses 10", { kind: "tick" }, { type: "all", conditions: [{ type: "field", field, op: "gt", value: 10 }] }, [action]);
    },
  },
  {
    id: "webhook-text", label: "Update an object on a webhook", show: (c) => !!c.objects?.some((o) => o.settable),
    build: (c) => { const o = c.objects!.find((x) => x.settable)!; return tmpl(c, "Update on webhook", { kind: "webhook" }, undefined, [{ kind: "setObjectText", objectId: o.id, objectName: o.name, prop: o.prop, text: "" }]); },
  },
  {
    id: "night-hide", label: "Hide an object at night", show: (c) => !!c.objects?.length,
    build: (c) => { const o = c.objects![0]; return tmpl(c, "Hide at 10pm", { kind: "time", atMinute: 1320, daysMask: 127 }, undefined, [{ kind: "hideObject", objectId: o.id, objectName: o.name }]); },
  },
  {
    id: "changed-notify", label: "Notify when data changes", show: () => true,
    build: (c) => tmpl(c, "Notify on data change", { kind: "tick" }, { type: "all", conditions: [{ type: "field", field: "data.status", op: "changed" }] }, [{ kind: "notify", message: "Data changed" }]),
  },
  // v5.0 smart recipes — the new sun / presence / weather senses. Swap the alert for
  // a "Switch a screen to board" action to flip boards by daylight / presence / rain.
  {
    id: "sun-evening", label: "At sunset — an evening cue", show: () => true,
    build: (c) => tmpl(c, "Evening at sunset", { kind: "sun", event: "sunset", offsetMin: 0, daysMask: 127 }, undefined, [{ kind: "alert", severity: "info", title: "Good evening", body: "The sun has set — easing into night.", target: "all" }]),
  },
  {
    id: "arrive-home", label: "Welcome when you arrive home", show: () => true,
    build: (c) => tmpl(c, "Welcome home", { kind: "presence", event: "enter" }, undefined, [{ kind: "alert", severity: "info", title: "Welcome home", target: "all" }]),
  },
  {
    id: "rain-umbrella", label: "Umbrella reminder when it's raining", show: () => true,
    build: (c) => tmpl(c, "Umbrella reminder", { kind: "tick" }, { type: "all", conditions: [{ type: "field", field: "weather.isRaining", op: "eq", value: true }] }, [{ kind: "alert", severity: "warn", title: "Take an umbrella", body: "Rain is expected today.", target: "all" }]),
  },
];

export function AutomationsPage({ layoutId, objects, embedded }: { layoutId?: number; objects?: ObjOption[]; embedded?: boolean } = {}) {
  const [items, setItems] = useState<Automation[] | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [history, setHistory] = useState<{ name: string; runs: RunLog[] } | null>(null);
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
              <div class="template-row">
                <span class="muted">Start from a template:</span>
                {shown.map((t) => <button key={t.id} class="ghost template-chip" onClick={() => setEditing(t.build(tctx))}>{t.label}</button>)}
              </div>
            ) : null;
          })()}
        </div>
      )}

      {editing && <AutomationEditor draft={editing} objects={objects} layoutId={layoutId} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}

      {!editing && (items === null ? (
        <div class="cards">{[0, 1].map((i) => <div key={i} class="skeleton skeleton-card" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Icon.command />} title="No automations yet" body={scoped ? "Add one to make this board react to events." : "Create one to make your screens react to events."} />
      ) : (
        <ul class="picker-list key-list">
          {items.map((a) => (
            <li key={a.id} class="row spread">
              <span class="key-meta">
                <strong>{a.name}</strong> {!a.enabled && <span class="chip subtle">off</span>}
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
        <Modal open onClose={() => setHistory(null)} title={`Run history — ${history.name}`} width={520}>
          {history.runs.length === 0 ? (
            <p class="muted">No runs recorded yet.</p>
          ) : (
            <ul class="picker-list key-list run-log">
              {history.runs.map((r) => (
                <li key={r.id} class="row spread">
                  <span class="key-meta">
                    <strong>{r.matched ? `ran ${r.actionsRun} action${r.actionsRun === 1 ? "" : "s"}` : "didn't match"}</strong>
                    <span class="muted">{r.trigger} · {new Date(r.createdAt).toLocaleString()}</span>
                    {r.error && <span class="muted" style={{ color: "var(--bad)" }}>{r.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
  // id. Fetched once when the editor opens; the picker degrades to a hint if empty.
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const [boards, setBoards] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    api.get<{ id: string; name: string | null }[]>("/api/devices").then((d) => setDevices(d.map((x) => ({ id: x.id, name: x.name || x.id })))).catch(() => {});
    api.get<{ id: number; name: string }[]>("/api/layouts").then((l) => setBoards(l.map((x) => ({ id: x.id, name: x.name })))).catch(() => {});
  }, []);
  // Object actions appear when the board has any named object (show/hide work on any;
  // set-text/prop list only settable ones in their picker).
  const actionKinds = objects && objects.length ? [...ACTION_KINDS, ...OBJECT_ACTIONS] : ACTION_KINDS;
  // Required-field check so we don't POST an action the schema will 400 on.
  const actionsValid = a.actions.every((act) => {
    if (act.kind === "setData" || act.kind === "incrementData" || act.kind === "toggleData") return !!String(act.key ?? "").trim();
    if (act.kind === "setObjectProp") return !!act.objectId && !!String(act.prop ?? "").trim();
    if (act.kind === "setObjectText" || act.kind === "showObject" || act.kind === "hideObject") return !!act.objectId;
    return true;
  });

  // Normalise the draft for the API: empty condition group → undefined (always),
  // and coerce field/value strings to typed JSON. layoutId rides along so the
  // server scopes the rule to this board.
  const normalize = (): Automation => {
    const norm = (c: Cond): Cond => {
      if (c.type === "field") return { type: "field", field: c.field, op: c.op, value: coerce(c.value), value2: coerce(c.value2) };
      if (c.type === "not") return { type: "not", condition: norm(c.condition) };
      return c.type === "all" ? { type: "all", conditions: c.conditions.map(norm) } : { type: "any", conditions: c.conditions.map(norm) };
    };
    const root = a.conditions;
    // No condition → omit the key entirely. The schema's `conditions` is optional
    // (accepts undefined, not null); sending null fails validation.
    const conditions = root && (root.type === "all" || root.type === "any") && root.conditions.length === 0 ? undefined : root ? norm(root) : undefined;
    const actions = a.actions.map((act) =>
      act.kind === "switchBoard" ? { ...act, layoutId: Number(act.layoutId) || 0 }
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
                : { kind };
          set({ trigger: seeded });
        }}>
          {TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
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
      {a.trigger.kind === "presence" && (
        <div class="row wrap">
          <label class="field"><span>When you</span>
            <select value={a.trigger.event ?? "enter"} onChange={(e) => set({ trigger: { ...a.trigger, event: (e.currentTarget as HTMLSelectElement).value } })}>
              <option value="enter">Arrive home</option>
              <option value="leave">Leave home</option>
            </select>
          </label>
          <p class="muted" style={{ flexBasis: "100%", margin: 0 }}>Set presence from a phone geofence webhook (POST <code>{"{key:\"presence\", value:\"home\"|\"away\"}"}</code>) or bind a Home Assistant person entity to the <code>presence</code> data key.</p>
        </div>
      )}

      <div class="field"><span>Only if… <span class="muted">(optional)</span></span>
        {a.conditions && a.conditions.type !== "field" ? (
          <ConditionNode node={a.conditions} objects={objects} onChange={(n) => set({ conditions: n })} />
        ) : (
          <button class="ghost" onClick={() => set({ conditions: { type: "all", conditions: [] } })}>+ Add a condition</button>
        )}
      </div>

      <div class="field"><span>Then do</span>
        {a.actions.map((act, i) => (
          <div key={i} class={`action-row${act.enabled === false ? " action-off" : ""}`}>
            <input type="checkbox" class="action-enable" title={act.enabled === false ? "Step is off — won't run" : "Step is on"} checked={act.enabled !== false} onChange={(e) => setAction(i, { ...act, enabled: (e.currentTarget as HTMLInputElement).checked })} />
            <select value={act.kind} onChange={(e) => setAction(i, defaultAction((e.currentTarget as HTMLSelectElement).value, objects))}>
              {actionKinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <ActionFields action={act} objects={objects} devices={devices} boards={boards} onChange={(p) => setAction(i, p)} />
            {a.actions.length > 1 && <button class="ghost danger icon-btn" onClick={() => set({ actions: a.actions.filter((_, j) => j !== i) })}>×</button>}
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
  const leaf = node;
  const patch = (p: Partial<Extract<Cond, { type: "field" }>>): Cond => ({ type: "field", field: leaf.field, op: leaf.op, value: leaf.value, value2: leaf.value2, ...p });
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
          {!NO_VALUE_OPS.has(leaf.op) && (
            def?.control === "select"
              ? <select class="cond-val" value={String(leaf.value ?? def.options?.[0]?.value ?? "")} onChange={(e) => onChange(patch({ value: (e.currentTarget as HTMLSelectElement).value }))}>
                  {def.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              : <input class="cond-val" type={valType} value={String(leaf.value ?? "")} placeholder={leaf.op === "between" ? "min" : leaf.op === "matches" ? "regex" : "value"} onInput={(e) => onChange(patch({ value: (e.currentTarget as HTMLInputElement).value }))} />
          )}
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

function ActionFields({ action, objects, devices, boards, onChange }: { action: Action; objects?: ObjOption[]; devices?: { id: string; name: string }[]; boards?: { id: number; name: string }[]; onChange: (a: Action) => void }) {
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
      // No more typing ids: pick the screen and the board from dropdowns.
      const dev = String(action.deviceId ?? "");
      const lay = action.layoutId != null ? Number(action.layoutId) : 0;
      const devMissing = dev !== "" && !(devices ?? []).some((d) => d.id === dev);
      const layMissing = !!lay && !(boards ?? []).some((b) => b.id === lay);
      return (
        <>
          {(devices && devices.length > 0) ? (
            <select value={dev} onChange={(e) => f("deviceId", (e.currentTarget as HTMLSelectElement).value)}>
              <option value="" disabled>Pick a screen…</option>
              {devMissing && <option value={dev}>{`⚠ ${dev} (missing)`}</option>}
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : txt("deviceId", "screen id")}
          <span class="muted">→</span>
          {(boards && boards.length > 0) ? (
            <select class="grow" value={lay ? String(lay) : ""} onChange={(e) => f("layoutId", Number((e.currentTarget as HTMLSelectElement).value) || 0)}>
              <option value="" disabled>Pick a board…</option>
              {layMissing && <option value={String(lay)}>{`⚠ board #${lay} (missing)`}</option>}
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : <input class="grow" type="number" value={lay || ""} placeholder="board id" onInput={(e) => f("layoutId", Number((e.currentTarget as HTMLInputElement).value) || 0)} />}
        </>
      );
    }
    case "notify": return txt("message", "message", "grow");
    case "alert": return (
      <>
        <select value={String(action.severity ?? "info")} onChange={(e) => f("severity", (e.currentTarget as HTMLSelectElement).value)}>
          <option value="info">info</option><option value="warn">warn</option><option value="critical">critical</option>
        </select>
        {txt("title", "title", "grow")}
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
