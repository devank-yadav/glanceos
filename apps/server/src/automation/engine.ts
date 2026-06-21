import type { ActionT, AutomationT, ComparatorT, ConditionT, LayoutT, TriggerT, WidgetT } from "@glanceos/schema";
import { getUser } from "../auth";
import { getCustomData, listCustomData, setCustomData } from "../customdata";
import { getOwnedLayout, updateLayout } from "../layouts";
import { addTask } from "../tasks";
import { advanceQueue } from "../queues";
import { devicesOwnedBy, getDevice, updateDevice } from "../devices";
import { getWritableLayout } from "../shares";
import { createIfAbsent } from "../notifications";
import { pushDevice, pushUserDevices } from "../state";
import { emit, isConnected } from "../hub";
import { postJSON } from "../fetchers/cache";
import { resolvePath } from "../fetchers/jsonfeed";
import { allUserIds, enabledByTrigger, getAutomation, recordRun } from "../automations";

// The automation engine. evaluate() and the comparators are PURE and TOTAL (never
// throw) so they're trivially unit-tested offline. buildContext() assembles a
// frozen context from local data only (no fetches). runActions() maps to existing
// server seams; the only outbound action goes through the SSRF-guarded postJSON.

// A named object on a board, as seen by automations. Keyed in ctx.objects by BOTH
// the block's stable id (what conditions/actions reference — survives renames) and
// its current name (for readability/debug). `settable` is false for live-data blocks.
export interface ObjEntry { value: unknown; settable: boolean; kind: "data" | "static" | "live"; key?: string; prop?: string }

export interface Ctx {
  data: Record<string, unknown>; // the user's custom-data store, keyed by key
  webhook: unknown; // inlet payload (webhook trigger)
  device: Record<string, unknown>; // the device that transitioned (online/offline triggers)
  time: { hour: number; minute: number; minuteOfDay: number; weekday: number; ts: number };
  objects: Record<string, ObjEntry>; // a board's named objects (empty for global automations)
}

// Server-side primary-text heuristic (the config app owns the authoritative per-type
// map; object-set actions carry the exact prop, so this only powers *reads* + a
// fallback). Covers the overwhelming majority of text-bearing blocks.
const TEXT_PROPS = ["content", "text", "value", "title", "label", "message", "body", "heading", "name"];
function primaryProp(props: Record<string, unknown>): string | undefined {
  for (const p of TEXT_PROPS) if (p in props) return p;
  return undefined;
}

/** A board's named objects → {value, settable} keyed by id AND name. Pure: object
 *  values come from the doc (static) or the already-built custom-data store (bound);
 *  live-data blocks are present but read-only (value undefined offline). */
function buildLayoutObjects(layout: LayoutT, dataStore: Record<string, unknown>): Record<string, ObjEntry> {
  const out: Record<string, ObjEntry> = {};
  const named = layout.rows.flatMap((r) => r.blocks).filter((b) => b.name);
  const entryFor = (block: WidgetT): ObjEntry => {
    const props = block.props as Record<string, unknown>;
    if (block.type === "customData") {
      const key = String(props.key ?? "");
      // No data key (malformed) → read nothing, not dataStore[""].
      return key ? { value: dataStore[key], settable: true, kind: "data", key } : { value: undefined, settable: false, kind: "data", key: "" };
    }
    if (block.source) return { value: undefined, settable: false, kind: "live" };
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
    case "matches": { try { return new RegExp(String(expected ?? "")).test(String(actual ?? "")); } catch { return false; } }
    default: return false; // exists/changed/between handled in evaluate
  }
}

/** Evaluate a condition tree against a context (and an optional previous context
 *  for the "changed" operator). Pure + total. */
export function evaluate(cond: ConditionT, ctx: Ctx, prev?: Ctx, depth = 0): boolean {
  if (depth > MAX_EVAL_DEPTH) return false; // never recurse a hostile/pathological tree off the stack
  switch (cond.type) {
    case "all": return cond.conditions.every((c) => evaluate(c, ctx, prev, depth + 1));
    case "any": return cond.conditions.length > 0 && cond.conditions.some((c) => evaluate(c, ctx, prev, depth + 1));
    case "not": return !evaluate(cond.condition, ctx, prev, depth + 1);
    case "field": {
      const actual = resolvePath(ctx, cond.field);
      if (cond.op === "exists") return actual !== undefined && actual !== null;
      if (cond.op === "changed") return safeStringify(actual) !== safeStringify(prev ? resolvePath(prev, cond.field) : undefined);
      if (cond.op === "between") { const a = num(actual), lo = num(cond.value), hi = num(cond.value2); return a !== null && lo !== null && hi !== null && a >= Math.min(lo, hi) && a <= Math.max(lo, hi); }
      return compare(cond.op, actual, cond.value);
    }
  }
}

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

export function buildContext(userId: string, opts: { webhook?: unknown; device?: Record<string, unknown>; now?: Date; layout?: LayoutT } = {}): Ctx {
  const now = opts.now ?? new Date();
  const data: Record<string, unknown> = {};
  for (const e of listCustomData(userId)) data[e.key] = e.value;
  return Object.freeze({
    data,
    webhook: opts.webhook ?? {},
    device: opts.device ?? {},
    time: zonedTime(now, getUser(userId)?.defaultTimezone || "UTC"),
    objects: opts.layout ? buildLayoutObjects(opts.layout, data) : {},
  });
}

