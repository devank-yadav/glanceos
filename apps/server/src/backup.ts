import { randomUUID } from "node:crypto";
import { Layout } from "@glanceos/schema";
import { db } from "./db";
import { createLayout } from "./layouts";

// A plain-JSON export of a user's own data — boards, screens, playlists (with
// their items), connection config (NO secrets), and tasks. Secrets are never
// exported; connections must be reconnected after a restore.
export function dumpUser(userId: string): Record<string, unknown> {
  return {
    format: "glanceos-backup",
    version: 1,
    exportedAt: Date.now(),
    layouts: db.prepare("SELECT id, name, version, document, created_at FROM layouts WHERE user_id = ?").all(userId),
    devices: db.prepare("SELECT id, name, profile, refresh_seconds, timezone, render_opts, created_at FROM devices WHERE user_id = ?").all(userId),
    playlists: db.prepare("SELECT id, name, interval_seconds FROM playlists WHERE user_id = ?").all(userId),
    playlistItems: db.prepare(
      "SELECT pi.playlist_id, pi.position, pi.layout_id FROM playlist_items pi JOIN playlists p ON p.id = pi.playlist_id WHERE p.user_id = ?",
    ).all(userId),
    connections: db.prepare("SELECT id, provider, label, auth_kind, config, status FROM connections WHERE user_id = ?").all(userId),
    tasks: db.prepare("SELECT list_id, text, done, created_at FROM tasks WHERE user_id = ?").all(userId),
  };
}

export interface ImportResult { layouts: number; playlists: number; playlistItems: number; connections: number; tasks: number; skipped: number }

// Restore a dump into `userId`'s account. Everything is rebuilt server-side with
// fresh ids (connections get new UUIDs, layouts/playlists new row ids), a strict
// column whitelist, and NO secrets (connections land needs_auth). Connection ids
// are remapped and the new id is rewritten into each board's source bindings, so
// pointing a block back at live data only needs a reconnect. Layout ids are
// remapped and threaded through playlist_items. Devices are NOT imported
// (physical screens must be re-claimed).
//   mode "append"  → add to what's there (default)
//   mode "replace" → first wipe the user's own layouts/playlists/connections/tasks
export function importUser(userId: string, dump: unknown, opts: { mode: "append" | "replace" }): ImportResult {
  const d = dump as Record<string, unknown> | null;
  if (!d || d.format !== "glanceos-backup") throw new Error("not a GlanceOS backup file");
  const arr = (k: string): Record<string, unknown>[] => (Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : []);
  const res: ImportResult = { layouts: 0, playlists: 0, playlistItems: 0, connections: 0, tasks: 0, skipped: 0 };

  const tx = db.transaction(() => {
    if (opts.mode === "replace") {
      db.prepare("DELETE FROM tasks WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM playlists WHERE user_id = ?").run(userId); // playlist_items cascade
      db.prepare("DELETE FROM connections WHERE user_id = ?").run(userId); // connection_secrets cascade
      db.prepare("DELETE FROM layouts WHERE user_id = ? AND is_template = 0").run(userId);
    }

    // Connections first (no secrets → needs_auth), remapping ids so board source
    // bindings can be rewritten to the new ids below.
    const connMap = new Map<string, string>();
    for (const c of arr("connections")) {
      if (typeof c.id !== "string" || typeof c.provider !== "string") { res.skipped++; continue; }
      const newId = randomUUID();
      const now = Date.now();
      db.prepare(
        "INSERT INTO connections (id, user_id, provider, label, auth_kind, config, status, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'needs_auth', '', ?, ?)",
      ).run(newId, userId, c.provider, typeof c.label === "string" ? c.label : c.provider, typeof c.auth_kind === "string" ? c.auth_kind : "token", typeof c.config === "string" ? c.config : "{}", now, now);
      connMap.set(c.id, newId);
      res.connections++; // never imports a secret
    }

    const layoutMap = new Map<number, number>();
    for (const l of arr("layouts")) {
      let doc;
      try { doc = Layout.parse(JSON.parse(String(l.document))); } catch { res.skipped++; continue; } // malformed → skip
      for (const row of doc.rows) for (const b of row.blocks) { // rewrite source bindings to the new connection ids
        const src = (b as { source?: { connectionId?: string } }).source;
        if (src?.connectionId && connMap.has(src.connectionId)) src.connectionId = connMap.get(src.connectionId);
      }
      const name = typeof l.name === "string" && l.name.trim() ? l.name : doc.name;
      const rec = createLayout(name, { ...doc, name }, { userId });
      if (typeof l.id === "number") layoutMap.set(l.id, rec.id);
      res.layouts++;
    }

    const playlistMap = new Map<number, number>();
    for (const p of arr("playlists")) {
      const name = typeof p.name === "string" && p.name.trim() ? p.name : "Playlist";
      const interval = Number(p.interval_seconds) > 0 ? Number(p.interval_seconds) : 30;
      const r = db.prepare("INSERT INTO playlists (user_id, name, interval_seconds, created_at) VALUES (?, ?, ?, ?)").run(userId, name, interval, Date.now());
      if (typeof p.id === "number") playlistMap.set(p.id, Number(r.lastInsertRowid));
      res.playlists++;
    }

    for (const it of arr("playlistItems")) {
      const pl = playlistMap.get(Number(it.playlist_id));
      const ly = layoutMap.get(Number(it.layout_id));
      const pos = Number(it.position);
      if (pl == null || ly == null || !Number.isInteger(pos)) { res.skipped++; continue; } // dangling ref → skip
      db.prepare("INSERT OR IGNORE INTO playlist_items (playlist_id, position, layout_id) VALUES (?, ?, ?)").run(pl, pos, ly);
      res.playlistItems++;
    }

    for (const t of arr("tasks")) {
      if (typeof t.list_id !== "string" || typeof t.text !== "string") { res.skipped++; continue; }
      db.prepare("INSERT INTO tasks (list_id, text, done, created_at, user_id) VALUES (?, ?, ?, ?, ?)").run(t.list_id, t.text, t.done ? 1 : 0, Number(t.created_at) || Date.now(), userId);
      res.tasks++;
    }
  });
  tx();
  return res;
}
