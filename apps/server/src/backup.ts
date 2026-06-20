import { db } from "./db";

// A plain-JSON export of a user's own data — boards, screens, playlists,
// connection config (NO secrets), and tasks. Restore is a future feature; this
// is "download my stuff" / disaster-recovery insurance. Secrets are never
// exported (connections must be reconnected after a restore).
export function dumpUser(userId: string): Record<string, unknown> {
  return {
    format: "glanceos-backup",
    version: 1,
    exportedAt: Date.now(),
    layouts: db.prepare("SELECT id, name, version, document, created_at FROM layouts WHERE user_id = ?").all(userId),
    devices: db.prepare("SELECT id, name, profile, refresh_seconds, timezone, render_opts, created_at FROM devices WHERE user_id = ?").all(userId),
    playlists: db.prepare("SELECT id, name, interval_seconds FROM playlists WHERE user_id = ?").all(userId),
    connections: db.prepare("SELECT id, provider, label, auth_kind, config, status FROM connections WHERE user_id = ?").all(userId),
    tasks: db.prepare("SELECT list_id, text, done, created_at FROM tasks WHERE user_id = ?").all(userId),
  };
}
