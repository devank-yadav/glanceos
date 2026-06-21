-- v4.0 (Shortcuts-style automations): an automation may belong to a board so it
-- can read and write that board's named objects. A NULL layout_id keeps the rule
-- global (every existing row stays global, unchanged). ON DELETE SET NULL so
-- deleting a board demotes its automations to global rather than dropping them.

ALTER TABLE automations ADD COLUMN layout_id INTEGER REFERENCES layouts(id) ON DELETE SET NULL;
CREATE INDEX automations_by_layout ON automations(layout_id);
