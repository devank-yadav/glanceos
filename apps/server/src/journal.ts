// #153 — reflection journal: a calm end-of-day prompt and a place to answer it. One entry per user
// per day. A leaf module (db only) so both the API and the widget resolver can use it without a
// cycle. Prompts are a fixed, rotating set (no model) chosen deterministically from the date.
import { db } from "./db";

const MAX_TEXT = 4000;

// A small, gentle rotation. Deterministic per day so the wall shows one steady prompt.
const PROMPTS = [
  "What went well today?",
  "What are you grateful for right now?",
  "What's one thing you learned today?",
  "What drained you, and what restored you?",
  "What would make tomorrow feel lighter?",
  "Who or what are you thankful for today?",
  "What did you give your attention to today?",
  "What's one small win worth remembering?",
];

/** A steady prompt for a given YYYY-MM-DD (deterministic — same day → same prompt). */
export function promptForDay(day: string): string {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return PROMPTS[h % PROMPTS.length]!;
}

export interface JournalEntry { day: string; text: string; updatedAt: number }

/** Save (or clear, with empty text) the entry for a day. */
export function setJournal(userId: string, day: string, text: string, now = Date.now()): void {
  const t = text.slice(0, MAX_TEXT);
  if (!t.trim()) { db.prepare("DELETE FROM journal_entries WHERE user_id = ? AND day = ?").run(userId, day); return; }
  db.prepare(
    "INSERT INTO journal_entries (user_id, day, text, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(user_id, day) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at",
  ).run(userId, day, t, now);
}

export function getJournal(userId: string, day: string): JournalEntry | null {
  const r = db.prepare("SELECT day, text, updated_at FROM journal_entries WHERE user_id = ? AND day = ?").get(userId, day) as { day: string; text: string; updated_at: number } | undefined;
  return r ? { day: r.day, text: r.text, updatedAt: r.updated_at } : null;
}

/** Recent entries, newest day first. */
export function recentJournal(userId: string, limit = 30): JournalEntry[] {
  return (db.prepare("SELECT day, text, updated_at FROM journal_entries WHERE user_id = ? ORDER BY day DESC LIMIT ?").all(userId, Math.min(Math.max(1, limit), 366)) as { day: string; text: string; updated_at: number }[])
    .map((r) => ({ day: r.day, text: r.text, updatedAt: r.updated_at }));
}
