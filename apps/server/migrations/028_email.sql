-- Email: a soft "is this address verified" flag (NOT enforced at login — a missing mail
-- backend must never lock anyone out) and a generic single-use token table for email
-- verification + password reset. Existing accounts are grandfathered verified so the
-- upgrade changes nothing for them.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
UPDATE users SET email_verified = 1;

CREATE TABLE auth_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,            -- 'verify' | 'reset'
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);
