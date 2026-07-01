import { describe, expect, it } from "vitest";
import { Layout, PAGE_UNITS } from "./layout";
import { parseDocument } from "./migrate";
import { templates } from "./fixtures";

describe("layout schema (v3 document-flow with row heights)", () => {
  it("accepts all golden fixtures", () => {
    expect(templates).toHaveLength(4);
    for (const t of templates) expect(() => Layout.parse(t)).not.toThrow();
    expect(new Set(templates.map((t) => t.name)).size).toBe(4);
  });

  it("supports optional multi-page boards (no migration; absent = single page)", () => {
    const single = Layout.parse({ schemaVersion: 3, name: "One", rows: [{ id: "r", blocks: [{ id: "a", type: "divider", props: {} }] }] });
    expect(single.pages).toBeUndefined(); // existing docs parse unchanged
    expect(single.pageRotateSeconds).toBeUndefined();

    const multi = Layout.parse({
      schemaVersion: 3,
      name: "Multi",
      rows: [{ id: "r0", blocks: [{ id: "a", type: "divider", props: {} }] }],
      pages: [[{ id: "r1", blocks: [{ id: "b", type: "divider", props: {} }] }]],
      pageRotateSeconds: 10,
    });
    expect(multi.pages).toHaveLength(1);
    expect(multi.pageRotateSeconds).toBe(10);

    // bounds: rotate must be ≥ 3s; at most 8 extra pages
    expect(Layout.safeParse({ schemaVersion: 3, name: "x", rows: [], pageRotateSeconds: 1 }).success).toBe(false);
    expect(Layout.safeParse({ schemaVersion: 3, name: "x", rows: [], pages: Array.from({ length: 9 }, () => []) }).success).toBe(false);
  });

  it("v10 rich page rotation: per-page settings + transition round-trip + bound", () => {
    const rich = Layout.parse({
      schemaVersion: 3,
      name: "Rich",
      rows: [{ id: "r", blocks: [{ id: "a", type: "divider", props: {} }] }],
      pages: [[{ id: "r1", blocks: [{ id: "b", type: "divider", props: {} }] }]],
      pageSettings: [
        { name: "Day", seconds: 30, schedule: { startMin: 540, endMin: 1020, daysMask: 62 } },
        { name: "Promo", seconds: 8, schedule: { fromDate: "2026-12-24", toDate: "2026-12-26" } },
      ],
      pageTransitionMs: 500,
    });
    expect(rich.pageSettings).toHaveLength(2);
    expect(rich.pageSettings?.[0]?.schedule?.daysMask).toBe(62);
    expect(rich.pageSettings?.[1]?.schedule?.fromDate).toBe("2026-12-24");
    expect(rich.pageTransitionMs).toBe(500);
    // bounds: minute-of-day ≤ 1439, dates must be YYYY-MM-DD, ≤ 9 page settings, fade ≤ 2000ms
    expect(Layout.safeParse({ schemaVersion: 3, name: "x", rows: [], pageSettings: [{ schedule: { startMin: 1440 } }] }).success).toBe(false);
    expect(Layout.safeParse({ schemaVersion: 3, name: "x", rows: [], pageSettings: [{ schedule: { fromDate: "2026/01/01" } }] }).success).toBe(false);
    expect(Layout.safeParse({ schemaVersion: 3, name: "x", rows: [], pageTransitionMs: 5000 }).success).toBe(false);
    expect(Layout.safeParse({ schemaVersion: 3, name: "x", rows: [], pageSettings: Array.from({ length: 10 }, () => ({})) }).success).toBe(false);
  });

  it("#10 button block round-trips (label + optional automationId)", () => {
    const doc = Layout.parse({
      schemaVersion: 3,
      name: "Buttons",
      rows: [{ id: "r", blocks: [
        { id: "b1", type: "button", props: { label: "Start focus", automationId: "auto-123" } },
        { id: "b2", type: "button", props: {} }, // unbound — label defaults, no automation
      ] }],
    });
    const blocks = doc.rows[0]!.blocks;
    expect(blocks[0]!.type).toBe("button");
    expect((blocks[0]!.props as { label: string; automationId?: string }).automationId).toBe("auto-123");
    expect((blocks[1]!.props as { label: string }).label).toBe("Tap"); // default
  });

  it("#80 per-block schedule round-trips + bounds (no schedule = always shown)", () => {
    const doc = Layout.parse({
      schemaVersion: 3,
      name: "Sched",
      rows: [{ id: "r", blocks: [
        { id: "always", type: "divider", props: {} },
        { id: "morning", type: "text", props: { content: "Good morning" }, schedule: { startMin: 360, endMin: 720, daysMask: 62 } },
        { id: "promo", type: "text", props: { content: "Holiday" }, schedule: { fromDate: "2026-12-24", toDate: "2026-12-26" } },
      ] }],
    });
    const blocks = doc.rows[0]!.blocks;
    expect(blocks[0]!.schedule).toBeUndefined(); // absent = always shown
    expect(blocks[1]!.schedule).toEqual({ startMin: 360, endMin: 720, daysMask: 62 });
    expect(blocks[2]!.schedule?.fromDate).toBe("2026-12-24");
    // bounds mirror page schedules: minute ≤ 1439, dates YYYY-MM-DD
    expect(Layout.safeParse({ schemaVersion: 3, name: "x", rows: [{ id: "r", blocks: [{ id: "a", type: "divider", props: {}, schedule: { startMin: 1440 } }] }] }).success).toBe(false);
    expect(Layout.safeParse({ schemaVersion: 3, name: "x", rows: [{ id: "r", blocks: [{ id: "a", type: "divider", props: {}, schedule: { fromDate: "2026/01/01" } }] }] }).success).toBe(false);
  });

  it("supports optional signage zones (no migration; absent = single doc)", () => {
    const noZones = Layout.parse({ schemaVersion: 3, name: "Plain", rows: [{ id: "r", blocks: [{ id: "a", type: "divider", props: {} }] }] });
    expect(noZones.zones).toBeUndefined(); // existing docs parse unchanged

    const zoned = Layout.parse({
      schemaVersion: 3,
      name: "Split",
      rows: [],
      zones: [
        { id: "z1", rect: { x: 0, y: 0, w: 50, h: 100 }, rows: [{ id: "r1", blocks: [{ id: "a", type: "clock", props: {} }] }] },
        { id: "z2", rect: { x: 50, y: 0, w: 50 }, rows: [] }, // y/h default
      ],
    });
    expect(zoned.zones).toHaveLength(2);
    expect(zoned.zones![1]!.rect.h).toBe(100); // default fills height
    expect(zoned.zones![1]!.rect.y).toBe(0);
    expect(zoned.zones![0]!.rows[0]!.h).toBe(4); // row defaults apply inside a zone
  });

  it("fills defaults, including row height", () => {
    const doc = Layout.parse({
      schemaVersion: 3,
      name: "Minimal",
      rows: [{ id: "r1", blocks: [{ id: "a", type: "clock", props: {} }, { id: "b", type: "heading", props: { content: "Hi" } }] }],
    });
    expect(doc.theme.mode).toBe("light");
    expect(doc.gap).toBe(2);
    expect(doc.rows[0]!.h).toBe(4);
    expect(doc.rows[0]!.blocks[0]!.width).toBe(1);
    const h = doc.rows[0]!.blocks[1]!;
    if (h.type === "heading") expect(h.props.level).toBe(1);
  });

  it("knows all 199 block types", () => {
    const types = [
      "clock", "weather", "calendar", "tasks", "text", "queue", "heading", "divider", "image", "callout",
      "subheading", "quote", "bulletList", "numberedList", "checklist", "code", "label", "keyValue", "table",
      "link", "banner", "definition", "spacer", "stat", "metric", "progress", "rating", "gauge", "worldClock",
      "countdown", "daysUntil", "weekNumber", "dateBadge", "timer", "analogClock", "moonPhase", "sunriseSunset",
      "icon", "avatar", "badge", "nameTag", "hours", "menuList", "deviceStatus", "sensor", "thermostat",
      // v0.6
      "lead", "pullquote", "dropCap", "finePrint", "numberedHeading", "verse", "ascii", "tagCloud",
      "timeline", "steps", "faq", "prosCons",
      "sparkline", "barChart", "progressRing", "dotProgress", "scoreboard", "fraction", "tally", "heatStrip", "trend", "kpiSpark",
      "dayProgress", "yearProgress", "weekProgress", "greeting", "romanClock", "binaryClock", "seasonClock", "zodiac",
      "habitTracker", "streak", "waterTracker", "wifiCard",
      "forecast", "windCompass", "uvIndex", "airQuality", "precip", "headlines", "currencyRate", "cryptoPrice",
      "onThisDay", "wikiToday", "quoteLive", "factLive", "hackerNews", "githubStats", "nextHoliday", "issNow",
      "jsonFeed", "customData",
      // v0.8
      "signature", "address", "byline", "legend", "breadcrumb", "noticeBar", "keyCombo", "dividerLabeled",
      "iconRow", "statRow", "spacerDots", "frame",
      "lineChart", "areaChart", "bulletGraph", "horizontalBars", "rankingList", "waffle", "signalBars",
      "thermometer", "comparison", "percentList",
      "monthCalendar", "weekStrip", "nowNext", "ageCounter", "anniversary", "timeBlocks", "shiftStatus", "pomodoro",
      "monthHabit", "savingsGoal", "readingNow", "weightTrend", "moodWeek", "checklistProgress",
      "roomStatus", "directory", "eventBanner", "openSign", "nowPlaying", "splitFlap",
      // v0.9
      "epigraph", "kicker", "ticker", "glossary", "footnotes", "highlight", "letterhead", "fieldRow",
      "contents", "aside", "postscript", "mantra",
      "emojiStat", "monogram", "flag", "logoText", "profileCard", "peopleList",
      "bigNumber", "percentBig", "deltaStat", "moneyStat", "counterPair", "targetMeter", "unitStat", "progressBars",
      "lollipopChart", "winLossBar", "dotMatrix", "rangeBar", "bubbleScale", "starBar", "columnLabels", "deltaList",
      "gaugeMini", "histogram",
      "fullDate", "monthName", "timeOfDay", "quarterProgress", "daysLeftMonth", "unixClock", "tzPair", "nextWeekday",
      "daylight", "moonProgress", "seasonProgress", "goldenHour",
      "goalProgress", "stepsToday", "streakPair", "bookList", "moodToday", "budgetLine",
      "welcomeSign", "priceTag", "todaySpecial", "phoneNumber", "socialHandle", "wayfinding",
    ];
    // Types whose props have required fields with no default.
    const sampleProps: Record<string, unknown> = {
      weather: { latitude: 1, longitude: 2 },
      calendar: { source: "ics", url: "https://e.com/c.ics" },
      image: { url: "https://e.com/i.png" },
      avatar: { url: "https://e.com/a.png" },
      link: { url: "https://e.com" },
      headlines: { url: "https://e.com/feed.xml" },
      jsonFeed: { url: "https://e.com/data.json" },
    };
    for (const type of types) {
      const blocks = [{ id: "x", type, props: sampleProps[type] ?? {} }];
      const result = Layout.safeParse({ schemaVersion: 3, name: "n", rows: [{ id: "r", blocks }] });
      expect(result.success, `${type} should parse`).toBe(true);
    }
    expect(new Set(types).size).toBe(200);
  });

  it("accepts an optional object name on a block (v4.0, additive)", () => {
    const doc = Layout.parse({
      schemaVersion: 3,
      name: "Named",
      rows: [{ id: "r", blocks: [{ id: "a", type: "clock", name: "Lobby Clock", props: {} }] }],
    });
    expect(doc.rows[0]!.blocks[0]!.name).toBe("Lobby Clock");
    // name is optional — a block without one still parses
    expect(Layout.safeParse({ schemaVersion: 3, name: "x", rows: [{ id: "r", blocks: [{ id: "a", type: "clock", props: {} }] }] }).success).toBe(true);
  });

  it("defaults block style and board align (v0.6, additive)", () => {
    const doc = Layout.parse({
      schemaVersion: 3,
      name: "Styled",
      rows: [{ id: "r", blocks: [{ id: "a", type: "text", props: {} }] }],
    });
    expect(doc.align).toBe("top");
    expect(doc.rows[0]!.blocks[0]!.style).toEqual({ invert: false, align: "start", valign: "top" });
  });

  it("rejects more than four columns in a row", () => {
    const blocks = Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, type: "clock", props: {} }));
    expect(Layout.safeParse({ schemaVersion: 3, name: "X", rows: [{ id: "r", blocks }] }).success).toBe(false);
  });

  it("rejects non-http image URLs", () => {
    const bad = (url: string) => ({ schemaVersion: 3, name: "B", rows: [{ id: "r", blocks: [{ id: "i", type: "image", props: { url } }] }] });
    // eslint-disable-next-line no-script-url
    expect(Layout.safeParse(bad("javascript:alert(1)")).success).toBe(false);
    expect(Layout.safeParse(bad("https://example.com/a.png")).success).toBe(true);
  });

  it("migrates v1 grid documents to v3 with heights", () => {
    const v1 = {
      schemaVersion: 1,
      name: "Old desk",
      grid: { columns: 4, rows: 3, gap: 3 },
      widgets: [
        { id: "w2", type: "weather", area: { col: 3, row: 1, colSpan: 2, rowSpan: 1 }, props: { latitude: 1, longitude: 2 } },
        { id: "w1", type: "clock", area: { col: 1, row: 1, colSpan: 2, rowSpan: 1 }, props: {} },
        { id: "w3", type: "text", area: { col: 1, row: 3, colSpan: 4, rowSpan: 1 }, props: { content: "hi" } },
      ],
    };
    const doc = parseDocument(v1);
    expect(doc.schemaVersion).toBe(3);
    expect(doc.gap).toBe(3);
    expect(doc.rows).toHaveLength(2);
    expect(doc.rows[0]!.blocks.map((bl) => bl.id)).toEqual(["w1", "w2"]);
    expect(doc.rows[0]!.blocks[1]!.width).toBe(2);
    expect(doc.rows[0]!.h).toBeGreaterThan(0);
  });

  it("migrates v2 documents (no heights) to v3, dividers thin", () => {
    const v2 = {
      schemaVersion: 2,
      name: "Mid",
      gap: 2,
      rows: [
        { id: "r1", blocks: [{ id: "a", type: "clock", width: 1, props: { showDate: true } }] },
        { id: "r2", blocks: [{ id: "d", type: "divider", width: 1, props: {} }] },
        { id: "r3", blocks: [{ id: "c", type: "text", width: 1, props: { content: "hi", align: "left" } }] },
      ],
    };
    const doc = parseDocument(v2);
    expect(doc.schemaVersion).toBe(3);
    expect(doc.rows[1]!.h).toBe(1); // divider row stays thin
    expect(doc.rows[0]!.h).toBeGreaterThan(1);
    const total = doc.rows.reduce((n, r) => n + r.h, 0);
    expect(total).toBeLessThanOrEqual(PAGE_UNITS);
  });

  it("passes v3 documents through parseDocument untouched", () => {
    expect(parseDocument(templates[0]).name).toBe("Personal dashboard");
  });
});

