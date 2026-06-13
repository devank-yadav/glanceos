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

  it("knows all 46 block types", () => {
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
      "jsonFeed",
      // v0.8
      "signature", "address", "byline", "legend", "breadcrumb", "noticeBar", "keyCombo", "dividerLabeled",
      "iconRow", "statRow", "spacerDots", "frame",
      "lineChart", "areaChart", "bulletGraph", "horizontalBars", "rankingList", "waffle", "signalBars",
      "thermometer", "comparison", "percentList",
      "monthCalendar", "weekStrip", "nowNext", "ageCounter", "anniversary", "timeBlocks", "shiftStatus", "pomodoro",
      "monthHabit", "savingsGoal", "readingNow", "weightTrend", "moodWeek", "checklistProgress",
      "roomStatus", "directory", "eventBanner", "openSign", "nowPlaying", "splitFlap",
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
    expect(new Set(types).size).toBe(139);
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
