import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ComparatorT, ConditionT } from "@glanceos/schema";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-engine-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("../db");
const { createUser } = await import("../auth");
const { setCustomData, getCustomData } = await import("../customdata");
const { listTasks } = await import("../tasks");
const { createAutomation, listRuns } = await import("../automations");
const { evaluate, buildContext, runActions, fireAutomations, dryRunAutomation } = await import("./engine");

migrate();
const user = createUser("Auto", "auto@example.com", "password123")!;

const ctx = (over: Partial<{ data: Record<string, unknown>; webhook: unknown; device: Record<string, unknown> }> = {}) =>
  ({ data: { temp: 30, status: "open", tags: ["a", "b"] }, webhook: { value: 5 }, device: { online: true }, time: { hour: 9, minute: 0, minuteOfDay: 540, weekday: 1, ts: 1_700_000_000_000 }, ...over }) as Parameters<typeof evaluate>[1];

const field = (f: string, op: ComparatorT, value?: unknown): ConditionT => ({ type: "field", field: f, op, value });

describe("evaluate — comparators (pure & total)", () => {
  it("eq/ne with loose scalar coercion", () => {
    expect(evaluate(field("data.temp", "eq", 30), ctx())).toBe(true);
    expect(evaluate(field("data.temp", "eq", "30"), ctx())).toBe(true); // loose
    expect(evaluate(field("data.temp", "ne", 5), ctx())).toBe(true);
  });
  it("numeric gt/gte/lt/lte (non-numeric → false, never throws)", () => {
    expect(evaluate(field("data.temp", "gt", 25), ctx())).toBe(true);
    expect(evaluate(field("data.temp", "lte", 30), ctx())).toBe(true);
    expect(evaluate(field("data.status", "gt", 1), ctx())).toBe(false); // "open" not numeric
  });
  it("contains on strings and arrays", () => {
    expect(evaluate(field("data.status", "contains", "pen"), ctx())).toBe(true);
    expect(evaluate(field("data.tags", "contains", "a"), ctx())).toBe(true);
    expect(evaluate(field("data.tags", "contains", "z"), ctx())).toBe(false);
  });
  it("exists distinguishes missing/null from present", () => {
    expect(evaluate(field("data.temp", "exists"), ctx())).toBe(true);
    expect(evaluate(field("data.nope", "exists"), ctx())).toBe(false);
    expect(evaluate(field("data.missing.deep.path", "exists"), ctx())).toBe(false); // no throw on deep miss
  });
  it("changed compares against the previous context", () => {
    expect(evaluate(field("data.temp", "changed"), ctx({ data: { temp: 30 } }), ctx({ data: { temp: 25 } }))).toBe(true);
    expect(evaluate(field("data.temp", "changed"), ctx({ data: { temp: 30 } }), ctx({ data: { temp: 30 } }))).toBe(false);
  });
});

describe("evaluate — boolean tree", () => {
  it("all / any / not compose", () => {
    const cond: ConditionT = { type: "all", conditions: [field("data.temp", "gt", 20), { type: "any", conditions: [field("data.status", "eq", "open"), field("data.status", "eq", "busy")] }, { type: "not", condition: field("webhook.value", "gt", 100) }] };
    expect(evaluate(cond, ctx())).toBe(true);
    expect(evaluate({ type: "all", conditions: [field("data.temp", "gt", 99)] }, ctx())).toBe(false);
    expect(evaluate({ type: "any", conditions: [] }, ctx())).toBe(false); // empty any → false
  });
});

describe("buildContext", () => {
  it("loads the user's custom-data into data.*", () => {
    setCustomData(user.id, "occupancy", 12);
    const c = buildContext(user.id, { now: new Date(1_700_000_000_000) });
    expect((c.data as Record<string, unknown>).occupancy).toBe(12);
    expect(Object.isFrozen(c)).toBe(true);
  });
});

describe("runActions — seams + SSRF safety", () => {
  it("runs setData / addTask and reports per-action errors without throwing", async () => {
    const r = await runActions([
      { kind: "setData", key: "lights", value: "on" },
      { kind: "addTask", listId: "default", text: "automated task" },
    ], user.id, buildContext(user.id));
    expect(r.run).toBe(2);
    expect(getCustomData(user.id, "lights")).toBe("on");
    expect(listTasks(user.id, "default").some((t) => t.text === "automated task")).toBe(true);
  });

  it("an outbound webhook to a private address is blocked by the SSRF guard (logged, not thrown)", async () => {
    const r = await runActions([{ kind: "webhook", url: "http://127.0.0.1:9/x" }], user.id, buildContext(user.id));
    expect(r.run).toBe(0);
    expect(r.errors[0]).toMatch(/webhook/);
  });

  it("switchBoard refuses a board the user can't write", async () => {
    const r = await runActions([{ kind: "switchBoard", deviceId: "nope", layoutId: 999999 }], user.id, buildContext(user.id));
    expect(r.run).toBe(0);
    expect(r.errors.length).toBe(1);
  });
});

describe("fireAutomations + dryRun", () => {
  it("a webhook automation whose condition matches runs its actions and logs the run", async () => {
    const a = createAutomation(user.id, {
      name: "On deploy", enabled: true, trigger: { kind: "webhook" },
      conditions: field("webhook.status", "eq", "success"),
      actions: [{ kind: "setData", key: "lastDeploy", value: "ok" }],
    });
    await fireAutomations(user.id, "webhook", { webhook: { status: "success" } });
    expect(getCustomData(user.id, "lastDeploy")).toBe("ok");
    const runs = listRuns(a.id, user.id);
    expect(runs[0]!.matched).toBe(true);
    expect(runs[0]!.actionsRun).toBe(1);
  });

  it("does not run when the condition fails (logged as unmatched)", async () => {
    const a = createAutomation(user.id, {
      name: "Gated", enabled: true, trigger: { kind: "webhook" },
      conditions: field("webhook.status", "eq", "success"),
      actions: [{ kind: "setData", key: "shouldNot", value: 1 }],
    });
    await fireAutomations(user.id, "webhook", { webhook: { status: "fail" } });
    expect(getCustomData(user.id, "shouldNot")).toBeUndefined();
    expect(listRuns(a.id, user.id)[0]!.matched).toBe(false);
  });

  it("evaluate never recurses a pathologically deep tree off the stack", () => {
    let deep: ConditionT = { type: "field", field: "data.temp", op: "exists" };
    for (let i = 0; i < 500; i++) deep = { type: "not", condition: deep };
    expect(() => evaluate(deep, ctx())).not.toThrow();
  });

  it("the schema rejects condition trees nested beyond the depth cap", async () => {
    const { Automation } = await import("@glanceos/schema");
    let cond: unknown = { type: "field", field: "data.x", op: "exists" };
    for (let i = 0; i < 20; i++) cond = { type: "all", conditions: [cond] };
    const r = Automation.safeParse({ name: "deep", trigger: { kind: "tick" }, conditions: cond, actions: [{ kind: "notify", message: "hi" }] });
    expect(r.success).toBe(false);
  });

  it("dryRun reports the match + actions with NO side effects", () => {
    const preview = dryRunAutomation({
      name: "preview", enabled: true, trigger: { kind: "tick" },
      conditions: field("data.occupancy", "gte", 10),
      actions: [{ kind: "notify", message: "busy" }],
    }, user.id);
    expect(preview.matched).toBe(true); // occupancy=12 set earlier
    expect(preview.wouldRun[0]).toMatch(/notify/);
  });
});