describe("TV / large-display profile (v1.7, optional → back-compatible)", () => {
  it("parses a profile with TV settings", async () => {
    const { DeviceProfile } = await import("./device");
    const p = DeviceProfile.parse({ width: 1920, height: 1080, tvMode: true, safeArea: { top: 5, right: 5, bottom: 5, left: 5 }, burnIn: { pixelShift: true, screensaverAfterMin: 60 }, wake: { startMin: 420, endMin: 1380 } });
    expect(p.tvMode).toBe(true);
    expect(p.safeArea?.top).toBe(5);
    expect(p.burnIn?.pixelShift).toBe(true);
    expect(p.burnIn?.dim).toBe(false); // defaulted
    expect(p.wake?.daysMask).toBe(127); // defaulted
  });

  it("still parses an old profile with no TV fields (no migration)", async () => {
    const { DeviceProfile } = await import("./device");
    const p = DeviceProfile.parse({ width: 800, height: 480 });
    expect(p.tvMode).toBeUndefined();
    expect(p.safeArea).toBeUndefined();
    expect(p.platform).toBeUndefined();
  });

  it("carries an optional native platform / version (v2.0, no migration)", async () => {
    const { DeviceProfile } = await import("./device");
    const p = DeviceProfile.parse({ width: 1920, height: 1080, platform: "firetv", nativeVersion: "1.0.0" });
    expect(p.platform).toBe("firetv");
    expect(p.nativeVersion).toBe("1.0.0");
    expect(() => DeviceProfile.parse({ platform: "x".repeat(25) })).toThrow(); // 24-char cap
  });

  it("parses ScreenState with an optional tv block", async () => {
    const { ScreenState } = await import("./device");
    const s = ScreenState.parse({ layoutVersion: 1, layout: null, data: {}, tv: { enabled: true, power: "on" } });
    expect(s.tv?.enabled).toBe(true);
    expect(ScreenState.parse({ layoutVersion: 1, layout: null, data: {} }).tv).toBeUndefined();
  });
});
