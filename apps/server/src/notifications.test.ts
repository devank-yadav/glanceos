import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DeviceRow } from "./devices";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-notif-"));
const { checkDeviceForAlerts } = await import("./notifications");

const OPTS = { offlineMs: 30 * 60_000, lowBatteryPct: 15 };
const NOW = 1_780_000_000_000;
const dev = (over: Partial<DeviceRow>): DeviceRow => ({
  id: "d1", secret: "s", name: "Lobby TV", claim_code: null, claimed_at: NOW, layout_id: null, user_id: "u1", org_id: "o1",
  profile: "{}", created_at: NOW, refresh_seconds: 300, battery: null, rssi: null,
  firmware: null, last_seen: NOW, timezone: null, render_opts: "{}", group_id: null,
  location_name: null, latitude: null, longitude: null, prev_battery: null, prev_battery_at: null, battery_at: null, ...over,
});

describe("checkDeviceForAlerts", () => {
  it("flags a device not seen past the threshold AND not connected", () => {
    const a = checkDeviceForAlerts(dev({ last_seen: NOW - 40 * 60_000 }), NOW, false, OPTS);
    expect(a?.kind).toBe("offline");
    expect(a?.dedupeKey).toBe(`offline:${Math.floor(NOW / 86_400_000)}`);
  });
  it("does NOT flag offline if the device is currently connected (SSE)", () => {
    expect(checkDeviceForAlerts(dev({ last_seen: NOW - 40 * 60_000 }), NOW, true, OPTS)).toBeNull();
  });
  it("does NOT flag a recently-seen device", () => {
    expect(checkDeviceForAlerts(dev({ last_seen: NOW - 60_000 }), NOW, false, OPTS)).toBeNull();
  });
  it("flags low battery", () => {
    expect(checkDeviceForAlerts(dev({ battery: 9 }), NOW, true, OPTS)?.kind).toBe("low_battery");
  });
  it("offline takes priority over low battery", () => {
    expect(checkDeviceForAlerts(dev({ last_seen: NOW - 40 * 60_000, battery: 9 }), NOW, false, OPTS)?.kind).toBe("offline");
  });
  it("a never-seen device is not flagged", () => {
    expect(checkDeviceForAlerts(dev({ last_seen: null }), NOW, false, OPTS)).toBeNull();
  });
});
