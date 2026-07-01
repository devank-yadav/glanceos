// #27 — metric history. Every numeric value a user stores via custom data is appended here over
// time, so a number the source keeps no history for (followers, weight, a habit counter) can be
// charted as a trend. Zero-config: any numeric custom-data key auto-accumulates a series. A leaf
// module (only `db`), so customdata.ts can log without a cycle.
import { db } from "./db";

const MINUTE_MS = 60_000;
const MAX_AGE_MS = 90 * 24 * 3_600_000; // keep ~90 days per key
const MAX_POINTS = 2000; // hard cap per key so a churny value can't grow the table without bound

/** Coerce a stored value to a chartable number (number or numeric string), else null. */
export function toMetricNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}

/** Append a sample, bucketed to the minute (one point per key per minute — a same-minute rewrite
 *  replaces it), then prune old/excess points. No-op for non-finite values. */
export function logMetric(userId: string, key: string, value: number, now = Date.now()): void {
  if (!Number.isFinite(value)) return;
  const at = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  db.prepare("INSERT OR REPLACE INTO metric_history (user_id, key, at, value) VALUES (?, ?, ?, ?)").run(userId, key, at, value);
  db.prepare("DELETE FROM metric_history WHERE user_id = ? AND key = ? AND at < ?").run(userId, key, now - MAX_AGE_MS);
  db.prepare(
    "DELETE FROM metric_history WHERE user_id = ? AND key = ? AND at NOT IN " +
      "(SELECT at FROM metric_history WHERE user_id = ? AND key = ? ORDER BY at DESC LIMIT ?)",
  ).run(userId, key, userId, key, MAX_POINTS);
}

/** Remove a key's whole history — called when the data key itself is deleted, so a removed metric
 *  leaves no trail behind (privacy) and orphaned series can't accumulate. */
export function clearMetric(userId: string, key: string): void {
  db.prepare("DELETE FROM metric_history WHERE user_id = ? AND key = ?").run(userId, key);
}

export interface MetricPoint { at: number; value: number }

/** A key's series (oldest → newest), optionally only points at/after `sinceMs`, capped. */
export function metricSeries(userId: string, key: string, sinceMs = 0, maxPoints = 500): MetricPoint[] {
  const lim = Math.min(Math.max(1, maxPoints), MAX_POINTS);
  return db.prepare("SELECT at, value FROM metric_history WHERE user_id = ? AND key = ? AND at >= ? ORDER BY at ASC LIMIT ?")
    .all(userId, key, sinceMs, lim) as MetricPoint[];
}
