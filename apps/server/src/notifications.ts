import { db } from "./db";
import { allClaimedDevices, type DeviceRow } from "./devices";
import { isConnected } from "./hub";

// In-app alerts: a background tick flags screens that fell offline or are low on
// battery. Deduped to one per device per day (per kind) so it never spams; the
// partial unique index in 007 is the concurrency backstop.

export interface NotificationRow {
  id: number; user_id: string; device_id: string | null; kind: string;
  message: string; dedupe_key: string; created_at: number; read_at: number | null;
}
export interface Notification {
  id: number; deviceId: string | null; kind: string; message: string; createdAt: number; read: boolean;
}

const toNotification = (r: NotificationRow): Notification => ({
  id: r.id, deviceId: r.device_id, kind: r.kind, message: r.message, createdAt: r.created_at, read: r.read_at !== null,
});

export function listNotifications(userId: string, unreadOnly = false): Notification[] {
  const rows = db.prepare(
    `SELECT * FROM notifications WHERE user_id = ? ${unreadOnly ? "AND read_at IS NULL" : ""} ORDER BY created_at DESC LIMIT 50`,
  ).all(userId) as NotificationRow[];
  return rows.map(toNotification);
}

export function unreadCount(userId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(userId) as { n: number }).n;
}

export function markRead(id: number, userId: string): boolean {
  return db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL").run(Date.now(), id, userId).changes > 0;
}
export function markAllRead(userId: string): void {
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(Date.now(), userId);
}

/** Remove every notification for a user (the "Clear all" action). */
export function clearAll(userId: string): void {
  db.prepare("DELETE FROM notifications WHERE user_id = ?").run(userId);
}

/** Create unless one already exists for this (user, dedupe_key) (read or unread).
 *  deviceId may be null for account-level alerts (e.g. a connection error). */
export function createIfAbsent(userId: string, deviceId: string | null, kind: string, message: string, dedupeKey: string): void {
  const exists = db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND dedupe_key = ? LIMIT 1").get(userId, dedupeKey);
  if (exists) return;
  db.prepare(
    "INSERT OR IGNORE INTO notifications (user_id, device_id, kind, message, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(userId, deviceId, kind, message, dedupeKey, Date.now());
}

const dayOf = (now = Date.now()): number => Math.floor(now / 86_400_000);

/** A screen was just claimed (one-time). */
export function notifyClaimed(userId: string, deviceId: string, name: string | null): void {
  createIfAbsent(userId, deviceId, "claimed", `${name ?? "A screen"} was connected`, `claimed:${deviceId}`);
}

/** The board a screen shows was changed (once per target per day). */
export function notifyContentChanged(userId: string, deviceId: string, name: string | null, what: string): void {
  createIfAbsent(userId, deviceId, "content", `${name ?? "A screen"} now shows ${what}`, `content:${what}:${dayOf()}`);
}

/** An integration/connection went unhealthy (account-level; once per state per day). */
export function notifyConnectionIssue(userId: string, label: string, status: "needs_auth" | "error"): void {
  const msg = status === "needs_auth" ? `${label} needs to be re-authorized` : `${label} stopped responding`;
  createIfAbsent(userId, null, `conn_${status}`, msg, `conn:${label}:${status}:${dayOf()}`);
}

export interface AlertOpts { offlineMs: number; lowBatteryPct: number }

/** Pure: which alert (if any) a device warrants right now. Offline takes priority. */
export function checkDeviceForAlerts(device: DeviceRow, now: number, isOnline: boolean, opts: AlertOpts): { kind: string; message: string; dedupeKey: string } | null {
  const day = Math.floor(now / 86_400_000);
  const name = device.name ?? "A screen";
  if (device.last_seen != null && now - device.last_seen > opts.offlineMs && !isOnline) {
    const mins = Math.round((now - device.last_seen) / 60_000);
    return { kind: "offline", message: `${name} has been offline for ${mins >= 120 ? `${Math.round(mins / 60)}h` : `${mins}m`}`, dedupeKey: `offline:${day}` };
  }
  if (device.battery != null && device.battery < opts.lowBatteryPct) {
    return { kind: "low_battery", message: `${name} battery is low (${device.battery}%)`, dedupeKey: `low_battery:${day}` };
  }
  return null;
}

// Remembered presence per device so the sweep can spot a screen coming back.
// In-memory by design: a restart simply re-baselines (no spurious "back online").
const lastOnline = new Map<string, boolean>();

/** Background sweep across every user's claimed devices. */
export function runAlertChecks(now = Date.now()): void {
  const opts: AlertOpts = {
    offlineMs: (Number(process.env.GLANCEOS_OFFLINE_MINUTES) || 30) * 60_000,
    lowBatteryPct: Number(process.env.GLANCEOS_LOW_BATTERY_PCT) || 15,
  };
  for (const d of allClaimedDevices()) {
    if (!d.user_id) continue;
    const online = isConnected(d.id);
    // Recovery: was known-offline, now connected → reassuring one-per-day ping.
    if (lastOnline.get(d.id) === false && online) {
      createIfAbsent(d.user_id, d.id, "online", `${d.name ?? "A screen"} is back online`, `online:${d.id}:${Math.floor(now / 86_400_000)}`);
    }
    lastOnline.set(d.id, online);
    const alert = checkDeviceForAlerts(d, now, online, opts);
    if (alert) createIfAbsent(d.user_id, d.id, alert.kind, alert.message, alert.dedupeKey);
  }
}
