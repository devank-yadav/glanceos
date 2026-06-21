import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { Icon } from "../editor/icons";

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
  | { type: "field"; field: string; op: string; value?: unknown };
interface Action { kind: string; [k: string]: unknown }
interface Trigger { kind: string; atMinute?: number; daysMask?: number }
interface Automation { id?: string; name: string; enabled: boolean; trigger: Trigger; conditions?: Cond | null; actions: Action[]; layoutId?: number | null; lastRun?: number | null; runCount?: number }

// One of the current board's named objects, offered in the pickers. `settable` is
// false for live-data blocks (they're read-only). `prop` is the primary text prop.
export interface ObjOption { id: string; name: string; label: string; settable: boolean; prop?: string }

const OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "exists", "changed"];
const TRIGGERS: { id: string; label: string }[] = [
  { id: "webhook", label: "A webhook arrives" },
  { id: "deviceOnline", label: "A screen comes online" },
  { id: "deviceOffline", label: "A screen goes offline" },
  { id: "tick", label: "Every minute (check data)" },
  { id: "time", label: "At a time of day" },
];
const ACTION_KINDS: { id: string; label: string }[] = [
  { id: "setData", label: "Set custom data" },
  { id: "addTask", label: "Add a task" },
  { id: "advanceQueue", label: "Advance a queue" },
  { id: "switchBoard", label: "Switch a screen's board" },
  { id: "notify", label: "Send a notification" },
  { id: "alert", label: "Show an on-screen alert" },
  { id: "webhook", label: "Call a webhook (outbound)" },
];
// Object-targeting actions — only offered when a board's objects are in scope.
const OBJECT_ACTIONS: { id: string; label: string }[] = [
  { id: "setObjectText", label: "Set an object's text" },
  { id: "setObjectProp", label: "Set an object's property" },
];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const blankField = (): Cond => ({ type: "field", field: "data.", op: "eq", value: "" });
const defaultAction = (kind: string, objects?: ObjOption[]): Action => {
  const o = objects?.find((x) => x.settable);
  switch (kind) {
    case "setData": return { kind, key: "", value: "" };
    case "addTask": return { kind, listId: "default", text: "" };
    case "advanceQueue": return { kind, queueId: "", delta: 1 };
    case "switchBoard": return { kind, deviceId: "", layoutId: 0 };
    case "notify": return { kind, message: "" };
    case "alert": return { kind, severity: "info", title: "", target: "all" };
    case "setObjectText": return { kind, objectId: o?.id ?? "", objectName: o?.name, prop: o?.prop, text: "" };
    case "setObjectProp": return { kind, objectId: o?.id ?? "", objectName: o?.name, prop: o?.prop ?? "content", value: "" };
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

export function AutomationsPage({ layoutId, objects, embedded }: { layoutId?: number; objects?: ObjOption[]; embedded?: boolean } = {}) {
  const [items, setItems] = useState<Automation[] | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const confirm = useConfirm();
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
        <div class="row" style={{ marginBottom: "14px" }}>
          <button class="primary" onClick={() => setEditing(newDraft())}><Icon.plus /> New automation</button>
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
                <button class="ghost" onClick={() => setEditing(structuredClone(a))}>Edit</button>
                <button class="ghost" onClick={() => toggle(a)}>{a.enabled ? "Disable" : "Enable"}</button>
                <button class="ghost danger" onClick={() => remove(a)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      ))}
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
  const actionKinds = settable.length ? [...ACTION_KINDS, ...OBJECT_ACTIONS] : ACTION_KINDS;

  // Normalise the draft for the API: empty condition group → undefined (always),
  // and coerce field/value strings to typed JSON. layoutId rides along so the
  // server scopes the rule to this board.
  const normalize = (): Automation => {
    const norm = (c: Cond): Cond => {
      if (c.type === "field") return { type: "field", field: c.field, op: c.op, value: coerce(c.value) };
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
          : act.kind === "setData" || act.kind === "setObjectProp" ? { ...act, value: coerce(act.value) }
            : act);
    return { ...a, layoutId: layoutId ?? a.layoutId ?? null, conditions, actions };
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
        <select value={a.trigger.kind} onChange={(e) => set({ trigger: { kind: (e.currentTarget as HTMLSelectElement).value } })}>
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

      <div class="field"><span>Only if… <span class="muted">(optional)</span></span>
        {a.conditions && a.conditions.type !== "field" ? (
          <ConditionNode node={a.conditions} objects={objects} onChange={(n) => set({ conditions: n })} />
        ) : (
          <button class="ghost" onClick={() => set({ conditions: { type: "all", conditions: [] } })}>+ Add a condition</button>
        )}
      </div>

      <div class="field"><span>Then do</span>
        {a.actions.map((act, i) => (
          <div key={i} class="action-row">
            <select value={act.kind} onChange={(e) => setAction(i, defaultAction((e.currentTarget as HTMLSelectElement).value, objects))}>
              {actionKinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <ActionFields action={act} objects={objects} onChange={(p) => setAction(i, p)} />
            {a.actions.length > 1 && <button class="ghost danger icon-btn" onClick={() => set({ actions: a.actions.filter((_, j) => j !== i) })}>×</button>}
          </div>
        ))}
        <button class="ghost" onClick={() => set({ actions: [...a.actions, defaultAction(settable.length ? "setObjectText" : "setData", objects)] })}>+ Add action</button>
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
          <button class="primary" disabled={busy || !a.name.trim()} onClick={save}>{busy ? "Saving…" : "Save"}</button>
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
  const patch = (p: Partial<Extract<Cond, { type: "field" }>>): Cond => ({ type: "field", field: leaf.field, op: leaf.op, value: leaf.value, ...p });
  // When a board's objects are in scope, the left side is a picker: choose an
  // object (writes objects.<id>.value) or "Custom field…" for a raw dotted path.
  const objMatch = objects?.find((o) => leaf.field === `objects.${o.id}.value`);
  return (
    <div class="cond-row">
      {objects && objects.length > 0 && (
        <select class="cond-field" value={objMatch ? objMatch.id : "__custom"} onChange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          onChange(patch({ field: v === "__custom" ? (objMatch ? "data." : leaf.field) : `objects.${v}.value` }));
        }}>
          <optgroup label="Objects on this board">
            {objects.map((o) => <option key={o.id} value={o.id}>{o.name}’s value</option>)}
          </optgroup>
          <option value="__custom">Custom field…</option>
        </select>
      )}
      {(!objects || objects.length === 0 || !objMatch) && (
        <input class="cond-field" value={leaf.field} placeholder="data.key" onInput={(e) => onChange(patch({ field: (e.currentTarget as HTMLInputElement).value }))} />
      )}
      <select value={leaf.op} onChange={(e) => onChange(patch({ op: (e.currentTarget as HTMLSelectElement).value }))}>
        {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {leaf.op !== "exists" && leaf.op !== "changed" && (
        <input class="cond-val" value={String(leaf.value ?? "")} placeholder="value" onInput={(e) => onChange(patch({ value: (e.currentTarget as HTMLInputElement).value }))} />
      )}
      {onRemove && <button class="ghost icon-btn" onClick={onRemove}>×</button>}
    </div>
  );
}

function ActionFields({ action, objects, onChange }: { action: Action; objects?: ObjOption[]; onChange: (a: Action) => void }) {
  const f = (k: string, v: unknown) => onChange({ ...action, [k]: v });
  const txt = (k: string, ph: string, cls = "") => <input class={cls} value={String(action[k] ?? "")} placeholder={ph} onInput={(e) => f(k, (e.currentTarget as HTMLInputElement).value)} />;
  // Object picker for the object-targeting actions — settable objects only, and we
  // stash the current name + primary prop alongside the stable id.
  const settable = (objects ?? []).filter((o) => o.settable);
  const objSelect = () => (
    <select value={String(action.objectId ?? "")} onChange={(e) => {
      const o = settable.find((x) => x.id === (e.currentTarget as HTMLSelectElement).value);
      onChange({ ...action, objectId: o?.id ?? "", objectName: o?.name, ...(action.kind === "setObjectText" ? { prop: o?.prop } : {}) });
    }}>
      <option value="" disabled>Pick an object…</option>
      {settable.map((o) => <option key={o.id} value={o.id}>{`${o.name} (${o.label})`}</option>)}
    </select>
  );
  switch (action.kind) {
    case "setData": return <>{txt("key", "data key")}{txt("value", "value", "grow")}</>;
    case "addTask": return <>{txt("listId", "list")}{txt("text", "task text", "grow")}</>;
    case "advanceQueue": return <>{txt("queueId", "queue id")}{txt("delta", "+1")}</>;
    case "switchBoard": return <>{txt("deviceId", "screen id")}{txt("layoutId", "board id")}</>;
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
    case "setObjectText": return <>{objSelect()}{txt("text", "new text", "grow")}</>;
    case "setObjectProp": return <>{objSelect()}{txt("prop", "property")}{txt("value", "value", "grow")}</>;
    default: return null;
  }
}

const minToTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMin = (t: string): number => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
