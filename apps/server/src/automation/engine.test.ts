import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ComparatorT, ConditionT, LayoutT } from "@glanceos/schema";
import { Condition } from "@glanceos/schema";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-engine-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("../db");
const { db } = await import("../db");
const { createUser } = await import("../auth");
const { setCustomData, getCustomData } = await import("../customdata");
const { logMetric } = await import("../metrics");
const { listTasks } = await import("../tasks");
const { createAutomation, listRuns, snoozeAutomation } = await import("../automations");
const { createLayout, getLayout } = await import("../layouts");
const { registerDevice, claimDevice, setDeviceLocation } = await import("../devices");
const { ensurePersonalOrg } = await import("../orgs");
const { createConnection } = await import("../connections");
const { evaluate, buildContext, runActions, fireAutomations, dryRunAutomation, runAutomationById, drainDeferred, calendarContext, persistEngineState, hydrateEngineState } = await import("./engine");

migrate();
const user = createUser("Auto", "auto@example.com", "password123")!;
const org = ensurePersonalOrg(user.id);

const ctx = (over: Partial<{ data: Record<string, unknown>; webhook: unknown; device: Record<string, unknown> }> = {}) =>
  ({ data: { temp: 30, status: "open", tags: ["a", "b"] }, webhook: { value: 5 }, device: { online: true }, time: { hour: 9, minute: 0, minuteOfDay: 540, weekday: 1, ts: 1_700_000_000_000 }, objects: {}, ...over }) as Parameters<typeof evaluate>[1];

const field = (f: string, op: ComparatorT, value?: unknown): ConditionT => ({ type: "field", field: f, op, value });

describe("evaluate — timeWindow gate (pure clock)", () => {
  const tw = (startMin: number, endMin: number, daysMask?: number): ConditionT => ({ type: "timeWindow", startMin, endMin, daysMask });
  const at = (minuteOfDay: number, weekday = 3) =>
    ({ ...ctx(), time: { hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60, minuteOfDay, weekday, ts: 0 } }) as Parameters<typeof evaluate>[1];
  it("matches inside a daytime window, exclusive of the end", () => {
    expect(evaluate(tw(540, 1020), at(600))).toBe(true); // 10:00 in 09:00–17:00
    expect(evaluate(tw(540, 1020), at(540))).toBe(true); // 09:00 inclusive start
    expect(evaluate(tw(540, 1020), at(480))).toBe(false); // 08:00 before
    expect(evaluate(tw(540, 1020), at(1020))).toBe(false); // 17:00 end-exclusive
    expect(evaluate(tw(540, 1020), at(1080))).toBe(false); // 18:00 after
  });
  it("wraps past midnight when end <= start", () => {
    const overnight = tw(1320, 360); // 22:00 → 06:00
    expect(evaluate(overnight, at(1380))).toBe(true); // 23:00
    expect(evaluate(overnight, at(60))).toBe(true); // 01:00
    expect(evaluate(overnight, at(720))).toBe(false); // 12:00
  });
  it("respects the weekday mask (Mon–Fri = 0b0111110)", () => {
    const weekdays = tw(540, 1020, 0b0111110);
    expect(evaluate(weekdays, at(600, 3))).toBe(true); // Wed in window
    expect(evaluate(weekdays, at(600, 0))).toBe(false); // Sun excluded
    expect(evaluate(weekdays, at(600, 6))).toBe(false); // Sat excluded
  });
  it("absent daysMask means every day", () => {
    expect(evaluate(tw(540, 1020), at(600, 0))).toBe(true); // Sunday still matches
  });
  it("the schema validates it, defaults daysMask to 127, and bounds the minutes", () => {
    const parsed = Condition.parse({ type: "timeWindow", startMin: 540, endMin: 1020 }) as Extract<ConditionT, { type: "timeWindow" }>;
    expect(parsed.daysMask).toBe(127); // default = every day
    expect(Condition.safeParse({ type: "timeWindow", startMin: -1, endMin: 1020 }).success).toBe(false);
    expect(Condition.safeParse({ type: "timeWindow", startMin: 0, endMin: 1440 }).success).toBe(false);
    // nests inside boolean groups like any other condition
    expect(Condition.safeParse({ type: "all", conditions: [{ type: "timeWindow", startMin: 0, endMin: 60 }, { type: "field", field: "data.x", op: "eq", value: 1 }] }).success).toBe(true);
  });
});

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

describe("v5.0 substrate — sun + weather in context", () => {
  it("conditions can read weather.* and sun.*", () => {
    const c = {
      data: {}, webhook: {}, device: {},
      time: { hour: 20, minute: 0, minuteOfDay: 1200, weekday: 1, ts: 1 },
      objects: {},
      weather: { tempC: 4, summary: "rain", precipProbPct: 80, isRaining: true },
      sun: { isDaytime: false, sunriseMin: 360, sunsetMin: 1080, minsToSunrise: -840, minsToSunset: -120 },
    } as Parameters<typeof evaluate>[1];
    expect(evaluate(field("weather.isRaining", "eq", true), c)).toBe(true);
    expect(evaluate(field("weather.precipProbPct", "gt", 50), c)).toBe(true);
    expect(evaluate(field("weather.tempC", "lt", 5), c)).toBe(true);
    expect(evaluate(field("sun.isDaytime", "eq", false), c)).toBe(true);
  });
  it("buildContext computes sun once a screen has a location", () => {
    const reg = registerDevice({ name: "Hall" });
    claimDevice(reg.claimCode, "Hall", user.id, org);
    // London (~0° lon) so its sun events line up with the test user's UTC clock.
    setDeviceLocation(reg.deviceId, { name: "London", latitude: 51.5074, longitude: -0.1278 }, org);
    const c = buildContext(user.id, { now: new Date("2026-06-22T12:00:00Z") });
    expect(c.sun).toBeDefined();
    expect(c.sun!.sunsetMin).toBeGreaterThan(c.sun!.sunriseMin); // London midsummer: sunrise ~04:43, sunset ~21:21 UTC
    expect(c.sun!.isDaytime).toBe(true); // noon UTC is daytime in London
  });
  it("derives presence.home from the `presence` data key", () => {
    setCustomData(user.id, "presence", "home");
    expect(buildContext(user.id).presence!.home).toBe(true);
    setCustomData(user.id, "presence", "away");
    expect(buildContext(user.id).presence!.home).toBe(false);
  });
});

