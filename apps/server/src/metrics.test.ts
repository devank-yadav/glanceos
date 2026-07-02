import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-metrics-"));
const { migrate } = await import("./db");
migrate();
const { logMetric, metricSeries, toMetricNumber, habitShape } = await import("./metrics");
const { createUser } = await import("./auth");
const { setCustomData, deleteCustomData } = await import("./customdata");

// #27 — every numeric custom-data write accumulates a time series so a value the source keeps no
// history for can be charted as a trend.
describe("#27 metric history", () => {
  it("coerces only chartable numbers", () => {
    expect(toMetricNumber(42)).toBe(42);
    expect(toMetricNumber("3.14")).toBeCloseTo(3.14);
    expect(toMetricNumber("nope")).toBeNull();
    expect(toMetricNumber(Number.NaN)).toBeNull();
    expect(toMetricNumber(true)).toBeNull();
    expect(toMetricNumber(null)).toBeNull();
  });

  it("buckets to the minute (same-minute rewrite replaces) and returns an ascending series", () => {
    const u = "metric-u1";
    const t0 = 1_700_000_040_000; // arbitrary ms, mid-minute
    logMetric(u, "followers", 100, t0);
    logMetric(u, "followers", 105, t0 + 10_000); // same minute → replaces the point
    logMetric(u, "followers", 110, t0 + 70_000); // next minute → new point
    const s = metricSeries(u, "followers", 0);
    expect(s.length).toBe(2);
    expect(s[0]!.value).toBe(105); // last write within minute 0 wins
    expect(s[1]!.value).toBe(110);
    expect(s[0]!.at).toBeLessThan(s[1]!.at); // oldest → newest
  });

  it("`since` filters and non-finite values are ignored", () => {
    const u = "metric-u2";
    logMetric(u, "x", 1, 60_000);
    logMetric(u, "x", 2, 120_000);
    logMetric(u, "x", Number.POSITIVE_INFINITY, 180_000); // ignored
    expect(metricSeries(u, "x", 0).length).toBe(2);
    expect(metricSeries(u, "x", 100_000).map((p) => p.value)).toEqual([2]);
  });

  it("setCustomData records numeric writes only", () => {
    const user = createUser("Metric", "metric@example.com", "password123")!;
    setCustomData(user.id, "weight", 80);
    setCustomData(user.id, "note", "hello"); // non-numeric → no series
    expect(metricSeries(user.id, "weight", 0).length).toBe(1);
    expect(metricSeries(user.id, "weight", 0)[0]!.value).toBe(80);
    expect(metricSeries(user.id, "note", 0).length).toBe(0);
  });

  it("deleting a data key clears its history (no orphan trail)", () => {
    const user = createUser("MetricDel", "metricdel@example.com", "password123")!;
    setCustomData(user.id, "steps", 5000);
    expect(metricSeries(user.id, "steps", 0).length).toBe(1);
    deleteCustomData(user.id, "steps");
    expect(metricSeries(user.id, "steps", 0).length).toBe(0);
  });
});

describe("#74 habitShape (pure wall shapes from done-days)", () => {
  // 2026-07-01 is a Wednesday; its Monday-start week is Jun 29 – Jul 5.
  const T = "2026-07-01";
  it("week / month / streak for a 3-day run ending today", () => {
    const s = habitShape(new Set(["2026-06-29", "2026-06-30", "2026-07-01"]), T);
    expect(s.week).toBe("x x x . . . .");
    expect(s.month.split(" ")).toHaveLength(31); // July grid
    expect(s.month.startsWith("x .")).toBe(true); // only Jul 1 done this month
    expect(s.streak).toBe(3);
  });
  it("today not marked yet → the streak ends yesterday and survives", () => {
    const s = habitShape(new Set(["2026-06-29", "2026-06-30"]), T);
    expect(s.streak).toBe(2);
    expect(s.week).toBe("x x . . . . .");
  });
  it("a gap breaks the streak; last week's days stay out of this week's row", () => {
    const s = habitShape(new Set(["2026-06-28", "2026-07-01"]), T); // Sun (prev week) + Wed
    expect(s.streak).toBe(1);
    expect(s.week).toBe(". . x . . . .");
  });
  it("empty history → all dots, streak 0", () => {
    const s = habitShape(new Set(), T);
    expect(s.week).toBe(". . . . . . .");
    expect(s.streak).toBe(0);
  });
});
