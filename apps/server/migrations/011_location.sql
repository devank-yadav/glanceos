-- v2.2: per-screen location (set by city search → coordinates) and a per-user
-- default timezone. All additive + nullable; existing screens keep their current
-- behaviour (block-level geo, server/device timezone) until a location is set.

-- A screen's location: weather / sunrise-sunset / forecast / astro blocks that
-- haven't been given their own coordinates inherit these.
ALTER TABLE devices ADD COLUMN location_name TEXT;
ALTER TABLE devices ADD COLUMN latitude REAL;
ALTER TABLE devices ADD COLUMN longitude REAL;

-- The account's fallback wall-clock timezone (IANA), used when a screen has no
-- timezone of its own. Null = server timezone (the prior default).
ALTER TABLE users ADD COLUMN default_timezone TEXT;
