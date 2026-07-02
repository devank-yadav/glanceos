-- #7 — "at most once per day": a rule-level latch. Unlike a 1440-min cooldown (a rolling 24 h
-- window), this resets at local midnight — "greet me when I first arrive each day". Additive.
ALTER TABLE automations ADD COLUMN once_per_day INTEGER NOT NULL DEFAULT 0;
