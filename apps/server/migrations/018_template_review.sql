-- v4.5 template moderation. Publishing a board now submits it for review; an
-- admin approves it before it appears in the Templates gallery alongside the
-- built-in starters.
--
-- Admin: this is a self-hosted instance, so the owner = the first registered
-- account is the admin. (Fresh installs mark the first user admin at sign-up;
-- here we seed the oldest existing account.)
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
UPDATE users SET is_admin = 1 WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1);

-- Review status for published boards. Existing published boards are grandfathered
-- to 'approved' so nothing already public disappears; new publishes go 'pending'.
ALTER TABLE layouts ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending';
UPDATE layouts SET review_status = 'approved' WHERE published = 1;
