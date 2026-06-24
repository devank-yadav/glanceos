-- Board version history. Each meaningful save archives the document it replaced,
-- so a user can browse and restore earlier states of a board. Additive: the table
-- starts empty (no backfill), and capture is throttled + pruned to the newest N
-- per board by the app, so existing behavior is unchanged until a board is edited.
CREATE TABLE layout_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  document TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_layout_versions_layout ON layout_versions(layout_id, created_at DESC);
