import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-devices-"));
const { deviceProfile, batteryForecast } = await import("./devices");
import type { DeviceRow } from "./devices";

const row = (profile: string): DeviceRow => ({ profile } as unknown as DeviceRow);
const battRow = (over: Partial<DeviceRow>): DeviceRow => ({ profile: "{}", ...over } as unknown as DeviceRow);

describe("deviceProfile — TV settings (v1.7)", () => {
  it("reads tvMode / safeArea / burnIn / wake", () => {
    const p = deviceProfile(row(JSON.stringify({
      width: 1920, height: 1080, tvMode: true,
      safeArea: { top: 5, right: 4, bottom: 3, left: 2 },
      burnIn: { pixelShift: true, dim: false, screensaverAfterMin: 30 },
      wake: { startMin: 420, endMin: 1380, daysMask: 62 },
    })));
    expect(p.tvMode).toBe(true);
    expect(p.safeArea).toEqual({ top: 5, right: 4, bottom: 3, left: 2 });
    expect(p.burnIn?.screensaverAfterMin).toBe(30);
    expect(p.wake?.startMin).toBe(420);
  });

  it("clamps out-of-range safe-area and omits TV fields when absent", () => {
    const p = deviceProfile(row(JSON.stringify({ width: 800, height: 480, safeArea: { top: 99, right: -5, bottom: 0, left: 0 } })));
    expect(p.tvMode).toBeUndefined();
    expect(p.safeArea).toEqual({ top: 25, right: 0, bottom: 0, left: 0 });
  });

  it("defaults gracefully on malformed profile JSON", () => {
    const p = deviceProfile(row("{not json"));
    expect(p.width).toBe(800);
    expect(p.tvMode).toBeUndefined();
  });
});

describe("batteryForecast (v6.1)", () => {
  const DAY = 86_400_000;
  it("returns null with no battery reading", () => {
    expect(batteryForecast(battRow({ battery: null }))).toBeNull();
  });
  it("collecting — only one reading so far", () => {
    expect(batteryForecast(battRow({ battery: 80, prev_battery: null, prev_battery_at: null, last_seen: 1_000 }))?.basis).toBe("collecting");
  });
  it("ok — projects days from a two-point drain", () => {
    // 90% → 80% over 2 days = 5%/day; 80% left → 16 days.
    const f = batteryForecast(battRow({ battery: 80, prev_battery: 90, prev_battery_at: 0, last_seen: 2 * DAY }));
    expect(f?.basis).toBe("ok");
    expect(f?.daysRemaining).toBe(16);
  });
  it("charging — level rose, so no drain estimate", () => {
    const f = batteryForecast(battRow({ battery: 95, prev_battery: 80, prev_battery_at: 0, last_seen: DAY }));
    expect(f?.basis).toBe("charging");
    expect(f?.daysRemaining).toBeNull();
  });
});
