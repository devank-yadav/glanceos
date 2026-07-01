-- #153 — reflection journal: one dated entry per user per day (a calm end-of-day note answering a
-- gentle prompt). Additive; PK doubles as the (user_id, day) lookup index.
CREATE TABLE IF NOT EXISTS journal_entries (
  user_id    TEXT NOT NULL,
  day        TEXT NOT NULL,   -- YYYY-MM-DD in the user's local date
  text       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
