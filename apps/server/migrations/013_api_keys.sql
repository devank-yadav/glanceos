-- v3.0: scoped API keys for programmatic access. A key is a high-entropy random
-- token (gos_…); only its sha256 is stored. Keys carry a JSON array of scopes and
-- authenticate via `Authorization: Bearer …` — a non-ambient header, so they are
-- CSRF-immune and the guard skips CSRF for them. Key management itself stays
-- session-only (you can't manage keys with a key).

CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  token_hash  TEXT NOT NULL,            -- sha256(token), hex
  prefix      TEXT NOT NULL,            -- e.g. "gos_ab12cd" for the UI list
  scopes      TEXT NOT NULL,            -- JSON array of scope strings
  created_at  INTEGER NOT NULL,
  last_used   INTEGER
);

CREATE UNIQUE INDEX api_keys_hash ON api_keys(token_hash);
CREATE INDEX api_keys_by_user ON api_keys(user_id);
