-- v3.0: lightweight user-to-user sharing. An owner can share one board (layout)
-- or one screen (device) with another account on this install as viewer or
-- editor. Distinct from the public read-only share_token on layouts (which keeps
-- working for anonymous links). Single-owner scoping elsewhere is unchanged —
-- access is granted only through an explicit row here.

CREATE TABLE shares (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grantee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,            -- 'layout' | 'device'
  target_id   TEXT NOT NULL,            -- layout id (as text) or device id
  access      TEXT NOT NULL,            -- 'viewer' | 'editor'
  created_at  INTEGER NOT NULL
);

CREATE UNIQUE INDEX shares_unique ON shares(grantee_id, kind, target_id);
CREATE INDEX shares_by_grantee ON shares(grantee_id);
CREATE INDEX shares_by_owner ON shares(owner_id);
CREATE INDEX shares_by_target ON shares(kind, target_id);