describe("evaluate — v4.1 comparators", () => {
  it("between is inclusive + order-independent", () => {
    expect(evaluate({ type: "field", field: "data.temp", op: "between", value: 20, value2: 40 }, ctx())).toBe(true); // temp 30
    expect(evaluate({ type: "field", field: "data.temp", op: "between", value: 40, value2: 20 }, ctx())).toBe(true); // swapped bounds
    expect(evaluate({ type: "field", field: "data.temp", op: "between", value: 40, value2: 50 }, ctx())).toBe(false);
  });
  it("startsWith / endsWith / matches (bad regex → false, never throws)", () => {
    expect(evaluate(field("data.status", "startsWith", "op"), ctx())).toBe(true); // "open"
    expect(evaluate(field("data.status", "endsWith", "en"), ctx())).toBe(true);
    expect(evaluate(field("data.status", "matches", "^o.+n$"), ctx())).toBe(true);
    expect(evaluate(field("data.status", "matches", "["), ctx())).toBe(false); // invalid regex
    // ReDoS guard: a nested-quantifier pattern is refused (returns fast, never hangs).
    const t0 = Date.now();
    expect(evaluate(field("data.status", "matches", "(a+)+$"), ctx({ data: { status: "aaaaaaaaaaaaaaaaaaaaaaaaaaX" } }))).toBe(false);
    expect(Date.now() - t0).toBeLessThan(100);
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

  it("skips an action toggled off (enabled:false)", async () => {
    const r = await runActions([
      { kind: "setData", key: "skipMe", value: "no", enabled: false },
      { kind: "setData", key: "runMe", value: "yes" },
    ], user.id, buildContext(user.id));
    expect(r.run).toBe(1);
    expect(getCustomData(user.id, "skipMe")).toBeUndefined();
    expect(getCustomData(user.id, "runMe")).toBe("yes");
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

describe("interval trigger (v6.0)", () => {
  it("fires only on the aligned minute, deduped within that minute", async () => {
    const a = createAutomation(user.id, {
      name: "Every 15", enabled: true, trigger: { kind: "interval", everyMinutes: 15 },
      actions: [{ kind: "setData", key: "ivl", value: "tick" }],
    });
    const at = (h: number, m: number) => new Date(Date.UTC(2026, 0, 1, h, m)); // user tz = UTC
    await fireAutomations(user.id, "interval", { now: at(0, 31) }); // 31 % 15 ≠ 0 → no fire
    expect(listRuns(a.id, user.id).length).toBe(0);
    await fireAutomations(user.id, "interval", { now: at(0, 30) }); // 30 % 15 = 0 → runs
    await fireAutomations(user.id, "interval", { now: at(0, 30) }); // same minute → deduped
    const runs = listRuns(a.id, user.id);
    expect(runs.length).toBe(1);
    expect(runs[0]!.matched).toBe(true);
    expect(getCustomData(user.id, "ivl")).toBe("tick");
  });

  it("the schema bounds the cadence (1..1440)", async () => {
    const { Automation } = await import("@glanceos/schema");
    expect(Automation.safeParse({ name: "i", trigger: { kind: "interval", everyMinutes: 30 }, actions: [{ kind: "notify", message: "hi" }] }).success).toBe(true);
    expect(Automation.safeParse({ name: "i", trigger: { kind: "interval", everyMinutes: 0 }, actions: [{ kind: "notify", message: "hi" }] }).success).toBe(false);
  });
});

describe("cooldown (v6.1)", () => {
  it("fires once, then stays quiet within the cooldown window", async () => {
    const a = createAutomation(user.id, {
      name: "Cooldown", enabled: true, trigger: { kind: "tick" }, cooldownMinutes: 10,
      actions: [{ kind: "incrementData", key: "cdCount", delta: 1 }],
    });
    const at = (m: number) => new Date(Date.UTC(2026, 2, 1, 0, m));
    await fireAutomations(user.id, "tick", { now: at(0), usePrev: true }); // fires → 1, lastRun set
    await fireAutomations(user.id, "tick", { now: at(1), usePrev: true }); // 1 min later, within 10-min cooldown → skip
    await fireAutomations(user.id, "tick", { now: at(2), usePrev: true }); // still within → skip
    expect(getCustomData(user.id, "cdCount")).toBe(1);
    expect(listRuns(a.id, user.id).length).toBe(1); // skipped ticks aren't logged
  });
});

describe("calendar context (v6.1.1)", () => {
  it("populates ctx.calendar when a rule references calendar.* (would be dead if the source query were dropped)", async () => {
    // An iCal connection whose URL is loopback → the SSRF guard rejects the fetch →
    // resolveSource rejects → resolveUserCalendar returns an EMPTY agenda (isBusyNow false),
    // not undefined. With the v6.1.0 bug (missing query → stableHash threw → swallowed),
    // ctx.calendar was always undefined and `calendar.isBusyNow eq false` never matched.
    createConnection(user.id, org, { provider: "ical", secret: "http://127.0.0.1/none.ics", name: "Cal" } as Parameters<typeof createConnection>[2]);
    createAutomation(user.id, {
      name: "Free now", enabled: true, trigger: { kind: "tick" },
      conditions: { type: "all", conditions: [{ type: "field", field: "calendar.isBusyNow", op: "eq", value: false }] },
      actions: [{ kind: "setData", key: "calHit", value: "free" }],
    });
    await fireAutomations(user.id, "tick", { now: new Date(Date.UTC(2026, 4, 1, 0, 0)), usePrev: true });
    expect(getCustomData(user.id, "calHit")).toBe("free"); // calendar context was resolved (not dead)
  });
});

describe("trend sense (v6.1)", () => {
  it("matches 'rising' only after enough increasing samples", async () => {
    createAutomation(user.id, {
      name: "Rising", enabled: true, trigger: { kind: "tick" },
      conditions: { type: "all", conditions: [{ type: "field", field: "data.tmp", op: "rising" }] },
      actions: [{ kind: "setData", key: "trendHit", value: "yes" }],
    });
    const at = (m: number) => new Date(Date.UTC(2026, 3, 1, 0, m));
    setCustomData(user.id, "tmp", 10); await fireAutomations(user.id, "tick", { now: at(0), usePrev: true });
    setCustomData(user.id, "tmp", 20); await fireAutomations(user.id, "tick", { now: at(1), usePrev: true });
    expect(getCustomData(user.id, "trendHit")).toBeUndefined(); // <3 samples → no trend yet (like "changed" before prev)
    setCustomData(user.id, "tmp", 30); await fireAutomations(user.id, "tick", { now: at(2), usePrev: true });
    expect(getCustomData(user.id, "trendHit")).toBe("yes"); // 10→20→30 rising
  });
});

describe("stale sense (v7.0)", () => {
  it("matches only after a field has gone unchanged for N minutes; a change resets the clock", async () => {
    createAutomation(user.id, {
      name: "Dead sensor", enabled: true, trigger: { kind: "tick" },
      conditions: { type: "field", field: "data.sens", op: "stale", value: 2 }, // no update in ≥ 2 min
      actions: [{ kind: "setData", key: "staleHit", value: "yes" }],
    });
    const at = (m: number) => new Date(Date.UTC(2026, 5, 1, 0, m));
    setCustomData(user.id, "sens", 1); await fireAutomations(user.id, "tick", { now: at(0), usePrev: true }); // first sight → fresh
    await fireAutomations(user.id, "tick", { now: at(1), usePrev: true }); // 1 min unchanged < 2
    expect(getCustomData(user.id, "staleHit")).toBeUndefined();
    await fireAutomations(user.id, "tick", { now: at(3), usePrev: true }); // 3 min unchanged ≥ 2 → fires
    expect(getCustomData(user.id, "staleHit")).toBe("yes");
    // a value change re-baselines: freshness resets, so it's not stale again until 2 more min pass
    setCustomData(user.id, "staleHit", "no");
    setCustomData(user.id, "sens", 2); await fireAutomations(user.id, "tick", { now: at(4), usePrev: true }); // changed → fresh
    expect(getCustomData(user.id, "staleHit")).toBe("no");
  });
});

describe("sustained condition (v7.0)", () => {
  it("matches only once the inner condition has held continuously for N minutes", async () => {
    createAutomation(user.id, {
      name: "Gone a while", enabled: true, trigger: { kind: "tick" },
      conditions: { type: "sustained", minutes: 2, condition: { type: "field", field: "data.gone", op: "eq", value: true } },
      actions: [{ kind: "setData", key: "sustHit", value: "yes" }],
    });
    const at = (m: number) => new Date(Date.UTC(2026, 6, 1, 0, m));
    setCustomData(user.id, "gone", true); await fireAutomations(user.id, "tick", { now: at(0), usePrev: true }); // first true
    await fireAutomations(user.id, "tick", { now: at(1), usePrev: true }); // held 1 min < 2
    expect(getCustomData(user.id, "sustHit")).toBeUndefined();
    await fireAutomations(user.id, "tick", { now: at(2), usePrev: true }); // held 2 min ≥ 2 → fires
    expect(getCustomData(user.id, "sustHit")).toBe("yes");
  });

  it("resets the clock if the inner condition lapses", async () => {
    createAutomation(user.id, {
      name: "Held reset", enabled: true, trigger: { kind: "tick" },
      conditions: { type: "sustained", minutes: 3, condition: { type: "field", field: "data.up", op: "eq", value: true } },
      actions: [{ kind: "setData", key: "heldHit", value: "yes" }],
    });
    const at = (m: number) => new Date(Date.UTC(2026, 6, 2, 0, m));
    setCustomData(user.id, "up", true); await fireAutomations(user.id, "tick", { now: at(0), usePrev: true });
    await fireAutomations(user.id, "tick", { now: at(2), usePrev: true }); // 2 min in (< 3)
    setCustomData(user.id, "up", false); await fireAutomations(user.id, "tick", { now: at(3), usePrev: true }); // lapses → clock cleared
    setCustomData(user.id, "up", true); await fireAutomations(user.id, "tick", { now: at(4), usePrev: true }); // true again → restarts at t4
    await fireAutomations(user.id, "tick", { now: at(6), usePrev: true }); // only 2 min since restart (< 3)
    expect(getCustomData(user.id, "heldHit")).toBeUndefined();
    await fireAutomations(user.id, "tick", { now: at(7), usePrev: true }); // now 3 min since restart → fires
    expect(getCustomData(user.id, "heldHit")).toBe("yes");
  });
});

describe("deferred actions (v7.0)", () => {
  it("queues an action with afterMinutes and runs it only once it comes due", async () => {
    const a = createAutomation(user.id, {
      name: "Then later", enabled: true, trigger: { kind: "tick" },
      actions: [{ kind: "incrementData", key: "deferredK", delta: 1, afterMinutes: 5 }],
    });
    const at = (m: number) => new Date(Date.UTC(2026, 7, 1, 0, m));
    await fireAutomations(user.id, "tick", { now: at(0), usePrev: true }); // enqueues, does NOT run yet
    expect(getCustomData(user.id, "deferredK")).toBeUndefined();
    expect(listRuns(a.id, user.id)[0]!.matched).toBe(true); // the automation matched + scheduled
    await drainDeferred(at(2)); // 2 min later — not due (due at +5)
    expect(getCustomData(user.id, "deferredK")).toBeUndefined();
    await drainDeferred(at(5)); // due → runs now
    expect(getCustomData(user.id, "deferredK")).toBe(1);
    await drainDeferred(at(9)); // already drained → no double-run
    expect(getCustomData(user.id, "deferredK")).toBe(1);
  });
});

describe("multi-person presence lanes (v7.0)", () => {
  it("exposes per-person lanes from presence.<name> keys", () => {
    setCustomData(user.id, "presence.alex", "home");
    setCustomData(user.id, "presence.sam", "away");
    const c = buildContext(user.id);
    expect(c.presence!.people.alex).toBe(true);
    expect(c.presence!.people.sam).toBe(false);
  });

  it("a person-scoped presence rule fires only for that person's lane (global stays separate)", async () => {
    createAutomation(user.id, {
      name: "Alex home", enabled: true, trigger: { kind: "presence", event: "enter", person: "alex" },
      actions: [{ kind: "setData", key: "alexHit", value: "yes" }],
    });
    createAutomation(user.id, {
      name: "Anyone home", enabled: true, trigger: { kind: "presence", event: "enter" },
      actions: [{ kind: "setData", key: "anyHit", value: "yes" }],
    });
    // an "alex" enter edge runs the alex rule, not the global (no-person) rule
    await fireAutomations(user.id, "presence", { presenceEvent: "enter", presencePerson: "alex" });
    expect(getCustomData(user.id, "alexHit")).toBe("yes");
    expect(getCustomData(user.id, "anyHit")).toBeUndefined();
    // a global (no-person) enter edge runs the global rule, not alex's
    setCustomData(user.id, "alexHit", "no");
    await fireAutomations(user.id, "presence", { presenceEvent: "enter" });
    expect(getCustomData(user.id, "anyHit")).toBe("yes");
    expect(getCustomData(user.id, "alexHit")).toBe("no");
  });
});

describe("objects — board-scoped reads & writes (v4.0)", () => {
  // A board with one static object (a heading) and one custom-data-bound object.
  const board = createLayout("Lobby", {
    schemaVersion: 3, name: "Lobby",
    rows: [{ id: "r1", blocks: [
      { id: "h1", name: "Sign", type: "heading", props: { content: "Open" } },
      { id: "cd1", name: "Lobby Temp", type: "customData", props: { key: "lobbyTemp" } },
    ] }],
  } as Parameters<typeof createLayout>[1], { userId: user.id });
  const ref = () => ({ id: board.id, document: getLayout(board.id)!.document });

  it("exposes a board's named objects under objects.<id> AND objects.<name>", () => {
    setCustomData(user.id, "lobbyTemp", 21);
    const c = buildContext(user.id, { layout: ref().document });
    expect((c.objects.h1 as { value: unknown }).value).toBe("Open");
    expect((c.objects.Sign as { value: unknown }).value).toBe("Open"); // reachable by current name too
    expect((c.objects["Lobby Temp"] as { value: unknown }).value).toBe(21);
    expect((c.objects.h1 as { settable: boolean }).settable).toBe(true);
  });

  it("a condition can read an object's value (rename-safe, keyed by id)", () => {
    const c = buildContext(user.id, { layout: ref().document });
    expect(evaluate(field("objects.h1.value", "eq", "Open"), c)).toBe(true);
    expect(evaluate(field("objects.cd1.value", "gt", 20), c)).toBe(true); // lobbyTemp=21
    expect(evaluate(field("objects.ghost.value", "exists"), c)).toBe(false); // dangling ref → safe
  });

  it("setObjectText on a static object patches its prop on the board doc", async () => {
    const r = await runActions([{ kind: "setObjectText", objectId: "h1", objectName: "Sign", text: "Closed" }], user.id, buildContext(user.id), ref());
    expect(r.run).toBe(1);
    const heading = getLayout(board.id)!.document.rows[0]!.blocks.find((b) => b.id === "h1")!;
    expect((heading.props as { content: string }).content).toBe("Closed");
  });

  it("setObjectText on a custom-data-bound object writes its data key", async () => {
    const r = await runActions([{ kind: "setObjectText", objectId: "cd1", objectName: "Lobby Temp", text: "26" }], user.id, buildContext(user.id), ref());
    expect(r.run).toBe(1);
    expect(getCustomData(user.id, "lobbyTemp")).toBe("26");
  });

  it("keys objects by id authoritatively — a name never clobbers a block id", () => {
    const b = createLayout("Collide", {
      schemaVersion: 3, name: "Collide",
      rows: [{ id: "r1", blocks: [
        { id: "dup", name: "Alpha", type: "heading", props: { content: "A" } }, // id "dup"
        { id: "other", name: "dup", type: "heading", props: { content: "B" } }, // name "dup" — must NOT overwrite block id "dup"
      ] }],
    } as Parameters<typeof createLayout>[1], { userId: user.id });
    const c = buildContext(user.id, { layout: getLayout(b.id)!.document });
    expect((c.objects.dup as { value: unknown }).value).toBe("A"); // the block whose id is "dup", not the one named "dup"
    expect((c.objects.other as { value: unknown }).value).toBe("B");
  });

  it("showObject / hideObject toggle the block's hidden flag on the doc", async () => {
    const r1 = await runActions([{ kind: "hideObject", objectId: "h1", objectName: "Sign" }], user.id, buildContext(user.id), ref());
    expect(r1.run).toBe(1);
    expect(getLayout(board.id)!.document.rows[0]!.blocks.find((b) => b.id === "h1")!.hidden).toBe(true);
    await runActions([{ kind: "showObject", objectId: "h1" }], user.id, buildContext(user.id), ref());
    expect(getLayout(board.id)!.document.rows[0]!.blocks.find((b) => b.id === "h1")!.hidden).toBe(false);
  });

  it("incrementData adds (from 0 if unset) and toggleData flips a flag", async () => {
    setCustomData(user.id, "count", 5);
    await runActions([{ kind: "incrementData", key: "count", delta: 3 }], user.id, buildContext(user.id));
    expect(getCustomData(user.id, "count")).toBe(8);
    await runActions([{ kind: "incrementData", key: "fresh", delta: 2 }], user.id, buildContext(user.id)); // unset → starts at 0
    expect(getCustomData(user.id, "fresh")).toBe(2);
    setCustomData(user.id, "flag", false);
    await runActions([{ kind: "toggleData", key: "flag" }], user.id, buildContext(user.id));
    expect(getCustomData(user.id, "flag")).toBe(true);
  });

  it("runAutomationById fires a saved automation live (the Run-now button)", async () => {
    setCustomData(user.id, "live", 0);
    const auto = createAutomation(user.id, { name: "Live run", enabled: true, trigger: { kind: "tick" }, actions: [{ kind: "incrementData", key: "live", delta: 1 }] });
    const r = await runAutomationById(auto.id, user.id);
    expect(r.matched).toBe(true);
    expect(r.run).toBe(1);
    expect(getCustomData(user.id, "live")).toBe(1);
  });

  it("object actions are inert without a board, and a dangling id is a reported error", async () => {
    const noBoard = await runActions([{ kind: "setObjectText", objectId: "h1", text: "x" }], user.id, buildContext(user.id));
    expect(noBoard.run).toBe(0);
    expect(noBoard.errors[0]).toMatch(/board/);
    const ghost = await runActions([{ kind: "setObjectText", objectId: "ghost", objectName: "Ghost", text: "x" }], user.id, buildContext(user.id), ref());
    expect(ghost.run).toBe(0);
    expect(ghost.errors[0]).toMatch(/not found/);
  });
});

describe("evaluate — crossesAbove/crossesBelow edge comparators (F4)", () => {
  const cur = (v: number) => ({ ...ctx(), data: { x: v } }) as Parameters<typeof evaluate>[1];
  it("crossesAbove fires only on the upward transition tick", () => {
    expect(evaluate(field("data.x", "crossesAbove", 60), cur(61), cur(59))).toBe(true); // 59 → 61 crosses up
    expect(evaluate(field("data.x", "crossesAbove", 60), cur(61), cur(62))).toBe(false); // already above last tick
    expect(evaluate(field("data.x", "crossesAbove", 60), cur(59), cur(40))).toBe(false); // still below
    expect(evaluate(field("data.x", "crossesAbove", 60), cur(61))).toBe(false); // no prev → undetectable
    expect(evaluate(field("data.x", "crossesAbove", 60), cur(60), cur(59))).toBe(false); // equal is not above
  });
  it("crossesBelow fires only on the downward transition tick", () => {
    expect(evaluate(field("data.x", "crossesBelow", 60), cur(59), cur(61))).toBe(true);
    expect(evaluate(field("data.x", "crossesBelow", 60), cur(59), cur(58))).toBe(false); // already below
    expect(evaluate(field("data.x", "crossesBelow", 60), cur(61), cur(62))).toBe(false);
  });
  it("the schema accepts the new comparators", () => {
    expect(Condition.safeParse({ type: "field", field: "data.x", op: "crossesAbove", value: 60 }).success).toBe(true);
    expect(Condition.safeParse({ type: "field", field: "data.x", op: "crossesBelow", value: 60 }).success).toBe(true);
  });
});

describe("buildContext — live blocks are sensable via objects.<id> (F1)", () => {
  const liveBlock = { id: "prs", name: "PRs", type: "stat", width: 1, h: 4, props: { value: "0", label: "PRs" }, style: {}, source: { kind: "github.search", connectionId: "c1", query: {}, map: { transform: "count" } } };
  const layout = { schemaVersion: 3, name: "t", rows: [{ id: "r", h: 4, blocks: [liveBlock] }] } as unknown as LayoutT;
  it("populates objects.<id>.value from the resolved live map (scalar)", () => {
    const c = buildContext(user.id, { layout, liveObjects: { prs: 7 } });
    expect(c.objects.prs!.value).toBe(7);
    expect(c.objects.prs!.kind).toBe("live");
    expect(evaluate(field("objects.prs.value", "gt", 5), c)).toBe(true);
    expect(evaluate(field("objects.PRs.value", "gt", 5), c)).toBe(true); // name alias resolves too
  });
  it("a list source exposes .count and value = length", () => {
    const c = buildContext(user.id, { layout, liveObjects: { prs: [1, 2, 3, 4, 5, 6] } });
    expect(c.objects.prs!.count).toBe(6);
    expect(evaluate(field("objects.prs.value", "gte", 6), c)).toBe(true);
  });
  it("without liveObjects a live block is present but valueless (offline / no rule)", () => {
    const c = buildContext(user.id, { layout });
    expect(c.objects.prs!.value).toBeUndefined();
    expect(c.objects.prs!.kind).toBe("live");
  });
});

describe("calendarContext — deepened calendar substrate (F5)", () => {
  const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15 12:00 UTC
  const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();
  it("computes next-event facts, a video-call link, and meetings-today", () => {
    const list = [
      { start: iso(-30), end: iso(30), title: "Now mtg" }, // running now
      { start: iso(60), title: "Design review", location: "Join https://zoom.us/j/9", allDay: false },
      { start: iso(180), title: "Later today", allDay: false },
    ];
    const c = calendarContext(list, NOW, "UTC")!;
    expect(c.isBusyNow).toBe(true);
    expect(c.nextTitle).toBe("Design review");
    expect(c.minutesUntilNext).toBe(60);
    expect(c.nextIsOnline).toBe(true);
    expect(c.nextJoinUrl).toContain("zoom.us");
    expect(c.eventsToday).toBe(3); // all three fall on the 15th UTC
  });
  it("flags an all-day next event and no online link", () => {
    const c = calendarContext([{ start: iso(120), title: "Company holiday", allDay: true }], NOW, "UTC")!;
    expect(c.nextIsAllDay).toBe(true);
    expect(c.nextIsOnline).toBe(false);
    expect(c.isBusyNow).toBe(false);
  });
});

describe("persistEngineState / hydrateEngineState — sensing history survives a restart (#1)", () => {
  it("flushes the engine maps to the engine_state table", () => {
    persistEngineState();
    const keys = (db.prepare("SELECT k FROM engine_state").all() as Array<{ k: string }>).map((r) => r.k);
    expect(keys).toContain("deferred");
    expect(keys).toContain("prev");
    expect(keys).toContain("trend");
  });
  it("hydrates the deferred-action queue from the DB (a restart re-runs a queued action)", async () => {
    // Simulate a row written before a restart: a setData action already due.
    const row = JSON.stringify([{ dueMs: Date.now() - 1000, userId: user.id, action: { kind: "setData", key: "hydrated", value: "yes" }, ctx: { time: { ts: Date.now() } }, layoutId: null }]);
    db.prepare("INSERT INTO engine_state (k, v) VALUES ('deferred', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(row);
    hydrateEngineState();
    await drainDeferred(new Date());
    expect(getCustomData(user.id, "hydrated")).toBe("yes");
  });
  it("survives corrupt state without throwing (starts fresh)", () => {
    db.prepare("INSERT INTO engine_state (k, v) VALUES ('trend', '{not json') ON CONFLICT(k) DO UPDATE SET v = excluded.v").run();
    expect(() => hydrateEngineState()).not.toThrow();
  });
});

describe("#2 per-action condition (branching)", () => {
  it("runs a step only when its own guard passes; unguarded steps always run", async () => {
    const c = ctx({ data: { flag: "on" } });
    const actions = [
      { kind: "setData", key: "b2_when_on", value: "yes", condition: field("data.flag", "eq", "on") },
      { kind: "setData", key: "b2_when_off", value: "yes", condition: field("data.flag", "eq", "off") },
      { kind: "setData", key: "b2_always", value: "yes" },
    ] as unknown as Parameters<typeof runActions>[0];
    const r = await runActions(actions, user.id, c);
    expect(getCustomData(user.id, "b2_when_on")).toBe("yes"); // guard passed → ran
    expect(getCustomData(user.id, "b2_when_off")).toBeFalsy(); // guard failed → skipped
    expect(getCustomData(user.id, "b2_always")).toBe("yes"); // no guard → ran
    expect(r.run).toBe(2); // two steps executed (the skipped one is not counted)
  });
});

describe("#7 day-type conditions (isWeekend / isWorkday)", () => {
  it("derives the booleans consistently with the weekday (tz-independent)", () => {
    const c = buildContext(user.id);
    expect(c.time.isWeekend).toBe(c.time.weekday === 0 || c.time.weekday === 6);
    expect(c.time.isWorkday).toBe(c.time.weekday >= 1 && c.time.weekday <= 5);
    expect(c.time.isWeekend).toBe(!c.time.isWorkday); // mutually exclusive, exhaustive
  });
  it("gates a rule on workday vs weekend", () => {
    const wk = (isWorkday: boolean) => ({ ...ctx(), time: { hour: 9, minute: 0, minuteOfDay: 540, weekday: isWorkday ? 3 : 0, ts: 0, isWorkday, isWeekend: !isWorkday } }) as Parameters<typeof evaluate>[1];
    expect(evaluate(field("time.isWorkday", "eq", true), wk(true))).toBe(true);
    expect(evaluate(field("time.isWorkday", "eq", true), wk(false))).toBe(false);
    expect(evaluate(field("time.isWeekend", "eq", true), wk(false))).toBe(true);
  });
});

describe("#14 per-rule snooze", () => {
  it("mutes a matching rule until the snooze expires, then it fires again", async () => {
    const a = createAutomation(user.id, {
      name: "Snoozy", enabled: true, trigger: { kind: "tick" },
      actions: [{ kind: "setData", key: "snz_ran", value: "yes" }],
    });
    snoozeAutomation(a.id, user.id, Date.now() + 3_600_000); // snoozed 1h ahead
    await fireAutomations(user.id, "tick", { now: new Date() });
    expect(getCustomData(user.id, "snz_ran")).toBeFalsy(); // muted → did not run
    expect(listRuns(a.id, user.id).length).toBe(0); // snoozed skips silently (no run recorded)

    snoozeAutomation(a.id, user.id, null); // un-snooze
    await fireAutomations(user.id, "tick", { now: new Date() });
    expect(getCustomData(user.id, "snz_ran")).toBe("yes"); // now it runs
  });
});

const { alertStorm, dayKeyIn } = await import("./engine");

describe("#7 once-per-day latch", () => {
  it("dayKeyIn is the LOCAL date (tz-aware, midnight-boundary correct)", () => {
    const ts = Date.parse("2026-07-01T23:30:00Z");
    expect(dayKeyIn(ts, "UTC")).toBe("2026-07-01");
    expect(dayKeyIn(ts, "Asia/Kolkata")).toBe("2026-07-02"); // 05:00 next day in IST
    expect(dayKeyIn(ts, "not-a-tz")).toBe("2026-07-01"); // bad tz → ISO fallback
  });

  it("fires once, stays quiet the rest of the day, fires again the next day", async () => {
    const a = createAutomation(user.id, {
      name: "Daily once", enabled: true, trigger: { kind: "tick" }, oncePerDay: true,
      actions: [{ kind: "setData", key: "opd_ran", value: "yes" }],
    });
    await fireAutomations(user.id, "tick", { now: new Date() });
    expect(getCustomData(user.id, "opd_ran")).toBe("yes"); // first fire of the day
    setCustomData(user.id, "opd_ran", "cleared");
    await fireAutomations(user.id, "tick", { now: new Date() });
    expect(getCustomData(user.id, "opd_ran")).toBe("cleared"); // same day → latched
    // rewind the last matched fire to yesterday → a new local day → fires again
    db.prepare("UPDATE automations SET last_run = ? WHERE id = ?").run(Date.now() - 26 * 3_600_000, a.id);
    await fireAutomations(user.id, "tick", { now: new Date() });
    expect(getCustomData(user.id, "opd_ran")).toBe("yes");
  });
});

describe("#14 alert grouping (storm → one calm summary)", () => {
  it("delivers the first N, summarizes once, then stays silent until the window passes", () => {
    const u = "storm-user";
    const t0 = 1_700_000_000_000;
    expect(alertStorm(u, t0)).toBe("deliver");
    expect(alertStorm(u, t0 + 1_000)).toBe("deliver");
    expect(alertStorm(u, t0 + 2_000)).toBe("deliver");
    expect(alertStorm(u, t0 + 3_000)).toBe("summarize"); // the 4th inside 10 min → one summary
    expect(alertStorm(u, t0 + 4_000)).toBe("silent"); // the flood stays quiet
    expect(alertStorm(u, t0 + 5_000)).toBe("silent");
    expect(alertStorm(u, t0 + 11 * 60_000)).toBe("deliver"); // window passed → normal again
  });
});

const { fireDataChanged } = await import("./engine");

describe("#11 dataChanged trigger (event-driven data arrival)", () => {
  it("fires only for the watched key", async () => {
    createAutomation(user.id, {
      name: "Watch foo", enabled: true, trigger: { kind: "dataChanged", key: "foo11" },
      actions: [{ kind: "setData", key: "dc_ran", value: "yes" }],
    });
    setCustomData(user.id, "bar11", 1);
    await fireDataChanged(user.id, "bar11"); // a different key → not ours
    expect(getCustomData(user.id, "dc_ran")).toBeFalsy();
    setCustomData(user.id, "foo11", 1);
    await fireDataChanged(user.id, "foo11");
    expect(getCustomData(user.id, "dc_ran")).toBe("yes");
  });

  it("an automation's own setData never fires it (rule chains can't loop)", async () => {
    createAutomation(user.id, {
      name: "Watch the watcher", enabled: true, trigger: { kind: "dataChanged", key: "dc_ran" },
      actions: [{ kind: "setData", key: "dc_loop", value: "yes" }],
    });
    setCustomData(user.id, "foo11", 2);
    await fireDataChanged(user.id, "foo11"); // "Watch foo" runs and WRITES dc_ran via its action…
    expect(getCustomData(user.id, "dc_ran")).toBe("yes");
    expect(getCustomData(user.id, "dc_loop")).toBeFalsy(); // …but that write does not cascade
  });

  it("pairs with crossesAbove for an instant value-cross alarm", async () => {
    createAutomation(user.id, {
      name: "Cross 10", enabled: true, trigger: { kind: "dataChanged", key: "lvl11" },
      conditions: field("data.lvl11", "crossesAbove", 10),
      actions: [{ kind: "setData", key: "crossed11", value: "yes" }],
    });
    setCustomData(user.id, "lvl11", 5);
    await fireDataChanged(user.id, "lvl11"); // below the line → baseline, no fire
    expect(getCustomData(user.id, "crossed11")).toBeFalsy();
    setCustomData(user.id, "lvl11", 15);
    await fireDataChanged(user.id, "lvl11"); // crossed 10 between writes → fires
    expect(getCustomData(user.id, "crossed11")).toBe("yes");
  });
});

describe("#6 lookback windows (trend over persistent metric history)", () => {
  it("windowed 'rising' resolves from history on the FIRST pass (no 3-sample warm-up)", async () => {
    const u = createUser("Look", "lookback@example.com", "password123")!;
    const now = Date.UTC(2026, 5, 10, 12, 0);
    logMetric(u.id, "lb", 10, now - 3 * 3_600_000); // 3 h ago
    logMetric(u.id, "lb", 30, now - 60_000); // a minute ago
    createAutomation(u.id, {
      name: "Risen 6h", enabled: true, trigger: { kind: "tick" },
      conditions: { type: "all", conditions: [{ type: "field", field: "data.lb", op: "rising", value: 360 }] },
      actions: [{ kind: "setData", key: "lb_hit", value: "yes" }],
    });
    await fireAutomations(u.id, "tick", { now: new Date(now), usePrev: true });
    expect(getCustomData(u.id, "lb_hit")).toBe("yes");
  });

  it("the window is respected — a single point inside it has no direction", async () => {
    const u = createUser("Look2", "lookback2@example.com", "password123")!;
    const now = Date.UTC(2026, 5, 10, 12, 0);
    logMetric(u.id, "lb2", 10, now - 3 * 3_600_000); // outside the 1 h window
    logMetric(u.id, "lb2", 30, now - 60_000); // the only point inside it
    createAutomation(u.id, {
      name: "Risen 1h", enabled: true, trigger: { kind: "tick" },
      conditions: { type: "all", conditions: [{ type: "field", field: "data.lb2", op: "rising", value: 60 }] },
      actions: [{ kind: "setData", key: "lb2_hit", value: "yes" }],
    });
    await fireAutomations(u.id, "tick", { now: new Date(now), usePrev: true });
    expect(getCustomData(u.id, "lb2_hit")).toBeUndefined();
  });

  it("dry-run answers a windowed trend; a blank value stays the live buffer (recipe compat)", () => {
    const u = createUser("Look3", "lookback3@example.com", "password123")!;
    const now = Date.now(); // dryRun evaluates at the real clock — history just has to span it
    logMetric(u.id, "lb3", 50, now - 2 * 3_600_000);
    logMetric(u.id, "lb3", 20, now - 60_000);
    const auto = {
      name: "Fallen", enabled: true, trigger: { kind: "tick" },
      conditions: { type: "field", field: "data.lb3", op: "falling", value: 1440 },
      actions: [{ kind: "setData", key: "x", value: 1 }],
    } as Parameters<typeof dryRunAutomation>[0];
    expect(dryRunAutomation(auto, u.id).matched).toBe(true);
    // value "" is how the trend recipes have always stored it → live buffer → no verdict here
    const live = { ...auto, conditions: { type: "field", field: "data.lb3", op: "falling", value: "" } } as Parameters<typeof dryRunAutomation>[0];
    expect(dryRunAutomation(live, u.id).matched).toBe(false);
  });
});

describe("#5 field-to-field conditions (valueField)", () => {
  it("compares one context field against another, in both directions", () => {
    const vs = (indoor: number, outdoor: number) =>
      evaluate({ type: "field", field: "data.indoor", op: "gt", valueField: "data.outdoor" }, ctx({ data: { indoor, outdoor } }));
    expect(vs(24, 18)).toBe(true);
    expect(vs(16, 18)).toBe(false);
  });

  it("crossesAbove takes a FIELD threshold — edge fires when the watched side overtakes it", () => {
    const cond: ConditionT = { type: "field", field: "data.power", op: "crossesAbove", valueField: "data.solar" };
    const before = ctx({ data: { power: 900, solar: 1000 } });
    const after = ctx({ data: { power: 1100, solar: 1000 } });
    expect(evaluate(cond, after, before)).toBe(true); // crossed the (field) threshold
    expect(evaluate(cond, after, after)).toBe(false); // already above → no edge
  });

  it("fires end-to-end from two custom-data keys", async () => {
    const u = createUser("Vs", "vsfield@example.com", "password123")!;
    setCustomData(u.id, "indoor", 26);
    setCustomData(u.id, "outdoor", 19);
    createAutomation(u.id, {
      name: "Warmer inside", enabled: true, trigger: { kind: "tick" },
      conditions: { type: "field", field: "data.indoor", op: "gt", valueField: "data.outdoor" },
      actions: [{ kind: "setData", key: "vs_hit", value: "yes" }],
    });
    await fireAutomations(u.id, "tick", { now: new Date(Date.UTC(2026, 5, 11, 8, 0)), usePrev: true });
    expect(getCustomData(u.id, "vs_hit")).toBe("yes");
  });

  it("stays total when the referenced field is missing (no throw, no match)", () => {
    expect(evaluate({ type: "field", field: "data.temp", op: "gt", valueField: "data.nope.deep" }, ctx())).toBe(false);
  });
});

describe("#44 emailSnapshot action", () => {
  it("errors cleanly (run survives) on a missing board, and on a missing mail backend BEFORE any render", async () => {
    const u = createUser("Snap", "snap@example.com", "password123")!;
    const noBoard = await runActions([{ kind: "emailSnapshot", layoutId: 999_999 }], u.id, buildContext(u.id));
    expect(noBoard.errors.join()).toContain("board not found");
    const board = createLayout("Snappable", {
      schemaVersion: 3, name: "Snappable",
      rows: [{ id: "r1", blocks: [{ id: "h1", type: "heading", props: { content: "Hi" } }] }],
    } as Parameters<typeof createLayout>[1], { userId: u.id });
    // access passes → the next (cheap) gate is the mail backend; the slow headless
    // render must never start on a backend-less install.
    const noMail = await runActions([{ kind: "emailSnapshot", layoutId: board.id }], u.id, buildContext(u.id));
    expect(noMail.errors.join()).toContain("no mail backend");
  });

  it("snapshotFilename yields a safe download name", async () => {
    const { snapshotFilename } = await import("../snapshot");
    expect(snapshotFilename("Team Wall (Q3) — Metrics!")).toBe("team-wall-q3-metrics.png");
    expect(snapshotFilename("")).toBe("board.png");
  });
});

describe("#47 alert digest mode", () => {
  it("holds non-critical alerts, critical breaks through, one summary after the window", async () => {
    const { pendingDigest, flushAlertDigest } = await import("./engine");
    const { setUserAlertDigest } = await import("../auth");
    const u = createUser("Digest", "digest@example.com", "password123")!;
    setUserAlertDigest(u.id, 30);
    const ctx0 = buildContext(u.id);
    await runActions([{ kind: "alert", severity: "info", title: "CPU high", target: "all" }], u.id, ctx0);
    await runActions([{ kind: "alert", severity: "warn", title: "Disk low", body: "under 5%", target: "all" }], u.id, ctx0);
    expect(pendingDigest(u.id)).toBe(2); // held, not delivered
    await runActions([{ kind: "alert", severity: "critical", title: "Fire", target: "all" }], u.id, ctx0);
    expect(pendingDigest(u.id)).toBe(2); // critical bypassed the buffer entirely
    expect(await flushAlertDigest(u.id, Date.now())).toBeNull(); // window not passed yet
    const s = await flushAlertDigest(u.id, Date.now() + 31 * 60_000);
    expect(s).toMatchObject({ count: 2, severity: "warn" }); // highest held severity wins
    expect(s!.title).toContain("2 alerts");
    expect(s!.body).toContain("CPU high");
    expect(pendingDigest(u.id)).toBe(0); // buffer drained
    expect(await flushAlertDigest(u.id, Date.now() + 62 * 60_000)).toBeNull(); // nothing new → quiet
  });

  it("a digest of one arrives verbatim; switching digest off flushes immediately", async () => {
    const { pendingDigest, flushAlertDigest } = await import("./engine");
    const { setUserAlertDigest } = await import("../auth");
    const u = createUser("Digest2", "digest2@example.com", "password123")!;
    setUserAlertDigest(u.id, 60);
    await runActions([{ kind: "alert", severity: "info", title: "Backup finished", body: "42 GB", target: "all" }], u.id, buildContext(u.id));
    expect(pendingDigest(u.id)).toBe(1);
    setUserAlertDigest(u.id, null); // turned off with one alert still held
    const s = await flushAlertDigest(u.id, Date.now()); // no window check when off → immediate
    expect(s).toMatchObject({ count: 1, severity: "info", title: "Backup finished", body: "42 GB" });
  });
});

describe("#41 per-channel alert routing", () => {
  it("bell channel records a notification; screen-less routing never touches the wall", async () => {
    const { listNotifications } = await import("../notifications");
    const u = createUser("Chan", "chan@example.com", "password123")!;
    await runActions([{ kind: "alert", severity: "warn", title: "Disk low", body: "under 5%", target: "all", channels: ["bell"] }], u.id, buildContext(u.id));
    const n = listNotifications(u.id);
    expect(n.length).toBe(1);
    expect(n[0]!.message).toBe("Disk low — under 5%");
    expect(n[0]!.kind).toBe("alert");
  });

  it("defaults to the wall only (no channels = today's behavior, no bell row)", async () => {
    const { listNotifications } = await import("../notifications");
    const u = createUser("Chan2", "chan2@example.com", "password123")!;
    await runActions([{ kind: "alert", severity: "info", title: "Just the wall", target: "all" }], u.id, buildContext(u.id));
    expect(listNotifications(u.id).length).toBe(0);
  });

  it("bell delivers even while digest mode holds the wall copy", async () => {
    const { listNotifications } = await import("../notifications");
    const { setUserAlertDigest } = await import("../auth");
    const { pendingDigest } = await import("./engine");
    const u = createUser("Chan3", "chan3@example.com", "password123")!;
    setUserAlertDigest(u.id, 30);
    await runActions([{ kind: "alert", severity: "info", title: "Held on the wall", target: "all", channels: ["screen", "bell"] }], u.id, buildContext(u.id));
    expect(listNotifications(u.id).length).toBe(1); // bell is not a wall interruption → immediate
    expect(pendingDigest(u.id)).toBe(1); // the wall copy is still held
  });
});
