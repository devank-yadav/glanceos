-- Multi-tenant organizations: the team layer over the existing single-user model, and
-- the future billing entity. A board/screen/etc. becomes owned by an ORG (026 adds the
-- org_id columns); membership + roles live here. Mirrors the 003 multi-user back-fill:
-- every existing account is silently given a PERSONAL org it solely owns, so nothing
-- breaks for solo users — they just gain an (invisible) one-member org.

CREATE TABLE organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  personal    INTEGER NOT NULL DEFAULT 0,         -- 1 = auto-created solo org (hidden chrome, no friction)
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- billing-ready slots (UNUSED this release — billing is a deferred follow-on):
  plan        TEXT NOT NULL DEFAULT 'free',
  plan_ref    TEXT,                               -- future subscription / customer id
  created_at  INTEGER NOT NULL
);

CREATE TABLE org_members (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,                        -- 'owner' | 'admin' | 'editor' | 'viewer'
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX idx_org_members_user ON org_members(user_id);

CREATE TABLE org_invites (
  token       TEXT PRIMARY KEY,                    -- random, emailed (Phase 3)
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL COLLATE NOCASE,
  role        TEXT NOT NULL,
  invited_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at  INTEGER NOT NULL,
  accepted_at INTEGER
);
CREATE INDEX idx_org_invites_org ON org_invites(org_id);
CREATE INDEX idx_org_invites_email ON org_invites(email);

-- The active workspace rides on the session (no X-Org header to thread through every
-- fetch). Nullable ADD COLUMN → unlike 003, sessions are NOT dropped: nobody is logged
-- out by this upgrade. The resolver self-heals a null/stale value to the personal org.
ALTER TABLE sessions ADD COLUMN active_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

-- ---- back-fill: one personal org per existing user, that user as sole owner ----
INSERT INTO organizations (id, name, slug, personal, created_by, plan, created_at)
SELECT lower(hex(randomblob(16))),
       u.name || '''s workspace',
       'u-' || u.id,                               -- slug uniqueness piggybacks the unique user id
       1, u.id, 'free', u.created_at
FROM users u;

INSERT INTO org_members (org_id, user_id, role, created_at)
SELECT o.id, o.created_by, 'owner', o.created_at
FROM organizations o WHERE o.personal = 1 AND o.created_by IS NOT NULL;
