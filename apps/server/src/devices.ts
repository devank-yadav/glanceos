import { timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { newClaimCode, newDeviceId, newDeviceSecret, normalizeClaimCode } from "./ids";
import { getLayout } from "./layouts";

export interface DeviceRow {
  id: string;
  secret: string;
  name: string | null;
  claim_code: string | null;
  claimed_at: number | null;
  layout_id: number | null;
  user_id: string | null; // claimer (created_by)
  org_id: string | null; // owning org — the access boundary
  profile: string;
  created_at: number;
  refresh_seconds: number;
  battery: number | null;
  rssi: number | null;
  firmware: string | null;
  last_seen: number | null;
  timezone: string | null;
  render_opts: string;
  group_id: number | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  prev_battery: number | null;
  prev_battery_at: number | null;
  battery_at: number | null; // when the CURRENT battery level was first reached (frozen until it steps)
}

export interface DeviceProfile {
  width: number;
  height: number;
  rotation: number;
  colorDepth: string;
  tvMode?: boolean;
  safeArea?: { top: number; right: number; bottom: number; left: number };
  burnIn?: { pixelShift: boolean; dim: boolean; screensaverAfterMin: number };
  wake?: { startMin: number; endMin: number; daysMask: number };
  quietHours?: { startMin: number; endMin: number; daysMask: number }; // v6.1 soft-dim window
  lowBattery?: { layoutId: number; pct: number }; // #58 — swap to this board at/below pct% battery
  platform?: string;
  nativeVersion?: string;
}

// A native shell self-reports what it is; keep it short + plain so it can't be
// used to smuggle markup into the fleet dashboard.
const shortLabel = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().replace(/[^\w.+-]/g, "").slice(0, max) || undefined : undefined;

const clamp = (n: unknown, lo: number, hi: number, dflt = 0): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;

export function deviceProfile(device: DeviceRow): DeviceProfile {
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(device.profile) as Record<string, unknown>;
  } catch {
    /* malformed profile → defaults below */
  }
  const out: DeviceProfile = {
    width: typeof p.width === "number" && p.width > 0 ? Math.round(p.width) : 800,
    height: typeof p.height === "number" && p.height > 0 ? Math.round(p.height) : 480,
    rotation: typeof p.rotation === "number" ? p.rotation : 0,
    colorDepth: typeof p.colorDepth === "string" ? p.colorDepth : "mono",
  };
  if (p.tvMode === true) out.tvMode = true;
  if (p.safeArea && typeof p.safeArea === "object") {
    const s = p.safeArea as Record<string, unknown>;
    out.safeArea = { top: clamp(s.top, 0, 25), right: clamp(s.right, 0, 25), bottom: clamp(s.bottom, 0, 25), left: clamp(s.left, 0, 25) };
  }
  if (p.burnIn && typeof p.burnIn === "object") {
    const b = p.burnIn as Record<string, unknown>;
    out.burnIn = { pixelShift: b.pixelShift === true, dim: b.dim === true, screensaverAfterMin: clamp(b.screensaverAfterMin, 0, 1440) };
  }
  if (p.wake && typeof p.wake === "object") {
    const w = p.wake as Record<string, unknown>;
    out.wake = { startMin: clamp(w.startMin, 0, 1439), endMin: clamp(w.endMin, 0, 1439), daysMask: clamp(w.daysMask, 0, 127, 127) };
  }
  if (p.quietHours && typeof p.quietHours === "object") {
    const q = p.quietHours as Record<string, unknown>;
    out.quietHours = { startMin: clamp(q.startMin, 0, 1439), endMin: clamp(q.endMin, 0, 1439), daysMask: clamp(q.daysMask, 0, 127, 127) };
  }
  if (p.lowBattery && typeof p.lowBattery === "object") {
    const lb = p.lowBattery as Record<string, unknown>;
    if (typeof lb.layoutId === "number" && lb.layoutId > 0) out.lowBattery = { layoutId: Math.round(lb.layoutId), pct: clamp(lb.pct, 1, 99, 15) };
  }
  const platform = shortLabel(p.platform, 24);
  if (platform) out.platform = platform;
  const nativeVersion = shortLabel(p.nativeVersion, 24);
  if (nativeVersion) out.nativeVersion = nativeVersion;
  return out;
}

