import { randomUUID } from "node:crypto";
import { db } from "./db";

// #13 — alerts that want an acknowledgement. A rule can mark its alert "needs ack";
// the alert is recorded here, and if nobody acks it before escalate_at the tick
// re-raises it (louder, and via every channel the account can reach).
//
// Acknowledging is a PHONE/config/API action — the wall never takes input. A leaf
// module (only `db`), so the engine can use it without a cycle.

export interface AlertAck {
  id: string; title: string; body: string | null; severity: string;
  escalateAt: number | null; escalatedAt: number | null; ackedAt: number | null; createdAt: number;
}
interface Row {
  id: string; user_id: string; title: string; body: string | null; severity: string;
  escalate_at: number | null; escalated_at: number | null; acked_at: number | null; created_at: number;
}
const toAck = (r: Row): AlertAck => ({
  id: r.id, title: r.title, body: r.body, severity: r.severity,
  escalateAt: r.escalate_at, escalatedAt: r.escalated_at, ackedAt: r.acked_at, createdAt: r.created_at,
});

/** Record an alert awaiting acknowledgement. `escalateMinutes` 0/undefined = no escalation. */
export function createAlertAck(
  userId: string,
  a: { title: string; body?: string; severity: string; escalateMinutes?: number },
  now = Date.now(),
): AlertAck {
  const id = randomUUID();
  const escalateAt = a.escalateMinutes && a.escalateMinutes > 0 ? now + a.escalateMinutes * 60_000 : null;
  db.prepare(
    "INSERT INTO alert_acks (id, user_id, title, body, severity, escalate_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, userId, a.title.slice(0, 120), a.body?.slice(0, 280) ?? null, a.severity, escalateAt, now);
  return toAck(db.prepare("SELECT * FROM alert_acks WHERE id = ?").get(id) as Row);
}

/** Everything still waiting on this user (newest first) — what the bell offers to ack. */
export function openAlerts(userId: string): AlertAck[] {
  return (db.prepare("SELECT * FROM alert_acks WHERE user_id = ? AND acked_at IS NULL ORDER BY created_at DESC LIMIT 50").all(userId) as Row[]).map(toAck);
}

/** Acknowledge (user-scoped). false = not found, not theirs, or already acked. */
export function ackAlert(id: string, userId: string, now = Date.now()): boolean {
  return db.prepare("UPDATE alert_acks SET acked_at = ? WHERE id = ? AND user_id = ? AND acked_at IS NULL").run(now, id, userId).changes > 0;
}

/** Alerts whose escalation is due: unacked, past escalate_at, not yet escalated.
 *  Claimed by stamping escalated_at, so a re-raise happens at most once per alert. */
export function claimDueEscalations(now = Date.now()): Array<{ userId: string; ack: AlertAck }> {
  const rows = db.prepare(
    "SELECT * FROM alert_acks WHERE acked_at IS NULL AND escalated_at IS NULL AND escalate_at IS NOT NULL AND escalate_at <= ?",
  ).all(now) as Row[];
  const claim = db.prepare("UPDATE alert_acks SET escalated_at = ? WHERE id = ? AND escalated_at IS NULL");
  const out: Array<{ userId: string; ack: AlertAck }> = [];
  for (const r of rows) {
    if (claim.run(now, r.id).changes > 0) out.push({ userId: r.user_id, ack: toAck(r) });
  }
  return out;
}

/** Retention: drop acknowledged//resolved rows older than the cutoff. */
export function pruneAlertAcks(cutoffMs: number): void {
  db.prepare("DELETE FROM alert_acks WHERE created_at < ? AND (acked_at IS NOT NULL OR escalated_at IS NOT NULL)").run(cutoffMs);
}
