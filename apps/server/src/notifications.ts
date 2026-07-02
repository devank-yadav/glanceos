import { db } from "./db";
import { allClaimedDevices, type DeviceRow } from "./devices";
import { sendOfflineEmail } from "./emails";
import { isConnected } from "./hub";
import { listMembers } from "./orgs";

// In-app alerts: a background tick flags screens that fell offline or are low on
// battery. Deduped to one per device per day (per kind) so it never spams; the
// partial unique index in 007 is the concurrency backstop.

export interface NotificationRow {
  id: number; user_id: string; device_id: string | null; kind: string;
  message: string; dedupe_key: string; created_at: number; read_at: number | null; archived_at: number | null;
}
export interface Notification {
  id: number; deviceId: string | null; kind: string; message: string; createdAt: number; read: boolean; archived: boolean;
}

const toNotification = (r: NotificationRow): Notification => ({
  id: r.id, deviceId: r.device_id, kind: r.kind, message: r.message, createdAt: r.created_at, read: r.read_at !== null, archived: r.archived_at !== null,
});

/** The bell feed: ACTIVE (un-archived) notifications only. */
export function listNotifications(userId: string, unreadOnly = false): Notification[] {
  const rows = db.prepare(
    `SELECT * FROM notifications WHERE user_id = ? AND archived_at IS NULL ${unreadOnly ? "AND read_at IS NULL" : ""} ORDER BY created_at DESC LIMIT 50`,
  ).all(userId) as NotificationRow[];
  return rows.map(toNotification);
}

export function unreadCount(userId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL AND archived_at IS NULL").get(userId) as { n: number }).n;
}

// #43 — the archive: full-history browse + substring search. `all` spans active AND
// archived rows (the archive view is the history, not just what was cleared); the
// default stays bell-scoped (active only). LIKE special chars are escaped so a
// literal "%" in a query can't wildcard. `before` (created_at) pages older results.
export function searchNotifications(userId: string, opts: { q?: string; all?: boolean; before?: number; limit?: number } = {}): Notification[] {
  const lim = Math.min(Math.max(1, opts.limit ?? 50), 200);
  const q = (opts.q ?? "").trim();
  const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const rows = db.prepare(
    `SELECT * FROM notifications WHERE user_id = ?
       ${opts.all ? "" : "AND archived_at IS NULL"}
       ${q ? "AND (message LIKE ? ESCAPE '\\' OR kind LIKE ? ESCAPE '\\')" : ""}
       ${opts.before ? "AND created_at < ?" : ""}
     ORDER BY created_at DESC LIMIT ?`,
  ).all(userId, ...(q ? [like, like] : []), ...(opts.before ? [opts.before] : []), lim) as NotificationRow[];
  return rows.map(toNotification);
}

/** #43 — retention: archived rows older than the cutoff are finally dropped. */
export function pruneNotifications(cutoffMs: number): void {
  db.prepare("DELETE FROM notifications WHERE archived_at IS NOT NULL AND archived_at < ?").run(cutoffMs);
}

export function markRead(id: number, userId: string): boolean {
  return db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL").run(Date.now(), id, userId).changes > 0;
}
export function markAllRead(userId: string): void {
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(Date.now(), userId);
}

/** #43 — "Clear all" now archives: tucks every active notification away (and marks it
 *  read) instead of destroying history. Dedupe keys keep working across the archive —
 *  a same-day repeat stays quiet after a clear, which is calmer than delete-then-recreate. */
export function archiveAll(userId: string): void {
  const now = Date.now();
  db.prepare("UPDATE notifications SET archived_at = ?, read_at = COALESCE(read_at, ?) WHERE user_id = ? AND archived_at IS NULL").run(now, now, userId);
}

/** Create unless one already exists for this (user, dedupe_key) (read or unread).
 *  deviceId may be null for account-level alerts (e.g. a connection error). */
export function createIfAbsent(userId: string, deviceId: string | null, kind: string, message: string, dedupeKey: string): boolean {
  const exists = db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND dedupe_key = ? LIMIT 1").get(userId, dedupeKey);
  if (exists) return false;
  const r = db.prepare(
    "INSERT OR IGNORE INTO notifications (user_id, device_id, kind, message, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(userId, deviceId, kind, message, dedupeKey, Date.now());
  return r.changes > 0;
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
    if (alert) {
      const created = createIfAbsent(d.user_id, d.id, alert.kind, alert.message, alert.dedupeKey);
      // On a newly-flagged offline (once/day via the dedupe), email the team so it's seen
      // off-app. Members with edit rights are the ones who can act on it.
      if (created && alert.kind === "offline" && d.org_id) {
        for (const m of listMembers(d.org_id)) {
          if (m.role === "owner" || m.role === "admin" || m.role === "editor") void sendOfflineEmail(m.email, d.name ?? "A screen");
        }
      }
    }
  }
}
