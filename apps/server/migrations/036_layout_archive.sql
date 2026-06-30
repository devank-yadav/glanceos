-- #107 — Board archive (soft delete). Archived boards are hidden from the main list and pickers
-- but kept (and restorable), unlike a hard delete. NULL = active; a timestamp = archived-at.
-- Additive; existing boards are all active (NULL).
ALTER TABLE layouts ADD COLUMN archived_at INTEGER;
