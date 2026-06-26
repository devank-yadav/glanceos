import { db } from "./db";
import { emailConfigured } from "./email";
import { sendDay3Email, sendDigestEmail } from "./emails";
import { isConnected } from "./hub";

// Lifecycle email sweep (run on a slow timer). Two nudges, both deduped via marker rows
// in the events table so each fires at most once per user per period — no extra table.
// Welcome is sent inline at registration; this handles the time-delayed ones.

const DAY = 86_400_000;

const alreadySent = (userId: string, marker: string): boolean =>
  !!db.prepare("SELECT 1 FROM events WHERE user_id = ? AND name = ? LIMIT 1").get(userId, marker);
const markSent = (userId: string, marker: string): void => {
  db.prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (?, ?, '{}', ?)").run(userId, marker, Date.now());
};

export async function runLifecycleSweep(now = Date.now()): Promise<void> {
  if (!emailConfigured()) return; // nothing to send without a mail backend

  // Day-3 nudge: signed up 3–5 days ago, never activated (no board on a screen). Once ever.
  const stalled = db.prepare("SELECT id, name, email FROM users WHERE created_at <= ? AND created_at > ? AND activated_at IS NULL")
    .all(now - 3 * DAY, now - 5 * DAY) as Array<{ id: string; name: string; email: string }>;
  for (const u of stalled) {
    if (alreadySent(u.id, "lifecycle_day3")) continue;
    markSent(u.id, "lifecycle_day3");
    await sendDay3Email(u.email, u.name);
  }

  // Weekly digest to each team owner, once per ISO week.
  const week = Math.floor(now / (7 * DAY));
  const owners = db.prepare(
    `SELECT u.id, u.name, u.email, o.id AS org_id FROM org_members m
     JOIN users u ON u.id = m.user_id JOIN organizations o ON o.id = m.org_id
     WHERE m.role = 'owner' AND o.personal = 0`,
  ).all() as Array<{ id: string; name: string; email: string; org_id: string }>;
  for (const o of owners) {
    const marker = `lifecycle_digest:${week}`;
    if (alreadySent(o.id, marker)) continue;
    markSent(o.id, marker);
    const boards = (db.prepare("SELECT COUNT(*) AS n FROM layouts WHERE org_id = ? AND is_template = 0").get(o.org_id) as { n: number }).n;
    const screens = db.prepare("SELECT id FROM devices WHERE org_id = ?").all(o.org_id) as Array<{ id: string }>;
    await sendDigestEmail(o.email, o.name, { boards, screens: screens.length, online: screens.filter((s) => isConnected(s.id)).length });
  }
}
