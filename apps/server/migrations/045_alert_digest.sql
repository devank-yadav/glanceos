-- #47 — alert digest mode: hold non-critical wall alerts and deliver ONE periodic
-- summary every N minutes. NULL/0 = off (every alert interrupts as it happens).
ALTER TABLE users ADD COLUMN alert_digest_min INTEGER;
