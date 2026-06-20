-- Optional expiry + password on public share links (extends 006's share_token).
ALTER TABLE layouts ADD COLUMN share_expires_at INTEGER; -- ms epoch, null = never
ALTER TABLE layouts ADD COLUMN share_pw_hash TEXT;       -- scrypt hash, null = no password
