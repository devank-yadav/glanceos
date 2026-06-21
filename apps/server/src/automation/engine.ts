import type { ActionT, AutomationT, ComparatorT, ConditionT, TriggerT } from "@glanceos/schema";
import { getUser } from "../auth";
import { listCustomData, setCustomData } from "../customdata";
import { addTask } from "../tasks";
import { advanceQueue } from "../queues";
import { devicesOwnedBy, getDevice, updateDevice } from "../devices";
import { getWritableLayout } from "../shares";
import { createIfAbsent } from "../notifications";
import { pushDevice, pushUserDevices } from "../state";
import { emit, isConnected } from "../hub";
import { postJSON } from "../fetchers/cache";
import { resolvePath } from "../fetchers/jsonfeed";
import { allUserIds, enabledByTrigger, recordRun } from "../automations";

// The automation engine. evaluate() and the comparators are PURE and TOTAL (never
// throw) so they're trivially unit-tested offline. buildContext() assembles a
// frozen context from local data only (no fetches). runActions() maps to existing
// server seams; the only outbound action goes through the SSRF-guarded postJSON.

export interface Ctx {
  data: Record<string, unknown>; // the user's custom-data store, keyed by key
  webhook: unknown; // inlet payload (webhook trigger)
  device: Record<string, unknown>; // the device that transitioned (online/offline triggers)
  time: { hour: number; minute: number; minuteOfDay: number; weekday: number; ts: number };
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
    default: return false; // exists/changed handled in evaluate
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

export function buildContext(userId: string, opts: { webhook?: unknown; device?: Record<string, unknown>; now?: Date } = {}): Ctx {
  const now = opts.now ?? new Date();
  const data: Record<string, unknown> = {};
  for (const e of listCustomData(userId)) data[e.key] = e.value;
  return Object.freeze({
    data,
    webhook: opts.webhook ?? {},
    device: opts.device ?? {},
    time: zonedTime(now, getUser(userId)?.defaultTimezone || "UTC"),
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
export async function runActions(actions: ActionT[], userId: string, ctx: Ctx): Promise<{ run: number; errors: string[] }> {
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

/** Fire every enabled automation of a user whose trigger matches `kind`. Actions
 *  never fire further automations, so there is no recursion. */
export async function fireAutomations(
  userId: string,
  kind: TriggerT["kind"],
  opts: { webhook?: unknown; device?: Record<string, unknown>; prev?: Ctx; now?: Date; ctx?: Ctx } = {},
): Promise<void> {
  const autos = enabledByTrigger(userId, kind);
  if (autos.length === 0) return;
  // Reuse the caller's context when given (the tick passes the very context it
  // stores as `prev`, so "changed" compares against the exact prior snapshot).
  const ctx = opts.ctx ?? buildContext(userId, { webhook: opts.webhook, device: opts.device, now: opts.now });
  for (const a of autos) {
    if (a.trigger.kind === "time" && !timeMatches(a.trigger, ctx, a.id)) continue;
    const matched = a.conditions ? evaluate(a.conditions, ctx, opts.prev) : true;
    let run = 0; let error: string | null = null;
    if (matched) { const r = await runActions(a.actions, userId, ctx); run = r.run; error = r.errors.length ? r.errors.join("; ") : null; }
    recordRun(a.id, userId, kind, matched, run, error);
  }
}

// Per-user previous context (for "changed") + per-device presence (for edges),
// in-memory by design: a restart simply re-baselines (no spurious fires).
const prevCtx = new Map<string, Ctx>();
const lastOnline = new Map<string, boolean>();

/** The ~60s tick: data-threshold ("tick"), time-of-day ("time"), and screen
 *  online↔offline edges. Wrapped by the caller so it never crashes the loop. */
export async function runAutomationTick(now = new Date()): Promise<void> {
  for (const userId of allUserIds()) {
    const ctx = buildContext(userId, { now });
    await fireAutomations(userId, "tick", { ctx, prev: prevCtx.get(userId) });
    await fireAutomations(userId, "time", { ctx });
    prevCtx.set(userId, ctx); // the exact context just evaluated becomes next tick's "prev"
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
  }
};

/** Preview an automation against the current context with NO side effects. */
export function dryRunAutomation(a: AutomationT, userId: string): { matched: boolean; wouldRun: string[]; context: Ctx } {
  const ctx = buildContext(userId, {});
  const matched = a.conditions ? evaluate(a.conditions, ctx, prevCtx.get(userId)) : true; // "changed" reflects the last tick
  return { matched, wouldRun: matched ? a.actions.map(describeAction) : [], context: ctx };
}
