-- #84 — Reusable/master blocks. A master defines a card (block type + props + style) once;
-- blocks across boards reference it via `instanceOf` and expand to it at compose time. Org-scoped
-- so a team shares a component library. Additive.
CREATE TABLE IF NOT EXISTS master_blocks (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  org_id     TEXT,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,        -- a WidgetT['type']
  props      TEXT NOT NULL,        -- JSON
  style      TEXT,                 -- JSON (BlockStyle) or NULL
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_master_blocks_org ON master_blocks (org_id, created_at DESC);
