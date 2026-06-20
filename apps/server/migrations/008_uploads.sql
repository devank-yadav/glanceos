-- User-uploaded images (logos, photos) stored on disk under the data dir and
-- referenced by image blocks as /uploads/<id>.<ext>. The row tracks ownership +
-- metadata; the bytes live in ${GLANCEOS_DATA_DIR}/uploads/.
CREATE TABLE uploads (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL DEFAULT '',
  mime       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_uploads_user ON uploads(user_id);
