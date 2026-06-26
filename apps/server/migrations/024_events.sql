-- First-party product analytics. One row per tracked event (signup, screen_claimed,
-- activated, …) — the substrate for the activation funnel + retention queries. Additive:
-- the table starts empty (no backfill) and nothing reads it until Phase 2 wires track()
-- into the funnel, so existing behavior is unchanged. user_id/org_id are nullable so a
-- pre-auth event (e.g. a landing view) can be recorded with neither; org_id is added now
-- (it stays null until orgs exist in 025) so later phases need no events migration.
CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,
  org_id     TEXT,
  name       TEXT NOT NULL,
  props      TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_name_time ON events(name, created_at);
CREATE INDEX idx_events_user_time ON events(user_id, created_at);
