import { db } from "./db";

// Proof-of-play: a screen reports what it actually showed, when, and for how
// long. Writes are batched (one transaction per report) and pruned on a
// retention timer (index.ts) so the table can't grow without bound.

export interface PlayLogEntry { layoutId?: number | null; zoneId?: string | null; shownAt?: number; durationMs?: number | null }

const MAX_BATCH = 500;

/** Insert a screen's batch of play records; returns how many rows were written. */
export function recordPlayLog(deviceId: string, entries: PlayLogEntry[], now: number): number {
  const rows = entries.slice(0, MAX_BATCH);
  const ins = db.prepare("INSERT INTO proof_of_play (device_id, layout_id, zone_id, shown_at, duration_ms) VALUES (?, ?, ?, ?, ?)");
  const tx = db.transaction((batch: PlayLogEntry[]) => {
    for (const e of batch) {
      const shownAt = Number.isFinite(e.shownAt) && (e.shownAt as number) > 0 ? Math.floor(e.shownAt as number) : now;
      const dur = Number.isFinite(e.durationMs) ? Math.max(0, Math.floor(e.durationMs as number)) : null;
      ins.run(deviceId, e.layoutId ?? null, e.zoneId ?? null, shownAt, dur);
    }
  });
  tx(rows);
  return rows.length;
}

/** Drop records older than the cutoff; returns rows removed. */
export function pruneProofOfPlay(cutoffMs: number): number {
  return db.prepare("DELETE FROM proof_of_play WHERE shown_at < ?").run(cutoffMs).changes;
}

export interface PlayLogRow { deviceId: string; deviceName: string | null; layoutId: number | null; zoneId: string | null; shownAt: number; durationMs: number | null }

/** Raw play records for every screen in a group since a cutoff (newest first), for a report/CSV. */
export function playLogForGroup(groupId: number, sinceMs: number, limit = 50_000): PlayLogRow[] {
  return db.prepare(
    `SELECT p.device_id AS deviceId, d.name AS deviceName, p.layout_id AS layoutId,
            p.zone_id AS zoneId, p.shown_at AS shownAt, p.duration_ms AS durationMs
     FROM proof_of_play p JOIN devices d ON d.id = p.device_id
     WHERE d.group_id = ? AND p.shown_at >= ?
     ORDER BY p.shown_at DESC LIMIT ?`,
  ).all(groupId, sinceMs, limit) as PlayLogRow[];
}

/** RFC-4180-ish CSV; quotes any field that needs it. */
export function playLogCsv(rows: PlayLogRow[]): string {
  const esc = (v: string | number | null): string => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = "shown_at_iso,device_id,device_name,layout_id,zone_id,duration_ms";
  const lines = rows.map((r) => [new Date(r.shownAt).toISOString(), r.deviceId, r.deviceName, r.layoutId, r.zoneId, r.durationMs].map(esc).join(","));
  return [header, ...lines].join("\n");
}
