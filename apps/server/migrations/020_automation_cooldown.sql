-- v6.1: per-automation cooldown ("at most once per N minutes"). Additive + nullable
-- (0/NULL = off) — existing automations keep firing every matching tick as before.
ALTER TABLE automations ADD COLUMN cooldown_min INTEGER DEFAULT 0;
