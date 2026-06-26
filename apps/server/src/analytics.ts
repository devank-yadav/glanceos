import { db } from "./db";

// First-party product analytics over the `events` table (migration 024). track() is a
// single best-effort INSERT that NEVER throws — instrumenting the funnel must never be
// able to break the request it's measuring. The query helpers back the admin-only
// metrics page (Phase 2): the activation funnel, active users, and cohort retention.

export interface TrackContext { userId?: string | null; orgId?: string | null; props?: Record<string, unknown> }

/** Record a product event. Fire-and-forget — swallows any error. */
export function track(name: string, ctx: TrackContext = {}): void {
  try {
    db.prepare("INSERT INTO events (user_id, org_id, name, props, created_at) VALUES (?, ?, ?, ?, ?)").run(
      ctx.userId ?? null,
      ctx.orgId ?? null,
      name,
      JSON.stringify(ctx.props ?? {}),
      Date.now(),
    );
  } catch (e) {
    console.error("[analytics] track failed:", (e as Error).message);
  }
}

const DAY = 86_400_000;

/** Count of DISTINCT users who fired each named event since `sinceMs` (epoch ms).
 *  Distinct-user counts are the honest funnel denominator — one user claiming three
 *  screens is one "screen_claimed" step, not three. Unknown names return 0 via the map. */
export function funnelCounts(names: string[], sinceMs = 0): Record<string, number> {
  const out: Record<string, number> = {};
  const stmt = db.prepare(
    "SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE name = ? AND user_id IS NOT NULL AND created_at >= ?",
  );
  for (const name of names) out[name] = (stmt.get(name, sinceMs) as { n: number }).n;
  return out;
}

/** Active distinct users over the last day and last 7 days (any event). */
export function dauWau(now = Date.now()): { dau: number; wau: number } {
  const since = (ms: number) =>
    (db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE user_id IS NOT NULL AND created_at >= ?").get(now - ms) as { n: number }).n;
  return { dau: since(DAY), wau: since(7 * DAY) };
}

/** D1 / D7 retention for the signup cohort of a given UTC day: of users whose first
 *  event landed in [dayStart, dayStart+1d), the fraction that fired any event 1 (and 7)
 *  days later. Returns the cohort size plus each day's returning count + rate. */
export function retentionD1D7(cohortDayStartMs: number): {
  cohort: number;
  d1: { returned: number; rate: number };
  d7: { returned: number; rate: number };
} {
  const dayEnd = cohortDayStartMs + DAY;
  // Cohort = users whose FIRST-ever event falls inside the cohort day.
  const cohort = db.prepare(
    `SELECT user_id, MIN(created_at) AS first FROM events
     WHERE user_id IS NOT NULL GROUP BY user_id
     HAVING first >= ? AND first < ?`,
  ).all(cohortDayStartMs, dayEnd) as Array<{ user_id: string; first: number }>;

  const returnedWithin = (offsetDays: number): number => {
    const winStart = cohortDayStartMs + offsetDays * DAY;
    const winEnd = winStart + DAY;
    const stmt = db.prepare(
      "SELECT 1 FROM events WHERE user_id = ? AND created_at >= ? AND created_at < ? LIMIT 1",
    );
    return cohort.filter((u) => stmt.get(u.user_id, winStart, winEnd)).length;
  };

  const rate = (n: number) => (cohort.length ? n / cohort.length : 0);
  const d1n = returnedWithin(1);
  const d7n = returnedWithin(7);
  return {
    cohort: cohort.length,
    d1: { returned: d1n, rate: rate(d1n) },
    d7: { returned: d7n, rate: rate(d7n) },
  };
}
