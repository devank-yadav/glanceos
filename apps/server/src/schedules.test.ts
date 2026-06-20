import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// db.ts opens GLANCEOS_DATA_DIR on import — point it at a throwaway dir first.
process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-sched-"));
const { wallClock } = await import("./schedules");

describe("wallClock — weekday + minute-of-day in an IANA tz", () => {
  // 2026-06-20T12:00:00Z is a Saturday; June → New York is UTC-4.
  const t = Date.parse("2026-06-20T12:00:00Z");

  it("UTC", () => {
    expect(wallClock(t, "UTC")).toEqual({ weekday: 6, minute: 12 * 60 });
  });
  it("America/New_York (DST offset applied)", () => {
    expect(wallClock(t, "America/New_York")).toEqual({ weekday: 6, minute: 8 * 60 });
  });
  it("crosses the date line backwards into Friday", () => {
    // 03:00Z Sat in Los Angeles (UTC-7) is 20:00 Friday
    const sat3 = Date.parse("2026-06-20T03:00:00Z");
    expect(wallClock(sat3, "America/Los_Angeles")).toEqual({ weekday: 5, minute: 20 * 60 });
  });
  it("a bogus tz falls back to server local without throwing", () => {
    const r = wallClock(t, "Not/AZone");
    expect(r.weekday).toBeGreaterThanOrEqual(0);
    expect(r.minute).toBeGreaterThanOrEqual(0);
    expect(r.minute).toBeLessThan(1440);
  });
});
