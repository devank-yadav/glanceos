-- #3 — Scenes: a named snapshot of a user's custom-data values ("Focus", "Meeting", "Away").
-- Capturing stores the current {key:value} map; applying writes those values back in one tap,
-- so a person can flip their whole wall's data state at once. Per-user (custom-data is per-user);
-- org_id is kept for tenant scoping. Additive.
CREATE TABLE IF NOT EXISTS scenes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  org_id     TEXT,
  name       TEXT NOT NULL,
  payload    TEXT NOT NULL,        -- JSON object: { [dataKey]: value }
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenes_user ON scenes (user_id, created_at DESC);
