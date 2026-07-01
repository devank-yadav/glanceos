-- #14 — per-rule snooze: mute a noisy automation until a timestamp (ms). NULL = not snoozed.
-- Additive; complements the automatic cooldown (cooldown_min) with a user-initiated pause.
ALTER TABLE automations ADD COLUMN snoozed_until INTEGER;
