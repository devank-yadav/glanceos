-- #155 — personal presets: the user's default theme for every NEW board (mode / fontScale / look),
-- stored as a small JSON blob. NULL = the stock defaults. Additive.
ALTER TABLE users ADD COLUMN board_defaults TEXT;
