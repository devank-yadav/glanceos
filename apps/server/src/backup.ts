import { randomUUID } from "node:crypto";
import { Layout } from "@glanceos/schema";
import { db } from "./db";
import { createLayout } from "./layouts";

// A plain-JSON export of a user's own data — boards, screens, connection config
// (NO secrets), and tasks. Secrets are never exported; connections must be
// reconnected after a restore.
// #173 — granular: callers pick sections ("just my boards", "just my data"). Absent /
// empty = everything. The dump records which sections it carries, and replace-mode
// import only wipes categories the file actually contains — a boards-only file can
// never take your tasks with it.
export const EXPORT_SECTIONS = ["boards", "screens", "connections", "tasks", "data", "automations", "scenes", "journal"] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];

export function dumpUser(userId: string, orgId: string, sections?: ExportSection[]): Record<string, unknown> {
  const want = new Set<ExportSection>(sections?.length ? sections : EXPORT_SECTIONS);
  const dump: Record<string, unknown> = { format: "glanceos-backup", version: 1, exportedAt: Date.now(), sections: [...want] };
  // Boards/screens are the active org's; the rest stays user-namespaced.
  if (want.has("boards")) dump.layouts = db.prepare("SELECT id, name, version, document, created_at FROM layouts WHERE org_id = ?").all(orgId);
  if (want.has("screens")) dump.devices = db.prepare("SELECT id, name, profile, refresh_seconds, timezone, location_name, latitude, longitude, render_opts, created_at FROM devices WHERE org_id = ?").all(orgId);
  if (want.has("connections")) dump.connections = db.prepare("SELECT id, provider, label, auth_kind, config, status FROM connections WHERE user_id = ?").all(userId);
  if (want.has("tasks")) dump.tasks = db.prepare("SELECT list_id, text, done, created_at FROM tasks WHERE user_id = ?").all(userId);
  // #173 — sections the old backup never carried. Export-only for now (import reads the
  // arrays it knows and ignores the rest); `data` includes the privacy flag so a future
  // import can restore #156 vault markings.
  if (want.has("data")) dump.data = db.prepare("SELECT key, value, private, updated_at FROM custom_data WHERE user_id = ?").all(userId);
  if (want.has("automations")) dump.automations = db.prepare("SELECT name, enabled, trigger, conditions, actions, cooldown_min, once_per_day, layout_id FROM automations WHERE user_id = ?").all(userId);
  if (want.has("scenes")) dump.scenes = db.prepare("SELECT name, payload, created_at FROM scenes WHERE user_id = ?").all(userId);
  if (want.has("journal")) dump.journal = db.prepare("SELECT day, text, updated_at FROM journal_entries WHERE user_id = ?").all(userId);
  return dump;
}

export interface ImportResult { layouts: number; connections: number; tasks: number; skipped: number }

// Restore a dump into `userId`'s account. Everything is rebuilt server-side with
// fresh ids (connections get new UUIDs, layouts new row ids), a strict column
// whitelist, and NO secrets (connections land needs_auth). Connection ids are
// remapped and the new id is rewritten into each board's source bindings, so
// pointing a block back at live data only needs a reconnect. Devices are NOT
// imported (physical screens must be re-claimed).
//   mode "append"  → add to what's there (default)
//   mode "replace" → first wipe the user's own layouts/connections/tasks
export function importUser(userId: string, orgId: string, dump: unknown, opts: { mode: "append" | "replace" }): ImportResult {
  const d = dump as Record<string, unknown> | null;
  if (!d || d.format !== "glanceos-backup") throw new Error("not a GlanceOS backup file");
  const arr = (k: string): Record<string, unknown>[] => (Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : []);
  const res: ImportResult = { layouts: 0, connections: 0, tasks: 0, skipped: 0 };

  const tx = db.transaction(() => {
    if (opts.mode === "replace") {
      // #173 — only wipe what the file will restore: a granular (boards-only) backup
      // replacing "everything" would otherwise silently destroy tasks + connections.
      if (Array.isArray(d.tasks)) db.prepare("DELETE FROM tasks WHERE user_id = ?").run(userId);
      if (Array.isArray(d.connections)) db.prepare("DELETE FROM connections WHERE user_id = ?").run(userId); // connection_secrets cascade
      if (Array.isArray(d.layouts)) db.prepare("DELETE FROM layouts WHERE org_id = ? AND is_template = 0").run(orgId);
    }

    // Connections first (no secrets → needs_auth), remapping ids so board source
    // bindings can be rewritten to the new ids below.
    const connMap = new Map<string, string>();
    for (const c of arr("connections")) {
      if (typeof c.id !== "string" || typeof c.provider !== "string") { res.skipped++; continue; }
      const newId = randomUUID();
      const now = Date.now();
      db.prepare(
        "INSERT INTO connections (id, user_id, org_id, provider, label, auth_kind, config, status, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'needs_auth', '', ?, ?)",
      ).run(newId, userId, orgId, c.provider, typeof c.label === "string" ? c.label : c.provider, typeof c.auth_kind === "string" ? c.auth_kind : "token", typeof c.config === "string" ? c.config : "{}", now, now);
      connMap.set(c.id, newId);
      res.connections++; // never imports a secret
    }

    for (const l of arr("layouts")) {
      let doc;
      try { doc = Layout.parse(JSON.parse(String(l.document))); } catch { res.skipped++; continue; } // malformed → skip
      for (const row of doc.rows) for (const b of row.blocks) { // rewrite source bindings to the new connection ids
        const src = (b as { source?: { connectionId?: string } }).source;
        if (src?.connectionId && connMap.has(src.connectionId)) src.connectionId = connMap.get(src.connectionId);
      }
      const name = typeof l.name === "string" && l.name.trim() ? l.name : doc.name;
      createLayout(name, { ...doc, name }, { userId, orgId });
      res.layouts++;
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
