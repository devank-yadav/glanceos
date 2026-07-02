-- #42 — the emailed daily brief: minute-of-local-day it goes out. NULL = off (the default).
ALTER TABLE users ADD COLUMN daily_brief_at INTEGER;