/** Merge TV settings into a device's stored profile JSON (config-plane writer). */
export function setDeviceTvSettings(
  id: string,
  orgId: string,
  patch: { tvMode?: boolean; safeArea?: DeviceProfile["safeArea"]; burnIn?: DeviceProfile["burnIn"]; wake?: DeviceProfile["wake"] | null; quietHours?: DeviceProfile["quietHours"] | null },
): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.org_id !== orgId) return null;
  let p: Record<string, unknown> = {};
  try { p = JSON.parse(device.profile) as Record<string, unknown>; } catch { /* defaults */ }
  if (patch.tvMode !== undefined) p.tvMode = patch.tvMode;
  if (patch.safeArea !== undefined) p.safeArea = patch.safeArea;
  if (patch.burnIn !== undefined) p.burnIn = patch.burnIn;
  if (patch.wake !== undefined) { if (patch.wake === null) delete p.wake; else p.wake = patch.wake; }
  if (patch.quietHours !== undefined) { if (patch.quietHours === null) delete p.quietHours; else p.quietHours = patch.quietHours; }
  db.prepare("UPDATE devices SET profile = ? WHERE id = ?").run(JSON.stringify(p), id);
  return getDevice(id) ?? null;
}

/** #58 — set/clear the low-battery board swap on a device's profile (layoutId null clears it). */
export function setLowBatterySwap(id: string, orgId: string, layoutId: number | null, pct = 15): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.org_id !== orgId) return null;
  let p: Record<string, unknown> = {};
  try { p = JSON.parse(device.profile) as Record<string, unknown>; } catch { /* defaults */ }
  if (layoutId == null) delete p.lowBattery;
  else p.lowBattery = { layoutId: Math.round(layoutId), pct: clamp(pct, 1, 99, 15) };
  db.prepare("UPDATE devices SET profile = ? WHERE id = ?").run(JSON.stringify(p), id);
  return getDevice(id) ?? null;
}

// Validate telemetry: out-of-range / junk values become null so COALESCE keeps
// the last good reading (a bogus battery=999 never overwrites a real one).
const cleanBattery = (v?: number): number | null => (typeof v === "number" && v >= 0 && v <= 100 ? Math.round(v) : null);
const cleanRssi = (v?: number): number | null => (typeof v === "number" && v >= -120 && v <= 0 ? Math.round(v) : null);
const cleanFirmware = (v?: string): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/[^\x20-\x7e]/g, "").slice(0, 32).trim();
  return s || null;
};

/** Record a device "checking in" (display poll) with optional telemetry. */
export function recordTelemetry(
  id: string,
  t: { battery?: number; rssi?: number; firmware?: string },
): void {
  const b = cleanBattery(t.battery);
  // v6.1 forecast: anchor each distinct battery level to WHEN IT WAS FIRST REACHED
  // (battery_at), frozen across flat polls. When the level steps, the prior level's
  // (value, first-seen) rolls into prev_*, and the new level's anchor is stamped now.
  // The forecast then spans first-reached(prev) → first-reached(cur) — a real drain
  // window that doesn't stretch every time an unchanged battery checks in (the v6.1.0
  // bug, where the denominator used the ever-advancing last_seen).
  if (b != null) {
    const cur = db.prepare("SELECT battery, battery_at, last_seen FROM devices WHERE id = ?").get(id) as { battery: number | null; battery_at: number | null; last_seen: number | null } | undefined;
    const now = Date.now();
    if (!cur || cur.battery == null) {
      db.prepare("UPDATE devices SET battery_at = ? WHERE id = ?").run(now, id); // first-ever reading → start the clock
    } else if (cur.battery !== b) {
      db.prepare("UPDATE devices SET prev_battery = ?, prev_battery_at = ?, battery_at = ? WHERE id = ?")
        .run(cur.battery, cur.battery_at ?? cur.last_seen ?? now, now, id);
    } // flat poll → leave battery_at frozen
  }
  db.prepare(
    "UPDATE devices SET last_seen = ?, battery = COALESCE(?, battery), rssi = COALESCE(?, rssi), firmware = COALESCE(?, firmware) WHERE id = ?",
  ).run(
    Date.now(),
    b,
    cleanRssi(t.rssi),
    cleanFirmware(t.firmware),
    id,
  );
}

