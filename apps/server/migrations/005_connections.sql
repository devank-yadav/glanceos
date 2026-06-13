-- Per-user integrations ("connections"). Secrets are AES-256-GCM encrypted at
-- rest in a separate table and NEVER serialized to any /api response (mirrors the
-- device-secret precedent). config holds only non-secret fields (baseUrl, etc.).

CREATE TABLE connections (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,                 -- registry id: "todoist","github","ical","rest",...
  label       TEXT NOT NULL DEFAULT '',
  auth_kind   TEXT NOT NULL,                 -- none|url|token|apiKey|oauth2
  config      TEXT NOT NULL DEFAULT '{}',    -- non-secret JSON
  status      TEXT NOT NULL DEFAULT 'ok',    -- ok|needs_auth|error
  last_error  TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_connections_user ON connections(user_id);

-- Encrypted material, isolated so the listing query can't leak it.
-- kind: 'secret' (token / apiKey / secret URL) | 'oauth' ({access,refresh,expiresAt}).
CREATE TABLE connection_secrets (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  key_version   INTEGER NOT NULL DEFAULT 1,  -- for future key rotation
  cipher        BLOB NOT NULL,               -- iv(12) | tag(16) | ciphertext
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (connection_id, kind)
);

-- OAuth app credentials the SELF-HOSTER supplies (the agent can't register apps).
-- One row per (provider, user) so multi-user installs each bring their own app.
CREATE TABLE oauth_apps (
  provider          TEXT NOT NULL,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id         TEXT NOT NULL,
  client_secret_enc BLOB NOT NULL,
  key_version       INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  PRIMARY KEY (provider, user_id)
);
