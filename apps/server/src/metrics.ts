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

// ---- #74 live habit blocks ----

/** A timestamp's LOCAL date (YYYY-MM-DD) in a timezone (bad tz → UTC ISO fallback). */
export function dayIn(ts: number, tz: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts)); }
  catch { return new Date(ts).toISOString().slice(0, 10); }
}

const DAY_MS = 86_400_000;
const utcOf = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const keyOf = (utc: number): string => new Date(utc).toISOString().slice(0, 10);

/** Pure: shape a habit's done-days into what the wall blocks draw — the Monday-start week
 *  containing `today` ("x . x …", 7 tokens), the current month's grid (daysInMonth tokens), and
 *  the streak (consecutive days ending today, or yesterday if today isn't marked yet). */
export function habitShape(done: Set<string>, today: string): { week: string; month: string; streak: number } {
  const t = utcOf(today);
  const tok = (day: string) => (done.has(day) ? "x" : ".");
  // Week: Monday-start (matches the habitTracker's fixed M T W T F S S labels).
  const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
  const week = Array.from({ length: 7 }, (_, i) => tok(keyOf(monday + i * DAY_MS))).join(" ");
  // Month: day 1 .. last day of `today`'s month.
  const d = new Date(t);
  const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const month = Array.from({ length: dim }, (_, i) => tok(keyOf(first + i * DAY_MS))).join(" ");
  // Streak: consecutive days done, ending today (or yesterday, so it survives until midnight).
  let cur = done.has(today) ? t : t - DAY_MS;
  let streak = 0;
  while (done.has(keyOf(cur))) { streak++; cur -= DAY_MS; }
  return { week, month, streak };
}
