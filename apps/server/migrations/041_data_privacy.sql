-- #156 — private data vault: a per-key privacy flag. A private key's value renders only for the
-- owner's own screens — never on a public share link or its OG preview image. Additive; 0 = shown.
ALTER TABLE custom_data ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
