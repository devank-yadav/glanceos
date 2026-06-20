-- v3.0 (reactive): inbound webhook "inlets". An external service POSTs to
-- /api/hooks/:secret (no session, no CSRF — the secret in the URL is the
-- capability, like a share link). An optional sealed HMAC key lets the inlet
-- additionally require a signed body. A fired inlet routes its payload to a sink
-- (a task list / queue / custom-data key) and, later, drives automations.

CREATE TABLE inlets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  secret      TEXT NOT NULL,                 -- URL path token (random)
  hmac_key    BLOB,                          -- optional sealed signing key
  sink_kind   TEXT NOT NULL,                 -- 'task' | 'queue' | 'data' | 'none'
  sink_target TEXT NOT NULL DEFAULT '',      -- list id / queue id / data key
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  last_fired  INTEGER
);

CREATE UNIQUE INDEX inlets_secret ON inlets(secret);
CREATE INDEX inlets_by_user ON inlets(user_id);
