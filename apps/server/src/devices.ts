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
  user_id: string | null;
  profile: string;
  created_at: number;
  refresh_seconds: number;
  playlist_id: number | null;
  battery: number | null;
  rssi: number | null;
  firmware: string | null;
  last_seen: number | null;
}

export interface DeviceProfile {
  width: number;
  height: number;
  rotation: number;
  colorDepth: string;
}

export function deviceProfile(device: DeviceRow): DeviceProfile {
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(device.profile) as Record<string, unknown>;
  } catch {
    /* malformed profile → defaults below */
  }
  return {
    width: typeof p.width === "number" && p.width > 0 ? Math.round(p.width) : 800,
    height: typeof p.height === "number" && p.height > 0 ? Math.round(p.height) : 480,
    rotation: typeof p.rotation === "number" ? p.rotation : 0,
    colorDepth: typeof p.colorDepth === "string" ? p.colorDepth : "mono",
  };
}

/** Record a device "checking in" (display poll) with optional telemetry. */
export function recordTelemetry(
  id: string,
  t: { battery?: number; rssi?: number; firmware?: string },
): void {
  db.prepare(
    "UPDATE devices SET last_seen = ?, battery = COALESCE(?, battery), rssi = COALESCE(?, rssi), firmware = COALESCE(?, firmware) WHERE id = ?",
  ).run(
    Date.now(),
    t.battery ?? null,
    t.rssi ?? null,
    t.firmware ?? null,
    id,
  );
}

export function setRefresh(id: string, seconds: number, userId: string): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.user_id !== userId) return null;
  db.prepare("UPDATE devices SET refresh_seconds = ? WHERE id = ?").run(
    Math.max(5, Math.min(86_400, Math.round(seconds))),
    id,
  );
  return getDevice(id) ?? null;
}

/** Assign a playlist (or null) to a device; null restores single-layout mode. */
export function setDevicePlaylist(id: string, playlistId: number | null, userId: string): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.user_id !== userId) return null;
  db.prepare("UPDATE devices SET playlist_id = ? WHERE id = ?").run(playlistId, id);
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
export function claimDevice(code: string, name: string | undefined, userId: string): DeviceRow | null {
  const device = findByClaimCode(code);
  if (!device || device.claimed_at) return null;
  db.prepare("UPDATE devices SET name = ?, claimed_at = ?, user_id = ? WHERE id = ?").run(
    name?.trim() || "New screen",
    Date.now(),
    userId,
    device.id,
  );
  return getDevice(device.id) ?? null;
}

export function listDevices(userId: string): DeviceRow[] {
  return db
    .prepare("SELECT * FROM devices WHERE user_id = ? ORDER BY created_at")
    .all(userId) as DeviceRow[];
}

export function updateDevice(
  id: string,
  patch: { name?: string; layoutId?: number | null },
  userId: string,
): DeviceRow | null {
  const device = getDevice(id);
  if (!device || device.user_id !== userId) return null;
  if (patch.layoutId !== undefined && patch.layoutId !== null) {
    const layout = getLayout(patch.layoutId);
    if (!layout || layout.userId !== userId) return null; // builtins must be imported, not assigned
  }
  db.prepare(
    "UPDATE devices SET name = COALESCE(?, name), layout_id = CASE WHEN ? THEN ? ELSE layout_id END WHERE id = ?",
  ).run(patch.name ?? null, patch.layoutId !== undefined ? 1 : 0, patch.layoutId ?? null, id);
  return getDevice(id) ?? null;
}

export function deleteDevice(id: string, userId: string): boolean {
  // The setup (layout) survives on purpose — it can be re-attached to another screen.
  const result = db.prepare("DELETE FROM devices WHERE id = ? AND user_id = ?").run(id, userId);
  return result.changes > 0;
}

export function devicesUsingLayout(layoutId: number): DeviceRow[] {
  return db.prepare("SELECT * FROM devices WHERE layout_id = ?").all(layoutId) as DeviceRow[];
}

export function devicesOwnedBy(userId: string): DeviceRow[] {
  return db.prepare("SELECT * FROM devices WHERE user_id = ?").all(userId) as DeviceRow[];
}
