// #3 — Scenes: named snapshots of a user's custom-data values, applied in one tap to flip the
// whole wall's data state ("Focus", "Meeting", "Away"). A leaf module: it touches only the DB
// and the custom-data store (no engine/state import), so anything can use it without a cycle.
import { db } from "./db";
import { listCustomData, setCustomData } from "./customdata";

export interface SceneSummary { id: number; name: string; keyCount: number; createdAt: number }

function keyCountOf(payload: string): number {
  try { const o = JSON.parse(payload); return o && typeof o === "object" ? Object.keys(o).length : 0; } catch { return 0; }
}

/** A user's scenes, newest first. */
export function listScenes(userId: string): SceneSummary[] {
  const rows = db.prepare("SELECT id, name, payload, created_at FROM scenes WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId) as { id: number; name: string; payload: string; created_at: number }[];
  return rows.map((r) => ({ id: r.id, name: r.name, keyCount: keyCountOf(r.payload), createdAt: r.created_at }));
}

/** Snapshot the user's CURRENT custom-data values into a named scene. Returns null on a blank name. */
export function captureScene(userId: string, orgId: string | null, name: string, now = Date.now()): SceneSummary | null {
  const clean = name.trim().slice(0, 80);
  if (!clean) return null;
  const snapshot: Record<string, unknown> = {};
  for (const e of listCustomData(userId)) snapshot[e.key] = e.value;
  const r = db.prepare("INSERT INTO scenes (user_id, org_id, name, payload, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(userId, orgId, clean, JSON.stringify(snapshot), now);
  return { id: Number(r.lastInsertRowid), name: clean, keyCount: Object.keys(snapshot).length, createdAt: now };
}

/** Apply a scene: write its captured values back to the user's custom-data (a merge — keys not
 *  in the scene are left alone). Returns the count of keys applied, or -1 if not the user's scene. */
export function applyScene(sceneId: number, userId: string): number {
  const row = db.prepare("SELECT payload FROM scenes WHERE id = ? AND user_id = ?").get(sceneId, userId) as { payload: string } | undefined;
  if (!row) return -1;
  let payload: Record<string, unknown> = {};
  try { const o = JSON.parse(row.payload); if (o && typeof o === "object") payload = o as Record<string, unknown>; } catch { /* corrupt payload → apply nothing */ }
  let n = 0;
  for (const [k, v] of Object.entries(payload)) { if (setCustomData(userId, k, v).ok) n++; }
  return n;
}

/** Rename a scene (in place). Returns false if it isn't the user's or the name is blank. */
export function renameScene(sceneId: number, userId: string, name: string): boolean {
  const clean = name.trim().slice(0, 80);
  if (!clean) return false;
  return db.prepare("UPDATE scenes SET name = ? WHERE id = ? AND user_id = ?").run(clean, sceneId, userId).changes > 0;
}

export function deleteScene(sceneId: number, userId: string): boolean {
  return db.prepare("DELETE FROM scenes WHERE id = ? AND user_id = ?").run(sceneId, userId).changes > 0;
}
