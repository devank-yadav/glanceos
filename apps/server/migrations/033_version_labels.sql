-- #95 — Named versions. A user can give a board version a label to mark a milestone
-- ("before redesign", "v1 launch"). Labeled versions are PROTECTED from the auto-prune
-- (see snapshotLayout) so a named restore point is permanent. Additive; old versions have NULL.
ALTER TABLE layout_versions ADD COLUMN label TEXT;
