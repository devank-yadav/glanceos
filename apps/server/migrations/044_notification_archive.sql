-- #43 — notification archive: "Clear all" tucks alerts away instead of destroying them.
-- NULL = active (in the bell); a timestamp = archived (browsable + searchable).
ALTER TABLE notifications ADD COLUMN archived_at INTEGER;