const dayOf = (ctx: Ctx): number => Math.floor(ctx.time.ts / 86_400_000);

async function emitAlert(userId: string, a: Extract<ActionT, { kind: "alert" }>): Promise<void> {
  const payload = { severity: a.severity, title: a.title, body: a.body, ttl: a.ttlSeconds };
  if (a.target === "device" && a.deviceId) {
    const d = getDevice(a.deviceId);
    if (d?.user_id === userId && isConnected(a.deviceId)) await emit(a.deviceId, "alert", payload);
    return;
  }
  for (const d of devicesOwnedBy(userId)) if (isConnected(d.id)) await emit(d.id, "alert", payload);
}

/** Run an automation's actions. Each is isolated: one failing action is logged and
 *  the rest still run. The webhook action is the only egress — SSRF-guarded. */
export async function runActions(actions: ActionT[], userId: string, ctx: Ctx, board?: { id: number; document: LayoutT }): Promise<{ run: number; errors: string[] }> {
  let run = 0; let touched = false; const errors: string[] = [];
  for (const a of actions) {
    try {
      switch (a.kind) {
        case "setData": setCustomData(userId, a.key, a.value); touched = true; break;
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
        case "delay": { await new Promise((r) => setTimeout(r, Math.min(30_000, Math.max(0, a.ms)))); break; }
      }
      run++;
    } catch (e) { errors.push(`${a.kind}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (touched) await pushUserDevices(userId);
  return { run, errors };
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

// Per-context previous snapshot (for "changed") + per-device presence (for edges),
// in-memory by design: a restart simply re-baselines (no spurious fires). The key
// is the user (global rules) or `user:layoutId` (a board's objects).
const prevCtx = new Map<string, Ctx>();
const lastOnline = new Map<string, boolean>();
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
  opts: { webhook?: unknown; device?: Record<string, unknown>; prev?: Ctx; now?: Date; ctx?: Ctx; usePrev?: boolean } = {},
): Promise<void> {
  const autos = enabledByTrigger(userId, kind);
  if (autos.length === 0) return;
  const baseCtx = opts.ctx ?? buildContext(userId, { webhook: opts.webhook, device: opts.device, now: opts.now });
  // Build each referenced board's context once (its objects read from the doc + data).
  const boardCtx = new Map<number, { board?: { id: number; document: LayoutT }; ctx: Ctx }>();
  const ctxFor = (layoutId: number | null): { board?: { id: number; document: LayoutT }; ctx: Ctx } => {
    if (layoutId == null) return { ctx: baseCtx };
    let c = boardCtx.get(layoutId);
    if (!c) {
      const board = loadBoard(userId, layoutId);
      const ctx = board ? buildContext(userId, { webhook: opts.webhook, device: opts.device, now: opts.now, layout: board.document }) : baseCtx;
      c = { board, ctx };
      boardCtx.set(layoutId, c);
    }
    return c;
  };
  for (const a of autos) {
    const { board, ctx } = ctxFor(a.layoutId);
    if (a.trigger.kind === "time" && !timeMatches(a.trigger, ctx, a.id)) continue;
    const prev = opts.usePrev ? prevCtx.get(ctxKey(userId, a.layoutId)) : opts.prev;
    const matched = a.conditions ? evaluate(a.conditions, ctx, prev) : true;
    let run = 0; let error: string | null = null;
    if (matched) { const r = await runActions(a.actions, userId, ctx, board); run = r.run; error = r.errors.length ? r.errors.join("; ") : null; }
    recordRun(a.id, userId, kind, matched, run, error);
  }
  // The tick stashes every context it evaluated as next tick's "prev" (so "changed"
  // compares against the exact prior snapshot — globally and per board).
  if (opts.usePrev) {
    prevCtx.set(userId, baseCtx);
    for (const [lid, c] of boardCtx) prevCtx.set(ctxKey(userId, lid), c.ctx);
  }
}

/** The ~60s tick: data-threshold ("tick"), time-of-day ("time"), and screen
 *  online↔offline edges. Wrapped by the caller so it never crashes the loop. */
export async function runAutomationTick(now = new Date()): Promise<void> {
  for (const userId of allUserIds()) {
    const ctx = buildContext(userId, { now });
    await fireAutomations(userId, "tick", { ctx, now, usePrev: true });
    await fireAutomations(userId, "time", { ctx, now });
    for (const d of devicesOwnedBy(userId)) {
      const online = isConnected(d.id);
      const was = lastOnline.get(d.id);
      if (was !== undefined && was !== online) {
        await fireAutomations(userId, online ? "deviceOnline" : "deviceOffline", { device: { id: d.id, name: d.name, online }, now });
      }
      lastOnline.set(d.id, online);
    }
  }
}

const describeAction = (a: ActionT): string => {
  switch (a.kind) {
    case "setData": return `set data "${a.key}"`;
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
