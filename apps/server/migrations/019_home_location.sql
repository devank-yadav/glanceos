-- v6.0: an account "home" location (set by city search or a one-time browser
-- geolocation at login). All additive + nullable — existing accounts keep their
-- current behaviour (per-screen / per-block geo) until a home is set.
--
-- Precedence for a geo block's coordinates becomes:
--   block geo (explicit)  →  the screen's location  →  the account home  →  server default.
-- The account default_timezone (migration 011) already cascades the same way.
ALTER TABLE users ADD COLUMN home_location_name TEXT;
ALTER TABLE users ADD COLUMN home_latitude REAL;
ALTER TABLE users ADD COLUMN home_longitude REAL;