export interface BatteryForecast {
  battery: number;
  daysRemaining: number | null; // null when we can't estimate yet (collecting / charging)
  basis: "ok" | "charging" | "collecting";
}
/** Days-to-empty from the two-point drain on the device row. Pure (reads the row). */
export function batteryForecast(d: DeviceRow): BatteryForecast | null {
  if (d.battery == null) return null;
  if (d.prev_battery == null || d.prev_battery_at == null || d.battery_at == null) {
    return { battery: d.battery, daysRemaining: null, basis: "collecting" };
  }
  const dropPct = d.prev_battery - d.battery; // positive = discharging
  const dMs = d.battery_at - d.prev_battery_at; // first-reached(prev) → first-reached(cur); frozen across flat polls
  if (dMs <= 0) return { battery: d.battery, daysRemaining: null, basis: "collecting" };
  if (dropPct <= 0) return { battery: d.battery, daysRemaining: null, basis: "charging" }; // flat or charging → no drain
  const msLeft = (d.battery / dropPct) * dMs; // remaining %  ÷  (% per ms)
  return { battery: d.battery, daysRemaining: Math.max(0, Math.round((msLeft / 86_400_000) * 10) / 10), basis: "ok" };
}

export function setRefresh(id: string, seconds: number, orgId: string): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.org_id !== orgId) return null;
  db.prepare("UPDATE devices SET refresh_seconds = ? WHERE id = ?").run(
    Math.max(5, Math.min(86_400, Math.round(seconds))),
    id,
  );
  return getDevice(id) ?? null;
}

/** Every claimed device across all users — for the background alert sweep. */
export function allClaimedDevices(): DeviceRow[] {
  return db.prepare("SELECT * FROM devices WHERE claimed_at IS NOT NULL").all() as DeviceRow[];
}

// Valid IANA zone names (Node 24's Intl), so a bogus/injected string can't be
// stored and later fed to schedule/wall-clock formatting.
const VALID_TZ = new Set<string>(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []);
export function isValidTimezone(tz: string): boolean {
  if (VALID_TZ.size) return VALID_TZ.has(tz) || tz === "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } // fallback
}

/** Set a device's IANA timezone for schedule wall-clock (null/"" → server tz). */
export function setDeviceTimezone(id: string, tz: string | null, orgId: string): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.org_id !== orgId) return null;
  const trimmed = tz?.trim() || null;
  if (trimmed && !isValidTimezone(trimmed)) return null; // reject a bogus zone (caller → 400/404)
  db.prepare("UPDATE devices SET timezone = ? WHERE id = ?").run(trimmed, id);
  return getDevice(id) ?? null;
}

/** Set (or clear, with null) a screen's location — weather/astro blocks without
 *  their own coordinates inherit it. Coordinates are validated to a sane range. */
export function setDeviceLocation(
  id: string,
  loc: { name: string; latitude: number; longitude: number } | null,
  orgId: string,
): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.org_id !== orgId) return null;
  if (loc && (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude) ||
    Math.abs(loc.latitude) > 90 || Math.abs(loc.longitude) > 180)) return null;
  db.prepare("UPDATE devices SET location_name = ?, latitude = ?, longitude = ? WHERE id = ?")
    .run(loc ? loc.name.trim().slice(0, 120) : null, loc?.latitude ?? null, loc?.longitude ?? null, id);
  return getDevice(id) ?? null;
}

