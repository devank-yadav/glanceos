import { db } from "./db";
import { tzMinuteOfDay } from "./astro";
import { composeDailyBrief, dayContext, type DailyBriefDataT } from "./daycontext";
import { emailConfigured } from "./email";
import { sendDailyBriefEmail, sendDay3Email, sendDigestEmail } from "./emails";
import { isConnected } from "./hub";
import { dayIn } from "./metrics";
import { listTasks } from "./tasks";

// Lifecycle email sweep (run on a slow timer). Two nudges, both deduped via marker rows
// in the events table so each fires at most once per user per period — no extra table.
// Welcome is sent inline at registration; this handles the time-delayed ones.

const DAY = 86_400_000;

const alreadySent = (userId: string, marker: string): boolean =>
  !!db.prepare("SELECT 1 FROM events WHERE user_id = ? AND name = ? LIMIT 1").get(userId, marker);
const markSent = (userId: string, marker: string): void => {
  db.prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (?, ?, '{}', ?)").run(userId, marker, Date.now());
};

// #42 — the emailed daily brief. Runs on a ~60s timer (the 6h lifecycle sweep is far too
// coarse for a "7:00 sharp" send). A subscriber gets the brief once per LOCAL day, inside
// a 2h grace window after their chosen minute — so a server restart at 07:05 still sends,
// but a server that was down all day doesn't say "Good morning" at 23:00. The window is
// clamped at midnight (a 23:30 brief gets a shorter window) so the day marker can't flip
// mid-window and double-send. Deduped like the other lifecycle mails: a marker event row.
const BRIEF_GRACE_MIN = 120;
interface BriefUser { id: string; name: string; email: string; at: number; tz: string }
const defaultBriefSend = (u: BriefUser, brief: DailyBriefDataT): Promise<void> => sendDailyBriefEmail(u.email, u.name, brief);

export async function runDailyBriefSweep(now = Date.now(), send: (u: BriefUser, brief: DailyBriefDataT) => Promise<void> = defaultBriefSend): Promise<void> {
  if (send === defaultBriefSend && !emailConfigured()) return; // nothing to send without a backend (tests inject)
  const subs = db.prepare(
    "SELECT id, name, email, daily_brief_at AS at, COALESCE(default_timezone, 'UTC') AS tz FROM users WHERE daily_brief_at IS NOT NULL",
  ).all() as BriefUser[];
  for (const u of subs) {
    const mod = tzMinuteOfDay(new Date(now), u.tz);
    if (mod < u.at || mod >= Math.min(u.at + BRIEF_GRACE_MIN, 1440)) continue;
    const marker = `brief:${dayIn(now, u.tz)}`;
    if (alreadySent(u.id, marker)) continue;
    markSent(u.id, marker);
    const dctx = await dayContext(u.id);
    const tasks = listTasks(u.id, "default").map((t) => ({ text: t.text, done: t.done }));
    await send(u, composeDailyBrief(dctx, tasks, { maxEvents: 5, maxTasks: 5, showWeather: true, showDate: true }, now));
  }
}

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
