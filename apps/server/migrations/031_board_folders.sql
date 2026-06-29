-- #104 — Board folders. A nullable folder name per board lets users organize a growing
-- board list into collections (null = "Unfiled"). Additive; old boards stay unfiled.
ALTER TABLE layouts ADD COLUMN folder TEXT;