/** Persist a device's e-ink render options (already-validated JSON object). */
export function setRenderOpts(id: string, opts: Record<string, unknown>, orgId: string): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.org_id !== orgId) return null;
  db.prepare("UPDATE devices SET render_opts = ? WHERE id = ?").run(JSON.stringify(opts), id);
  return getDevice(id) ?? null;
}

export function registerDevice(profile: unknown): {
  deviceId: string;
  deviceSecret: string;
  claimCode: string;
} {
  const id = newDeviceId();
  const secret = newDeviceSecret();
  // Retry on the (unlikely) claim-code collision — UNIQUE constraint backs this up.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newClaimCode();
    try {
      db.prepare(
        "INSERT INTO devices (id, secret, claim_code, profile, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(id, secret, code, JSON.stringify(profile ?? {}), Date.now());
      return { deviceId: id, deviceSecret: secret, claimCode: code };
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
  throw new Error("unreachable");
}

export function getDevice(id: string): DeviceRow | undefined {
  return db.prepare("SELECT * FROM devices WHERE id = ?").get(id) as DeviceRow | undefined;
}

export function authDevice(id: string | undefined, secret: string | undefined): DeviceRow | null {
  if (!id || !secret) return null;
  const device = getDevice(id);
  if (!device) return null;
  const a = Buffer.from(device.secret);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return device;
}

export function findByClaimCode(code: string): DeviceRow | undefined {
  return db
    .prepare("SELECT * FROM devices WHERE claim_code = ?")
    .get(normalizeClaimCode(code)) as DeviceRow | undefined;
}

/**
 * Claiming binds the device to the claiming user. It deliberately assigns NO
 * layout — "claimed, pick a setup" is a first-class state, and the picker in
 * the config app decides what the screen shows.
 */
export function claimDevice(code: string, name: string | undefined, userId: string, orgId: string): DeviceRow | null {
  const device = findByClaimCode(code);
  if (!device || device.claimed_at) return null;
  db.prepare("UPDATE devices SET name = ?, claimed_at = ?, user_id = ?, org_id = ? WHERE id = ?").run(
    name?.trim() || "New screen",
    Date.now(),
    userId, // claimer (created_by)
    orgId, // owning org
    device.id,
  );
  return getDevice(device.id) ?? null;
}

export function listDevices(orgId: string): DeviceRow[] {
  return db
    .prepare("SELECT * FROM devices WHERE org_id = ? ORDER BY created_at LIMIT 1000") // safety cap
    .all(orgId) as DeviceRow[];
}

export function updateDevice(
  id: string,
  patch: { name?: string; layoutId?: number | null },
  orgId: string,
): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.org_id !== orgId) return null;
  if (patch.layoutId !== undefined && patch.layoutId !== null) {
    const layout = getLayout(patch.layoutId);
    if (!layout || layout.orgId !== orgId) return null; // builtins/other-org boards must be imported, not assigned
  }
  db.prepare(
    "UPDATE devices SET name = COALESCE(?, name), layout_id = CASE WHEN ? THEN ? ELSE layout_id END WHERE id = ?",
  ).run(patch.name ?? null, patch.layoutId !== undefined ? 1 : 0, patch.layoutId ?? null, id);
  return getDevice(id) ?? null;
}

export function deleteDevice(id: string, orgId: string): boolean {
  // The setup (layout) survives on purpose — it can be re-attached to another screen.
  const result = db.prepare("DELETE FROM devices WHERE id = ? AND org_id = ?").run(id, orgId);
  return result.changes > 0;
}

export function devicesUsingLayout(layoutId: number): DeviceRow[] {
  return db.prepare("SELECT * FROM devices WHERE layout_id = ?").all(layoutId) as DeviceRow[];
}

export function devicesOwnedBy(userId: string): DeviceRow[] {
  return db.prepare("SELECT * FROM devices WHERE user_id = ?").all(userId) as DeviceRow[];
}
