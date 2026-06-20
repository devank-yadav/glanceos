-- v3.0 (reactive): a per-user key→JSON store. Boards read it via the "customData"
-- block; the public API (data:write) and Phase-2 webhooks/automations write it.
-- Per-user namespace, mirroring the queues table's (user_id, id) PK pattern.

CREATE TABLE custom_data (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,            -- JSON-encoded value
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX custom_data_by_user ON custom_data(user_id);
