-- v6.1.1: anchor the current battery level's first-seen time so the forecast window
-- doesn't stretch on flat polls (the v6.1.0 forecast used the ever-advancing last_seen).
-- Additive + nullable — existing rows read NULL → "collecting" until the next level step.
ALTER TABLE devices ADD COLUMN battery_at INTEGER;
