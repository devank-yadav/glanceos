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
const { listTasks } = await import("../tasks");
const { createAutomation, listRuns } = await import("../automations");
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
