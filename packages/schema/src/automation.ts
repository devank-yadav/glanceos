import { z } from "zod";

// v3.0 automations: a closed, eval-free contract shared by server + config (the
// screen never imports it). A Condition is a pure boolean tree over a frozen
// context; comparators are total (never throw). Triggers and actions both map to
// existing server seams — nothing here executes anything by itself.

export const COMPARATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "exists", "changed", "between", "startsWith", "endsWith", "matches"] as const;
export const Comparator = z.enum(COMPARATORS);
export type ComparatorT = (typeof COMPARATORS)[number];

// ---- Condition (recursive boolean tree) ----
export type ConditionT =
  | { type: "field"; field: string; op: ComparatorT; value?: unknown; value2?: unknown }
  | { type: "all"; conditions: ConditionT[] }
  | { type: "any"; conditions: ConditionT[] }
  | { type: "not"; condition: ConditionT };

const FieldCondition = z.object({
  type: z.literal("field"),
  field: z.string().min(1).max(200), // dotted path into the context (data.*, webhook.*, device.*, time.*, objects.<id>.value)
  op: Comparator,
  value: z.unknown().optional(),
  value2: z.unknown().optional(), // upper bound for "between"
});

export const Condition: z.ZodType<ConditionT> = z.lazy(() =>
  z.discriminatedUnion("type", [
    FieldCondition,
    z.object({ type: z.literal("all"), conditions: z.array(Condition).max(25) }),
    z.object({ type: z.literal("any"), conditions: z.array(Condition).max(25) }),
    z.object({ type: z.literal("not"), condition: Condition }),
  ]),
) as z.ZodType<ConditionT>;

// ---- Trigger ----
export const Trigger = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("webhook") }), // any of the user's inlets fired
  z.object({ kind: z.literal("deviceOffline") }),
  z.object({ kind: z.literal("deviceOnline") }),
  z.object({ kind: z.literal("tick") }), // evaluated every minute (data thresholds / "changed")
  z.object({ kind: z.literal("time"), atMinute: z.number().int().min(0).max(1439), daysMask: z.number().int().min(0).max(127).default(127) }),
]);
export type TriggerT = z.infer<typeof Trigger>;
export const TRIGGER_KINDS = ["webhook", "deviceOffline", "deviceOnline", "tick", "time"] as const;

// ---- Action ----
export const Action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("setData"), key: z.string().min(1).max(100), value: z.unknown() }),
  z.object({ kind: z.literal("addTask"), listId: z.string().max(60).default("default"), text: z.string().min(1).max(500) }),
  z.object({ kind: z.literal("advanceQueue"), queueId: z.string().min(1).max(60), delta: z.number().int().min(-100).max(100).default(1) }),
  z.object({ kind: z.literal("switchBoard"), deviceId: z.string().min(1), layoutId: z.number().int() }),
  z.object({ kind: z.literal("notify"), message: z.string().min(1).max(200) }),
  z.object({
    kind: z.literal("alert"),
    severity: z.enum(["info", "warn", "critical"]).default("info"),
    title: z.string().min(1).max(120),
    body: z.string().max(280).optional(),
    target: z.enum(["all", "device"]).default("all"),
    deviceId: z.string().optional(),
    ttlSeconds: z.number().int().min(3).max(3600).optional(),
  }),
  z.object({ kind: z.literal("webhook"), url: z.url({ protocol: /^https?$/ }), body: z.unknown().optional() }), // outbound — SSRF-guarded at run time
  // Object-targeting actions (v4.0, Shortcuts-style). They reference a block by its
  // stable id (`objectId`), so a rename never breaks them; `objectName` is kept only
  // for display + dangling-reference lint. A custom-data-bound object writes its data
  // key; a static object patches `prop` on its block doc, then the board re-pushes.
  z.object({ kind: z.literal("setObjectText"), objectId: z.string().min(1).max(64), objectName: z.string().max(60).optional(), prop: z.string().max(60).optional(), text: z.string().max(2000) }),
  z.object({ kind: z.literal("setObjectProp"), objectId: z.string().min(1).max(64), objectName: z.string().max(60).optional(), prop: z.string().min(1).max(60), value: z.unknown() }),
  // Show / hide a board object (toggles its `hidden` flag; the screen skips hidden blocks).
  z.object({ kind: z.literal("showObject"), objectId: z.string().min(1).max(64), objectName: z.string().max(60).optional() }),
  z.object({ kind: z.literal("hideObject"), objectId: z.string().min(1).max(64), objectName: z.string().max(60).optional() }),
  // Numeric / flag helpers over the custom-data store (Shortcuts-style).
  z.object({ kind: z.literal("incrementData"), key: z.string().min(1).max(100), delta: z.number().min(-1_000_000).max(1_000_000).default(1) }),
  z.object({ kind: z.literal("toggleData"), key: z.string().min(1).max(100) }),
  // Pause between actions (a Shortcuts "Wait").
  z.object({ kind: z.literal("delay"), ms: z.number().int().min(50).max(30_000) }),
]);
export type ActionT = z.infer<typeof Action>;
export const ACTION_KINDS = ["setData", "addTask", "advanceQueue", "switchBoard", "notify", "alert", "webhook", "setObjectText", "setObjectProp", "showObject", "hideObject", "incrementData", "toggleData", "delay"] as const;

// ---- Automation ----
export const MAX_CONDITION_DEPTH = 12; // the UI builder never needs more; bounds recursion
function conditionDepth(c: ConditionT): number {
  if (c.type === "all" || c.type === "any") return 1 + (c.conditions.length ? Math.max(...c.conditions.map(conditionDepth)) : 0);
  if (c.type === "not") return 1 + conditionDepth(c.condition);
  return 1;
}

export const Automation = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  trigger: Trigger,
  conditions: Condition.optional(), // optional gate; absent = always matches
  actions: z.array(Action).min(1).max(10),
}).superRefine((a, ctx) => {
  if (a.conditions && conditionDepth(a.conditions) > MAX_CONDITION_DEPTH) {
    ctx.addIssue({ code: "custom", message: `conditions nested deeper than ${MAX_CONDITION_DEPTH}`, path: ["conditions"] });
  }
});
export type AutomationT = z.infer<typeof Automation>;

// ---- Live alert event (server → screen SSE; the screen renders it in Phase 2D) ----
export const AlertEvent = z.object({
  severity: z.enum(["info", "warn", "critical"]),
  title: z.string(),
  body: z.string().optional(),
  ttl: z.number().optional(),
});
export type AlertEventT = z.infer<typeof AlertEvent>;
